import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { apagarObjeto, enviarObjeto } from '@/lib/armazenamento/r2'
import { AUTORIZACOES, chaveDoArquivo, nomeCanonico, type Autorizacao } from '@/lib/envios/regras'
import { armazenamento, avisarAvaliadores, conferirLimites, hashDaOrigem, hashDoToken, novoToken, resumoDosArquivos } from '@/lib/envios/servidor'
import { coletaDoEnvio } from '@/lib/imagem/servidor'
import { baixarMidia, type ConfigDoWhatsapp } from './servidor'
import { TEXTO_SEM_ACAO_PELO_WHATSAPP, ehCancelamento, lerEscolha, textoDaEscolha, tituloDoRelato, type MensagemRecebida } from './regras'
import {
  ARQUIVOS_POR_ENVIO_PELO_WHATSAPP, ENVIO_ABERTO_MIN, ORDEM_DAS_AUTORIZACOES, TAMANHO_MAXIMO_PELO_WHATSAPP, TEXTO_COLETA_COMECOU, TEXTO_PEDE_TITULO,
  ehFimDaColeta, nomeDoArquivoRecebido, opcoesDeAutorizacao, tituloProvisorio,
} from './envio-regras'
import { podeAgirPeloWhatsapp, type Pendencia, type Pessoa, type Resposta } from './acoes'

/**
 * Fotos e vídeos mandados ao WhatsApp do Palácio viram um envio da equipe,
 * o mesmo da caixa /envios (docs/envio-de-acoes.md):
 *
 *  1. a primeira mídia abre um envio "recebendo" (invisível para quem avalia)
 *     e uma pendência "envio" — uma por pessoa (índice único), então fotos
 *     que chegam juntas, em entregas paralelas do webhook, caem no mesmo;
 *  2. cada mídia é baixada da Evolution e gravada no R2 com o nome canônico,
 *     já como "recebida"; a legenda entra no relato;
 *  3. "pronto" pede o título e depois a autorização de imagem; a resposta
 *     conclui o envio e avisa quem avalia, como o botão "concluir" do link.
 *
 * Quem some no meio não perde nada: depois de 30 minutos sem foto nova, a
 * rotina diária (ou a próxima foto da pessoa) conclui o envio com o título
 * provisório e "não sei" na autorização — a comunicação confere antes de
 * publicar.
 */

type Admin = ReturnType<typeof createAdminClient>
type DadosDoEnvio = { envioId: string; etapa: 'coletando' | 'titulo' | 'autorizacao'; titulo?: string }

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const expira = () => new Date(Date.now() + ENVIO_ABERTO_MIN * 60_000).toISOString()
const origem = (userId: string) => hashDaOrigem(`whatsapp:${userId}`)

export async function envioAberto(admin: Admin, userId: string): Promise<Pendencia | null> {
  const { data } = await admin.from('whatsapp_pendencias').select('id, tipo, dados').eq('user_id', userId).eq('tipo', 'envio').is('encerrada_em', null).maybeSingle()
  return data ? { id: data.id as number, tipo: 'envio', dados: (data.dados ?? {}) as Record<string, unknown> } : null
}

/**
 * Uma foto, vídeo, áudio ou documento que chegou. Devolve a resposta, ou null
 * para ficar quieto (da segunda foto em diante, para não responder cada uma).
 */
