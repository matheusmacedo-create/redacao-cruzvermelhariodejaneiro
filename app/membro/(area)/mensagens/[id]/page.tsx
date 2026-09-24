import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { conversaDoMembro } from '@/lib/membro/canal'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATEGORIAS_DA_CONVERSA, SITUACOES_DA_CONVERSA } from '@/lib/canal/regras'
import { Responder } from '@/components/membro/canal'

export const dynamic = 'force-dynamic'

const QUANDO = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

export default async function Conversa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await exigirMembro()
  const d = await conversaDoMembro(m, id)
  if (!d) notFound()
  // Abrir a conversa conta como leitura da resposta.
  if (d.conversa.situacao === 'respondida' && !d.conversa.lida_pelo_membro_em) {
    await createAdminClient().rpc('membro_ler_conversa', { p_participante_id: m.participanteId, p_conversa_id: id })
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/membro/mensagens" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ChevronLeft className="size-4" />Mensagens</Link>
      <div>
        <h1 className="text-xl font-bold tracking-tight">{d.conversa.assunto}</h1>
        <p className="text-xs text-neutral-500">{CATEGORIAS_DA_CONVERSA[d.conversa.categoria as keyof typeof CATEGORIAS_DA_CONVERSA]} · {SITUACOES_DA_CONVERSA[d.conversa.situacao as keyof typeof SITUACOES_DA_CONVERSA]}</p>
      </div>
      <ol className="flex flex-col gap-3" id="mensagens">
        {d.mensagens.map((x) => (
          <li key={x.id} className={`flex flex-col ${x.autor === 'membro' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${x.autor === 'membro' ? 'rounded-br-md bg-neutral-900 text-white' : 'rounded-bl-md border border-neutral-200 bg-white'}`}>{x.texto}</div>
            <span className="mt-1 px-1 text-[11px] text-neutral-500">{x.autor === 'membro' ? 'Você' : `${x.nome ?? 'Coordenação'} · Cruz Vermelha RJ`} · {QUANDO(x.created_at)}</span>
          </li>
        ))}
      </ol>
      <Responder conversaId={id} encerrada={d.conversa.situacao === 'encerrada'} />
    </div>
  )
}
