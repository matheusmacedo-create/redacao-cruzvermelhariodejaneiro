import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ItemDoMapa, PendenciaDoMapa } from '@/lib/mapa/modelo'

export type DadosDoMapa = { itens: ItemDoMapa[]; pendencias: PendenciaDoMapa[]; atualizadoEm: string | null }

const COLUNAS_DO_ITEM = 'id,parent_id,tipo,sistema,nome,descricao,estado,estado_detalhe,url,entregas,ordem,atualizado_em'
const COLUNAS_DA_PENDENCIA = 'id,item_id,sistema,titulo,detalhe,tipo,quem,esforco,prioridade,area,por_que,bloqueia,primeiro_passo,fonte,o_que_falta,situacao,ordem_fila,resolvida_em,nota,atualizado_em'

/**
 * Lê o mapa do espaço com a sessão de quem pede (RLS: membro do espaço).
 * Os limites são largos de propósito: o mapa cresce, e `paginar` não vale a
 * pena para duas listas que cabem numa tela.
 */
export async function carregarMapa(workspaceId: string): Promise<DadosDoMapa> {
  const supabase = await createClient()
  const [itens, pendencias] = await Promise.all([
    supabase.from('mapa_itens').select(COLUNAS_DO_ITEM).eq('workspace_id', workspaceId).order('ordem').limit(5000),
    supabase.from('mapa_pendencias').select(COLUNAS_DA_PENDENCIA).eq('workspace_id', workspaceId).order('id').limit(5000),
  ])
  if (itens.error) throw new Error('Não foi possível ler o mapa do ecossistema.')
  if (pendencias.error) throw new Error('Não foi possível ler as pendências do mapa.')
  const linhas = (itens.data ?? []) as unknown as (ItemDoMapa & { atualizado_em: string | null })[]
  const pend = (pendencias.data ?? []) as unknown as (PendenciaDoMapa & { atualizado_em: string | null })[]
  const datas = [...linhas.map((l) => l.atualizado_em), ...pend.map((p) => p.atualizado_em)].filter((d): d is string => Boolean(d)).sort()
  return { itens: linhas, pendencias: pend, atualizadoEm: datas.pop() ?? null }
}
