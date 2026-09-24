import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { QuadroDePautas, type CartaoDaPauta, type PessoaDoQuadro } from '@/components/app/pautas/quadro'
import type { Etiqueta } from '@/app/actions/quadro'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/pautas') }

export const dynamic = 'force-dynamic'

const TETO = 3000

type Contagem = { count: number }[] | null

/**
 * Pautas como quadro (estilo Trello): colunas por etapa, cartões arrastáveis,
 * checklist e edição rápida sem sair do quadro. A sala completa da pauta
 * continua em /pautas/[id].
 */
export default async function PautasPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  const workspaceId = context.workspace.id

  // A API do banco devolve até 1000 linhas por pedido.
  async function todasAsPautas() {
    const linhas = []
    for (let de = 0; de < TETO; de += 1000) {
      let q = supabase.from('pautas')
        .select('id,title,status,priority,coordination,due_date,data_inicio,owner_id,tags,project_id,posicao,created_at,projects(name),pauta_participants(user_id),pauta_checklist(feito),pauta_etiquetas(etiqueta_id),messages(count),pauta_links(count),content_pieces(count)')
        .eq('workspace_id', workspaceId).neq('status', 'archived')
        .order('created_at', { ascending: false }).order('id')
        .range(de, de + 999)
      if (projeto) q = q.eq('project_id', projeto)
      const { data } = await q
      linhas.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    return linhas
  }

  const [pautas, { data: project }, { data: membros }, { data: etiquetas }] = await Promise.all([
    todasAsPautas(),
    projeto ? supabase.from('projects').select('id,name').eq('id', projeto).eq('workspace_id', workspaceId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('workspace_members').select('user_id,profiles(full_name,initials,color,avatar_path,active)').eq('workspace_id', workspaceId),
    supabase.from('etiquetas').select('id,nome,cor').eq('workspace_id', workspaceId).order('nome'),
  ])

  const pessoas: PessoaDoQuadro[] = (membros ?? []).flatMap((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; initials?: string; color?: string; avatar_path?: string | null; active?: boolean } | null
    if (!p || p.active === false) return []
    return [{ id: m.user_id as string, nome: p.full_name || 'Colaborador', iniciais: p.initials || '?', cor: p.color || null, avatar: p.avatar_path ?? null }]
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const conta = (c: unknown) => (c as Contagem)?.[0]?.count ?? 0
  const cartoes: CartaoDaPauta[] = pautas.map((p) => {
    const proj = (Array.isArray(p.projects) ? p.projects[0] : p.projects) as { name?: string } | null
    const checklist = (p.pauta_checklist ?? []) as { feito: boolean }[]
    return {
      id: p.id,
      titulo: p.title,
      status: p.status,
      prioridade: p.priority,
      prazo: p.due_date,
      inicio: p.data_inicio,
      responsavelId: p.owner_id,
      participantes: ((p.pauta_participants ?? []) as { user_id: string }[]).map((x) => x.user_id),
      etiquetas: ((p.pauta_etiquetas ?? []) as { etiqueta_id: string }[]).map((x) => x.etiqueta_id),
      tipo: Array.isArray(p.tags) && p.tags[0] ? String(p.tags[0]) : '',
      coordenacao: p.coordination ?? '',
      projeto: proj?.name ?? '',
      posicao: p.posicao,
      criadaEm: p.created_at,
      checklist: { feitos: checklist.filter((i) => i.feito).length, total: checklist.length },
      mensagens: conta(p.messages),
      links: conta(p.pauta_links),
      conteudos: conta(p.content_pieces),
    }
  })

  return (
    <div>
      <PageHeader
        title={project ? `Pautas · ${project.name}` : 'Pautas'}
        description={project ? `Quadro do projeto ${project.name}.` : `Fluxo editorial do espaço ${context.workspace.name}. Arraste os cartões entre as etapas.`}
        actions={
          <div className="flex items-center gap-2">
            {project && <Button variant="outline" render={<Link href="/pautas" />}><X className="size-4" />Limpar filtro</Button>}
            <Button size="lg" render={<Link href={projeto ? `/registrar?projeto=${projeto}` : '/registrar'} />}><Plus className="size-4" />Nova pauta completa</Button>
          </div>
        }
      />
      <QuadroDePautas
        cartoes={cartoes}
        pessoas={pessoas}
        etiquetas={(etiquetas ?? []) as Etiqueta[]}
        eu={context.user.id}
        workspaceId={workspaceId}
        projetoId={projeto ?? null}
      />
    </div>
  )
}
