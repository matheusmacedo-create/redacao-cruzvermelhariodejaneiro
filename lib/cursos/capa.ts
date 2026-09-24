import { publicSupabaseEnv } from '@/lib/supabase/env'

/** A capa fica num bucket público (não é dado pessoal): endereço direto. */
export const urlDaCapa = (caminho: string | null) => {
  const { url } = publicSupabaseEnv()
  return caminho && url ? `${url}/storage/v1/object/public/cursos-capas/${caminho}` : null
}
