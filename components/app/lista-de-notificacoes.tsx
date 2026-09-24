'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haQuanto } from '@/lib/notificacoes/tempo'
import { marcarComoLidas, marcarTodasComoLidas } from '@/app/actions/notificacoes'
import type { Notificacao } from './sino'

const completa = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

export function ListaDeNotificacoes({ itens, naoLidas, vazio }: { itens: Notificacao[]; naoLidas: number; vazio: string }) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const visiveisNaoLidas = itens.filter((n) => !n.read_at).map((n) => n.id)

  return (
    <div>
      {naoLidas > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <span className="text-sm text-muted-foreground">{naoLidas === 1 ? '1 não lida' : `${naoLidas} não lidas`}</span>
          <div className="flex gap-1">
            {visiveisNaoLidas.length > 0 && visiveisNaoLidas.length < naoLidas && (
              <button type="button" disabled={ocupado} onClick={() => iniciar(async () => { await marcarComoLidas(visiveisNaoLidas); router.refresh() })} className="rounded-md px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">Marcar estas como lidas</button>
            )}
            <button type="button" disabled={ocupado} onClick={() => iniciar(async () => { await marcarTodasComoLidas(); router.refresh() })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted disabled:opacity-50">
              <CheckCheck className="size-3.5" /> Marcar todas como lidas
            </button>
          </div>
        </div>
      )}
      {itens.length ? (
        <ul>
          {itens.map((n) => (
            <li key={n.id} className={cn('border-b border-border last:border-0', !n.read_at && 'bg-accent/40')}>
              <Link href={n.link || '/notificacoes'} onClick={() => { if (!n.read_at) void marcarComoLidas([n.id]) }} className="flex gap-3 px-4 py-3.5 hover:bg-muted">
                <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} aria-label={n.read_at ? undefined : 'Não lida'} />
                <span className="min-w-0 text-sm">
                  <span className={cn('block', !n.read_at && 'font-semibold')}>{n.title}</span>
                  <span className="mt-0.5 block whitespace-pre-line text-muted-foreground">{n.message}</span>
                  <time suppressHydrationWarning dateTime={n.created_at} title={completa(n.created_at)} className="mt-1 block text-xs text-muted-foreground">{haQuanto(n.created_at)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="px-4 py-10 text-center text-sm text-muted-foreground">{vazio}</p>}
    </div>
  )
}
