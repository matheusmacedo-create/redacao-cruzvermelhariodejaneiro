import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chaveDoNome } from '@/lib/equipe'
import { lerPagina, lerSaldo, lerTransacao, mensagemDoErroDaApi, type TransacaoLida } from './unicopag'
import type { TransacaoDoPainel } from './painel'

const BASE = 'https://api.cloud.unicopag.com.br'
/** Serviço no cofre (integracoes_chaves) da chave de uma conta. */
export const servicoDaConta = (contaId: string) => `unicopag:${contaId}`

/**
 * O nível de quem está logado na Escola — a mesma regra de
 * private.nivel_escola: admin 3 (cadastra as contas e as chaves); a equipe
 * da escola, quem tem acesso aos livros da Escola no Financeiro e quem é do
 * setor Educação e Saúde, 2 (vê e atualiza).
 */
export async function contextoDaEscola() {
  const context = await requireWorkspace({ escola: true })
  const supabase = await createClient()
  let nivel = 0
  if (context.role === 'admin') nivel = 3
  else if (context.role === 'escola') nivel = 2
  else {
    const ws = context.workspace.id
    const coordenacao = (context.memberships as { coordination?: string | null }[]).map((m) => m.coordination).find(Boolean) ?? ''
    if (chaveDoNome(coordenacao) === 'educacao e saude') nivel = 2
    else {
      // A empresa Escola só aparece (RLS) para quem tem acesso aos livros dela — ou aos de todas as empresas.
      const [{ data: fin }, { data: setores }] = await Promise.all([
        supabase.from('fin_entidades').select('id').eq('workspace_id', ws).eq('tipo', 'escola').maybeSingle(),
        supabase.from('setor_membros').select('setores(nome)').eq('workspace_id', ws).eq('user_id', context.user.id),
      ])
      const nomes = (setores ?? []).map((s) => (Array.isArray(s.setores) ? s.setores[0] : s.setores) as { nome?: string } | null).map((s) => chaveDoNome(s?.nome ?? ''))
      if (fin || nomes.includes('educacao e saude')) nivel = 2
    }
  }
  return { context, supabase, nivel }
}

export type ContaDaEscola = {
  id: string; nome: string; descricao: string | null; sistema_url: string | null; ativa: boolean
  chave_final: string | null; chave_em: string | null; sincronizada_em: string | null; sincronizacao_erro: string | null
  saldo_disponivel: number | null; saldo_a_liberar: number | null; saldo_lido_em: string | null
  /** A conta desta Únicopag nos livros da Escola (criada na primeira leitura) e desde quando as vendas entram lá. */
  fin_conta_id: string | null; lancar_desde: string | null
}
export const COLUNAS_DA_CONTA = 'id,nome,descricao,sistema_url,ativa,chave_final,chave_em,sincronizada_em,sincronizacao_erro,saldo_disponivel,saldo_a_liberar,saldo_lido_em,fin_conta_id,lancar_desde'
export const lerConta = (c: Record<string, unknown>) => ({
  ...c,
  saldo_disponivel: c.saldo_disponivel === null || c.saldo_disponivel === undefined ? null : Number(c.saldo_disponivel),
  saldo_a_liberar: c.saldo_a_liberar === null || c.saldo_a_liberar === undefined ? null : Number(c.saldo_a_liberar),
}) as ContaDaEscola

class ErroDaApi extends Error {
  constructor(public status: number | null, mensagem: string) { super(mensagem) }
}

