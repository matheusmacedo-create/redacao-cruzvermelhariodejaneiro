import { createHash } from 'node:crypto'
import { gerarSlug } from '@/lib/site/slug'
import type { LegendaDaMidia, PosicaoDaMidia } from '@/lib/publicacao/legendas'

/**
 * Importação de pacote por arquivo JSON: valida o arquivo ANTES de gravar.
 *
 * Módulo puro (sem banco, sem rede) para ser conferido por script. Não corta
 * texto em silêncio: o que passa do limite vira um problema com o campo, o
 * limite e o tamanho recebido, e nada é gravado até a lista ficar vazia.
 * Os limites são os da matéria do site (lib/publicacao/canais/site-web.ts) e
 * de lerLegendas (lib/publicacao/legendas.ts).
 */

export const VERSAO_DA_IMPORTACAO = 1

const LIMITES = {
  titulo: 120,
  subtitulo: 200,
  slug: 80,
  corpo: 20_000,
  legenda: 300,
  credito: 160,
  tituloInterno: 180,
  ref: 60,
  arquivo: 255,
} as const
const MAX_MIDIAS = 10
const POSICOES: PosicaoDaMidia[] = ['inicio', 'meio', 'fim']

export type Problema = { campo: string; mensagem: string }

export type MidiaImportada = {
  ref: string
  arquivo: string
  tipo: 'foto' | 'video'
  legenda: string
  credito: string
  posicao?: PosicaoDaMidia
}

export type PacoteImportado = {
  tituloInterno: string
  mestre: { titulo: string; subtitulo: string; slug: string; corpo: string; notas: string }
  midias: MidiaImportada[]
}

const eTexto = (v: unknown): v is string => typeof v === 'string'
const eObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function texto(
  bruto: Record<string, unknown>, chave: string, campo: string,
  opcoes: { max: number; obrigatorio?: boolean }, problemas: Problema[],
): string {
  const v = bruto[chave]
  if (v === undefined || v === null || v === '') {
    if (opcoes.obrigatorio) problemas.push({ campo, mensagem: 'campo obrigatório.' })
    return ''
  }
  if (!eTexto(v)) { problemas.push({ campo, mensagem: 'deve ser um texto.' }); return '' }
  const limpo = v.replace(/\r\n?/g, '\n').trim()
  if (opcoes.obrigatorio && !limpo) problemas.push({ campo, mensagem: 'campo obrigatório.' })
  if (limpo.length > opcoes.max) {
    problemas.push({ campo, mensagem: `passa do limite de ${opcoes.max} caracteres (recebi ${limpo.length}).` })
  }
  return limpo
}

