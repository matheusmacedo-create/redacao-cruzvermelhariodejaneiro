import { timingSafeEqual } from 'node:crypto'
import { processarFila } from '@/lib/oficios/carimbo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Chamada pelo agendador da Vercel (vercel.json): envia os carimbos novos
 * aos calendários e atualiza os que esperam um bloco do Bitcoin. A Vercel
 * manda `Authorization: Bearer <CRON_SECRET>`; sem a variável, a rota fica
 * fechada — e os carimbos seguem sendo atualizados quando alguém abre o ofício.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })
  try {
    const resultado = await processarFila(25)
    return Response.json({ ok: true, resultado })
  } catch {
    return Response.json({ erro: 'Falha ao processar a fila.' }, { status: 500 })
  }
}
