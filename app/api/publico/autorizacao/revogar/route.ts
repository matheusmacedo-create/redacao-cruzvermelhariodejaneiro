import { revogarPeloTitular } from '@/lib/imagem/servidor'

export const dynamic = 'force-dynamic'

/** Quem assinou revoga pelo comprovante (código + chave do link). */
export async function POST(request: Request) {
  let corpo: Record<string, unknown>
  try { corpo = await request.json() } catch { return Response.json({ erro: 'Pedido inválido.' }, { status: 400 }) }
  const r = await revogarPeloTitular(String(corpo?.codigo ?? ''), String(corpo?.chave ?? ''), String(corpo?.motivo ?? ''))
  return Response.json(r.ok ? { ok: true } : { erro: r.erro }, { status: r.ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } })
}
