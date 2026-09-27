import Link from 'next/link'
import {
  AlertTriangle, BadgeCheck, Bell, ChevronRight, DoorOpen, Fingerprint, Globe, GraduationCap, KeyRound, LifeBuoy, Mail, MailCheck,
  Package, PlugZap, UserRound, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { situacaoDasChaves } from '@/lib/integracoes/chaves'
import { tituloDaArea } from '@/lib/navegacao'
import { podeVerAcessos } from '@/lib/acessos/servidor'

export const metadata = { title: tituloDaArea('/configuracoes') }

type Atalho = { href: string; titulo: string; texto: string; icone: LucideIcon; tom?: 'ok' | 'atencao' | 'risco' }

/**
 * A visão geral das Configurações: o que é da pessoa (a conta), onde fica o
 * ajuste de cada área e, para a administração, cada seção do espaço com a
 * situação dela. Antes era uma página só com tudo empilhado (equipe,
 * chaves, e-mail, site e zona de risco); agora cada assunto tem a sua tela
 * (SubmenuDasConfiguracoes) e esta só aponta o caminho.
 */
export default async function ConfiguracoesPage() {
  const context = await requireWorkspace()
  const admin = pode(context.role, 'integracoes.configurar')

  const conta: Atalho[] = [
    { href: '/perfil', titulo: 'Meu perfil', texto: 'Foto, nome, cargo, senha e verificação em duas etapas.', icone: UserRound },
    { href: '/perfil#cracha', titulo: 'Crachá virtual', texto: 'O seu crachá com QR, para mostrar ou imprimir.', icone: BadgeCheck },
    { href: '/perfil#notificacoes', titulo: 'Avisos por e-mail', texto: 'O que chega por e-mail e o que fica só no sino.', icone: Bell },
    { href: '/perfil#email-de-recuperacao', titulo: 'E-mail de recuperação', texto: 'Para o “Esqueci minha senha” funcionar.', icone: MailCheck },
  ]

  if (!admin) {
    return (
      <div className="flex flex-col gap-8">
        <div data-ajuda="configuracoes.conta"><Secao titulo="Sua conta" atalhos={conta} /></div>
        <div data-ajuda="configuracoes.restrito" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">O resto é da administração</p>
          <p className="mt-1">Pessoas e acessos, o e-mail dos setores, as integrações e o site do espaço são ajustados por administradores. Os ajustes de cada área (filas dos chamados, categorias do financeiro, locais do patrimônio) ficam dentro da própria área, para quem cuida dela.</p>
        </div>
      </div>
    )
  }

  const supabase = await createClient()
  const ws = context.workspace.id
  const [{ count: pessoas }, { count: setores }, conexao, { data: caixas }, chaves, leitorDeAcessos] = await Promise.all([
    supabase.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', ws),
    supabase.from('setores').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('ativo', true),
    supabase.from('google_conexao').select('email_conta,estado').eq('workspace_id', ws).maybeSingle(),
    supabase.from('caixas_de_email').select('ativa,no_gmail').eq('workspace_id', ws),
    situacaoDasChaves(supabase, ws),
    podeVerAcessos(context.user.id, ws),
  ])

  const ativas = (caixas ?? []).filter((c) => c.ativa && c.no_gmail).length
  const google = conexao.data
  const faltam = chaves.filter((c) => !c.origem)

  const espaco: Atalho[] = [
    {
      href: '/configuracoes/email', titulo: 'E-mail dos setores', icone: Mail,
      texto: !google ? 'Conta Google não conectada: nenhum setor envia pelo Palácio.'
        : google.estado === 'expirada' ? `A autorização de ${google.email_conta} expirou. Reconecte.`
          : `${google.email_conta} · ${ativas} de ${(caixas ?? []).length} endereços ativos.`,
      tom: !google || google.estado === 'expirada' ? 'atencao' : 'ok',
    },
    {
      href: '/configuracoes/integracoes', titulo: 'Integrações', icone: PlugZap,
      texto: faltam.length ? `${chaves.length - faltam.length} de ${chaves.length} chaves configuradas. Falta: ${faltam.map((c) => nomeCurto(c.nome)).join(', ')}.` : `As ${chaves.length} chaves estão configuradas.`,
      tom: faltam.length ? 'atencao' : 'ok',
    },
    { href: '/configuracoes/site', titulo: 'Site', icone: Globe, texto: 'Google Analytics, páginas do site e matérias no ar em /noticias/.' },
    { href: '/configuracoes/zona-de-risco', titulo: 'Zona de risco', icone: AlertTriangle, texto: 'Reiniciar os dados do espaço. Não tem volta.', tom: 'risco' },
  ]

  const pessoasEAcessos: Atalho[] = [
    { href: '/usuarios', titulo: 'Usuários e permissões', texto: `${pessoas ?? 0} pessoas com login. Criar contas, papéis, senhas e desativar.`, icone: KeyRound },
    { href: '/pessoas/setores', titulo: 'Setores', texto: `${setores ?? 0} setores ativos. A lista usada em Usuários, Equipe, Voluntariado e no e-mail.`, icone: Users },
    // O registro de acessos é liberado pessoa a pessoa (acessos_leitores), não pelo papel.
    ...(leitorDeAcessos ? [{ href: '/acessos', titulo: 'Acessos', texto: 'Quem entrou, quando, de onde e com qual aparelho.', icone: Fingerprint }] : []),
  ]

  const areas: Atalho[] = [
    { href: '/chamados/configurar', titulo: 'Chamados', texto: 'Filas, equipes de atendimento e prazos.', icone: LifeBuoy },
    { href: '/financeiro/cadastros', titulo: 'Financeiro', texto: 'Contas, categorias, centros de custo, favorecidos e quem acessa.', icone: Wallet },
    { href: '/patrimonio/cadastros', titulo: 'Patrimônio', texto: 'Categorias, locais e quem acessa.', icone: Package },
    { href: '/escola/configuracoes', titulo: 'Escola', texto: 'Contas da Únicopag e conta de anúncios do Meta.', icone: GraduationCap },
    { href: '/portaria?aba=qr', titulo: 'Portaria', texto: 'O QR do autocadastro de visitantes e o cartaz.', icone: DoorOpen },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div data-ajuda="configuracoes.espaco"><Secao titulo="Administração do espaço" atalhos={espaco} /></div>
      <div data-ajuda="configuracoes.pessoas"><Secao titulo="Pessoas e acessos" atalhos={pessoasEAcessos} /></div>
      <div data-ajuda="configuracoes.areas"><Secao titulo="Ajustes de cada área" atalhos={areas}
        nota="Cada área guarda os próprios ajustes: quem cuida dela configura lá dentro, sem passar por aqui." /></div>
      <div data-ajuda="configuracoes.conta"><Secao titulo="Sua conta" atalhos={conta} /></div>
    </div>
  )
}

/** “Google (cliente OAuth do Gmail)” vira “Google (Gmail)”; o resto perde o parêntese. */
const nomeCurto = (nome: string) => nome.includes('Gmail') ? 'Google (Gmail)' : nome.replace(/ \(.*\)$/, '')

const TONS = {
  ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  atencao: 'bg-warning/15 text-warning-foreground',
  risco: 'bg-destructive/10 text-destructive',
} as const

function Secao({ titulo, atalhos, nota }: { titulo: string; atalhos: Atalho[]; nota?: string }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      {nota && <p className="mt-1 text-sm text-muted-foreground">{nota}</p>}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {atalhos.map((a) => (
          <li key={a.href}>
            <Link href={a.href} className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${a.tom ? TONS[a.tom] : 'bg-muted text-muted-foreground'}`}>
                <a.icone className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium">{a.titulo}<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{a.texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
