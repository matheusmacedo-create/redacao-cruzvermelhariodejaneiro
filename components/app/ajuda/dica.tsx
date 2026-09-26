'use client'

import { useRef } from 'react'
import { Compass, Loader2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { acharAlvo } from '@/components/ajuda/tour'
import { cn } from '@/lib/utils'
import { useAjuda } from './ajuda'

/**
 * A dica de primeira visita: um cartão discreto no canto, que oferece o tour
 * de uma tela na primeira vez que a pessoa entra nela. Não é modal e não
 * pega o foco — quem chegou para trabalhar segue trabalhando; o leitor de
 * tela anuncia (role="status") sem interromper. "Agora não" vale como visto.
 * Quando aparece (e quando não) é decidido em ./ajuda.tsx.
 *
 * No mesmo canto, o aviso de quando um tour pedido não veio (o texto da
 * ajuda não baixou): sem ele, "Fazer o tour" não fazia nada, e as
 * boas-vindas fechavam sem o tour vir.
 *
 * A região viva fica na página desde o começo, vazia: a que entra já
 * preenchida o leitor de tela não anuncia. O próprio elemento vira o cartão
 * quando há o que mostrar.
 */
export function DicaDaTela() {
  const { dica, onde, aceitarDica, dispensarDica, carregandoTour, falhouTour, tentarTourDeNovo, esquecerFalhaDoTour } = useAjuda()
  const cartao = useRef<HTMLDivElement>(null)
  const nome = onde ? (onde.tela?.rotulo ?? onde.area.rotulo) : ''
  const comDica = Boolean(dica && onde)
  const visivel = falhouTour || comDica

  // "Agora não", "Fechar" e "Tentar de novo" (o das boas-vindas não tem dica
  // para mostrar enquanto baixa) tiram o cartão da tela, levando junto o botão
  // com o foco: o foco cairia no <body> e o Tab recomeçaria do topo. Vai para o
  // "?" — que é também para onde o tour devolve o foco ao terminar. No "Fazer o
  // tour" o cartão fica (carregando) até o tour abrir, e o tour cuida do foco.
  const escolher = (acao: () => void) => () => {
    if (cartao.current?.contains(document.activeElement)) acharAlvo('shell.ajuda')?.focus({ preventScroll: true })
    acao()
  }

  return (
    <div
      ref={cartao}
      role="status"
      aria-label={falhouTour ? 'Aviso da ajuda' : comDica ? 'Dica de primeira visita' : undefined}
      className={cn(visivel && 'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 sm:w-[22rem]')}
    >
      {visivel && (
        <>
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true">
              {falhouTour ? <WifiOff className="size-[18px]" /> : <Compass className="size-[18px]" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{falhouTour ? 'Não deu para carregar o tour.' : `Primeira vez em ${nome}?`}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{falhouTour ? 'Confira a conexão e tente de novo.' : 'Um tour de 1 minuto mostra o essencial.'}</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={escolher(falhouTour ? esquecerFalhaDoTour : dispensarDica)} className="h-11 px-3 sm:h-9">
              {falhouTour ? 'Fechar' : 'Agora não'}
            </Button>
            <Button type="button" onClick={falhouTour ? escolher(tentarTourDeNovo) : aceitarDica} aria-disabled={carregandoTour || undefined} className="h-11 px-3.5 sm:h-9">
              {falhouTour ? 'Tentar de novo' : carregandoTour ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Carregando…</> : 'Fazer o tour'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
