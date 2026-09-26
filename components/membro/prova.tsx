'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Award, Check, Download, Loader2, RotateCcw, TriangleAlert, XCircle } from 'lucide-react'
import { responderProva, type ResultadoDaProva } from '@/app/actions/membro'
import { resultadoLegivel } from '@/lib/cursos/regras'
import { cn } from '@/lib/utils'
import { barraFixa, botaoDoMembro, botaoSecundario } from './marca'
import { Recado } from './pecas'

export type QuestaoDaProva = { id: string; enunciado: string; alternativas: string[] }

/**
 * A situação das tentativas, calculada no servidor com a regra do banco (até
 * `limite` a cada 24 horas). `libera` e `liberaSeEsgotar` já vêm escritos
 * ("26/09 às 14h"): o primeiro quando não há tentativa agora; o segundo
 * quando só resta uma, para dizer quando volta se ela também não passar.
 */
export type TentativasNaTela = { limite: number; restantes: number; libera: string | null; liberaSeEsgotar: string | null }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const restamLegivel = (n: number) => (n === 1 ? 'Resta 1 tentativa' : `Restam ${n} tentativas`)

/** "a questão 2", "as questões 2 e 4"; muitas, só quantas e a primeira. */
function faltamLegivel(numeros: number[]): string {
  if (numeros.length === 1) return `Falta responder a questão ${numeros[0]}.`
  if (numeros.length <= 4) return `Falta responder as questões ${numeros.slice(0, -1).join(', ')} e ${numeros[numeros.length - 1]}.`
  return `Faltam ${numeros.length} questões, a começar pela ${numeros[0]}.`
}

/**
 * A prova: uma alternativa por questão. O servidor corrige; o gabarito não
 * vem para cá. O botão de enviar fica sempre ativo: se faltar questão, a tela
 * leva até ela e diz qual é — botão apagado não explica o que falta.
 *
 * A página se refaz a cada envio (a ação revalida o curso), então os props
 * de tentativas chegam atualizados; a conta local só cobre o instante antes
 * de eles chegarem.
 */
