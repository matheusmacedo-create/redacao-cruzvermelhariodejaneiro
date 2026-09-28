'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Compass, LifeBuoy, MessageSquareHeart, MessagesSquare, Search, Sparkles, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ajudaDoCaminho, buscarNaAjuda, hrefDaAjuda, rotuloDoTour, topicosGerais, type AjudaDaTela, type GuiaDaArea, type TopicoGeral } from '@/lib/ajuda'
import { resumoEDetalhe } from '@/lib/ajuda/texto'
import { normalizar } from '@/lib/navegacao'
import { useShell } from '../app-shell'
import { useAjuda } from './ajuda'
import { avisarResposta } from './ancora'
import { HistoriaRecolhida, PerguntaRecolhida, ResultadosDaAjuda, TarefaRecolhida, tituloDeSecao } from './blocos'
import { FormularioDoBeta } from './beta'

/**
 * O miolo do painel "?" (./painel.tsx): fica num arquivo à parte porque traz
 * o texto de toda a ajuda (lib/ajuda) — só é baixado quando o painel abre.
 *
 * A ordem, de cima para baixo, é uma coisa de cada vez (docs/AJUDA.md §11):
 * a busca; os "Primeiros passos" (só enquanto faltam); a área, numa frase,
 * com o tour e o "Na prática"; "Como fazer" e "Dúvidas" em abas, com seis
 * itens à vista e o resto atrás de "Mostrar as outras"; e, no fim, um único
 * lugar para falar com a equipe ("Conte para a equipe"). Numa tela sem
 * guia, a ajuda geral, um tópico por vez.
 */
