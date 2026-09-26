import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Eye, EyeOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { TIPOS, quando, type Tipo } from '@/lib/oportunidades/regras'

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
  const { data: inscricoes } = ids.length ? await supabase.from('oportunidade_inscricoes').select('oportunidade_id,situacao').in('oportunidade_id', ids) : { data: [] }
  const contar = (id: string, s: string[]) => (inscricoes ?? []).filter((i) => i.oportunidade_id === id && s.includes(i.situacao as string)).length

  return (
    <div className="flex flex-col gap-6">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntariado</Link>
      <PageHeader title="Oportunidades" description="Ações, plantões e eventos para os voluntários se inscreverem pela Área do Voluntário. Presença confirmada vira horas no cadastro."
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
              <span className="block text-xs text-muted-foreground">{[TIPOS[o.tipo as Tipo]?.rotulo, quando(o.inicio as string, o.fim as string), o.local].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="flex items-center gap-3 text-xs">
              <span className="tabular-nums">{contar(o.id as string, ['inscrito', 'presente', 'ausente'])}{o.vagas ? `/${o.vagas}` : ''} inscritos{contar(o.id as string, ['espera']) ? ` · ${contar(o.id as string, ['espera'])} na espera` : ''}{aba === 'passadas' ? ` · ${contar(o.id as string, ['presente'])} presentes` : ''}</span>
              {o.cancelada_em ? <span className="text-destructive">Cancelada</span> : o.publicado ? <Eye className="size-4 text-success" aria-label="Publicada" /> : <EyeOff className="size-4 text-muted-foreground" aria-label="Rascunho" />}
            </span>
          </Link>
        ))}
        {!lista?.length && <p className="p-10 text-center text-sm text-muted-foreground">{aba === 'proximas' ? 'Nenhuma oportunidade marcada. Crie a próxima ação e publique para os voluntários.' : 'Nada por aqui ainda.'}</p>}
      </Card>
    </div>
  )
}
