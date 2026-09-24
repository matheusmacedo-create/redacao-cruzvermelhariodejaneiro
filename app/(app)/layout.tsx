import { cookies } from 'next/headers'
import { AppShellProvider, COOKIE_DA_SIDEBAR } from '@/components/app/app-shell'
import { BuscaRapida } from '@/components/app/busca-rapida'
import { COOKIE_DOS_GRUPOS, Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { AvisoEmailDeRecuperacao } from '@/components/app/aviso-email-de-recuperacao'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PERMISSOES, pode, type Permissao } from '@/lib/permissoes'
import { after } from 'next/server'
import { marcarVisto } from '@/lib/notificacoes/servidor'

// Cada área põe o próprio nome na aba (via tituloDaArea); aqui só o sobrenome.
export const metadata = { title: { template: '%s — Redação', default: 'Redação — Cruz Vermelha RJ' } }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const ws = context.workspace.id
  const [{ data: notifications }, { count: naoLidas }, { count: aprovacoesPendentes }, lembrancas] = await Promise.all([
    supabase
      .from('notifications')
      .select('id,title,message,link,read_at,created_at')
      .eq('workspace_id', ws)
      .eq('user_id', context.user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    // A contagem é à parte: as 10 recentes não dizem quantas faltam ler.
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws)
      .eq('user_id', context.user.id)
      .is('read_at', null),
    // O número ao lado de Aprovações: o que espera o MEU voto, não tudo o que está em aprovação.
    supabase
      .from('approval_voters')
      .select('approval_id,approvals!inner(status)', { count: 'exact', head: true })
      .eq('workspace_id', ws)
      .eq('user_id', context.user.id)
      .eq('decision', 'pending')
      .eq('approvals.status', 'pending'),
    cookies(),
  ])
  // Quem está navegando não recebe e-mail do que vê no sino.
  after(() => marcarVisto(context.user.id, context.profile?.visto_em))
  const permitidas = (Object.keys(PERMISSOES) as Permissao[]).filter((p) => pode(context.role, p))
  const recolhida = lembrancas.get(COOKIE_DA_SIDEBAR)?.value === '1'
  const gruposFechados = (lembrancas.get(COOKIE_DOS_GRUPOS)?.value ?? '').split(',').filter(Boolean)
  const buildInfo = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 80) ?? null,
    renderedAt: new Date().toISOString(),
  }
  return (
    <AppShellProvider permitidas={permitidas} recolhidaInicial={recolhida}>
      {/* A moldura é da cor da sidebar; o conteúdo fica num painel branco por cima, como nas ferramentas de trabalho atuais. */}
      <div className="flex h-[100dvh] overflow-hidden bg-sidebar">
        <Sidebar contadores={{ aprovacoes: aprovacoesPendentes ?? 0 }} fechadosIniciais={gruposFechados} profile={context.profile} buildInfo={buildInfo} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:py-2 md:pr-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:rounded-xl md:border md:border-sidebar-border md:shadow-sm">
            <Topbar role={context.role} profile={context.profile} notifications={notifications ?? []} naoLidas={naoLidas ?? 0} />
            {!context.profile?.email_confirmado_em && <AvisoEmailDeRecuperacao email={context.profile?.email ?? null} />}
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="mx-auto w-full max-w-[1400px] px-4 py-5 [padding-bottom:max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:py-7">{children}</div>
            </main>
          </div>
        </div>
      </div>
      <BuscaRapida />
    </AppShellProvider>
  )
}
