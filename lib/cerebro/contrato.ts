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
  /**
   * Material da própria filial. Foto que a Casa publicou no Instagram dela é
   * dela — tratar como de terceiro impediria a filial de reaproveitar a
   * própria imagem. Continua exigindo autorização humana, mas por causa de
   * quem aparece na foto, não de quem é a foto.
   */
  daCasa?: boolean
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

/**
 * Por que uma sugestão foi recusada. Espelha MOTIVOS de src/core/tipos.ts do
 * Cérebro: o motivo é o que ele aprende — "repetitivo" faz recuar na fonte,
 * "não é da Cruz" derruba o assunto. Recusar sem motivo só esconderia o
 * cartão, e amanhã ele voltaria igual.
 */
export type MotivoRecusa =
  | 'repetitivo'
  | 'sem_relacao'
  | 'sem_acao'
  | 'ja_falamos'
  | 'fonte_fraca'
  | 'outro'

export const MOTIVOS_RECUSA: Record<MotivoRecusa, { rotulo: string; explica: string }> = {
  repetitivo: { rotulo: 'Repetitivo', explica: 'Já apareceu coisa demais desta fonte ou deste assunto.' },
  sem_relacao: { rotulo: 'Não é da Cruz', explica: 'Boa informação, mas não é pauta da filial.' },
  sem_acao: { rotulo: 'Sem ação nossa', explica: 'Sem operação da filial, não vira peça.' },
  ja_falamos: { rotulo: 'Já falamos disso', explica: 'A Casa já publicou esse gancho.' },
  fonte_fraca: { rotulo: 'Fonte fraca', explica: 'Não sustenta uma peça pública.' },
  outro: { rotulo: 'Outro motivo', explica: 'Recusado por julgamento da equipe.' },
}

/** Rótulo curto de cada pergunta do motor, na ordem em que pesam. */
export const PERGUNTAS: [chave: string, rotulo: string][] = [
  ['localidade', 'É local?'],
  ['urgencia', 'É urgente?'],
  ['relacao', 'Tem relação conosco?'],
  ['acaoReal', 'Existe ação real?'],
  ['ineditismo', 'Já falamos disso?'],
  ['confianca', 'Fonte confiável?'],
]

/** Do canal do Cérebro para o par canal+formato do hub de publicações. */
export const DESTINO_POR_CANAL: Record<CanalCerebro, { canal: string; formato: string; rotulo: string }> = {
  site: { canal: 'site_web', formato: 'materia', rotulo: 'Site — matéria' },
  feed: { canal: 'instagram', formato: 'feed', rotulo: 'Instagram — feed' },
  stories: { canal: 'instagram', formato: 'stories', rotulo: 'Instagram — stories' },
  reels: { canal: 'instagram', formato: 'reels', rotulo: 'Instagram — reels' },
}
