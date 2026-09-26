'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Eye, EyeOff, Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { cancelarOportunidade, excluirOportunidade, marcarPresenca, publicarOportunidade } from '@/app/actions/oportunidades'

function useAcao() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const executar = (f: () => Promise<{ erro?: string }>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) { setErro(r.erro); return }
    depois?.()
    router.refresh()
  })
  return { erro, ocupado, executar, setErro }
}

export function PublicacaoDaOportunidade({ id, publicado, cancelada, temInscritos }: { id: string; publicado: boolean; cancelada: boolean; temInscritos: boolean }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [dialogo, setDialogo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [avisados, setAvisados] = useState<number | null>(null)
  if (cancelada) return <p className="text-sm text-destructive">Cancelada.{avisados !== null ? ` ${avisados} ${avisados === 1 ? 'inscrito avisado' : 'inscritos avisados'} por e-mail.` : ''}</p>
  return (
    <div className="flex flex-col gap-2" id="publicacao" data-ajuda="voluntarios.publicacao">
      <p className={`flex items-center gap-2 text-sm font-medium ${publicado ? 'text-success' : 'text-muted-foreground'}`}>
        {publicado ? <Eye className="size-4" /> : <EyeOff className="size-4" />}{publicado ? 'Publicada na Área do Voluntário' : 'Rascunho: só a equipe vê'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={publicado ? 'outline' : 'default'} disabled={ocupado} onClick={() => executar(() => publicarOportunidade(id, !publicado))}>{publicado ? 'Despublicar' : 'Publicar'}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setDialogo(true); setMotivo(''); setErro('') }}>Cancelar atividade</Button>
        {!temInscritos && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => { if (confirm('Excluir esta oportunidade?')) executar(() => excluirOportunidade(id)) }}><Trash2 className="size-3.5" />Excluir</Button>}
      </div>
      {!dialogo && erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      {dialogo && (
        <Dialog titulo="Cancelar atividade" onFechar={() => !ocupado && setDialogo(false)} podeFechar={!ocupado}
          descricao="Os inscritos e a lista de espera recebem um e-mail com o motivo. A atividade continua visível, marcada como cancelada.">
          <form className="flex flex-col gap-3 px-6 py-5" onSubmit={(e) => {
            e.preventDefault()
            executar(async () => { const r = await cancelarOportunidade(id, motivo); if (!r.erro) setAvisados(r.avisados ?? 0); return r }, () => setDialogo(false))
          }}>
            <label className="flex flex-col gap-1 text-sm font-medium">Motivo<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} placeholder="Ex.: previsão de temporal; remarcaremos." className={inputClass} /></label>
            {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogo(false)} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 3}>{ocupado && <Loader2 className="size-4 animate-spin" />}Cancelar e avisar</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

/** Presente / ausente, com as horas que vão para o cadastro. */
export function Presenca({ oportunidadeId, inscricaoId, situacao, horasPadrao, liberada }: { oportunidadeId: string; inscricaoId: string; situacao: string; horasPadrao: number; liberada: boolean }) {
  const { erro, ocupado, executar } = useAcao()
  const [horas, setHoras] = useState(String(horasPadrao).replace('.', ','))
  if (!liberada) return <span className="text-xs text-muted-foreground">Presença a partir do início</span>
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        <input value={horas} onChange={(e) => setHoras(e.target.value)} inputMode="decimal" aria-label="Horas" className={`${inputClass} !w-16 py-1 text-right`} />
        <span className="text-xs text-muted-foreground">h</span>
        <Button size="sm" variant={situacao === 'presente' ? 'default' : 'outline'} disabled={ocupado} onClick={() => executar(() => marcarPresenca(oportunidadeId, inscricaoId, true, horas))}><Check className="size-3.5" />Presente</Button>
        <Button size="sm" variant={situacao === 'ausente' ? 'default' : 'ghost'} disabled={ocupado} onClick={() => executar(() => marcarPresenca(oportunidadeId, inscricaoId, false, ''))}><X className="size-3.5" />Ausente</Button>
      </span>
      {erro && <span className="text-xs text-destructive" role="alert">{erro}</span>}
    </span>
  )
}
