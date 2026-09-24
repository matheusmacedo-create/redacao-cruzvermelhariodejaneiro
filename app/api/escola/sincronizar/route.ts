import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarEspaco } from '@/lib/escola/servidor'
import { sincronizarMetaDoEspaco } from '@/lib/escola/meta-servidor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Sincronização diária da Escola (vercel.json): saldo e transações de cada
 * conta da Únicopag e, no marketing, campanhas, anúncios e números de cada
 * conta de anúncios do Meta — de todos os espaços. Protegida por
 * CRON_SECRET. A resposta diz só quantas contas deram certo — nunca chave,
 * nunca dado de aluno.
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
  for (const ws of espacos) {
    for (const r of await sincronizarEspaco(ws)) (r.ok ? certas++ : falhas++)
  }
  const { data: meta } = await createAdminClient().from('escola_meta_contas').select('workspace_id').eq('ativa', true)
  let metaCertas = 0, metaFalhas = 0
  for (const ws of new Set((meta ?? []).map((c) => c.workspace_id as string))) {
    for (const r of await sincronizarMetaDoEspaco(ws)) (r.ok ? metaCertas++ : metaFalhas++)
  }
  return Response.json({ contas: certas + falhas, certas, falhas, meta: { certas: metaCertas, falhas: metaFalhas } })
}
