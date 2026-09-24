import { createAdminClient } from '@/lib/supabase/admin'
import { nomeDoArquivo } from '@/lib/oficios/documento'

export const dynamic = 'force-dynamic'

/**
 * O manifesto de assinaturas, byte a byte como foi carimbado. É este arquivo
 * que a prova .ots certifica: o SHA-256 dele é o hash ancorado no Bitcoin.
 */
export async function GET(_: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (!/^[0-9a-f]{32}$/.test(codigo)) return new Response('Não encontrado.', { status: 404 })
  const admin = createAdminClient()
  const { data: o } = await admin.from('oficios').select('ano,numero,manifesto').eq('codigo_verificacao', codigo).neq('estado', 'rascunho').maybeSingle()
  if (!o?.manifesto) return new Response('Não encontrado.', { status: 404 })
  const numero = o.numero ? `${String(o.numero).padStart(3, '0')}/${o.ano}` : null
  return new Response(o.manifesto, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeDoArquivo(numero, '-manifesto.json')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
