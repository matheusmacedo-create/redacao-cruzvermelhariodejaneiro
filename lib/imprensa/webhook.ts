import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * O webhook do Resend, sem rede nem banco: conferir a assinatura e traduzir o
 * evento para o que o Palácio grava. Conferido por scripts/conferir-webhook-do-resend.ts.
 *
 * O Resend assina pelo padrão Svix: três cabeçalhos (svix-id, svix-timestamp,
 * svix-signature) e HMAC-SHA256, em base64, sobre "<id>.<timestamp>.<corpo cru>".
 * O segredo vem como "whsec_<base64>": a chave do HMAC são os BYTES depois do
 * prefixo, não o texto. O cabeçalho da assinatura pode trazer várias, separadas
 * por espaço ("v1,<a> v1,<b>"), quando o segredo está em troca: basta uma bater.
 */

/** Tolerância do relógio contra reenvio de uma entrega antiga (replay). */
export const JANELA_EM_SEGUNDOS = 300

export type CabecalhosDoWebhook = { id: string; timestamp: string; assinatura: string }

export function assinaturaConfere(segredo: string, c: CabecalhosDoWebhook, corpo: string, agoraMs = Date.now()): boolean {
  if (!segredo || !c.id || !c.timestamp || !c.assinatura) return false
  const ts = Number(c.timestamp)
  if (!Number.isFinite(ts) || Math.abs(agoraMs / 1000 - ts) > JANELA_EM_SEGUNDOS) return false

  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64')
  if (!chave.length) return false
  const esperada = createHmac('sha256', chave).update(`${c.id}.${c.timestamp}.${corpo}`).digest()

  return c.assinatura.split(/\s+/).some((parte) => {
    const [versao, valor] = parte.split(',')
    if (versao !== 'v1' || !valor) return false
    const recebida = Buffer.from(valor, 'base64')
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
  })
}

export type EventoDeEmail = {
  /** Os tipos de registrar_evento_de_email (migração 20261109120000). */
  tipo: 'entregue' | 'devolucao' | 'denuncia' | 'suprimido' | 'falha' | 'liberado'
  resendId: string
  email: string
  detalhe: string
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * O que fazer com um evento — null quando não é para gravar nada.
 *
 * Eventos de mensagem (data.email_id, data.to):
 *  - email.delivered   → entregue.
 *  - email.bounced     → devolucao, só a DEFINITIVA (bounce.type "Permanent").
 *    Caixa cheia ou servidor fora do ar é temporário: aquela mensagem pode
 *    não ter chegado, mas o endereço existe, e marcar como inválido um
 *    jornalista com a caixa lotada na sexta-feira seria perder o contato à
 *    toa. Sem tipo informado, vale o mesmo cuidado.
 *  - email.complained  → denuncia. O Gmail não manda este evento.
 *  - email.suppressed  → suprimido: o Resend não enviou porque o endereço já
 *    estava na lista de supressão da conta.
 *  - email.failed      → falha: aceitou o pedido e não conseguiu enviar (cota
 *    do plano, por exemplo). Não diz nada sobre o endereço.
 *
 * Eventos da lista de supressão (data.email, data.origin, data.source_id):
 *  - suppression.added   → conforme a origem: bounce = devolucao, complaint =
 *    denuncia, manual = suprimido. Repete o que email.bounced e
 *    email.complained já contaram (o banco não conta duas vezes) e cobre o
 *    endereço posto à mão no painel do Resend.
 *  - suppression.removed → liberado: o endereço volta a poder receber.
 *
 * O resto (aberto, clicado, atraso, agendado, enviado) não interessa: abertura
 * e clique o Palácio mede sozinho, pelo pixel e pelo link rastreado.
 */
export function interpretarEvento(bruto: unknown): EventoDeEmail | null {
  if (!bruto || typeof bruto !== 'object') return null
  const evento = bruto as { type?: unknown; data?: unknown }
  const dados = (evento.data && typeof evento.data === 'object' ? evento.data : {}) as {
    email_id?: unknown
    to?: unknown
    email?: unknown
    origin?: unknown
    source_id?: unknown
    bounce?: { type?: unknown; subType?: unknown; message?: unknown }
    suppressed?: { message?: unknown }
    failed?: { reason?: unknown }
  }
  const curto = (...partes: unknown[]) => partes.map(texto).filter(Boolean).join(': ').slice(0, 500)

  if (evento.type === 'suppression.added' || evento.type === 'suppression.removed') {
    const email = texto(dados.email).toLowerCase()
    if (!email) return null
    if (evento.type === 'suppression.removed') return { tipo: 'liberado', resendId: '', email, detalhe: '' }
    const resendId = texto(dados.source_id)
    const origem = texto(dados.origin)
    if (origem === 'bounce') return { tipo: 'devolucao', resendId, email, detalhe: 'Entrou na lista de supressão do Resend por devolução.' }
    if (origem === 'complaint') return { tipo: 'denuncia', resendId, email, detalhe: 'Marcou a mensagem como spam.' }
    return { tipo: 'suprimido', resendId, email, detalhe: 'Posto à mão na lista de supressão do Resend.' }
  }

  const resendId = texto(dados.email_id)
  const para = Array.isArray(dados.to) ? dados.to[0] : dados.to
  const email = texto(para).toLowerCase()
  if (!resendId && !email) return null

  switch (evento.type) {
    case 'email.delivered':
      return { tipo: 'entregue', resendId, email, detalhe: '' }
    case 'email.complained':
      return { tipo: 'denuncia', resendId, email, detalhe: 'Marcou a mensagem como spam.' }
    case 'email.bounced':
      if (texto(dados.bounce?.type).toLowerCase() !== 'permanent') return null
      return { tipo: 'devolucao', resendId, email, detalhe: curto(dados.bounce?.subType, dados.bounce?.message) }
    case 'email.suppressed':
      return { tipo: 'suprimido', resendId, email, detalhe: curto(dados.suppressed?.message) || 'O endereço está na lista de supressão do Resend.' }
    case 'email.failed':
      return { tipo: 'falha', resendId, email, detalhe: curto(dados.failed?.reason) || 'O Resend não conseguiu enviar.' }
    default:
      return null
  }
}
