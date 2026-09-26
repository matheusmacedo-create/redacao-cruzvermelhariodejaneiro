'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Compass, Lightbulb, LogIn, Mail, MessageCirclePlus, Search, type LucideIcon } from 'lucide-react'
import { GUIAS_DO_MEMBRO, TOPICOS_DO_MEMBRO, buscarNaAjudaDoMembro, normalizarBusca, type AchadoDoMembro } from '@/lib/ajuda/membro'
import type { GuiaDaArea, Pergunta, Tarefa, TopicoGeral } from '@/lib/ajuda/tipos'
import { cn } from '@/lib/utils'
import { BotaoDeBoasVindas } from './ajuda'
import { botaoFantasma, botaoSecundario, campoDoMembro } from './marca'
import { SECOES } from './navegacao'
import { CabecalhoDaPagina, EstadoVazio, Recado, Selo } from './pecas'

/**
 * A página de Ajuda da Área do Voluntário (/membro/ajuda): uma seção por
 * destino (para que serve, "Fazer o tour", passo a passo e perguntas), os
 * tópicos gerais (entrar e sair, e-mails, tours) e a busca. Tudo vem de
 * lib/ajuda/membro.ts. Cada tarefa e cada pergunta tem âncora pelo `id`
 * (/membro/ajuda#lista-de-espera), que abre a resposta ao chegar.
 */

const ICONES_DOS_TOPICOS: Record<string, LucideIcon> = { 'entrar-e-sair': LogIn, 'emails-da-area': Mail, 'tours-e-ajuda': Compass }

type Parte = { id: string; rotulo: string; icone: LucideIcon }

const nomeDoDestino = (href: string) => SECOES.find((s) => s.href === href)?.rotulo ?? href
/** 'ajuda-formacao', 'ajuda-entrar-e-sair': a âncora de cada seção (não colide com os ids das perguntas). */
const idDaParte = (texto: string) => `ajuda-${normalizarBusca(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

const PARTES_DOS_DESTINOS: (Parte & { guia: GuiaDaArea })[] = GUIAS_DO_MEMBRO.map((guia) => {
  const secao = SECOES.find((s) => s.href === guia.href)
  return { guia, id: idDaParte(secao?.rotulo ?? guia.href), rotulo: secao?.rotulo ?? guia.href, icone: secao?.icone ?? Compass }
})
const PARTES_DOS_TOPICOS: (Parte & { topico: TopicoGeral })[] = TOPICOS_DO_MEMBRO.map((topico) => (
  { topico, id: idDaParte(topico.id), rotulo: topico.titulo, icone: ICONES_DOS_TOPICOS[topico.id] ?? Compass }
))

const ondeLegivel = (onde: string) => (onde.startsWith('/') ? nomeDoDestino(onde) : TOPICOS_DO_MEMBRO.find((t) => t.id === onde)?.titulo ?? '')

export function CentralDeAjuda() {
  const [busca, setBusca] = useState('')
  const achados = useMemo(() => buscarNaAjudaDoMembro(busca), [busca])
  const buscando = normalizarBusca(busca).split(/\s+/).some((p) => p.length > 1)

  // Chegou com #id (link mandado numa conversa, "Ver resposta"): abre a resposta e rola até ela.
  useEffect(() => {
    function abrirDoEndereco() {
      // Um endereço malformado (#%E0, colado pela metade) faz o decode lançar
      // e derrubaria a página inteira: ali só não há resposta a abrir.
      let id = ''
      try { id = decodeURIComponent(window.location.hash.slice(1)) } catch { return }
      if (!id) return
      const el = document.getElementById(id)
      if (!(el instanceof HTMLDetailsElement)) return
      el.open = true
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: suave ? 'smooth' : 'auto' })
      el.querySelector('summary')?.focus({ preventScroll: true })
    }
    abrirDoEndereco()
    window.addEventListener('hashchange', abrirDoEndereco)
    return () => window.removeEventListener('hashchange', abrirDoEndereco)
  }, [])

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <CabecalhoDaPagina titulo="Ajuda" descricao="O passo a passo de cada parte da área e as perguntas mais comuns." />

      <div role="search" className="flex flex-col gap-1.5">
        <label htmlFor="busca-na-ajuda" className="text-sm font-medium">Buscar na ajuda</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input id="busca-na-ajuda" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" enterKeyHint="search"
            placeholder="Ex.: certificado, lista de espera, código" className={cn(campoDoMembro, 'pl-9')} />
        </div>
        {/* Sempre na página (vazia sem busca): região que já existe é a que o leitor de tela anuncia. */}
        <p role="status" className="sr-only">{buscando ? (achados.length ? `${achados.length} ${achados.length === 1 ? 'resultado' : 'resultados'}` : 'Nada encontrado') : ''}</p>
      </div>

      {buscando ? <Resultados busca={busca} achados={achados} /> : (
        <>
          <section aria-labelledby="primeira-vez-titulo" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0">
              <h2 id="primeira-vez-titulo" className="font-semibold">Primeira vez por aqui?</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Em um minuto, o tour de boas-vindas mostra onde fica cada coisa.</p>
            </div>
            <BotaoDeBoasVindas className="w-full shrink-0 sm:w-auto" />
          </section>

          <nav aria-label="Partes da ajuda">
            <ul className="flex flex-wrap gap-2">
              {[...PARTES_DOS_DESTINOS, ...PARTES_DOS_TOPICOS].map(({ id, rotulo, icone: Icone }) => (
                <li key={id}>
                  <a href={`#${id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
                    <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{rotulo}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {PARTES_DOS_DESTINOS.map(({ guia, id, rotulo, icone }) => <SecaoDoDestino key={id} id={id} rotulo={rotulo} icone={icone} guia={guia} />)}
          {PARTES_DOS_TOPICOS.map(({ topico, id, rotulo, icone }) => (
            <SecaoDaAjuda key={id} id={id} rotulo={rotulo} icone={icone} resumo={topico.resumo} tarefas={topico.tarefas} perguntas={topico.perguntas} />
          ))}
        </>
      )}

      <Recado tipo="info" vivo={false} titulo="Não achou?"
        acao={<Link href="/membro/mensagens?nova=duvida" className={botaoSecundario}><MessageCirclePlus className="size-4" aria-hidden="true" />Falar com a coordenação</Link>}>
        <p>Escreva para a coordenação do Voluntariado. A resposta chega em “Mensagens” e no seu e-mail.</p>
      </Recado>
    </div>
  )
}

