/**
 * A leitura das respostas da API pública da Únicopag
 * (https://docs.unicopag.com — base https://api.cloud.unicopag.com.br,
 * autenticação por `api_token` na query, valores em centavos). Puro: sem
 * rede nem banco, dá para conferir com tsx. A chamada em si mora em
 * lib/escola/servidor.ts.
 *
 * A documentação não descreve a paginação da listagem de transações nem o
 * fuso das datas sem offset; por isso a leitura aceita as formas comuns
 * (lista pura, `{ data: [] }` com `meta`, paginador aninhado) e trata data
 * sem fuso como horário de Brasília, que é o do painel da Únicopag.
 */

export type Situacao = 'pago' | 'pendente' | 'recusado' | 'cancelado' | 'estornado' | 'em_disputa' | 'contestado'
export type Metodo = 'pix' | 'cartao' | 'boleto' | 'outro'

export const SITUACOES: Record<Situacao, { rotulo: string; classe: string; ajuda: string }> = {
  pago: { rotulo: 'Pago', classe: 'bg-success/15 text-success', ajuda: 'Pagamento aprovado.' },
  pendente: { rotulo: 'Aguardando', classe: 'bg-warning/20 text-warning-foreground', ajuda: 'Cobrança aberta ou em análise.' },
  recusado: { rotulo: 'Recusado', classe: 'bg-muted text-muted-foreground', ajuda: 'Recusado pelo banco, pelo antifraude ou com falha.' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-muted text-muted-foreground', ajuda: 'Cobrança cancelada ou expirada sem pagamento.' },
  estornado: { rotulo: 'Estornado', classe: 'bg-destructive/10 text-destructive', ajuda: 'O dinheiro foi devolvido ao aluno.' },
  em_disputa: { rotulo: 'Em disputa', classe: 'bg-warning/20 text-warning-foreground', ajuda: 'Pago, mas o titular do cartão abriu contestação (pré-chargeback).' },
  contestado: { rotulo: 'Contestado', classe: 'bg-destructive/10 text-destructive', ajuda: 'Chargeback confirmado: o valor volta ao titular do cartão.' },
}
export const ehSituacao = (v: unknown): v is Situacao => typeof v === 'string' && v in SITUACOES

export const METODOS: Record<Metodo, string> = { pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto', outro: 'Outro' }
export const ehMetodo = (v: unknown): v is Metodo => typeof v === 'string' && v in METODOS

/** Os status da documentação ("Status de Pagamento"), no que importa para a gestão. */
const MAPA: Record<string, Situacao> = {
  paid: 'pago',
  processing: 'pendente', pending: 'pendente', waiting_payment: 'pendente', antifraud: 'pendente', med_received: 'pendente', med_analysis: 'pendente',
  refused: 'recusado', failed: 'recusado', med_reproved: 'recusado',
  cancelled: 'cancelado', canceled: 'cancelado', expired: 'cancelado',
  refunded: 'estornado',
  pre_chargeback: 'em_disputa',
  chargeback: 'contestado',
}

/** Status desconhecido vira "aguardando": contar como pago inventaria dinheiro; como recusado, sumiria com ele. */
export function situacaoDoStatus(status: string | null | undefined): Situacao {
  return MAPA[(status ?? '').trim().toLowerCase()] ?? 'pendente'
}

/** O que entra como recebido: pago e em disputa (a disputa ainda não devolveu). */
export const contaComoRecebido = (s: Situacao) => s === 'pago' || s === 'em_disputa'

export function metodoDe(v: string | null | undefined): Metodo {
  const m = (v ?? '').trim().toLowerCase()
  if (m === 'pix') return 'pix'
  if (m === 'credit_card' || m === 'card' || m === 'creditcard' || m === 'cartao' || m === 'debit_card') return 'cartao'
  if (m === 'billet' || m === 'boleto' || m === 'bank_slip') return 'boleto'
  return 'outro'
}

/** "123.456.789-01" → "***.456.789-**"; CNPJ fica inteiro (é de empresa); o resto, nada. */
export function mascararDocumento(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return null
}

/**
 * Data da API em ISO. "2025-06-09T00:00:00.000000Z" e "2025-06-09 00:00:00"
 * (sem fuso → Brasília, -03:00) e "15/01/2026 10:30:00". Inválida → null.
 */
export function lerData(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  let s = v.trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (br) s = `${br[3]}-${br[2]}-${br[1]} ${br[4] ?? '00'}:${br[5] ?? '00'}:${br[6] ?? '00'}`
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i)
  if (!m) return null
  const hora = m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]) : '00:00:00'
  const fuso = m[4] ? (m[4].toUpperCase() === 'Z' ? 'Z' : m[4].includes(':') ? m[4] : `${m[4].slice(0, 3)}:${m[4].slice(3)}`) : '-03:00'
  const frac = m[3] ? m[3].slice(0, 4) : ''
  const d = new Date(`${m[1]}T${hora}${frac}${fuso}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null)
const inteiro = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN
  return Number.isFinite(n) ? Math.round(n) : null
}

/** A linha que vai para escola_transacoes. */
export type TransacaoLida = {
  hash: string; metodo: Metodo; status: string; situacao: Situacao; valor: number; parcelas: number | null
  cliente: string | null; documento: string | null; produto: string | null; origem: string | null
  criada_em: string; paga_em: string | null; atualizada_em: string | null
}

/** Uma transação da API. Sem hash, sem valor ou sem data de criação: descartada (null). */
export function lerTransacao(bruta: unknown): TransacaoLida | null {
  if (!bruta || typeof bruta !== 'object') return null
  const t = bruta as Record<string, unknown>
  const hash = texto(t.hash, 100) ?? texto(t.id, 100)
  const valor = inteiro(t.amount_total) ?? inteiro(t.amount)
  const criada = lerData(t.created_at)
  if (!hash || valor === null || valor < 0 || !criada) return null
  const status = (texto(t.payment_status, 40) ?? texto(t.status, 40) ?? 'desconhecido').toLowerCase()
  const cliente = (t.customer && typeof t.customer === 'object' ? t.customer : {}) as Record<string, unknown>
  const itens = [t.products, t.items, t.cart].find(Array.isArray) as unknown[] | undefined
  const titulos = [...new Set((itens ?? []).map((i) => texto((i as Record<string, unknown> | null)?.title, 150)).filter(Boolean) as string[])]
  const parcelas = inteiro(t.installments)
  const situacao = situacaoDoStatus(status)
  return {
    hash, metodo: metodoDe(texto(t.payment_method, 30)), status, situacao, valor,
    parcelas: parcelas && parcelas >= 1 && parcelas <= 24 ? parcelas : null,
    cliente: texto(cliente.name, 200), documento: mascararDocumento(texto(cliente.document, 30)),
    produto: titulos.length ? titulos.join(' + ').slice(0, 300) : null,
    origem: texto(t.utm_source, 100) ?? texto(t.src, 100) ?? texto(cliente.utm_source, 100),
    criada_em: criada,
    // Pago sem paid_at (acontece em importações antigas): usa a última atualização.
    paga_em: lerData(t.paid_at) ?? (contaComoRecebido(situacao) ? lerData(t.updated_at) ?? criada : null),
    atualizada_em: lerData(t.updated_at),
  }
}

/** Uma página da listagem: os itens e, se a API disser, a última página. */
export function lerPagina(corpo: unknown): { itens: unknown[]; ultima: number | null } {
  const ultimaDe = (o: unknown): number | null => {
    if (!o || typeof o !== 'object') return null
    const r = o as Record<string, unknown>
    return inteiro(r.last_page) ?? inteiro((r.meta as Record<string, unknown> | undefined)?.last_page) ?? inteiro((r.pagination as Record<string, unknown> | undefined)?.last_page)
  }
  if (Array.isArray(corpo)) return { itens: corpo, ultima: null }
  if (!corpo || typeof corpo !== 'object') return { itens: [], ultima: null }
  const r = corpo as Record<string, unknown>
  if (Array.isArray(r.data)) return { itens: r.data, ultima: ultimaDe(r) }
  if (r.data && typeof r.data === 'object' && Array.isArray((r.data as Record<string, unknown>).data)) {
    return { itens: (r.data as Record<string, unknown>).data as unknown[], ultima: ultimaDe(r.data) ?? ultimaDe(r) }
  }
  for (const k of ['transactions', 'items', 'results']) if (Array.isArray(r[k])) return { itens: r[k] as unknown[], ultima: ultimaDe(r) }
  return { itens: [], ultima: null }
}

/** O saldo ({ available, waiting_funds } em centavos). */
export function lerSaldo(corpo: unknown): { disponivel: number; a_liberar: number } | null {
  if (!corpo || typeof corpo !== 'object') return null
  const r = ((corpo as Record<string, unknown>).data && typeof (corpo as Record<string, unknown>).data === 'object' ? (corpo as Record<string, unknown>).data : corpo) as Record<string, unknown>
  const disponivel = inteiro(r.available) ?? inteiro(r.balance)
  if (disponivel === null) return null
  return { disponivel, a_liberar: inteiro(r.waiting_funds) ?? inteiro(r.pending) ?? 0 }
}

/** A chave nunca aparece: só os 4 últimos caracteres, para reconhecer qual está guardada. */
export const finalDaChave = (chave: string) => chave.trim().slice(-4)

/** Erro da API em português, sem nunca repetir a chave (ela vai na URL). */
export function mensagemDoErroDaApi(status: number | null, chave?: string): string {
  const sem = (s: string) => (chave ? s.split(chave).join('•••') : s)
  if (status === 401) return 'A Únicopag recusou a chave (401). Confira se é a chave de API desta conta e se ela ainda vale.'
  if (status === 403) return 'A chave não tem permissão para esta consulta (403). Peça à Únicopag o acesso de leitura.'
  if (status === 429) return 'Muitas consultas seguidas (429). Tente de novo em alguns minutos.'
  if (status && status >= 500) return sem(`A Únicopag está com problema agora (${status}). Tente de novo mais tarde.`)
  if (status) return sem(`A Únicopag respondeu ${status}.`)
  return 'Não foi possível falar com a Únicopag (sem resposta). Tente de novo.'
}
