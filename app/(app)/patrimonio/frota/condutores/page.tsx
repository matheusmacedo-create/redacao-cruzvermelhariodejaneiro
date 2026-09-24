import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { CondutorDialog, type CondutorCadastrado } from '@/components/app/patrimonio/frota'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { situacaoDoVencimento } from '@/lib/patrimonio/frota'

export const metadata = { title: 'Condutores' }
export const dynamic = 'force-dynamic'

const dataBr = (d: string) => d.split('-').reverse().join('/')

/** Quem pode dirigir os veículos da filial: CNH, categoria e curso de veículo de emergência, com vencimentos. */
export default async function CondutoresPage() {
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const [{ data: condutores }, { data: membros }, { data: viagens }] = await Promise.all([
    supabase.from('frota_condutores').select('id,user_id,participante_id,nome,cnh_numero,cnh_categoria,cnh_validade,emergencia_validade,telefone,ativo').eq('workspace_id', ws).order('ativo', { ascending: false }).order('nome'),
    nivel >= 3 ? supabase.from('workspace_members').select('user_id,profiles(full_name,active)').eq('workspace_id', ws) : Promise.resolve({ data: [] }),
    supabase.from('frota_usos').select('condutor_id,km_saida,km_retorno').eq('workspace_id', ws).not('retorno_em', 'is', null).limit(50000),
  ])
  // Voluntários ativos só pelo nome (quem gere a frota pode não ter acesso ao Voluntariado).
  const { data: voluntarios } = nivel >= 3
    ? await createAdminClient().from('participantes').select('id,nome,nome_social').eq('workspace_id', ws).eq('situacao', 'ativo').is('anonimizado_em', null).order('nome').limit(5000)
    : { data: [] }
  const perfil = (m: { profiles: unknown }) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; active?: boolean } | null
  const equipe = (membros ?? []).filter((m) => perfil(m)?.active !== false).map((m) => ({ id: m.user_id as string, nome: perfil(m)?.full_name ?? 'Alguém' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const vols = (voluntarios ?? []).map((v) => ({ id: v.id as string, nome: (v.nome_social || v.nome) as string }))
  const rodado = new Map<string, number>()
  for (const u of viagens ?? []) rodado.set(u.condutor_id as string, (rodado.get(u.condutor_id as string) ?? 0) + Number(u.km_retorno) - Number(u.km_saida))
  const selo = (d: string | null, rotulo: string) => {
    if (!d) return <span className="text-muted-foreground">{rotulo}: —</span>
    const s = situacaoDoVencimento(d, hoje, 30)
    return <span className={s === 'vencido' ? 'font-medium text-destructive' : s === 'vencendo' ? 'font-medium text-warning-foreground' : ''}>{rotulo}: {s === 'vencido' ? 'venceu' : 'até'} {dataBr(d)}</span>
  }
  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/frota" nivel={nivel} />
      <PageHeader title="Condutores" description="Só sai com veículo quem está aqui, com CNH válida na categoria certa. Ambulância pede também o curso de condutor de veículo de emergência."
        actions={nivel >= 3 ? <CondutorDialog equipe={equipe} voluntarios={vols} /> : undefined} />
      <Card className="overflow-hidden p-0">
        {!(condutores ?? []).length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum condutor cadastrado.</p> : (
          <ul className="divide-y divide-border" id="condutores">
            {((condutores ?? []) as CondutorCadastrado[]).map((c) => (
              <li key={c.id} className={`flex items-start gap-3 px-5 py-3 ${c.ativo ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{c.nome} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">CNH {c.cnh_categoria}</span>{!c.ativo && <span className="ml-1 text-xs text-muted-foreground">(não dirige)</span>}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">{selo(c.cnh_validade, 'CNH')}{selo(c.emergencia_validade, 'Curso de emergência')}</p>
                  <p className="text-xs text-muted-foreground">{[c.user_id ? 'Equipe' : c.participante_id ? 'Voluntário' : null, c.telefone, rodado.get(c.id) ? `${rodado.get(c.id)!.toLocaleString('pt-BR')} km dirigidos` : null].filter(Boolean).join(' · ')}</p>
                </div>
                {nivel >= 3 && <CondutorDialog c={c} equipe={equipe} voluntarios={vols} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
