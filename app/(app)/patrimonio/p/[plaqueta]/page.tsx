import { notFound, redirect } from 'next/navigation'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const dynamic = 'force-dynamic'

/**
 * O endereço do QR da etiqueta: acha o bem pela plaqueta (ou pela plaqueta
 * antiga) e abre a página dele. Sem login, o Redação leva ao login antes.
 */
export default async function PelaPlaqueta({ params }: { params: Promise<{ plaqueta: string }> }) {
  const { plaqueta } = await params
  const alvo = decodeURIComponent(plaqueta).trim().toUpperCase().slice(0, 40)
  // Vai dentro do filtro: só o que uma plaqueta tem (letras, números, espaço, . - _ /).
  if (!/^[A-Z0-9 ._\-/]+$/.test(alvo)) notFound()
  const { context, supabase } = await contextoDoPatrimonio()
  const { data } = await supabase.from('pat_bens').select('id').eq('workspace_id', context.workspace.id).or(`plaqueta.eq."${alvo}",plaqueta_antiga.eq."${alvo}"`).limit(1).maybeSingle()
  if (!data) notFound()
  redirect(`/patrimonio/${data.id}`)
}
