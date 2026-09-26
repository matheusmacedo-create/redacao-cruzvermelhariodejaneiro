'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { salvarOportunidade } from '@/app/actions/oportunidades'
import { EXPLICACAO_DO_TIPO, TIPOS, ehDeResposta, paraLocal, type Tipo } from '@/lib/oportunidades/regras'
import type { Pergunta } from '@/lib/oportunidades/perguntas'
import { EditorDePerguntas } from './perguntas'

export type OportunidadeNoFormulario = {
  id: string; titulo: string; tipo: string; descricao: string | null; local: string | null; inicio: string; fim: string
  vagas: number | null; inscricoes_ate: string | null; horas: number | null; nota_minima: number | null
  perguntas: Pergunta[]
  /** Já há respostas: perguntas e tipo não mudam mais. */
  travadas: boolean
}

const Rotulo = ({ t, dica, children, largo }: { t: string; dica?: string; children: React.ReactNode; largo?: boolean }) => (
  <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>{t}{dica && <span className="text-xs font-normal text-muted-foreground">{dica}</span>}{children}</label>
)

/**
 * O formulário da oportunidade. O tipo muda o resto: nos de resposta (aviso,
 * enquete, quiz) somem vagas, prazo de inscrição e horas; o início vira
 * "Abre em" (vazio: agora) e o fim vira o prazo para responder; o quiz ganha
 * a nota mínima.
 */
export function FormularioDeOportunidade({ o }: { o: OportunidadeNoFormulario | null }) {
  const [estado, enviar, enviando] = useActionState(salvarOportunidade.bind(null, o?.id ?? null), {})
  const [tipo, setTipo] = useState<string>(o?.tipo ?? 'acao')
  const pedido = ehDeResposta(tipo)
  return (
    <form action={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2" id="form-oportunidade">
      <Rotulo t="Título" largo><input name="titulo" required minLength={3} maxLength={160} defaultValue={o?.titulo ?? ''} placeholder={pedido ? 'Ex.: Quiz de primeiros socorros' : 'Ex.: Plantão no jogo do Maracanã'} className={inputClass} /></Rotulo>
      <Rotulo t="Tipo" dica={EXPLICACAO_DO_TIPO[tipo as Tipo]}>
        {/* Com respostas gravadas, o banco recusa mudar o tipo: o campo trava, e o valor vai escondido. */}
        <select name={o?.travadas ? undefined : 'tipo'} value={tipo} disabled={o?.travadas} onChange={(e) => setTipo(e.target.value)} className={inputClass} data-ajuda="voluntarios.tipo-oportunidade">
          <optgroup label="Para se inscrever">{Object.entries(TIPOS).filter(([k]) => !ehDeResposta(k)).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</optgroup>
          <optgroup label="Para responder">{Object.entries(TIPOS).filter(([k]) => ehDeResposta(k)).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</optgroup>
        </select>
        {o?.travadas && <input type="hidden" name="tipo" value={tipo} />}
      </Rotulo>
      {pedido ? (
        tipo === 'quiz'
          ? <Rotulo t="Nota mínima" dica="De 1 a 100. Em branco: 70."><input name="nota_minima" inputMode="numeric" maxLength={3} defaultValue={o?.nota_minima ?? ''} placeholder="70" className={inputClass} /></Rotulo>
          : <span className="hidden sm:block" />
      ) : (
        <Rotulo t="Local"><input name="local" maxLength={300} defaultValue={o?.local ?? ''} placeholder="Endereço ou ponto de encontro" className={inputClass} /></Rotulo>
      )}
      {pedido ? (
        <>
          <Rotulo t="Abre em" dica="Em branco: agora, quando publicar."><input name="inicio" type="datetime-local" defaultValue={o && ehDeResposta(o.tipo) ? paraLocal(o.inicio) : ''} className={inputClass} /></Rotulo>
          <Rotulo t="Prazo para responder"><input name="fim" type="datetime-local" required defaultValue={o && ehDeResposta(o.tipo) ? paraLocal(o.fim) : ''} className={inputClass} /></Rotulo>
        </>
      ) : (
        <>
          <Rotulo t="Início"><input name="inicio" type="datetime-local" required defaultValue={paraLocal(o?.inicio ?? null)} className={inputClass} /></Rotulo>
          <Rotulo t="Fim"><input name="fim" type="datetime-local" required defaultValue={paraLocal(o?.fim ?? null)} className={inputClass} /></Rotulo>
          <Rotulo t="Vagas" dica="Em branco: sem limite. Lotou, vira lista de espera."><input name="vagas" data-ajuda="voluntarios.vagas" inputMode="numeric" maxLength={5} defaultValue={o?.vagas ?? ''} className={inputClass} /></Rotulo>
          <Rotulo t="Inscrições até" dica="Em branco: até o início."><input name="inscricoes_ate" type="datetime-local" defaultValue={paraLocal(o?.inscricoes_ate ?? null)} className={inputClass} /></Rotulo>
          <Rotulo t="Horas por presença" dica="Em branco: a duração da atividade."><input name="horas" data-ajuda="voluntarios.horas-presenca" inputMode="decimal" maxLength={5} defaultValue={o?.horas ?? ''} className={inputClass} /></Rotulo>
          <span className="hidden sm:block" />
        </>
      )}
      <Rotulo t={pedido ? 'Texto' : 'Descrição'} dica={pedido ? 'O recado, as instruções do quiz ou o contexto da enquete.' : 'O que vão fazer, o que levar, uniforme, pré-requisitos.'} largo><textarea name="descricao" rows={5} maxLength={6000} defaultValue={o?.descricao ?? ''} className={inputClass} /></Rotulo>
      <EditorDePerguntas key={o?.travadas ? 'travadas' : 'livres'} iniciais={o?.perguntas ?? []} tipoDaOportunidade={tipo} travadas={Boolean(o?.travadas)} />
      {estado.erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2" role="alert">{estado.erro}</p>}
      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        {estado.ok && !enviando && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" />Salvo</span>}
        {!o && <Button variant="outline" render={<Link href="/voluntariado/oportunidades" />}>Cancelar</Button>}
        <Button type="submit" disabled={enviando} data-ajuda="voluntarios.salvar-oportunidade">{enviando && <Loader2 className="size-4 animate-spin" />}{o ? 'Salvar' : 'Criar (como rascunho)'}</Button>
      </div>
    </form>
  )
}
