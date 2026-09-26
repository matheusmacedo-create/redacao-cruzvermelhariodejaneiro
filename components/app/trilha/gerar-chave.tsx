'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { gerarChaveDaTrilha } from '@/app/actions/trilha'

/**
 * Gera a chave de assinatura no servidor da Redação e a guarda no cofre. O
 * valor não passa pelo navegador: volta só a impressão digital. Pede
 * confirmação, porque a chave é a identidade da trilha e não se troca por aqui.
 */
export function GerarChave() {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  if (!confirmando) {
    return <Button size="sm" className="mt-3" onClick={() => setConfirmando(true)} data-gerar-chave><KeyRound className="size-4" />Gerar a chave de assinatura</Button>
  }
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3" data-confirmar-chave>
      <p>
        O Palácio Virtual cria agora uma chave Ed25519 no servidor e a guarda no cofre do Supabase. Ninguém vê a chave — só a impressão digital,
        que depois vai à página de canais oficiais e ao PDF assinado pela presidência. Ela passa a assinar os lotes na próxima rotina diária.
        <strong className="font-medium"> Não se troca por aqui</strong>: trocar a chave é um evento que precisa ser anunciado.
      </p>
      {erro && <p className="text-destructive" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</Button>
        <Button size="sm" disabled={ocupado}
          onClick={() => iniciar(async () => {
            setErro('')
            const r = await gerarChaveDaTrilha()
            if (r.erro) setErro(r.erro); else { setConfirmando(false); router.refresh() }
          })}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Gerar e guardar no cofre
        </Button>
      </div>
    </div>
  )
}
