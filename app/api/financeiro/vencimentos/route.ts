import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { avisoDeVencimentos, somarDias } from '@/lib/financeiro/avisos'
import { rotinaDasCotacoes } from '@/lib/compras/convites-servidor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rotina diária (vercel.json, 8h de Brasília): avisa no sino — e por e-mail,
 * conforme a preferência de cada um no assunto "Financeiro" — quem lança no
 * Financeiro das contas que vencem hoje, das atrasadas e das que vencem
 * nos próximos três dias. Despesa esperando aprovação ou recusada fica de fora: não dá para
 * pagar. Também roda a rotina das cotações de Compras (lembrete da véspera e
 * prazo encerrado). Protegida por CRON_SECRET, como as outras rotinas.
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
    .select('workspace_id,entidade_id,valor,vencimento')
    .eq('tipo', 'despesa').is('pago_em', null).in('aprovacao', ['nao_exige', 'aprovada'])
    .lte('vencimento', somarDias(hoje, 3)).limit(20000)
  if (error) return Response.json({ erro: 'Falha ao ler as contas.' }, { status: 500 })

  // Cada empresa (a filial e a Escola) avisa quem cuida dos livros dela: admins e quem tem acesso a ela ou a todas.
  const { data: empresas } = await admin.from('fin_entidades').select('id,workspace_id,nome,principal,fechado_ate').eq('ativa', true)
  const empresaDe = new Map((empresas ?? []).map((e) => [e.id as string, e]))
  const quemCuida = async (workspaceId: string, empresaId: string, niveis: string[]) => {
    const [{ data: admins }, { data: acessos }] = await Promise.all([
      admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin'),
      admin.from('fin_acesso').select('user_id').eq('workspace_id', workspaceId).in('nivel', niveis).or(`entidade_id.is.null,entidade_id.eq.${empresaId}`),
    ])
    return [...new Set([...(admins ?? []), ...(acessos ?? [])].map((x) => x.user_id as string))]
  }
  const comOutras = new Set((empresas ?? []).filter((e) => !e.principal).map((e) => e.workspace_id as string))
  const doLivro = (e: { nome: unknown; principal: unknown; workspace_id: unknown }) => (comOutras.has(e.workspace_id as string) ? ` (${e.nome as string})` : '')

  const porEmpresa = new Map<string, { valor: number; vencimento: string }[]>()
  for (const l of data ?? []) porEmpresa.set(l.entidade_id as string, [...(porEmpresa.get(l.entidade_id as string) ?? []), { valor: Number(l.valor), vencimento: l.vencimento as string }])

  let avisados = 0
  for (const [empresaId, contas] of porEmpresa) {
    const e = empresaDe.get(empresaId)
    const aviso = e && avisoDeVencimentos(contas, hoje)
    if (!e || !aviso) continue
    const workspaceId = e.workspace_id as string
    const para = await quemCuida(workspaceId, empresaId, ['lancar', 'aprovar', 'gestao'])
    await notificar(admin, { workspaceId, para, atorId: null, categoria: 'financeiro', titulo: `${aviso.titulo}${doLivro(e)}`, mensagem: aviso.mensagem, link: e.principal ? '/financeiro' : '/escola/financeiro', botao: 'Ver as contas' })
    avisados += para.length
  }
  // Dia 5: lembra a gestão de fechar o mês passado, se ainda estiver aberto.
  let lembretes = 0
  if (hoje.slice(8, 10) === '05') {
    const fimDoMesPassado = somarDias(`${hoje.slice(0, 7)}-01`, -1)
    // Cada empresa (a filial e a Escola) fecha o seu mês: lembra das que têm movimento e estão abertas.
    const { data: comMovimento } = await admin.from('fin_lancamentos').select('entidade_id').lte('pago_em', fimDoMesPassado).limit(5000)
    const ativas = new Set((comMovimento ?? []).map((x) => x.entidade_id as string))
    for (const c of empresas ?? []) {
      if (!ativas.has(c.id as string) || (c.fechado_ate && c.fechado_ate >= fimDoMesPassado)) continue
      const para = await quemCuida(c.workspace_id as string, c.id as string, ['gestao'])
      const deQuem = doLivro(c)
      await notificar(admin, {
        workspaceId: c.workspace_id as string, para, atorId: null, categoria: 'financeiro', titulo: `Fechamento do mês pendente${deQuem}`,
        mensagem: `${fimDoMesPassado.slice(5, 7)}/${fimDoMesPassado.slice(0, 4)} ainda não foi fechado no Financeiro${deQuem}.`, link: c.principal ? '/financeiro/fechamento' : '/escola/financeiro', botao: 'Ir ao fechamento',
      })
      lembretes++
    }
  }
  // Compras: lembrete da véspera aos fornecedores e aviso do prazo encerrado (docs/compras-cotacao-automatica.md).
  // Sem a migração dos convites, só não faz nada.
  const cotacoes = await rotinaDasCotacoes(admin).catch((causa) => {
    console.error('[compras] rotina das cotações:', causa instanceof Error ? causa.message : causa)
    return null
  })
  return Response.json({ ok: true, empresas: porEmpresa.size, avisados, lembretes, cotacoes })
}
