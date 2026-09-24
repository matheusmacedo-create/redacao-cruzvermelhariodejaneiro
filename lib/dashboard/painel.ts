/**
 * As regras do dashboard em três camadas: o meu dia, a semana da operação e
 * os indicadores. Puras — datas em "AAAA-MM-DD" no fuso de Brasília; o que
 * vem do banco como instante passa por `diaEmSaoPaulo` antes de comparar.
 */

import { COLUNAS } from '@/lib/pautas/quadro'
import { diasEntre, somarDias } from '@/lib/projetos/cronograma'

const DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const HORA_SP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })

export const diaEmSaoPaulo = (instante: string | Date) => DIA_SP.format(new Date(instante))
export const horaEmSaoPaulo = (instante: string | Date) => HORA_SP.format(new Date(instante))

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

/** A segunda-feira da semana de `dia` (semana de segunda a domingo). */
export function segundaDaSemana(dia: string): string {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay() // 0 = domingo
  return somarDias(dia, semana === 0 ? -6 : 1 - semana)
}

/** A semana pedida na URL, se for uma data válida; senão a de hoje. */
export function semanaPedida(param: string | undefined, hoje: string): string {
  if (param && DIA_RE.test(param) && !Number.isNaN(Date.parse(`${param}T12:00:00Z`))) return segundaDaSemana(param)
  return segundaDaSemana(hoje)
}

export const diasDaSemana = (segunda: string) => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i))

// ---------------------------------------------------------------------------
// Camada 1 — o meu dia
// ---------------------------------------------------------------------------

export type GrupoDePautas = 'atrasadas' | 'hoje' | 'semana' | 'depois' | 'sem_prazo'

export const ROTULO_DO_GRUPO: Record<GrupoDePautas, string> = {
  atrasadas: 'Atrasadas',
  hoje: 'Para hoje',
  semana: 'Próximos 7 dias',
  depois: 'Mais adiante',
  sem_prazo: 'Sem prazo',
}

export function grupoDaPauta(prazo: string | null, hoje: string): GrupoDePautas {
  if (!prazo) return 'sem_prazo'
  if (prazo < hoje) return 'atrasadas'
  if (prazo === hoje) return 'hoje'
  if (diasEntre(hoje, prazo) <= 7) return 'semana'
  return 'depois'
}

/**
 * As pautas agrupadas por urgência, na ordem em que a tela mostra. Dentro do
 * grupo, o prazo mais antigo primeiro; sem prazo, a mais nova primeiro.
 */
export function agruparPorUrgencia<T extends { prazo: string | null; criadaEm: string }>(pautas: T[], hoje: string) {
  const ordem: GrupoDePautas[] = ['atrasadas', 'hoje', 'semana', 'depois', 'sem_prazo']
  const grupos = new Map<GrupoDePautas, T[]>(ordem.map((g) => [g, []]))
  for (const p of pautas) grupos.get(grupoDaPauta(p.prazo, hoje))!.push(p)
  return ordem.map((grupo) => ({
    grupo,
    pautas: grupos.get(grupo)!.sort((a, b) =>
      grupo === 'sem_prazo' ? b.criadaEm.localeCompare(a.criadaEm) : (a.prazo as string).localeCompare(b.prazo as string)),
  })).filter((g) => g.pautas.length)
}

/**
 * Corta a lista para caber na tela sem esconder o que é urgente: atrasadas e
 * de hoje entram inteiras; o resto preenche até `teto`.
 */
export function cortarGrupos<T>(grupos: { grupo: GrupoDePautas; pautas: T[] }[], teto: number) {
  let restante = teto
  return grupos.map((g) => {
    const urgente = g.grupo === 'atrasadas' || g.grupo === 'hoje'
    const mostrar = urgente ? g.pautas : g.pautas.slice(0, Math.max(0, restante))
    restante -= mostrar.length
    return { ...g, mostrar, ocultas: g.pautas.length - mostrar.length }
  }).filter((g) => g.mostrar.length || g.ocultas)
}

export const ROTULO_DA_COLUNA: Record<string, string> = Object.fromEntries(COLUNAS.map((c) => [c.status, c.rotulo]))

