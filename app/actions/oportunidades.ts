'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { emailConfigurado, enviarEmailDeConta } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { emailDeCancelamento } from '@/lib/membro/emails'
import { lerOportunidade, quando } from '@/lib/oportunidades/regras'

/**
 * Oportunidades — o lado da equipe. Escrita sob as políticas do nível do
 * Voluntariado (gerenciar); presença pela função do banco, que lança e tira
 * as horas do cadastro.
 */

type Resultado = { erro?: string }

async function gerente() {
  const c = await contextoDeParticipantes()
  if (c.nivel < 2) throw new Error('Você não tem acesso para editar oportunidades.')
  return c
}

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Confira as datas e os números.')
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/voluntariado/oportunidades')
  if (id) revalidatePath(`/voluntariado/oportunidades/${id}`)
  revalidatePath('/membro', 'layout')
}

export async function salvarOportunidade(id: string | null, _anterior: Resultado & { ok?: boolean }, formData: FormData): Promise<Resultado & { ok?: boolean }> {
  let novo = ''
  try {
    const { context, supabase } = await gerente()
    const { dados, erros } = lerOportunidade(formData)
    if (!dados) throw new Error(erros.join(' '))
    if (id) {
      const { error } = await supabase.from('oportunidades').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) erroDoBanco(error, 'Não foi possível salvar.')
      revalidar(id)
      return { ok: true }
    }
    const { data, error } = await supabase.from('oportunidades').insert({ ...dados, workspace_id: context.workspace.id, criado_por: context.user.id }).select('id').single()
    if (error || !data) erroDoBanco(error, 'Não foi possível criar.')
    novo = data.id
    revalidar()
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
  redirect(`/voluntariado/oportunidades/${novo}`)
}

export async function publicarOportunidade(id: string, publicado: boolean): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { error } = await supabase.from('oportunidades').update({ publicado, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível mudar a publicação.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar a publicação.') }
  }
}

/** Cancela e avisa por e-mail quem estava inscrito ou na espera. */
export async function cancelarOportunidade(id: string, motivo: string): Promise<Resultado & { avisados?: number }> {
  try {
    const { supabase } = await gerente()
    const m = motivo.trim().slice(0, 600)
    if (m.length < 3) throw new Error('Escreva o motivo: ele vai no aviso aos inscritos.')
    const { data: o, error } = await supabase.from('oportunidades').update({ cancelada_em: new Date().toISOString(), motivo_cancelamento: m, updated_at: new Date().toISOString() })
      .eq('id', id).is('cancelada_em', null).select('titulo,inicio,fim,publicado').single()
    if (error || !o) erroDoBanco(error, 'Não foi possível cancelar.')
    let avisados = 0
    if (o.publicado && emailConfigurado()) {
      const { data: inscritos } = await supabase.from('oportunidade_inscricoes').select('participantes(nome,nome_social,email)').eq('oportunidade_id', id).in('situacao', ['inscrito', 'espera'])
      for (const i of inscritos ?? []) {
        const p = (Array.isArray(i.participantes) ? i.participantes[0] : i.participantes) as { nome: string; nome_social: string | null; email: string | null } | null
        if (!p?.email) continue
        const e = emailDeCancelamento({ nome: p.nome_social || p.nome, titulo: o.titulo, quando: quando(o.inicio, o.fim), motivo: m, url: `${urlBase()}/membro/oportunidades` })
        await enviarEmailDeConta({ para: p.email, assunto: e.assunto, html: e.html, texto: e.texto }).then(() => { avisados++ }).catch(() => undefined)
      }
    }
    revalidar(id)
    return { avisados }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível cancelar.') }
  }
}

export async function excluirOportunidade(id: string): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { count } = await supabase.from('oportunidade_inscricoes').select('id', { count: 'exact', head: true }).eq('oportunidade_id', id)
    if (count) throw new Error('Já há inscrições. Em vez de excluir, cancele: os inscritos são avisados.')
    const { error } = await supabase.from('oportunidades').delete().eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    revalidar()
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
  redirect('/voluntariado/oportunidades')
}

export async function marcarPresenca(oportunidadeId: string, inscricaoId: string, presente: boolean, horas: string): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const h = horas.trim().replace(',', '.')
    if (h && !(Number(h) > 0 && Number(h) <= 24)) throw new Error('Horas: de 0,25 a 24.')
    const { error } = await supabase.rpc('registrar_presenca', { p_inscricao_id: inscricaoId, p_presente: presente, p_horas: h ? Math.round(Number(h) * 4) / 4 : null })
    if (error) erroDoBanco(error, 'Não foi possível registrar a presença.')
    revalidar(oportunidadeId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a presença.') }
  }
}
