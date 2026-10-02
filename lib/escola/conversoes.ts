/**
 * Os pagamentos da Escola avisados à Meta pela API de Conversões (pedido do
 * Matheus, 02/10/2026): cada cobrança paga na Únicopag vira um evento
 * `Purchase`, com `content_category` dizendo se foi a taxa de inscrição ou o
 * curso — dois momentos da trajetória do aluno, que o Gerenciador de Eventos
 * separa em duas conversões personalizadas.
 *
 * O pixel do site não vê o pagamento (ele acontece na página da Únicopag, ou
 * no banco, no caso de boleto e PIX); por isso é o servidor que avisa, depois
 * de cada leitura das transações (lib/escola/conversoes-servidor.ts).
 *
 * Módulo puro: sem rede, sem banco e sem crypto (quem chama passa a função
 * de hash). Conferido por scripts/conferir-conversoes-escola.ts.
 */

import { contaComoRecebido, type Situacao } from './unicopag'
import { chave, type Destino } from './cursos'

export const EVENTO = 'Purchase'
export const MOEDA = 'BRL'
/** A Meta só aceita evento com até 7 dias: venda mais antiga que isso não é enviada. */
export const PRAZO_DO_EVENTO_DIAS = 7
/** Eventos por chamada à API (o limite da Meta é 1000). */
export const EVENTOS_POR_LOTE = 100
/** Tentativas de envio de uma mesma venda antes de desistir (uma por leitura). */
export const TENTATIVAS = 5

export const CATEGORIAS = {
  taxa_de_inscricao: { rotulo: 'Taxa de inscrição', descricao: 'A pessoa pagou a taxa de inscrição do curso.' },
  curso: { rotulo: 'Curso', descricao: 'A pessoa pagou o curso.' },
} as const
export type Categoria = keyof typeof CATEGORIAS

/**
 * Qual momento da trajetória o produto da Únicopag representa:
 * "Taxa de inscrição — X" e "X — Inscrição…" são a taxa; o resto é o curso.
 * Mesma regra de nome de lib/escola/cursos.ts (cursoNoProduto).
 */
export function categoriaDoProduto(produto: string | null | undefined): Categoria {
  const c = chave(produto ?? '')
  return /^taxa de inscricao\b/.test(c) || /\s-\s+inscricao\b/.test(c) ? 'taxa_de_inscricao' : 'curso'
}

/** O id do pixel (conjunto de dados) como a Meta mostra: só dígitos. */
export function lerPixelId(valor: string): string | null {
  const d = valor.trim()
  return /^\d{5,30}$/.test(d) ? d : null
}

/** O que a Únicopag diz da pessoa que pagou. Fica só na memória do servidor: nunca vai ao banco. */
export type PessoaDaTransacao = { nome: string | null; email: string | null; telefone: string | null; documento: string | null }

export type TransacaoParaEnviar = {
  hash: string; situacao: Situacao; valor: number; produto: string | null; paga_em: string | null; pessoa: PessoaDaTransacao | null
}

