import { timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'
import { publicarProximaAgendada } from '@/app/actions/pacotes'

export const dynamic = 'force-dynamic'
// Publicar um pacote com página no site (fotos, envio e conferência da página)
// passa de 60 s. A tela do pacote, que publica pelo clique, já tem 300; sem o
// mesmo teto aqui, a função morria antes de gravar "feita" e de avisar.
export const maxDuration = 300

/**
 * O relógio da publicação agendada. Quem chama não é a Vercel (o plano Hobby
 * só aceita cron diário): é o pg_cron do banco, a cada minuto, e só quando há
 * pedido vencido em publicacoes_agendadas (migração 20261102180000). Publica
 * um pacote por chamada; se houver mais, o minuto seguinte pega o próximo.
 *
 * Protegida por CRON_SECRET, como /api/chamados/rotina. O banco lê o mesmo
 * valor do cofre (segredo 'cron_secret').
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  // O pg_net desiste aos 60 s, e publicar com página no site já levou 52.
  // Por isso a rota responde na hora e publica depois, dentro dos 300 s:
  // o resultado fica em publicacoes_agendadas e no aviso a quem agendou.
  after(async () => {
    await publicarProximaAgendada()
  })
  return Response.json({ ok: true, aceito: true })
}
