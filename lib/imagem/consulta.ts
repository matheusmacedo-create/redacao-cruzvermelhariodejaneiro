import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { ehUso, ehVinculo } from './regras'

/**
 * A busca no banco de autorizações — a mesma para a tela e para a planilha.
 * Lida com a sessão de quem está logado: o RLS só mostra o próprio espaço.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>

export type FiltrosDaBusca = { q?: string; situacao?: string; uso?: string; vinculo?: string; coleta?: string }

export type LinhaDaAutorizacao = {
  id: string
  codigo: string
  coleta_id: string
  nome: string
  vinculo: string
  contato: string | null
  menor: boolean
  responsavel_nome: string | null
  responsavel_parentesco: string | null
  usos: string[]
  aparelho: string
  ip: string | null
  assinado_em: string
  termo_versao: string
  documento_hash: string
  file_ids: string[]
  revogada_em: string | null
  revogada_por: string | null
  revogacao_motivo: string | null
  imagem_coletas: { titulo: string } | { titulo: string }[] | null
}

export const CAMPOS = 'id, codigo, coleta_id, nome, vinculo, contato, menor, responsavel_nome, responsavel_parentesco, usos, aparelho, ip, assinado_em, termo_versao, documento_hash, file_ids, revogada_em, revogada_por, revogacao_motivo, imagem_coletas(titulo)'

export const tituloDaColeta = (l: LinhaDaAutorizacao) => (Array.isArray(l.imagem_coletas) ? l.imagem_coletas[0]?.titulo : l.imagem_coletas?.titulo) ?? ''

export async function buscarAutorizacoes(supabase: Cliente, workspaceId: string, f: FiltrosDaBusca, limite = 200): Promise<LinhaDaAutorizacao[]> {
  let q = supabase.from('imagem_autorizacoes').select(CAMPOS).eq('workspace_id', workspaceId).order('assinado_em', { ascending: false }).limit(limite)
  const termo = (f.q ?? '').replace(/[%_,()*\\]/g, ' ').trim().slice(0, 80)
  if (termo) q = /^IMG-/i.test(termo) ? q.eq('codigo', termo.toUpperCase()) : q.or(`nome.ilike.%${termo}%,responsavel_nome.ilike.%${termo}%`)
  if (f.situacao === 'valida') q = q.is('revogada_em', null)
  if (f.situacao === 'revogada') q = q.not('revogada_em', 'is', null)
  if (f.uso && ehUso(f.uso)) q = q.contains('usos', [f.uso])
  if (f.vinculo && ehVinculo(f.vinculo)) q = q.eq('vinculo', f.vinculo)
  if (f.coleta && /^[0-9a-f-]{36}$/i.test(f.coleta)) q = q.eq('coleta_id', f.coleta)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as LinhaDaAutorizacao[]
}
