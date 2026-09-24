import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { NINGUEM, type Membro } from './sessao'

export type BemComOVoluntario = {
  cautela_id: string; plaqueta: string; nome: string; marca: string | null; modelo: string | null; numero_serie: string | null
  entregue_em: string; prevista_devolucao: string | null; termo: string; termo_aceito_em: string | null
}

/** Os bens da filial sob a responsabilidade do voluntário (cautelas abertas). */
export async function bensDoMembro(m: Membro): Promise<BemComOVoluntario[]> {
  if (m.participanteId === NINGUEM) return []
  const { data, error } = await createAdminClient().rpc('patrimonio_do_voluntario', { p_participante_id: m.participanteId })
  if (error) return []
  return (data ?? []) as BemComOVoluntario[]
}
