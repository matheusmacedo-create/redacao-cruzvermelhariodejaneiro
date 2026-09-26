'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, Undo2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cancelarPedido, decidirPedido } from '@/app/actions/compras'
import { campo } from './comum'

type Etapa = { papel: 'financeiro' | 'diretoria'; rotulo: string; feita: { por: string; em: string } | null; minhaVez: boolean }

/**
 * As aprovações que o pedido precisa (o Financeiro; acima do limite, também a
 * Diretoria), quem já aprovou e, para quem é a vez, os botões. Recusar e
 * devolver pedem motivo — ele vai para quem pediu e para o histórico.
 */
export function Aprovacao({ pedidoId, etapas, emAprovacao }: { pedidoId: string; etapas: Etapa[]; emAprovacao: boolean }) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const vez = etapas.find((e) => e.minhaVez && !e.feita)
  const decidir = (decisao: 'aprovar' | 'recusar' | 'devolver') => {
    if (!vez) return
    if (decisao !== 'aprovar' && motivo.trim().length < 5) { setErro('Diga o motivo (ao menos 5 caracteres).'); return }
    iniciar(async () => {
      setErro('')
      const r = await decidirPedido(pedidoId, decisao, motivo, vez.papel)
      if (r.erro) setErro(r.erro); else { setMotivo(''); router.refresh() }
    })
  }
  return (
    <section data-ajuda="compras.aprovacao" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" aria-label="Aprovação" data-aprovacao>
      <p className="font-medium">Aprovação</p>
      <ul className="flex flex-col gap-2 text-sm">
        {etapas.map((e) => (
          <li key={e.papel} className="flex items-center gap-2">
            {e.feita ? <CheckCircle2 className="size-4 text-success" /> : <Clock className="size-4 text-muted-foreground" />}
            <span className="font-medium">{e.rotulo}</span>
            <span className="text-muted-foreground">{e.feita ? `aprovou — ${e.feita.por}, ${e.feita.em}` : emAprovacao ? (e.minhaVez ? 'é a sua vez' : 'aguardando') : '—'}</span>
          </li>
        ))}
      </ul>
      {emAprovacao && vez && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={1000} className={campo}
            placeholder="Observação (para aprovar é opcional; para devolver ou recusar, diga o motivo)" aria-label="Motivo ou observação" />
          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => decidir('recusar')}><XCircle className="size-4" />Recusar</Button>
            <Button variant="outline" size="sm" disabled={ocupado} onClick={() => decidir('devolver')}><Undo2 className="size-4" />Devolver para a cotação</Button>
            <Button size="sm" disabled={ocupado} onClick={() => decidir('aprovar')}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Aprovar como {vez.rotulo}</Button>
          </div>
        </div>
      )}
    </section>
  )
}

export function CancelarPedido({ pedidoId }: { pedidoId: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  if (!aberto) return <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>Cancelar pedido</Button>
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:w-96">
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} placeholder="Motivo do cancelamento" className={campo} aria-label="Motivo do cancelamento" autoFocus />
      {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>Voltar</Button>
        <Button variant="destructive" size="sm" disabled={ocupado || motivo.trim().length < 5}
          onClick={() => iniciar(async () => { const r = await cancelarPedido(pedidoId, motivo); if (r.erro) setErro(r.erro); else { setAberto(false); router.refresh() } })}>
          {ocupado && <Loader2 className="size-3.5 animate-spin" />}Cancelar o pedido
        </Button>
      </div>
    </div>
  )
}
