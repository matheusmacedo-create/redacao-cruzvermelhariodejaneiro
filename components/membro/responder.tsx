'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, Check, CheckCircle2, Loader2, RotateCcw, TriangleAlert, XCircle } from 'lucide-react'
import { inscrever, responderOportunidade, type ResultadoDaResposta } from '@/app/actions/membro'
import { TENTATIVAS_DO_QUIZ, faltando, opcoesDa, resultadoDoQuiz, type Resposta } from '@/lib/oportunidades/perguntas'
import type { PerguntaDoMembro } from '@/lib/membro/oportunidades'
import { cn } from '@/lib/utils'
import { barraFixa, botaoDoMembro, botaoSecundario, campoDoMembro } from './marca'
import { Recado } from './pecas'

/**
 * Onde o voluntário responde: confirma o aviso, responde a enquete, faz o
 * quiz — ou responde às perguntas de uma ação e se inscreve. O servidor e o
 * banco conferem tudo (prazo, obrigatórias, opções) e corrigem o quiz; o
 * gabarito nunca vem para cá.
 *
 * `modo`:
 * - aviso, enquete, quiz: o tipo da oportunidade;
 * - inscricao: ação/plantão/evento com perguntas (as respostas vão com a inscrição);
 *   `inscricao` diz se a pessoa já está inscrita e `participar` se é vaga ou espera.
 */

type Modo = 'aviso' | 'enquete' | 'quiz' | 'inscricao'
type ResultadoDoQuiz = { nota: number | null; acertos: number | null; total: number | null; aprovado: boolean | null; tentativas: number; minima: number }

