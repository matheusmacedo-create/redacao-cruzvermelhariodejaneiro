'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { ArrowRight, BookOpen, Check, CircleHelp, Compass, LifeBuoy, MessagesSquare, Search, Sparkles, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ajudaDoCaminho, buscarNaAjuda, hrefDaAjuda, rotuloDoTour, topicosGerais, type AjudaDaTela } from '@/lib/ajuda'
import { normalizar } from '@/lib/navegacao'
import { useShell } from '../app-shell'
import { useAjuda } from './ajuda'
import { avisarResposta } from './ancora'
import { PerguntaRecolhida, ResultadosDaAjuda, TarefaRecolhida, tituloDeSecao } from './blocos'

/**
 * O miolo do painel "?" (./painel.tsx): fica num arquivo à parte porque traz
 * o texto de toda a ajuda (lib/ajuda) — só é baixado quando o painel abre.
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
          <Dialog.Description className="truncate text-xs text-muted-foreground">{ondeEstou ? `Você está em ${ondeEstou}` : 'Ajuda geral da Redação'}</Dialog.Description>
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
          <div className="flex flex-col gap-7">
            <PrimeirosPassos />
            {daTela?.guia ? <AjudaDaArea daTela={daTela} /> : <AjudaGeral daTela={daTela} />}
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
          ? <Link href="/chat" onClick={fecharPainel} className={linkDoRodape}><MessagesSquare className="size-4" aria-hidden="true" />Ainda com dúvida? Pergunte no Chat</Link>
          : <Link href="/chamados/novo?fila=ti" onClick={fecharPainel} className={linkDoRodape}><LifeBuoy className="size-4" aria-hidden="true" />Ainda com dúvida? Abra um chamado para a TI</Link>}
      </footer>
    </>
  )
}

const linkDoRodape = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9'

/** A ajuda da área aberta: para que serve, o tour, o passo a passo e as perguntas. */
function AjudaDaArea({ daTela }: { daTela: AjudaDaTela }) {
  const pathname = usePathname()
  const { iniciarTour, fecharPainel } = useAjuda()
  // Ids próprios: o painel abre por cima da Central, que tem seções com nomes parecidos.
  const id = useId()
  if (!daTela.guia) return null
  const { area, guia, tela } = daTela
  const Icone = area.icone
  const naRaiz = pathname === area.href
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
        <p className="text-sm leading-relaxed">{guia.paraQueServe}</p>
        {guia.quemUsa && <p className="text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">Quem usa: </span>{guia.quemUsa}</p>}
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
      </section>

      {guia.tarefas.length > 0 && (
        <section aria-labelledby={`${id}-passos`} className="flex flex-col gap-2">
          <h2 id={`${id}-passos`} className={tituloDeSecao}>Passo a passo</h2>
          {guia.tarefas.map((t) => <TarefaRecolhida key={t.id} tarefa={t} />)}
        </section>
      )}

      {guia.perguntas.length > 0 && (
        <section aria-labelledby={`${id}-perguntas`} className="flex flex-col gap-2">
          <h2 id={`${id}-perguntas`} className={tituloDeSecao}>Perguntas frequentes</h2>
          {guia.perguntas.map((p) => <PerguntaRecolhida key={p.id} pergunta={p} />)}
        </section>
      )}

      <Link href={hrefDaAjuda(area.href)} onClick={fecharPainel} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline">
        Ver tudo sobre {area.rotulo} na Central de ajuda<ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </>
  )
}

/** Numa tela sem guia (ou fora de qualquer área): a ajuda que vale em toda a Redação. */
function AjudaGeral({ daTela }: { daTela: AjudaDaTela | null }) {
  const { equipeDaEscola } = useShell()
  const id = useId()
  const semGuia = daTela && daTela.area.href !== '/ajuda' ? daTela.area.rotulo : null
  return (
    <>
      {semGuia && <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">“{semGuia}” ainda não tem um guia próprio. Aqui vai o que vale em toda a Redação.</p>}
      {topicosGerais(equipeDaEscola).map((topico) => (
        <section key={topico.id} aria-labelledby={`${id}-${topico.id}`} className="flex flex-col gap-2">
          <h2 id={`${id}-${topico.id}`} className={tituloDeSecao}>{topico.titulo}</h2>
          <p className="mb-1 text-sm leading-relaxed text-muted-foreground">{topico.resumo}</p>
          {topico.tarefas.map((t) => <TarefaRecolhida key={t.id} tarefa={t} />)}
          {topico.perguntas.map((p) => <PerguntaRecolhida key={p.id} pergunta={p} />)}
        </section>
      ))}
    </>
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