export type LinhaDeAtividade = {
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown> | null
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * O que aconteceu, em uma frase curta sem o nome de quem fez (a tela põe o
 * nome antes). null = ação que não interessa ao feed da equipe — ajustes de
 * configuração, edições miúdas de cartão e afins.
 */
export function fraseDaAtividade(l: LinhaDeAtividade, tituloDaPauta: (id: string) => string | null): string | null {
  const m = l.metadata ?? {}
  const pauta = () => texto(m.title) ?? (l.entity_id ? tituloDaPauta(l.entity_id) : null)

  if (l.entity_type === 'pauta') {
    const t = pauta()
    if (!t) return null
    if (l.action === 'created') return `criou a pauta "${t}"`
    if (l.action === 'archived') return `arquivou "${t}"`
    if (l.action === 'message_sent') return `comentou em "${t}"`
    if (l.action === 'status_changed') {
      if (m.restaurada) return `restaurou "${t}"`
      const coluna = typeof m.status === 'string' ? ROTULO_DA_COLUNA[m.status] : undefined
      return coluna ? `moveu "${t}" para ${coluna}` : null
    }
    return null
  }
  if (l.entity_type === 'project') {
    const nome = texto(m.name)
    if (!nome) return null
    if (l.action === 'created') return `criou o projeto "${nome}"`
    if (l.action === 'deleted') return `excluiu o projeto "${nome}"`
    return null
  }
  if (l.action === 'campanha_enviada') {
    const assunto = texto(m.assunto)
    const enviados = numero(m.enviados)
    if (!assunto) return null
    return enviados !== null
      ? `enviou a campanha "${assunto}" para ${enviados} contato${enviados === 1 ? '' : 's'}`
      : `enviou a campanha "${assunto}"`
  }
  if (l.action === 'contatos_importados') {
    const n = (numero(m.inseridos) ?? 0) + (numero(m.atualizados) ?? 0)
    return n ? `importou ${n} contato${n === 1 ? '' : 's'} de imprensa` : null
  }
  if (l.action === 'site_published' || l.action === 'paginas_do_site_publicadas') return 'publicou no site'
  return null
}

// ---------------------------------------------------------------------------
// Camada 2 — a semana
// ---------------------------------------------------------------------------

export type EstadoDoItem = 'previsto' | 'publicado' | 'falhou'

export type ItemDaSemana = {
  id: string
  dia: string
  hora: string | null
  titulo: string
  canal: string | null
  tipo: string
  estado: EstadoDoItem
  href: string | null
}

export type EventoDoCalendario = {
  id: string
  title: string
  event_date: string
  event_time: string | null
  type: string | null
  channel: string | null
  pauta_id: string | null
  content_id: string | null
}

export type DestinoNaSemana = {
  id: string
  packageId: string
  canalNome: string
  estado: 'publicado' | 'falhou'
  /** Instante do fato: quando saiu ou quando a tentativa falhou. */
  quando: string
  /** Os nomes pelos quais o calendário pode ter chamado esta publicação. */
  titulos: string[]
}

const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * A publicação aconteceu perto do horário do evento: de meia hora antes a
 * seis horas depois (a confirmação da rede pode chegar com atraso). Evento
 * sem hora aceita qualquer horário do dia.
 */
export function horarioCombina(horaDoEvento: string | null, horaDoFato: string): boolean {
  if (!horaDoEvento) return true
  const d = minutos(horaDoFato) - minutos(horaDoEvento)
  return d >= -30 && d <= 360
}

/**
 * A semana num quadro só: o que está no calendário, marcado com o que já
 * saiu ou falhou. Publicação agendada vira evento no calendário na hora do
 * agendamento; quando ela sai, o destino dela se casa com esse evento (mesmo
 * dia e canal, e o título quando há mais de um candidato) em vez de aparecer
 * duas vezes. Publicação imediata não tem evento e entra como item próprio.
 */
export function montarSemana(dias: string[], eventos: EventoDoCalendario[], destinos: DestinoNaSemana[]): Map<string, ItemDaSemana[]> {
  const semana = new Map<string, ItemDaSemana[]>(dias.map((d) => [d, []]))
  for (const e of eventos) {
    semana.get(e.event_date)?.push({
      id: `e:${e.id}`,
      dia: e.event_date,
      hora: e.event_time ? e.event_time.slice(0, 5) : null,
      titulo: e.title,
      canal: e.channel,
      tipo: e.type || 'publicacao',
      estado: 'previsto',
      href: e.content_id ? `/conteudos/${e.content_id}` : e.pauta_id ? `/pautas/${e.pauta_id}` : null,
    })
  }

  // Falhas depois dos acertos: um evento casado com uma publicação que saiu
  // não pode ser tomado por uma falha anterior do mesmo canal.
  const ordenados = [...destinos].sort((a, b) => (a.estado === b.estado ? a.quando.localeCompare(b.quando) : a.estado === 'publicado' ? -1 : 1))
  for (const d of ordenados) {
    const dia = diaEmSaoPaulo(d.quando)
    const doDia = semana.get(dia)
    if (!doDia) continue
    const candidatos = doDia.filter((i) => i.estado === 'previsto' && i.id.startsWith('e:') && i.canal && normalizar(i.canal) === normalizar(d.canalNome))
    const nomes = new Set(d.titulos.filter(Boolean).map(normalizar))
    // Sem o título igual, só casa o único candidato cujo horário combina: um
    // post imediato das 9h não é o agendado das 15h do mesmo canal.
    const hora = horaEmSaoPaulo(d.quando)
    const compativeis = candidatos.filter((i) => horarioCombina(i.hora, hora))
    const casado = candidatos.find((i) => nomes.has(normalizar(i.titulo))) ?? (compativeis.length === 1 ? compativeis[0] : undefined)
    if (casado) {
      casado.estado = d.estado
      casado.href = `/redes/${d.packageId}`
      continue
    }
    doDia.push({
      id: `d:${d.id}`,
      dia,
      hora: horaEmSaoPaulo(d.quando),
      titulo: d.titulos.find(Boolean) || 'Publicação',
      canal: d.canalNome,
      tipo: 'publicacao',
      estado: d.estado,
      href: `/redes/${d.packageId}`,
    })
  }

  for (const itens of semana.values()) {
    // Sem hora primeiro (prazos e atividades do dia), depois pelo relógio.
    itens.sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  }
  return semana
}

export type SaudeDoCanal = 'ativo' | 'com_falha' | 'parado' | 'sem_registro'

export const DIAS_PARA_PARADO = 14

/** Falha mais nova que a última publicação pede atenção; 14 dias sem nada, parado. */
export function saudeDoCanal(ultimaPublicacao: string | null, ultimaFalha: string | null, hoje: string): SaudeDoCanal {
  if (ultimaFalha && (!ultimaPublicacao || ultimaFalha > ultimaPublicacao)) return 'com_falha'
  if (!ultimaPublicacao) return 'sem_registro'
  return diasEntre(diaEmSaoPaulo(ultimaPublicacao), hoje) > DIAS_PARA_PARADO ? 'parado' : 'ativo'
}

// ---------------------------------------------------------------------------
// Camada 3 — indicadores
// ---------------------------------------------------------------------------

export const PERIODO = 30
export const SEMANAS_NA_TENDENCIA = 8

export type Janela = { de: string; ate: string }

/** O período atual e o anterior, de mesmo tamanho, terminando hoje. */
export function periodos(hoje: string, dias = PERIODO): { atual: Janela; anterior: Janela } {
  const de = somarDias(hoje, -(dias - 1))
  return { atual: { de, ate: hoje }, anterior: { de: somarDias(de, -dias), ate: somarDias(de, -1) } }
}

/** Oito janelas de 7 dias corridos terminando hoje, da mais antiga para a mais nova. */
export function janelasSemanais(hoje: string, n = SEMANAS_NA_TENDENCIA): Janela[] {
  return Array.from({ length: n }, (_, i) => {
    const ate = somarDias(hoje, -7 * (n - 1 - i))
    return { de: somarDias(ate, -6), ate }
  })
}

export const dentro = (dia: string, j: Janela) => dia >= j.de && dia <= j.ate

export type Comparacao = { direcao: 'subiu' | 'caiu' | 'igual' | 'sem_base'; bom: boolean | null }

/** Subir é bom ou ruim conforme o indicador; sem período anterior, não há comparação. */
export function comparar(atual: number | null, anterior: number | null, melhor: 'maior' | 'menor'): Comparacao {
  if (atual === null || anterior === null) return { direcao: 'sem_base', bom: null }
  if (Math.abs(atual - anterior) < 1e-9) return { direcao: 'igual', bom: null }
  const subiu = atual > anterior
  return { direcao: subiu ? 'subiu' : 'caiu', bom: subiu === (melhor === 'maior') }
}

/** Taxa de abertura (%) de um conjunto de campanhas; null sem envios. */
export function taxaDeAbertura(campanhas: { enviados: number; aberturas: number }[]): number | null {
  const enviados = campanhas.reduce((s, c) => s + c.enviados, 0)
  if (!enviados) return null
  return (campanhas.reduce((s, c) => s + c.aberturas, 0) / enviados) * 100
}

/**
 * Pauta entregue = chegou a "Pronto". Uma pauta pode chegar lá mais de uma
 * vez (volta para ajuste e é aprovada de novo); conta a primeira chegada
 * dentro da janela de dados. Só entra quem tinha prazo.
 */
export function entregas(chegadas: { pautaId: string; quando: string }[], prazos: Map<string, string | null>): { dia: string; noPrazo: boolean }[] {
  const primeira = new Map<string, string>()
  for (const c of chegadas) {
    const atual = primeira.get(c.pautaId)
    if (!atual || c.quando < atual) primeira.set(c.pautaId, c.quando)
  }
  const out: { dia: string; noPrazo: boolean }[] = []
  for (const [id, quando] of primeira) {
    const prazo = prazos.get(id)
    if (!prazo) continue
    const dia = diaEmSaoPaulo(quando)
    out.push({ dia, noPrazo: dia <= prazo })
  }
  return out
}

export function pctNoPrazo(lista: { noPrazo: boolean }[]): number | null {
  return lista.length ? (lista.filter((e) => e.noPrazo).length / lista.length) * 100 : null
}

/** Média, em dias, entre o pedido de aprovação e a decisão. */
export function mediaEmDias(pares: { pedido: string; decidido: string }[]): number | null {
  const validos = pares.map((p) => Date.parse(p.decidido) - Date.parse(p.pedido)).filter((ms) => Number.isFinite(ms) && ms >= 0)
  return validos.length ? validos.reduce((s, ms) => s + ms, 0) / validos.length / 86_400_000 : null
}

/** "9 h" abaixo de um dia; "1,4 dia", "3 dias" acima. */
export function duracaoLegivel(dias: number): string {
  if (dias < 1) return `${Math.max(1, Math.round(dias * 24))} h`
  const v = Math.round(dias * 10) / 10
  return `${v.toLocaleString('pt-BR')} ${v < 2 ? 'dia' : 'dias'}`
}

export type PontoDaLinha = { x: number; y: number; valor: number; indice: number }

/**
 * Os pontos de uma sparkline numa caixa largura × altura. Valores null viram
 * lacunas (semana sem dado não é zero). A escala vai de 0 ao máximo quando
 * o indicador é uma contagem, e do mínimo ao máximo quando é taxa — assim uma
 * variação de 27% para 31% não some numa linha reta.
 */
export function pontosDaLinha(valores: (number | null)[], largura: number, altura: number, opcoes: { zeroNaBase?: boolean; margem?: number } = {}) {
  const margem = opcoes.margem ?? 5
  const presentes = valores.filter((v): v is number => v !== null)
  if (!presentes.length) return { pontos: [] as PontoDaLinha[], trechos: [] as PontoDaLinha[][] }
  const max = Math.max(...presentes)
  const min = opcoes.zeroNaBase ? 0 : Math.min(...presentes)
  const faixa = max - min
  const passo = valores.length > 1 ? (largura - 2 * margem) / (valores.length - 1) : 0
  const pontos: PontoDaLinha[] = []
  valores.forEach((v, i) => {
    if (v === null) return
    // Tudo igual: linha no meio, não colada no chão nem no teto.
    const t = faixa ? (v - min) / faixa : 0.5
    pontos.push({ x: margem + i * passo, y: altura - margem - t * (altura - 2 * margem), valor: v, indice: i })
  })
  const trechos: PontoDaLinha[][] = []
  for (const p of pontos) {
    const ultimo = trechos[trechos.length - 1]
    if (ultimo && ultimo[ultimo.length - 1].indice === p.indice - 1) ultimo.push(p)
    else trechos.push([p])
  }
  return { pontos, trechos }
}

/** "21 a 27 de set" ou "28 de set a 4 de out". */
export function rotuloDaSemana(segunda: string): string {
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const domingo = somarDias(segunda, 6)
  const [, m1, d1] = segunda.split('-').map(Number)
  const [, m2, d2] = domingo.split('-').map(Number)
  return m1 === m2 ? `${d1} a ${d2} de ${MESES[m2 - 1]}` : `${d1} de ${MESES[m1 - 1]} a ${d2} de ${MESES[m2 - 1]}`
}
