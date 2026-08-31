'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recusarSugestao } from '@/app/actions/cerebro'
import { MOTIVOS_RECUSA, type MotivoRecusa } from '@/lib/cerebro/contrato'

/**
 * Recusar uma sugestão, dizendo por quê.
 *
 * O motivo não é burocracia: é o que o Cérebro aprende. "Repetitivo" faz ele
 * recuar naquela fonte; "não é da Cruz" derruba o assunto. A recusa vale para
 * a equipe inteira — o sinal sai daqui, do painel de Publicações e do próprio
 * Cérebro. Errou o clique? O Acervo do Cérebro desfaz.
 */
export function RecusarBotao({ sinalId }: { sinalId: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, iniciar] = useTransition()

  function recusar(motivo: MotivoRecusa) {
    setErro('')
    const form = new FormData()
    form.set('sinalId', sinalId)
    form.set('motivo', motivo)
    iniciar(async () => {
      const r = await recusarSugestao(form)
      if (r.erro) {
        setErro(r.erro)
        return
      }
      router.refresh()
    })
  }

  if (!aberto) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setAberto(true)} disabled={enviando}>
        <X className="size-3.5" />
        {enviando ? 'Recusando…' : 'Não usar'}
      </Button>
    )
  }

  return (
    <span className="flex w-full flex-col gap-1.5 rounded-lg border border-dashed p-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Por que não usar?
      </span>
      <span className="flex flex-wrap gap-1.5">
        {(Object.keys(MOTIVOS_RECUSA) as MotivoRecusa[]).map((m) => (
          <button
            key={m}
            type="button"
            title={MOTIVOS_RECUSA[m].explica}
            onClick={() => recusar(m)}
            disabled={enviando}
            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {MOTIVOS_RECUSA[m].rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setAberto(false); setErro('') }}
          disabled={enviando}
          className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:underline"
        >
          Cancelar
        </button>
      </span>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}
