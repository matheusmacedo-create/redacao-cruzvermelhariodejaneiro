import { publicSupabaseEnv } from '@/lib/supabase/env'

/** A imagem do banner fica num bucket público (não é dado pessoal): endereço direto. */
export const urlDoBanner = (caminho: string | null) => {
  const { url } = publicSupabaseEnv()
  return caminho && url ? `${url}/storage/v1/object/public/membro-banners/${caminho}` : null
}