/** Por que uma transação não vira evento (null = vira). */
export function motivoParaNaoEnviar(t: Pick<TransacaoParaEnviar, 'situacao' | 'valor' | 'paga_em' | 'produto'>, destino: Destino, agora: Date): string | null {
  if (!contaComoRecebido(t.situacao)) return 'não está paga'
  if (!t.paga_em) return 'sem data de pagamento'
  if (t.valor <= 0) return 'sem valor'
  if (destino.tipo === 'teste') return 'produto de teste'
  if (destino.tipo === 'ignorado') return 'produto ignorado pela equipe'
  if (Date.parse(t.paga_em) < agora.getTime() - PRAZO_DO_EVENTO_DIAS * 86_400_000) return `paga há mais de ${PRAZO_DO_EVENTO_DIAS} dias (a Meta não aceita)`
  return null
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** E-mail, telefone, nome e CPF no formato que a Meta exige antes do hash (minúsculas, só dígitos no telefone com o 55). */
export function normalizarPessoa(p: PessoaDaTransacao): { em: string | null; ph: string | null; fn: string | null; ln: string | null; external_id: string | null } {
  const email = (p.email ?? '').trim().toLowerCase()
  let tel = (p.telefone ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (tel.length === 10 || tel.length === 11) tel = '55' + tel
  if (!(tel.length === 12 || tel.length === 13) || !tel.startsWith('55')) tel = ''
  const nome = semAcento((p.nome ?? '').toLowerCase()).replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const cpf = (p.documento ?? '').replace(/\D/g, '')
  return {
    em: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
    ph: tel || null,
    fn: nome[0] ?? null,
    ln: nome.length > 1 ? nome[nome.length - 1] : null,
    external_id: cpf.length === 11 ? cpf : null,
  }
}

export type EventoDaMeta = {
  event_name: typeof EVENTO
  event_time: number
  event_id: string
  action_source: 'website' | 'other'
  event_source_url?: string
  user_data: Record<string, string[]>
  custom_data: { currency: typeof MOEDA; value: number; content_category: Categoria; content_name: string; content_type: 'product'; content_ids: string[]; order_id: string; num_items: number }
}

/** O id do evento: o mesmo hash da Únicopag — reenviar nunca duplica na Meta. */
export const idDoEvento = (hash: string) => `unicopag:${hash}`

/**
 * O evento `Purchase` de uma venda. `hash` é SHA-256 em hexadecimal (a Meta
 * exige os dados da pessoa assim). Sem página, o evento sai como `other`:
 * `website` exige o endereço.
 */
export function montarEvento(t: TransacaoParaEnviar, o: { categoria: Categoria; curso: string; pagina: string | null; hash: (s: string) => string }): EventoDaMeta {
  const n = normalizarPessoa(t.pessoa ?? { nome: null, email: null, telefone: null, documento: null })
  const user_data: Record<string, string[]> = { country: [o.hash('br')] }
  for (const k of ['em', 'ph', 'fn', 'ln', 'external_id'] as const) if (n[k]) user_data[k] = [o.hash(n[k] as string)]
  const produto = (t.produto ?? o.curso).trim().slice(0, 150)
  return {
    event_name: EVENTO,
    event_time: Math.floor(Date.parse(t.paga_em as string) / 1000),
    event_id: idDoEvento(t.hash),
    action_source: o.pagina ? 'website' : 'other',
    ...(o.pagina ? { event_source_url: o.pagina } : {}),
    user_data,
    custom_data: { currency: MOEDA, value: Math.round(t.valor) / 100, content_category: o.categoria, content_name: o.curso.slice(0, 150), content_type: 'product', content_ids: [produto], order_id: t.hash, num_items: 1 },
  }
}

/** Quantos dados de pessoa o evento leva: diz à equipe se a correspondência com a Meta tem chance. */
export function qualidadeDoEvento(e: Pick<EventoDaMeta, 'user_data'>): 'boa' | 'fraca' | 'nenhuma' {
  const tem = (k: string) => Array.isArray(e.user_data[k]) && e.user_data[k].length > 0
  if (tem('em') || tem('ph')) return 'boa'
  if (tem('fn') || tem('external_id')) return 'fraca'
  return 'nenhuma'
}

/** A resposta de POST /{pixel}/events: quantos eventos a Meta recebeu. */
export function lerRespostaDeEventos(corpo: unknown): { recebidos: number; rastro: string | null } | null {
  if (!corpo || typeof corpo !== 'object') return null
  const r = corpo as Record<string, unknown>
  const n = typeof r.events_received === 'number' ? r.events_received : typeof r.events_received === 'string' && /^\d+$/.test(r.events_received) ? Number(r.events_received) : null
  if (n === null) return null
  return { recebidos: n, rastro: typeof r.fbtrace_id === 'string' ? r.fbtrace_id.slice(0, 80) : null }
}

/** A frase do resultado de uma leitura, para a mensagem da sincronização. */
export function fraseDoEnvio(r: { enviados: number; falhas: number; semPessoa: number }): string {
  if (!r.enviados && !r.falhas) return ''
  const partes = [r.enviados ? `${r.enviados} ${r.enviados === 1 ? 'evento enviado' : 'eventos enviados'} à Meta` : '', r.falhas ? `${r.falhas} ${r.falhas === 1 ? 'falhou' : 'falharam'}` : ''].filter(Boolean)
  const aviso = r.semPessoa ? ` (${r.semPessoa} sem e-mail nem telefone: a Meta pode não casar com ninguém)` : ''
  return ` ${partes.join(', ')}${aviso}.`
}

/** O resumo da tela: por categoria, quantos eventos foram enviados, o valor e quantos falharam. */
export function resumirEnvios(envios: { categoria: string; valor: number; enviado_em: string | null; erro: string | null }[]): { categoria: Categoria; enviados: number; valor: number; falhas: number }[] {
  const r = new Map<Categoria, { enviados: number; valor: number; falhas: number }>()
  for (const e of envios) {
    if (!Object.hasOwn(CATEGORIAS, e.categoria)) continue
    const x = r.get(e.categoria as Categoria) ?? { enviados: 0, valor: 0, falhas: 0 }
    if (e.enviado_em) { x.enviados++; x.valor += e.valor } else if (e.erro) x.falhas++
    r.set(e.categoria as Categoria, x)
  }
  return (Object.keys(CATEGORIAS) as Categoria[]).filter((c) => r.has(c)).map((c) => ({ categoria: c, ...(r.get(c) as { enviados: number; valor: number; falhas: number }) }))
}
