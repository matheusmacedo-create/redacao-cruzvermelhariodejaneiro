import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  criarFluxoDoPlano, type FluxoDoPlano, type MudancaDoPlano, type PlanoGuardado, type RepositorioDePlanos, type SituacaoDoPlano,
  SITUACOES_ABERTAS, SITUACOES_ENCERRADAS,
} from './fluxo'
import { redigirVencidos } from './faxina'
import type { PlanoAberto, TipoDeAcao } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Os planos e as perguntas do assistente no banco (whatsapp_ia_planos, só o service role): o repositório do
 * Supabase para o fluxo de fluxo.ts (o mesmo contrato do repositório em memória dos testes) e o que o turno
 * precisa dele.
 *
 * Nesta etapa (leitura), só a PERGUNTA chega a ser guardada: os preparar_* respondem "escrita desligada", então
 * nenhum plano nasce. A revisão e o rearme do plano aberto já passam por aqui, prontos para a etapa da escrita
 * (guardar o plano, confirmar e executar).
 *
 * Nunca lança: sem a tabela (migração ainda não aplicada) ou com erro, devolve null ou [] — e o assistente nem
 * chega a ficar disponível sem a configuração, que é da mesma migração.
 */

const daLinha = (l: Record<string, unknown>): PlanoGuardado => ({
  id: l.id as string, workspaceId: l.workspace_id as string, userId: l.user_id as string, numero: l.numero as string, papel: l.papel as string,
  situacao: l.situacao as SituacaoDoPlano,
  passos: Array.isArray(l.passos) ? l.passos as PlanoGuardado['passos'] : [],
  opcoes: Array.isArray(l.opcoes) ? (l.opcoes as unknown[]).map(String) : [],
  permitidas: Array.isArray(l.permitidas) ? l.permitidas as TipoDeAcao[] : [],
  pedidoEmAberto: (l.pedido_em_aberto as string | null) ?? null,
  hash: (l.hash as string | null) ?? null, sensivel: l.sensivel === true,
  mensagens: Array.isArray(l.mensagens) ? (l.mensagens as unknown[]).map(String) : [],
  entregueEm: (l.entregue_em as string | null) ?? null,
  resultado: Array.isArray(l.resultado) ? l.resultado as PlanoGuardado['resultado'] : [],
  redigidoEm: (l.redigido_em as string | null) ?? null, criadoEm: l.criado_em as string, expiraEm: l.expira_em as string, atualizadoEm: l.atualizado_em as string,
})

const COLUNA: Record<keyof MudancaDoPlano, string> = {
  situacao: 'situacao', passos: 'passos', pedidoEmAberto: 'pedido_em_aberto', mensagens: 'mensagens', entregueEm: 'entregue_em',
  resultado: 'resultado', redigidoEm: 'redigido_em', atualizadoEm: 'atualizado_em',
}

const paraLinha = (m: MudancaDoPlano): Record<string, unknown> =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [COLUNA[k as keyof MudancaDoPlano], v]))

const linhaOuNull = (data: unknown) => (data && typeof data === 'object' ? daLinha(data as Record<string, unknown>) : null)

/** O repositório do fluxo no Supabase: cada mudança é um update condicional pela situação (devolve a linha só se mudou). */
export function repoSupabase(admin: Admin): RepositorioDePlanos {
  const tabela = () => admin.from('whatsapp_ia_planos')
  return {
    async inserir(p) {
      const { data, error } = await tabela().insert({
        workspace_id: p.workspaceId, user_id: p.userId, numero: p.numero, papel: p.papel, situacao: p.situacao, passos: p.passos, opcoes: p.opcoes,
        permitidas: p.permitidas, pedido_em_aberto: p.pedidoEmAberto, hash: p.hash, sensivel: p.sensivel, mensagens: p.mensagens, entregue_em: p.entregueEm,
        resultado: p.resultado, redigido_em: p.redigidoEm, expira_em: p.expiraEm,
      }).select('*').single()
      if (error && error.code !== '23505') console.error('[whatsapp] assistente: plano não guardado:', error.code)
      return error ? null : linhaOuNull(data)
    },
    async buscar(id) {
      const { data } = await tabela().select('*').eq('id', id).maybeSingle()
      return linhaOuNull(data)
    },
    async abertoDaPessoa(userId) {
      const { data } = await tabela().select('*').eq('user_id', userId).in('situacao', [...SITUACOES_ABERTAS]).order('criado_em', { ascending: false }).limit(1).maybeSingle()
      return linhaOuNull(data)
    },
    async daMensagem(userId, mensagemId) {
      const { data } = await tabela().select('*').eq('user_id', userId).contains('mensagens', [mensagemId]).order('criado_em', { ascending: false }).limit(1).maybeSingle()
      return linhaOuNull(data)
    },
    async ultimoEncerrado(userId) {
      const { data } = await tabela().select('*').eq('user_id', userId).in('situacao', [...SITUACOES_ENCERRADAS]).order('atualizado_em', { ascending: false }).limit(1).maybeSingle()
      return linhaOuNull(data)
    },
    async mudar(id, de, mudanca, condicao = {}) {
      let q = tabela().update(paraLinha(mudanca)).eq('id', id).in('situacao', [...de])
      if (condicao.vigenteEm) q = q.gt('expira_em', condicao.vigenteEm)
      const { data } = await q.select('*').maybeSingle()
      return linhaOuNull(data)
    },
    async mudarDaPessoa(userId, de, mudanca) {
      const { data } = await tabela().update(paraLinha(mudanca)).eq('user_id', userId).in('situacao', [...de]).select('*')
      return (data ?? []).map((l) => daLinha(l as Record<string, unknown>))
    },
    async mensagemNoMeio(userId, depoisDe, ateMs, excetoMensagemId) {
      let q = admin.from('whatsapp_mensagens').select('id').eq('user_id', userId).eq('direcao', 'entrada').in('comando', ['ia', 'ia_escolha'])
        .gt('enviada_em', depoisDe).lte('enviada_em', new Date(ateMs).toISOString())
      if (excetoMensagemId) q = q.neq('mensagem_id', excetoMensagemId)
      const { data } = await q.limit(1)
      return Boolean(data?.length)
    },
  }
}

