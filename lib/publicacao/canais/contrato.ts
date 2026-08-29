import type { UnidadeDeTexto } from '@/lib/publicacao/contagem'

/**
 * Contrato de um canal de publicação.
 *
 * A tela nunca hardcoda limite, formato nem campo: ela renderiza o que o
 * adapter declara. Canal novo = um arquivo aqui + registro no índice — o
 * esqueleto do hub não muda. (Era o pedido central do spec: sobreviver a
 * TikTok, YouTube e às mudanças de limite da Meta sem redesenhar a tela.)
 */

export type FormatoDoCanal = {
  id: string
  rotulo: string
  midia: {
    min: number
    max: number
    /** '1:1' | '4:5' | '9:16' | '1.91:1' | '2:3' | '4:3' | 'livre' */
    proporcaoPreferida: string
    video: 'nao' | 'permitido' | 'obrigatorio'
    duracaoMaxima?: number
  }
  texto: {
    max: number
    unidade: UnidadeDeTexto
    /** Ponto do "ver mais" — aviso, não erro. */
    dobra?: number
    maxHashtags?: number
  }
}

export type CampoExtra = {
  chave: string
  rotulo: string
  tipo: 'texto' | 'textarea' | 'url' | 'select'
  max?: number
  opcoes?: string[]
  /** Só aparece nestes formatos; ausente = todos. */
  formatos?: string[]
  dica?: string
  /**
   * Preenchido quando o conector ainda não entrega este campo: o campo aparece
   * desabilitado com este motivo. Melhor do que sumir com ele ou — pior —
   * aceitar o valor e descartá-lo em silêncio.
   */
  indisponivel?: string
}

export type Mestre = {
  corpo: string
  titulo?: string
  subtitulo?: string
  linkUrl?: string
  fileIds: string[]
}

export type Aviso = { nivel: 'erro' | 'aviso' | 'info'; mensagem: string }

export type Variante = {
  corpo: string
  extras: Record<string, string>
  fileIds: string[]
}

export type Adapter = {
  id: string
  nome: string
  /** Classe de cor do chip quando marcado (mesma paleta da tela atual). */
  cor: string
  formatos: FormatoDoCanal[]
  camposExtras: CampoExtra[]
  /**
   * Ajustes específicos do canal aplicados depois do enxugamento genérico.
   * A maioria não precisa; Pinterest usa para propor o título do pin.
   */
  aoGerar?: (variante: Variante, mestre: Mestre, formatoId: string) => Variante
  /** Regras próprias além das genéricas de texto/mídia (ex.: pin exige título). */
  validarExtras?: (variante: Variante, formatoId: string) => Aviso[]
}

export function formatoDoAdapter(adapter: Adapter, formatoId: string): FormatoDoCanal | undefined {
  return adapter.formatos.find((f) => f.id === formatoId)
}
