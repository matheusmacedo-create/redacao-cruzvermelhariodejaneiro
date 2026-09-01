import { mediaToken } from '@/lib/content-blocks'

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

export type LegendaDaMidia = { legenda: string; credito: string }

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
    // Entrada vazia não vale a linha no banco nem a viagem pela rede.
    if (!legenda && !credito) continue
    saida[id] = { legenda: legenda.slice(0, 300), credito: credito.slice(0, 160) }
  }
  return saida
}

/**
 * Põe as mídias anexadas no corpo da página, como blocos.
 *
 * A primeira abre a matéria — é o que a página trata como imagem de destaque;
 * as outras vão para o fim. Sem legenda escrita, o bloco sai SEM legenda, e
 * não com o nome do arquivo: foto muda é melhor do que foto legendada com
 * "IMG_2043.jpg". Quem lê com leitor de tela perde nos dois casos, e a tela
 * avisa disso na hora de escrever.
 */
export function corpoComMidias(
  corpo: string,
  midias: MidiaAnexada[],
  legendas: Record<string, LegendaDaMidia>,
): string {
  const tokens = midias
    .filter((m) => m.url)
    .map((m) => {
      const dados = legendas[m.id]
      return mediaToken('image', m.url, dados?.legenda ?? '', dados?.credito || undefined)
    })
  if (!tokens.length) return corpo
  const resto = tokens.slice(1)
  return [tokens[0], corpo, ...resto].filter(Boolean).join('\n\n')
}
