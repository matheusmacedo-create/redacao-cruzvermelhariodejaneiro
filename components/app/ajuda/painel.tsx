'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { CircleHelp, Loader2, X } from 'lucide-react'
import { useAjuda } from './ajuda'
import { carregarAjuda } from './carregar'

type Miolo = typeof import('./painel-conteudo')

/**
 * O painel "?": a ajuda da tela aberta numa gaveta à direita (tela cheia no
 * celular). Para que serve a área, o tour, o passo a passo e as perguntas
 * frequentes — e, em cima, a busca em toda a ajuda. Numa tela sem guia, a
 * ajuda geral (conta, navegação, como pedir ajuda).
 *
 * É um diálogo modal da Base UI: foco preso, Esc fecha e o foco volta para
 * onde estava (o botão "?", quando foi ele que abriu).
 *
 * Esta moldura vai em toda página; o miolo (./painel-conteudo.tsx, com o
 * texto de toda a ajuda) só é baixado na primeira vez que o painel abre.
 */
export function PainelDeAjuda() {
  const { painelAberto, abrirPainel, fecharPainel, aoFecharDialogo } = useAjuda()
  const popup = useRef<HTMLDivElement>(null)
  const [miolo, setMiolo] = useState<Miolo | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!painelAberto || miolo) return
    let valendo = true
    // O texto (lib/ajuda) e o miolo vêm juntos; carregarAjuda() reaproveita o que o tour já baixou.
    Promise.all([import('./painel-conteudo'), carregarAjuda()])
      .then(([m]) => { if (valendo) { setMiolo(m); setFalhou(false) } })
      .catch(() => { if (valendo) setFalhou(true) })
    return () => { valendo = false }
  }, [painelAberto, miolo, tentativa])

  return (
    <Dialog.Root
      open={painelAberto}
      onOpenChange={(aberto) => (aberto ? abrirPainel() : fecharPainel())}
      onOpenChangeComplete={(aberto) => { if (!aberto) aoFecharDialogo() }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        {/* O foco vai para o próprio painel, não para a busca: o leitor de tela anuncia o título, o
            teclado do celular não sobe sozinho e o "?" continua fechando o que abriu. */}
        <Dialog.Popup
          ref={popup}
          initialFocus={popup}
          data-painel-de-ajuda=""
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background text-foreground shadow-2xl outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full motion-reduce:transition-none sm:w-[420px] sm:border-l sm:border-border"
        >
          {miolo ? <miolo.ConteudoDoPainel /> : <Carregando falhou={falhou} tentarDeNovo={() => { setFalhou(false); setTentativa((n) => n + 1) }} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Baixa o painel de antemão (o "?" do topo chama ao receber o mouse ou o foco): abre sem espera. */
export function adiantarPainel(): void {
  import('./painel-conteudo').catch(() => {})
  carregarAjuda().catch(() => {})
}

/** Enquanto o miolo chega (só na primeira vez), ou se a conexão falhou. */
function Carregando({ falhou, tentarDeNovo }: { falhou: boolean; tentarDeNovo: () => void }) {
  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true"><CircleHelp className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <Dialog.Title className="text-base font-semibold leading-tight">Ajuda</Dialog.Title>
          <Dialog.Description className="truncate text-xs text-muted-foreground">{falhou ? 'Não deu para carregar' : 'Carregando…'}</Dialog.Description>
        </div>
        <Dialog.Close aria-label="Fechar a ajuda" className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <X className="size-[18px]" aria-hidden="true" />
        </Dialog.Close>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground" role="status">
        {falhou ? (
          <>
            <p>Não deu para carregar a ajuda. Confira a conexão e tente de novo.</p>
            <button type="button" onClick={tentarDeNovo} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9">Tentar de novo</button>
          </>
        ) : (
          <><Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /><p>Carregando a ajuda…</p></>
        )}
      </div>
    </>
  )
}
