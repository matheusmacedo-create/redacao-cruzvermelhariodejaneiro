/**
 * O que cada rede aceita, por formato.
 *
 * Números tirados da documentação do Upload-Post (photo-requirements,
 * video-requirements) em agosto de 2026. Onde a documentação manda consultar a
 * rede, ficamos com o recomendado — a conferência avisa, não bloqueia, então
 * errar para o lado cauteloso custa um aviso e não uma publicação impedida.
 *
 * Este arquivo roda no navegador: nada de 'server-only' aqui.
 */

export type Proporcao = { min: number; max: number; ideal: number }

export type Requisito = {
  /** largura ÷ altura */
  proporcao: Proporcao
  larguraMinima?: number
  alturaMinima?: number
  tamanhoMaximo?: number
  duracaoMinima?: number
  duracaoMaxima?: number
  caracteres?: number
}

const NOVE_POR_DEZESSEIS: Proporcao = { min: 0.5, max: 0.62, ideal: 0.5625 }

/** rede → formato → requisito. Ausência significa "a rede não faz esse formato". */
export const REQUISITOS: Record<string, Partial<Record<string, Requisito>>> = {
  instagram: {
    feed: { proporcao: { min: 0.8, max: 1.91, ideal: 1 }, larguraMinima: 320, caracteres: 2_200 },
    stories: { proporcao: NOVE_POR_DEZESSEIS, larguraMinima: 720, alturaMinima: 1280,
      tamanhoMaximo: 300 * 1024 * 1024, duracaoMaxima: 60, caracteres: 2_200 },
    reels: { proporcao: NOVE_POR_DEZESSEIS, larguraMinima: 720, alturaMinima: 1280,
      tamanhoMaximo: 300 * 1024 * 1024, duracaoMinima: 3, duracaoMaxima: 15 * 60, caracteres: 2_200 },
  },
  facebook: {
    texto: { proporcao: { min: 0, max: 99, ideal: 1 }, caracteres: 63_206 },
    feed: { proporcao: { min: 0.5, max: 1.91, ideal: 1.91 }, caracteres: 63_206 },
    stories: { proporcao: NOVE_POR_DEZESSEIS, larguraMinima: 540, alturaMinima: 960,
      duracaoMaxima: 60, caracteres: 63_206 },
    reels: { proporcao: NOVE_POR_DEZESSEIS, larguraMinima: 540, alturaMinima: 960,
      duracaoMinima: 3, duracaoMaxima: 90, caracteres: 63_206 },
  },
  linkedin: {
    texto: { proporcao: { min: 0, max: 99, ideal: 1 }, caracteres: 3_000 },
    feed: { proporcao: { min: 0.42, max: 2.4, ideal: 1.91 }, caracteres: 3_000 },
  },
  x: {
    texto: { proporcao: { min: 0, max: 99, ideal: 1 }, caracteres: 25_000 },
    feed: { proporcao: { min: 0.33, max: 3, ideal: 1.78 }, tamanhoMaximo: 5 * 1024 * 1024, caracteres: 25_000 },
  },
  threads: {
    texto: { proporcao: { min: 0, max: 99, ideal: 1 }, caracteres: 25_000 },
    feed: { proporcao: { min: 0.1, max: 10, ideal: 1 }, larguraMinima: 320,
      tamanhoMaximo: 8 * 1024 * 1024, caracteres: 25_000 },
  },
  bluesky: {
    texto: { proporcao: { min: 0, max: 99, ideal: 1 }, caracteres: 300 },
    feed: { proporcao: { min: 0.1, max: 10, ideal: 1 }, caracteres: 300 },
  },
  pinterest: {
    feed: { proporcao: { min: 0.6, max: 0.72, ideal: 0.667 }, larguraMinima: 600, alturaMinima: 900,
      tamanhoMaximo: 20 * 1024 * 1024, caracteres: 500 },
  },
  google_business: {
    texto: { proporcao: { min: 0, max: 99, ideal: 1 }, caracteres: 1_500 },
    feed: { proporcao: { min: 0.5, max: 2, ideal: 1 }, caracteres: 1_500 },
  },
}

