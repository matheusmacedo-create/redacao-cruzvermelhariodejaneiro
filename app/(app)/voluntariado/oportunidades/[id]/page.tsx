import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { SITUACOES_DA_INSCRICAO, TIPOS, horasDaAtividade, quando, type Tipo } from '@/lib/oportunidades/regras'
import { FormularioDeOportunidade } from '@/components/app/oportunidades/formulario'
import { Presenca, PublicacaoDaOportunidade } from '@/components/app/oportunidades/acoes'

export const dynamic = 'force-dynamic'

export default async function Oportunidade({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 1) notFound()
  const [{ data: o }, { data: inscricoes }] = await Promise.all([
    supabase.from('oportunidades').select('id,titulo,tipo,descricao,local,inicio,fim,vagas,inscricoes_ate,horas,publicado,cancelada_em,motivo_cancelamento').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('oportunidade_inscricoes').select('id,situacao,created_at,participante_id,participantes(nome,nome_social,telefone,email)').eq('oportunidade_id', id).order('created_at'),
  ])
  if (!o) notFound()
  const agora = new Date().toISOString()
  const liberada = o.inicio <= agora
  const horas = horasDaAtividade({ inicio: o.inicio, fim: o.fim, horas: o.horas === null ? null : Number(o.horas) })
  const ordem = ['presente', 'inscrito', 'ausente', 'espera', 'cancelado']
  const lista = [...(inscricoes ?? [])].sort((a, b) => ordem.indexOf(a.situacao as string) - ordem.indexOf(b.situacao as string))
  const ativos = lista.filter((i) => ['inscrito', 'presente', 'ausente'].includes(i.situacao as string)).length
  const pessoa = (i: (typeof lista)[number]) => (Array.isArray(i.participantes) ? i.participantes[0] : i.participantes) as { nome: string; nome_social: string | null; telefone: string | null; email: string | null } | null

  return (
    <div className="flex flex-col gap-5">
      <Link href="/voluntariado/oportunidades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Oportunidades</Link>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{TIPOS[o.tipo as Tipo]?.rotulo}</p>
        <h1 className={`text-2xl font-bold tracking-tight ${o.cancelada_em ? 'line-through' : ''}`}>{o.titulo}</h1>
        <p className="text-sm text-muted-foreground">{[quando(o.inicio, o.fim), o.local, `${ativos}${o.vagas ? `/${o.vagas}` : ''} inscritos`].filter(Boolean).join(' · ')}</p>
        {o.cancelada_em && <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Cancelada: {o.motivo_cancelamento}</p>}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0" id="inscritos" data-ajuda="voluntarios.inscritos">
          <p className="border-b border-border px-4 py-3 text-sm font-semibold">Inscritos</p>
          <ul className="divide-y divide-border">
            {lista.map((i) => {
              const p = pessoa(i)
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <Link href={`/voluntariado/${i.participante_id}`} className="font-medium hover:underline">{p?.nome_social || p?.nome || 'Voluntário'}</Link>
                    <span className="block text-xs text-muted-foreground">{[SITUACOES_DA_INSCRICAO[i.situacao as keyof typeof SITUACOES_DA_INSCRICAO], p?.telefone, p?.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  {nivel >= 2 && !o.cancelada_em && ['inscrito', 'presente', 'ausente'].includes(i.situacao as string) && (
                    <Presenca oportunidadeId={id} inscricaoId={i.id as string} situacao={i.situacao as string} horasPadrao={horas} liberada={liberada} />
                  )}
                </li>
              )
            })}
            {!lista.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{o.publicado ? 'Ninguém se inscreveu ainda.' : 'Publique para os voluntários poderem se inscrever.'}</li>}
          </ul>
        </Card>
        {nivel >= 2 && (
          <div className="flex flex-col gap-5">
            <Card className="p-5"><PublicacaoDaOportunidade id={id} publicado={o.publicado} cancelada={Boolean(o.cancelada_em)} temInscritos={lista.length > 0} /></Card>
            {!o.cancelada_em && <Card className="p-5"><FormularioDeOportunidade o={{ ...o, vagas: o.vagas as number | null, horas: o.horas === null ? null : Number(o.horas) }} /></Card>}
          </div>
        )}
      </div>
    </div>
  )
}