export const fluxoDoPlano = (admin: Admin): FluxoDoPlano => criarFluxoDoPlano(repoSupabase(admin))

/** O que a rota precisa saber: o plano ou a pergunta da pessoa e o que a mensagem citou. null sem a tabela ou com erro. */
export type AbertoDaPessoa = { aberto: PlanoAberto; plano: PlanoGuardado | null }

export async function planoAberto(admin: Admin, userId: string, citada: string | null, opcoes: { citacaoResolvida?: boolean } = {}): Promise<AbertoDaPessoa | null> {
  try {
    // Antes de olhar: o vencido da pessoa vira "vencido" e é redigido (a faxina geral pode estar longe).
    await redigirVencidos(admin, { limite: 10, userId })
    return await fluxoDoPlano(admin).abertoPara(userId, citada, opcoes)
  } catch (causa) {
    console.error('[whatsapp] assistente: plano aberto não lido:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/**
 * Guarda a pergunta do assistente ("Qual Ana?"): o que estava aberto da pessoa é substituído (e redigido), e a
 * pergunta do bot que estivesse aberta é encerrada — as duas nunca ficam abertas juntas (o envio de fotos e a
 * conferência do "Não fui eu" seguem, como em guardarPendencia). `permitidas`: o portão do pedido, que vale
 * de novo quando a pessoa escolher.
 */
export async function guardarPergunta(admin: Admin, p: {
  workspaceId: string; userId: string; numero: string; papel: string; opcoes: string[]; pedidoEmAberto: string | null; permitidas: TipoDeAcao[]
}): Promise<PlanoGuardado | null> {
  try {
    await redigirVencidos(admin, { limite: 10, userId: p.userId })
    await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('user_id', p.userId).is('encerrada_em', null)
      .not('tipo', 'in', '(envio,nao_fui_eu)')
    return await fluxoDoPlano(admin).guardar({
      workspaceId: p.workspaceId, userId: p.userId, numero: p.numero, papel: p.papel, tipo: 'pergunta',
      passos: [], opcoes: p.opcoes, permitidas: p.permitidas, pedidoEmAberto: p.pedidoEmAberto, sensivel: false,
    })
  } catch (causa) {
    console.error('[whatsapp] assistente: pergunta não guardada:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/** Embrulha uma chamada do fluxo: o erro vira o valor de reserva (e o log, só com a classe). */
async function semLancar<T>(reserva: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (causa) {
    console.error('[whatsapp] assistente: plano:', causa instanceof Error ? causa.message : causa)
    return reserva
  }
}

export const marcarEntrega = (admin: Admin, id: string, mensagemId: string | null) => semLancar(null, () => fluxoDoPlano(admin).marcarEntrega(id, mensagemId))
export const entregaFalhou = (admin: Admin, id: string) => semLancar(null, () => fluxoDoPlano(admin).entregaFalhou(id))
export const cancelarPlano = (admin: Admin, userId: string) => semLancar([], () => fluxoDoPlano(admin).cancelar(userId))
export const fecharPergunta = (admin: Admin, userId: string) => semLancar([], () => fluxoDoPlano(admin).fecharPergunta(userId))
export const marcarEmRevisao = (admin: Admin, id: string) => semLancar(null, () => fluxoDoPlano(admin).marcarEmRevisao(id))
export const rearmar = (admin: Admin, id: string, mensagemId: string | null) => semLancar(null, () => fluxoDoPlano(admin).rearmar(id, mensagemId))
