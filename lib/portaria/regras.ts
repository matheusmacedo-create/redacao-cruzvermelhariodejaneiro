/**
 * Portaria virtual — o livro de visitantes da filial (migração 20260929060000).
 *
 * A portaria registra quem chegou; o visitante também pode se cadastrar pelo
 * QR da entrada (`/visitante?t=<segredo>`), e esse cadastro fica "aguardando"
 * até a portaria confirmar. Sem documento: nome, telefone, de onde vem, quem
 * visita e o motivo. Foto na entrada e crachá de visitante, com a devolução
 * conferida na saída. Quem é visitado recebe aviso.
 *
 * Módulo puro (sem banco, sem `server-only`): conferido por
 * scripts/conferir-portaria.ts.
 */

export type Visita = {
  id: string
  nome: string
  telefone: string | null
  empresa: string | null
  motivo: string | null
  visitado_id: string | null
  visitado_texto: string | null
  cracha_numero: string | null
  cracha_devolvido_em: string | null
  foto_path: string | null
  origem: 'portaria' | 'autocadastro'
  entrada_em: string | null
  saida_em: string | null
  descartada_em: string | null
  created_at: string
}

/** A lista é explícita: `ip_hash` não é liberado para a API (select('*') falharia). */
export const COLUNAS_DA_VISITA = 'id,nome,telefone,empresa,motivo,visitado_id,visitado_texto,cracha_numero,cracha_devolvido_em,foto_path,origem,entrada_em,saida_em,descartada_em,created_at'

export type Situacao = 'aguardando' | 'dentro' | 'saiu' | 'descartada'

export function situacaoDaVisita(v: Pick<Visita, 'entrada_em' | 'saida_em' | 'descartada_em'>): Situacao {
  if (v.descartada_em) return 'descartada'
  if (!v.entrada_em) return 'aguardando'
  return v.saida_em ? 'saiu' : 'dentro'
}

/** Saiu (ou nunca voltou) sem devolver o crachá de visitante. */
export const crachaPendente = (v: Pick<Visita, 'cracha_numero' | 'cracha_devolvido_em' | 'saida_em'>) =>
  Boolean(v.cracha_numero && !v.cracha_devolvido_em && v.saida_em)

const FUSO = 'America/Sao_Paulo'
/** "2026-09-27" no horário de Brasília. */
export const diaEmSaoPaulo = (iso: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso))
/** "14:05". */
export const hora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
/** "27/09 14:05". */
export const diaEHora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Ainda "dentro", mas entrou num dia anterior: provavelmente esqueceram de registrar a saída. */
export const entrouEmOutroDia = (v: Pick<Visita, 'entrada_em' | 'saida_em'>, hoje: string) =>
  Boolean(v.entrada_em && !v.saida_em && diaEmSaoPaulo(v.entrada_em) < hoje)

