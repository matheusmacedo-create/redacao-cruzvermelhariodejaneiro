'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { abrirDireta } from '@/app/actions/chat'

/** Abre (ou reabre) a conversa direta com a pessoa no chat. */
export function BotaoMensagem({ pessoaId, nome }: { pessoaId: string; nome: string }) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={ocupado} onClick={() => iniciar(async () => {
        setErro(null)
        const r = await abrirDireta([pessoaId])
        if (r.erro || !r.id) setErro(r.erro ?? 'Não foi possível abrir a conversa.')
        else router.push(`/chat/${r.id}`)
      })} aria-label={`Mandar mensagem para ${nome}`}>
        <MessageCircle className="size-4" />{ocupado ? 'Abrindo…' : 'Mandar mensagem'}
      </Button>
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}
