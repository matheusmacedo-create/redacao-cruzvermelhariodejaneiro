import type { CaixaDeRecorte } from './recorte-tipos'
import type { OrientacaoDoCerebro } from '@/lib/cerebro/orientacao'

export type ArquivoDaBiblioteca = {
  id: string
  nome: string
  tipo: 'foto' | 'video'
  contentType: string
  tamanho: number
  previa: string
  /**
   * Autorização de uso de imagem, como está na Biblioteca.
   *
   * 'authorized' publica; 'pending' espera alguém confirmar que há
   * autorização de quem aparece na foto; 'internal' é material de terceiro —
   * serve de referência na tela e nunca sai em nome da Cruz Vermelha.
   */
  autorizacao: 'authorized' | 'pending' | 'internal'
  /** Imagem gerada por IA. Acompanha o arquivo, nunca some. */
  geradaPorIa?: boolean
}

/**
 * O rodapé de uma foto na página do site: o que ela mostra e de quem é.
 *
 * Vive por arquivo dentro do pacote, e não no arquivo da Biblioteca, porque a
 * legenda é do uso — a mesma foto abre uma matéria sobre a visita e ilustra
 * outra sobre a parceria, com frases diferentes. O crédito costuma repetir, e
 * repetir é barato; inventar uma legenda errada, não.
 */
import type { LegendaDaMidia } from '@/lib/publicacao/legendas'
export type { LegendaDaMidia }

export type MestreRegistro = {
  corpo: string
  titulo: string
  subtitulo: string
  linkUrl: string
  /** Endereço da página no site. É o mestre porque o site é a base. */
  slug: string
  notas: string
  /** Legenda e crédito de cada mídia anexada, por id de arquivo. */
  legendas: Record<string, LegendaDaMidia>
  /**
   * A orientação do Cérebro, quando o pacote nasceu de uma pauta dele. A tela
   * só lê: o autosave não a envia (o servidor preserva a chave) e o editor
   * nunca a apaga do estado — `{ ...mestre, campo }` a carrega junto.
   */
  cerebro?: OrientacaoDoCerebro
}

export type PacoteRegistro = {
  id: string
  tituloInterno: string
  origemTipo: string
  status: string
  agendarPara: string
  mestre: MestreRegistro
  fileIds: string[]
}

export type DestinoRegistro = {
  id: string
  canal: string
  formato: string
  corpo: string
  extras: Record<string, string>
  fileIds: string[]
  crops: Record<string, CaixaDeRecorte>
  descolada: boolean
  estado: string
  agendarPara: string
  erro: string | null
  externalUrl: string | null
}