export function FormularioDeResposta({ id, modo, perguntas, anteriores, aberto, quiz, inscrito, participar, respondidoEm }: {
  id: string; modo: Modo; perguntas: PerguntaDoMembro[]
  /** O que a pessoa já respondeu (enquete, aviso, inscrição): o formulário começa preenchido. */
  anteriores: Resposta[] | null
  /** Dentro do prazo (ou antes do fim das inscrições): dá para enviar. */
  aberto: boolean
  /** Quiz: o resultado da última tentativa, se houver. */
  quiz: ResultadoDoQuiz | null
  inscrito: boolean
  participar: 'vaga' | 'espera' | null
  /** "26/09 às 14h": quando respondeu (ou confirmou). */
  respondidoEm: string | null
}) {
  const router = useRouter()
  const inicial = () => (modo === 'quiz' ? [] : anteriores ?? [])
  const [respostas, setRespostas] = useState<Resposta[]>(inicial)
  const [erro, setErro] = useState('')
  const [cobrar, setCobrar] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoDoQuiz | null>(quiz)
  const [refazendo, setRefazendo] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (feito || (resultado && !refazendo)) titulo.current?.focus() }, [feito, resultado, refazendo])

  const falta = faltando(perguntas, respostas)
  const valor = (p: PerguntaDoMembro) => respostas.find((r) => r.p === p.id)
  const definir = (p: PerguntaDoMembro, r: Omit<Resposta, 'p'> | null) => {
    setErro('')
    setRespostas((atual) => [...atual.filter((x) => x.p !== p.id), ...(r ? [{ p: p.id, ...r }] : [])])
  }
  const irPara = (perguntaId: string) => {
    const el = document.getElementById(`pergunta-${perguntaId}`)
    if (!el) return
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus({ preventScroll: true })
  }

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (ocupado || !aberto) return
    setErro('')
    if (falta) { setCobrar(true); irPara(falta.id); return }
    iniciar(async () => {
      if (modo === 'inscricao' && !inscrito) {
        const r = await inscrever(id, respostas)
        if (r.erro) { setErro(r.erro); return }
        setFeito(r.situacao === 'espera' ? 'Você entrou na lista de espera. Se abrir uma vaga, você sobe automaticamente.' : 'Inscrição confirmada. Enviamos os detalhes para o seu e-mail.')
        router.refresh()
        return
      }
      const r: ResultadoDaResposta = await responderOportunidade(id, respostas)
      if (r.erro) { setErro(r.erro); return }
      if (modo === 'quiz') {
        setRefazendo(false)
        setResultado({ nota: r.nota ?? null, acertos: r.acertos ?? null, total: r.total ?? null, aprovado: r.aprovado ?? null, tentativas: r.tentativas ?? 1, minima: r.minima ?? 70 })
      } else {
        setFeito(modo === 'aviso' ? 'Pronto: a coordenação sabe que você está ciente.' : modo === 'inscricao' ? 'Respostas atualizadas.' : anteriores ? 'Resposta atualizada.' : 'Resposta enviada. Obrigado!')
      }
      router.refresh()
    })
  }

  // ---------------------------------------------------------------- resultado do quiz
  if (modo === 'quiz' && resultado && !refazendo) {
    const aprovado = Boolean(resultado.aprovado)
    const restam = TENTATIVAS_DO_QUIZ - resultado.tentativas
    return (
      <section id="resultado" aria-labelledby="resultado-titulo"
        className={cn('flex flex-col gap-3 rounded-xl border p-5 sm:p-6', aprovado ? 'border-success/30 bg-success/10' : 'border-warning/50 bg-warning/15 text-warning-foreground')}>
        <h2 ref={titulo} tabIndex={-1} id="resultado-titulo" className="flex items-center gap-2 text-xl font-semibold outline-none">
          {aprovado ? <Award className="size-6 shrink-0 text-success" aria-hidden="true" /> : <TriangleAlert className="size-6 shrink-0" aria-hidden="true" />}
          {aprovado ? 'Aprovado!' : 'Ainda não foi desta vez'}
        </h2>
        <p>{resultadoDoQuiz(resultado)}</p>
        <div className="flex flex-wrap gap-2">
          {!aprovado && restam > 0 && aberto && (
            <button type="button" className={botaoDoMembro} onClick={() => { setRefazendo(true); setRespostas([]); setCobrar(false); setErro('') }}>
              <RotateCcw className="size-4" aria-hidden="true" />Tentar de novo
            </button>
          )}
          <Link href="/membro/oportunidades" className={botaoSecundario}>Voltar às oportunidades</Link>
        </div>
      </section>
    )
  }

  if (feito) {
    return (
      <section id="resultado" aria-labelledby="resultado-titulo" className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-5 sm:p-6">
        <h2 ref={titulo} tabIndex={-1} id="resultado-titulo" className="flex items-center gap-2 text-lg font-semibold outline-none">
          <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />{feito}
        </h2>
        <div className="flex flex-wrap gap-2">
          {perguntas.length > 0 && aberto && modo !== 'aviso' && <button type="button" className={botaoSecundario} onClick={() => setFeito(null)}>Ver ou mudar minhas respostas</button>}
          <Link href="/membro/oportunidades" className={botaoSecundario}>Voltar às oportunidades</Link>
        </div>
      </section>
    )
  }

  // Aviso sem pergunta, já confirmado: não há o que mudar.
  if (modo === 'aviso' && !perguntas.length && respondidoEm) {
    return <Recado tipo="sucesso" titulo="Você confirmou este aviso." id="resultado"><p>Em {respondidoEm}.</p></Recado>
  }

  const rotulo = modo === 'aviso' ? (respondidoEm ? 'Atualizar' : 'Estou ciente')
    : modo === 'quiz' ? 'Enviar respostas'
      : modo === 'inscricao' ? (inscrito ? 'Atualizar respostas' : participar === 'espera' ? 'Entrar na lista de espera' : 'Quero participar')
        : anteriores ? 'Atualizar resposta' : 'Enviar resposta'

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 [:root:has(&)]:scroll-pb-[calc(11rem+env(safe-area-inset-bottom))] lg:[:root:has(&)]:scroll-pb-32" id="responder">
      {!aberto && <Recado tipo="aviso" titulo="O prazo terminou.">{respondidoEm ? <p>Sua resposta, de {respondidoEm}, ficou registrada.</p> : <p>Não dá mais para responder.</p>}</Recado>}
      {aberto && respondidoEm && modo !== 'quiz' && <p className="text-sm text-muted-foreground">Você respondeu em {respondidoEm}. Dá para mudar até o prazo.</p>}
      {modo === 'quiz' && aberto && (
        <p className="text-sm text-muted-foreground">
          {resultado ? `Tentativa ${resultado.tentativas + 1} de ${TENTATIVAS_DO_QUIZ}.` : `Você tem ${TENTATIVAS_DO_QUIZ} tentativas.`} A correção sai assim que você enviar.
        </p>
      )}
      {perguntas.map((p, i) => {
        const r = valor(p)
        const semResposta = cobrar && falta?.id === p.id
        const opcoes = opcoesDa(p)
        return (
          <div key={p.id} id={`pergunta-${p.id}`} className={cn('rounded-xl border bg-card p-4 transition-colors sm:p-5', semResposta ? 'border-warning ring-2 ring-warning/30' : 'border-border')}>
            <fieldset className="min-w-0" disabled={ocupado || !aberto}>
              <legend className="mb-3 w-full">
                <span className="block text-sm text-muted-foreground">Pergunta {i + 1} de {perguntas.length}{p.obrigatoria ? '' : ' · opcional'}{p.tipo === 'multipla' ? ' · pode marcar mais de uma' : ''}<span className="sr-only">: </span></span>
                <span className="mt-0.5 block text-base font-medium wrap-break-word">{p.enunciado}</span>
              </legend>
              {p.tipo === 'texto' ? (
                <textarea rows={3} maxLength={1000} value={r?.t ?? ''} onChange={(e) => definir(p, e.target.value ? { t: e.target.value } : null)} className={campoDoMembro} aria-label={p.enunciado} />
              ) : (
                <div className="flex flex-col gap-2">
                  {opcoes.map((alt, j) => {
                    const marcada = Boolean(r?.e?.includes(j))
                    const multipla = p.tipo === 'multipla'
                    return (
                      <label key={j} className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-base transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-default sm:text-sm">
                        <input type={multipla ? 'checkbox' : 'radio'} name={`p-${p.id}`} value={j} checked={marcada}
                          onChange={() => {
                            if (!multipla) return definir(p, { e: [j] })
                            const atuais = r?.e ?? []
                            const novas = marcada ? atuais.filter((x) => x !== j) : [...atuais, j].sort((a, b) => a - b)
                            definir(p, novas.length ? { e: novas } : null)
                          }}
                          className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-none sm:mt-0" />
                        <span className="min-w-0 flex-1 wrap-break-word">{alt}</span>
                        <Check className="mt-1 hidden size-4 shrink-0 text-primary group-has-[:checked]:block sm:mt-0.5" aria-hidden="true" />
                      </label>
                    )
                  })}
                </div>
              )}
              {semResposta && <p className="mt-3 flex items-center gap-2 text-sm font-medium text-warning-foreground"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />Esta pergunta é obrigatória.</p>}
            </fieldset>
          </div>
        )
      })}
      {aberto && (
        <div className={cn(barraFixa, 'flex flex-col gap-2')} data-ajuda="membro.enviar-resposta">
          {erro && <p className="flex items-start gap-2 px-1 text-sm text-destructive" role="alert"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{erro}</p>}
          <div className="flex items-center justify-end gap-3">
            <button type="submit" className={cn(botaoDoMembro, 'aria-disabled:opacity-60')} aria-disabled={ocupado || undefined}>
              {ocupado ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Enviando…</> : rotulo}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
