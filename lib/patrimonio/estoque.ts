/**
 * Regras do Estoque de materiais, sem banco nem rede — dá para conferir com
 * tsx. O banco (estoque_*) confere tudo de novo; aqui é para a tela e para
 * dar a mensagem certa antes de ir ao servidor.
 */

export const UNIDADES = {
  un: 'unidade', cx: 'caixa', pct: 'pacote', par: 'par', kg: 'kg', g: 'g', L: 'litro', mL: 'mL', m: 'metro', rolo: 'rolo', frasco: 'frasco',
  ampola: 'ampola', kit: 'kit', fardo: 'fardo', cartela: 'cartela', tubo: 'tubo', dose: 'dose', galao: 'galão',
} as const
export type Unidade = keyof typeof UNIDADES
export const ehUnidade = (u: unknown): u is Unidade => typeof u === 'string' && Object.hasOwn(UNIDADES, u)
/** A sigla que aparece ao lado da quantidade ("12 pct", "3 galões" fica "3 galão": curto e sem plural). */
export const sigla = (u: string) => (u === 'galao' ? 'galão' : u)

export const ORIGENS_DE_ENTRADA = { compra: 'Compra', doacao: 'Doação', outro: 'Outra (devolução, sobra de evento…)' } as const
export type OrigemDeEntrada = keyof typeof ORIGENS_DE_ENTRADA
export const ehOrigemDeEntrada = (o: unknown): o is OrigemDeEntrada => typeof o === 'string' && Object.hasOwn(ORIGENS_DE_ENTRADA, o)

export const FINALIDADES = {
  atendimento: 'Atendimento (posto, ambulância, evento de saúde)', distribuicao: 'Distribuição à população', uso_interno: 'Uso interno da filial',
  evento: 'Evento ou operação', treinamento: 'Curso ou treinamento', outro: 'Outro',
} as const
export type Finalidade = keyof typeof FINALIDADES
export const ehFinalidade = (f: unknown): f is Finalidade => typeof f === 'string' && Object.hasOwn(FINALIDADES, f)

export const CAUSAS_DE_PERDA = { vencido: 'Venceu', avariado: 'Avariado ou contaminado', extravio: 'Extravio ou furto', outro: 'Outro' } as const
export type CausaDePerda = keyof typeof CAUSAS_DE_PERDA
export const ehCausaDePerda = (c: unknown): c is CausaDePerda => typeof c === 'string' && Object.hasOwn(CAUSAS_DE_PERDA, c)

export const TIPOS_DE_MOVIMENTO = {
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência', ajuste: 'Ajuste de contagem', perda: 'Perda', montagem: 'Montagem de kit',
} as const
export type TipoDeMovimento = keyof typeof TIPOS_DE_MOVIMENTO

// ---------------------------------------------------------------- números

/** "1.234,5" / "1234.5" / "12" → número (até 3 casas). Vazio → null. Inválido → NaN. */
export function lerQuantidade(texto: string): number | null {
  let s = String(texto ?? '').replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return Number.NaN
  return Math.round(Number(s) * 1000) / 1000
}

export const quantidade = (n: number, unidade?: string) =>
  `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${unidade ? ` ${sigla(unidade)}` : ''}`

// ---------------------------------------------------------------- situação

/** Dias de `hoje` até `data` (negativo: já passou). */
export function diasAte(data: string, hoje: string): number {
  return Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000)
}

export type SituacaoDaValidade = 'vencido' | 'vencendo' | 'ok'
/** Vencido: a validade já passou (o dia da validade ainda vale). Vencendo: dentro do aviso do item. */
export function situacaoDaValidade(validade: string | null, hoje: string, avisoDias: number): SituacaoDaValidade | null {
  if (!validade) return null
  const d = diasAte(validade, hoje)
  if (d < 0) return 'vencido'
  return d <= avisoDias ? 'vencendo' : 'ok'
}

export type SituacaoDoSaldo = 'zerado' | 'abaixo' | 'ok'
export function situacaoDoSaldo(saldo: number, minimo: number): SituacaoDoSaldo {
  if (saldo <= 0) return 'zerado'
  return minimo > 0 && saldo < minimo ? 'abaixo' : 'ok'
}

export type Lote = { id: string; local_id: string; lote: string; validade: string | null; quantidade: number }

/**
 * Como o banco faz a saída (FEFO): de um local, primeiro o que vence antes, o
 * que não tem validade por último, vencido nunca. Serve para a tela mostrar
 * de quais lotes vai sair antes de confirmar.
 */
