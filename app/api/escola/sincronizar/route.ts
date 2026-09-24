import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarEspaco } from '@/lib/escola/servidor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Sincronização diária das contas da Únicopag da Escola (vercel.json):
 * saldo e transações de cada conta ativa, de todos os espaços. Protegida por
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
  return Response.json({ contas: certas + falhas, certas, falhas })
}
