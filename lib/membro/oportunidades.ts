import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Membro } from './sessao'

/**
 * As oportunidades vistas pelo voluntário: publicadas do espaço dele, das
 * próximas às de até 60 dias atrás, com as vagas ocupadas e a situação dele.
 * De outros voluntários, só a contagem — nunca quem são.
 */

export type OportunidadeDoMembro = {
  id: string; titulo: string; tipo: string; descricao: string | null; local: string | null; inicio: string; fim: string
  vagas: number | null; inscricoes_ate: string | null; horas: number | null; cancelada_em: string | null; motivo_cancelamento: string | null
  ocupadas: number; minha: string | null
}

const COLUNAS = 'id,titulo,tipo,descricao,local,inicio,fim,vagas,inscricoes_ate,horas,cancelada_em,motivo_cancelamento'

export async function oportunidadesDoMembro(m: Membro): Promise<OportunidadeDoMembro[]> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 60 * 86400_000).toISOString()
  const { data: lista } = await admin.from('oportunidades').select(COLUNAS).eq('workspace_id', m.workspaceId).eq('publicado', true)
    .gte('fim', desde).order('inicio').limit(300)
  const ids = (lista ?? []).map((o) => o.id as string)
  if (!ids.length) return []
  const { data: inscricoes } = await admin.from('oportunidade_inscricoes').select('oportunidade_id,participante_id,situacao').in('oportunidade_id', ids)
  return (lista ?? []).map((o) => {
    const daqui = (inscricoes ?? []).filter((i) => i.oportunidade_id === o.id)
    return {
      ...(o as Omit<OportunidadeDoMembro, 'ocupadas' | 'minha'>),
      vagas: o.vagas as number | null, horas: o.horas === null ? null : Number(o.horas),
      ocupadas: daqui.filter((i) => ['inscrito', 'presente', 'ausente'].includes(i.situacao as string)).length,
      minha: (daqui.find((i) => i.participante_id === m.participanteId)?.situacao as string | undefined) ?? null,
    }
  })
}

/** Uma oportunidade publicada do espaço do voluntário (para o .ics). */
export async function oportunidadeDoMembro(m: Membro, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const { data } = await createAdminClient().from('oportunidades').select(COLUNAS).eq('id', id).eq('workspace_id', m.workspaceId).eq('publicado', true).maybeSingle()
  return data as Omit<OportunidadeDoMembro, 'ocupadas' | 'minha'> | null
}
