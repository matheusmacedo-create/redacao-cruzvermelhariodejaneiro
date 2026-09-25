import { cookies } from 'next/headers'
import { AppShellProvider, COOKIE_DA_SIDEBAR } from '@/components/app/app-shell'
import { BuscaRapida } from '@/components/app/busca-rapida'
import { COOKIE_DOS_GRUPOS, Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { AvisoEmailDeRecuperacao } from '@/components/app/aviso-email-de-recuperacao'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PERMISSOES, ehEquipeDaEscola, pode, type Permissao } from '@/lib/permissoes'
import { after } from 'next/server'
import { marcarVisto } from '@/lib/notificacoes/servidor'
import { ChatAoVivo, type ConversaAoVivo } from '@/components/app/chat/ao-vivo'
import { pessoasDoChat, type ConversaNoPainel } from '@/lib/chat/servidor'
import { podeVerAcessos } from '@/lib/acessos/servidor'

// Cada área põe o próprio nome na aba (via tituloDaArea); aqui só o sobrenome.
export const metadata = { title: { template: '%s — Redação', default: 'Redação — Cruz Vermelha RJ' } }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireWorkspace({ escola: true })
  const supabase = await createClient()
  const ws = context.workspace.id
  const [{ data: notifications }, { count: naoLidas }, { count: aprovacoesPendentes }, lembrancas, { data: painelDoChat }, pessoas] = await Promise.all([
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
    // O chat ao vivo: o que falta ler e o que cada conversa é para esta pessoa (para o aviso decidir).
    supabase.rpc('chat_painel', { p_workspace_id: ws }),
    pessoasDoChat(ws, context.user.id, context.role === 'escola'),
  ])
  const conversasDoChat = (painelDoChat ?? []) as ConversaNoPainel[]
  const chatNaoLidas = conversasDoChat.filter((c) => c.membro && c.avisar !== 'nada')
    .reduce((soma, c) => soma + (c.tipo === 'direta' || c.avisar === 'tudo' ? c.nao_lidas : c.mencoes), 0)
  const conversasAoVivo: Record<string, ConversaAoVivo> = Object.fromEntries(conversasDoChat.map((c) => [c.id, { tipo: c.tipo, nome: c.nome, avisar: c.avisar, membro: c.membro }]))
  const nomes = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]))
  // Quem está navegando não recebe e-mail do que vê no sino.
  after(() => marcarVisto(context.user.id, context.profile?.visto_em))
  const permitidas = (Object.keys(PERMISSOES) as Permissao[]).filter((p) => pode(context.role, p))
  // Equipe da escola: o menu é só a Escola; o Financeiro aparece se os livros da Escola foram liberados (o RLS decide).
  const equipeDaEscola = ehEquipeDaEscola(context.role)
    ? { financeiro: Boolean((await supabase.from('fin_entidades').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('tipo', 'escola')).count) }
    : null
  // O registro de acessos é por pessoa, não por papel: só quem está em acessos_leitores (e é admin).
  const leitorDeAcessos = context.role === 'admin' && await podeVerAcessos(context.user.id, ws)
  const recolhida = lembrancas.get(COOKIE_DA_SIDEBAR)?.value === '1'
  const gruposFechados = (lembrancas.get(COOKIE_DOS_GRUPOS)?.value ?? '').split(',').filter(Boolean)
  const buildInfo = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 80) ?? null,
    renderedAt: new Date().toISOString(),
  }
  return (
    <ChatAoVivo workspaceId={ws} eu={context.user.id} inicial={chatNaoLidas} conversas={conversasAoVivo} nomes={nomes}>
    <AppShellProvider permitidas={permitidas} recolhidaInicial={recolhida} equipeDaEscola={equipeDaEscola} leitorDeAcessos={leitorDeAcessos}>
      {/* A moldura é da cor da sidebar; o conteúdo fica num painel branco por cima, como nas ferramentas de trabalho atuais. */}
      <div className="flex h-[100dvh] overflow-hidden bg-sidebar">
        <Sidebar contadores={{ aprovacoes: aprovacoesPendentes ?? 0, chat: chatNaoLidas }} fechadosIniciais={gruposFechados} profile={context.profile} buildInfo={buildInfo} />
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
    </ChatAoVivo>
  )
}
