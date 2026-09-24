import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { CATEGORIAS_DA_CONVERSA, SITUACOES_DA_CONVERSA, haQuanto, novaParaAEquipe } from '@/lib/canal/regras'

export const dynamic = 'force-dynamic'

/** A caixa de entrada do canal direto: o que espera resposta primeiro. */
export default async function MensagensDosVoluntarios({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba: pedida } = await searchParams
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) notFound()
  const aba = pedida === 'respondidas' ? 'respondida' : pedida === 'encerradas' ? 'encerrada' : 'aberta'
  const [{ data: conversas }, { data: contagem }] = await Promise.all([
    supabase.from('membro_conversas').select('id,assunto,categoria,situacao,atualizada_em,lida_pelo_membro_em,lida_pela_equipe_em,participante_id,participantes(nome,nome_social)')
      .eq('workspace_id', context.workspace.id).eq('situacao', aba).order('atualizada_em', { ascending: aba === 'aberta' }).limit(300),
    supabase.from('membro_conversas').select('situacao').eq('workspace_id', context.workspace.id).limit(5000),
  ])
  const n = (s: string) => (contagem ?? []).filter((c) => c.situacao === s).length
  const agora = new Date()
  const abas = [['aberta', '', `Aguardando resposta (${n('aberta')})`], ['respondida', '?aba=respondidas', `Respondidas (${n('respondida')})`], ['encerrada', '?aba=encerradas', `Encerradas (${n('encerrada')})`]]
  return (
    <div className="flex flex-col gap-6">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntariado</Link>
      <PageHeader title="Mensagens dos voluntários" description="O canal direto da Área do Voluntário. Quem gerencia o Voluntariado é avisado no sino a cada mensagem nova; o voluntário recebe a resposta por e-mail." />
      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas">
        {abas.map(([id, q, r]) => (
          <Link key={id} href={`/voluntariado/mensagens${q}`} aria-current={aba === id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{r}</Link>
        ))}
      </nav>
      <Card className="divide-y divide-border p-0">
        {(conversas ?? []).map((c) => {
          const p = (Array.isArray(c.participantes) ? c.participantes[0] : c.participantes) as { nome: string; nome_social: string | null } | null
          const nova = novaParaAEquipe(c as { situacao: string; lida_pelo_membro_em: string | null; lida_pela_equipe_em: string | null })
          return (
            <Link key={c.id} href={`/voluntariado/mensagens/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
              <span className={`size-2 shrink-0 rounded-full ${nova ? 'bg-primary' : 'bg-transparent'}`} aria-label={nova ? 'Não lida' : undefined} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${nova ? 'font-semibold' : 'font-medium'}`}>{c.assunto}</span>
                <span className="block text-xs text-muted-foreground">{p?.nome_social || p?.nome} · {CATEGORIAS_DA_CONVERSA[c.categoria as keyof typeof CATEGORIAS_DA_CONVERSA]}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{haQuanto(c.atualizada_em as string, agora)}</span>
            </Link>
          )
        })}
        {!conversas?.length && <p className="p-10 text-center text-sm text-muted-foreground">{aba === 'aberta' ? 'Nada esperando resposta.' : `Nenhuma conversa ${SITUACOES_DA_CONVERSA[aba].toLowerCase()}.`}</p>}
      </Card>
    </div>
  )
}
