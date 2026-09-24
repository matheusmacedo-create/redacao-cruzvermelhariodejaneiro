import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { avisoDeVencimentos, somarDias } from '@/lib/financeiro/avisos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rotina diária (vercel.json, 8h de Brasília): avisa no sino — e por e-mail,
 * conforme a preferência de cada um no assunto "Financeiro" — quem lança no
 * Financeiro das contas que vencem hoje, das atrasadas e das que vencem
 * nos próximos três dias. Despesa esperando aprovação ou recusada fica de fora: não dá para
 * pagar. Protegida por CRON_SECRET, como as outras rotinas.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const { data, error } = await admin.from('fin_lancamentos')
    .select('workspace_id,valor,vencimento')
    .eq('tipo', 'despesa').is('pago_em', null).in('aprovacao', ['nao_exige', 'aprovada'])
    .lte('vencimento', somarDias(hoje, 3)).limit(20000)
  if (error) return Response.json({ erro: 'Falha ao ler as contas.' }, { status: 500 })

  const porEspaco = new Map<string, { valor: number; vencimento: string }[]>()
  for (const l of data ?? []) porEspaco.set(l.workspace_id as string, [...(porEspaco.get(l.workspace_id as string) ?? []), { valor: Number(l.valor), vencimento: l.vencimento as string }])

  let avisados = 0
  for (const [workspaceId, contas] of porEspaco) {
    const aviso = avisoDeVencimentos(contas, hoje)
    if (!aviso) continue
    const [{ data: admins }, { data: acessos }] = await Promise.all([
      admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin'),
      admin.from('fin_acesso').select('user_id').eq('workspace_id', workspaceId).in('nivel', ['lancar', 'aprovar', 'gestao']),
    ])
    const para = [...new Set([...(admins ?? []), ...(acessos ?? [])].map((x) => x.user_id as string))]
    await notificar(admin, { workspaceId, para, atorId: null, categoria: 'financeiro', titulo: aviso.titulo, mensagem: aviso.mensagem, link: '/financeiro', botao: 'Ver as contas' })
    avisados += para.length
  }
  // Dia 5: lembra a gestão de fechar o mês passado, se ainda estiver aberto.
  let lembretes = 0
  if (hoje.slice(8, 10) === '05') {
    const fimDoMesPassado = somarDias(`${hoje.slice(0, 7)}-01`, -1)
    const { data: configs } = await admin.from('fin_config').select('workspace_id,fechado_ate')
    const { data: comMovimento } = await admin.from('fin_lancamentos').select('workspace_id').lte('pago_em', fimDoMesPassado).limit(1000)
    const ativos = new Set((comMovimento ?? []).map((x) => x.workspace_id as string))
    for (const c of configs ?? []) {
      if (!ativos.has(c.workspace_id as string) || (c.fechado_ate && c.fechado_ate >= fimDoMesPassado)) continue
      const [{ data: admins }, { data: gestao }] = await Promise.all([
        admin.from('workspace_members').select('user_id').eq('workspace_id', c.workspace_id).eq('role', 'admin'),
        admin.from('fin_acesso').select('user_id').eq('workspace_id', c.workspace_id).eq('nivel', 'gestao'),
      ])
      const para = [...new Set([...(admins ?? []), ...(gestao ?? [])].map((x) => x.user_id as string))]
      await notificar(admin, {
        workspaceId: c.workspace_id as string, para, atorId: null, categoria: 'financeiro', titulo: 'Fechamento do mês pendente',
        mensagem: `${fimDoMesPassado.slice(5, 7)}/${fimDoMesPassado.slice(0, 4)} ainda não foi fechado no Financeiro.`, link: '/financeiro/fechamento', botao: 'Ir ao fechamento',
      })
      lembretes++
    }
  }
  return Response.json({ ok: true, espacos: porEspaco.size, avisados, lembretes })
}
