'use client'

import { Dialog } from '@base-ui/react/dialog'
import { Compass, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAjuda } from './ajuda'

/**
 * As boas-vindas do primeiro acesso: o que é a Redação, em duas frases, e o
 * convite para o tour. Qualquer saída — o tour, "Agora não", o X, o Esc ou o
 * clique fora — conta como vista: ninguém recebe a mesma janela duas vezes
 * sem pedir (a Central de ajuda tem "Rever as boas-vindas").
 */
export function BoasVindas() {
  const { boasVindasAberta, sairDasBoasVindas, aoFecharDialogo, pessoa, passosDasBoasVindas } = useAjuda()
  // Uns 8 segundos por balão: o tour inteiro cabe em um minuto, e é isso que prometemos.
  const minutos = Math.max(1, Math.round((passosDasBoasVindas * 8) / 60))
  const titulo = pessoa.primeiroNome ? `Boas-vindas à Redação, ${pessoa.primeiroNome}!` : 'Boas-vindas à Redação!'

  return (
    <Dialog.Root
      open={boasVindasAberta}
      onOpenChange={(aberto) => { if (!aberto) sairDasBoasVindas(false) }}
      onOpenChangeComplete={(aberto) => { if (!aberto) aoFecharDialogo() }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl outline-none transition-[opacity,scale] duration-200 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 motion-reduce:transition-none sm:p-7">
          <Dialog.Close aria-label="Fechar" className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <X className="size-4" aria-hidden="true" />
          </Dialog.Close>
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/[0.08]" aria-hidden="true">
            <svg viewBox="0 0 30 30" className="size-6"><path d="M10 0h10v10h10v10H20v10H10V20H0V10h10z" fill="rgb(227 34 25)" /></svg>
          </span>
          <Dialog.Title className="mt-5 pr-8 text-xl font-bold leading-tight tracking-tight text-balance">{titulo}</Dialog.Title>
          <Dialog.Description render={<div />} className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
            {pessoa.equipeDaEscola ? (
              <>
                <p>Aqui a equipe da Escola de Educação e Saúde acompanha as vendas, o marketing e os advertoriais da escola. No Chat, você conversa nos canais para os quais chamaram você.</p>
                <p>Em qualquer tela, o botão “?” no alto mostra o passo a passo e as perguntas frequentes daquela tela.</p>
              </>
            ) : (
              <>
                <p>É aqui que a filial registra o que acontece, transforma em pauta, aprova e publica. E é aqui também que corre o expediente: ofícios, chamados, compras e patrimônio.</p>
                <p>Em qualquer tela, o botão “?” no alto mostra o passo a passo e as perguntas frequentes daquela tela.</p>
              </>
            )}
          </Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-11 sm:h-10" onClick={() => sairDasBoasVindas(false)}>
              {passosDasBoasVindas ? 'Agora não' : 'Começar'}
            </Button>
            {passosDasBoasVindas > 0 && (
              <Button type="button" size="lg" className="h-11 sm:h-10" onClick={() => sairDasBoasVindas(true)}>
                <Compass aria-hidden="true" />Fazer o tour ({minutos} min)
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Dá para rever tudo isto quando quiser, na Central de ajuda.</p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
