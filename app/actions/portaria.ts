'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { lerVisitante } from '@/lib/portaria/regras'
import { avisarVisitado } from '@/lib/portaria/servidor'

/**
 * Portaria virtual (lib/portaria/regras.ts, migração 20260929060000). Quem
 * confere o acesso e grava é o banco (portaria_*, com a sessão da pessoa);
 * aqui lemos o formulário, chamamos e avisamos quem é visitado.
 */

type Resultado<T = object> = { erro?: string } & T
const UUID = /^[0-9a-f-]{36}$/
const SEM_MIGRACAO = 'A Portaria ainda não está ligada no banco (migração 20260929060000). Avise a administração.'

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01') throw new Error(SEM_MIGRACAO)
  throw new Error(padrao)
}

const revalidar = () => revalidatePath('/portaria')

/** A portaria registra quem chegou. Devolve o id, para a foto subir em seguida. */
export async function registrarEntrada(formData: FormData): Promise<Resultado<{ id?: string }>> {
  try {
    const context = await requireWorkspace()
    const { dados, erros } = lerVisitante(formData)
    if (erros.length) throw new Error(erros.join(' '))
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('portaria_registrar_entrada', { p_workspace_id: context.workspace.id, p: dados })
    if (error || !data) erroDoBanco(error, 'Não foi possível registrar a entrada.')
    await avisarVisitado({ workspaceId: context.workspace.id, visitadoId: dados.visitado_id ?? null, nome: dados.nome, empresa: dados.empresa || null, motivo: dados.motivo || null }, context.user.id)
    revalidar()
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a entrada.') }
  }
}

/** Confirma quem se cadastrou pelo QR (com as correções da portaria). */
export async function confirmarEntrada(id: string, formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    if (!UUID.test(id)) throw new Error('Visita inválida.')
    const { dados, erros } = lerVisitante(formData)
    if (erros.length) throw new Error(erros.join(' '))
    const supabase = await createClient()
    const { error } = await supabase.rpc('portaria_confirmar', { p_id: id, p: dados })
    if (error) erroDoBanco(error, 'Não foi possível confirmar a entrada.')
    await avisarVisitado({ workspaceId: context.workspace.id, visitadoId: dados.visitado_id ?? null, nome: dados.nome, empresa: dados.empresa || null, motivo: dados.motivo || null }, context.user.id)
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível confirmar a entrada.') }
  }
}

async function chamar(rpc: string, args: Record<string, unknown>, padrao: string): Promise<Resultado> {
  try {
    await requireWorkspace()
    if (!UUID.test(String(args.p_id ?? ''))) throw new Error('Visita inválida.')
    const supabase = await createClient()
    const { error } = await supabase.rpc(rpc, args)
    if (error) erroDoBanco(error, padrao)
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, padrao) }
  }
}

export async function descartarCadastro(id: string) {
  return chamar('portaria_descartar', { p_id: id }, 'Não foi possível descartar.')
}

export async function registrarSaida(id: string, crachaDevolvido: boolean) {
  return chamar('portaria_registrar_saida', { p_id: id, p_cracha_devolvido: crachaDevolvido }, 'Não foi possível registrar a saída.')
}

export async function devolverCracha(id: string) {
  return chamar('portaria_devolver_cracha', { p_id: id }, 'Não foi possível registrar a devolução.')
}

/** Novo segredo para o QR da entrada: o cartaz antigo para de valer. Só administradores. */
export async function trocarLinkDaEntrada(): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    if (context.role !== 'admin') throw new Error('Só administradores trocam o link da entrada.')
    const supabase = await createClient()
    const { error } = await supabase.rpc('portaria_novo_link', { p_workspace_id: context.workspace.id })
    if (error) erroDoBanco(error, 'Não foi possível trocar o link.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível trocar o link.') }
  }
}
