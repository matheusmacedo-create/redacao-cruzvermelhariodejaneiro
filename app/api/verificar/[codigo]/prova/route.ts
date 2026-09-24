import { createAdminClient } from '@/lib/supabase/admin'
import { nomeDoArquivo } from '@/lib/oficios/documento'

export const dynamic = 'force-dynamic'

/**
 * A prova OpenTimestamps (.ots) do ofício. Pública pelo código de
 * verificação: junto com o manifesto, basta para conferir em
 * opentimestamps.org sem depender do Redação.
 */
export async function GET(_: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (!/^[0-9a-f]{32}$/.test(codigo)) return new Response('Não encontrado.', { status: 404 })
  const admin = createAdminClient()
  const { data: o } = await admin.from('oficios').select('id,ano,numero').eq('codigo_verificacao', codigo).neq('estado', 'rascunho').maybeSingle()
  if (!o) return new Response('Não encontrado.', { status: 404 })
  const { data: c } = await admin.from('oficio_carimbos').select('prova').eq('oficio_id', o.id).not('prova', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!c?.prova) return new Response('A prova ainda não foi gerada.', { status: 404 })
  const numero = o.numero ? `${String(o.numero).padStart(3, '0')}/${o.ano}` : null
  return new Response(new Uint8Array(Buffer.from(c.prova, 'base64')), {
    headers: {
      'Content-Type': 'application/vnd.opentimestamps.v1',
      'Content-Disposition': `attachment; filename="${nomeDoArquivo(numero, '-manifesto.json.ots')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
