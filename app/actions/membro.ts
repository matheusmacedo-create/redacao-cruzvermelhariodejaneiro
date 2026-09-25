'use server'

import { createHash } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, enviarEmailDeConta } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { lerFormulario } from '@/lib/participantes/regras'
import { COOKIE_DA_PREVIA, exigirMembroQueEscreve, hashDoToken, novoToken, sessaoDoMembro } from '@/lib/membro/sessao'
import { COOKIE_DA_RENOVACAO, COOKIE_DO_MEMBRO, MINUTOS_DO_CODIGO, TAMANHO_DO_CODIGO, diaDaRenovacao, digitosDoCodigo, opcoesDoCookieDoMembro, pedeNovoCodigo } from '@/lib/membro/entrada'
import { voltarSeguro } from '@/lib/membro/regras'
import { emailDeInscricao, emailDoCodigo } from '@/lib/membro/emails'
import { notificar } from '@/lib/notificacoes/servidor'
import { REMETENTE_DO_VOLUNTARIADO, avisarCertificado, avisarPromovidos, enviarAoVoluntario, gerentesDoVoluntariado, naEspera } from '@/lib/membro/comunicacao'
import { lerMensagem } from '@/lib/canal/regras'
import { oportunidadeDoMembro } from '@/lib/membro/oportunidades'
import { quando as quandoDaOportunidade } from '@/lib/oportunidades/regras'

/**
 * A área do membro do lado do servidor. Tudo usa o cliente de serviço, mas
 * só depois de a sessão dizer quem é o voluntário — e só com o id dela.
 */

/**
 * `enviadoEm`: quando o código saiu (a tela troca de etapa só depois dessa
 * resposta). `novoCodigo`: o código morreu (vencido, usado ou tentativas
 * esgotadas) e o botão principal passa a ser "Enviar novo código".
 */
export type EstadoDeEntrada = { etapa: 'email' | 'codigo'; email?: string; erro?: string; aviso?: string; enviadoEm?: number; novoCodigo?: boolean }

/**
 * E-mail e aviso à equipe saem depois da resposta: quem se inscreve, conclui
 * uma aula ou manda mensagem não espera o Resend. O que provocou o envio já
 * está gravado; uma falha aqui fica só no log (é "melhor esforço", como em
 * lib/membro/comunicacao).
 */
function depoisDaResposta(rotulo: string, tarefa: () => Promise<unknown>) {
  after(async () => {
    try {
      await tarefa()
    } catch (causa) {
      console.error(`[membro] ${rotulo}:`, causa instanceof Error ? causa.message : causa)
    }
  })
}

async function hashDoIp() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'desconhecido'
  return createHash('sha256').update(`membro:${ip}`).digest('hex')
}

/** Passo 1: manda o código. A resposta é a mesma com ou sem cadastro. */
export async function pedirCodigo(_anterior: EstadoDeEntrada, formData: FormData): Promise<EstadoDeEntrada> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254)
  try {
    if (!emailConfigurado()) throw new Error('O envio de e-mails não está configurado. Avise a coordenação do Voluntariado.')
    const { data, error } = await createAdminClient().rpc('membro_pedir_codigo', { p_email: email, p_ip_hash: await hashDoIp() })
    if (error) {
      if (error.code === 'P0001' && error.message) throw new Error(error.message)
      throw new Error('Não foi possível enviar o código agora. Tente de novo em instantes.')
    }
    const linha = (Array.isArray(data) ? data[0] : data) as { nome: string; email: string; codigo: string } | undefined
    if (linha?.codigo) {
      const m = emailDoCodigo({ nome: linha.nome, codigo: linha.codigo, minutos: MINUTOS_DO_CODIGO, url: `${urlBase()}/membro` })
      await enviarEmailDeConta({ para: linha.email, assunto: m.assunto, html: m.html, texto: m.texto, de: process.env.VOLUNTARIADO_REMETENTE?.trim() || REMETENTE_DO_VOLUNTARIADO })
    }
    return { etapa: 'codigo', email, aviso: `Se ${email} for o e-mail de um voluntário ativo, o código chega em instantes. Confira também o spam.`, enviadoEm: Date.now() }
  } catch (causa) {
    return { etapa: 'email', email, erro: mensagemDoErro(causa, 'Não foi possível enviar o código.') }
  }
}

/**
 * Passo 2: troca o código por uma sessão e volta para onde a pessoa estava
 * (`voltar`, conferido de novo aqui: só caminhos da própria área).
 */