export function ConteudoDoPainel() {
  const { grupos, equipeDaEscola } = useShell()
  const pathname = usePathname()
  const { fecharPainel, reverBoasVindas, pessoa } = useAjuda()
  const daTela = useMemo(() => ajudaDoCaminho(pathname, grupos), [pathname, grupos])
  const [busca, setBusca] = useState('')
  // A busca ignora palavras de uma letra; abaixo disso, o painel continua mostrando a tela.
  const buscando = normalizar(busca).split(/\s+/).some((p) => p.length > 1)
  const achados = useMemo(() => (buscando ? buscarNaAjuda(busca, grupos, { limite: 15, equipeDaEscola }) : []), [buscando, busca, grupos, equipeDaEscola])
  // Resultado novo começa do topo: quem desceu pela ajuda da tela e depois
  // digitou na busca caía no meio da lista, com as melhores respostas escondidas em cima.
  const rolagem = useRef<HTMLDivElement>(null)
  useEffect(() => { rolagem.current?.scrollTo({ top: 0 }) }, [busca])
  const ondeEstou = daTela ? (daTela.tela ? `${daTela.area.rotulo} › ${daTela.tela.rotulo}` : daTela.area.rotulo) : null

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true"><CircleHelp className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <Dialog.Title className="text-base font-semibold leading-tight">Ajuda</Dialog.Title>
          <Dialog.Description className="truncate text-xs text-muted-foreground">{ondeEstou ? `Você está em ${ondeEstou}` : 'Ajuda geral do Palácio Virtual'}</Dialog.Description>
        </div>
        <Dialog.Close aria-label="Fechar a ajuda" className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <X className="size-[18px]" aria-hidden="true" />
        </Dialog.Close>
      </header>

      <div className="shrink-0 border-b border-border px-4 py-3">
        <label className="relative block">
          <span className="sr-only">Buscar em toda a ajuda</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar em toda a ajuda…"
            enterKeyHint="search"
            className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 sm:h-10"
          />
        </label>
      </div>

      {/* Sempre no painel (vazia sem busca): região que entra já preenchida o leitor de tela não anuncia. */}
      <p className="sr-only" role="status">{!buscando ? '' : achados.length ? `${achados.length} resultado${achados.length === 1 ? '' : 's'}` : 'Nenhum resultado'}</p>
      <div ref={rolagem} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {buscando ? (
          <ResultadosDaAjuda achados={achados} busca={busca} aoEscolher={(href) => { fecharPainel(); avisarResposta(href) }} />
        ) : (
          <div className="flex flex-col gap-6">
            <PrimeirosPassos />
            {daTela?.guia ? <AjudaDaArea key={daTela.area.href} daTela={daTela} /> : <AjudaGeral daTela={daTela} />}
            <ConteParaAEquipe area={daTela?.area.href ?? null} />
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm">
        <div className="flex flex-wrap items-center">
          <Link href="/ajuda" onClick={fecharPainel} className={linkDoRodape}><BookOpen className="size-4" aria-hidden="true" />Central de ajuda</Link>
          <button type="button" onClick={reverBoasVindas} className={linkDoRodape}><Sparkles className="size-4" aria-hidden="true" />Rever as boas-vindas</button>
        </div>
        {/* A equipe da escola não abre chamados (a página manda de volta para a Escola): para ela, o Chat. */}
        {pessoa.equipeDaEscola
          ? <Link href="/chat" onClick={fecharPainel} className={linkDoRodape}><MessagesSquare className="size-4" aria-hidden="true" />Falar com a equipe no Chat</Link>
          : <Link href="/chamados/novo?fila=ti" onClick={fecharPainel} className={linkDoRodape}><LifeBuoy className="size-4" aria-hidden="true" />Algo não funciona? Abra um chamado para a TI</Link>}
      </footer>
    </>
  )
}

const linkDoRodape = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9'

/** "Ler mais": o resto do "para que serve" e o "quem usa", atrás de um clique. */
const lerMais = 'group -mx-1 rounded-md px-1'
const cabecaDoLerMais = 'inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden'

/** A ajuda da área aberta: uma frase sobre a área, o tour, o "Na prática" e as abas "Como fazer" e "Dúvidas". */
function AjudaDaArea({ daTela }: { daTela: AjudaDaTela }) {
  const pathname = usePathname()
  const { iniciarTour, fecharPainel } = useAjuda()
  // Ids próprios: o painel abre por cima da Central, que tem seções com nomes parecidos.
  const id = useId()
  if (!daTela.guia) return null
  const { area, guia, tela } = daTela
  const Icone = area.icone
  const naRaiz = pathname === area.href
  const { resumo, detalhe } = resumoEDetalhe(guia.paraQueServe)
  const temMais = Boolean(detalhe || guia.quemUsa)
  return (
    <>
      <section aria-labelledby={`${id}-area`} className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary" aria-hidden="true"><Icone className="size-5" /></span>
          <div className="min-w-0">
            <h2 id={`${id}-area`} className="text-lg font-semibold leading-tight">{area.rotulo}</h2>
            {tela && <p className="mt-0.5 text-xs text-muted-foreground">Nesta tela: {tela.rotulo}</p>}
          </div>
        </div>
        <p className="text-sm leading-relaxed">{resumo}</p>
        {temMais && (
          <details className={lerMais} data-ler-mais>
            <summary className={cabecaDoLerMais}><ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />Ler mais sobre {area.rotulo}</summary>
            <div className="mt-1 flex flex-col gap-2 pb-1 text-sm leading-relaxed text-muted-foreground">
              {detalhe && <p>{detalhe}</p>}
              {guia.quemUsa && <p><span className="font-medium text-foreground">Quem usa: </span>{guia.quemUsa}</p>}
            </div>
          </details>
        )}
        {daTela.tour.length > 0 ? (
          <Button type="button" size="lg" className="h-11 self-start sm:h-10" onClick={() => iniciarTour({ passos: daTela.tour, rotulo: rotuloDoTour(daTela), chave: daTela.chave })}>
            <Compass aria-hidden="true" />Fazer o tour desta tela
          </Button>
        ) : guia.tour.length > 0 && !naRaiz ? (
          // Numa tela interna sem tour próprio, o tour da área está a um clique (na tela dela).
          // <Link> com as classes do botão, e não <Button render>: continua sendo anunciado como link.
          <Link href={`${area.href}?tour=1`} onClick={fecharPainel} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 self-start sm:h-10')}>
            <Compass aria-hidden="true" />Fazer o tour de {area.rotulo}
          </Link>
        ) : null}
        {guia.naPratica && <HistoriaRecolhida historia={guia.naPratica} />}
      </section>

      <ComoFazerEDuvidas guia={guia} area={area.href} />

      <Link href={hrefDaAjuda(area.href)} onClick={fecharPainel} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline">
        Ver tudo sobre {area.rotulo} na Central de ajuda<ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </>
  )
}

/** Quantas tarefas ou perguntas ficam à vista antes de "Mostrar as outras". */
const A_VISTA = 6

type Aba = { id: 'fazer' | 'duvidas'; rotulo: string; total: number }

/**
 * "Como fazer" e "Dúvidas" em abas: uma lista de cada vez, em vez de trinta
 * cartões enfileirados. Seis à vista; o resto atrás de "Mostrar as outras N".
 * Com só um dos dois, vira uma seção comum, sem abas.
 */
function ComoFazerEDuvidas({ guia, area }: { guia: GuiaDaArea; area: string }) {
  const id = useId()
  const abas: Aba[] = [
    ...(guia.tarefas.length ? [{ id: 'fazer' as const, rotulo: 'Como fazer', total: guia.tarefas.length }] : []),
    ...(guia.perguntas.length ? [{ id: 'duvidas' as const, rotulo: 'Dúvidas', total: guia.perguntas.length }] : []),
  ]
  const [aba, setAba] = useState<Aba['id']>(abas[0]?.id ?? 'fazer')
  const [todas, setTodas] = useState(false)
  if (!abas.length) return null
  const escolher = (nova: Aba['id']) => { setAba(nova); setTodas(false) }
  const total = aba === 'fazer' ? guia.tarefas.length : guia.perguntas.length
  const escondidas = todas ? 0 : Math.max(0, total - A_VISTA)
  const lista = aba === 'fazer'
    ? guia.tarefas.slice(0, todas ? undefined : A_VISTA).map((t) => <TarefaRecolhida key={t.id} tarefa={t} />)
    : guia.perguntas.slice(0, todas ? undefined : A_VISTA).map((p) => <PerguntaRecolhida key={p.id} pergunta={p} area={area} />)
  const mostrarMais = escondidas > 0 && (
    <button type="button" onClick={() => setTodas(true)} className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/[0.06] focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9">
      <ChevronRight className="size-4" aria-hidden="true" />Mostrar {escondidas === 1 ? 'a outra' : `as outras ${escondidas}`}
    </button>
  )

  if (abas.length === 1) {
    return (
      <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-2">
        <h2 id={`${id}-titulo`} className={tituloDeSecao}>{abas[0].rotulo} ({abas[0].total})</h2>
        {lista}
        {mostrarMais}
      </section>
    )
  }
  return (
    <section aria-label="Como fazer e dúvidas" className="flex flex-col gap-2">
      <div role="tablist" aria-label="Como fazer ou dúvidas" className="flex gap-1 rounded-lg bg-muted p-1" data-abas-da-ajuda
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const i = abas.findIndex((a) => a.id === aba)
          const proxima = abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length]
          escolher(proxima.id)
          ;(e.currentTarget.querySelector(`[data-aba="${proxima.id}"]`) as HTMLElement | null)?.focus()
        }}>
        {abas.map((a) => (
          <button key={a.id} type="button" role="tab" id={`${id}-aba-${a.id}`} data-aba={a.id} aria-selected={aba === a.id} aria-controls={`${id}-painel-${a.id}`} tabIndex={aba === a.id ? 0 : -1}
            onClick={() => escolher(a.id)}
            className={cn('inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-8', aba === a.id ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
            {a.rotulo}<span className={cn('text-xs tabular-nums', aba === a.id ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{a.total}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-painel-${aba}`} aria-labelledby={`${id}-aba-${aba}`} className="flex flex-col gap-2">
        {lista}
        {mostrarMais}
      </div>
    </section>
  )
}

/** Numa tela sem guia (ou fora de qualquer área): a ajuda geral, um tópico por vez. */
function AjudaGeral({ daTela }: { daTela: AjudaDaTela | null }) {
  const { equipeDaEscola } = useShell()
  const semGuia = daTela && daTela.area.href !== '/ajuda' ? daTela.area.rotulo : null
  return (
    <section aria-label="Ajuda geral" className="flex flex-col gap-2">
      {semGuia && <p className="mb-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">“{semGuia}” ainda não tem um guia próprio. Aqui vai o que vale em todo o Palácio Virtual.</p>}
      <h2 className={tituloDeSecao}>Ajuda geral</h2>
      {topicosGerais(equipeDaEscola).map((topico) => <TopicoRecolhido key={topico.id} topico={topico} />)}
    </section>
  )
}

/** Um tópico da ajuda geral recolhido: o título e o resumo à vista, o resto atrás de um clique. */
function TopicoRecolhido({ topico }: { topico: TopicoGeral }) {
  return (
    <details className="group rounded-lg border border-border bg-card open:bg-muted/20" data-topico-geral>
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-lg px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block font-medium">{topico.titulo}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{topico.resumo}</span></span>
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3 pl-9">
        {(topico.naPratica ?? []).map((h) => <HistoriaRecolhida key={h.titulo} historia={h} />)}
        {topico.tarefas.map((t) => <TarefaRecolhida key={t.id} tarefa={t} />)}
        {topico.perguntas.map((p) => <PerguntaRecolhida key={p.id} pergunta={p} area="geral" />)}
      </div>
    </details>
  )
}

/**
 * O único lugar do painel para falar com a equipe: dúvida, problema, ideia
 * ou elogio, com a nota da tela se quiser. É o mesmo formulário do "Beta" do
 * topo (que no celular não existe: o topo não tem espaço). Antes eram três
 * formulários parecidos enfileirados — o Beta, "O que achou desta tela?" e
 * "Pergunte à equipe" —, e ninguém sabia qual usar.
 */
function ConteParaAEquipe({ area }: { area: string | null }) {
  return (
    <details className="group rounded-xl border border-primary/30 bg-primary/[0.04]" data-conte-para-a-equipe>
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2.5 px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <MessageSquareHeart className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block font-semibold text-primary">Não achou? Conte para a equipe</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Uma dúvida, um problema, uma ideia ou um elogio sobre esta tela. A resposta chega no sino.</span></span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t border-primary/20 px-4 py-4"><FormularioDoBeta noPainel area={area} tipoInicial="duvida" /></div>
    </details>
  )
}

// “Fazer” e “Ver agora”: 44 px de toque no celular, como a dica e o rodapé do painel.
const acaoDoPasso = '-my-1 inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/[0.06] focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9'

/** Os três primeiros passos de quem acabou de chegar. Some quando os três estão feitos. */
function PrimeirosPassos() {
  const { progresso, pessoa, reverBoasVindas, fecharPainel } = useAjuda()
  const id = useId()
  const itens = [
    { id: 'boas-vindas', feito: Boolean(progresso.boasVindas), rotulo: 'Ver as boas-vindas', porque: 'Um minuto para saber onde fica cada coisa.' },
    { id: 'email', feito: pessoa.emailConfirmado, rotulo: 'Confirmar o e-mail de recuperação', porque: 'Sem ele, “Esqueci minha senha” não tem para onde mandar o link.', href: '/perfil#email-de-recuperacao' },
    { id: 'foto', feito: pessoa.temFoto, rotulo: 'Pôr uma foto no perfil', porque: 'Para a equipe reconhecer você nas conversas e nas pautas.', href: '/perfil' },
  ]
  const feitos = itens.filter((i) => i.feito).length
  if (feitos === itens.length) return null
  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-titulo`} className="text-sm font-semibold">Primeiros passos</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{feitos} de {itens.length}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(feitos / itens.length) * 100}%` }} />
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {itens.map((item) => (
          <li key={item.id} className="flex items-start gap-3 text-sm">
            <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border', item.feito ? 'border-success bg-success text-success-foreground' : 'border-border')} aria-hidden="true">
              {item.feito && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block font-medium leading-snug', item.feito && 'text-muted-foreground')}>{item.rotulo}<span className="sr-only">{item.feito ? ' (feito)' : ' (a fazer)'}</span></span>
              {!item.feito && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.porque}</span>}
            </span>
            {!item.feito && (item.href
              ? <Link href={item.href} onClick={fecharPainel} className={acaoDoPasso}>Fazer</Link>
              : <button type="button" onClick={reverBoasVindas} className={acaoDoPasso}>Ver agora</button>)}
          </li>
        ))}
      </ul>
    </section>
  )
}
