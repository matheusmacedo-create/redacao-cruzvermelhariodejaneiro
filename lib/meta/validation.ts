import type { MediaFile, PostType, SocialPlatform } from './types'

/**
 * Regras da Meta por formato, validadas ANTES de deixar agendar.
 *
 * A alternativa é descobrir que o vídeo tinha 2 segundos a mais só quando o
 * post falha às 7h da manhã de domingo. Melhor barrar no editor.
 */

export const LEGENDA_MAXIMA: Record<SocialPlatform, number> = {
  instagram: 2200,
  facebook: 63_206,
}

/** Máximo de hashtags que o Instagram aceita numa legenda. */
export const HASHTAGS_MAXIMAS = 30
/** Máximo de @menções numa legenda do Instagram. */
export const MENCOES_MAXIMAS = 20

export const MIMES_IMAGEM = new Set(['image/jpeg', 'image/png'])
export const MIMES_VIDEO = new Set(['video/mp4', 'video/quicktime'])

type RegraFormato = {
  minMidias: number
  maxMidias: number
  aceita: 'imagem' | 'video' | 'ambos'
  tamanhoMaximoBytes: number
}

export const REGRAS: Record<PostType, RegraFormato> = {
  feed: { minMidias: 1, maxMidias: 1, aceita: 'ambos', tamanhoMaximoBytes: 100 * 1024 * 1024 },
  carousel: { minMidias: 2, maxMidias: 10, aceita: 'ambos', tamanhoMaximoBytes: 100 * 1024 * 1024 },
  reels: { minMidias: 1, maxMidias: 1, aceita: 'video', tamanhoMaximoBytes: 300 * 1024 * 1024 },
  story: { minMidias: 1, maxMidias: 1, aceita: 'ambos', tamanhoMaximoBytes: 100 * 1024 * 1024 },
}

export type ProblemaValidacao = {
  campo: 'midias' | 'legenda' | 'agendamento' | 'canais' | 'formato'
  mensagem: string
  /** bloqueia a publicação; false = apenas alerta na tela */
  bloqueia: boolean
}

function ehImagem(file: MediaFile) {
  return file.content_type.startsWith('image/')
}

function ehVideo(file: MediaFile) {
  return file.content_type.startsWith('video/')
}

export function validarMidias(postType: PostType, midias: MediaFile[]): ProblemaValidacao[] {
  const regra = REGRAS[postType]
  const problemas: ProblemaValidacao[] = []

  if (midias.length < regra.minMidias) {
    problemas.push({
      campo: 'midias',
      bloqueia: true,
      mensagem:
        regra.minMidias === 1
          ? 'Escolha um arquivo da Biblioteca para publicar.'
          : `Um carrossel precisa de pelo menos ${regra.minMidias} arquivos.`,
    })
  }

  if (midias.length > regra.maxMidias) {
    problemas.push({
      campo: 'midias',
      bloqueia: true,
      mensagem: `Este formato aceita no máximo ${regra.maxMidias} ${regra.maxMidias === 1 ? 'arquivo' : 'arquivos'}.`,
    })
  }

  for (const file of midias) {
    if (regra.aceita === 'video' && !ehVideo(file)) {
      problemas.push({ campo: 'midias', bloqueia: true, mensagem: `"${file.name}" não é um vídeo. Reels aceita apenas vídeo.` })
      continue
    }
    if (regra.aceita === 'imagem' && !ehImagem(file)) {
      problemas.push({ campo: 'midias', bloqueia: true, mensagem: `"${file.name}" não é uma imagem.` })
      continue
    }
    if (ehImagem(file) && !MIMES_IMAGEM.has(file.content_type)) {
      problemas.push({
        campo: 'midias',
        bloqueia: true,
        mensagem: `"${file.name}": o Instagram aceita apenas JPEG e PNG. Converta o arquivo antes de publicar.`,
      })
    }
    if (ehVideo(file) && !MIMES_VIDEO.has(file.content_type)) {
      problemas.push({
        campo: 'midias',
        bloqueia: true,
        mensagem: `"${file.name}": o formato de vídeo precisa ser MP4 ou MOV.`,
      })
    }
    if (file.size_bytes > regra.tamanhoMaximoBytes) {
      const limiteMb = Math.round(regra.tamanhoMaximoBytes / (1024 * 1024))
      problemas.push({
        campo: 'midias',
        bloqueia: true,
        mensagem: `"${file.name}" passa do limite de ${limiteMb} MB deste formato.`,
      })
    }
  }

  return problemas
}