export async function entrar(_anterior: EstadoDeEntrada, formData: FormData): Promise<EstadoDeEntrada> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254)
  const codigo = digitosDoCodigo(String(formData.get('codigo') ?? ''))
  const destino = voltarSeguro(formData.get('voltar')) ?? '/membro'
  // Menos de 6 dígitos nem vai ao banco: lá contaria como tentativa errada.
  if (codigo.length !== TAMANHO_DO_CODIGO) return { etapa: 'codigo', email, erro: 'Digite os 6 dígitos do código.' }
  try {
    const token = novoToken()
    const agente = (await headers()).get('user-agent') ?? ''
    const { data, error } = await createAdminClient().rpc('membro_entrar', { p_email: email, p_codigo: codigo, p_token_hash: hashDoToken(token), p_user_agent: agente.slice(0, 300) })
    if (error) throw new Error('Não foi possível entrar agora. Tente de novo.')
    const r = (data ?? {}) as { erro?: string; participante_id?: string }
    if (r.erro || !r.participante_id) {
      const erro = r.erro ?? 'Código inválido.'
      return { etapa: 'codigo', email, erro, novoCodigo: pedeNovoCodigo(erro) }
    }
    const jar = await cookies()
    const opcoes = opcoesDoCookieDoMembro(process.env.NODE_ENV === 'production')
    jar.set(COOKIE_DO_MEMBRO, token, opcoes)
    // O cookie acabou de nascer: o proxy não precisa regravá-lo hoje.
    jar.set(COOKIE_DA_RENOVACAO, diaDaRenovacao(Date.now()), opcoes)
  } catch (causa) {
    return { etapa: 'codigo', email, erro: mensagemDoErro(causa, 'Não foi possível entrar.') }
  }
  redirect(destino)
}

export async function sair() {
  const m = await sessaoDoMembro()
  if (m?.previa) {
    ;(await cookies()).delete(COOKIE_DA_PREVIA)
    redirect(m.previa.voltar)
  }
  if (m) await createAdminClient().rpc('membro_sair', { p_token_hash: m.tokenHash })
  const jar = await cookies()
  jar.delete(COOKIE_DO_MEMBRO)
  jar.delete(COOKIE_DA_RENOVACAO)
  redirect('/membro/entrar')
}

