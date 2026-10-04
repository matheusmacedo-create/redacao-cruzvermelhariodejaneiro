import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { LEITURA_DO_CRON, sincronizarEspaco } from '@/lib/escola/servidor'
import { sincronizarMetaDoEspaco } from '@/lib/escola/meta-servidor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Sincronização da Escola (vercel.json): saldo e transações de cada conta
 * da Únicopag e, no marketing, campanhas, anúncios e números de cada conta
 * de anúncios do Meta — de todos os espaços. Protegida por CRON_SECRET. A
 * resposta diz só quantas contas deram certo — nunca chave, nunca dado de
 * aluno.
 *
 * Roda uma vez por dia inteira e, de hora em hora, só a Únicopag
 * (`?so=unicopag`): é dessa leitura que saem os avisos à Meta dos
 * pagamentos (API de Conversões), e quanto mais perto do pagamento, melhor.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const { data } = await createAdminClient().from('escola_contas').select('workspace_id').eq('ativa', true)
  const espacos = [...new Set((data ?? []).map((c) => c.workspace_id as string))]
  let certas = 0, falhas = 0
  // Os 180 dias, mas parando a tempo de gravar o que já leu (a função tem 60 s).
  const modo = { ...LEITURA_DO_CRON, prazo: Date.now() + 40_000 }
  for (const ws of espacos) {
    for (const r of await sincronizarEspaco(ws, undefined, modo)) (r.ok ? certas++ : falhas++)
  }
  if (new URL(request.url).searchParams.get('so') === 'unicopag') return Response.json({ contas: certas + falhas, certas, falhas })
  const { data: meta } = await createAdminClient().from('escola_meta_contas').select('workspace_id').eq('ativa', true)
  let metaCertas = 0, metaFalhas = 0
  for (const ws of new Set((meta ?? []).map((c) => c.workspace_id as string))) {
    for (const r of await sincronizarMetaDoEspaco(ws)) (r.ok ? metaCertas++ : metaFalhas++)
  }
  return Response.json({ contas: certas + falhas, certas, falhas, meta: { certas: metaCertas, falhas: metaFalhas } })
}
