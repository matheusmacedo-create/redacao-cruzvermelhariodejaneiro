import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { Categorias, CategoriasDoEstoque, Locais, Numeracao } from '@/components/app/patrimonio/cadastros'
import { NivelDeAcesso } from '@/components/app/patrimonio/acoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { NIVEIS, type NomeDoNivel } from '@/lib/patrimonio/regras'

export const metadata = { title: 'Cadastros do Patrimônio' }
export const dynamic = 'force-dynamic'

const ABAS = [
  { id: 'categorias', rotulo: 'Categorias de bens', ajuda: 'Tipos de bem, com vida útil (depreciação), valor residual, manutenção periódica e conta contábil.' },
  { id: 'estoque', rotulo: 'Categorias do estoque', ajuda: 'Tipos de material de consumo (curativos, EPI, alimentos, kits), com a conta contábil do estoque.' },
  { id: 'locais', rotulo: 'Locais', ajuda: 'Onde os bens e os materiais ficam: sede, bases, almoxarifado, viaturas.' },
  { id: 'numeracao', rotulo: 'Plaqueta e termo', ajuda: 'O prefixo das plaquetas e o texto do termo de responsabilidade.' },
  { id: 'acessos', rotulo: 'Quem acessa', ajuda: 'Só administradores mudam. Qualquer pessoa vê em "Comigo" o que está com ela.' },
] as const

export default async function CadastrosDoPatrimonio({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ehAdmin = context.role === 'admin'
  const visiveis = ABAS.filter((a) => a.id !== 'acessos' || ehAdmin)
  const aba = visiveis.find((a) => a.id === sp.aba)?.id ?? 'categorias'
  const c = await cadastrosDoPatrimonio()
  const gestao = nivel >= 3
  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/cadastros" nivel={nivel} />
      <PageHeader title="Cadastros do Patrimônio" description={visiveis.find((a) => a.id === aba)?.ajuda} />
      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas">
        {visiveis.map((a) => (
          <Link key={a.id} href={`/patrimonio/cadastros${a.id === 'categorias' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
        ))}
      </nav>
      <Card className="p-5">
        {aba === 'categorias' && <Categorias c={c} pode={gestao} />}
        {aba === 'estoque' && <CategoriasDoEstoque c={c} pode={gestao} />}
        {aba === 'locais' && <Locais c={c} pode={gestao} />}
        {aba === 'numeracao' && <Numeracao c={c} pode={gestao} />}
        {aba === 'acessos' && ehAdmin && <Acessos workspaceId={context.workspace.id} supabase={supabase} />}
      </Card>
    </div>
  )
}

async function Acessos({ workspaceId, supabase }: { workspaceId: string; supabase: Awaited<ReturnType<typeof contextoDoPatrimonio>>['supabase'] }) {
  const [{ data: membros }, { data: acessos }] = await Promise.all([
    supabase.from('workspace_members').select('user_id,role,profiles(full_name,active)').eq('workspace_id', workspaceId),
    supabase.from('pat_acesso').select('user_id,nivel').eq('workspace_id', workspaceId),
  ])
  const nivelDe = new Map((acessos ?? []).map((a) => [a.user_id as string, a.nivel as NomeDoNivel]))
  const perfil = (m: { profiles: unknown }) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; active?: boolean } | null
  const pessoas = (membros ?? []).filter((m) => perfil(m)?.active !== false).sort((a, b) => (perfil(a)?.full_name ?? '').localeCompare(perfil(b)?.full_name ?? '', 'pt-BR'))
  return (
    <div className="flex flex-col gap-4" id="acessos">
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">{Object.values(NIVEIS).map((n) => <li key={n.rotulo}><span className="font-medium text-foreground">{n.rotulo}:</span> {n.descricao}</li>)}</ul>
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
