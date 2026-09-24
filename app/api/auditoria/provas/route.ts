import { timingSafeEqual } from 'node:crypto'
import { rotinaDasProvas } from '@/lib/auditoria/rotina'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron da trilha pública (vercel.json). Tarde: pergunta aos calendários do OpenTimestamps se os lotes já entraram num bloco do Bitcoin.
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>`; sem a variável, a rota fica fechada.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })
  try {
    return Response.json({ ok: true, resumo: await rotinaDasProvas() })
  } catch (causa) {
    console.error('[trilha] rotina falhou:', causa instanceof Error ? causa.message : causa)
    return Response.json({ erro: 'Falha na rotina da trilha.' }, { status: 500 })
  }
}
