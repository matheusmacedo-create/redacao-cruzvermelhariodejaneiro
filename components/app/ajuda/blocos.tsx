import Link from 'next/link'
import { ChevronRight, CircleHelp, Lightbulb, ListOrdered, UserRoundCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Achado } from '@/lib/ajuda'
import type { Pergunta, Tarefa } from '@/lib/ajuda/tipos'

/**
 * As peças de texto da ajuda, iguais no painel "?" e na Central (/ajuda).
 * Sem estado e sem 'use client': servem ao servidor e ao cliente.
 *
 * No painel as tarefas e perguntas ficam recolhidas (<details>: abre com
 * teclado e leitor de tela sem uma linha de JavaScript); na Central ficam
 * abertas, com âncora, porque é para lá que a busca e os links apontam.
 */

export const tituloDeSecao = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'

/** "Só administradores": quem pode fazer a tarefa. */
export function SeloQuem({ quem, className }: { quem: string; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-primary/[0.08] px-2 py-0.5 text-[11px] font-medium text-primary', className)}>
      <UserRoundCheck className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{quem}</span>
    </span>
  )
}

function Passos({ tarefa }: { tarefa: Tarefa }) {
  return (
    <>
      {/* Numeração nativa: o leitor de tela anuncia "lista, 4 itens" e o número de cada passo. */}
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed marker:font-semibold marker:tabular-nums marker:text-muted-foreground">
        {tarefa.passos.map((passo, i) => <li key={i} className="pl-1">{passo}</li>)}
      </ol>
      {tarefa.dica && (
        <p className="mt-3 flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" />
          <span><span className="font-medium text-foreground">Dica: </span>{tarefa.dica}</span>
        </p>
      )}
    </>
  )
}

function Resposta({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
      {texto.split(/\n{2,}/).map((paragrafo, i) => <p key={i}>{paragrafo}</p>)}
    </div>
  )
}

const recolhivel = 'group rounded-lg border border-border bg-card open:bg-muted/20'
const cabecaDoRecolhivel = 'flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden'
const seta = 'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none'

/** Uma tarefa recolhida (painel). */
export function TarefaRecolhida({ tarefa }: { tarefa: Tarefa }) {
  return (
    <details className={recolhivel}>
      <summary className={cabecaDoRecolhivel}>
        <ChevronRight className={seta} aria-hidden="true" />
        <span className="min-w-0 flex-1">{tarefa.titulo}</span>
        {tarefa.quem && <SeloQuem quem={tarefa.quem} className="mt-px max-w-[45%]" />}
      </summary>
      <div className="px-3 pb-3 pl-9"><Passos tarefa={tarefa} /></div>
    </details>
  )
}

/** Uma pergunta recolhida (painel). */
export function PerguntaRecolhida({ pergunta }: { pergunta: Pergunta }) {
  return (
    <details className={recolhivel}>
      <summary className={cabecaDoRecolhivel}>
        <ChevronRight className={seta} aria-hidden="true" />
        <span className="min-w-0 flex-1">{pergunta.pergunta}</span>
      </summary>
      <div className="px-3 pb-3 pl-9"><Resposta texto={pergunta.resposta} /></div>
    </details>
  )
}

// A âncora mira o próprio cartão; o scroll-margin deixa um respiro acima dele,
// e o :target acende o cartão para quem chegou por um link da busca.
const ancorado = 'scroll-mt-6 rounded-xl border border-border bg-card p-4 shadow-xs target:border-primary/50 target:ring-2 target:ring-primary/20 sm:p-5'

/** Uma tarefa aberta, com âncora (Central). */
export function TarefaAberta({ tarefa, nivel = 3 }: { tarefa: Tarefa; nivel?: 3 | 5 }) {
  const Titulo = nivel === 3 ? 'h3' : 'h5'
  return (
    <article id={tarefa.id} className={ancorado}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <Titulo className="min-w-0 text-[15px] font-semibold leading-snug">{tarefa.titulo}</Titulo>
        {tarefa.quem && <SeloQuem quem={tarefa.quem} />}
      </div>
      <Passos tarefa={tarefa} />
    </article>
  )
}

/** Uma pergunta aberta, com âncora (Central). */
export function PerguntaAberta({ pergunta, nivel = 3 }: { pergunta: Pergunta; nivel?: 3 | 5 }) {
  const Titulo = nivel === 3 ? 'h3' : 'h5'
  return (
    <article id={pergunta.id} className={ancorado}>
      <Titulo className="mb-2 text-[15px] font-semibold leading-snug">{pergunta.pergunta}</Titulo>
      <Resposta texto={pergunta.resposta} />
    </article>
  )
}

/** A lista de resultados da busca na ajuda (painel e Central). */
export function ResultadosDaAjuda({ achados, busca, aoEscolher }: { achados: Achado[]; busca: string; aoEscolher?: () => void }) {
  if (!achados.length) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nada na ajuda com “{busca.trim()}”. Tente outra palavra.</p>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {achados.map((achado) => {
        const Icone = achado.tipo === 'pergunta' ? CircleHelp : ListOrdered
        return (
          <li key={achado.href}>
            <Link href={achado.href} onClick={aoEscolher} className="flex min-h-11 gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm outline-none hover:border-border hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50">
              <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{achado.titulo}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{achado.tipo === 'pergunta' ? 'Pergunta' : 'Passo a passo'} · {achado.onde}</span>
                <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{achado.trecho}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
