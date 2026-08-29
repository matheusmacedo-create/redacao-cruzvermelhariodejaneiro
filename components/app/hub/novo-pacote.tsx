'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { criarPacote } from '@/app/actions/pacotes'

/** Botão que cria o pacote e leva direto para o hub. */
export function NovoPacoteBotao({ origemTipo, origemId, rotulo }: {
  origemTipo?: 'materia' | 'pauta'
  origemId?: string
  rotulo?: string
}) {
  const router = useRouter()
  const [criando, iniciar] = useTransition()
  const [erro, setErro] = useState('')

  function criar() {
    setErro('')
    const form = new FormData()
    if (origemTipo && origemId) {
      form.set('origemTipo', origemTipo)
      form.set('origemId', origemId)
    }
    iniciar(async () => {
      const r = await criarPacote(form)
      if (r.erro) { setErro(r.erro); return }
      if (r.id) router.push(`/redes/${r.id}`)
    })
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="lg" onClick={criar} disabled={criando}>
        <Plus className="size-4" />
        {criando ? 'Criando…' : rotulo ?? 'Novo pacote'}
      </Button>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </span>
  )
}
