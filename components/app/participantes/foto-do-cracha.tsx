'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { avaliarFotoDoCracha } from '@/app/actions/foto-do-cracha'

/** Os motivos mais comuns, para a recusa sair em um toque (o texto continua editável). */
const MOTIVOS = [
  'O rosto não aparece inteiro, de frente.',
  'Foto escura, tremida ou sem foco.',
  'Com óculos escuros, boné ou chapéu.',
  'Não é uma foto de rosto (desenho, grupo, paisagem).',
]

/**
 * Aprovar ou recusar a foto do crachá (migração 20260929050000). A ação leva
 * o caminho da foto que a pessoa viu: se o voluntário trocou a foto no meio
 * do caminho, o banco recusa e pede para abrir de novo.
 */
export function AvaliarFotoDoCracha({ participanteId, fotoPath, nome }: { participanteId: string; fotoPath: string; nome: string }) {
  const router = useRouter()
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const avaliar = (aprovar: boolean) => iniciar(async () => {
    setErro('')
    const r = await avaliarFotoDoCracha(participanteId, fotoPath, aprovar, aprovar ? undefined : motivo)
    if (r.erro) { setErro(r.erro); return }
    setRecusando(false); setMotivo('')
    router.refresh()
  })
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => avaliar(true)} disabled={ocupado} data-aprovar-foto aria-label={`Aprovar a foto de ${nome} para o crachá`}>
          {ocupado && !recusando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Aprovar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRecusando(true)} disabled={ocupado} data-recusar-foto aria-label={`Recusar a foto de ${nome}`}>
          <X className="size-3.5" />Recusar
        </Button>
      </div>
      {erro && !recusando && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      {recusando && (
        <Dialog titulo="Recusar a foto do crachá" descricao={`${nome} recebe o motivo por e-mail e no perfil, para enviar outra.`} onFechar={() => !ocupado && setRecusando(false)}>
          <form className="flex flex-col gap-3 p-6" onSubmit={(e) => { e.preventDefault(); avaliar(false) }}>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS.map((m) => (
                <button key={m} type="button" onClick={() => setMotivo(m)} className={`rounded-full border px-2.5 py-1 text-xs ${motivo === m ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>{m}</button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Motivo
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={5} maxLength={300} rows={3} className={`${inputClass} h-auto py-2`} />
            </label>
            {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRecusando(false)} disabled={ocupado}>Cancelar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 5}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Recusar a foto</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
