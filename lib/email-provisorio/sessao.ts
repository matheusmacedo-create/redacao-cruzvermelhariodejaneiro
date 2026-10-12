import 'server-only'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionContext, obterWorkspaceSemVerificacao } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { caixasQuePodeUsar } from '@/lib/correio/enviar'
import { caixasPorId, type CaixaVisivel } from '@/lib/correio/caixa-de-entrada'

/**
 * Quem está no app de e-mail provisório (/email, aberto em
 * email.cruzvermelhariodejaneiro.org) e o que pode ali.
 *
 * O app existe para a equipe usar o e-mail do setor antes de o Palácio abrir
 * para todos. Há dois tipos de conta:
 *  - só do e-mail: perfil com usuário e senha, SEM vínculo com o espaço
 *    (workspace_members). O Palácio continua fechado para ela —
 *    obterWorkspace() devolve null — e o que ela vê vem de email_acessos;
 *  - do Palácio: entra com a mesma conta e vê, além dos acessos dados aqui,
 *    as caixas dos setores dela (caixasQuePodeUsar). Vale a verificação em
 *    duas etapas do Palácio. Quem configura o correio (administrador) vê
 *    todas e escolhe o responsável de cada caixa.
 *
 * Responsável de uma caixa: dá e tira acesso a ela e gera senha provisória
 * para quem é só do e-mail (app/actions/email-provisorio.ts).
 */
export type ContextoDoEmail = {
  userId: string
  usuario: string
  nome: string
  workspaceId: string
  caixas: CaixaVisivel[]
  /** As caixas em que a pessoa dá e tira acesso. */
  responsavelDe: Set<string>
  /** Configura o correio no Palácio: vê todas e escolhe os responsáveis. */
  administra: boolean
  /** Tem vínculo com o Palácio (a conta não é só do e-mail). */
  doPalacio: boolean
}

type Situacao =
  | { tipo: 'ok'; contexto: ContextoDoEmail }
  | { tipo: 'sem_sessao' }
  | { tipo: 'trocar_senha'; doPalacio: boolean }
  | { tipo: 'verificacao' }
  | { tipo: 'sem_espaco' }

async function situacao(): Promise<Situacao> {
  const sessao = await getSessionContext()
  if (!sessao || !sessao.profile || sessao.profile.active === false) return { tipo: 'sem_sessao' }
  const palacio = await obterWorkspaceSemVerificacao()
  if (sessao.profile.trocar_senha) return { tipo: 'trocar_senha', doPalacio: Boolean(palacio) }
  if (palacio && palacio.verificacao !== 'em_dia') return { tipo: 'verificacao' }

  const admin = createAdminClient()
  const { data } = await admin.from('email_acessos').select('caixa_id,workspace_id,responsavel').eq('user_id', sessao.user.id)
  const acessos = (data ?? []) as { caixa_id: string; workspace_id: string; responsavel: boolean }[]
  const workspaceId = palacio?.workspace.id ?? acessos[0]?.workspace_id
  if (!workspaceId) return { tipo: 'sem_espaco' }
  const meus = acessos.filter((a) => a.workspace_id === workspaceId)

  const doSetor = palacio ? await caixasQuePodeUsar(palacio) : []
  const administra = Boolean(palacio && pode(palacio.role, 'correio.configurar'))
  const caixas = await caixasPorId(workspaceId, [...new Set([...meus.map((a) => a.caixa_id), ...doSetor.map((c) => c.id)])])
  const responsavelDe = new Set(administra ? caixas.map((c) => c.id) : meus.filter((a) => a.responsavel).map((a) => a.caixa_id))
  return {
    tipo: 'ok',
    contexto: {
      userId: sessao.user.id,
      usuario: String(sessao.profile.username ?? ''),
      nome: String(sessao.profile.full_name || sessao.profile.username || ''),
      workspaceId, caixas, responsavelDe, administra, doPalacio: Boolean(palacio),
    },
  }
}

/** Para rotas de API e actions: o contexto, ou null (sem sessão, senha a trocar, verificação pendente). */
export async function obterContextoDoEmail(): Promise<ContextoDoEmail | null> {
  const s = await situacao()
  return s.tipo === 'ok' ? s.contexto : null
}

/**
 * Para as páginas: manda cada um para onde precisa ir. Sem espaço (conta sem
 * nenhum acesso dado) devolve o contexto vazio, para a tela dizer a quem pedir.
 */
export async function exigirContextoDoEmail(): Promise<ContextoDoEmail | null> {
  const s = await situacao()
  if (s.tipo === 'sem_sessao') redirect('/email/entrar')
  if (s.tipo === 'trocar_senha') redirect(s.doPalacio ? '/trocar-senha' : '/email/trocar-senha')
  if (s.tipo === 'verificacao') redirect('/verificacao')
  if (s.tipo === 'sem_espaco') return null
  return s.contexto
}

/** Para a página de troca obrigatória: quem está logado e ainda deve a troca (só contas do e-mail). */
export async function contaQueDeveATroca(): Promise<{ userId: string; usuario: string; nome: string } | null> {
  const sessao = await getSessionContext()
  if (!sessao?.profile || sessao.profile.active === false || !sessao.profile.trocar_senha) return null
  return { userId: sessao.user.id, usuario: String(sessao.profile.username ?? ''), nome: String(sessao.profile.full_name ?? '') }
}
