import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoFinanceiro } from '@/components/app/financeiro/secoes'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { Categorias, Contas, DadosDaEmpresa, Favorecidos, Fontes, NivelDeAcesso, Regras } from '@/components/app/financeiro/cadastros'
import { cadastrosDoFinanceiro, contextoDoFinanceiro, lerLinha } from '@/lib/financeiro/acesso'
import { NIVEIS, saldos, type Lancamento, type NomeDoNivel } from '@/lib/financeiro/regras'

export const metadata = { title: 'Cadastros do Financeiro' }
export const dynamic = 'force-dynamic'

const ABAS = [
  { id: 'empresa', rotulo: 'Empresa', ajuda: 'Os dados da empresa destes livros. A filial e a Escola têm CNPJ, contas, lançamentos e fechamento próprios; categorias e favorecidos são comuns.' },
  { id: 'contas', rotulo: 'Contas', ajuda: 'Bancos, aplicações e o caixa em dinheiro. O saldo de hoje sai do saldo inicial mais o que foi pago e recebido.' },
  { id: 'fontes', rotulo: 'Fontes de recurso', ajuda: 'De onde vem o dinheiro. "Com destino" é o que só pode ser gasto num convênio, termo de fomento ou doação carimbada — a norma das entidades sem fins lucrativos (ITG 2002) pede essa separação.' },
  { id: 'categorias', rotulo: 'Categorias', ajuda: 'Para que é cada despesa e de onde vem cada receita. O contador liga cada uma a uma conta do plano de contas dele.' },
  { id: 'favorecidos', rotulo: 'Favorecidos', ajuda: 'Fornecedores, prestadores, doadores e quem mais recebe ou paga.' },
  { id: 'regras', rotulo: 'Regras', ajuda: 'Aprovação de despesas (opcional) e reserva mínima do caixa.' },
  { id: 'acessos', rotulo: 'Quem acessa', ajuda: 'Só administradores mudam. Administradores têm acesso total.' },
] as const
type Aba = (typeof ABAS)[number]['id']

export default async function CadastrosDoFinanceiro({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoFinanceiro()
  if (nivel < 1) notFound()
  const ehAdmin = context.role === 'admin'
  const visiveis = ABAS.filter((a) => a.id !== 'acessos' || ehAdmin)
  const aba: Aba = visiveis.some((a) => a.id === sp.aba) ? sp.aba as Aba : 'contas'
  const c = await cadastrosDoFinanceiro()
  const gestao = nivel >= 4

  let saldosHoje: Record<string, number> = {}
  if (aba === 'contas') {
    const hoje = hojeEmSaoPaulo()
    const { data } = await supabase.from('fin_lancamentos').select('tipo,conta_id,conta_destino_id,valor,valor_pago,pago_em').eq('workspace_id', context.workspace.id).eq('entidade_id', c.empresa?.id ?? '').not('pago_em', 'is', null).lte('pago_em', hoje).limit(50000)
    saldosHoje = Object.fromEntries(saldos(c.contas, (data ?? []).map(lerLinha) as Lancamento[], hoje))
  }

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoFinanceiro atual="/financeiro/cadastros" empresas={c.empresas} empresa={c.empresa} />
      <PageHeader title="Cadastros do Financeiro" description={visiveis.find((a) => a.id === aba)?.ajuda} />
      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas">
        {visiveis.map((a) => (
          <Link key={a.id} href={`/financeiro/cadastros${a.id === 'contas' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
        ))}
      </nav>
      {!gestao && aba !== 'favorecidos' && aba !== 'acessos' && <p className="text-sm text-muted-foreground">Só a gestão do Financeiro muda estes cadastros.</p>}
      <Card className="p-5">
        {aba === 'empresa' && c.empresa && <DadosDaEmpresa empresa={c.empresa} pode={gestao} />}
        {aba === 'contas' && <Contas c={c} saldos={saldosHoje} pode={gestao} />}
        {aba === 'fontes' && <Fontes c={c} pode={gestao} />}
        {aba === 'categorias' && <Categorias c={c} pode={gestao} />}
        {aba === 'favorecidos' && <Favorecidos c={c} pode={nivel >= 2} />}
        {aba === 'regras' && <Regras config={c.config} pode={gestao} />}
        {aba === 'acessos' && ehAdmin && <Acessos workspaceId={context.workspace.id} />}
      </Card>
    </div>
  )
}

async function Acessos({ workspaceId }: { workspaceId: string }) {
  const { supabase } = await contextoDoFinanceiro()
  const [{ data: membros }, { data: acessos }] = await Promise.all([
    supabase.from('workspace_members').select('user_id,role,profiles(full_name,active)').eq('workspace_id', workspaceId),
    supabase.from('fin_acesso').select('user_id,nivel').eq('workspace_id', workspaceId),
  ])
  const nivelDe = new Map((acessos ?? []).map((a) => [a.user_id as string, a.nivel as NomeDoNivel]))
  const perfil = (m: { profiles: unknown }) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; active?: boolean } | null
  const pessoas = (membros ?? []).filter((m) => perfil(m)?.active !== false)
    .sort((a, b) => (perfil(a)?.full_name ?? '').localeCompare(perfil(b)?.full_name ?? '', 'pt-BR'))
  return (
    <div className="flex flex-col gap-4" id="acessos">
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {Object.values(NIVEIS).map((n) => <li key={n.rotulo}><span className="font-medium text-foreground">{n.rotulo}:</span> {n.descricao}</li>)}
      </ul>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {pessoas.map((m) => (
          <li key={m.user_id as string} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span>{perfil(m)?.full_name ?? 'Alguém'}</span>
            {m.role === 'admin' ? <span className="text-xs text-muted-foreground">Administrador: acesso total</span> : <NivelDeAcesso userId={m.user_id as string} nivel={nivelDe.get(m.user_id as string) ?? null} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
