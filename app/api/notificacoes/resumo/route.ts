import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { enviarComSeguranca } from '@/lib/contas/servidor'
import { emailDeResumo } from '@/lib/notificacoes/emails'
import { ehCategoria, lerModos, RESUMO_IDADE_MINIMA_MIN, RESUMO_JANELA_DIAS } from '@/lib/notificacoes/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Resumo diário (vercel.json): para cada pessoa, um e-mail com os avisos
 * que ela ainda não abriu e que ainda não saíram por e-mail — os de quem
 * escolheu "Resumo diário" e os que não saíram na hora porque ela estava
 * com a Redação aberta. Assuntos marcados "Só no sino" ficam de fora.
 *
 * Protegida por CRON_SECRET, como /api/chamados/rotina.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const agora = Date.now()
  const { data: avisos, error } = await admin.from('notifications')
    .select('id, user_id, categoria, title, message, link, created_at')
    .is('read_at', null).is('email_em', null)
    .gte('created_at', new Date(agora - RESUMO_JANELA_DIAS * 86_400_000).toISOString())
    .lte('created_at', new Date(agora - RESUMO_IDADE_MINIMA_MIN * 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) return Response.json({ erro: 'Falha ao ler as notificações.' }, { status: 500 })

  const porPessoa = new Map<string, NonNullable<typeof avisos>>()
  for (const a of avisos ?? []) porPessoa.set(a.user_id, [...(porPessoa.get(a.user_id) ?? []), a])
  const ids = [...porPessoa.keys()]
  if (!ids.length) return Response.json({ ok: true, enviados: 0 })

  const [{ data: pessoas }, { data: preferencias }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, email_confirmado_em, active').in('id', ids),
    admin.from('notificacao_preferencias').select('user_id, modos').in('user_id', ids),
  ])
  const modos = new Map((preferencias ?? []).map((p) => [p.user_id as string, lerModos(p.modos)]))

  let enviados = 0
  for (const pessoa of pessoas ?? []) {
    if (!pessoa.active || !pessoa.email || !pessoa.email_confirmado_em) continue
    const escolhas = modos.get(pessoa.id) ?? lerModos(null)
    const itens = (porPessoa.get(pessoa.id) ?? []).filter((a) => !ehCategoria(a.categoria) || escolhas[a.categoria] !== 'nunca')
    if (!itens.length) continue
    const enviado = await enviarComSeguranca(pessoa.email, emailDeResumo({
      urlBase: urlBase(), nome: pessoa.full_name, total: itens.length,
      itens: itens.map((a) => ({ titulo: a.title, mensagem: a.message, link: a.link })),
    }))
    if (!enviado) continue
    enviados += 1
    await admin.from('notifications').update({ email_em: new Date().toISOString() }).in('id', itens.map((a) => a.id))
  }
  return Response.json({ ok: true, enviados })
}
