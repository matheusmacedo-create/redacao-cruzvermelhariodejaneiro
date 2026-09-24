/**
 * Regras do Financeiro, sem banco nem rede — dá para conferir com tsx.
 *
 * O banco aplica de novo o que importa (nível, aprovação, mês fechado); aqui
 * é o que a tela precisa para montar parcelas, mostrar situação e somar.
 */

export const NIVEIS = {
  ver: { valor: 1, rotulo: 'Ver', descricao: 'Lançamentos, cadastros e comprovantes, sem mudar nada.' },
  lancar: { valor: 2, rotulo: 'Lançar', descricao: 'Criar e editar despesas e receitas, marcar como pago, juntar comprovante.' },
  aprovar: { valor: 3, rotulo: 'Aprovar', descricao: 'Tudo acima, mais aprovar despesas que pedem aprovação (nunca as próprias).' },
  gestao: { valor: 4, rotulo: 'Gestão e fechamento', descricao: 'Tudo acima, mais contas, fontes, categorias, regras e fechamento do mês. É o nível do contador.' },
} as const
export type NomeDoNivel = keyof typeof NIVEIS
export type Nivel = 0 | 1 | 2 | 3 | 4
export const nivelDoNome = (n: string | null | undefined): Nivel => (n && Object.hasOwn(NIVEIS, n) ? NIVEIS[n as NomeDoNivel].valor : 0) as Nivel
export const ehNomeDoNivel = (n: unknown): n is NomeDoNivel => typeof n === 'string' && Object.hasOwn(NIVEIS, n)

export const TIPOS = {
  despesa: { rotulo: 'Despesa', plural: 'Despesas' },
  receita: { rotulo: 'Receita', plural: 'Receitas' },
  transferencia: { rotulo: 'Transferência', plural: 'Transferências' },
} as const
export type Tipo = keyof typeof TIPOS
export const ehTipo = (t: unknown): t is Tipo => typeof t === 'string' && Object.hasOwn(TIPOS, t)

export const FORMAS = {
  pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência', debito: 'Débito automático', cartao: 'Cartão', dinheiro: 'Dinheiro', cheque: 'Cheque', outro: 'Outro',
} as const
export type Forma = keyof typeof FORMAS
export const ehForma = (f: unknown): f is Forma => typeof f === 'string' && Object.hasOwn(FORMAS, f)

export const TIPOS_DE_CONTA = {
  corrente: 'Conta corrente', poupanca: 'Poupança', aplicacao: 'Aplicação', caixa: 'Caixa (dinheiro)', cartao: 'Cartão', gateway: 'Conta de pagamento (Únicopag)',
} as const
export type TipoDeConta = keyof typeof TIPOS_DE_CONTA
export const ehTipoDeConta = (t: unknown): t is TipoDeConta => typeof t === 'string' && Object.hasOwn(TIPOS_DE_CONTA, t)

export const TIPOS_DE_ANEXO = {
  nota: 'Nota fiscal', comprovante: 'Comprovante de pagamento', boleto: 'Boleto', recibo: 'Recibo', contrato: 'Contrato', outro: 'Outro',
} as const
export type TipoDeAnexo = keyof typeof TIPOS_DE_ANEXO
export const ehTipoDeAnexo = (t: unknown): t is TipoDeAnexo => typeof t === 'string' && Object.hasOwn(TIPOS_DE_ANEXO, t)

export const TIPOS_DE_ARQUIVO = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
export const TAMANHO_MAXIMO = 20 * 1024 * 1024
export const ehArquivoAceito = (t: string): t is keyof typeof TIPOS_DE_ARQUIVO => Object.hasOwn(TIPOS_DE_ARQUIVO, t)

// ---------------------------------------------------------------- dinheiro

const MAXIMO = 100_000_000

