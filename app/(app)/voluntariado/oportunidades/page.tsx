import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Eye, EyeOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { TIPOS, ehDeResposta, quando, type Tipo } from '@/lib/oportunidades/regras'
import { todasAsLinhas } from '@/lib/supabase/paginar'

export const dynamic = 'force-dynamic'

export default async function OportunidadesDaEquipe({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba: pedida } = await searchParams
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 1) notFound()
  const agora = new Date().toISOString()
  const aba = pedida === 'passadas' ? 'passadas' : 'proximas'
  let q = supabase.from('oportunidades').select('id,titulo,tipo,local,inicio,fim,vagas,publicado,cancelada_em').eq('workspace_id', context.workspace.id)
  q = aba === 'proximas' ? q.gte('fim', agora).order('inicio') : q.lt('fim', agora).order('inicio', { ascending: false })
  const { data: lista } = await q.limit(300)
  const ids = (lista ?? []).map((o) => o.id as string)
  // Paginado: a API devolve no máximo 1000 linhas por pedido (ARQUITETURA §10.8).
  const [{ data: inscricoes }, { data: respostas }] = ids.length ? await Promise.all([
    todasAsLinhas((de, ate) => supabase.from('oportunidade_inscricoes').select('oportunidade_id,situacao').in('oportunidade_id', ids).order('id').range(de, ate)),
    todasAsLinhas((de, ate) => supabase.from('oportunidade_respostas').select('oportunidade_id').in('oportunidade_id', ids).order('id').range(de, ate)),
  ]) : [{ data: [] }, { data: [] }]
  const contar = (id: string, s: string[]) => (inscricoes ?? []).filter((i) => i.oportunidade_id === id && s.includes(i.situacao as string)).length
  const responderam = (id: string) => (respostas ?? []).filter((r) => r.oportunidade_id === id).length
  const prazo = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  return (
    <div className="flex flex-col gap-6">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntariado</Link>
      <PageHeader title="Oportunidades" description="Ações, plantões e eventos para os voluntários se inscreverem, e avisos, enquetes e quizzes para responderem, pela Área do Voluntário. Presença confirmada vira horas no cadastro."
        actions={nivel >= 2 ? <Button render={<Link href="/voluntariado/oportunidades/nova" />} data-ajuda="voluntarios.nova-oportunidade"><Plus className="size-4" />Nova oportunidade</Button> : undefined} />
      <nav className="flex gap-1 border-b border-border" aria-label="Abas" data-ajuda="voluntarios.oportunidades-abas">
        {[['proximas', 'Próximas'], ['passadas', 'Passadas']].map(([id, r]) => (
          <Link key={id} href={`/voluntariado/oportunidades${id === 'proximas' ? '' : '?aba=passadas'}`} aria-current={aba === id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{r}</Link>
        ))}
      </nav>
      <Card className="divide-y divide-border p-0" data-ajuda="voluntarios.oportunidades-lista">
        {(lista ?? []).map((o) => (
          <Link key={o.id} href={`/voluntariado/oportunidades/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30">
            <span className="min-w-0">
              <span className={`block font-medium ${o.cancelada_em ? 'line-through' : ''}`}>{o.titulo}</span>
              <span className="block text-xs text-muted-foreground">{ehDeResposta(o.tipo as string)
                ? [TIPOS[o.tipo as Tipo]?.rotulo, `prazo ${prazo(o.fim as string)}`].join(' · ')
                : [TIPOS[o.tipo as Tipo]?.rotulo, quando(o.inicio as string, o.fim as string), o.local].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="flex items-center gap-3 text-xs">
              {ehDeResposta(o.tipo as string)
                ? <span className="tabular-nums">{responderam(o.id as string)} {o.tipo === 'aviso' ? 'confirmaram' : 'responderam'}</span>
                : <span className="tabular-nums">{contar(o.id as string, ['inscrito', 'presente', 'ausente'])}{o.vagas ? `/${o.vagas}` : ''} inscritos{contar(o.id as string, ['espera']) ? ` · ${contar(o.id as string, ['espera'])} na espera` : ''}{aba === 'passadas' ? ` · ${contar(o.id as string, ['presente'])} presentes` : ''}</span>}
              {o.cancelada_em ? <span className="text-destructive">Cancelada</span> : o.publicado ? <Eye className="size-4 text-success" aria-label="Publicada" /> : <EyeOff className="size-4 text-muted-foreground" aria-label="Rascunho" />}
            </span>
          </Link>
        ))}
        {!lista?.length && <p className="p-10 text-center text-sm text-muted-foreground">{aba === 'proximas' ? 'Nenhuma oportunidade marcada. Crie a próxima ação e publique para os voluntários.' : 'Nada por aqui ainda.'}</p>}
      </Card>
    </div>
  )
}
