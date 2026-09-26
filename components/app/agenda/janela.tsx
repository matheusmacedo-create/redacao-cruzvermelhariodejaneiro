'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A janela (diálogo) da Agenda: detalhe do item, dia, agendar e configurações. */
export function Janela({ aberta, aoFechar, titulo, descricao, larga = false, children }: {
  aberta: boolean; aoFechar: () => void; titulo: React.ReactNode; descricao?: React.ReactNode; larga?: boolean; children: React.ReactNode
}) {
  return (
    <Dialog.Root open={aberta} onOpenChange={(v) => { if (!v) aoFechar() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl outline-none transition-[opacity,scale] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none sm:p-6',
          larga ? 'max-w-2xl' : 'max-w-md',
        )}>
          <Dialog.Close aria-label="Fechar" className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <X className="size-4" aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="pr-10 text-lg font-semibold leading-snug">{titulo}</Dialog.Title>
          {descricao && <Dialog.Description className="mt-1 text-sm text-muted-foreground">{descricao}</Dialog.Description>}
          <div className="mt-4">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
