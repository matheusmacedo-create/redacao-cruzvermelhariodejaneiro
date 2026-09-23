'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { ContatoDeImprensa } from '@/app/actions/imprensa'
import { motivoDeFora, naoLe } from '@/lib/imprensa/campanha'

/** Peças comuns às abas de Contatos e de Campanhas. */

export const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/** O mesmo campo, com a largura do conteúdo — para selects numa linha de filtros. */
export const selectClass = inputClass.replace('w-full ', 'w-auto ')

export const quandoLegivel = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})

export const podeReceber = (c: ContatoDeImprensa) =>
  !motivoDeFora({ email: c.email, emailStatus: c.emailStatus, descadastradoEm: c.descadastradoEm })

/** Os segmentos por leitura — os mesmos na tabela de contatos e no envio. */
export const SEGMENTOS = [
  { id: 'todos', rotulo: 'Todos que podem receber' },
  { id: 'engajados', rotulo: 'Engajados (abriram o último envio)' },
  { id: 'le', rotulo: 'Já abriram algo' },
  { id: 'nunca', rotulo: 'Nunca receberam' },
  { id: 'semnaole', rotulo: 'Todos, menos quem não lê' },
] as const

export type Segmento = (typeof SEGMENTOS)[number]['id']

export function noSegmento(c: ContatoDeImprensa, segmento: Segmento, lista: string): boolean {
  if (lista !== 'todas' && !c.tags.includes(lista)) return false
  if (segmento === 'engajados') return c.totalAberturas > 0 && c.enviosSemAbertura === 0
  if (segmento === 'le') return c.totalAberturas > 0
  if (segmento === 'nunca') return c.totalEnvios === 0
  if (segmento === 'semnaole') return !naoLe(c.enviosSemAbertura)
  return true
}

/** A moldura repetida dos três diálogos: fundo, Escape, título e botão de fechar. */
export function Dialog({ titulo, descricao, largura = 'max-w-lg', onFechar, podeFechar = true, children }: {
  titulo: string
  descricao?: string
  largura?: string
  onFechar: () => void
  podeFechar?: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    function noEscape(e: KeyboardEvent) { if (e.key === 'Escape' && podeFechar) onFechar() }
    document.addEventListener('keydown', noEscape)
    return () => document.removeEventListener('keydown', noEscape)
  }, [onFechar, podeFechar])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 py-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget && podeFechar) onFechar() }}
      role="dialog"
      aria-modal="true"
    >
      <Card className={`w-full ${largura} overflow-hidden p-0 shadow-2xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
          </div>
          <button type="button" onClick={onFechar} disabled={!podeFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
      </Card>
    </div>,
    document.body,
  )
}
