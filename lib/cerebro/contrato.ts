/**
 * O que o Cérebro entrega.
 *
 * O Cérebro (cerebrocruzvermelha.vercel.app) observa uma lista fechada de
 * contas oficiais e decide o que merece virar pauta. Ele não publica: entrega
 * a sugestão com o raciocínio, o plano por canal e o que não pode. Quem
 * produz e publica é a Redação, com decisão humana.
 *
 * Espelha o contrato versionado em src/core/contrato.ts do outro lado.
 * Campos são declarados opcionais onde o Cérebro pode omiti-los: um contrato
 * que estoura por campo ausente derruba a tela inteira por um detalhe.
 */
export const VERSAO_SUPORTADA = 1

export type CanalCerebro = 'site' | 'feed' | 'stories' | 'reels'

export interface PlanoDeCanal {
  canal: CanalCerebro
  usar: boolean
  formato: string
  midia: string
  cta: string
  texto: string
}

export interface MidiaDaPauta {
  /** Servida pelo cache do Cérebro; a da CDN da fonte expira em dias. */
  url: string
  urlOriginal?: string
  formato: string
  tipo?: string
  direito: string
  /** Só `true` libera a mídia para entrar numa peça da filial. */
  podePublicar: boolean
  credito: string
}

export interface PautaDoCerebro {
  id: string
  titulo: string
  resumo: string
  fato: {
    fonte: string
    conta: string | null
    url: string
    quando: string
    plataforma: string
    confiavel: boolean
  }
  decisao: {
    modo: string
    modoRotulo: string
    veredito: string
    nota: number
    notas: Record<string, number>
    porque: string[]
  }
  midia: MidiaDaPauta | null
  canais: PlanoDeCanal[]
  proibido: string[]
  agrupados?: { quantidade: number; outros: { id: string; titulo: string }[] } | null
  urlNoCerebro?: string
}

export interface RespostaDoCerebro {
  versao: string
  origem: 'apify' | 'seed'
  geradoEm: string
  aviso: string
  total: number
  pautas: PautaDoCerebro[]
}

/** Do canal do Cérebro para o par canal+formato do hub de publicações. */
export const DESTINO_POR_CANAL: Record<CanalCerebro, { canal: string; formato: string; rotulo: string }> = {
  site: { canal: 'site_web', formato: 'materia', rotulo: 'Site — matéria' },
  feed: { canal: 'instagram', formato: 'feed', rotulo: 'Instagram — feed' },
  stories: { canal: 'instagram', formato: 'stories', rotulo: 'Instagram — stories' },
  reels: { canal: 'instagram', formato: 'reels', rotulo: 'Instagram — reels' },
}
