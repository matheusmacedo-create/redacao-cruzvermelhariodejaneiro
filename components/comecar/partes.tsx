'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Printer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { registrarAjuda } from '@/app/actions/ajuda'
import { GUIA_VISTO_NO_APARELHO } from '@/lib/ajuda/progresso'

/**
 * As partes do guia para começar (/comecar, docs/AJUDA.md §16) que rodam no navegador. O resto da página é desenhado
 * no servidor, em letra grande.
 */

/**
 * Uma pergunta de sim ou não ("Você já tem o e-mail da Cruz Vermelha?"): os dois botões, grandes, e só a resposta
 * escolhida aparece, para a pessoa ler uma coisa de cada vez. O foco vai para a resposta. Na impressão, as duas
 * aparecem, cada uma com o seu título.
 */
export function EscolhaDoGuia({ id, pergunta, sim, nao, rotuloDoSim = 'Sim, já tenho', rotuloDoNao = 'Ainda não', inicial = null }: {
  id: string
  pergunta: string
  sim: ReactNode
  nao: ReactNode
  rotuloDoSim?: string
  rotuloDoNao?: string
  /** A resposta que já vem escolhida (quem está logado já tem o acesso). */
  inicial?: 'sim' | 'nao' | null
}) {
  const [resposta, setResposta] = useState<'sim' | 'nao' | null>(inicial)
  const [tocou, setTocou] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => { if (tocou) caixa.current?.focus() }, [resposta, tocou])
  const escolher = (r: 'sim' | 'nao') => { setResposta(r); setTocou(true) }
  const botao = (ativo: boolean) => cn(
    'inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 px-5 text-lg font-semibold outline-none focus-visible:ring-4 focus-visible:ring-ring/40',
    ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50',
  )
  return (
    <div>
      <p id={`${id}-pergunta`} className="text-xl font-semibold leading-snug sm:text-2xl">{pergunta}</p>
      <div role="group" aria-labelledby={`${id}-pergunta`} className="mt-5 flex flex-col gap-3 sm:flex-row print:hidden">
        <button type="button" aria-pressed={resposta === 'sim'} onClick={() => escolher('sim')} className={botao(resposta === 'sim')}>
          <Check className="size-6" aria-hidden="true" />{rotuloDoSim}
        </button>
        <button type="button" aria-pressed={resposta === 'nao'} onClick={() => escolher('nao')} className={botao(resposta === 'nao')}>
          <X className="size-6" aria-hidden="true" />{rotuloDoNao}
        </button>
      </div>
      <div ref={caixa} tabIndex={-1} className="outline-none" data-resposta={resposta ?? ''}>
        <div className={resposta === 'sim' ? 'mt-6' : 'hidden print:mt-6 print:block'}>
          <p className="hidden text-lg font-semibold print:block">Se você já tem:</p>
          {sim}
        </div>
        <div className={resposta === 'nao' ? 'mt-6' : 'hidden print:mt-6 print:block'}>
          <p className="hidden text-lg font-semibold print:block">Se ainda não tem:</p>
          {nao}
        </div>
      </div>
    </div>
  )
}

/** "Imprimir este guia": a janela de impressão do navegador, que também salva em PDF. */
export function BotaoDeImprimir({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={cn('inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-lg font-semibold text-foreground outline-none hover:border-primary/50 focus-visible:ring-4 focus-visible:ring-ring/40 print:hidden', className)}>
      <Printer className="size-6" aria-hidden="true" />Imprimir este guia
    </button>
  )
}

/**
 * Abrir o guia marca o item "Ver o guia para começar" dos "Primeiros passos" (o progresso da ajuda,
 * lib/ajuda/progresso.ts): logado, grava na hora; e, logado ou não, deixa a marca no aparelho, que o provedor da ajuda
 * lê quando a pessoa entra ou volta ao Palácio. Não desenha nada.
 */
export function MarcarGuiaVisto({ logado }: { logado: boolean }) {
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(GUIA_VISTO_NO_APARELHO)) window.localStorage.setItem(GUIA_VISTO_NO_APARELHO, new Date().toISOString())
    } catch { /* sem armazenamento: vale a gravação abaixo */ }
    if (logado) registrarAjuda({ tipo: 'guia' }).catch(() => {})
  }, [logado])
  return null
}
