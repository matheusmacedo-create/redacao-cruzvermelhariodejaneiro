'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'

/**
 * Os cursos da Escola no Marketing (lib/escola/cursos.ts, migração
 * 20260929070000). Quem confere o nível e grava é o banco
 * (escola_curso_salvar, escola_produto_classificar).
 */

type Resultado<T = object> = { erro?: string } & T
const UUID = /^[0-9a-f-]{36}$/
const SEM_MIGRACAO = 'Os cursos ainda não estão ligados no banco (migração 20260929070000). Avise a administração.'

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01') throw new Error(SEM_MIGRACAO)
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/escola/marketing/cursos')
  if (id) revalidatePath(`/escola/marketing/cursos/${id}`)
  revalidatePath('/escola/marketing')
}

export async function salvarCurso(formData: FormData): Promise<Resultado<{ id?: string }>> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    const id = String(formData.get('id') ?? '')
    if (id && !UUID.test(id)) throw new Error('Curso inválido.')
    const dados = {
      id: id || null,
      nome: String(formData.get('nome') ?? '').trim().slice(0, 120),
      pagina_url: String(formData.get('pagina_url') ?? '').trim().slice(0, 500),
      descricao: String(formData.get('descricao') ?? '').trim().slice(0, 500),
      ativo: formData.get('ativo') !== 'nao',
    }
    if (dados.nome.length < 2) throw new Error('Escreva o nome do curso.')
    if (dados.pagina_url && !/^https:\/\/\S+$/.test(dados.pagina_url)) throw new Error('A página do curso precisa começar com https://.')
    const { data, error } = await supabase.rpc('escola_curso_salvar', { p_workspace_id: context.workspace.id, p: dados })
    if (error || !data) erroDoBanco(error, 'Não foi possível salvar o curso.')
    revalidar(data as string)
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o curso.') }
  }
}

/** Associa um produto da Únicopag a um curso, ignora (`cursoId` 'ignorar') ou volta à regra automática (''). */
export async function classificarProduto(produto: string, cursoId: string): Promise<Resultado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    if (!produto || produto.length > 300) throw new Error('Produto inválido.')
    const ignorar = cursoId === 'ignorar'
    if (!ignorar && cursoId && !UUID.test(cursoId)) throw new Error('Curso inválido.')
    const { error } = await supabase.rpc('escola_produto_classificar', {
      p_workspace_id: context.workspace.id, p_produto: produto, p_curso_id: ignorar || !cursoId ? null : cursoId, p_ignorar: ignorar,
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}