export async function salvarPerfil(_anterior: { erro?: string; ok?: boolean }, formData: FormData): Promise<{ erro?: string; ok?: boolean }> {
  try {
    const m = await exigirMembroQueEscreve()
    const { dados, erros } = lerFormulario(formData, hojeEmSaoPaulo())
    if (erros.length) return { erro: erros.join(' ') }
    const { error } = await createAdminClient().rpc('membro_atualizar_perfil', { p_participante_id: m.participanteId, p: dados })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar.')
    revalidatePath('/membro', 'layout')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

/** Liga ou desliga os avisos da coordenação por e-mail (o mural continua). */
export async function preferirAvisos(receber: boolean): Promise<{ erro?: string }> {
  try {
    const m = await exigirMembroQueEscreve()
    const { data, error } = await createAdminClient().rpc('membro_preferir_avisos', { p_participante_id: m.participanteId, p_receber: receber })
    if (error || !data) throw new Error('Não foi possível salvar.')
    revalidatePath('/membro/perfil')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

// ---------------------------------------------------------------- cursos

export type ResultadoDaAula = { erro?: string; faltam?: number; prova?: boolean; certificado?: string | null }

/** Marca a aula como vista (só para o voluntário da sessão). */
export async function concluirAula(cursoId: string, aulaId: string): Promise<ResultadoDaAula> {
  try {
    const m = await exigirMembroQueEscreve()
    if (!/^[0-9a-f-]{36}$/.test(aulaId)) throw new Error('Aula inválida.')
    const { data, error } = await createAdminClient().rpc('membro_concluir_aula', { p_participante_id: m.participanteId, p_aula_id: aulaId })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível marcar a aula.')
    const r = data as ResultadoDaAula
    const certificado = r.certificado
    if (certificado) depoisDaResposta('e-mail do certificado', () => avisarCertificado(m.participanteId, certificado))
    revalidatePath(`/membro/cursos/${cursoId}`, 'layout')
    revalidatePath('/membro')
    return r
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível marcar a aula.') }
  }
}

export type ResultadoDaProva = { erro?: string; aprovado?: boolean; nota?: number; acertos?: number; total?: number; minima?: number; certificado?: string | null; ja_aprovado?: boolean }

export async function responderProva(cursoId: string, respostas: number[]): Promise<ResultadoDaProva> {
  try {
    const m = await exigirMembroQueEscreve()
    if (!/^[0-9a-f-]{36}$/.test(cursoId)) throw new Error('Curso inválido.')
    if (!Array.isArray(respostas) || respostas.length > 200 || respostas.some((r) => !Number.isInteger(r) || r < 0 || r > 5)) throw new Error('Responda todas as questões.')
    const { data, error } = await createAdminClient().rpc('membro_responder_prova', { p_participante_id: m.participanteId, p_curso_id: cursoId, p_respostas: respostas })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível corrigir a prova.')
    const r = data as ResultadoDaProva
    const certificado = r.certificado
    if (certificado && !r.ja_aprovado) depoisDaResposta('e-mail do certificado', () => avisarCertificado(m.participanteId, certificado))
    revalidatePath(`/membro/cursos/${cursoId}`, 'layout')
    revalidatePath('/membro')
    return r
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível corrigir a prova.') }
  }
}

// ---------------------------------------------------------------- oportunidades

export async function inscrever(oportunidadeId: string): Promise<{ erro?: string; situacao?: string }> {
  try {
    const m = await exigirMembroQueEscreve()
    if (!/^[0-9a-f-]{36}$/.test(oportunidadeId)) throw new Error('Oportunidade inválida.')
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('membro_inscrever', { p_participante_id: m.participanteId, p_oportunidade_id: oportunidadeId })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível fazer a inscrição.')
    const situacao = (data as { situacao: string }).situacao
    // Confirmação por e-mail: melhor esforço, não desfaz a inscrição se falhar.
    depoisDaResposta('e-mail da inscrição', async () => {
      const o = await oportunidadeDoMembro(m, oportunidadeId)
      if (o) await enviarAoVoluntario(m.email, emailDeInscricao({ nome: m.nome, titulo: o.titulo, quando: quandoDaOportunidade(o.inicio, o.fim), local: o.local, espera: situacao === 'espera', url: `${urlBase()}/membro/oportunidades` }))
    })
    revalidatePath('/membro', 'layout')
    return { situacao }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível fazer a inscrição.') }
  }
}

export async function cancelarInscricao(oportunidadeId: string): Promise<{ erro?: string }> {
  try {
    const m = await exigirMembroQueEscreve()
    if (!/^[0-9a-f-]{36}$/.test(oportunidadeId)) throw new Error('Oportunidade inválida.')
    // A lista de espera é lida ANTES de cancelar: é comparando com ela que se sabe quem subiu.
    const antes = await naEspera(oportunidadeId)
    const { error } = await createAdminClient().rpc('membro_cancelar_inscricao', { p_participante_id: m.participanteId, p_oportunidade_id: oportunidadeId })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível cancelar.')
    depoisDaResposta('aviso de vaga liberada', () => avisarPromovidos(oportunidadeId, antes))
    revalidatePath('/membro', 'layout')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível cancelar.') }
  }
}

// ---------------------------------------------------------------- canal direto

async function avisarEquipe(m: { workspaceId: string; nome: string }, conversaId: string, assunto: string, texto: string, nova: boolean) {
  await notificar(createAdminClient(), {
    workspaceId: m.workspaceId, para: await gerentesDoVoluntariado(m.workspaceId), atorId: null, categoria: 'mensagens',
    titulo: nova ? `${m.nome} mandou uma mensagem` : `${m.nome} respondeu`, mensagem: assunto,
    link: `/voluntariado/mensagens/${conversaId}`, citacao: texto.slice(0, 600), botao: 'Responder',
    nota: 'Mensagem da Área do Voluntário.',
  })
}

export async function abrirConversa(_anterior: { erro?: string }, formData: FormData): Promise<{ erro?: string }> {
  let id = ''
  try {
    const m = await exigirMembroQueEscreve()
    const { assunto, categoria, texto, erros } = lerMensagem(formData, true)
    if (erros.length) throw new Error(erros.join(' '))
    const { data, error } = await createAdminClient().rpc('membro_abrir_conversa', { p_participante_id: m.participanteId, p_assunto: assunto, p_categoria: categoria, p_texto: texto })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível enviar.')
    const conversaId = String(data)
    id = conversaId
    depoisDaResposta('aviso à equipe', () => avisarEquipe(m, conversaId, assunto, texto, true))
    revalidatePath('/membro', 'layout')
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar.') }
  }
  redirect(`/membro/mensagens/${id}`)
}

export async function responderConversa(conversaId: string, _anterior: { erro?: string; ok?: number }, formData: FormData): Promise<{ erro?: string; ok?: number }> {
  try {
    const m = await exigirMembroQueEscreve()
    const { texto, erros } = lerMensagem(formData, false)
    if (erros.length) throw new Error(erros.join(' '))
    const admin = createAdminClient()
    const { error } = await admin.rpc('membro_responder', { p_participante_id: m.participanteId, p_conversa_id: conversaId, p_texto: texto })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível enviar.')
    depoisDaResposta('aviso à equipe', async () => {
      const { data: c } = await admin.from('membro_conversas').select('assunto').eq('id', conversaId).single()
      await avisarEquipe(m, conversaId, c?.assunto ?? 'Conversa', texto, false)
    })
    revalidatePath(`/membro/mensagens/${conversaId}`)
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar.') }
  }
}

// ---------------------------------------------------------------- bens sob responsabilidade

/** O voluntário aceita o termo de responsabilidade de um bem que está com ele. */
export async function aceitarTermoDoBem(cautelaId: string): Promise<{ erro?: string }> {
  try {
    const m = await exigirMembroQueEscreve()
    if (!/^[0-9a-f-]{36}$/.test(cautelaId)) throw new Error('Termo não encontrado.')
    const { data, error } = await createAdminClient().rpc('patrimonio_voluntario_aceitar', { p_participante_id: m.participanteId, p_cautela_id: cautelaId })
    if (error || !data) throw new Error('Termo não encontrado.')
    revalidatePath('/membro', 'layout')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível aceitar o termo.') }
  }
}