export function validarLegenda(legenda: string, plataformas: SocialPlatform[]): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = []

  for (const plataforma of plataformas) {
    const limite = LEGENDA_MAXIMA[plataforma]
    if (legenda.length > limite) {
      problemas.push({
        campo: 'legenda',
        bloqueia: true,
        mensagem: `A legenda tem ${legenda.length} caracteres e o ${plataforma === 'instagram' ? 'Instagram' : 'Facebook'} aceita ${limite}.`,
      })
    }
  }

  if (plataformas.includes('instagram')) {
    const hashtags = legenda.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0
    if (hashtags > HASHTAGS_MAXIMAS) {
      problemas.push({
        campo: 'legenda',
        bloqueia: true,
        mensagem: `A legenda tem ${hashtags} hashtags e o Instagram aceita no máximo ${HASHTAGS_MAXIMAS}.`,
      })
    }
    const mencoes = legenda.match(/@[\w.]+/g)?.length ?? 0
    if (mencoes > MENCOES_MAXIMAS) {
      problemas.push({
        campo: 'legenda',
        bloqueia: true,
        mensagem: `A legenda tem ${mencoes} menções e o Instagram aceita no máximo ${MENCOES_MAXIMAS}.`,
      })
    }
  }

  return problemas
}

export function validarAgendamento(quando: Date | null): ProblemaValidacao[] {
  if (!quando) return [{ campo: 'agendamento', bloqueia: true, mensagem: 'Escolha a data e a hora da publicação.' }]

  const problemas: ProblemaValidacao[] = []
  const emMinutos = (quando.getTime() - Date.now()) / 60_000

  if (emMinutos < 5) {
    problemas.push({
      campo: 'agendamento',
      bloqueia: true,
      mensagem: 'O agendamento precisa ser de pelo menos 5 minutos à frente. Para publicar agora, use "Publicar agora".',
    })
  }
  // A Meta não aceita agendamento nativo além de 6 meses.
  if (emMinutos > 6 * 30 * 24 * 60) {
    problemas.push({
      campo: 'agendamento',
      bloqueia: true,
      mensagem: 'Não é possível agendar para mais de 6 meses à frente.',
    })
  }
  return problemas
}

/** Validação completa. Devolve tudo de uma vez para a tela mostrar junto. */
export function validarPost(entrada: {
  postType: PostType
  legenda: string
  midias: MediaFile[]
  plataformas: SocialPlatform[]
  agendarPara?: Date | null
}): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = []

  if (entrada.plataformas.length === 0) {
    problemas.push({ campo: 'canais', bloqueia: true, mensagem: 'Escolha pelo menos um canal de destino.' })
  }

  // Story e Reels só existem no Instagram na nossa integração.
  if ((entrada.postType === 'story' || entrada.postType === 'reels') && entrada.plataformas.includes('facebook')) {
    problemas.push({
      campo: 'formato',
      bloqueia: true,
      mensagem: 'Reels e Stories, nesta fase, são publicados apenas no Instagram. Desmarque o Facebook.',
    })
  }

  problemas.push(...validarMidias(entrada.postType, entrada.midias))
  problemas.push(...validarLegenda(entrada.legenda, entrada.plataformas))
  if (entrada.agendarPara !== undefined) problemas.push(...validarAgendamento(entrada.agendarPara))

  return problemas
}

export function temBloqueio(problemas: ProblemaValidacao[]): boolean {
  return problemas.some((problema) => problema.bloqueia)
}
