import 'server-only'
import { pode, type Papel } from '@/lib/permissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarPeloGmail, GmailError } from '@/lib/google/gmail'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { corpoComAssinatura, lerDestinatarios, montarMensagem } from './mensagem'

/**
 * Enviar por uma caixa de setor — a regra num lugar só (a tela do E-mail do
 * setor e a ordem de compra usam a mesma): remetente, nome e assinatura saem
 * da caixa no banco; só envia quem é do setor dono dela (ou quem tem
 * "correio.todas_as_caixas"); tudo fica em emails_enviados, inclusive a falha.
 */

export const TETO_DE_DESTINATARIOS = 50
type Contexto = { workspace: { id: string }; user: { id: string }; role: Papel }
export type Envio = { para: string; cc?: string; assunto: string; corpo: string; anexos?: { nome: string; tipo: string; conteudo: Uint8Array }[] }

/** As caixas por onde esta pessoa pode enviar (todas, para quem tem a permissão). */
export async function caixasQuePodeUsar(context: Contexto): Promise<{ id: string; email: string; setor_id: string }[]> {
  const admin = createAdminClient()
  const [{ data: caixas }, { data: meus }] = await Promise.all([
    admin.from('caixas_de_email').select('id,email,setor_id').eq('workspace_id', context.workspace.id).eq('ativa', true).eq('no_gmail', true).not('setor_id', 'is', null).order('email'),
    admin.from('setor_membros').select('setor_id').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id),
  ])
  const meusSetores = new Set((meus ?? []).map((m) => m.setor_id as string))
  const todas = pode(context.role, 'correio.todas_as_caixas')
  return ((caixas ?? []) as { id: string; email: string; setor_id: string }[]).filter((c) => todas || meusSetores.has(c.setor_id))
}

/** Envia e registra. Lança Error com a mensagem para a tela (a do Gmail, quando é dele). */
export async function enviarPelaCaixa(context: Contexto, caixaId: string, m: Envio): Promise<{ de: string; destinatarios: string[] }> {
  const admin = createAdminClient()
  let registro: Record<string, unknown> | null = null
  try {
    const { data: caixa } = await admin.from('caixas_de_email')
      .select('id, setor_id, email, nome_exibicao, nome_remetente, assinatura_html, responder_para, ativa, no_gmail')
      .eq('id', caixaId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!caixa || !caixa.ativa || !caixa.no_gmail || !caixa.setor_id) throw new Error('Esta caixa não está disponível para envio.')
    if (!pode(context.role, 'correio.todas_as_caixas')) {
      const { data: membro } = await admin.from('setor_membros').select('user_id').eq('setor_id', caixa.setor_id).eq('user_id', context.user.id).maybeSingle()
      if (!membro) throw new Error('Você não faz parte do setor desta caixa.')
    }
    const para = lerDestinatarios(m.para)
    const cc = lerDestinatarios(m.cc ?? '')
    const invalidos = [...para.invalidos, ...cc.invalidos]
    if (invalidos.length) throw new Error(`Endereço inválido: ${invalidos.slice(0, 3).join(', ')}`)
    if (!para.validos.length) throw new Error('Informe ao menos um destinatário.')
    if (para.validos.length + cc.validos.length > TETO_DE_DESTINATARIOS) {
      throw new Error(`No máximo ${TETO_DE_DESTINATARIOS} destinatários por mensagem. Para listas, use as campanhas da Imprensa.`)
    }
    const assunto = m.assunto.trim()
    const corpo = m.corpo.trim()
    if (!assunto || assunto.length > 200) throw new Error('Escreva um assunto (até 200 caracteres).')
    if (!corpo) throw new Error('Escreva a mensagem.')

    registro = {
      workspace_id: context.workspace.id, caixa_id: caixa.id, setor_id: caixa.setor_id, autor_id: context.user.id,
      de: caixa.email, para: para.validos, cc: cc.validos, assunto,
      corpo: m.anexos?.length ? `${corpo}\n\n[anexos: ${m.anexos.map((a) => a.nome).join(', ')}]` : corpo,
    }
    const conteudo = corpoComAssinatura(corpo, caixa.assinatura_html)
    const { raw } = montarMensagem({
      // O nome definido na Redação vale mais que o do Gmail (que por padrão é só o endereço).
      de: { nome: caixa.nome_remetente || caixa.nome_exibicao, email: caixa.email },
      para: para.validos, cc: cc.validos, responderPara: caixa.responder_para, assunto,
      texto: conteudo.texto, html: conteudo.html, anexos: m.anexos,
    })
    const enviado = await enviarPeloGmail(context.workspace.id, raw)
    await admin.from('emails_enviados').insert({ ...registro, estado: 'enviado', gmail_message_id: enviado.id, gmail_thread_id: enviado.threadId })
    return { de: caixa.email as string, destinatarios: [...para.validos, ...cc.validos] }
  } catch (causa) {
    const mensagem = causa instanceof GmailError ? causa.message : mensagemDoErro(causa, 'Não foi possível enviar.')
    if (registro) await admin.from('emails_enviados').insert({ ...registro, estado: 'falhou', erro: mensagem.slice(0, 500) })
    throw new Error(mensagem)
  }
}
