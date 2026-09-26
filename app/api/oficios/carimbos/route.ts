import { timingSafeEqual } from 'node:crypto'
import { processarFila } from '@/lib/oficios/carimbo'
import { selarPendentes } from '@/lib/oficios/selo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Chamada pelo agendador da Vercel (vercel.json): envia os carimbos novos
 * aos calendários, atualiza os que esperam um bloco do Bitcoin e sela
 * (lib/oficios/selo.ts) os assinados que ainda não têm o selo da filial. A Vercel
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
    // E sela com a chave da filial o que terminou de ser assinado sem selo.
    const selados = await selarPendentes(25)
    return Response.json({ ok: true, resultado, selados })
  } catch {
    return Response.json({ erro: 'Falha ao processar a fila.' }, { status: 500 })
  }
}
