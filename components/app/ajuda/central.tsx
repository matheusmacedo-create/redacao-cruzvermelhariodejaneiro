'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, RotateCcw, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { normalizar } from '@/lib/navegacao'
import { useShell } from '../app-shell'
import { useAjuda } from './ajuda'
import { avisarResposta } from './ancora'
import { ResultadosDaAjuda } from './blocos'
import { adiantarAjuda, carregarAjuda, type ModuloDaAjuda } from './carregar'

/**
 * As partes da Central de ajuda (/ajuda) que rodam no navegador: a busca e
 * os botões que mexem no progresso da ajuda (./ajuda.tsx). O resto da página,
 * inclusive a lista de áreas e a ajuda geral, é desenhado no servidor.
 *
 * Nada aqui importa lib/ajuda de forma estática: o texto inteiro (~140 KB
 * comprimidos) só vem quando a pessoa vai buscar (./carregar.ts), como no
 * resto da Redação. Antes, ele chegava duas vezes: no HTML da página e no JS.
 */

export function BuscaDaCentral() {
  const { grupos, equipeDaEscola } = useShell()
  const [busca, setBusca] = useState('')
  const buscando = normalizar(busca).split(/\s+/).some((p) => p.length > 1)
  // A busca precisa do texto: baixado ao entrar no campo (quem entra vai digitar) e esperado na primeira letra.
  const [buscarNaAjuda, setBuscarNaAjuda] = useState<ModuloDaAjuda['buscarNaAjuda'] | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    if (!buscando || buscarNaAjuda) return
    let valendo = true
    carregarAjuda()
      .then((m) => { if (valendo) { setBuscarNaAjuda(() => m.buscarNaAjuda); setFalhou(false) } })
      .catch(() => { if (valendo) setFalhou(true) })
    return () => { valendo = false }
  }, [buscando, buscarNaAjuda, tentativa])
  const achados = useMemo(() => (buscando && buscarNaAjuda ? buscarNaAjuda(busca, grupos, { limite: 20, equipeDaEscola }) : []), [buscando, busca, grupos, equipeDaEscola, buscarNaAjuda])
  const pronta = Boolean(buscarNaAjuda)
  const contagem = !buscando || !pronta ? '' : achados.length ? `${achados.length} resultado${achados.length === 1 ? '' : 's'}` : 'Nenhum resultado'
  return (
    <div className="max-w-2xl">
      <label className="relative block">
        <span className="sr-only">Buscar na ajuda</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onFocus={adiantarAjuda}
          placeholder="Qual é a sua dúvida? Ex.: trocar a senha, pedir aprovação"
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 text-[15px] shadow-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </label>
      {/* Sempre na página (vazia sem busca): região que entra já preenchida o leitor de tela não anuncia. */}
      <p className="sr-only" role="status">{falhou && buscando ? 'Não deu para carregar a busca' : contagem}</p>
      {buscando && (
        <div className="mt-3 rounded-xl border border-border bg-card p-2 shadow-xs">
          {pronta ? (
            <ResultadosDaAjuda achados={achados} busca={busca} aoEscolher={avisarResposta} />
          ) : falhou ? (
            <div className="flex flex-col items-center gap-3 px-1 py-6 text-center text-sm text-muted-foreground">
              <p>Não deu para carregar a busca. Confira a conexão e tente de novo.</p>
              <button type="button" onClick={() => { setFalhou(false); setTentativa((n) => n + 1) }} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9">Tentar de novo</button>
            </div>
          ) : (
            <p className="flex items-center justify-center gap-2 px-1 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Buscando…</p>
          )}
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
