import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PERMISSOES, ehEquipeDaEscola, pode, type Papel, type Permissao } from '@/lib/permissoes'
import { situacaoDaVerificacao } from '@/lib/usuarios/verificacao'

export type WorkspaceRole = Papel

export const getSessionContext = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role, coordination, workspaces(id,name,slug,kind,mfa_obrigatorio_para)')
    .eq('user_id', user.id)
  // O nível da sessão vem do mesmo token que getUser() acabou de validar no
  // servidor do Auth; ler daqui não custa rede. Os fatores vêm do usuário.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const fatores = (user.factors ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp')
  return { user, profile, memberships: memberships ?? [], nivel: aal?.currentLevel ?? 'aal1', fatores }
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
