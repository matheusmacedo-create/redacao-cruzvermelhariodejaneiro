import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { entregar } from './fila'
import { CONFIRMACAO_VALE_MIN } from './regras'

/**
 * Confirmar no Palácio o que foi pedido pelo WhatsApp.
 *
 * O WhatsApp não pede o código do app autenticador nem prova que quem está
 * com o celular é a pessoa de agora. Por isso o que é sensível — decidir uma
 * despesa (Financeiro) ou uma compra, o voto de quem usa a verificação em
 * duas etapas, desativar a conta de alguém — não acontece no bot: vira um
 * link de confirmação (app/confirmar/[token]) que só abre no Palácio, com a
 * sessão normal e a MESMA verificação das telas (requireWorkspace: com o app
 * autenticador cadastrado, a sessão precisa do código). Lá, "Confirmar"
 * executa pela mesma função da tela (decidirAprovacao, decidirPedido,
 * votarNaRodada, desativarUsuario), com as mesmas conferências do banco.
 *
 * O plano do assistente (acao "plano", migração 20261019020000) também vem
 * por aqui: o plano inteiro que tem um passo sensível — o voto, a mensagem
 * ou o comentário de quem usa a verificação em duas etapas, a decisão de
 * despesa ou compra — vira um link só, e a página executa os passos pela
 * sessão (lib/whatsapp/assistente/palacio.ts). O alvo é o próprio plano.
 *
 * O cadastro de colaborador (acao "cadastrar_colaborador", migração 20261019050000: lib/whatsapp/colaborador.ts)
 * também: a conta só nasce confirmada no Palácio. Ela ainda não existe, então o alvo é a ficha do RH reaproveitada
 * ou um id só do pedido; o e-mail e o WhatsApp da pessoa nova ficam nos dados até o link ser usado (o banco os tira).
 *
 * O link:
 *  - é de uso único: a gravação de `usado_em` é condicional, e só uma
 *    confirmação passa (consumirConfirmacao);
 *  - vence em CONFIRMACAO_VALE_MIN minutos;
 *  - é amarrado a quem pediu: a tela lê pela sessão de quem abriu, e a policy
 *    só deixa o dono ler (outra pessoa logada vê "link inválido");
 *  - não fica no banco: vai só o sha-256 do código (32 bytes aleatórios).
 * Um pedido novo para a mesma ação no mesmo alvo invalida o link anterior.
 *
 * Sem a tabela (migração 20261018223000 ainda não aplicada), criar devolve
 * "indisponivel" e o bot manda para a tela de sempre. Nada aqui lança.
 */

type Admin = ReturnType<typeof createAdminClient>

export type AcaoConfirmavel = 'decidir_despesa' | 'decidir_compra' | 'votar_aprovacao' | 'desativar_conta' | 'plano' | 'cadastrar_colaborador'

export type Confirmacao = {
  id: string
  workspaceId: string
  userId: string
  acao: AcaoConfirmavel
  alvoId: string
  dados: Record<string, unknown>
  criadoEm: string
  expiraEm: string
  usadoEm: string | null
  resultado: string | null
}

const ACOES: readonly AcaoConfirmavel[] = ['decidir_despesa', 'decidir_compra', 'votar_aprovacao', 'desativar_conta', 'plano', 'cadastrar_colaborador']

/** No máximo tantos links por pessoa por hora: o WhatsApp não vira fábrica de links. */
const LINKS_POR_HORA = 20

/** O código do link: 32 bytes em base64url (43 caracteres), como os links de conta (lib/contas/servidor.ts). */
export const tokenNoFormato = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)
/** Com prefixo próprio: o hash de um link daqui nunca coincide com o de um link de conta. */
export const hashDaConfirmacao = (token: string) => createHash('sha256').update(`whatsapp-confirmacao:${token}`, 'utf8').digest('hex')
export const caminhoDaConfirmacao = (token: string) => `/confirmar/${token}`

/**
 * O link de confirmar no Palácio. "limite": muitos links na última hora; "indisponivel": sem a tabela (ou o banco
 * recusou — o plano antes da migração 20261019020000, por exemplo). O link do plano leva plano_id (= alvoId).
 */
