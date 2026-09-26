'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Compass, RotateCcw, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buscarNaAjuda, guiasVisiveis, hrefDaAjuda } from '@/lib/ajuda'
import { normalizar } from '@/lib/navegacao'
import { useShell } from '../app-shell'
import { useAjuda } from './ajuda'
import { ResultadosDaAjuda } from './blocos'

/**
 * As partes da Central de ajuda (/ajuda) que dependem de quem está vendo: a
 * busca e a lista de áreas saem de useShell().grupos — as áreas que a pessoa
 * pode abrir, a mesma lista do menu —, e os botões mexem no progresso da
 * ajuda (./ajuda.tsx). O resto da página é do servidor.
 */

export function BuscaDaCentral() {
  const { grupos } = useShell()
  const [busca, setBusca] = useState('')
  const buscando = normalizar(busca).split(/\s+/).some((p) => p.length > 1)
  const achados = useMemo(() => (buscando ? buscarNaAjuda(busca, grupos, 20) : []), [buscando, busca, grupos])
  return (
    <div className="max-w-2xl">
      <label className="relative block">
        <span className="sr-only">Buscar na ajuda</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Qual é a sua dúvida? Ex.: trocar a senha, pedir aprovação"
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 text-[15px] shadow-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </label>
      {buscando && (
        <div className="mt-3 rounded-xl border border-border bg-card p-2 shadow-xs">
          <p className="sr-only" role="status">{achados.length ? `${achados.length} resultado${achados.length === 1 ? '' : 's'}` : 'Nenhum resultado'}</p>
          <ResultadosDaAjuda achados={achados} busca={busca} />
        </div>
      )}
    </div>
  )
}

/** "Rever as boas-vindas" e "Recomeçar": o progresso da ajuda é da própria pessoa. */
export function BotoesDeBoasVindas() {
  const { reverBoasVindas, recomecar } = useAjuda()
  return (
    <div className="mt-4 flex flex-col gap-2">
      <Button type="button" size="lg" className="h-11 justify-start sm:h-10" onClick={reverBoasVindas}>
        <Sparkles aria-hidden="true" />Rever as boas-vindas
      </Button>
      <Button type="button" variant="outline" size="lg" className="h-11 justify-start sm:h-10" onClick={recomecar}>
        <RotateCcw aria-hidden="true" />Recomeçar as boas-vindas e os tours
      </Button>
    </div>
  )
}

/**
 * Liga e desliga a tecla "?". Atalho de uma tecla só precisa poder ser
 * desligado (WCAG 2.1.4): quem dita texto abriria a ajuda a cada "?" falado.
 */
export function AtalhoDaAjuda() {
  const { atalhoLigado, ligarAtalho } = useAjuda()
  return (
    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
      <input type="checkbox" checked={atalhoLigado} onChange={(e) => ligarAtalho(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary sm:size-4" />
      <span>
        <span className="block font-medium">Abrir a ajuda com a tecla ?</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Desligue se você dita texto ou aperta sem querer. O botão “?” no alto continua valendo.</span>
      </span>
    </label>
  )
}

/** As áreas com ajuda escrita que a pessoa pode abrir, agrupadas como no menu. */
export function AreasDaCentral() {
  const { grupos } = useShell()
  const lista = guiasVisiveis(grupos)
  const porGrupo = grupos
    .map((grupo) => ({ grupo, itens: lista.filter((x) => x.grupo.id === grupo.id) }))
    .filter((g) => g.itens.length)

  return (
    <section aria-labelledby="secao-ajuda-por-area" className="mt-12">
      <h2 id="secao-ajuda-por-area" className="text-lg font-semibold">Ajuda por área</h2>
      <p className="mt-1 text-sm text-muted-foreground">Só aparecem as áreas que o seu acesso abre.</p>
      {!porGrupo.length && <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Os guias das áreas ainda estão sendo escritos. Enquanto isso, a ajuda geral está logo abaixo.</p>}
      <div className="mt-5 flex flex-col gap-8">
        {porGrupo.map(({ grupo, itens }) => (
          <div key={grupo.id}>
            {/* O grupo sem título no menu é o do dia de cada pessoa (Início, Aprovações…). */}
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{grupo.rotulo ?? 'Meu dia'}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {itens.map(({ area, guia }) => {
                const Icone = area.icone
                const perguntas = guia.perguntas.length
                return (
                  <li key={area.href}>
                    <Link href={hrefDaAjuda(area.href)} className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-xs outline-none transition-colors hover:border-primary/40 hover:bg-primary/[0.02] focus-visible:ring-2 focus-visible:ring-ring/50">
                      <span className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true"><Icone className="size-[18px]" /></span>
                        <span className="min-w-0 flex-1 font-semibold leading-snug">{area.rotulo}</span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none" aria-hidden="true" />
                      </span>
                      <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{guia.paraQueServe}</span>
                      <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-muted-foreground">
                        {guia.tour.length > 0 && <><Compass className="size-3.5" aria-hidden="true" />Tour ·</>}
                        {' '}{perguntas} pergunta{perguntas === 1 ? '' : 's'}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
