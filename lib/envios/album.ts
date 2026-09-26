/**
 * As regras do Álbum do evento (docs/envio-de-acoes.md §9): a ficha do
 * evento, a chave da miniatura no R2, os nomes dentro do .zip e o resumo do
 * álbum. Módulo puro — conferido por scripts/conferir-album.ts.
 */

/** Lado maior da miniatura que o celular gera antes de mandar. */
export const LADO_DA_MINIATURA = 640
/** Miniatura maior que isto não é miniatura: é descartada. */
export const TAMANHO_MAXIMO_DA_MINIATURA = 1024 * 1024
/** O .zip do álbum sai em fluxo; acima disto, a tela sugere baixar só as fotos. */
export const LIMITE_DO_ZIP = 4 * 1024 ** 3
/** Arquivos por .zip (cada um é uma leitura no R2). */
export const ARQUIVOS_NO_ZIP = 800

/** entrada/envios/AAAA-MM/<envio>/<sufixo>-<nome> → entrada/envios/AAAA-MM/<envio>/mini/<sufixo>.jpg */
export function miniaturaDaChave(chave: string): string | null {
  const m = /^(entrada\/envios\/\d{4}-\d{2}\/[0-9a-f-]{36})\/([0-9a-f]{8})-[^/]+$/.exec(chave)
  return m ? `${m[1]}/mini/${m[2]}.jpg` : null
}

export const ehMiniaturaDoEnvio = (chave: string, envioId: string) =>
  new RegExp(`^entrada/envios/\\d{4}-\\d{2}/${envioId}/mini/[0-9a-f]{8}\\.jpg$`).test(chave)

export type DadosDoEvento = { nome: string; data_do_evento: string | null; local: string | null }

/** Lê a ficha do evento. `hoje` não limita: evento é criado antes de acontecer. */
export function lerEvento(bruto: { nome?: unknown; data?: unknown; local?: unknown }): { dados?: DadosDoEvento; erro?: string } {
  const nome = typeof bruto.nome === 'string' ? bruto.nome.trim().replace(/\s+/g, ' ') : ''
  if (nome.length < 3 || nome.length > 140) return { erro: 'Dê um nome de 3 a 140 caracteres (ex.: "Ação de prevenção na Central do Brasil").' }
  const data = typeof bruto.data === 'string' && bruto.data.trim() ? bruto.data.trim() : null
  if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < '2000-01-01')) return { erro: 'Data inválida.' }
  const local = typeof bruto.local === 'string' && bruto.local.trim() ? bruto.local.trim().slice(0, 300) : null
  return { dados: { nome, data_do_evento: data, local } }
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || 'Equipe'

/** O que dá para mostrar no álbum: foto e vídeo que chegaram e não foram escondidos. */
export type ArquivoDoAlbum = { id: string; nome: string; categoria: string; tamanho: number; autor: string; oculto?: boolean; estado?: string }
export const entraNoAlbum = (a: ArquivoDoAlbum) => (a.categoria === 'foto' || a.categoria === 'video') && !a.oculto && (a.estado ?? 'recebido') === 'recebido'

/**
 * Os nomes dentro do .zip: o nome canônico de cada arquivo (data, assunto,
 * autor e número), numa pasta só — já saem em ordem e com o crédito no nome.
 * Arquivo antigo, com o nome do celular, ganha o autor na frente; nome
 * repetido ganha "(2)".
 */
export function nomesNoZip(arquivos: { id: string; nome: string; autor: string }[]): Map<string, string> {
  const usados = new Set<string>()
  const saida = new Map<string, string>()
  const limpo = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 140) || 'arquivo'
  for (const a of arquivos) {
    const canonico = /^\d{4}-\d{2}-\d{2}-/.test(a.nome)
    const m = /^(.*?)(\.[a-z0-9]{1,5})?$/i.exec(limpo(canonico ? a.nome : `${primeiroNome(a.autor)} - ${a.nome}`))!
    let caminho = `${m[1]}${m[2] ?? ''}`
    for (let n = 2; usados.has(caminho.toLowerCase()); n++) caminho = `${m[1]} (${n})${m[2] ?? ''}`
    usados.add(caminho.toLowerCase())
    saida.set(a.id, caminho)
  }
  return saida
}

/** "48 fotos e 3 vídeos de 7 pessoas". */
export function resumoDoAlbum(arquivos: { categoria: string; autor: string }[]): string {
  const fotos = arquivos.filter((a) => a.categoria === 'foto').length
  const videos = arquivos.filter((a) => a.categoria === 'video').length
  const pessoas = new Set(arquivos.map((a) => a.autor.trim().toLowerCase())).size
  const partes = [fotos ? `${fotos} ${fotos === 1 ? 'foto' : 'fotos'}` : '', videos ? `${videos} ${videos === 1 ? 'vídeo' : 'vídeos'}` : ''].filter(Boolean)
  if (!partes.length) return 'Nenhuma foto ainda'
  return `${partes.join(' e ')} de ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}`
}

/** "acao-de-prevencao-na-central.zip" */
export function nomeDoZip(nome: string, soFotos = false): string {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'album'
  return `${base}${soFotos ? '-fotos' : ''}.zip`
}
