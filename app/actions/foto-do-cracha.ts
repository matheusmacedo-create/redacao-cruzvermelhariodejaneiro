'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { avisarFotoDoCracha } from '@/lib/membro/comunicacao'

/**
 * A foto do crachá do voluntário só vale com a aprovação do Voluntariado
 * (migração 20260929050000). Quem confere o nível e grava é o banco
 * (avaliar_foto_do_cracha); aqui só chamamos e avisamos o voluntário.
 */

type Resultado = { erro?: string }
const UUID = /^[0-9a-f-]{36}$/

export async function avaliarFotoDoCracha(participanteId: string, fotoPath: string, aprovar: boolean, motivo?: string): Promise<Resultado> {
  try {
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Só quem gerencia o Voluntariado aprova fotos de crachá.')
    if (!UUID.test(participanteId) || !fotoPath) throw new Error('Foto inválida.')
    const { error } = await supabase.rpc('avaliar_foto_do_cracha', { p_id: participanteId, p_foto_path: fotoPath, p_aprovar: aprovar, p_motivo: motivo?.trim().slice(0, 300) || null })
    if (error) {
      if (error.code === 'P0001' && error.message) throw new Error(error.message)
      if (error.code === 'PGRST202' || error.code === '42883') throw new Error('A aprovação de fotos ainda não está ligada no banco (migração 20260929050000). Avise a administração.')
      throw new Error('Não foi possível salvar a avaliação da foto.')
    }
    await avisarFotoDoCracha(participanteId)
    revalidatePath('/voluntariado')
    revalidatePath(`/voluntariado/${participanteId}`)
    revalidatePath('/membro', 'layout')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a avaliação da foto.') }
  }
}
