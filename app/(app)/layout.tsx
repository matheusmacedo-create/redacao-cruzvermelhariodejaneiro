import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { requireWorkspace } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireWorkspace()
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar workspace={context.workspace} role={context.role} profile={context.profile} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