export function Prova({ cursoId, questoes, minima, tentativas, certificado }: {
  cursoId: string; questoes: QuestaoDaProva[]; minima: number; tentativas: TentativasNaTela
  /** Já aprovado antes (visita depois da aprovação): mostra o certificado em vez das questões. */
  certificado: string | null
}) {
  const [respostas, setRespostas] = useState<(number | null)[]>(() => questoes.map(() => null))
  const [resultado, setResultado] = useState<(ResultadoDaProva & { restantesNoEnvio: number }) | null>(null)
  const [erro, setErro] = useState('')
  // Só depois de tentar enviar com questão em branco: aí as que faltam ficam marcadas.
  const [cobrar, setCobrar] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const tituloDoResultado = useRef<HTMLHeadingElement>(null)

  const faltando = respostas.flatMap((r, i) => (r === null ? [i + 1] : []))
  const respondidas = questoes.length - faltando.length

  // O resultado entra no lugar das questões: o foco vai para o título dele,
  // senão o leitor de tela fica num botão que não existe mais.
  useEffect(() => { if (resultado) tituloDoResultado.current?.focus() }, [resultado])

  const irPara = (numero: number) => {
    const el = document.getElementById(`questao-${numero}`)
    if (!el) return
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' })
    el.querySelector<HTMLInputElement>('input[type="radio"]')?.focus({ preventScroll: true })
  }

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (ocupado) return
    setErro('')
    if (faltando.length) { setCobrar(true); irPara(faltando[0]); return }
    const restantesNoEnvio = tentativas.restantes
    iniciar(async () => {
      const r = await responderProva(cursoId, respostas as number[])
      if (r.erro) { setErro(r.erro); return }
      setResultado({ ...r, restantesNoEnvio })
    })
  }

  const recomecar = () => {
    setResultado(null)
    setCobrar(false)
    setRespostas(questoes.map(() => null))
    // Volta ao começo da prova, com o foco na primeira questão.
    requestAnimationFrame(() => irPara(1))
  }

  if (resultado?.aprovado) {
    const codigo = resultado.certificado ?? certificado
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-5 sm:p-6" id="resultado" aria-labelledby="resultado-titulo">
        <h2 ref={tituloDoResultado} tabIndex={-1} id="resultado-titulo" className="flex items-center gap-2 text-xl font-semibold text-(--success-texto) outline-none">
          <Award className="size-6 shrink-0 text-success" aria-hidden="true" />Aprovado!
        </h2>
        {resultado.nota !== undefined && <p className="text-foreground">{resultadoLegivel({ nota: resultado.nota, acertos: resultado.acertos ?? 0, total: resultado.total ?? 0 })}.</p>}
        <p className="text-sm text-foreground">Seu certificado está pronto e já entrou no seu cadastro de formações.</p>
        <div className="flex flex-wrap gap-2">
          {codigo && <a href={`/membro/certificados/${codigo}/pdf`} className={botaoDoMembro}><Download className="size-4" aria-hidden="true" />Baixar certificado</a>}
          <Link href="/membro/certificados" className={botaoSecundario}>Ver meus certificados</Link>
        </div>
      </section>
    )
  }

  if (resultado) {
    // O menor dos dois: o props, se a página já se refez; a conta local, se ainda não.
    const restantes = Math.max(0, Math.min(tentativas.restantes, resultado.restantesNoEnvio - 1))
    const libera = tentativas.libera ?? tentativas.liberaSeEsgotar
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-warning/50 bg-warning/15 p-5 text-warning-foreground sm:p-6" id="resultado" aria-labelledby="resultado-titulo">
        <h2 ref={tituloDoResultado} tabIndex={-1} id="resultado-titulo" className="flex items-center gap-2 text-xl font-semibold outline-none">
          <TriangleAlert className="size-6 shrink-0" aria-hidden="true" />Ainda não foi desta vez
        </h2>
        <p>{resultadoLegivel({ nota: resultado.nota ?? 0, acertos: resultado.acertos ?? 0, total: resultado.total ?? 0 })}. A nota mínima é {resultado.minima ?? minima}.</p>
        <p className="text-sm">
          {restantes > 0
            ? `Revise as aulas e tente de novo. ${restamLegivel(restantes)} (até ${tentativas.limite} a cada 24 horas).`
            : `Você usou as ${tentativas.limite} tentativas das últimas 24 horas. ${libera ? `Tente de novo a partir de ${libera}.` : 'Revise as aulas e tente de novo depois.'}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {restantes > 0 && <button type="button" onClick={recomecar} className={botaoDoMembro}><RotateCcw className="size-4" aria-hidden="true" />Tentar de novo</button>}
          <Link href={`/membro/cursos/${cursoId}`} className={botaoSecundario}>Rever as aulas</Link>
        </div>
      </section>
    )
  }

  if (certificado) {
    return (
      <Recado tipo="sucesso" titulo="Você já passou nesta prova." id="resultado"
        acao={<a href={`/membro/certificados/${certificado}/pdf`} className={botaoSecundario}><Download className="size-4" aria-hidden="true" />Baixar certificado</a>}>
        <p>O certificado está em <Link href="/membro/certificados" className="font-medium underline underline-offset-4 hover:no-underline">Certificados</Link>.</p>
      </Recado>
    )
  }

  // Sem tentativa agora: a tela avisa antes das questões, não depois de a pessoa responder tudo.
  if (tentativas.restantes === 0) {
    return (
      <Recado tipo="aviso" titulo={`Você usou as ${tentativas.limite} tentativas das últimas 24 horas.`} id="sem-tentativas"
        acao={<Link href={`/membro/cursos/${cursoId}`} className={botaoSecundario}><RotateCcw className="size-4" aria-hidden="true" />Rever as aulas</Link>}>
        <p>{tentativas.libera ? `Tente de novo a partir de ${tentativas.libera}.` : 'Tente de novo mais tarde.'} Enquanto isso, vale rever as aulas.</p>
      </Recado>
    )
  }

  return (
    // `scroll-padding-bottom` só na prova, enquanto ela está na tela: o Tab até a próxima questão
    // não deixa a alternativa focada atrás da barra "N de M respondidas / Enviar respostas".
    // `:root` (e não `html`) para vencer a regra do layout em qualquer ordem do CSS.
    <form className="flex flex-col gap-4 [:root:has(&)]:scroll-pb-[calc(11rem+env(safe-area-inset-bottom))] lg:[:root:has(&)]:scroll-pb-32" id="prova" onSubmit={enviar}>
      {questoes.map((q, i) => {
        const numero = i + 1
        const falta = cobrar && respostas[i] === null
        return (
          // O tour aponta a primeira questão: a prova inteira passa da altura da tela.
          <div key={q.id} id={`questao-${numero}`} data-ajuda={i === 0 ? 'membro.prova' : undefined} className={cn('rounded-xl border bg-card p-4 transition-colors sm:p-5', falta ? 'border-warning ring-2 ring-warning/30' : 'border-border')}>
            <fieldset className="min-w-0" disabled={ocupado} aria-describedby={falta ? `questao-${numero}-falta` : undefined}>
              <legend className="mb-3 w-full">
                <span className="block text-sm text-muted-foreground">Questão {numero} de {questoes.length}<span className="sr-only">: </span></span>
                <span className="mt-0.5 block text-base font-medium wrap-break-word">{q.enunciado}</span>
              </legend>
              <div className="flex flex-col gap-2">
                {q.alternativas.map((alt, j) => (
                  <label key={j} className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-base transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-default sm:text-sm">
                    <input type="radio" name={`q${i}`} value={j} checked={respostas[i] === j}
                      onChange={() => { setErro(''); setRespostas((r) => r.map((x, k) => (k === i ? j : x))) }}
                      className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-none sm:mt-0" />
                    <span className="min-w-0 flex-1 wrap-break-word">{alt}</span>
                    <Check className="mt-1 hidden size-4 shrink-0 text-primary group-has-[:checked]:block sm:mt-0.5" aria-hidden="true" />
                  </label>
                ))}
              </div>
              {falta && <p id={`questao-${numero}-falta`} className="mt-3 flex items-center gap-2 text-sm font-medium text-warning-foreground"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />Escolha uma alternativa.</p>}
            </fieldset>
          </div>
        )
      })}

      <div className={cn(barraFixa, 'flex flex-col gap-2')} data-ajuda="membro.enviar-prova">
        {cobrar && faltando.length > 0 && (
          <p className="flex items-start gap-2 px-1 text-sm font-medium text-warning-foreground" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <button type="button" onClick={() => irPara(faltando[0])} className="text-left underline underline-offset-4 hover:no-underline">{faltamLegivel(faltando)}</button>
          </p>
        )}
        {erro && <p className="flex items-start gap-2 px-1 text-sm text-destructive" role="alert"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{erro}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="px-1 text-sm text-muted-foreground">{respondidas} de {plural(questoes.length, 'respondida', 'respondidas')}</span>
          {/* `aria-disabled` e não `disabled`: desativar o botão focado jogaria o foco no nada. */}
          <button type="submit" className={cn(botaoDoMembro, 'aria-disabled:opacity-60')} aria-disabled={ocupado || undefined}>
            {ocupado ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Enviando…</> : 'Enviar respostas'}
          </button>
        </div>
      </div>
    </form>
  )
}
