'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Award, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { cancelarDiploma, concederDiploma } from '@/app/actions/diplomas'

/** "Conceder diploma": o texto do reconhecimento vai no diploma, depois de "em agradecimento aos relevantes serviços prestados…". */
export function ConcederDiploma({ participanteId, nome }: { participanteId: string; nome: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)} data-conceder-diploma><Award className="size-3.5" />Conceder diploma</Button>
      {aberto && (
        <Dialog titulo="Conceder Diploma de Reconhecimento" descricao={`Para ${nome}. Sai no modelo oficial da Cruz Vermelha Brasileira, com código de verificação.`} onFechar={() => !ocupado && setAberto(false)}>
          <form className="flex flex-col gap-3 p-6" onSubmit={(e) => {
            e.preventDefault()
            iniciar(async () => {
              setErro('')
              const r = await concederDiploma(participanteId, texto)
              if (r.erro) { setErro(r.erro); return }
              setAberto(false); setTexto('')
              router.refresh()
            })
          }}>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Motivo do reconhecimento
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} required minLength={10} maxLength={600} rows={4} className={`${inputClass} h-auto py-2`}
                placeholder="Ex.: pela dedicação na resposta às enchentes da Região Serrana, em março de 2026" />
            </label>
            <p className="text-xs text-muted-foreground">No diploma: “em agradecimento aos relevantes serviços prestados à Cruz Vermelha Brasileira: {texto.trim() || 'o motivo'}.”</p>
            {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button type="submit" disabled={ocupado || texto.trim().length < 10}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Conceder</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

/** Cancela com motivo: a verificação pública passa a dizer "cancelado". */
export function CancelarDiploma({ id, participanteId, codigo }: { id: string; participanteId: string; codigo: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <>
      <button type="button" aria-label={`Cancelar o diploma ${codigo}`} title="Cancelar diploma" onClick={() => setAberto(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
        <X className="size-3.5" />
      </button>
      {aberto && (
        <Dialog titulo={`Cancelar o diploma ${codigo}`} descricao="Quem conferir o código verá que o diploma foi cancelado. Diploma de horas: tire antes as horas lançadas por engano, senão ele sai de novo no próximo registro." onFechar={() => !ocupado && setAberto(false)}>
          <form className="flex flex-col gap-3 p-6" onSubmit={(e) => {
            e.preventDefault()
            iniciar(async () => {
              setErro('')
              const r = await cancelarDiploma(id, participanteId, motivo)
              if (r.erro) { setErro(r.erro); return }
              setAberto(false)
              router.refresh()
            })
          }}>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Motivo<input value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} maxLength={600} className={inputClass} /></label>
            {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 3}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Cancelar diploma</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}