export function planoDeSaida(lotes: Lote[], localId: string, qtd: number, data: string): { lotes: { id: string; lote: string; validade: string | null; tirar: number }[]; falta: number; vencido: number } {
  const doLocal = lotes.filter((l) => l.local_id === localId && l.quantidade > 0)
  const validos = doLocal.filter((l) => !l.validade || l.validade >= data)
    .sort((a, b) => (a.validade ?? '9999-12-31').localeCompare(b.validade ?? '9999-12-31') || a.lote.localeCompare(b.lote) || a.id.localeCompare(b.id))
  let falta = Math.round(qtd * 1000)
  const plano: { id: string; lote: string; validade: string | null; tirar: number }[] = []
  for (const l of validos) {
    if (falta <= 0) break
    const parte = Math.min(falta, Math.round(l.quantidade * 1000))
    plano.push({ id: l.id, lote: l.lote, validade: l.validade, tirar: parte / 1000 })
    falta -= parte
  }
  const vencido = doLocal.filter((l) => l.validade && l.validade < data).reduce((s, l) => s + Math.round(l.quantidade * 1000), 0) / 1000
  return { lotes: plano, falta: Math.max(0, falta) / 1000, vencido }
}

/** Quantos kits dá para montar num local com o que há (sem contar vencidos). */
export function kitsPossiveis(componentes: { item_id: string; quantidade: number }[], lotes: (Lote & { item_id: string })[], localId: string, hoje: string): number {
  if (!componentes.length) return 0
  let min = Infinity
  for (const c of componentes) {
    const ha = lotes.filter((l) => l.item_id === c.item_id && l.local_id === localId && (!l.validade || l.validade >= hoje)).reduce((s, l) => s + l.quantidade, 0)
    min = Math.min(min, Math.floor((ha + 1e-9) / c.quantidade))
  }
  return Number.isFinite(min) ? min : 0
}

// ---------------------------------------------------------------- formulário

export type ComponenteDoKit = { item_id: string; quantidade: number }

export function lerItem(f: FormData): { dados: Record<string, unknown> | null; erros: string[] } {
  const erros: string[] = []
  const t = (k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max)
  const nome = t('nome', 160)
  if (nome.length < 2) erros.push('Dê um nome ao item (ex.: "Luva de procedimento M").')
  const categoria_id = t('categoria_id', 40)
  if (!/^[0-9a-f-]{36}$/.test(categoria_id)) erros.push('Escolha a categoria.')
  const unidade = t('unidade', 10) || 'un'
  if (!ehUnidade(unidade)) erros.push('Unidade inválida.')
  const minimo = lerQuantidade(t('estoque_minimo', 20))
  if (minimo !== null && Number.isNaN(minimo)) erros.push('Estoque mínimo inválido.')
  const controla = f.get('controla_validade') === 'sim'
  const aviso = t('aviso_validade_dias', 4)
  if (aviso && (!/^\d+$/.test(aviso) || Number(aviso) < 1 || Number(aviso) > 365)) erros.push('Aviso de validade: de 1 a 365 dias.')
  const ehKit = f.get('eh_kit') === 'sim'
  let componentes: ComponenteDoKit[] = []
  if (ehKit) {
    try {
      const brutos = JSON.parse(String(f.get('componentes') ?? '[]')) as { item_id?: unknown; quantidade?: unknown }[]
      componentes = (Array.isArray(brutos) ? brutos : []).map((c) => ({ item_id: String(c.item_id ?? ''), quantidade: lerQuantidade(String(c.quantidade ?? '')) ?? Number.NaN }))
    } catch { componentes = [] }
    componentes = componentes.filter((c) => c.item_id)
    if (!componentes.length) erros.push('Diga o que vai em cada kit.')
    if (componentes.some((c) => !/^[0-9a-f-]{36}$/.test(c.item_id) || !(c.quantidade > 0))) erros.push('Cada componente precisa de quantidade maior que zero.')
    if (new Set(componentes.map((c) => c.item_id)).size !== componentes.length) erros.push('Um componente aparece duas vezes.')
  }
  if (erros.length) return { dados: null, erros }
  return {
    dados: {
      nome, categoria_id, unidade, descricao: t('descricao', 2000), estoque_minimo: minimo ?? 0, controla_validade: controla,
      aviso_validade_dias: aviso ? Number(aviso) : 60, eh_kit: ehKit, componentes, ...(f.has('ativo') ? { ativo: f.get('ativo') !== 'nao' } : {}),
    },
    erros,
  }
}
