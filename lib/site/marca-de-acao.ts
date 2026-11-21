/**
 * A marca "Nossas ações" de um pacote: diz que a notícia conta uma ação que a
 * filial realizou, em que dia e onde. É o que põe a matéria na página /acoes/
 * do site (lib/site/acoes.ts, que monta a página).
 *
 * Fica à parte da página de propósito: a tela do pacote, no navegador, usa a
 * conferência daqui, e não precisa carregar o molde das páginas do site.
 *
 * A marca vive em `social_packages.mestre.acao`, junto das outras chaves do
 * mestre que não são texto (a origem no Cérebro, a chave da importação): sem
 * coluna nova e sem migração. O salvamento do mestre preserva as chaves que a
 * tela não edita (salvarMestre, app/actions/pacotes.ts).
 *
 * Módulo puro (sem banco, sem rede), conferido por
 * `npx tsx scripts/conferir-pagina-de-acoes.ts`.
 */

export const CAMINHO_DAS_ACOES = '/acoes/'

/** A marca gravada no mestre do pacote. */
export type AcaoDoMestre = {
  /** O dia em que a ação aconteceu, AAAA-MM-DD. */
  data: string
  /** Onde foi (bairro, cidade, nome do lugar). Pode ficar em branco. */
  local: string
}

/** A filial foi fundada em 1908: data anterior é erro de digitação. */
const ANO_MINIMO = 1908
const LIMITE_DO_LOCAL = 120

/** O dia de hoje no Rio, AAAA-MM-DD. */
export function hojeNoRio(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/** AAAA-MM-DD que existe de verdade no calendário (2026-02-31 não existe). */
export function diaValido(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

const limparLocal = (texto: unknown) => String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_DO_LOCAL)

/**
 * Confere o que a pessoa preencheu. Devolve a marca pronta para gravar, ou o
 * erro em português. A tela usa antes de enviar e o servidor confere de novo.
 */
export function validarAcao(entrada: { data?: unknown; local?: unknown }, hoje: string = hojeNoRio()): { acao: AcaoDoMestre } | { erro: string } {
  const data = String(entrada.data ?? '').trim()
  if (!data) return { erro: 'Informe o dia em que a ação aconteceu.' }
  if (!diaValido(data)) return { erro: 'Essa data não existe no calendário. Confira o dia e o mês.' }
  if (Number(data.slice(0, 4)) < ANO_MINIMO) return { erro: `A data precisa ser de ${ANO_MINIMO} em diante.` }
  if (data > hoje) return { erro: 'Esta página é o histórico do que já aconteceu: a data não pode ser no futuro.' }
  return { acao: { data, local: limparLocal(entrada.local) } }
}

/** A marca como está no mestre; nulo quando não há ou quando o que há não serve. */
export function lerAcao(mestre: unknown): AcaoDoMestre | null {
  const bruto = (mestre as Record<string, unknown> | null | undefined)?.acao
  if (!bruto || typeof bruto !== 'object') return null
  const { data, local } = bruto as Record<string, unknown>
  if (typeof data !== 'string' || !diaValido(data)) return null
  return { data, local: limparLocal(local) }
}

/**
 * O que a pauta já sabe, para a tela vir preenchida: a pauta registrada como
 * Ação ou Evento (Registrar, ou um envio da equipe) guarda o dia e o local.
 * É só sugestão: nada entra na página sem alguém marcar.
 */
export function sugestaoDaPauta(pauta: { tags?: unknown; data_inicio?: unknown; due_date?: unknown; details?: unknown } | null | undefined): AcaoDoMestre | null {
  if (!pauta) return null
  const tags = Array.isArray(pauta.tags) ? pauta.tags.map(String) : []
  if (!tags.includes('Ação') && !tags.includes('Evento')) return null
  const data = [pauta.data_inicio, pauta.due_date].map((d) => String(d ?? '').slice(0, 10)).find(diaValido)
  if (!data) return null
  return { data, local: limparLocal((pauta.details as Record<string, unknown> | null | undefined)?.local) }
}

/** "12 de outubro de 2026" — o dia é do calendário, sem fuso para empurrar. */
export function dataDaAcaoLegivel(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${data}T12:00:00Z`))
}
