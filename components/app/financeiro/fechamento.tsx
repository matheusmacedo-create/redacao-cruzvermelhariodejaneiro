'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, LockOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { fecharMes, reabrirMes, salvarValorHora } from '@/app/actions/financeiro'
import { valorNoCampo } from '@/lib/financeiro/regras'

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
  return { erro, ocupado, executar }
}

export function FecharMes({ mes, nome, avisos, bloqueado }: { mes: string; nome: string; avisos: string[]; bloqueado: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [obs, setObs] = useState('')
  const [ciente, setCiente] = useState(false)
  const { erro, ocupado, executar } = useAcao()
  return (
    <>
      <Button disabled={bloqueado} onClick={() => setAberto(true)} id="botao-fechar"><Lock className="size-4" />Fechar {nome}</Button>
      {aberto && (
        <Dialog titulo={`Fechar ${nome}`} descricao="O que foi pago neste mês deixa de poder ser mudado. Só a gestão reabre, com motivo." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3 text-sm">
            {avisos.length > 0 && (
              <div className="rounded-lg bg-warning/15 p-3 text-warning-foreground">
                <p className="font-medium">Fica registrado que o mês foi fechado com {avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}:</p>
                <ul className="mt-1 list-disc pl-5 text-xs">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
            <label className="flex flex-col gap-1 font-medium">Observação{avisos.length ? ' (obrigatória com avisos)' : ' (opcional)'}
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} maxLength={2000} className={inputClass} placeholder="Ex.: comprovante da luz chega semana que vem." />
            </label>
            {avisos.length > 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />Conferi os avisos e fecho mesmo assim</label>}
            {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado || (avisos.length > 0 && (!ciente || obs.trim().length < 5))} onClick={() => executar(() => fecharMes(mes, obs), () => setAberto(false))}>
                {ocupado && <Loader2 className="size-4 animate-spin" />}Fechar o mês</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function ReabrirMes({ nome }: { nome: string }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const { erro, ocupado, executar } = useAcao()
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><LockOpen className="size-4" />Reabrir {nome}</Button>
      {aberto && (
        <Dialog titulo={`Reabrir ${nome}`} descricao="Os administradores são avisados. O fechamento anterior continua no histórico." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1 font-medium">Por que reabrir?<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} className={inputClass} /></label>
            {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button variant="destructive" disabled={ocupado || motivo.trim().length < 5} onClick={() => executar(() => reabrirMes(motivo), () => setAberto(false))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Reabrir</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function ValorHora({ valor, pode }: { valor: number | null; pode: boolean }) {
  const [texto, setTexto] = useState(valorNoCampo(valor))
  const { erro, ocupado, executar } = useAcao()
  if (!pode) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">Valor de referência da hora voluntária (R$)
        <input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" placeholder="Ex.: 25,00" className={`${inputClass} !w-28 py-1`} />
      </label>
      <Button size="sm" variant="outline" disabled={ocupado} onClick={() => executar(() => salvarValorHora(texto))}>Salvar</Button>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </div>
  )
}
