import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarCaixas } from '@/lib/correio/sincronizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rotina diária (vercel.json): relê do Gmail o nome e a assinatura de cada
 * endereço dos setores, para uma mudança feita lá (contato@ → Enviar e-mail
 * como) chegar à Redação mesmo sem ninguém abrir o E-mail do setor.
 *
 * Protegida por CRON_SECRET, como as outras rotinas.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const { data: conexoes } = await createAdminClient().from('google_conexao').select('workspace_id').eq('estado', 'ativa')
  const resultados: { workspace: string; total?: number; erro?: string }[] = []
  for (const c of conexoes ?? []) {
    try {
      const r = await sincronizarCaixas(c.workspace_id as string)
      resultados.push({ workspace: c.workspace_id as string, total: r.total })
    } catch (causa) {
      resultados.push({ workspace: c.workspace_id as string, erro: causa instanceof Error ? causa.message.slice(0, 200) : 'falhou' })
    }
  }
  return Response.json({ ok: true, resultados })
}