/** "R$ 1.234,56" → 1234.56. Aceita "1234.56", "1234,5" e "1.234". Zero ou negativo: null. */
export function lerValor(texto: string): number | null {
  let s = String(texto ?? '').replace(/[R$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 && n <= MAXIMO ? Math.round(n * 100) / 100 : null
}

/** Idem, mas aceita zero e negativo (saldo inicial de conta). */
export function lerSaldo(texto: string): number | null {
  const s = String(texto ?? '').trim()
  const semSinal = s.replace(/^-/, '')
  if (/^[R$\s0.,]*$/.test(semSinal)) return 0
  const v = lerValor(semSinal)
  if (v === null) return null
  return s.startsWith('-') ? -v : v
}

const FORMATO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const reais = (n: number) => FORMATO.format(n)
/** Para o campo do formulário: 1234.5 → "1.234,50". */
export const valorNoCampo = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const centavos = (n: number) => Math.round(n * 100)

// ---------------------------------------------------------------- datas

export const ehData = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))
export const ehMes = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

/** Soma meses mantendo o dia; 31/01 + 1 mês = 28 (ou 29)/02. */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

export const primeiroDia = (mes: string) => `${mes}-01`
export function ultimoDia(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}
export const mesDe = (data: string) => data.slice(0, 7)
export const mesSeguinte = (mes: string) => somarMeses(primeiroDia(mes), 1).slice(0, 7)
export const mesAnterior = (mes: string) => somarMeses(primeiroDia(mes), -1).slice(0, 7)

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export function nomeDoMes(mes: string, curto = false): string {
  const [a, m] = mes.split('-').map(Number)
  const nome = MESES[m - 1] ?? mes
  return curto ? `${nome.slice(0, 3)}/${String(a).slice(2)}` : `${nome} de ${a}`
}
export const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)
}

// ---------------------------------------------------------------- parcelas e recorrência

export const REPETICOES = { unica: 'Uma vez', parcelada: 'Parcelada', mensal: 'Todo mês' } as const
export type Repeticao = keyof typeof REPETICOES
export const ehRepeticao = (r: unknown): r is Repeticao => typeof r === 'string' && Object.hasOwn(REPETICOES, r)

export type Ocorrencia = { descricao: string; valor: number; vencimento: string; competencia: string; parcela: number | null; parcelas: number | null; recorrente: boolean }

/**
 * Parcelada: o valor total dividido em N, e os centavos que sobram vão para
 * a primeira parcela (a soma bate sempre). Todo mês: o valor inteiro, N vezes.
 */
export function gerarOcorrencias(p: { descricao: string; valor: number; vencimento: string; competencia: string; repeticao: Repeticao; vezes: number }): Ocorrencia[] {
  if (p.repeticao === 'unica' || p.vezes <= 1) {
    return [{ descricao: p.descricao, valor: p.valor, vencimento: p.vencimento, competencia: p.competencia, parcela: null, parcelas: null, recorrente: false }]
  }
  const n = Math.min(Math.max(Math.trunc(p.vezes), 2), 120)
  const total = centavos(p.valor)
  const base = p.repeticao === 'parcelada' ? Math.floor(total / n) : total
  const sobra = p.repeticao === 'parcelada' ? total - base * n : 0
  return Array.from({ length: n }, (_, i) => ({
    descricao: p.repeticao === 'parcelada' ? `${p.descricao} (${i + 1}/${n})` : p.descricao,
    valor: (base + (i === 0 ? sobra : 0)) / 100,
    vencimento: somarMeses(p.vencimento, i),
    competencia: somarMeses(p.competencia, i),
    parcela: p.repeticao === 'parcelada' ? i + 1 : null,
    parcelas: p.repeticao === 'parcelada' ? n : null,
    recorrente: p.repeticao === 'mensal',
  }))
}

// ---------------------------------------------------------------- formulário

export type DadosDoLancamento = {
  tipo: Tipo; descricao: string; valor: number; conta_id: string; conta_destino_id: string | null; categoria_id: string | null; fonte_id: string
  projeto_id: string | null; favorecido_id: string | null; competencia: string; vencimento: string; pago_em: string | null; valor_pago: number | null
  forma: Forma | null; documento: string | null; observacao: string | null
}

const uuid = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim()
  return /^[0-9a-f-]{36}$/.test(s) ? s : null
}
const texto = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max) || null

