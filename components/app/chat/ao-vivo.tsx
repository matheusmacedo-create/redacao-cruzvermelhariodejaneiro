'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessagesSquare, X } from 'lucide-react'
import { createClient as clienteDoNavegador } from '@/lib/supabase/client'
import { infoDoCanal } from '@/app/actions/chat'
import { textoDoAviso, type AnexoDoChat } from '@/lib/chat/regras'

/**
 * O chat ao vivo em qualquer tela da Redação: o número ao lado de "Chat" no
 * menu, o aviso no canto quando chega algo para você e, se a pessoa
 * permitir, o alerta do computador quando a aba está em segundo plano.
 *
 * "Algo para você": mensagem direta, menção (ou @canal) e canais em que você
 * escolheu "toda mensagem". O Realtime só entrega o que o RLS deixa ver.
 */

export type ConversaAoVivo = { tipo: string; nome: string | null; avisar: string; membro: boolean }

type Estado = { naoLidas: number; definir: (n: number) => void; conversaAberta: string | null; abrir: (id: string | null) => void }
const Contexto = createContext<Estado | null>(null)
export const useChatAoVivo = () => useContext(Contexto)

type Aviso = { id: string; canal: string; titulo: string; texto: string }

export function ChatAoVivo({ workspaceId, eu, inicial, conversas, nomes, children }: {
  workspaceId: string
  eu: string
  inicial: number
  conversas: Record<string, ConversaAoVivo>
  nomes: Record<string, string>
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [naoLidas, setNaoLidas] = useState(inicial)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [conversaAberta, setConversaAberta] = useState<string | null>(null)
  const conhecidas = useRef(conversas)
  const aberta = useRef<string | null>(null)
  const rota = useRef(pathname)
  useEffect(() => { conhecidas.current = { ...conhecidas.current, ...conversas } }, [conversas])
  useEffect(() => { rota.current = pathname }, [pathname])
  useEffect(() => { aberta.current = conversaAberta }, [conversaAberta])

  const fechar = useCallback((id: string) => setAvisos((a) => a.filter((x) => x.id !== id)), [])

  useEffect(() => {
    const supabase = clienteDoNavegador()
    const canal = supabase.channel(`chat-ao-vivo-${eu}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens', filter: `workspace_id=eq.${workspaceId}` }, async (p: { new: Record<string, unknown> }) => {
        const m = p.new as { id: string; canal_id: string; autor_id: string | null; corpo: string; mencoes: string[] | null; menciona_todos: boolean; resposta_de: string | null; anexos: AnexoDoChat[] | null }
        if (!m || m.autor_id === eu) return
        let info = conhecidas.current[m.canal_id]
        if (!info) {
          const r = await infoDoCanal(m.canal_id).catch(() => ({}))
          if (!('tipo' in r) || !r.tipo) return
          info = { tipo: r.tipo, nome: r.nome ?? null, avisar: r.avisar ?? 'mencoes', membro: Boolean(r.membro) }
          conhecidas.current = { ...conhecidas.current, [m.canal_id]: info }
        }
        const paraMim = (m.mencoes ?? []).includes(eu) || m.menciona_todos
        // Resposta em fio só avisa aqui quando menciona (quem está no fio recebe o aviso no sino).
        const importa = info.membro && info.avisar !== 'nada' && (m.resposta_de ? paraMim : info.tipo === 'direta' || info.avisar === 'tudo' || paraMim)
        if (!importa) return
        // Quem já está com esta conversa aberta e olhando não precisa de aviso.
        const olhando = aberta.current === m.canal_id && rota.current.startsWith('/chat') && !document.hidden
        if (olhando) return
        setNaoLidas((n) => n + 1)
        const quem = (m.autor_id && nomes[m.autor_id]) || 'Alguém'
        const titulo = info.tipo === 'direta' ? quem : paraMim ? `${quem} mencionou você em #${info.nome}` : `${quem} em #${info.nome}`
        const texto = textoDoAviso(m, 120)
        setAvisos((a) => [...a.slice(-2), { id: m.id, canal: m.resposta_de ? `${m.canal_id}?fio=${m.resposta_de}` : m.canal_id, titulo, texto }])
        setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== m.id)), 8000)
        if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const n = new Notification(titulo, { body: texto, tag: m.canal_id, icon: '/images/logo-cvrj.png' })
            n.onclick = () => { window.focus(); router.push(`/chat/${m.resposta_de ? `${m.canal_id}?fio=${m.resposta_de}` : m.canal_id}`); n.close() }
          } catch { /* navegador sem suporte a Notification no contexto atual */ }
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [workspaceId, eu, nomes, router])

  return (
    <Contexto.Provider value={{ naoLidas, definir: setNaoLidas, conversaAberta, abrir: setConversaAberta }}>
      {children}
      {avisos.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          {avisos.map((a) => (
            <div key={a.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-lg" data-aviso-do-chat>
              <MessagesSquare className="mt-0.5 size-4 shrink-0 text-primary" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { fechar(a.id); router.push(`/chat/${a.canal}`) }}>
                <p className="truncate text-sm font-medium">{a.titulo}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{a.texto}</p>
              </button>
              <button type="button" aria-label="Fechar aviso" className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => fechar(a.id)}><X className="size-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </Contexto.Provider>
  )
}
