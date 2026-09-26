import { createAdminClient } from '@/lib/supabase/admin'
import { dadosDaRequisicao } from '@/lib/acessos/agente'
import { lerArquivos, lerEnvio, TEMPO_MINIMO_MS } from '@/lib/envios/regras'
import { conferirLimites, espacoPrincipal, hashDaOrigem, hashDoToken, novoToken, prepararArquivos } from '@/lib/envios/servidor'
import { eventoPeloCodigo } from '@/lib/envios/eventos'

export const dynamic = 'force-dynamic'

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/**
 * Cria um envio de ação (docs/envio-de-acoes.md). Link aberto, então tudo é
 * conferido aqui: campo escondido e tempo mínimo contra robô, limite de
 * envios e de bytes por origem, formato de cada campo e de cada arquivo.
 *
 * Devolve o protocolo, um token (para mandar mais arquivos por 24 horas) e um
 * link de envio direto ao R2 para cada arquivo. O envio só aparece para quem
 * avalia depois do "concluir" (POST /api/enviar/[id]).
 */
export async function POST(request: Request) {
  const responder = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status })
  let j: Record<string, unknown>
  try { j = await request.json() } catch { return responder(400, { erro: 'Envio inválido.' }) }
  if (!j || typeof j !== 'object') return responder(400, { erro: 'Envio inválido.' })

  // Robô: preencheu o campo invisível ou mandou rápido demais. Responde como se
  // tivesse dado certo, sem links, para não ensinar o robô a contornar.
  const inicio = Number(j._inicio ?? 0)
  if (String(j.site ?? '') || !inicio || Date.now() - inicio < TEMPO_MINIMO_MS) {
    return responder(200, { id: null, protocolo: 'ENV-00000', token: null, uploads: [] })
  }

  const { dados, erros } = lerEnvio(j, hoje())
  if (!dados) return responder(422, { erro: erros.join(' ') })
  const { arquivos, erro } = lerArquivos(j.arquivos)
  if (erro) return responder(422, { erro })
  if (!arquivos.length && !dados.relato) return responder(422, { erro: 'Conte o que aconteceu (escrevendo ou gravando um áudio) ou mande ao menos um arquivo.' })

  try {
    const admin = createAdminClient()
    const workspaceId = await espacoPrincipal(admin)
    if (!workspaceId) return responder(503, { erro: 'Envios indisponíveis no momento.' })
    const requisicao = dadosDaRequisicao((nome) => request.headers.get(nome))
    const ipHash = hashDaOrigem(requisicao.ip)
    const limite = await conferirLimites(admin, ipHash, arquivos.reduce((s, a) => s + a.tamanho, 0), true)
    if (limite) return responder(429, { erro: limite })

    // Veio pelo link de um evento (/enviar/<codigo>): o envio já cai no álbum dele. Link encerrado
    // ou código estranho não derruba o envio: ele chega avulso, e quem avalia junta depois.
    const evento = typeof j.evento === 'string' ? await eventoPeloCodigo(j.evento, admin) : null
    const token = novoToken()
    const { data: envio, error } = await admin.from('envios').insert({
      workspace_id: workspaceId, ...dados, token_hash: hashDoToken(token), ip_hash: ipHash, user_agent: requisicao.userAgent,
      ...(evento && evento.workspace_id === workspaceId ? { evento_id: evento.id } : {}),
      // Só texto, sem arquivo: já nasce pronto para avaliar.
      ...(arquivos.length ? {} : { estado: 'novo', concluido_em: new Date().toISOString() }),
    }).select('id, workspace_id, protocolo, titulo, data_da_acao, nome').single()
    if (error || !envio) {
      console.error('[envios] envio não criado:', error?.message)
      return responder(500, { erro: 'Não foi possível registrar o envio agora. Tente de novo em instantes.' })
    }
    const uploads = await prepararArquivos(admin, envio, arquivos)
    return responder(200, { id: envio.id, protocolo: envio.protocolo, token, uploads, concluido: !arquivos.length })
  } catch (causa) {
    console.error('[envios] falha ao criar:', causa instanceof Error ? causa.message : causa)
    return responder(500, { erro: causa instanceof Error && causa.message.startsWith('O envio de arquivos') ? causa.message : 'Não foi possível registrar o envio agora. Tente de novo em instantes.' })
  }
}
