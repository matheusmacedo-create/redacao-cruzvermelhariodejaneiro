import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, emLotes, enviarEmailDeConta, enviarLote } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import type { EmailPronto } from '@/lib/contas/emails'
import { quando } from '@/lib/oportunidades/regras'
import { emailDeAvisoGeral, emailDeBoasVindas, emailDeCertificado, emailDeVagaLiberada } from './emails'

/**
 * Os e-mails do Voluntariado. Todos saem com o remetente do Voluntariado, no
 * mesmo domínio verificado do Resend, e todos são "melhor esforço": o que os
 * provocou (uma inscrição, uma aprovação) já está salvo, e uma falha de envio
 * não pode desfazer nem esconder isso — fica no log.
 */

export const REMETENTE_DO_VOLUNTARIADO = 'Cruz Vermelha RJ · Voluntariado <voluntariado@noticias.cruzvermelhariodejaneiro.org>'

const remetente = () => process.env.VOLUNTARIADO_REMETENTE?.trim() || REMETENTE_DO_VOLUNTARIADO

/** O link de saída dos avisos por e-mail: a página (rodapé) e o do provedor (List-Unsubscribe). */
export const urlDeSairDosAvisos = (participanteId: string, token: string) => `${urlBase()}/membro/sair-dos-avisos?p=${participanteId}&t=${token}`
export const urlDeSairDosAvisosEmUmClique = (participanteId: string, token: string) => `${urlBase()}/api/membro/sair-dos-avisos?p=${participanteId}&t=${token}`

export async function enviarAoVoluntario(para: string | null | undefined, e: EmailPronto): Promise<boolean> {
  if (!para || !emailConfigurado()) return false
  try {
    await enviarEmailDeConta({ para, assunto: e.assunto, html: e.html, texto: e.texto, de: remetente() })
    return true
  } catch (causa) {
    console.error('[voluntariado] e-mail não saiu:', causa instanceof Error ? causa.message : causa)
    return false
  }
}

/** Quem gerencia o Voluntariado: admins e quem tem acesso gerenciar/sensíveis. */
export async function gerentesDoVoluntariado(workspaceId: string) {
  const admin = createAdminClient()
  const [{ data: admins }, { data: acessos }] = await Promise.all([
    admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin'),
    admin.from('participantes_acesso').select('user_id').eq('workspace_id', workspaceId).in('nivel', ['gerenciar', 'sensiveis']),
  ])
  return [...new Set([...(admins ?? []), ...(acessos ?? [])].map((x) => x.user_id as string))]
}

/** Inscrição aprovada: boas-vindas com o caminho da Área do Voluntário. */
export async function boasVindas(participanteId: string) {
  const { data: p } = await createAdminClient().from('participantes').select('nome,nome_social,email').eq('id', participanteId).maybeSingle()
  if (!p?.email) return false
  return enviarAoVoluntario(p.email, emailDeBoasVindas({ nome: p.nome_social || p.nome, url: `${urlBase()}/membro/entrar?email=${encodeURIComponent(p.email)}` }))
}

/** Quem está na espera agora (para comparar depois de uma mudança). */
export async function naEspera(oportunidadeId: string): Promise<string[]> {
  const { data } = await createAdminClient().from('oportunidade_inscricoes').select('participante_id').eq('oportunidade_id', oportunidadeId).eq('situacao', 'espera')
  return (data ?? []).map((x) => x.participante_id as string)
}

/** Avisa quem saiu da lista de espera e ganhou a vaga. */
export async function avisarPromovidos(oportunidadeId: string, antes: string[]) {
  if (!antes.length) return 0
  const admin = createAdminClient()
  const [{ data: o }, { data: subiram }] = await Promise.all([
    admin.from('oportunidades').select('titulo,inicio,fim,local,cancelada_em').eq('id', oportunidadeId).single(),
    admin.from('oportunidade_inscricoes').select('participantes(nome,nome_social,email)').eq('oportunidade_id', oportunidadeId).eq('situacao', 'inscrito').in('participante_id', antes),
  ])
  if (!o || o.cancelada_em) return 0
  let n = 0
  for (const i of subiram ?? []) {
    const p = (Array.isArray(i.participantes) ? i.participantes[0] : i.participantes) as { nome: string; nome_social: string | null; email: string | null } | null
    if (await enviarAoVoluntario(p?.email, emailDeVagaLiberada({ nome: p?.nome_social || p?.nome || '', titulo: o.titulo, quando: quando(o.inicio, o.fim), local: o.local, url: `${urlBase()}/membro/oportunidades` }))) n++
  }
  return n
}

/** Certificado recém-emitido (há menos de 2 minutos): parabéns por e-mail. */
export async function avisarCertificado(participanteId: string, codigo: string) {
  const admin = createAdminClient()
  const { data: c } = await admin.from('certificados').select('curso_titulo,emitido_em,participantes(nome,nome_social,email)').eq('codigo', codigo).eq('participante_id', participanteId).maybeSingle()
  if (!c || Date.now() - Date.parse(c.emitido_em as string) > 120_000) return false
  const p = (Array.isArray(c.participantes) ? c.participantes[0] : c.participantes) as { nome: string; nome_social: string | null; email: string | null } | null
  return enviarAoVoluntario(p?.email, emailDeCertificado({
    nome: p?.nome_social || p?.nome || '', curso: c.curso_titulo as string, codigo,
    urlPdf: `${urlBase()}/membro/certificados/${codigo}/pdf`, urlVerificacao: `${urlBase()}/certificado/${codigo}`,
  }))
}

/**
 * Um aviso do mural, por e-mail, para todos os ativos que não saíram da
 * lista. É remessa, não mensagem de conta: sai em lotes, com List-Unsubscribe
 * (saída em um clique) — sem isso o Gmail e o Yahoo tratam o envio em volume
 * como spam. Devolve quantos saíram.
 */
export async function enviarAvisoPorEmail(workspaceId: string, aviso: { titulo: string; texto: string }): Promise<number> {
  if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado.')
  const { data, error } = await createAdminClient().rpc('membro_destinatarios_de_aviso', { p_workspace_id: workspaceId })
  if (error) throw new Error('Não foi possível ler a lista de voluntários.')
  const lista = (data ?? []) as { participante_id: string; nome: string; email: string; token: string }[]
  let enviados = 0
  for (const lote of emLotes(lista)) {
    const r = await enviarLote(lote.map((d) => {
      const e = emailDeAvisoGeral({ nome: d.nome, titulo: aviso.titulo, texto: aviso.texto, url: `${urlBase()}/membro/avisos`, urlSair: urlDeSairDosAvisos(d.participante_id, d.token) })
      return { para: d.email, assunto: e.assunto, html: e.html, texto: e.texto, de: remetente(), urlDeSaidaEmUmClique: urlDeSairDosAvisosEmUmClique(d.participante_id, d.token) }
    }))
    enviados += r.enviados
  }
  return enviados
}
