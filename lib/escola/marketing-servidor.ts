import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { chaveDoNome } from '@/lib/equipe'
import { contextoDaEscola } from './servidor'

export const BUCKET_DO_MARKETING = 'escola-marketing'

/**
 * O nível de quem está logado no marketing da escola — a mesma regra de
 * private.nivel_marketing_escola: admin 3; quem vê a Escola, editores e a
 * Comunicação Social, 2. Devolve também o nível na Escola (as abas de
 * dinheiro só aparecem para quem tem 2 lá).
 */
export async function contextoDoMarketing() {
  const { context, supabase, nivel: nivelEscola } = await contextoDaEscola()
  let nivel = 0
  if (context.role === 'admin') nivel = 3
  else if (nivelEscola >= 2 || context.role === 'editor') nivel = 2
  else {
    const coordenacao = (context.memberships as { coordination?: string | null }[]).map((m) => m.coordination).find(Boolean) ?? ''
    if (chaveDoNome(coordenacao) === 'comunicacao social') nivel = 2
    else {
      const { data } = await supabase.from('setor_membros').select('setores(nome)').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id)
      const nomes = (data ?? []).map((s) => (Array.isArray(s.setores) ? s.setores[0] : s.setores) as { nome?: string } | null).map((s) => chaveDoNome(s?.nome ?? ''))
      if (nomes.includes('comunicacao social')) nivel = 2
    }
  }
  return { context, supabase, nivel, nivelEscola }
}

/** Links assinados (1 h) das imagens das peças. Quem chama já conferiu o nível. */
export async function imagensAssinadas(caminhos: (string | null)[]): Promise<Record<string, string>> {
  const lista = [...new Set(caminhos.filter(Boolean) as string[])]
  if (!lista.length) return {}
  const { data } = await createAdminClient().storage.from(BUCKET_DO_MARKETING).createSignedUrls(lista, 3600)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]))
}
