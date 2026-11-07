import Link from 'next/link'
import { ArrowRight, BookA, ChevronRight, CircleHelp, Lightbulb, ListOrdered, MapPinned, Sparkles, UserRoundCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Achado } from '@/lib/ajuda'
import type { Termo } from '@/lib/ajuda/glossario'
import { ROTULO_DO_ACHADO, hrefDaAjuda, hrefDoGlossario } from '@/lib/ajuda/indice'
import type { NaPratica, Pergunta, Tarefa } from '@/lib/ajuda/tipos'
import { IssoAjudou } from './beta'
import { Ouvir } from '@/components/ajuda/ouvir'
import { VerOVideo } from '@/components/ajuda/video'
import { textoDaPergunta, textoDaTarefa, textoDoTermo } from '@/lib/ajuda/ouvir'

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
      {tarefa.exemplo && (
        <p className="mt-3 flex gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-sm leading-relaxed">
          <MapPinned className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span><span className="font-medium">Exemplo: </span><span className="text-muted-foreground">{tarefa.exemplo}</span></span>
        </p>
      )}
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

/**
 * "Na prática": a história de como imaginamos a área funcionando, com um caso
 * concreto. Uma linha do tempo numerada (lista ordenada de verdade, para o
 * leitor de tela) e, no fim, o que a pessoa ganha.
 */
export function HistoriaNaPratica({ historia, compacta = false }: { historia: NaPratica; compacta?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-3', !compacta && 'rounded-xl border border-primary/15 bg-primary/[0.03] p-4 sm:p-5')}>
      {!compacta && (
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />Na prática: como imaginamos
        </p>
      )}
      {!compacta && <p className="text-[15px] font-semibold leading-snug">{historia.titulo}</p>}
      <ol className="relative flex flex-col gap-3 border-l-2 border-primary/20 pl-4">
        {historia.passos.map((passo, i) => (
          <li key={i} className="relative text-sm leading-relaxed">
            <span className="absolute -left-[27px] top-0 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground" aria-hidden="true">{i + 1}</span>
            {passo}
          </li>
        ))}
      </ol>
      {historia.resultado && <p className="rounded-lg bg-background/70 px-3 py-2 text-sm leading-relaxed"><span className="font-medium">O que você ganha: </span><span className="text-muted-foreground">{historia.resultado}</span></p>}
    </div>
  )
}

/** "Na prática" recolhida (painel). */
export function HistoriaRecolhida({ historia }: { historia: NaPratica }) {
  return (
    <details className="group rounded-lg border border-primary/20 bg-primary/[0.03] open:bg-primary/[0.05]" data-na-pratica>
      <summary className={cabecaDoRecolhivel}>
        <ChevronRight className={seta} aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-wider text-primary">Na prática: como imaginamos</span><span className="block">{historia.titulo}</span></span>
      </summary>
      <div className="px-3 pb-3 pl-9"><HistoriaNaPratica historia={historia} compacta /></div>
    </details>
  )
}

const recolhivel = 'group rounded-lg border border-border bg-card open:bg-muted/20'
const cabecaDoRecolhivel = 'flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden'
const seta = 'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none'

/** "Ouvir" o passo a passo e, quando a tarefa tem vídeo (docs/AJUDA.md §14), "Ver o vídeo" ao lado. */
function OuvirEVer({ tarefa }: { tarefa: Tarefa }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Ouvir texto={textoDaTarefa(tarefa)} />
      {tarefa.video && <VerOVideo id={tarefa.video} />}
    </div>
  )
}

/** Uma tarefa recolhida (painel). */
export function TarefaRecolhida({ tarefa }: { tarefa: Tarefa }) {
  return (
    <details className={recolhivel}>
      <summary className={cabecaDoRecolhivel}>
        <ChevronRight className={seta} aria-hidden="true" />
        <span className="min-w-0 flex-1">{tarefa.titulo}</span>
        {tarefa.quem && <SeloQuem quem={tarefa.quem} className="mt-px max-w-[45%]" />}
      </summary>
      <div className="px-3 pb-3 pl-9"><Passos tarefa={tarefa} /><OuvirEVer tarefa={tarefa} /></div>
    </details>
  )
}

/** Uma pergunta recolhida (painel). `area`: o href da área (ou 'geral'), para o voto "Isso ajudou?". */
export function PerguntaRecolhida({ pergunta, area }: { pergunta: Pergunta; area?: string | null }) {
  return (
    <details className={recolhivel}>
      <summary className={cabecaDoRecolhivel}>
        <ChevronRight className={seta} aria-hidden="true" />
        <span className="min-w-0 flex-1">{pergunta.pergunta}</span>
      </summary>
      <div className="px-3 pb-3 pl-9"><Resposta texto={pergunta.resposta} /><Ouvir texto={textoDaPergunta(pergunta)} className="mt-3" />{area !== undefined && <IssoAjudou perguntaId={pergunta.id} area={area} />}</div>
    </details>
  )
}

/**
 * Um termo do glossário recolhido (a aba "Palavras" do painel): a palavra à vista; o que ela quer dizer, o "Ouvir" e
 * o link para o glossário atrás de um clique. `aoAbrirOGlossario`: o painel fecha antes de navegar.
 */
