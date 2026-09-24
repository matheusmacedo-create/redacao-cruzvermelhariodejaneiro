import { AppShellProvider } from '@/components/app/app-shell'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { AvisoEmailDeRecuperacao } from '@/components/app/aviso-email-de-recuperacao'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pode } from '@/lib/permissoes'
import { after } from 'next/server'
import { marcarVisto } from '@/lib/notificacoes/servidor'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const [{ data: notifications }, { count: naoLidas }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id,title,message,link,read_at,created_at')
      .eq('workspace_id', context.workspace.id)
      .eq('user_id', context.user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    // A contagem é à parte: as 10 recentes não dizem quantas faltam ler.
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id)
      .eq('user_id', context.user.id)
      .is('read_at', null),
  ])
  // Quem está navegando não recebe e-mail do que vê no sino.
  after(() => marcarVisto(context.user.id, context.profile?.visto_em))
  const buildInfo = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 80) ?? null,
    renderedAt: new Date().toISOString(),
  }
  return (
    <AppShellProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-background">
        <Sidebar profile={context.profile} buildInfo={buildInfo} gerenciaUsuarios={pode(context.role, 'usuarios.gerenciar')} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Topbar role={context.role} profile={context.profile} notifications={notifications ?? []} naoLidas={naoLidas ?? 0} />
          {!context.profile?.email_confirmado_em && <AvisoEmailDeRecuperacao email={context.profile?.email ?? null} />}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">{children}</div>
          </main>
        </div>
      </div>
    </AppShellProvider>
  )
}
