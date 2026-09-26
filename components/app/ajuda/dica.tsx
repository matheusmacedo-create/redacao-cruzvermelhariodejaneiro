'use client'

import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAjuda } from './ajuda'

/**
 * A dica de primeira visita: um cartão discreto no canto, que oferece o tour
 * de uma tela na primeira vez que a pessoa entra nela. Não é modal e não
 * pega o foco — quem chegou para trabalhar segue trabalhando; o leitor de
 * tela anuncia (role="status") sem interromper. "Agora não" vale como visto.
 * Quando aparece (e quando não) é decidido em ./ajuda.tsx.
 */
export function DicaDaTela() {
  const { dica, daTela, aceitarDica, dispensarDica } = useAjuda()
  if (!dica || !daTela) return null
  const nome = daTela.tela?.rotulo ?? daTela.area.rotulo
  return (
    <section
      role="status"
      aria-label="Dica de primeira visita"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 sm:w-[22rem]"
    >
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true"><Compass className="size-[18px]" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">Primeira vez em {nome}?</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Um tour de 1 minuto mostra o essencial.</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={dispensarDica} className="h-11 px-3 sm:h-9">Agora não</Button>
        <Button type="button" onClick={aceitarDica} className="h-11 px-3.5 sm:h-9">Fazer o tour</Button>
      </div>
    </section>
  )
}
