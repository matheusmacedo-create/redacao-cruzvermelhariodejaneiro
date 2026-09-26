import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { ListaDeNotificacoes } from '@/components/app/lista-de-notificacoes'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/notificacoes') }

export const dynamic = 'force-dynamic'

const POR_PAGINA = 30

export default async function NotificacoesPage({ searchParams }: { searchParams: Promise<{ pagina?: string; filtro?: string }> }) {
  const context = await requireWorkspace({ escola: true })
  const sp = await searchParams
  const soNaoLidas = sp.filtro === 'nao-lidas'
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(sp.pagina ?? '1', 10) || 1))
  const supabase = await createClient()

  let consulta = supabase.from('notifications').select('id,title,message,link,read_at,created_at', { count: 'exact' })
    .eq('workspace_id', context.workspace.id).eq('user_id', context.user.id)
  if (soNaoLidas) consulta = consulta.is('read_at', null)
  const [{ data, count }, { count: naoLidas }] = await Promise.all([
    consulta.order('created_at', { ascending: false }).range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).is('read_at', null),
  ])
  const total = count ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const href = (p: number, filtro = soNaoLidas) => `/notificacoes?${new URLSearchParams({ ...(filtro ? { filtro: 'nao-lidas' } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notificações"
        description="Tudo o que aconteceu com você na Redação. O que você não abrir aqui também chega no seu e-mail de recuperação, do jeito que você escolher no perfil."
      />
      <div data-ajuda="notificacoes.filtros" className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href(1, false)} className={cn('rounded-full border px-3 py-1.5 text-sm', !soNaoLidas ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>Todas</Link>
        <Link href={href(1, true)} className={cn('rounded-full border px-3 py-1.5 text-sm', soNaoLidas ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>Não lidas{naoLidas ? ` (${naoLidas})` : ''}</Link>
        <Link href="/perfil#notificacoes" className="ml-auto text-sm text-muted-foreground hover:text-foreground hover:underline">Escolher o que chega por e-mail</Link>
      </div>
      <Card data-ajuda="notificacoes.lista" className="overflow-hidden p-0">
        <ListaDeNotificacoes itens={data ?? []} naoLidas={naoLidas ?? 0} vazio={soNaoLidas ? 'Nada por ler. Tudo em dia.' : 'Nenhuma notificação por enquanto.'} />
      </Card>
      {paginas > 1 && (
        <nav data-ajuda="notificacoes.paginas" className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
          {pagina > 1 ? <Link href={href(pagina - 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">Mais recentes</Link> : <span />}
          <span className="text-muted-foreground">Página {pagina} de {paginas}</span>
          {pagina < paginas ? <Link href={href(pagina + 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">Mais antigas</Link> : <span />}
        </nav>
      )}
    </div>
  )
}
