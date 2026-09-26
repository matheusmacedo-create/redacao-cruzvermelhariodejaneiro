import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { CATEGORIAS_DA_CONVERSA, SITUACOES_DA_CONVERSA } from '@/lib/canal/regras'
import { ResponderMembro, SituacaoDaConversa } from '@/components/app/canal/acoes'

export const dynamic = 'force-dynamic'

const QUANDO = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

export default async function ConversaComVoluntario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) notFound()
  const [{ data: c }, { data: mensagens }] = await Promise.all([
    supabase.from('membro_conversas').select('id,assunto,categoria,situacao,lida_pela_equipe_em,participante_id,participantes(nome,nome_social,email,telefone)').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('membro_mensagens').select('id,autor,texto,created_at,profiles:autor_user_id(full_name)').eq('conversa_id', id).order('created_at'),
  ])
  if (!c) notFound()
  if (c.situacao === 'aberta' && !c.lida_pela_equipe_em) await supabase.rpc('equipe_marcar_conversa', { p_conversa_id: id, p_acao: 'lida' })
  const p = (Array.isArray(c.participantes) ? c.participantes[0] : c.participantes) as { nome: string; nome_social: string | null; email: string | null; telefone: string | null } | null
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/voluntariado/mensagens" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Mensagens dos voluntários</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div data-ajuda="canal-voluntarios.cabecalho">
          <h1 className="text-xl font-bold tracking-tight">{c.assunto}</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/voluntariado/${c.participante_id}`} className="font-medium text-foreground hover:underline">{p?.nome_social || p?.nome}</Link>
            {[p?.email, p?.telefone, CATEGORIAS_DA_CONVERSA[c.categoria as keyof typeof CATEGORIAS_DA_CONVERSA], SITUACOES_DA_CONVERSA[c.situacao as keyof typeof SITUACOES_DA_CONVERSA]].filter(Boolean).map((x) => ` · ${x}`).join('')}
          </p>
        </div>
        <SituacaoDaConversa conversaId={id} situacao={c.situacao} />
      </div>
      <ol className="flex flex-col gap-3" data-ajuda="canal-voluntarios.conversa">
        {(mensagens ?? []).map((m) => {
          const autor = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string } | null
          const equipe = m.autor === 'equipe'
          return (
            <li key={m.id} className={`flex flex-col ${equipe ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${equipe ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card'}`}>{m.texto}</div>
              <span className="mt-1 px-1 text-[11px] text-muted-foreground">{equipe ? autor?.full_name ?? 'Equipe' : p?.nome_social || p?.nome} · {QUANDO(m.created_at as string)}</span>
            </li>
          )
        })}
      </ol>
      <Card className="p-4" data-ajuda="canal-voluntarios.responder"><ResponderMembro conversaId={id} /></Card>
    </div>
  )
}
