/**
 * As opções do cartaz do /enviar (página /envios/cartaz e a imagem em
 * /api/envios/cartaz). Puro: a página, a rota da imagem e a conferência
 * (`npx tsx scripts/conferir-cartaz.ts`) usam as mesmas regras.
 *
 * Identidade (docs/IDENTIDADE.md): o vermelho do manual, Franklin Gothic
 * (Libre Franklin no texto, Barlow Condensed nos títulos) e o nome completo
 * da filial em toda peça. Sobre o vermelho, a logo vai numa caixa branca
 * (manual, pp. 17–20): a cruz continua vermelha sobre branco.
 */

export const NOME_COMPLETO = 'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro'
export const DECRETO = 'Reconhecida como Utilidade Pública Internacional – Decreto nº 9.620, de 13/06/1912'
export const SITE = 'cruzvermelhariodejaneiro.org'
export const VERMELHO = 'rgb(227, 34, 25)'

/** Tamanhos em px. O A4 tem 794 × 1123 px a 96 dpi, exatamente 210 × 297 mm na impressão. */
export const FORMATOS = {
  a4: { rotulo: 'A4 para imprimir', dica: 'Folha em pé, para a barraca ou o mural.', largura: 794, altura: 1123, imprime: true },
  story: { rotulo: 'Story e status', dica: '1080 × 1920, para Instagram e WhatsApp.', largura: 1080, altura: 1920, imprime: false },
  feed: { rotulo: 'Post do feed', dica: '1080 × 1350, retrato do Instagram.', largura: 1080, altura: 1350, imprime: false },
  quadrado: { rotulo: 'Quadrado', dica: '1080 × 1080, para grupos e Facebook.', largura: 1080, altura: 1080, imprime: false },
} as const
export type Formato = keyof typeof FORMATOS

export const MODELOS = {
  classico: { rotulo: 'Clássico', dica: 'Branco com filete vermelho. Gasta pouca tinta.' },
  destaque: { rotulo: 'Destaque', dica: 'Fundo vermelho, logo e QR em caixa branca.' },
  faixa: { rotulo: 'Faixa', dica: 'Branco, com a chamada numa faixa vermelha.' },
} as const
export type Modelo = keyof typeof MODELOS

/** A chamada: título em duas partes (a segunda em destaque) e o texto de apoio. */
export const CHAMADAS = {
  acao: {
    rotulo: 'Fez uma ação?',
    titulo: ['Fez uma ação?', 'Mande para a Comunicação.'],
    texto: 'Fotos, vídeos, áudios e o relato do que aconteceu viram post e matéria — e mostram o trabalho da Cruz Vermelha Brasileira no Rio de Janeiro.',
  },
  hoje: {
    rotulo: 'Registre a ação de hoje',
    titulo: ['Registre', 'a ação de hoje.'],
    texto: 'Tirou foto ou gravou vídeo durante a ação? Mande agora para a Comunicação, do celular, enquanto está tudo fresco na memória.',
  },
  noticia: {
    rotulo: 'Sua foto vira notícia',
    titulo: ['Sua foto pode', 'virar notícia.'],
    texto: 'O que você registra no campo chega à Comunicação e pode sair no site e nas redes da Cruz Vermelha Brasileira.',
  },
  voluntario: {
    rotulo: 'Voluntário, conte a sua ação',
    titulo: ['Voluntário,', 'conte a sua ação.'],
    texto: 'Cada atendimento, treinamento e campanha merece ser contado. Mande fotos e o relato: a Comunicação transforma em história.',
  },
} as const
export type Chamada = keyof typeof CHAMADAS

export const PASSOS: [string, string][] = [
  ['Aponte a câmera', 'do celular para o código.'],
  ['Conte o que aconteceu', 'e anexe fotos, vídeos ou áudios.'],
  ['Envie', 'e a Comunicação cuida do resto.'],
]

export const MAXIMO_DA_ACAO = 60

export type OpcoesDoCartaz = { formato: Formato; modelo: Modelo; chamada: Chamada; acao: string }

const tem = <T extends object>(o: T, k: unknown): k is keyof T => typeof k === 'string' && Object.hasOwn(o, k)

type Parametros = URLSearchParams | Record<string, string | string[] | undefined>
const ler = (p: Parametros, k: string): string | undefined => {
  const v = p instanceof URLSearchParams ? p.get(k) ?? undefined : p[k]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Lê as opções da URL. O que não for conhecido volta ao padrão (A4, clássico,
 * "Fez uma ação?"). O nome da ação é opcional: sem quebras, espaços
 * repetidos ou caracteres de controle, e cortado em 60.
 */
export function lerOpcoes(p: Parametros): OpcoesDoCartaz {
  const formato = ler(p, 'formato')
  const modelo = ler(p, 'modelo')
  const chamada = ler(p, 'chamada')
  const acao = (ler(p, 'acao') ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAXIMO_DA_ACAO).trim()
  return {
    formato: tem(FORMATOS, formato) ? formato : 'a4',
    modelo: tem(MODELOS, modelo) ? modelo : 'classico',
    chamada: tem(CHAMADAS, chamada) ? chamada : 'acao',
    acao,
  }
}

/** A query string das opções, sem o que já é padrão. */
export function paraAUrl(o: OpcoesDoCartaz): string {
  const q = new URLSearchParams()
  if (o.formato !== 'a4') q.set('formato', o.formato)
  if (o.modelo !== 'classico') q.set('modelo', o.modelo)
  if (o.chamada !== 'acao') q.set('chamada', o.chamada)
  if (o.acao) q.set('acao', o.acao)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** "cartaz-story-destaque.png" — o nome do arquivo baixado. */
export const nomeDoArquivo = (o: OpcoesDoCartaz) => `cartaz-cvb-rj-${o.formato}-${o.modelo}.png`
