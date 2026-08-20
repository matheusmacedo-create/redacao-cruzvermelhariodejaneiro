import { AppShellProvider } from '@/components/app/app-shell'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id,title,message,link,read_at,created_at')
    .eq('workspace_id', context.workspace.id)
    .eq('user_id', context.user.id)
    .order('created_at', { ascending: false })
    .limit(10)
  const buildInfo = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 80) ?? null,
    renderedAt: new Date().toISOString(),
  }
  return (
    <AppShellProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-background">
        <Sidebar profile={context.profile} buildInfo={buildInfo} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar workspace={context.workspace} role={context.role} profile={context.profile} notifications={notifications ?? []} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">{children}</div>
          </main>
        </div>
      </div>
    </AppShellProvider>
  )
}
