'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { responderRetorno } from '@/app/actions/beta'
import { ESTADOS_DO_RETORNO, ROTULO_DO_ESTADO, type EstadoDoRetorno } from '@/lib/ajuda/retornos'

/** Na página de retornos: mudar a situação e responder (quem mandou recebe no sino). */
export function ResponderRetorno({ id, estado: inicial, resposta: respostaInicial }: { id: string; estado: EstadoDoRetorno; resposta: string | null }) {
  const router = useRouter()
  const [estado, setEstado] = useState(inicial)
  const [resposta, setResposta] = useState('')
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [ocupado, iniciar] = useTransition()
  return (
    <form className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3" onSubmit={(e) => {
      e.preventDefault()
      iniciar(async () => {
        setErro(''); setSalvo(false)
        const r = await responderRetorno(id, estado, resposta)
        if (r.erro) { setErro(r.erro); return }
        setSalvo(true); setResposta('')
        router.refresh()
      })
    }}>
      {respostaInicial && <p className="rounded-lg bg-primary/[0.05] px-3 py-2 text-sm"><span className="font-medium">Respondido: </span>{respostaInicial}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <label className="flex flex-col gap-1 text-xs font-medium sm:w-40">Situação
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoDoRetorno)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
            {ESTADOS_DO_RETORNO.map((e) => <option key={e} value={e}>{ROTULO_DO_ESTADO[e]}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">{respostaInicial ? 'Nova resposta (opcional)' : 'Resposta para a pessoa (opcional)'}
          <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={2} maxLength={2000} placeholder="Ex.: Obrigado! Corrigimos o botão no celular; já está no ar." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base font-normal sm:text-sm" />
        </label>
        <button type="submit" disabled={ocupado} className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:mt-5">
          {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{resposta.trim() ? 'Responder' : 'Salvar'}
        </button>
      </div>
      {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      {salvo && <p className="text-xs text-success" role="status">Salvo.{resposta ? '' : ' Se escreveu uma resposta, a pessoa recebeu no sino.'}</p>}
    </form>
  )
}