/** Lê o texto do arquivo e devolve o pacote já limpo, ou a lista de problemas. */
export function validarImportacao(conteudo: string): { pacote?: PacoteImportado; problemas: Problema[] } {
  let bruto: unknown
  try { bruto = JSON.parse(conteudo) } catch {
    return { problemas: [{ campo: 'arquivo', mensagem: 'não é um JSON válido.' }] }
  }
  if (!eObjeto(bruto)) return { problemas: [{ campo: 'arquivo', mensagem: 'o JSON deve ser um objeto.' }] }

  const problemas: Problema[] = []

  if (bruto.versao !== VERSAO_DA_IMPORTACAO) {
    problemas.push({ campo: 'versao', mensagem: `deve ser ${VERSAO_DA_IMPORTACAO} (recebi ${JSON.stringify(bruto.versao) ?? 'nada'}).` })
  }
  // Por ora só o texto livre; origem de pauta ou matéria tem fluxo próprio.
  if (bruto.origem !== 'livre') problemas.push({ campo: 'origem', mensagem: 'por ora só "livre" é aceito.' })
  // Agendar é decisão de quem aprova, não de quem importa.
  if (bruto.agendarPara !== undefined && bruto.agendarPara !== null) {
    problemas.push({ campo: 'agendarPara', mensagem: 'por ora deve ser null: a importação não agenda.' })
  }
  const tituloInterno = texto(bruto, 'tituloInterno', 'tituloInterno', { max: LIMITES.tituloInterno }, problemas)

  const m = bruto.mestre
  let mestre: PacoteImportado['mestre'] = { titulo: '', subtitulo: '', slug: '', corpo: '', notas: '' }
  if (!eObjeto(m)) {
    problemas.push({ campo: 'mestre', mensagem: 'campo obrigatório (objeto com título e corpo).' })
  } else {
    const titulo = texto(m, 'titulo', 'mestre.titulo', { max: LIMITES.titulo, obrigatorio: true }, problemas)
    const slug = texto(m, 'slug', 'mestre.slug', { max: LIMITES.slug }, problemas)
    if (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      problemas.push({ campo: 'mestre.slug', mensagem: 'use só letras minúsculas sem acento, números e hífen.' })
    }
    mestre = {
      titulo,
      subtitulo: texto(m, 'subtitulo', 'mestre.subtitulo', { max: LIMITES.subtitulo }, problemas),
      // Vazio nasce do título, como na tela.
      slug: slug || (titulo ? gerarSlug(titulo) : ''),
      corpo: texto(m, 'corpo', 'mestre.corpo', { max: LIMITES.corpo, obrigatorio: true }, problemas),
      notas: texto(m, 'notas', 'mestre.notas', { max: 5_000 }, problemas),
    }
  }

  const midias: MidiaImportada[] = []
  const listaBruta = bruto.midias ?? []
  if (!Array.isArray(listaBruta)) {
    problemas.push({ campo: 'midias', mensagem: 'deve ser uma lista.' })
  } else {
    if (listaBruta.length > MAX_MIDIAS) {
      problemas.push({ campo: 'midias', mensagem: `a matéria aceita até ${MAX_MIDIAS} mídias (recebi ${listaBruta.length}).` })
    }
    const refs = new Set<string>()
    listaBruta.forEach((item, i) => {
      const c = `midias[${i}]`
      if (!eObjeto(item)) { problemas.push({ campo: c, mensagem: 'deve ser um objeto.' }); return }
      const ref = texto(item, 'ref', `${c}.ref`, { max: LIMITES.ref, obrigatorio: true }, problemas)
      if (ref && refs.has(ref)) problemas.push({ campo: `${c}.ref`, mensagem: `"${ref}" repetido.` })
      refs.add(ref)
      const arquivo = texto(item, 'arquivo', `${c}.arquivo`, { max: LIMITES.arquivo, obrigatorio: true }, problemas)
      if (arquivo && /[\\/]/.test(arquivo)) {
        problemas.push({ campo: `${c}.arquivo`, mensagem: 'use só o nome do arquivo, sem pasta.' })
      }
      if (item.tipo !== 'foto' && item.tipo !== 'video') {
        problemas.push({ campo: `${c}.tipo`, mensagem: 'deve ser "foto" ou "video".' })
      }
      let posicao: PosicaoDaMidia | undefined
      if (item.posicao !== undefined && item.posicao !== null && item.posicao !== '') {
        if (POSICOES.includes(item.posicao as PosicaoDaMidia)) posicao = item.posicao as PosicaoDaMidia
        else problemas.push({ campo: `${c}.posicao`, mensagem: 'deve ser "inicio", "meio" ou "fim".' })
      }
      midias.push({
        ref,
        arquivo,
        tipo: item.tipo === 'video' ? 'video' : 'foto',
        legenda: texto(item, 'legenda', `${c}.legenda`, { max: LIMITES.legenda }, problemas),
        credito: texto(item, 'credito', `${c}.credito`, { max: LIMITES.credito }, problemas),
        ...(posicao ? { posicao } : {}),
      })
    })
  }

  if (problemas.length) return { problemas }
  return { problemas, pacote: { tituloInterno: tituloInterno || mestre.titulo.slice(0, LIMITES.tituloInterno), mestre, midias } }
}

/** Impressão digital do arquivo: o mesmo conteúdo, importado duas vezes, tem a mesma chave. */
export function chaveDaImportacao(conteudo: string): string {
  return createHash('sha256').update(conteudo.replace(/\r\n?/g, '\n').trim()).digest('hex').slice(0, 24)
}

/** O mapa de legendas do mestre, na ordem das mídias e chaveado pelo id do arquivo na Biblioteca. */
export function legendasDaImportacao(
  midias: MidiaImportada[],
  idsPorRef: Record<string, string>,
): Record<string, LegendaDaMidia> {
  const saida: Record<string, LegendaDaMidia> = {}
  for (const m of midias) {
    const id = idsPorRef[m.ref]
    if (!id) continue
    if (!m.legenda && !m.credito && !m.posicao) continue
    saida[id] = { legenda: m.legenda, credito: m.credito, ...(m.posicao ? { posicao: m.posicao } : {}) }
  }
  return saida
}