/** "há 5 min", "há 2 h 10 min", "há 3 dias". */
export function haQuanto(iso: string, agora: Date = new Date()): string {
  const min = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Quem é visitado, como sai na tela: a pessoa do Palácio e/ou o texto livre. */
export function quemVisita(v: Pick<Visita, 'visitado_texto'>, nomeDaPessoa: string | null | undefined): string {
  const partes = [nomeDaPessoa?.trim(), v.visitado_texto?.trim()].filter(Boolean) as string[]
  if (partes.length === 2 && partes[0].toLowerCase() === partes[1].toLowerCase()) return partes[0]
  return partes.join(' · ')
}

// ---------------------------------------------------------------- o formulário

export type DadosDoVisitante = {
  nome: string; telefone: string; empresa: string; motivo: string; visitado_texto: string
  /** Só a portaria escolhe a pessoa do Palácio (avisada); o autocadastro escreve texto livre. */
  visitado_id?: string; cracha_numero?: string
}

const LIMITES = { nome: 120, telefone: 30, empresa: 120, motivo: 300, visitado_texto: 120, cracha_numero: 20 } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const limpar = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Lê e confere o formulário (o banco confere de novo). `publico`: o
 * autocadastro não escolhe pessoa nem crachá — isso é da portaria.
 */
export function lerVisitante(f: { get(nome: string): unknown }, publico = false): { dados: DadosDoVisitante; erros: string[] } {
  const dados: DadosDoVisitante = {
    nome: limpar(f.get('nome'), LIMITES.nome),
    telefone: limpar(f.get('telefone'), LIMITES.telefone),
    empresa: limpar(f.get('empresa'), LIMITES.empresa),
    motivo: limpar(f.get('motivo'), LIMITES.motivo),
    visitado_texto: limpar(f.get('visitado_texto'), LIMITES.visitado_texto),
  }
  const erros: string[] = []
  if (dados.nome.length < 2) erros.push(publico ? 'Escreva o seu nome.' : 'Escreva o nome do visitante.')
  if (dados.telefone && !/^[\d\s()+.-]{8,30}$/.test(dados.telefone)) erros.push('Telefone inválido: use só números, com DDD.')
  if (!publico) {
    const visitado = limpar(f.get('visitado_id'), 36)
    if (visitado && !UUID.test(visitado)) erros.push('Pessoa visitada inválida.')
    if (visitado) dados.visitado_id = visitado
    const cracha = limpar(f.get('cracha_numero'), LIMITES.cracha_numero)
    if (cracha) dados.cracha_numero = cracha
  }
  if (publico && !dados.visitado_texto && !dados.motivo) erros.push('Diga quem você vai visitar ou o motivo da visita.')
  return { dados, erros }
}

// ---------------------------------------------------------------- foto e QR

const CAMINHO = /^portaria\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.jpg$/

/** Onde a foto do visitante mora no Blob privado. O banco confere o mesmo formato (portaria_definir_foto). */
export const caminhoDaFotoDoVisitante = (workspaceId: string, visitaId: string, id: string) => `portaria/${workspaceId}/${visitaId}/${id}.jpg`

export function fotoDaVisita(caminho: string | null | undefined, workspaceId: string, visitaId: string): boolean {
  const m = caminho ? CAMINHO.exec(caminho) : null
  return Boolean(m && m[1] === workspaceId && m[2] === visitaId)
}

/** O endereço da foto na tela da portaria; o `?v=` muda a cada troca. */
export const urlDaFotoDoVisitante = (visitaId: string, caminho: string | null | undefined) =>
  (caminho ? `/api/portaria/${visitaId}/foto?v=${CAMINHO.exec(caminho)?.[3] ?? '0'}` : null)

export const ehTokenDaEntrada = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(t)
export const linkDaEntrada = (base: string, token: string) => `${base.replace(/\/$/, '')}/visitante?t=${token}`

// ---------------------------------------------------------------- crachás de visitante para imprimir

export const CRACHAS_POR_FOLHA = 9
export const MAXIMO_DE_CRACHAS = 99

/** O prefixo impresso ("V", "VIS", "PRES"): 1 a 5 letras ou números, maiúsculo. Inválido → "V". */
export function prefixoDoCracha(bruto: unknown): string {
  const p = String(bruto ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return /^[A-Z0-9]{1,5}$/.test(p) ? p : 'V'
}

/**
 * Os números da folha: de `de` até `ate` (no máximo 99 crachás), com zero à
 * esquerda na mesma largura ("V-01" … "V-18"). Fora do intervalo, corrige.
 */
export function numerosDeCracha(prefixo: unknown, de: unknown, ate: unknown): string[] {
  const p = prefixoDoCracha(prefixo)
  const lerInteiro = (v: unknown, padrao: number) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? n : padrao }
  const inicio = Math.min(Math.max(lerInteiro(de, 1), 1), 999)
  const fim = Math.min(Math.max(lerInteiro(ate, inicio + CRACHAS_POR_FOLHA - 1), inicio), inicio + MAXIMO_DE_CRACHAS - 1, 999)
  const largura = Math.max(2, String(fim).length)
  return Array.from({ length: fim - inicio + 1 }, (_, i) => `${p}-${String(inicio + i).padStart(largura, '0')}`)
}

/** Em folhas de 9. No verso, cada linha sai espelhada: impresso frente e verso (virando pela borda longa), cada verso cai atrás da sua frente. */
export function folhasDeCrachas<T>(itens: T[]): { frente: (T | null)[]; verso: (T | null)[] }[] {
  const folhas: { frente: (T | null)[]; verso: (T | null)[] }[] = []
  for (let i = 0; i < itens.length; i += CRACHAS_POR_FOLHA) {
    const frente: (T | null)[] = [...itens.slice(i, i + CRACHAS_POR_FOLHA)]
    while (frente.length < CRACHAS_POR_FOLHA) frente.push(null)
    const verso = [0, 1, 2].flatMap((linha) => frente.slice(linha * 3, linha * 3 + 3).reverse())
    folhas.push({ frente, verso })
  }
  return folhas
}
