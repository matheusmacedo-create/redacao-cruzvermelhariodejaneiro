import { timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'
import { processarFila } from '@/lib/imprensa/fila'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O relógio das campanhas de imprensa. Quem chama é o pg_cron do banco, a cada
 * minuto e só quando há campanha com hora vencida ou fila parada (migração
 * 20261109120000) — a Vercel do plano Hobby só aceita cron diário.
 *
 * Protegida por CRON_SECRET, como /api/publicacao/agendadas; o banco lê o
 * mesmo valor do cofre (segredo 'cron_secret'). O pg_net desiste aos 60 s,
 * então a rota responde na hora e envia depois: o resultado fica nas próprias
 * campanhas, que toda a equipe vê em /imprensa.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  after(async () => {
    await processarFila(240_000)
  })
  return Response.json({ ok: true, aceito: true })
}
