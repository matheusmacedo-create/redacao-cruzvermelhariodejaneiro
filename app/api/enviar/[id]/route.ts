import { createAdminClient } from '@/lib/supabase/admin'
import { infoDoObjeto, apagarObjeto } from '@/lib/armazenamento/r2'
import { dadosDaRequisicao } from '@/lib/acessos/agente'
import { HORAS_PARA_MANDAR_MAIS, ehChaveDeEnvio, lerArquivos, type Categoria } from '@/lib/envios/regras'
import { coletaDoEnvio } from '@/lib/imagem/servidor'
import { armazenamento, avisarAvaliadores, conferirLimites, hashDaOrigem, hashDoToken, prepararArquivos, resumoDosArquivos } from '@/lib/envios/servidor'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * O que acontece com um envio depois de criado, sempre com o token que só
 * quem enviou tem (docs/envio-de-acoes.md):
 *  - `recebido`: o navegador terminou de mandar um arquivo; conferimos no R2
 *    que ele chegou com o tamanho declarado;
 *  - `concluir`: acabou a rodada; o envio passa a aparecer para quem avalia;
 *  - `arquivos`: "mandar mais arquivos para este envio", por 24 horas;
 *  - `autorizacao`: o link (e o QR) para as pessoas das fotos assinarem o
 *    termo de uso de imagem — criado na primeira vez, o mesmo depois.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const responder = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status })
  const { id } = await params
  if (!UUID.test(id)) return responder(404, { erro: 'Envio não encontrado.' })
  let j: Record<string, unknown>
  try { j = await request.json() } catch { return responder(400, { erro: 'Pedido inválido.' }) }
  const token = typeof j?.token === 'string' ? j.token : ''
  if (!/^[0-9a-f]{48}$/.test(token)) return responder(403, { erro: 'Este envio não é seu.' })

  const admin = createAdminClient()
  const { data: envio } = await admin.from('envios')
    .select('id, workspace_id, protocolo, estado, criado_em, token_hash, nome, setor, titulo, relato')
    .eq('id', id).maybeSingle()
  if (!envio || envio.token_hash !== hashDoToken(token)) return responder(403, { erro: 'Este envio não é seu.' })

  try {
    if (j.acao === 'recebido') {
      const arquivoId = String(j.arquivoId ?? '')
      if (!UUID.test(arquivoId)) return responder(400, { erro: 'Arquivo inválido.' })
      const { data: arquivo } = await admin.from('envio_arquivos').select('id, chave, tamanho, estado').eq('id', arquivoId).eq('envio_id', id).maybeSingle()
      if (!arquivo) return responder(404, { erro: 'Arquivo não encontrado.' })
      if (arquivo.estado === 'recebido') return responder(200, { ok: true })
      const r2 = armazenamento()
      if (!r2 || !ehChaveDeEnvio(arquivo.chave, id)) return responder(500, { erro: 'Armazenamento indisponível.' })
      const info = await infoDoObjeto(r2.config, r2.bucket, arquivo.chave)
      if (!info) return responder(409, { erro: 'O arquivo não chegou. Tente mandar de novo.' })
      // O link assinado não amarra o tamanho: quem mandar outra coisa no lugar perde o arquivo.
      if (info.tamanho !== Number(arquivo.tamanho)) {
        await apagarObjeto(r2.config, r2.bucket, arquivo.chave).catch(() => undefined)
        return responder(409, { erro: 'O arquivo chegou diferente do que foi anunciado. Tente de novo.' })
      }
      await admin.from('envio_arquivos').update({ estado: 'recebido', recebido_em: new Date().toISOString() }).eq('id', arquivoId)
      return responder(200, { ok: true })
    }

    if (j.acao === 'arquivos') {
      if (Date.now() - new Date(envio.criado_em).getTime() > HORAS_PARA_MANDAR_MAIS * 60 * 60_000) {
        return responder(410, { erro: 'Este envio já fechou para novos arquivos. Faça um envio novo.' })
      }
      const { count } = await admin.from('envio_arquivos').select('id', { count: 'exact', head: true }).eq('envio_id', id)
      const { arquivos, erro } = lerArquivos(j.arquivos, count ?? 0)
      if (erro) return responder(422, { erro })
      if (!arquivos.length) return responder(422, { erro: 'Escolha ao menos um arquivo.' })
      const origem = hashDaOrigem(dadosDaRequisicao((nome) => request.headers.get(nome)).ip)
      const limite = await conferirLimites(admin, origem, arquivos.reduce((s, a) => s + a.tamanho, 0), false)
      if (limite) return responder(429, { erro: limite })
      const uploads = await prepararArquivos(admin, envio, arquivos)
      return responder(200, { uploads })
    }

    if (j.acao === 'autorizacao') {
      const r = await coletaDoEnvio(envio)
      if (!r.token) return responder(422, { erro: r.erro })
      return responder(200, { caminho: `/autorizacao/${r.token}` })
    }

    if (j.acao === 'concluir') {
      const { data: arquivos } = await admin.from('envio_arquivos').select('categoria, estado, recebido_em').eq('envio_id', id)
      const lista = (arquivos ?? []) as { categoria: Categoria; estado: string; recebido_em: string | null }[]
      const recebidos = lista.filter((a) => a.estado === 'recebido')
      const primeiraVez = envio.estado === 'recebendo'
      if (primeiraVez) {
        await admin.from('envios').update({ estado: 'novo', concluido_em: new Date().toISOString() }).eq('id', id).eq('estado', 'recebendo')
        await avisarAvaliadores(admin, envio.workspace_id, {
          envioId: id,
          titulo: `Nova ação enviada: ${envio.titulo}`.slice(0, 200),
          mensagem: `${envio.nome}${envio.setor ? ` (${envio.setor})` : ''} mandou ${resumoDosArquivos(recebidos)}.`,
          citacao: envio.relato ? envio.relato.slice(0, 400) : null,
        })
      } else {
        // "Mandar mais": avisa só o que chegou agora (nos últimos 30 minutos).
        const desde = Date.now() - 30 * 60_000
        const novos = recebidos.filter((a) => a.recebido_em && new Date(a.recebido_em).getTime() > desde)
        if (novos.length) {
          await avisarAvaliadores(admin, envio.workspace_id, {
            envioId: id,
            titulo: `Mais arquivos em: ${envio.titulo}`.slice(0, 200),
            mensagem: `${envio.nome} mandou mais ${resumoDosArquivos(novos)} para ${envio.protocolo}.`,
          })
        }
      }
      return responder(200, { ok: true, protocolo: envio.protocolo, recebidos: recebidos.length, faltando: lista.length - recebidos.length })
    }

    return responder(400, { erro: 'Pedido inválido.' })
  } catch (causa) {
    console.error('[envios]', j.acao, causa instanceof Error ? causa.message : causa)
    return responder(500, { erro: 'Não foi possível concluir agora. Tente de novo em instantes.' })
  }
}
