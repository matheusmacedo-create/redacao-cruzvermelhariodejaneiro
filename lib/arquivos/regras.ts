/**
 * As regras dos Arquivos do setor, sem banco e sem rede: dá para conferir
 * com um script (scripts/conferir-arquivos.ts).
 *
 * O Drive guarda; o Palácio decide quem vê. Toda ação recebe o setor e o id
 * do item, e o servidor confere que o item mora DENTRO da pasta do setor
 * (caminhoAte) antes de fazer qualquer coisa: um id copiado da pasta de
 * outro setor não abre nada.
 */

/** A pasta, no Drive. */
export const PASTA = 'application/vnd.google-apps.folder'

/** Os escopos da conexão: o Drive inteiro (para ver também o que a equipe põe pelo próprio Google) e quem conectou. */
export const ESCOPOS_DO_DRIVE = ['openid', 'email', 'https://www.googleapis.com/auth/drive'] as const

/** Limite por arquivo enviado pelo Palácio. O Drive aceita mais; acima disso, melhor pelo próprio Google. */
export const TAMANHO_MAXIMO = 5 * 1024 ** 3
/** Arquivos por envio. */
export const MAXIMO_POR_ENVIO = 50
/** Até onde se sobe procurando a pasta do setor: pasta mais funda que isso não é aceita. */
export const PROFUNDIDADE_MAXIMA = 30

const ID = /^[A-Za-z0-9_-]{10,100}$/
export const ehIdDoDrive = (valor: unknown): valor is string => typeof valor === 'string' && ID.test(valor)

/**
 * O id da pasta a partir do que a pessoa colou: o link do navegador
 * (…/drive/folders/<id>, …/drive/u/0/folders/<id>?usp=sharing, …?id=<id>)
 * ou o id puro. Devolve null quando não acha um id.
 */
export function idDaPastaNoLink(texto: string): string | null {
  const t = texto.trim()
  if (ehIdDoDrive(t)) return t
  let url: URL
  try { url = new URL(t) } catch { return null }
  if (!/(^|\.)google\.com$/i.test(url.hostname)) return null
  const pasta = /\/folders\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1]
  if (pasta && ehIdDoDrive(pasta)) return pasta
  const id = url.searchParams.get('id')
  return id && ehIdDoDrive(id) ? id : null
}

/** Nome de pasta ou arquivo: sem espaço nas pontas, sem caractere de controle, 1 a 200 letras. Devolve o erro, ou null. */
export function problemaDoNome(nome: string): string | null {
  const n = nome.trim()
  if (!n) return 'Dê um nome.'
  if (n.length > 200) return 'O nome pode ter até 200 letras.'
  if (/[\u0000-\u001f\u007f]/.test(n)) return 'O nome tem um caractere que não pode ser usado.'
  if (n === '.' || n === '..') return 'Escolha outro nome.'
  return null
}

/** Texto dentro de aspas simples numa consulta do Drive (q=…): barra e aspa escapadas. */
export const naConsulta = (texto: string) => texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export type TipoDoItem = 'pasta' | 'documento' | 'planilha' | 'apresentacao' | 'formulario' | 'desenho' | 'atalho' | 'pdf' | 'imagem' | 'video' | 'audio' | 'texto' | 'compactado' | 'outro'

const DO_GOOGLE: Record<string, TipoDoItem> = {
  [PASTA]: 'pasta',
  'application/vnd.google-apps.document': 'documento',
  'application/vnd.google-apps.spreadsheet': 'planilha',
  'application/vnd.google-apps.presentation': 'apresentacao',
  'application/vnd.google-apps.form': 'formulario',
  'application/vnd.google-apps.drawing': 'desenho',
  'application/vnd.google-apps.shortcut': 'atalho',
}

export function tipoDoItem(mime: string): TipoDoItem {
  const m = mime.toLowerCase()
  if (DO_GOOGLE[m]) return DO_GOOGLE[m]
  if (m === 'application/pdf') return 'pdf'
  if (m.startsWith('image/')) return 'imagem'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (/wordprocessingml|msword|opendocument\.text|rtf/.test(m)) return 'documento'
  if (/spreadsheetml|ms-excel|opendocument\.spreadsheet|text\/csv/.test(m)) return 'planilha'
  if (/presentationml|ms-powerpoint|opendocument\.presentation/.test(m)) return 'apresentacao'
  if (m.startsWith('text/')) return 'texto'
  if (/zip|rar|7z|tar|gzip/.test(m)) return 'compactado'
  return 'outro'
}

export const ROTULO_DO_TIPO: Record<TipoDoItem, string> = {
  pasta: 'Pasta', documento: 'Documento', planilha: 'Planilha', apresentacao: 'Apresentação', formulario: 'Formulário',
  desenho: 'Desenho', atalho: 'Atalho', pdf: 'PDF', imagem: 'Imagem', video: 'Vídeo', audio: 'Áudio', texto: 'Texto',
  compactado: 'Compactado', outro: 'Arquivo',
}

