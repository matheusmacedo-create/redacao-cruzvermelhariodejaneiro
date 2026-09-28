'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpFromLine, Clock, Hourglass, Loader2, MessageCircle, MessageSquareReply, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { responderVisita } from '@/app/actions/portaria'
import { RESPOSTAS, type RespostaDaVisita } from '@/lib/portaria/regras'
import { cn } from '@/lib/utils'

const ICONES: Record<RespostaDaVisita, typeof Clock> = { subir: ArrowUpFromLine, aguardar: Hourglass, recusar: XCircle }
const TOM: Record<RespostaDaVisita, string> = {
  subir: 'border-success/40 bg-success/10 text-emerald-800',
  aguardar: 'border-warning/60 bg-warning/15 text-warning-foreground',
  recusar: 'border-destructive/40 bg-destructive/10 text-destructive',
}

/** A situação da resposta, ao lado do visitante: esperando, pode subir, aguarde ou não pode agora. */
export function SeloDaResposta({ resposta, quem, recado, quando, pelo }: {
  resposta: RespostaDaVisita | null
  /** Quem é visitado (o nome), para "Esperando a resposta de…". */
  quem: string | null
  recado?: string | null
  quando?: string | null
  pelo?: 'palacio' | 'whatsapp' | null
}) {
  if (!resposta) {
    return (
      <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground" data-resposta="esperando">
        <Clock className="size-3.5" aria-hidden="true" />Esperando a resposta de {quem ?? 'quem é visitado'}
      </p>
    )
  }
  const Icone = ICONES[resposta]
  return (
    <div className="mt-1 flex flex-col gap-0.5" data-resposta={resposta}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 font-semibold', TOM[resposta])}>
          <Icone className="size-3.5" aria-hidden="true" />{RESPOSTAS[resposta].rotulo}
        </span>
        {quando && <span className="text-muted-foreground">{quando}{pelo === 'whatsapp' ? ' · pelo WhatsApp' : ''}</span>}
      </p>
      {recado && <p className="text-xs text-muted-foreground">“{recado}”</p>}
    </div>
  )
}

/**
 * Responder à portaria. Na página do aviso, os três botões grandes; na lista
 * da portaria, compacto, para registrar a resposta que chegou por telefone.
 */
export function ResponderVisita({ id, atual, compacto = false, nomeDoVisitante }: { id: string; atual: RespostaDaVisita | null; compacto?: boolean; nomeDoVisitante: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(!compacto)
  const [recado, setRecado] = useState('')
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState('')
  const [ocupado, iniciar] = useTransition()
  const [escolhida, setEscolhida] = useState<RespostaDaVisita | null>(null)

  const responder = (r: RespostaDaVisita) => iniciar(async () => {
    setErro(''); setFeito(''); setEscolhida(r)
    const res = await responderVisita(id, r, recado)
    if (res.erro) { setErro(res.erro); return }
    setFeito(`Resposta enviada: ${RESPOSTAS[r].rotulo}. A portaria foi avisada${res.visitanteAvisado ? ' e o visitante recebeu no WhatsApp' : ''}.`)
    setRecado('')
    if (compacto) setAberto(false)
    router.refresh()
  })

  if (compacto && !aberto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)} aria-label={`Registrar a resposta sobre ${nomeDoVisitante}`} data-portaria-responder>
        <MessageSquareReply className="size-3.5" />Resposta
      </Button>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', compacto && 'w-full rounded-lg border border-border bg-muted/30 p-3')} data-ajuda={compacto ? undefined : 'portaria.responder'}>
      {compacto && <p className="text-xs text-muted-foreground">Registre a resposta que chegou por telefone ou pessoalmente.</p>}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>{compacto ? 'Observação' : 'Recado para a portaria'} <span className="font-normal text-muted-foreground">(opcional)</span></span>
        <input value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={280} placeholder={compacto ? 'Ex.: ligou do ramal, pediu 10 minutos' : 'Ex.: estou terminando uma reunião, 10 minutos'} className={inputClass} disabled={ocupado} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(Object.keys(RESPOSTAS) as RespostaDaVisita[]).map((r) => {
          const Icone = ICONES[r]
          return (
            <button key={r} type="button" disabled={ocupado} onClick={() => responder(r)} data-resposta-botao={r}
              className={cn('flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60',
                TOM[r], atual === r ? 'ring-2 ring-offset-1 ring-current' : 'hover:brightness-95', 'sm:flex-col sm:gap-1 sm:text-center', !compacto && 'sm:min-h-16')}>
              {ocupado && escolhida === r ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Icone className="size-4" aria-hidden="true" />}
              <span>{RESPOSTAS[r].rotulo}</span>
            </button>
          )
        })}
      </div>
      {!compacto && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MessageCircle className="size-3.5" aria-hidden="true" />Pelo WhatsApp: responda a mensagem do aviso com 1, 2 ou 3.</p>}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {feito && <p role="status" className="text-sm text-success">{feito}</p>}
      {compacto && <Button size="sm" variant="ghost" className="self-start" onClick={() => setAberto(false)} disabled={ocupado}>Fechar</Button>}
    </div>
  )
}