export async function criarConfirmacao(admin: Admin, p: {
  workspaceId: string; userId: string; acao: AcaoConfirmavel; alvoId: string; dados: Record<string, unknown>
}): Promise<{ url: string } | { erro: 'limite' | 'indisponivel' }> {
  try {
    const agora = new Date()
    const { count, error: semTabela } = await admin.from('whatsapp_confirmacoes').select('id', { count: 'exact', head: true })
      .eq('user_id', p.userId).gte('criado_em', new Date(agora.getTime() - 3_600_000).toISOString())
    if (semTabela) return { erro: 'indisponivel' }
    if ((count ?? 0) >= LINKS_POR_HORA) return { erro: 'limite' }
    // Um link por pedido: o novo toma o lugar do que ainda valia para a mesma ação no mesmo alvo.
    await admin.from('whatsapp_confirmacoes').update({ usado_em: agora.toISOString(), resultado: 'Substituída por um link mais novo.' })
      .eq('user_id', p.userId).eq('acao', p.acao).eq('alvo_id', p.alvoId).is('usado_em', null)
    const token = randomBytes(32).toString('base64url')
    const { error } = await admin.from('whatsapp_confirmacoes').insert({
      workspace_id: p.workspaceId, user_id: p.userId, acao: p.acao, alvo_id: p.alvoId, dados: p.dados, token_hash: hashDaConfirmacao(token),
      expira_em: new Date(agora.getTime() + CONFIRMACAO_VALE_MIN * 60_000).toISOString(),
      ...(p.acao === 'plano' ? { plano_id: p.alvoId } : {}),
    })
    if (error) {
      console.error('[whatsapp] confirmação não criada:', error.message)
      return { erro: 'indisponivel' }
    }
    return { url: `${urlBase()}${caminhoDaConfirmacao(token)}` }
  } catch (causa) {
    console.error('[whatsapp] confirmação não criada:', causa instanceof Error ? causa.message : causa)
    return { erro: 'indisponivel' }
  }
}

/**
 * A confirmação do link, lida pela SESSÃO de quem abriu (o cliente normal, com RLS): a policy só deixa o dono
 * ler, então o link de outra pessoa volta null, como o inexistente. Usada ou vencida também volta (a tela diz).
 */
export async function lerConfirmacao(cliente: SupabaseClient, token: string): Promise<Confirmacao | null> {
  if (!tokenNoFormato(token)) return null
  try {
    const { data, error } = await cliente.from('whatsapp_confirmacoes')
      .select('id, workspace_id, user_id, acao, alvo_id, dados, criado_em, expira_em, usado_em, resultado')
      .eq('token_hash', hashDaConfirmacao(token)).maybeSingle()
    if (error || !data || !ACOES.includes(data.acao as AcaoConfirmavel)) return null
    return {
      id: data.id as string, workspaceId: data.workspace_id as string, userId: data.user_id as string, acao: data.acao as AcaoConfirmavel,
      alvoId: data.alvo_id as string, dados: (data.dados ?? {}) as Record<string, unknown>, criadoEm: data.criado_em as string,
      expiraEm: data.expira_em as string, usadoEm: (data.usado_em as string | null) ?? null, resultado: (data.resultado as string | null) ?? null,
    }
  } catch {
    return null
  }
}

export type SituacaoDaConfirmacao = 'valida' | 'usada' | 'vencida'

export function situacaoDaConfirmacao(c: Pick<Confirmacao, 'usadoEm' | 'expiraEm'>, agora = new Date()): SituacaoDaConfirmacao {
  if (c.usadoEm) return 'usada'
  return new Date(c.expiraEm).getTime() <= agora.getTime() ? 'vencida' : 'valida'
}

/**
 * Gasta o link: UPDATE condicional (é de quem confirma, não foi usado e não venceu). Dois cliques ao mesmo
 * tempo: só um recebe a linha de volta. Sem a linha, nada é executado.
 */
export async function consumirConfirmacao(admin: Admin, id: string, userId: string): Promise<boolean> {
  try {
    const agora = new Date().toISOString()
    const { data } = await admin.from('whatsapp_confirmacoes').update({ usado_em: agora })
      .eq('id', id).eq('user_id', userId).is('usado_em', null).gt('expira_em', agora).select('id').maybeSingle()
    return Boolean(data)
  } catch {
    return false
  }
}

/** O que aconteceu ao confirmar (a ação feita, ou o motivo de não ter sido). */
export async function registrarResultado(admin: Admin, id: string, resultado: string): Promise<void> {
  const { error } = await admin.from('whatsapp_confirmacoes').update({ resultado: resultado.slice(0, 500) }).eq('id', id)
  if (error) console.error('[whatsapp] resultado da confirmação não gravado:', error.message)
}

/**
 * O retorno pelo WhatsApp, no número confirmado de quem pediu: a resposta ao pedido que a pessoa fez por lá
 * (tipo "bot": dentro da janela de 24 h, que o próprio pedido abriu; fora dela, não sai). Nunca lança.
 */
export async function avisarResultadoPeloWhatsapp(admin: Admin, workspaceId: string, userId: string, texto: string): Promise<void> {
  try {
    const { data: conta } = await admin.from('whatsapp_contas').select('numero').eq('user_id', userId).maybeSingle()
    if (!conta?.numero) return
    await entregar(admin, workspaceId, { numero: conta.numero as string, texto, tipo: 'bot', userId })
  } catch (causa) {
    console.error('[whatsapp] retorno da confirmação não enviado:', causa instanceof Error ? causa.message : causa)
  }
}
