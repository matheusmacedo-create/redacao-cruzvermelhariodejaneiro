/**
 * O ofício como documento. Depois de emitido, a tela desenha o texto a partir
 * do conteúdo canônico — o JSON exato cujo SHA-256 foi assinado — e não das
 * colunas soltas: o que se vê é, por construção, o que se assinou.
 */

export const ESTADOS = {
  rascunho: { rotulo: 'Rascunho' },
  em_assinatura: { rotulo: 'Em assinatura' },
  assinado: { rotulo: 'Assinado' },
  cancelado: { rotulo: 'Cancelado' },
} as const

export type EstadoDoOficio = keyof typeof ESTADOS
export const ehEstado = (s: string): s is EstadoDoOficio => Object.prototype.hasOwnProperty.call(ESTADOS, s)

export type Documento = {
  emitente: string
  numero: string | null
  data: string | null
  local: string
  setor: string | null
  destinatario: { nome: string | null; cargo: string | null; orgao: string | null; endereco: string | null }
  vocativo: string | null
  assunto: string
  corpo: string
  fecho: string
  assinantes: { ordem: number; nome: string; cargo: string | null }[]
}

const txt = (v: unknown) => (typeof v === 'string' ? v : null)

/** Lê o conteúdo canônico; null se não for um ofício no formato conhecido. */
export function lerCanonico(canonico: string | null): Documento | null {
  if (!canonico) return null
  let j: Record<string, unknown>
  try { j = JSON.parse(canonico) } catch { return null }
  if (!j || j.formato !== 'oficio/1') return null
  const d = (j.destinatario ?? {}) as Record<string, unknown>
  return {
    emitente: txt(j.emitente) ?? '',
    numero: txt(j.numero),
    data: txt(j.data),
    local: txt(j.local) ?? '',
    setor: txt(j.setor),
    destinatario: { nome: txt(d.nome), cargo: txt(d.cargo), orgao: txt(d.orgao), endereco: txt(d.endereco) },
    vocativo: txt(j.vocativo),
    assunto: txt(j.assunto) ?? '',
    corpo: txt(j.corpo) ?? '',
    fecho: txt(j.fecho) ?? '',
    assinantes: Array.isArray(j.assinantes)
      ? (j.assinantes as Record<string, unknown>[]).map((a) => ({ ordem: Number(a.ordem) || 0, nome: txt(a.nome) ?? '', cargo: txt(a.cargo) })).sort((a, b) => a.ordem - b.ordem)
      : [],
  }
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "Rio de Janeiro, 24 de setembro de 2026." */
export function localEData(local: string, data: string | null): string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return local ? `${local}, (data da emissão).` : ''
  const [a, m, d] = data.split('-').map(Number)
  const dia = d === 1 ? '1º' : String(d)
  return `${local ? `${local}, ` : ''}${dia} de ${MESES[m - 1]} de ${a}.`
}

/** Parágrafos do corpo: linha em branco separa; quebra simples vira espaço. */
export function paragrafos(corpo: string): string[] {
  return corpo.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
}

export type Bloco =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'lista'; itens: { marcador: string | null; texto: string }[] }

const MARCADOR = /^\s*(?:[-•*·▪–]|(\d{1,2}|[a-z])[).])\s+(.+)$/
const TITULO = /^(?:\d{1,2}(?:\.\d{1,2})*[.)]?|[IVX]{1,5}\s*[.)–-])\s+\S/

/**
 * O corpo com a estrutura que quem escreve já usa: linha em branco separa
 * parágrafos; linha que começa com "-", "•" ou "a)" / "1)" é item de lista
 * (as seguintes sem marcador continuam o item); um parágrafo curto de uma
 * linha que começa com "1." / "2.1" / "II -", ou todo em maiúsculas, é título
 * de seção. Só muda o desenho: o texto assinado (e o hash) é o mesmo.
 */
export function blocosDoCorpo(corpo: string): Bloco[] {
  const saida: Bloco[] = []
  for (const grupo of corpo.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const linhas = grupo.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
    if (!linhas.length) continue
    const unica = linhas.length === 1 ? linhas[0].trim() : null
    if (unica && unica.length <= 110 && !/[.:;]$/.test(unica)
      && (TITULO.test(unica) || (/[A-ZÀ-Ý]/.test(unica) && unica === unica.toUpperCase() && unica.length <= 80))) {
      saida.push({ tipo: 'titulo', texto: unica }); continue
    }
    let texto: string[] = []
    let lista: { marcador: string | null; texto: string }[] | null = null
    const fecharTexto = () => { if (texto.length) saida.push({ tipo: 'paragrafo', texto: texto.join(' ') }); texto = [] }
    const fecharLista = () => { if (lista?.length) saida.push({ tipo: 'lista', itens: lista }); lista = null }
    for (const l of linhas) {
      const m = MARCADOR.exec(l)
      if (m) {
        fecharTexto()
        lista ??= []
        lista.push({ marcador: m[1] ? `${m[1]})` : null, texto: m[2].trim() })
      } else if (lista && (/^\s/.test(l) || !/[.:!?]$/.test(lista[lista.length - 1].texto))) {
        lista[lista.length - 1].texto += ` ${l.trim()}`
      } else {
        fecharLista()
        texto.push(l.trim())
      }
    }
    fecharTexto(); fecharLista()
  }
  return saida
}

export const tituloDoOficio = (numero: string | null, setor: string | null) =>
  numero ? `Ofício nº ${numero}${setor ? ` – ${setor}` : ''}` : `Ofício (sem número)${setor ? ` – ${setor}` : ''}`

/** O hash em blocos de 8, para ler e comparar em voz alta. */
export const hashLegivel = (hash: string) => hash.match(/.{1,8}/g)?.join(' ') ?? hash

export const nomeDoArquivo = (numero: string | null, sufixo: string) =>
  `oficio-${(numero ?? 'sem-numero').replace('/', '-')}${sufixo}`

/** "Assinado em 24/09/2026 às 15:42 (horário de Brasília)". */
export function momento(iso: string): string {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const partes = Object.fromEntries(f.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${partes.day}/${partes.month}/${partes.year} às ${partes.hour}:${partes.minute}`
}

/** Um rascunho com o mesmo formato do canônico, para a pré-visualização. */
export function documentoDoRascunho(o: {
  emitente: string
  setor: string | null
  local: string
  destinatario_nome: string | null
  destinatario_cargo: string | null
  destinatario_orgao: string | null
  destinatario_endereco: string | null
  vocativo: string | null
  assunto: string
  corpo: string
  fecho: string
}, assinantes: { nome: string; cargo: string | null }[] = []): Documento {
  return {
    emitente: o.emitente,
    numero: null,
    data: null,
    local: o.local,
    setor: o.setor,
    destinatario: { nome: o.destinatario_nome, cargo: o.destinatario_cargo, orgao: o.destinatario_orgao, endereco: o.destinatario_endereco },
    vocativo: o.vocativo,
    assunto: o.assunto,
    corpo: o.corpo,
    fecho: o.fecho,
    assinantes: assinantes.map((a, i) => ({ ordem: i + 1, ...a })),
  }
}
