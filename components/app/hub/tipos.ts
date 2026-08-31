import type { CaixaDeRecorte } from './recorte-tipos'

export type ArquivoDaBiblioteca = {
  id: string
  nome: string
  tipo: 'foto' | 'video'
  contentType: string
  tamanho: number
  previa: string
  /** Imagem gerada por IA. Acompanha o arquivo, nunca some. */
  geradaPorIa?: boolean
}

export type MestreRegistro = {
  corpo: string
  titulo: string
  subtitulo: string
  linkUrl: string
  /** Endereço da página no site. É o mestre porque o site é a base. */
  slug: string
  notas: string
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
