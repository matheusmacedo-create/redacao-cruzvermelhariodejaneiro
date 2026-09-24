import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { folhaDeEtiquetas } from '@/lib/patrimonio/etiquetas'
import { caminhoDoQr } from '@/lib/patrimonio/regras'
import { urlBase } from '@/lib/newsletter/contexto'

export const dynamic = 'force-dynamic'

/** As etiquetas dos bens marcados (?id=…&id=…), em PDF para imprimir. */
export async function GET(request: Request) {
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) return new Response('Sem acesso ao Patrimônio.', { status: 403 })
  const ids = new URL(request.url).searchParams.getAll('id').filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 480)
  if (!ids.length) return new Response('Marque na lista os bens que quer etiquetar.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const { data } = await supabase.from('pat_bens').select('plaqueta,nome').eq('workspace_id', context.workspace.id).in('id', ids).order('numero')
  const base = urlBase()
  const pdf = await folhaDeEtiquetas((data ?? []).map((b) => ({ plaqueta: b.plaqueta as string, nome: b.nome as string, url: `${base}${caminhoDoQr(b.plaqueta as string)}` })))
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="etiquetas-patrimonio.pdf"', 'Cache-Control': 'no-store' } })
}
