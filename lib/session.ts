import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PERMISSOES, ehEquipeDaEscola, pode, type Papel, type Permissao } from '@/lib/permissoes'
import { situacaoDaVerificacao } from '@/lib/usuarios/verificacao'
import { lerPacoteDaSessao, type VinculoDaSessao } from '@/lib/sessao/pacote'

export type WorkspaceRole = Papel

export const getSessionContext = cache(async () => {
  const supabase = await createClient()
  // Sem cookie de sessão não há o que conferir, e nenhuma ida à rede: a
  // entrada e as páginas públicas passam por aqui a todo momento.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  // Três coisas ao mesmo tempo, numa ida só (ARQUITETURA §7.35):
  //  - getUser(): a checagem forte no servidor do Auth (conta desativada,
  //    sessão revogada). Só ela decide se há sessão;
  //  - palacio_sessao(): perfil, vínculos, níveis de acesso das áreas e o que
  //    o layout mostra (sino, aprovações, chat, pessoas), num pacote só. Sem a
  //    migração 20260929170000 (ou com erro), o pacote vem nulo e as duas
  //    leituras de antes entram no lugar;
  //  - o nível da sessão (aal), lido do próprio token, sem rede.
  const [{ data: { user } }, pacote, { data: aal }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('palacio_sessao').then((r) => (r.error ? null : lerPacoteDaSessao(r.data)), () => null),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (!user) return null
  let profile: Record<string, any> | null = pacote?.profile ?? null
  let memberships: VinculoDaSessao[] = pacote?.memberships ?? []
  if (!pacote) {
    const [p, m] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('workspace_members').select('role, coordination, workspaces(id,name,slug,kind,mfa_obrigatorio_para)').eq('user_id', user.id),
    ])
    profile = p.data
    memberships = (m.data ?? []) as unknown as VinculoDaSessao[]
  }
  const fatores = (user.factors ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp')
  return { user, profile, memberships, nivel: aal?.currentLevel ?? 'aal1', fatores, pacote }
})

export async function requireSession() {
  const context = await getSessionContext()
  if (!context) redirect('/')
  return context
}

const workspaceOf = (membership: any) =>
  Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces

/**
 * O espaço de quem está logado, sem conferir a verificação em duas etapas.
 *
 * Só para as telas que existem justamente para quem ainda não cumpriu uma
 * etapa: /trocar-senha e /verificacao (e a home, para decidir para onde
 * mandar). Todo o resto usa obterWorkspace/requireWorkspace.
 */
export async function obterWorkspaceSemVerificacao() {
  const context = await getSessionContext()
  if (!context) return null
  // Conta desativada não entra, mesmo com o token ainda válido. O RLS já
  // nega os dados (private.is_workspace_member exige perfil ativo); barrar
  // aqui evita que ela veja telas vazias em vez de um "sem acesso".
  if (!context.profile || context.profile.active === false) return null
  // Espaço único: não há mais tela de seleção nem cookie. Prefere a Produção e
  // cai no primeiro vínculo, caso um outro espaço volte a existir um dia.
  const membership =
    context.memberships.find((item: any) => workspaceOf(item)?.kind === 'production') ??
    context.memberships[0]
  if (!membership) return null
  const { mfa_obrigatorio_para: obrigatorioPara, ...workspace } = workspaceOf(membership) as unknown as {
    id: string; name: string; slug: string; kind: 'demo' | 'production'; mfa_obrigatorio_para?: string[] | null
  }
  const role = membership.role as WorkspaceRole
  const verificacao = situacaoDaVerificacao({ nivel: context.nivel, temFatorVerificado: context.fatores.length > 0, papel: role, obrigatorioPara })
  return { ...context, workspace, role, verificacao, verificacaoObrigatoriaPara: obrigatorioPara ?? [], verificacaoObrigatoria: (obrigatorioPara ?? []).includes(role) }
}

/**
 * O espaço de quem está logado, ou null.
 *
 * Existe separado de requireWorkspace porque `redirect()` funciona lançando um
 * erro de controle: numa página isso leva ao login, mas numa rota de API vira
 * exceção não tratada e a resposta sai 500. Rota de API responde 401.
 *
 * Sessão que ainda deve o código do app autenticador também é null: várias
 * rotas usam o service role depois desta checagem, e o RLS não as protegeria.
 */
/**
 * A equipe da escola (papel "escola") só entra onde a página ou a rota diz
 * que ela pode — a área da Escola, os livros da Escola no Financeiro e o
 * próprio perfil —, passando `{ escola: true }`. Em todo o resto o portão
 * fecha: a página manda para /escola e a rota de API responde como se não
 * houvesse sessão. É falha fechada de propósito: muitas telas usam o service
 * role depois desta checagem, e uma tela nova esquecida não pode abrir a
 * Redação para quem é só da Escola. O banco nega também
 * (private.is_workspace_member não vale para o papel "escola").
 */
type Portao = { escola?: boolean }

export async function obterWorkspace(portao: Portao = {}) {
  const contexto = await obterWorkspaceSemVerificacao()
  if (!contexto || contexto.verificacao !== 'em_dia') return null
  if (ehEquipeDaEscola(contexto.role) && !portao.escola) return null
  return contexto
}

export async function requireWorkspace(portao: Portao = {}) {
  const contexto = await obterWorkspaceSemVerificacao()
  if (!contexto) redirect('/')
  // Senha definida pelo administrador é provisória: nada no sistema funciona
  // antes de a pessoa escolher a própria. /trocar-senha fica fora deste
  // portão justamente para não entrar em laço.
  if (contexto.profile?.trocar_senha) redirect('/trocar-senha')
  // Depois da senha, o código do app — quando cadastrado ou exigido pelo papel.
  if (contexto.verificacao !== 'em_dia') redirect('/verificacao')
  if (ehEquipeDaEscola(contexto.role) && !portao.escola) redirect('/escola')
  return contexto
}

export async function requireAdmin() {
  const context = await requireWorkspace()
  if (context.role !== 'admin') throw new Error('Acesso restrito a administradores.')
  return context
}

/**
 * Exige uma permissão do catálogo (lib/permissoes.ts). É o portão das
 * actions: a tela esconder o botão não impede ninguém de chamar a action.
 */
export async function requirePermissao(permissao: Permissao) {
  const context = await requireWorkspace()
  if (!pode(context.role, permissao)) throw new Error(`Sem permissão: ${PERMISSOES[permissao].rotulo.toLowerCase()}.`)
  return context
}
