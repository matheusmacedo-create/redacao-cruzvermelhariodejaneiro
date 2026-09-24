'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { salvarOportunidade } from '@/app/actions/oportunidades'
import { TIPOS, paraLocal } from '@/lib/oportunidades/regras'

export type OportunidadeNoFormulario = {
  id: string; titulo: string; tipo: string; descricao: string | null; local: string | null; inicio: string; fim: string
  vagas: number | null; inscricoes_ate: string | null; horas: number | null
}

const Rotulo = ({ t, dica, children, largo }: { t: string; dica?: string; children: React.ReactNode; largo?: boolean }) => (
  <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>{t}{dica && <span className="text-xs font-normal text-muted-foreground">{dica}</span>}{children}</label>
)

export function FormularioDeOportunidade({ o }: { o: OportunidadeNoFormulario | null }) {
  const [estado, enviar, enviando] = useActionState(salvarOportunidade.bind(null, o?.id ?? null), {})
  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-2" id="form-oportunidade">
      <Rotulo t="Título" largo><input name="titulo" required minLength={3} maxLength={160} defaultValue={o?.titulo ?? ''} placeholder="Ex.: Plantão no jogo do Maracanã" className={inputClass} /></Rotulo>
      <Rotulo t="Tipo">
        <select name="tipo" defaultValue={o?.tipo ?? 'acao'} className={inputClass}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
      </Rotulo>
      <Rotulo t="Local"><input name="local" maxLength={300} defaultValue={o?.local ?? ''} placeholder="Endereço ou ponto de encontro" className={inputClass} /></Rotulo>
      <Rotulo t="Início"><input name="inicio" type="datetime-local" required defaultValue={paraLocal(o?.inicio ?? null)} className={inputClass} /></Rotulo>
      <Rotulo t="Fim"><input name="fim" type="datetime-local" required defaultValue={paraLocal(o?.fim ?? null)} className={inputClass} /></Rotulo>
      <Rotulo t="Vagas" dica="Em branco: sem limite. Lotou, vira lista de espera."><input name="vagas" inputMode="numeric" maxLength={5} defaultValue={o?.vagas ?? ''} className={inputClass} /></Rotulo>
      <Rotulo t="Inscrições até" dica="Em branco: até o início."><input name="inscricoes_ate" type="datetime-local" defaultValue={paraLocal(o?.inscricoes_ate ?? null)} className={inputClass} /></Rotulo>
      <Rotulo t="Horas por presença" dica="Em branco: a duração da atividade."><input name="horas" inputMode="decimal" maxLength={5} defaultValue={o?.horas ?? ''} className={inputClass} /></Rotulo>
      <span className="hidden sm:block" />
      <Rotulo t="Descrição" dica="O que vão fazer, o que levar, uniforme, pré-requisitos." largo><textarea name="descricao" rows={5} maxLength={6000} defaultValue={o?.descricao ?? ''} className={inputClass} /></Rotulo>
      {estado.erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2" role="alert">{estado.erro}</p>}
      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        {estado.ok && !enviando && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" />Salvo</span>}
        {!o && <Button variant="outline" render={<Link href="/voluntariado/oportunidades" />}>Cancelar</Button>}
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}{o ? 'Salvar' : 'Criar (como rascunho)'}</Button>
      </div>
    </form>
  )
}