export async function receberMidia(admin: Admin, workspaceId: string, pessoa: Pessoa, m: MensagemRecebida, config: ConfigDoWhatsapp, base: string): Promise<Resposta | null> {
  const midia = m.midia
  if (!midia || !m.id) return null
  const pelaLink = `Mande pelo link de envio: ${base}/enviar`
  if (midia.tamanho && midia.tamanho > TAMANHO_MAXIMO_PELO_WHATSAPP) return { texto: `Este arquivo é grande demais para vir pelo WhatsApp (até 64 MB). ${pelaLink}` }
  const r2 = armazenamento()
  if (!r2) return { texto: `O armazenamento de envios está fora do ar agora. ${pelaLink}` }

  // Quem mandou foto ontem e sumiu: o envio antigo é concluído antes de abrir outro.
  await concluirEsquecidos(admin, { userId: pessoa.id })

  let aberto = await envioAberto(admin, pessoa.id)
  let comecou = false
  // Áudio e documento soltos não abrem envio: quase sempre é alguém falando com o bot, não mandando uma ação.
  if (!aberto && (midia.categoria === 'audio' || midia.categoria === 'documento')) {
    return { texto: 'Por aqui eu não ouço áudio nem abro documento solto. Para mandar uma ação, comece pelas fotos ou vídeos; para o resto, escreva *menu*.' }
  }
  if (!aberto) {
    // Como as outras ações: quem usa a verificação em duas etapas não manda em nome próprio por aqui.
    if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${pelaLink}` }
    const limite = await conferirLimites(admin, origem(pessoa.id), midia.tamanho ?? 0, true)
    if (limite) return { texto: limite }
    const { data: vinculo } = await admin.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle()
    const { data: envio, error } = await admin.from('envios').insert({
      workspace_id: workspaceId, nome: (pessoa.nome?.trim() || 'Equipe do Palácio').slice(0, 120), setor: (vinculo?.coordination as string | null) ?? null,
      whatsapp: m.numero, titulo: tituloProvisorio(pessoa.nome), data_da_acao: hoje(), autorizacao_imagem: 'nao_sei',
      token_hash: hashDoToken(novoToken()), ip_hash: origem(pessoa.id), user_agent: 'WhatsApp (bot do Palácio Virtual)',
    }).select('id').single()
    if (error || !envio) return { texto: `Não consegui abrir o envio agora. ${pelaLink}` }
    const { error: erroDaPendencia } = await admin.from('whatsapp_pendencias').insert({
      workspace_id: workspaceId, user_id: pessoa.id, tipo: 'envio', dados: { envioId: envio.id, etapa: 'coletando' } satisfies DadosDoEnvio, expira_em: expira(),
    })
    if (erroDaPendencia) {
      // Outra foto da mesma leva abriu primeiro: esta vai para o envio dela.
      await admin.from('envios').delete().eq('id', envio.id).eq('estado', 'recebendo')
      if (erroDaPendencia.code !== '23505') return { texto: `Não consegui abrir o envio agora. ${pelaLink}` }
    } else {
      comecou = true
    }
    aberto = await envioAberto(admin, pessoa.id)
    if (!aberto) return { texto: `Não consegui abrir o envio agora. ${pelaLink}` }
  }

  const dados = aberto.dados as unknown as DadosDoEnvio
  const { data: envio } = await admin.from('envios').select('id, workspace_id, titulo, nome, data_da_acao, relato, estado').eq('id', dados.envioId).maybeSingle()
  if (!envio || envio.estado !== 'recebendo') {
    await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('id', aberto.id)
    return { texto: 'Este envio já foi fechado. Mande a foto de novo para começar outro.' }
  }
  const { count } = await admin.from('envio_arquivos').select('id', { count: 'exact', head: true }).eq('envio_id', envio.id)
  if ((count ?? 0) >= ARQUIVOS_POR_ENVIO_PELO_WHATSAPP) return { texto: `Este envio já tem ${ARQUIVOS_POR_ENVIO_PELO_WHATSAPP} arquivos. Escreva *pronto* para fechar e mande o resto num envio novo.` }
  // O limite diário por origem vale arquivo a arquivo, como no link.
  if (!comecou) {
    const limite = await conferirLimites(admin, origem(pessoa.id), midia.tamanho ?? TAMANHO_MAXIMO_PELO_WHATSAPP, false)
    if (limite) return { texto: limite }
  }

  const baixado = await baixarMidia(config, m.id, TAMANHO_MAXIMO_PELO_WHATSAPP)
  if (!baixado.ok) return { texto: `Não consegui pegar este arquivo (${baixado.erro}). Mande de novo, ou ${pelaLink.charAt(0).toLowerCase()}${pelaLink.slice(1)}` }
  const mime = baixado.mime || midia.mime
  const nome = nomeDoArquivoRecebido({ nome: baixado.nome ?? midia.nome, mime, mensagemId: m.id, categoria: midia.categoria })
  const chave = chaveDoArquivo(envio.id, new Date().toISOString().slice(0, 7), randomUUID().slice(0, 8), nomeCanonico({
    titulo: envio.titulo as string, data: (envio.data_da_acao as string | null) ?? null, hoje: hoje(), autor: envio.nome as string, indice: (count ?? 0) + 1, nomeOriginal: nome,
  }))
  try {
    await enviarObjeto(r2.config, r2.bucket, chave, baixado.conteudo, { tipo: mime })
  } catch (causa) {
    console.error('[whatsapp] envio: arquivo não gravado:', causa instanceof Error ? causa.message : causa)
    return { texto: `Não consegui guardar este arquivo agora. Mande de novo daqui a pouco, ou ${pelaLink.charAt(0).toLowerCase()}${pelaLink.slice(1)}` }
  }
  const agora = new Date().toISOString()
  const { error: erroDoArquivo } = await admin.from('envio_arquivos').insert({
    envio_id: envio.id, workspace_id: envio.workspace_id, chave, nome, tipo_mime: mime, tamanho: baixado.conteudo.length,
    categoria: midia.categoria, gravado_na_hora: false, estado: 'recebido', recebido_em: agora,
  })
  if (erroDoArquivo) {
    await apagarObjeto(r2.config, r2.bucket, chave).catch(() => undefined)
    return { texto: 'Não consegui registrar este arquivo. Mande de novo.' }
  }
  // A legenda da foto conta a ação: vai para o relato, na ordem em que chegou.
  const legenda = m.texto.trim()
  if (legenda) await admin.from('envios').update({ relato: [envio.relato, legenda].filter(Boolean).join('\n\n').slice(0, 20000) }).eq('id', envio.id)
  await admin.from('whatsapp_pendencias').update({ expira_em: expira() }).eq('id', aberto.id)
  return comecou ? { texto: TEXTO_COLETA_COMECOU } : null
}

/** Os próximos passos: "pronto" → título → autorização → concluído. */
export async function seguirEnvio(admin: Admin, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const d = p.dados as unknown as DadosDoEnvio
  if (ehCancelamento(texto)) return cancelarEnvio(admin, p, d)

  if (d.etapa === 'coletando') {
    if (!ehFimDaColeta(texto)) return estrita ? { texto: 'Mande as fotos e vídeos; quando terminar, escreva *pronto*.' } : null
    const { count } = await admin.from('envio_arquivos').select('id', { count: 'exact', head: true }).eq('envio_id', d.envioId).eq('estado', 'recebido')
    if (!count) return { texto: 'Ainda não chegou nenhum arquivo deste envio. Mande as fotos ou vídeos primeiro.' }
    await atualizar(admin, p.id, { ...d, etapa: 'titulo' })
    return { texto: TEXTO_PEDE_TITULO }
  }

  if (d.etapa === 'titulo') {
    const bruto = texto.trim()
    const titulo = tituloDoRelato(bruto)
    if (titulo.length < 3) return { texto: 'Escreva um título com pelo menos 3 letras.' }
    // Escreveu mais que o título: o texto inteiro vai para o relato.
    if (bruto.length > titulo.length + 3) {
      const { data: envio } = await admin.from('envios').select('relato').eq('id', d.envioId).maybeSingle()
      await admin.from('envios').update({ relato: [envio?.relato, bruto].filter(Boolean).join('\n\n').slice(0, 20000) }).eq('id', d.envioId)
    }
    await atualizar(admin, p.id, { ...d, etapa: 'autorizacao', titulo })
    return { texto: textoDaEscolha({ pergunta: 'As pessoas que aparecem nas fotos e vídeos autorizaram o uso da imagem?', opcoes: opcoesDeAutorizacao(), rodape: 'Responda com o número, ou *cancelar*.' }) }
  }

  const n = lerEscolha(texto, ORDEM_DAS_AUTORIZACOES.length)
  if (!n) return estrita || d.etapa === 'autorizacao' ? { texto: `Responda com um número de 1 a ${ORDEM_DAS_AUTORIZACOES.length}, ou *cancelar*.` } : null
  return concluir(admin, p, d, ORDEM_DAS_AUTORIZACOES[n - 1], base)
}

async function atualizar(admin: Admin, id: number, dados: DadosDoEnvio) {
  await admin.from('whatsapp_pendencias').update({ dados, expira_em: expira() }).eq('id', id)
}

async function concluir(admin: Admin, p: Pendencia, d: DadosDoEnvio, autorizacao: Autorizacao | null, base: string, automatico = false): Promise<Resposta> {
  await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('id', p.id)
  const patch: Record<string, unknown> = { estado: 'novo', concluido_em: new Date().toISOString() }
  if (d.titulo) patch.titulo = d.titulo
  if (autorizacao) patch.autorizacao_imagem = autorizacao
  // Só quem vira o estado avisa (duas respostas ao mesmo tempo não avisam duas vezes).
  const { data: virou } = await admin.from('envios').update(patch).eq('id', d.envioId).eq('estado', 'recebendo')
    .select('id, workspace_id, protocolo, titulo, nome, setor, relato, autorizacao_imagem').maybeSingle()
  if (!virou) return { texto: 'Este envio já tinha sido fechado.' }
  const { data: arquivos } = await admin.from('envio_arquivos').select('categoria').eq('envio_id', virou.id).eq('estado', 'recebido')
  await avisarAvaliadores(admin, virou.workspace_id as string, {
    envioId: virou.id as string,
    titulo: `Nova ação enviada: ${virou.titulo}`.slice(0, 200),
    mensagem: `${virou.nome}${virou.setor ? ` (${virou.setor})` : ''} mandou ${resumoDosArquivos(arquivos ?? [])} pelo WhatsApp${automatico ? ' (fechado sozinho: não respondeu o título e a autorização)' : ''}.`,
    citacao: virou.relato ? String(virou.relato).slice(0, 400) : null,
  })
  const partes = [`Pronto: o envio *${virou.protocolo}* chegou para a comunicação avaliar. Obrigado!`]
  const aut = virou.autorizacao_imagem as Autorizacao
  if (!AUTORIZACOES[aut]?.podePublicar || aut === 'sim') {
    // O mesmo link do "Gerar o link para assinarem" da tela de envio.
    const coleta = await coletaDoEnvio({ id: virou.id as string, workspace_id: virou.workspace_id as string, titulo: virou.titulo as string, nome: virou.nome as string })
    if (coleta.token) partes.push(`Para as pessoas das fotos assinarem o termo de uso de imagem, mande a elas este link: ${base}/autorizacao/${coleta.token}`)
  }
  return { texto: partes.join('\n\n') }
}

async function cancelarEnvio(admin: Admin, p: Pendencia, d: DadosDoEnvio): Promise<Resposta> {
  await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('id', p.id)
  const { data: arquivos } = await admin.from('envio_arquivos').select('chave').eq('envio_id', d.envioId)
  const r2 = armazenamento()
  if (r2) await Promise.all((arquivos ?? []).map((a) => apagarObjeto(r2.config, r2.bucket, a.chave as string).catch(() => undefined)))
  await admin.from('envios').delete().eq('id', d.envioId).eq('estado', 'recebendo')
  return { texto: 'Pronto: o envio foi descartado, com as fotos e vídeos dele.' }
}

/**
 * Envios pelo WhatsApp que a pessoa não fechou em 30 minutos: com arquivo,
 * vão para a caixa como estão ("não sei" na autorização); sem arquivo, somem.
 * Roda na rotina diária e antes de abrir um envio novo para a mesma pessoa.
 */
export async function concluirEsquecidos(admin: Admin, filtro: { userId?: string } = {}): Promise<number> {
  try {
    let consulta = admin.from('whatsapp_pendencias').select('id, tipo, dados').eq('tipo', 'envio').is('encerrada_em', null).lt('expira_em', new Date().toISOString())
    if (filtro.userId) consulta = consulta.eq('user_id', filtro.userId)
    const { data } = await consulta.limit(100)
    let fechados = 0
    for (const linha of data ?? []) {
      const p: Pendencia = { id: linha.id as number, tipo: 'envio', dados: (linha.dados ?? {}) as Record<string, unknown> }
      const d = p.dados as unknown as DadosDoEnvio
      const { count } = await admin.from('envio_arquivos').select('id', { count: 'exact', head: true }).eq('envio_id', d.envioId).eq('estado', 'recebido')
      if (count) {
        await concluir(admin, p, d, null, '', true)
        fechados++
      } else {
        await cancelarEnvio(admin, p, d)
      }
    }
    return fechados
  } catch (causa) {
    console.error('[whatsapp] envios esquecidos:', causa instanceof Error ? causa.message : causa)
    return 0
  }
}
