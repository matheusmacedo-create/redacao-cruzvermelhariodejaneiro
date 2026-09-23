import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { progresso, situacaoDoProjeto } from '@/lib/projetos/cronograma'
import { Carteira, type ProjetoNaCarteira } from '@/components/app/projetos/carteira'
import { hojeEmSaoPaulo, type PessoaDoProjeto } from '@/components/app/projetos/comum'

export const dynamic = 'force-dynamic'

/** A carteira de projetos (modelo do Asana): situação, progresso, responsável, prazo e última atualização. */
export default async function ProjetosPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const [{ data: projects }, { data: membros }] = await Promise.all([
    supabase.from('projects')
      .select('id,name,status,situacao,situacao_em,inicio,fim,responsavel_id,created_by,created_at,pautas(status)')
      .eq('workspace_id', context.workspace.id)
      .order('created_at', { ascending: false }),
    supabase.from('workspace_members').select('user_id,profiles(full_name,initials,color,avatar_path,active)').eq('workspace_id', context.workspace.id),
  ])

  const pessoas: PessoaDoProjeto[] = (membros ?? []).flatMap((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; initials?: string; color?: string; avatar_path?: string | null; active?: boolean } | null
    if (!p || p.active === false) return []
    return [{ id: m.user_id as string, nome: p.full_name || 'Colaborador', iniciais: p.initials || '?', cor: p.color || null, avatar: p.avatar_path ?? null }]
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const projetos: ProjetoNaCarteira[] = (projects ?? []).map((p) => {
    const concluido = p.status === 'completed'
    return {
      id: p.id,
      nome: p.name,
      concluido,
      situacao: situacaoDoProjeto({ situacao: p.situacao, concluido }),
      progresso: progresso(((p.pautas ?? []) as { status: string }[]).map((x) => x.status)),
      responsavelId: p.responsavel_id ?? p.created_by,
      inicio: p.inicio,
      fim: p.fim,
      ultimaAtualizacao: p.situacao_em,
    }
  })

  return (
    <div>
      <PageHeader title="Projetos" description="Campanhas, eventos e iniciativas com começo, meio e fim — com situação, prazo e linha do tempo de cada um." />
      <Carteira projetos={projetos} pessoas={pessoas} hoje={hojeEmSaoPaulo()} />
    </div>
  )
}
