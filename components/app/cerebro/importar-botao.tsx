'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importarDoCerebro } from '@/app/actions/cerebro'

/**
 * Traz a sugestão para o hub e abre o pacote.
 *
 * Cria em rascunho: o pacote nasce com o mestre e os destinos preenchidos,
 * mas nada é enviado. O trabalho continua dentro do pacote, com decisão
 * humana — que é o ponto da separação entre o Cérebro e a Redação.
 */
export function ImportarBotao({ sinalId, destinos }: { sinalId: string; destinos: number }) {
  const router = useRouter()
  const [importando, iniciar] = useTransition()
  const [erro, setErro] = useState('')

  function importar() {
    setErro('')
    const form = new FormData()
    form.set('sinalId', sinalId)
    iniciar(async () => {
      const r = await importarDoCerebro(form)
      if (r.erro && !r.id) {
        setErro(r.erro)
        return
      }
      // Abre direto no destino que o Cérebro indicou — o site primeiro — e
      // leva o recado do que não saiu como pedido, se houver.
      const recado = r.erro ?? r.aviso
      if (r.id) {
        const q = new URLSearchParams({ destino: r.abrirEm ?? 'site_web' })
        if (recado) q.set('aviso', recado)
        router.push(`/redes/${r.id}?${q.toString()}`)
      }
    })
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="outline" onClick={importar} disabled={importando}>
        <Sparkles className="size-3.5" />
        {importando ? 'Trazendo…' : destinos > 0 ? `Trazer para o hub (${destinos})` : 'Trazer para o hub'}
      </Button>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}
