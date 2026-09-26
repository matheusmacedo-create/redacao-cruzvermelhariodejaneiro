'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { areaDoMembro, botaoPerigo, botaoSecundario } from '@/components/membro/marca'
import { Recado } from '@/components/membro/pecas'

/** Revogar pelo comprovante: vale dali em diante; o registro da assinatura fica. */
export function Revogar({ codigo, chave }: { codigo: string; chave: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function revogar() {
    setEnviando(true)
    setErro('')
    const r = await fetch('/api/publico/autorizacao/revogar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, chave, motivo }) }).catch(() => null)
    const corpo = await r?.json().catch(() => ({}))
    setEnviando(false)
    if (!r?.ok) { setErro(corpo?.erro ?? 'Não foi possível revogar agora. Tente de novo.'); return }
    router.refresh()
  }

  if (!aberto) return <button type="button" onClick={() => setAberto(true)} className={`${botaoPerigo} self-start`}>Revogar esta autorização</button>
  return (
    <section aria-labelledby="revogar" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-card p-4">
      <h2 id="revogar" className="text-base font-semibold">Revogar a autorização</h2>
      <p className="text-sm text-muted-foreground">A Cruz Vermelha deixa de usar estas fotos em peças novas e as retira dos canais digitais dela quando for possível. O que já foi impresso ou publicado por outros antes disso não é recolhido.</p>
      <label htmlFor="motivo" className="text-sm font-medium">Motivo (opcional)</label>
      <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} className={areaDoMembro} />
      {erro && <Recado tipo="erro">{erro}</Recado>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={revogar} disabled={enviando} className={`${botaoPerigo} border border-destructive/40`}>
          {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Confirmar a revogação
        </button>
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Cancelar</button>
      </div>
    </section>
  )
}