/** Um destino: o que a seção comum mostra, mais o "Fazer o tour" (e o das telas internas de endereço fixo). */
function SecaoDoDestino({ id, rotulo, icone, guia }: { id: string; rotulo: string; icone: LucideIcon; guia: GuiaDaArea }) {
  // Tela com `[id]` (um curso, uma conversa) não tem link fixo: o tour dela abre pelo menu da conta, em "Tour desta tela".
  const telas = (guia.telas ?? []).filter((t) => t.tour.length && !t.caminho.includes('['))
  return (
    <SecaoDaAjuda id={id} rotulo={rotulo} icone={icone} resumo={guia.paraQueServe} quem={guia.quemUsa} tarefas={guia.tarefas} perguntas={guia.perguntas}
      tours={guia.tour.length || telas.length ? (
        <div className="flex flex-wrap gap-2">
          {guia.tour.length > 0 && (
            <Link href={`${guia.href}?tour=1`} className={botaoSecundario}><Compass className="size-4 shrink-0" aria-hidden="true" />Fazer o tour<span className="sr-only"> de {rotulo}</span></Link>
          )}
          {telas.map((t) => <Link key={t.caminho} href={`${t.caminho}?tour=1`} className={cn(botaoFantasma, 'px-3')}>Tour de {t.rotulo}</Link>)}
        </div>
      ) : undefined} />
  )
}

