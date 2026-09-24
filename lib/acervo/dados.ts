import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { configDoR2, type ConfigDoR2 } from '@/lib/armazenamento/r2'
import type { ArquivosNoSite, ItemPublico } from './paginas'
import type { Colecao, Direitos, Precisao } from './regras'

/** O bucket do acervo no R2 (R2_BUCKET_ACERVO), ou null sem as variáveis. */
export function bucketDoAcervo(): { config: ConfigDoR2; bucket: string } | null {
  const bucket = process.env.R2_BUCKET_ACERVO?.trim()
  if (!bucket) return null
  const config = configDoR2()
  return config ? { config, bucket } : null
}

export const COLUNAS_DO_ITEM = 'id,workspace_id,colecao,titulo,descricao,data_item,data_precisao,autoria,local,direitos,credito,texto_alternativo,palavras_chave,url_video,chave_r2,nome_original,tipo_mime,tamanho,sha256,largura,altura,visibilidade,slug,destaque,publicado_em,atualizado_no_site_em,arquivos_no_site,criado_por,atualizado_por,created_at,updated_at'

export type LinhaDoItem = {
  id: string; workspace_id: string; colecao: Colecao; titulo: string; descricao: string | null
  data_item: string | null; data_precisao: Precisao; autoria: string | null; local: string | null
  direitos: Direitos; credito: string | null; texto_alternativo: string | null; palavras_chave: string[]
  url_video: string | null; chave_r2: string | null; nome_original: string | null; tipo_mime: string | null
  tamanho: number | null; sha256: string | null; largura: number | null; altura: number | null
  visibilidade: 'privado' | 'publico'; slug: string | null; destaque: boolean
  publicado_em: string | null; atualizado_no_site_em: string | null; arquivos_no_site: ArquivosNoSite | null
  criado_por: string | null; atualizado_por: string | null; created_at: string; updated_at: string
}

export function paraPublico(l: LinhaDoItem): ItemPublico {
  return {
    id: l.id, colecao: l.colecao, slug: l.slug!, titulo: l.titulo, descricao: l.descricao, data_item: l.data_item, data_precisao: l.data_precisao,
    autoria: l.autoria, local: l.local, direitos: l.direitos, credito: l.credito, texto_alternativo: l.texto_alternativo,
    palavras_chave: l.palavras_chave ?? [], url_video: l.url_video, tipo_mime: l.tipo_mime, tamanho: l.tamanho === null ? null : Number(l.tamanho),
    publicado_em: l.publicado_em!, atualizado_no_site_em: l.atualizado_no_site_em, arquivos: l.arquivos_no_site,
  }
}

/** Os itens públicos do espaço, como as páginas do site os mostram. */
export async function itensPublicosDoAcervo(workspaceId: string): Promise<ItemPublico[]> {
  const { data, error } = await createAdminClient().from('acervo_itens').select(COLUNAS_DO_ITEM)
    .eq('workspace_id', workspaceId).eq('visibilidade', 'publico').order('publicado_em', { ascending: false })
  if (error) throw new Error('Não foi possível ler os itens públicos do acervo.')
  return ((data ?? []) as unknown as LinhaDoItem[]).filter((l) => l.slug && l.publicado_em).map(paraPublico)
}