async function chamar(chave: string, caminho: string, busca: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(caminho, BASE)
  url.searchParams.set('api_token', chave)
  for (const [k, v] of Object.entries(busca)) url.searchParams.set(k, v)
  let resposta: Response
  try {
    resposta = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${chave}` }, cache: 'no-store', signal: AbortSignal.timeout(25_000) })
  } catch {
    throw new ErroDaApi(null, mensagemDoErroDaApi(null))
  }
  // Nunca repassar o corpo do erro nem a URL: a chave vai na query.
  if (!resposta.ok) throw new ErroDaApi(resposta.status, mensagemDoErroDaApi(resposta.status, chave))
  return resposta.json().catch(() => { throw new ErroDaApi(resposta.status, 'A Únicopag respondeu algo que não é JSON.') })
}

/** Confere uma chave antes de guardar: lê o saldo. Devolve o saldo ou a mensagem do erro. */
export async function testarChave(chave: string): Promise<{ saldo: { disponivel: number; a_liberar: number } | null } | { erro: string }> {
  try {
    return { saldo: lerSaldo(await chamar(chave, '/public/v1/balance')) }
  } catch (e) {
    return { erro: e instanceof ErroDaApi ? e.message : 'Não foi possível testar a chave.' }
  }
}

/** Páginas no máximo por sincronização (a API limita 1000 consultas/minuto por chave). */
const MAX_PAGINAS = 60
/** Depois da primeira carga, basta reler os últimos meses: é onde status ainda muda (estorno, chargeback). */
const JANELA_DIAS = 180

/**
 * Lê as transações da conta, página a página, até acabar — ou, quando a
 * conta já foi sincronizada antes, até uma página inteira mais velha que a
 * janela. Se a API ignorar `page` (a mesma página volta), para também.
 */
async function lerTransacoes(chave: string, completa: boolean): Promise<TransacaoLida[]> {
  const limite = Date.now() - JANELA_DIAS * 86_400_000
  const vistas = new Map<string, TransacaoLida>()
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const { itens, ultima } = lerPagina(await chamar(chave, '/public/v1/transactions', { page: String(pagina), per_page: '100' }))
    if (!itens.length) break
    let novas = 0, recentes = 0
    for (const bruta of itens) {
      const t = lerTransacao(bruta)
      if (!t) continue
      if (!vistas.has(t.hash)) novas++
      vistas.set(t.hash, t)
      if (Date.parse(t.criada_em) >= limite) recentes++
    }
    if (!novas) break
    if (ultima !== null && pagina >= ultima) break
    if (!completa && !recentes) break
  }
  return [...vistas.values()]
}

export type ResultadoDaSincronizacao = { conta: string; ok: boolean; mensagem: string; gravadas: number }

/**
 * Sincroniza uma conta: saldo e transações. Usa a service role (o cron não
 * tem sessão) — quem chama TEM de ter conferido antes que a pessoa pode
 * (nível 2 na Escola) ou que é o cron.
 */
export async function sincronizarConta(admin: SupabaseClient, workspaceId: string, conta: { id: string; nome: string; sincronizada_em: string | null }): Promise<ResultadoDaSincronizacao> {
  const { data: chave } = await admin.rpc('chave_de_integracao', { p_workspace_id: workspaceId, p_servico: servicoDaConta(conta.id) })
  if (typeof chave !== 'string' || !chave.trim()) {
    await admin.rpc('escola_gravar_sincronizacao', { p_conta_id: conta.id, p_transacoes: null, p_saldo: null, p_erro: 'Sem chave de API guardada para esta conta.' })
    return { conta: conta.nome, ok: false, mensagem: 'Sem chave de API guardada.', gravadas: 0 }
  }
  try {
    const saldo = lerSaldo(await chamar(chave.trim(), '/public/v1/balance'))
    const transacoes = await lerTransacoes(chave.trim(), !conta.sincronizada_em)
    let gravadas = 0
    // Em lotes, para o corpo da chamada não crescer sem limite.
    for (let i = 0; i < Math.max(1, transacoes.length); i += 500) {
      const { data, error } = await admin.rpc('escola_gravar_sincronizacao', {
        p_conta_id: conta.id, p_transacoes: transacoes.slice(i, i + 500), p_saldo: i === 0 ? saldo : null, p_erro: null,
      })
      if (error) throw new ErroDaApi(null, 'Não foi possível gravar as transações lidas.')
      gravadas += Number(data ?? 0)
    }
    return { conta: conta.nome, ok: true, mensagem: `${transacoes.length} transações lidas, ${gravadas} novas ou atualizadas.${await lancarNoFinanceiro(admin, conta.id)}`, gravadas }
  } catch (e) {
    const mensagem = e instanceof ErroDaApi ? e.message : 'Falha inesperada ao sincronizar.'
    await admin.rpc('escola_gravar_sincronizacao', { p_conta_id: conta.id, p_transacoes: null, p_saldo: null, p_erro: mensagem })
    return { conta: conta.nome, ok: false, mensagem, gravadas: 0 }
  }
}

/**
 * Leva as vendas pagas (e os estornos) para os livros da Escola no
 * Financeiro. Falhar aqui não derruba a leitura: as transações já estão
 * gravadas e a próxima leitura tenta de novo. Devolve o trecho da mensagem.
 */
async function lancarNoFinanceiro(admin: SupabaseClient, contaId: string): Promise<string> {
  const { data, error } = await admin.rpc('escola_lancar_no_financeiro', { p_conta_id: contaId })
  if (error) return ' Não foi possível lançar no Financeiro da escola agora; a próxima leitura tenta de novo.'
  const r = (data ?? {}) as { receitas?: number; estornos?: number; aviso?: string }
  if (r.aviso) return ` ${r.aviso}`
  const partes = [r.receitas ? `${r.receitas} ${r.receitas === 1 ? 'venda lançada' : 'vendas lançadas'}` : '', r.estornos ? `${r.estornos} ${r.estornos === 1 ? 'estorno' : 'estornos'}` : ''].filter(Boolean)
  return partes.length ? ` No Financeiro da escola: ${partes.join(' e ')}.` : ''
}

/** Sincroniza todas as contas ativas de um espaço. */
export async function sincronizarEspaco(workspaceId: string, soContaId?: string): Promise<ResultadoDaSincronizacao[]> {
  const admin = createAdminClient()
  let q = admin.from('escola_contas').select('id,nome,sincronizada_em').eq('workspace_id', workspaceId).eq('ativa', true)
  if (soContaId) q = q.eq('id', soContaId)
  const { data } = await q
  const r: ResultadoDaSincronizacao[] = []
  for (const c of data ?? []) r.push(await sincronizarConta(admin, workspaceId, c as { id: string; nome: string; sincronizada_em: string | null }))
  return r
}

export const COLUNAS_DA_TRANSACAO = 'conta_id,hash,metodo,status,situacao,valor,parcelas,cliente,documento,produto,origem,criada_em,paga_em'

/**
 * As transações criadas ou pagas desde uma data, de 1000 em 1000 (o limite
 * de linhas por consulta do PostgREST), até `maximo`.
 */
export async function transacoesDesde(supabase: SupabaseClient, workspaceId: string, desde: string, maximo = 50_000): Promise<TransacaoDoPainel[]> {
  const r: TransacaoDoPainel[] = []
  for (let i = 0; i < maximo; i += 1000) {
    const { data, error } = await supabase.from('escola_transacoes').select(COLUNAS_DA_TRANSACAO).eq('workspace_id', workspaceId)
      .or(`criada_em.gte.${desde},paga_em.gte.${desde}`).order('criada_em', { ascending: false }).order('hash').range(i, i + 999)
    if (error || !data?.length) break
    r.push(...data.map((t) => ({ ...t, valor: Number(t.valor) }) as TransacaoDoPainel))
    if (data.length < 1000) break
  }
  return r
}