/** Lê o formulário do lançamento. Na criação, devolve também as ocorrências. */
export function lerLancamento(f: FormData, hoje: string): { dados: DadosDoLancamento | null; ocorrencias: Ocorrencia[]; erros: string[] } {
  const erros: string[] = []
  const tipo = String(f.get('tipo') ?? '')
  if (!ehTipo(tipo)) erros.push('Escolha se é despesa, receita ou transferência.')
  const descricao = String(f.get('descricao') ?? '').trim().slice(0, 190)
  if (descricao.length < 2) erros.push('Descreva o lançamento.')
  const valor = lerValor(String(f.get('valor') ?? ''))
  if (valor === null) erros.push('Informe um valor maior que zero.')
  const conta_id = uuid(f.get('conta_id'))
  if (!conta_id) erros.push(tipo === 'receita' ? 'Escolha a conta onde entra.' : 'Escolha a conta de onde sai.')
  const conta_destino_id = tipo === 'transferencia' ? uuid(f.get('conta_destino_id')) : null
  if (tipo === 'transferencia' && !conta_destino_id) erros.push('Escolha a conta de destino.')
  if (conta_destino_id && conta_destino_id === conta_id) erros.push('A conta de destino precisa ser outra.')
  const categoria_id = tipo === 'transferencia' ? null : uuid(f.get('categoria_id'))
  if (tipo !== 'transferencia' && !categoria_id) erros.push('Escolha a categoria.')
  const fonte_id = uuid(f.get('fonte_id'))
  if (!fonte_id) erros.push('Escolha a fonte do recurso.')
  const vencimento = String(f.get('vencimento') ?? '')
  if (!ehData(vencimento)) erros.push(tipo === 'receita' ? 'Informe a data prevista de entrada.' : 'Informe o vencimento.')
  const mes = String(f.get('competencia') ?? '')
  const competencia = ehMes(mes) ? primeiroDia(mes) : ehData(vencimento) ? primeiroDia(mesDe(vencimento)) : ''
  const pago = f.get('pago') === 'sim'
  const pago_em = pago ? String(f.get('pago_em') ?? '') : ''
  if (pago && !ehData(pago_em)) erros.push('Informe a data do pagamento.')
  if (pago && ehData(pago_em) && pago_em > hoje) erros.push('A data do pagamento não pode ser no futuro.')
  const valorPagoTexto = String(f.get('valor_pago') ?? '').trim()
  const valor_pago = pago ? (valorPagoTexto ? lerValor(valorPagoTexto) : valor) : null
  if (pago && valorPagoTexto && valor_pago === null) erros.push('Valor pago inválido.')
  const forma = String(f.get('forma') ?? '')
  const repeticao = String(f.get('repeticao') ?? 'unica')
  const vezes = Number(f.get('vezes') ?? 1)
  if (ehRepeticao(repeticao) && repeticao !== 'unica' && (!Number.isInteger(vezes) || vezes < 2 || vezes > 120)) erros.push('Informe de 2 a 120 vezes.')
  if (repeticao !== 'unica' && pago) erros.push('Parcelas e recorrências entram em aberto; marque cada uma como paga quando pagar.')
  if (erros.length || !ehTipo(tipo) || valor === null || !conta_id || !fonte_id) return { dados: null, ocorrencias: [], erros }
  const dados: DadosDoLancamento = {
    tipo, descricao, valor, conta_id, conta_destino_id, categoria_id, fonte_id,
    projeto_id: uuid(f.get('projeto_id')), favorecido_id: tipo === 'transferencia' ? null : uuid(f.get('favorecido_id')),
    competencia, vencimento, pago_em: pago ? pago_em : null, valor_pago: pago ? valor_pago : null,
    forma: ehForma(forma) ? forma : null, documento: texto(f.get('documento'), 80), observacao: texto(f.get('observacao'), 2000),
  }
  const ocorrencias = gerarOcorrencias({ descricao, valor, vencimento, competencia, repeticao: ehRepeticao(repeticao) ? repeticao : 'unica', vezes })
  return { dados, ocorrencias, erros }
}

// ---------------------------------------------------------------- situação

