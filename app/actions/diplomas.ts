'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'

/**
 * Diploma de Reconhecimento (docs/IDENTIDADE.md): a coordenação concede e
 * cancela. Quem confere o nível e grava é o banco (conceder_diploma e
 * revogar_diploma, migração 20260929040000); os de horas saem sozinhos.
 */

type Resultado = { erro?: string; codigo?: string }
const UUID = /^[0-9a-f-]{36}$/
const SEM_MIGRACAO = 'Os diplomas ainda não estão ligados no banco (migração 20260929040000). Avise a administração.'

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error(SEM_MIGRACAO)
  throw new Error(padrao)
}

function revalidar(participanteId: string) {
  revalidatePath(`/voluntariado/${participanteId}`)
  revalidatePath('/membro/certificados')
}

export async function concederDiploma(participanteId: string, texto: string): Promise<Resultado> {
  try {
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Só quem gerencia o Voluntariado concede diplomas.')
    if (!UUID.test(participanteId)) throw new Error('Voluntário inválido.')
    const motivo = texto.trim()
    if (motivo.length < 10) throw new Error('Escreva o motivo do reconhecimento (pelo menos 10 letras).')
    const { data, error } = await supabase.rpc('conceder_diploma', { p_participante_id: participanteId, p_texto: motivo.slice(0, 600) })
    if (error || !data) erroDoBanco(error, 'Não foi possível conceder o diploma.')
    revalidar(participanteId)
    return { codigo: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conceder o diploma.') }
  }
}

export async function cancelarDiploma(id: string, participanteId: string, motivo: string): Promise<Resultado> {
  try {
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Só quem gerencia o Voluntariado cancela diplomas.')
    if (!UUID.test(id) || !UUID.test(participanteId)) throw new Error('Diploma inválido.')
    const { error } = await supabase.rpc('revogar_diploma', { p_id: id, p_motivo: motivo.trim().slice(0, 600) })
    if (error) erroDoBanco(error, 'Não foi possível cancelar o diploma.')
    revalidar(participanteId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível cancelar o diploma.') }
  }
}
