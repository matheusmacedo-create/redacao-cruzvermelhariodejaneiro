'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haQuanto } from '@/lib/notificacoes/tempo'
import { marcarComoLidas, marcarLidasDoLink, marcarTodasComoLidas } from '@/app/actions/notificacoes'

export type Notificacao = { id: string; title: string; message: string; link: string | null; read_at: string | null; created_at: string }

/** De quanto em quanto tempo o sino pergunta se chegou algo (só com a aba visível). */
const INTERVALO_MS = 60_000

export function Sino({ notificacoes, naoLidas }: { notificacoes: Notificacao[]; naoLidas: number }) {
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState(notificacoes)
  const [contagem, setContagem] = useState(naoLidas)
  const [, iniciar] = useTransition()
  const pathname = usePathname()

  // O servidor manda a lista nova a cada navegação: ela vence o que está aqui.
  const [anteriores, setAnteriores] = useState({ notificacoes, naoLidas })
  if (anteriores.notificacoes !== notificacoes || anteriores.naoLidas !== naoLidas) {
    setAnteriores({ notificacoes, naoLidas })
    setItens(notificacoes)
    setContagem(naoLidas)
  }

  // O layout não é refeito a cada navegação: o sino busca sozinho o que
  // chegou — de minuto em minuto, ao voltar para a aba e ao ser aberto.
  const buscar = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      const resposta = await fetch('/api/notificacoes', { cache: 'no-store' })
      if (!resposta.ok) return
      const dados = await resposta.json() as { naoLidas: number; recentes: Notificacao[] }
      setItens(dados.recentes)
      setContagem(dados.naoLidas)
    } catch { /* sem rede: tenta de novo na próxima volta */ }
  }, [])

  useEffect(() => {
    const relogio = setInterval(buscar, INTERVALO_MS)
    document.addEventListener('visibilitychange', buscar)
    return () => { clearInterval(relogio); document.removeEventListener('visibilitychange', buscar) }
  }, [buscar])

  // Abriu a página de que o aviso fala: o aviso está lido, como no Facebook.
  useEffect(() => {
    const lidas = new Set(itens.filter((n) => !n.read_at && n.link === pathname).map((n) => n.id))
    if (!lidas.size) return
    iniciar(async () => {
      await marcarLidasDoLink(pathname)
      const agora = new Date().toISOString()
      setItens((lista) => lista.map((n) => (lidas.has(n.id) && !n.read_at ? { ...n, read_at: agora } : n)))
      setContagem((c) => Math.max(0, c - lidas.size))
    })
  }, [pathname, itens])

  const abrir = (n: Notificacao) => {
    setAberto(false)
    if (n.read_at) return
    setItens((lista) => lista.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item)))
    setContagem((c) => Math.max(0, c - 1))
    iniciar(async () => { await marcarComoLidas([n.id]) })
  }

  const lerTodas = () => {
    const agora = new Date().toISOString()
    setItens((lista) => lista.map((n) => (n.read_at ? n : { ...n, read_at: agora })))
    setContagem(0)
    iniciar(async () => { await marcarTodasComoLidas() })
  }

  const rotulo = contagem > 99 ? '99+' : String(contagem)
  return (
    <div className="relative">
      <button type="button" data-ajuda="shell.sino" onClick={() => { if (!aberto) void buscar(); setAberto((v) => !v) }} aria-expanded={aberto} className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Notificações${contagem ? `, ${contagem} não lidas` : ''}`}>
        <Bell className="size-[18px]" />
        {contagem > 0 && <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">{rotulo}</span>}
      </button>
      {aberto && (
        <>
          <button className="fixed inset-0 z-40" onClick={() => setAberto(false)} aria-label="Fechar notificações" />
          <div className="fixed left-2 right-2 top-14 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-96">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Notificações</span>
              {contagem > 0 && (
                <button type="button" onClick={lerTodas} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted">
                  <CheckCheck className="size-3.5" /> Marcar todas como lidas
                </button>
              )}
            </div>
            {itens.length ? (
              <ul className="max-h-[60vh] overflow-y-auto">
                {itens.map((n) => (
                  <li key={n.id} className={cn('border-b border-border text-sm last:border-0', !n.read_at && 'bg-accent/40')}>
                    <Link href={n.link || '/notificacoes'} onClick={() => abrir(n)} className="flex gap-3 px-4 py-3 hover:bg-muted">
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                      <span className="min-w-0">
                        <span className={cn('block', !n.read_at && 'font-semibold')}>{n.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-muted-foreground">{n.message}</span>
                        <span suppressHydrationWarning className="mt-1 block text-xs text-muted-foreground">{haQuanto(n.created_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>}
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs">
              <Link href="/notificacoes" onClick={() => setAberto(false)} className="font-medium text-primary hover:underline">Ver todas</Link>
              <Link href="/perfil#notificacoes" onClick={() => setAberto(false)} className="text-muted-foreground hover:text-foreground hover:underline">E-mails de aviso</Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