/** Documento nativo do Google (não tem arquivo para baixar: é exportado). */
export const ehDoGoogle = (mime: string) => mime.startsWith('application/vnd.google-apps.')

/**
 * Para que formato o documento do Google vira ao baixar ("baixar") e ao ver
 * no Palácio ("ver", sempre PDF). Formulário, atalho e pasta não exportam.
 */
const EXPORTACOES: Record<string, { baixar: { mime: string; extensao: string }; ver: boolean }> = {
  'application/vnd.google-apps.document': { baixar: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensao: 'docx' }, ver: true },
  'application/vnd.google-apps.spreadsheet': { baixar: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensao: 'xlsx' }, ver: true },
  'application/vnd.google-apps.presentation': { baixar: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensao: 'pptx' }, ver: true },
  'application/vnd.google-apps.drawing': { baixar: { mime: 'image/png', extensao: 'png' }, ver: true },
}

export type Saida = { tipo: 'arquivo' } | { tipo: 'exportar'; mime: string; extensao: string } | { tipo: 'nenhuma' }

export function saidaPara(mime: string, modo: 'ver' | 'baixar'): Saida {
  if (!ehDoGoogle(mime)) return { tipo: 'arquivo' }
  const e = EXPORTACOES[mime]
  if (!e) return { tipo: 'nenhuma' }
  if (modo === 'ver') return e.ver ? { tipo: 'exportar', mime: 'application/pdf', extensao: 'pdf' } : { tipo: 'nenhuma' }
  return { tipo: 'exportar', ...e.baixar }
}

/** O que o navegador mostra numa aba (o resto é baixado). */
export const mostravelNoNavegador = (mime: string) =>
  /^(image\/(jpeg|png|webp|gif|avif|svg\+xml)|application\/pdf|text\/plain|video\/(mp4|webm)|audio\/(mpeg|mp4|ogg|wav|webm))$/i.test(mime)

/** O nome do arquivo baixado: o do Drive, com a extensão da exportação quando falta. */
export function nomeParaBaixar(nome: string, extensao?: string): string {
  const limpo = nome.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'arquivo'
  if (!extensao) return limpo
  return limpo.toLowerCase().endsWith(`.${extensao}`) ? limpo : `${limpo}.${extensao}`
}

/** O Content-Disposition com o nome em UTF-8 (RFC 6266) e uma reserva ASCII. */
export function disposicao(modo: 'inline' | 'attachment', nome: string): string {
  const ascii = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return `${modo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

export type ItemDoDrive = {
  id: string
  nome: string
  mime: string
  pais: string[]
  tamanho: number | null
  modificadoEm: string | null
  linkNoGoogle: string | null
  podeEditar: boolean
}

/** Pastas primeiro, depois por nome, como o Drive mostra (números em ordem natural: "Foto 2" antes de "Foto 10"). */
export function ordenarItens<T extends Pick<ItemDoDrive, 'nome' | 'mime'>>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    const pa = a.mime === PASTA ? 0 : 1
    const pb = b.mime === PASTA ? 0 : 1
    return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' })
  })
}

export type Degrau = { id: string; nome: string }

/**
 * O caminho da pasta do setor até o item, subindo pelos pais no Drive.
 * Devolve [setor, …, item] quando o item mora dentro da pasta do setor (ou é
 * ela), e null quando não mora: o item é de outro lugar, foi para a lixeira
 * ou a pasta é funda demais. Item com mais de um pai (só existe em Drive
 * antigo) vale se QUALQUER caminho chega ao setor.
 */
export async function caminhoAte(
  itemId: string,
  pastaDoSetor: string,
  obter: (id: string) => Promise<{ id: string; nome: string; pais: string[]; naLixeira?: boolean } | null>,
  limite = PROFUNDIDADE_MAXIMA,
): Promise<Degrau[] | null> {
  const vistos = new Set<string>()
  async function subir(id: string, restante: number): Promise<Degrau[] | null> {
    if (vistos.has(id) || restante < 0) return null
    vistos.add(id)
    const item = await obter(id)
    if (!item || item.naLixeira) return null
    const degrau = { id: item.id, nome: item.nome }
    if (item.id === pastaDoSetor) return [degrau]
    for (const pai of item.pais) {
      const acima = await subir(pai, restante - 1)
      if (acima) return [...acima, degrau]
    }
    return null
  }
  return subir(itemId, limite)
}

/** Tamanho legível em português ("1,4 MB"). */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const unidades = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let u = 0
  while (v >= 1024 && u < unidades.length - 1) { v /= 1024; u += 1 }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unidades[u]}`
}