export type Midia = {
  largura: number
  altura: number
  duracao?: number
  tamanho?: number
}

export type Achado = {
  rede: string
  nivel: 'erro' | 'aviso'
  mensagem: string
}

const proporcaoLegivel = (p: number) =>
  p >= 0.99 && p <= 1.01 ? '1:1'
    : p > 1 ? `${p.toFixed(2)}:1`
      : `1:${(1 / p).toFixed(2)}`

const segundos = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}min${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`)

/**
 * Confere um post contra cada rede marcada.
 *
 * "erro" é o que a rede recusa; "aviso" é o que ela aceita mas fica feio —
 * tipicamente corte de imagem. A distinção importa porque um corte às vezes é
 * aceitável e um recusa nunca é.
 */
export function conferir(params: {
  formato: string
  redes: string[]
  texto: string
  midia?: Midia | null
}): Achado[] {
  const { formato, redes, texto, midia } = params
  const achados: Achado[] = []

  for (const rede of redes) {
    const req = REQUISITOS[rede]?.[formato]
    if (!req) {
      achados.push({ rede, nivel: 'erro', mensagem: `não publica neste formato` })
      continue
    }

    if (req.caracteres && texto.length > req.caracteres) {
      achados.push({
        rede, nivel: 'erro',
        mensagem: `texto com ${texto.length} caracteres; o limite é ${req.caracteres.toLocaleString('pt-BR')}`,
      })
    }

    if (!midia) continue

    const proporcao = midia.altura > 0 ? midia.largura / midia.altura : 0
    if (proporcao && (proporcao < req.proporcao.min || proporcao > req.proporcao.max)) {
      achados.push({
        rede, nivel: 'aviso',
        // Dizer a faixa aceita não ajuda ninguém a agir; dizer o formato
        // esperado, sim. Quem vê "9:16" sabe o que fazer com a foto.
        mensagem: `a mídia é ${proporcaoLegivel(proporcao)} e a rede espera ${proporcaoLegivel(req.proporcao.ideal)} — vai cortar`,
      })
    }

    if (req.larguraMinima && midia.largura < req.larguraMinima) {
      achados.push({ rede, nivel: 'erro', mensagem: `largura de ${midia.largura}px; o mínimo é ${req.larguraMinima}px` })
    }
    if (req.alturaMinima && midia.altura < req.alturaMinima) {
      achados.push({ rede, nivel: 'erro', mensagem: `altura de ${midia.altura}px; o mínimo é ${req.alturaMinima}px` })
    }

    if (req.tamanhoMaximo && midia.tamanho && midia.tamanho > req.tamanhoMaximo) {
      const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`
      achados.push({ rede, nivel: 'erro', mensagem: `arquivo de ${mb(midia.tamanho)}; o limite é ${mb(req.tamanhoMaximo)}` })
    }

    if (midia.duracao !== undefined) {
      if (req.duracaoMinima && midia.duracao < req.duracaoMinima) {
        achados.push({ rede, nivel: 'erro', mensagem: `vídeo de ${segundos(midia.duracao)}; o mínimo é ${segundos(req.duracaoMinima)}` })
      }
      if (req.duracaoMaxima && midia.duracao > req.duracaoMaxima) {
        achados.push({ rede, nivel: 'erro', mensagem: `vídeo de ${segundos(midia.duracao)}; o máximo é ${segundos(req.duracaoMaxima)}` })
      }
    }
  }

  return achados
}

/**
 * Quais outras redes aceitariam este mesmo post sem mudar nada. Responde a
 * pergunta "dá para aproveitar em mais lugares?" sem obrigar a marcar cada uma
 * e ver no que dá.
 */
export function tambemAceitam(params: {
  formato: string
  jaMarcadas: string[]
  conectadas: string[]
  texto: string
  midia?: Midia | null
}): string[] {
  const { formato, jaMarcadas, conectadas, texto, midia } = params
  return conectadas
    .filter((rede) => !jaMarcadas.includes(rede) && REQUISITOS[rede]?.[formato])
    .filter((rede) => conferir({ formato, redes: [rede], texto, midia }).every((a) => a.nivel !== 'erro'))
}
