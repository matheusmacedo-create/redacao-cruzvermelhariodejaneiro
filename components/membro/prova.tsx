'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Award, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { responderProva, type ResultadoDaProva } from '@/app/actions/membro'
import { resultadoLegivel } from '@/lib/cursos/regras'
import { botaoDoMembro } from './marca'

export type QuestaoDaProva = { id: string; enunciado: string; alternativas: string[] }

/** A prova: uma alternativa por questão. O servidor corrige; o gabarito não vem para cá. */
export function Prova({ cursoId, questoes, minima }: { cursoId: string; questoes: QuestaoDaProva[]; minima: number }) {
  const [respostas, setRespostas] = useState<(number | null)[]>(() => questoes.map(() => null))
  const [resultado, setResultado] = useState<ResultadoDaProva | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const faltam = respostas.filter((r) => r === null).length

  if (resultado?.aprovado) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-6 text-success" role="status" id="resultado">
        <p className="flex items-center gap-2 text-xl font-semibold"><Award className="size-6" />Aprovado!</p>
        {resultado.nota !== undefined && <p>{resultadoLegivel({ nota: resultado.nota, acertos: resultado.acertos ?? 0, total: resultado.total ?? 0 })}.</p>}
        <p className="text-sm">Seu certificado está pronto e já entrou no seu cadastro de formações.</p>
        <div className="flex flex-wrap gap-2">
          <a href={`/membro/certificados/${resultado.certificado}/pdf`} className={botaoDoMembro}>Baixar certificado</a>
          <Link href="/membro/certificados" className="rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-success/15">Meus certificados</Link>
        </div>
      </div>
    )
  }
  if (resultado) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/15 p-6 text-warning-foreground" role="status" id="resultado">
        <p className="flex items-center gap-2 text-xl font-semibold"><XCircle className="size-6" />Ainda não foi desta vez</p>
        <p>{resultadoLegivel({ nota: resultado.nota ?? 0, acertos: resultado.acertos ?? 0, total: resultado.total ?? 0 })}. A nota mínima é {resultado.minima ?? minima}.</p>
        <p className="text-sm">Revise as aulas e tente de novo — são até 3 tentativas a cada 24 horas.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setResultado(null); setRespostas(questoes.map(() => null)) }} className={botaoDoMembro}><RotateCcw className="size-4" />Tentar de novo</button>
          <Link href={`/membro/cursos/${cursoId}`} className="rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-warning/25">Rever as aulas</Link>
        </div>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-4" id="prova" onSubmit={(e) => {
      e.preventDefault()
      if (faltam) { setErro(`Falta${faltam > 1 ? 'm' : ''} ${faltam} ${faltam > 1 ? 'questões' : 'questão'}.`); return }
      iniciar(async () => {
        setErro('')
        const r = await responderProva(cursoId, respostas as number[])
        if (r.erro) setErro(r.erro)
        else setResultado(r)
      })
    }}>
      {questoes.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border border-border bg-card p-5">
          <legend className="sr-only">Questão {i + 1}</legend>
          <p className="mb-3 font-medium"><span className="mr-1 text-muted-foreground/70">{i + 1}.</span>{q.enunciado}</p>
          <div className="flex flex-col gap-2">
            {q.alternativas.map((alt, j) => (
              <label key={j} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-destructive/10">
                <input type="radio" name={`q${i}`} value={j} checked={respostas[i] === j} onChange={() => { setErro(''); setRespostas((r) => r.map((x, k) => (k === i ? j : x))) }} className="mt-0.5 accent-primary" />
                {alt}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{erro}</p>}
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">{questoes.length - faltam} de {questoes.length} respondidas</span>
        <button type="submit" disabled={ocupado} className={botaoDoMembro}>{ocupado && <Loader2 className="size-4 animate-spin" />}Enviar respostas</button>
      </div>
    </form>
  )
}
