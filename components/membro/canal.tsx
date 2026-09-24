'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { abrirConversa, responderConversa } from '@/app/actions/membro'
import { CATEGORIAS_DA_CONVERSA } from '@/lib/canal/regras'
import { botaoDoMembro, campoDoMembro } from './marca'

export function NovaConversa() {
  const [aberto, setAberto] = useState(false)
  const [estado, enviar, enviando] = useActionState(abrirConversa, {})
  if (!aberto) return <button type="button" onClick={() => setAberto(true)} className={botaoDoMembro}><Send className="size-4" />Nova mensagem</button>
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5" id="nova-conversa">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">Assunto<input name="assunto" required minLength={3} maxLength={160} autoFocus className={campoDoMembro} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">Sobre
          <select name="categoria" defaultValue="duvida" className={campoDoMembro}>{Object.entries(CATEGORIAS_DA_CONVERSA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">Mensagem<textarea name="texto" required rows={5} maxLength={4000} className={campoDoMembro} /></label>
      {estado.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancelar</button>
        <button type="submit" disabled={enviando} className={botaoDoMembro}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar</button>
      </div>
    </form>
  )
}

export function Responder({ conversaId, encerrada }: { conversaId: string; encerrada: boolean }) {
  const [estado, enviar, enviando] = useActionState(responderConversa.bind(null, conversaId), {})
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (estado.ok) form.current?.reset() }, [estado.ok])
  return (
    <form ref={form} action={enviar} className="flex flex-col gap-2" id="responder">
      {encerrada && <p className="text-xs text-neutral-500">Esta conversa foi encerrada pela coordenação. Se escrever, ela é reaberta.</p>}
      <textarea name="texto" required rows={3} maxLength={4000} placeholder="Escreva sua resposta" aria-label="Resposta" className={campoDoMembro} />
      {estado.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{estado.erro}</p>}
      <div className="flex justify-end"><button type="submit" disabled={enviando} className={botaoDoMembro}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar</button></div>
    </form>
  )
}
