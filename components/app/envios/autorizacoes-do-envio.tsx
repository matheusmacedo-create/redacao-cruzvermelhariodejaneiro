'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { gerarLinkDoEnvio } from '@/app/actions/autorizacoes-de-imagem'

/** Quem mandou não gerou o link de autorização: quem avalia gera e manda a quem enviou. */
export function GerarLinkDoEnvio({ envioId }: { envioId: string }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  async function gerar() {
    setOcupado(true); setErro('')
    const f = new FormData(); f.set('envioId', envioId)
    const r = await gerarLinkDoEnvio(f)
    setOcupado(false)
    if (r.erro) { setErro(r.erro); return }
    router.push(r.id ? `/biblioteca/autorizacoes/${r.id}` : `/envios/${envioId}`)
  }
  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="outline" onClick={gerar} disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Gerar o link de autorização</Button>
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}