export type Lancamento = {
  id: string; entidade_id?: string; tipo: Tipo; descricao: string; valor: number; conta_id: string; conta_destino_id: string | null; categoria_id: string | null
  fonte_id: string; projeto_id: string | null; favorecido_id: string | null; competencia: string; vencimento: string; pago_em: string | null
  valor_pago: number | null; forma: string | null; documento: string | null; observacao: string | null; grupo_id: string | null
  parcela: number | null; parcelas: number | null; recorrente: boolean; aprovacao: 'nao_exige' | 'pendente' | 'aprovada' | 'recusada'
  aprovado_por: string | null; aprovado_em: string | null; motivo_recusa: string | null; criado_por: string | null; created_at: string; updated_at: string
}
export const COLUNAS_DO_LANCAMENTO = 'id,entidade_id,tipo,descricao,valor,conta_id,conta_destino_id,categoria_id,fonte_id,projeto_id,favorecido_id,competencia,vencimento,pago_em,valor_pago,forma,documento,observacao,grupo_id,parcela,parcelas,recorrente,aprovacao,aprovado_por,aprovado_em,motivo_recusa,criado_por,created_at,updated_at'

export type Situacao = 'pago' | 'recebido' | 'atrasado' | 'vence_hoje' | 'aberto' | 'aprovacao' | 'recusado'

export function situacao(l: Pick<Lancamento, 'tipo' | 'vencimento' | 'pago_em' | 'aprovacao'>, hoje: string): Situacao {
  if (l.pago_em) return l.tipo === 'receita' ? 'recebido' : 'pago'
  if (l.aprovacao === 'recusada') return 'recusado'
  if (l.aprovacao === 'pendente') return 'aprovacao'
  if (l.vencimento < hoje) return 'atrasado'
  if (l.vencimento === hoje) return 'vence_hoje'
  return 'aberto'
}

export const SITUACOES: Record<Situacao, { rotulo: string; classe: string }> = {
  pago: { rotulo: 'Pago', classe: 'bg-success/15 text-success' },
  recebido: { rotulo: 'Recebido', classe: 'bg-success/15 text-success' },
  atrasado: { rotulo: 'Atrasado', classe: 'bg-destructive/10 text-destructive' },
  vence_hoje: { rotulo: 'Vence hoje', classe: 'bg-warning/20 text-warning-foreground' },
  aberto: { rotulo: 'Em aberto', classe: 'bg-muted text-muted-foreground' },
  aprovacao: { rotulo: 'Esperando aprovação', classe: 'bg-warning/20 text-warning-foreground' },
  recusado: { rotulo: 'Recusado', classe: 'bg-destructive/10 text-destructive' },
}

/** O efeito de um lançamento pago no saldo de uma conta (+ entra, − sai). */
export function efeitoNaConta(l: Pick<Lancamento, 'tipo' | 'conta_id' | 'conta_destino_id' | 'valor' | 'valor_pago' | 'pago_em'>, contaId: string): number {
  if (!l.pago_em) return 0
  const v = centavos(l.valor_pago ?? l.valor)
  if (l.tipo === 'receita') return l.conta_id === contaId ? v : 0
  if (l.tipo === 'despesa') return l.conta_id === contaId ? -v : 0
  return (l.conta_destino_id === contaId ? v : 0) - (l.conta_id === contaId ? v : 0)
}

export type ContaParaSaldo = { id: string; saldo_inicial: number; saldo_inicial_em: string }

/** Saldo de cada conta até uma data: saldo inicial + o que foi pago/recebido desde ele. */
export function saldos(contas: ContaParaSaldo[], lancamentos: Pick<Lancamento, 'tipo' | 'conta_id' | 'conta_destino_id' | 'valor' | 'valor_pago' | 'pago_em'>[], ate: string): Map<string, number> {
  const r = new Map<string, number>()
  for (const c of contas) {
    let total = centavos(c.saldo_inicial)
    for (const l of lancamentos) if (l.pago_em && l.pago_em >= c.saldo_inicial_em && l.pago_em <= ate) total += efeitoNaConta(l, c.id)
    r.set(c.id, total / 100)
  }
  return r
}

/** Soma em centavos (sem erro de ponto flutuante) e devolve em reais. */
export const somar = (valores: number[]) => valores.reduce((s, v) => s + centavos(v), 0) / 100

/** CPF (11) ou CNPJ (14) só com dígitos; outro tamanho é inválido. */
export function lerDocumento(texto: string): { documento: string | null; valido: boolean } {
  const d = String(texto ?? '').replace(/\D/g, '')
  if (!d) return { documento: null, valido: true }
  return { documento: d, valido: d.length === 11 || d.length === 14 }
}
export function documentoLegivel(d: string | null): string {
  if (!d) return ''
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  return d
}
