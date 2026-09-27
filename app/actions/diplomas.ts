'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { lerEscolhidos, lerMotivo } from '@/lib/participantes/diplomas'

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
  revalidatePath('/voluntariado/diplomas')
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

type ResultadoDoLote = { erro?: string; codigos?: string[]; falhas?: { id: string; erro: string }[] }

/**
 * A área de Diplomas: o mesmo reconhecimento para vários voluntários de uma
 * vez (a turma de uma ação, os homenageados de uma cerimônia). Um diploma por
 * pessoa, cada um pelo banco (conceder_diploma confere nível e cadastro de
 * novo); quem falhar volta na lista, sem desfazer os que saíram.
 */
export async function concederDiplomas(participanteIds: string[], texto: string): Promise<ResultadoDoLote> {
  try {
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Só quem gerencia o Voluntariado concede diplomas.')
    const escolhidos = lerEscolhidos(participanteIds)
    if (escolhidos.erro) throw new Error(escolhidos.erro)
    const { motivo, erro } = lerMotivo(texto)
    if (erro) throw new Error(erro)
    const codigos: string[] = []
    const falhas: { id: string; erro: string }[] = []
    for (const id of escolhidos.ids) {
      const { data, error } = await supabase.rpc('conceder_diploma', { p_participante_id: id, p_texto: motivo })
      if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error(SEM_MIGRACAO)
      if (error || !data) falhas.push({ id, erro: error?.code === 'P0001' && error.message ? error.message : 'Não foi possível conceder.' })
      else { codigos.push(data as string); revalidatePath(`/voluntariado/${id}`) }
    }
    revalidatePath('/voluntariado/diplomas')
    revalidatePath('/membro/certificados')
    return { codigos, falhas }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conceder os diplomas.') }
  }
}