export function TermoRecolhido({ termo, aoAbrirOGlossario }: { termo: Termo; aoAbrirOGlossario?: () => void }) {
  return (
    <details className={recolhivel} data-termo={termo.id}>
      <summary className={cabecaDoRecolhivel}>
        <ChevronRight className={seta} aria-hidden="true" />
        <span className="min-w-0 flex-1">{termo.termo}</span>
      </summary>
      <div className="px-3 pb-3 pl-9">
        <p className="text-sm leading-relaxed text-muted-foreground">{termo.definicao}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Ouvir texto={textoDoTermo(termo)} />
          <Link href={hrefDoGlossario(termo.id)} onClick={aoAbrirOGlossario} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-9">
            Ver no glossário<ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </details>
  )
}

// A âncora mira o próprio cartão; o scroll-margin deixa um respiro acima dele.
// O cartão do link acende pelo :target (link aberto do zero) e pelo
// data-ancora que AncoraDaAjuda (./ancora.tsx) põe quando se chega pelo
// painel ou pelo ⌘K, que navegam sem recarregar e não mexem no :target.
// tabIndex -1: chegando pelo link, o foco vai para a resposta (o Next e a
// AncoraDaAjuda dão o foco ao alvo), e o teclado e o leitor de tela seguem
// dali. Sem ele, o foco ficava no botão "?" que abriu o painel.
const ancorado = 'scroll-mt-6 rounded-xl border border-border bg-card p-4 shadow-xs target:border-primary/50 target:ring-2 target:ring-primary/20 data-[ancora]:border-primary/50 data-[ancora]:ring-2 data-[ancora]:ring-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5'

/** Uma tarefa aberta, com âncora (Central). */
export function TarefaAberta({ tarefa, nivel = 3 }: { tarefa: Tarefa; nivel?: 3 | 5 }) {
  const Titulo = nivel === 3 ? 'h3' : 'h5'
  return (
    <article id={tarefa.id} tabIndex={-1} className={ancorado}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <Titulo className="min-w-0 text-[15px] font-semibold leading-snug">{tarefa.titulo}</Titulo>
        {tarefa.quem && <SeloQuem quem={tarefa.quem} />}
      </div>
      <Passos tarefa={tarefa} />
      <OuvirEVer tarefa={tarefa} />
    </article>
  )
}

/**
 * Um termo aberto, com âncora (o glossário na Central, /ajuda/glossario#pauta). `areas`: onde a palavra aparece, só
 * as que a pessoa abre, com o nome do menu; `veja`: os termos que ajudam a entender este.
 */
export function TermoAberto({ termo, areas, veja }: { termo: Termo; areas: { href: string; rotulo: string }[]; veja: { id: string; termo: string }[] }) {
  return (
    <article id={termo.id} tabIndex={-1} className={ancorado}>
      <h3 className="text-[15px] font-semibold leading-snug">{termo.termo}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{termo.definicao}</p>
      <Ouvir texto={textoDoTermo(termo)} className="mt-3" />
      {(areas.length > 0 || veja.length > 0) && (
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-xs leading-relaxed">
          {areas.length > 0 && (
            <div className="flex flex-wrap gap-x-1.5"><dt className="text-muted-foreground">Aparece em:</dt>
              <dd className="contents">{areas.map((a, i) => <span key={a.href}><Link href={hrefDaAjuda(a.href)} className="font-medium text-primary hover:underline">{a.rotulo}</Link>{i < areas.length - 1 ? ',' : ''}</span>)}</dd>
            </div>
          )}
          {veja.length > 0 && (
            <div className="flex flex-wrap gap-x-1.5"><dt className="text-muted-foreground">Veja também:</dt>
              <dd className="contents">{veja.map((v, i) => <span key={v.id}><a href={`#${v.id}`} className="font-medium text-primary hover:underline">{v.termo}</a>{i < veja.length - 1 ? ',' : ''}</span>)}</dd>
            </div>
          )}
        </dl>
      )}
    </article>
  )
}

/** Uma pergunta aberta, com âncora (Central). */
export function PerguntaAberta({ pergunta, nivel = 3, area }: { pergunta: Pergunta; nivel?: 3 | 5; area?: string | null }) {
  const Titulo = nivel === 3 ? 'h3' : 'h5'
  return (
    <article id={pergunta.id} tabIndex={-1} className={ancorado}>
      <Titulo className="mb-2 text-[15px] font-semibold leading-snug">{pergunta.pergunta}</Titulo>
      <Resposta texto={pergunta.resposta} />
      <Ouvir texto={textoDaPergunta(pergunta)} className="mt-3" />
      {area !== undefined && <IssoAjudou perguntaId={pergunta.id} area={area} />}
    </article>
  )
}

/** O ícone de cada tipo de resultado da busca (o nome é ROTULO_DO_ACHADO). */
export const ICONE_DO_ACHADO = { pergunta: CircleHelp, tarefa: ListOrdered, termo: BookA } as const satisfies Record<Achado['tipo'], unknown>

/** A lista de resultados da busca na ajuda (painel e Central). */
export function ResultadosDaAjuda({ achados, busca, aoEscolher }: { achados: Achado[]; busca: string; aoEscolher?: (href: string) => void }) {
  if (!achados.length) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nada na ajuda com “{busca.trim()}”. Tente outra palavra.</p>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {achados.map((achado) => {
        const Icone = ICONE_DO_ACHADO[achado.tipo]
        return (
          <li key={achado.href}>
            <Link href={achado.href} onClick={() => aoEscolher?.(achado.href)} className="flex min-h-11 gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm outline-none hover:border-border hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50">
              <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{achado.titulo}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{ROTULO_DO_ACHADO[achado.tipo]} · {achado.onde}</span>
                <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{achado.trecho}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
