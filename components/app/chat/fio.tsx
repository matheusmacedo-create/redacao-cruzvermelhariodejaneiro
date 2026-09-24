'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Loader2, Paperclip, X } from 'lucide-react'
import type { MensagemDoChat, PessoaDoChat } from '@/lib/chat/regras'
import { Escrever, type EntradaDeArquivos } from './escrever'
import { Mensagens, MensagemSozinha, type Contexto } from './mensagem'

export type FioAberto = { pai: MensagemDoChat; respostas: MensagemDoChat[]; carregando: boolean }

/** O fio ao lado da conversa: a mensagem principal, as respostas e a caixa para responder. */
export function Fio({ fio, titulo, tipo, ctx, pessoas, membros, onEnviada, onForaDaConversa, onFechar }: {
  fio: FioAberto
  titulo: string
  tipo: string
  ctx: Contexto
  pessoas: PessoaDoChat[]
  membros: string[]
  onEnviada: (m: MensagemDoChat) => void
  onForaDaConversa?: (ids: string[]) => void
  onFechar: () => void
}) {
  const lista = useRef<HTMLDivElement>(null)
  const entrada = useRef<EntradaDeArquivos>(null)
  const [arrastando, setArrastando] = useState(false)
  const quantas = fio.respostas.length
  useLayoutEffect(() => { const el = lista.current; if (el && !ctx.destaque) el.scrollTop = el.scrollHeight }, [quantas, ctx.destaque])
  return (
    <aside className="relative flex w-full min-w-0 flex-col border-l border-border lg:w-96 lg:shrink-0" aria-label="Fio" data-fio
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false) }}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); entrada.current?.adicionar([...e.dataTransfer.files]) }}>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1"><p className="font-semibold">Fio</p><p className="truncate text-xs text-muted-foreground">{titulo}</p></div>
        <button type="button" onClick={onFechar} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar o fio"><X className="size-4" /></button>
      </header>
      <div ref={lista} className="flex-1 overflow-y-auto px-3 py-3">
        <MensagemSozinha m={fio.pai} ctx={{ ...ctx, onAbrirFio: undefined }} />
        <div className="relative my-2 flex items-center" role="separator">
          <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
          <span className="relative bg-card pr-2 text-[11px] font-medium text-muted-foreground">
            {fio.carregando ? 'Carregando respostas…' : quantas ? `${quantas} ${quantas === 1 ? 'resposta' : 'respostas'}` : 'Nenhuma resposta ainda'}
          </span>
        </div>
        {fio.carregando ? <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" /> : <Mensagens mensagens={fio.respostas} ctx={{ ...ctx, onAbrirFio: undefined }} semDias />}
      </div>
      {ctx.podeEscrever && !fio.pai.apagada_em && (
        <Escrever key={fio.pai.id} ref={entrada} canalId={fio.pai.canal_id} respostaDe={fio.pai.id} tipo={tipo} titulo={titulo} pessoas={pessoas} membros={membros}
          onEnviada={onEnviada} onErro={ctx.onErro} onForaDaConversa={onForaDaConversa} />
      )}
      {arrastando && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          <Paperclip className="mr-2 size-4" />Solte para anexar à resposta
        </div>
      )}
    </aside>
  )
}
