import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { DIAS_PARA_FECHAR } from '@/lib/chamados/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rotina diária (vercel.json): fecha os chamados resolvidos há mais de
 * DIAS_PARA_FECHAR dias sem resposta de quem abriu — o "fechamento
 * automático" do Freshservice. Quem abriu teve o prazo para reabrir; depois
 * disso, o chamado sai da fila de pendências de todo mundo.
 *
 * Protegida por CRON_SECRET, como /api/oficios/carimbos.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const limite = new Date(Date.now() - DIAS_PARA_FECHAR * 86_400_000).toISOString()
  const agora = new Date().toISOString()
  const { data: fechados, error } = await admin.from('chamados')
    .update({ status: 'fechado', fechado_em: agora, atualizado_em: agora })
    .eq('status', 'resolvido').lt('resolvido_em', limite)
    .select('id, workspace_id')
  if (error) return Response.json({ erro: 'Falha ao fechar chamados.' }, { status: 500 })
  if (fechados?.length) {
    await admin.from('chamado_interacoes').insert(fechados.map((c) => ({
      workspace_id: c.workspace_id, chamado_id: c.id, autor_id: null, tipo: 'evento',
      dados: { acao: 'status', de: 'resolvido', para: 'fechado', automatico: true },
      texto: `Fechado automaticamente: ${DIAS_PARA_FECHAR} dias sem resposta depois de resolvido.`,
    })))
  }
  return Response.json({ ok: true, fechados: fechados?.length ?? 0 })
}
