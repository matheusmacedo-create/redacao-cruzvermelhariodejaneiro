import { mediaToken, normalizarQuebras } from '@/lib/content-blocks'

/**
 * O rodapé das fotos anexadas ao pacote.
 *
 * A foto escrita DENTRO do texto já carregava legenda e crédito na própria
 * linha — `![legenda](url "Foto: Fulano")`. A foto anexada ao pacote não
 * tinha onde guardar isso, e os dois lugares que montavam a página (a prévia
 * e o disparo) resolviam do mesmo jeito errado: usavam o NOME DO ARQUIVO como
 * legenda. Na página saía "cerebro-9093f62038432349.jpg" embaixo da imagem.
 *
 * Aqui ficam as duas coisas que faltavam: onde a legenda mora e como ela vira
 * página. Um módulo só porque prévia e disparo TÊM de concordar — foi
 * justamente por resolverem separado que os dois erraram igual.
 */

/** Onde a foto entra na página: abrindo a matéria, distribuída pelo meio do
 * texto, ou depois do último parágrafo. */
export type PosicaoDaMidia = 'inicio' | 'meio' | 'fim'
const POSICOES = new Set<PosicaoDaMidia>(['inicio', 'meio', 'fim'])

export type LegendaDaMidia = { legenda: string; credito: string; posicao?: PosicaoDaMidia }

/** Uma mídia anexada, do jeito que os dois lados conseguem descrever. */
export type MidiaAnexada = {
  /** Id do arquivo na Biblioteca — é a chave da legenda. */
  id: string
  /** Endereço que o gerador de página entende. */
  url: string
}

/** Lê o mapa de legendas do jsonb do mestre, descartando o que não serve. */
export function lerLegendas(bruto: unknown): Record<string, LegendaDaMidia> {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {}
  const saida: Record<string, LegendaDaMidia> = {}
  for (const [id, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!id || !valor || typeof valor !== 'object') continue
    const v = valor as Record<string, unknown>
    const legenda = typeof v.legenda === 'string' ? v.legenda.trim() : ''
    const credito = typeof v.credito === 'string' ? v.credito.trim() : ''
    const posicao = typeof v.posicao === 'string' && POSICOES.has(v.posicao as PosicaoDaMidia)
      ? (v.posicao as PosicaoDaMidia)
      : undefined
    // Entrada vazia não vale a linha no banco nem a viagem pela rede — mas a
    // posição escolhida, mesmo sem legenda, é decisão de edição e fica.
    if (!legenda && !credito && !posicao) continue
    saida[id] = { legenda: legenda.slice(0, 300), credito: credito.slice(0, 160), ...(posicao ? { posicao } : {}) }
  }
  return saida
}

/**
 * Põe as mídias anexadas no corpo da página, como blocos — cada uma no lugar
 * que a edição escolheu.
 *
 * Sem escolha, o padrão é o de jornal: a primeira abre a matéria em destaque
 * e as demais se DISTRIBUEM pelo meio do texto, entre os parágrafos — não
 * empilhadas no fim, que era o padrão antigo e deixava todo artigo terminando
 * numa fileira de fotos. "Fim" continua disponível para quem quiser.
 *
 * Sem legenda escrita, o bloco sai SEM legenda, e não com o nome do arquivo:
 * foto muda é melhor do que foto legendada com "IMG_2043.jpg".
 */
export function corpoComMidias(
  corpo: string,
  midias: MidiaAnexada[],
  legendas: Record<string, LegendaDaMidia>,
): string {
  const comPosicao = midias
    .filter((m) => m.url)
    .map((m, i) => {
      const dados = legendas[m.id]
      return {
        token: mediaToken('image', m.url, dados?.legenda ?? '', dados?.credito || undefined),
        posicao: dados?.posicao ?? (i === 0 ? 'inicio' : 'meio') as PosicaoDaMidia,
      }
    })
  if (!comPosicao.length) return corpo

  const inicio = comPosicao.filter((t) => t.posicao === 'inicio').map((t) => t.token)
  const meio = comPosicao.filter((t) => t.posicao === 'meio').map((t) => t.token)
  const fim = comPosicao.filter((t) => t.posicao === 'fim').map((t) => t.token)

  // Texto colado do Word ou do Windows chega com \r\n: sem normalizar, a
  // matéria inteira contava como UM parágrafo e as fotos do meio caíam todas
  // empilhadas no fim da página.
  const paragrafos = normalizarQuebras(corpo).split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean)

  // Sem texto não há meio: tudo empilha na ordem início → meio → fim.
  if (!paragrafos.length) {
    return [...inicio, ...meio, ...fim].join('\n\n')
  }

  // As do meio entram em pontos espalhados por igual — nunca antes do 1º
  // parágrafo nem depois do último, e só onde a foto não separa o que vai
  // junto: depois de um intertítulo ("## …") ou de uma frase que anuncia uma
  // lista ("incluindo:") a foto cortaria o texto do que ele apresenta.
  const pontosPossiveis = paragrafos
    .map((_, i) => i)
    .filter((i) => i < paragrafos.length - 1 && !/^#{1,6}\s/.test(paragrafos[i]) && !/:\s*$/.test(paragrafos[i]))
  const pontos = meio.map((_, j) => {
    if (!pontosPossiveis.length) return paragrafos.length - 1
    const k = Math.round(((j + 1) * (pontosPossiveis.length + 1)) / (meio.length + 1)) - 1
    return pontosPossiveis[Math.min(pontosPossiveis.length - 1, Math.max(0, k))]
  })
  const saida: string[] = [...inicio]
  paragrafos.forEach((paragrafo, i) => {
    saida.push(paragrafo)
    pontos.forEach((ponto, j) => { if (ponto === i) saida.push(meio[j]) })
  })
  saida.push(...fim)
  return saida.join('\n\n')
}
