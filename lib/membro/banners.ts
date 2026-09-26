import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { bannerNoAr, MAXIMO_NO_AR, ordenarBanners } from '@/lib/banners/regras'
import { urlDoBanner } from '@/lib/banners/imagem'
import type { Membro } from './sessao'

export type BannerDoMembro = { id: string; titulo: string; texto: string | null; imagem: string; link_url: string | null; link_rotulo: string | null }

/** Os banners no ar hoje, na ordem da coordenação (no máximo MAXIMO_NO_AR). */
export async function bannersDoMembro(m: Membro, hoje: string): Promise<BannerDoMembro[]> {
  const { data } = await createAdminClient().from('membro_banners')
    .select('id,titulo,texto,imagem_caminho,link_url,link_rotulo,inicio,fim,ativo,ordem,created_at')
    .eq('workspace_id', m.workspaceId).eq('ativo', true).limit(50)
  return ordenarBanners((data ?? []).filter((b) => bannerNoAr(b as { ativo: boolean; inicio: string | null; fim: string | null }, hoje)) as { ordem: number; created_at: string; id: string; titulo: string; texto: string | null; imagem_caminho: string; link_url: string | null; link_rotulo: string | null }[])
    .slice(0, MAXIMO_NO_AR)
    .flatMap((b) => {
      const imagem = urlDoBanner(b.imagem_caminho)
      return imagem ? [{ id: b.id, titulo: b.titulo, texto: b.texto, imagem, link_url: b.link_url, link_rotulo: b.link_rotulo }] : []
    })
}