function SecaoDaAjuda({ id, rotulo, icone: Icone, resumo, quem, tours, tarefas, perguntas }: {
  id: string; rotulo: string; icone: LucideIcon; resumo: string; quem?: string; tours?: React.ReactNode; tarefas: Tarefa[]; perguntas: Pergunta[]
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icone className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="text-lg font-semibold leading-snug">{rotulo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{resumo}</p>
          {quem && <p className="mt-1 text-sm text-muted-foreground">{quem}</p>}
        </div>
      </div>
      {tours}
      {tarefas.length > 0 && (
        <div className="flex flex-col">
          <h3 className="mb-1 text-sm font-semibold">Como fazer</h3>
          {tarefas.map((t) => <ItemDeTarefa key={t.id} t={t} />)}
        </div>
      )}
      {perguntas.length > 0 && (
        <div className="flex flex-col">
          <h3 className="mb-1 text-sm font-semibold">Perguntas frequentes</h3>
          {perguntas.map((p) => <ItemDePergunta key={p.id} p={p} />)}
        </div>
      )}
    </section>
  )
}

const caixaDoItem = 'group scroll-mt-4 border-t border-border first-of-type:border-t-0'
const resumoDoItem = '-mx-2 flex min-h-12 cursor-pointer list-none items-start gap-2 rounded-lg px-2 py-3 text-sm font-medium hover:bg-muted/60 [&::-webkit-details-marker]:hidden'
const setaDoItem = 'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none'

/** "Como fazer": o título abre os passos numerados e a dica. */
function ItemDeTarefa({ t, onde, aberto }: { t: Tarefa; onde?: string; aberto?: boolean }) {
  return (
    <details id={t.id} open={aberto} className={caixaDoItem}>
      <summary className={resumoDoItem}>
        <ChevronRight className={setaDoItem} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {onde && <span className="block text-xs font-normal text-muted-foreground">{onde} · Como fazer</span>}
          {t.titulo}
          {t.quem && <Selo icone={Lightbulb} className="ml-2 align-middle">{t.quem}</Selo>}
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-4 pl-6 text-sm">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:font-semibold marker:text-muted-foreground">
          {t.passos.map((passo, i) => <li key={i} className="pl-1">{passo}</li>)}
        </ol>
        {t.dica && (
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span><span className="sr-only">Dica: </span>{t.dica}</span>
          </p>
        )}
      </div>
    </details>
  )
}

/** Uma pergunta frequente: o título abre a resposta (parágrafos separados por linha em branco). */
function ItemDePergunta({ p, onde, aberto }: { p: Pergunta; onde?: string; aberto?: boolean }) {
  return (
    <details id={p.id} open={aberto} className={caixaDoItem}>
      <summary className={resumoDoItem}>
        <ChevronRight className={setaDoItem} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {onde && <span className="block text-xs font-normal text-muted-foreground">{onde} · Pergunta</span>}
          {p.pergunta}
        </span>
      </summary>
      <div className="flex flex-col gap-2 pb-4 pl-6 text-sm">
        {p.resposta.split('\n\n').map((paragrafo, i) => <p key={i}>{paragrafo}</p>)}
      </div>
    </details>
  )
}

/** Os achados da busca, no lugar das seções. Poucos achados já vêm abertos. */
function Resultados({ busca, achados }: { busca: string; achados: AchadoDoMembro[] }) {
  if (!achados.length) {
    return (
      <EstadoVazio icone={Search} titulo={`Nada encontrado para “${busca.trim()}”`}
        texto="Tente outras palavras, como “certificado”, “vaga” ou “código”. Ou escreva para a coordenação." />
    )
  }
  const abrir = achados.length <= 3
  return (
    <section aria-labelledby="resultados-titulo" className="flex flex-col gap-2">
      <h2 id="resultados-titulo" className="text-base font-semibold">{achados.length === 1 ? '1 resultado' : `${achados.length} resultados`}</h2>
      <div className="flex flex-col rounded-xl border border-border bg-card px-4 sm:px-5">
        {achados.map((a) => a.tipo === 'pergunta'
          ? <ItemDePergunta key={`p-${a.item.id}`} p={a.item} onde={ondeLegivel(a.onde)} aberto={abrir} />
          : <ItemDeTarefa key={`t-${a.item.id}`} t={a.item} onde={ondeLegivel(a.onde)} aberto={abrir} />)}
      </div>
    </section>
  )
}
