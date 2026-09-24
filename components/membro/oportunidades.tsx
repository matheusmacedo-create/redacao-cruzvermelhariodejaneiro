'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, CheckCircle2, Clock, Hourglass, Loader2, MapPin, Users, XCircle } from 'lucide-react'
import { cancelarInscricao, inscrever } from '@/app/actions/membro'
import { TIPOS, estado, quando, selo, vagasRestantes, type Tipo } from '@/lib/oportunidades/regras'
import type { OportunidadeDoMembro } from '@/lib/membro/oportunidades'
import { botaoDoMembro } from './marca'

function Acao({ o, aberta }: { o: OportunidadeDoMembro; aberta: boolean }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const rodar = (f: () => Promise<{ erro?: string }>) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) setErro(r.erro)
    else router.refresh()
  })
  const inscrito = o.minha === 'inscrito' || o.minha === 'espera'
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      {inscrito ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/membro/oportunidades/${o.id}/agenda`} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"><CalendarPlus className="size-4" />Agenda</a>
          <button type="button" disabled={ocupado} onClick={() => { if (confirm('Cancelar sua inscrição? A vaga vai para a próxima pessoa.')) rodar(() => cancelarInscricao(o.id)) }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-red-700">{ocupado ? <Loader2 className="size-4 animate-spin" /> : 'Cancelar inscrição'}</button>
        </div>
      ) : (
        <button type="button" disabled={ocupado} onClick={() => rodar(() => inscrever(o.id))} className={botaoDoMembro}>
          {ocupado && <Loader2 className="size-4 animate-spin" />}{aberta ? 'Quero participar' : 'Entrar na lista de espera'}
        </button>
      )}
      {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
    </div>
  )
}

const MINHA: Record<string, { texto: string; classe: string; icone: typeof CheckCircle2 }> = {
  inscrito: { texto: 'Você está inscrito', classe: 'bg-emerald-50 text-emerald-800', icone: CheckCircle2 },
  espera: { texto: 'Você está na lista de espera', classe: 'bg-amber-50 text-amber-900', icone: Hourglass },
  presente: { texto: 'Presença confirmada', classe: 'bg-emerald-50 text-emerald-800', icone: CheckCircle2 },
  ausente: { texto: 'Ausência registrada', classe: 'bg-neutral-100 text-neutral-600', icone: XCircle },
}

/** O cartão de uma oportunidade: data em destaque, o essencial e a ação. */
export function CartaoDeOportunidade({ o, agora }: { o: OportunidadeDoMembro; agora: string }) {
  const e = estado(o, o.ocupadas, new Date(agora))
  const s = selo(o.inicio)
  const restantes = vagasRestantes(o.vagas, o.ocupadas)
  const minha = o.minha ? MINHA[o.minha] : null
  return (
    <article className={`flex gap-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 ${e === 'cancelada' ? 'opacity-70' : ''}`} data-oportunidade={o.id}>
      <div className="flex w-14 shrink-0 flex-col items-center self-start rounded-xl bg-neutral-900 py-2 text-white" aria-hidden="true">
        <span className="text-xl font-bold leading-none">{s.dia}</span><span className="text-[11px] font-semibold tracking-wide text-neutral-300">{s.mes}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[#e32219]">{TIPOS[o.tipo as Tipo]?.rotulo ?? o.tipo}</p>
          <h3 className={`font-semibold ${e === 'cancelada' ? 'line-through' : ''}`}>{o.titulo}</h3>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
            <span className="flex items-center gap-1"><Clock className="size-3.5" />{quando(o.inicio, o.fim)}</span>
            {o.local && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{o.local}</span>}
            {e !== 'passada' && e !== 'cancelada' && <span className="flex items-center gap-1"><Users className="size-3.5" />{restantes === null ? 'Vagas livres' : restantes === 0 ? 'Vagas preenchidas' : `${restantes} ${restantes === 1 ? 'vaga' : 'vagas'}`}</span>}
          </p>
          {o.descricao && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-neutral-700">{o.descricao}</p>}
          {e === 'cancelada' && <p className="mt-2 text-sm text-red-700">Cancelada{o.motivo_cancelamento ? `: ${o.motivo_cancelamento}` : '.'}</p>}
          {e === 'encerrada' && !o.minha && <p className="mt-2 text-xs text-neutral-500">Inscrições encerradas.</p>}
          {minha && e !== 'cancelada' && <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${minha.classe}`}><minha.icone className="size-3.5" />{minha.texto}</p>}
        </div>
        {(e === 'aberta' || e === 'lotada') && <Acao o={o} aberta={e === 'aberta'} />}
      </div>
    </article>
  )
}
