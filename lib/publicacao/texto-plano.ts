import { parseContentBlocks, type InlineToken } from '@/lib/content-blocks'

/**
 * Converte o texto-mestre — que é escrito no formato da matéria — no texto
 * simples que as redes publicam.
 *
 * Nenhuma rede social interpreta a marcação da matéria: Facebook, Instagram e
 * LinkedIn publicam exatamente os caracteres recebidos. Sem esta conversão a
 * legenda sai com `**` em volta da frase de abertura, `## ` na frente de cada
 * intertítulo e — pior — a linha inteira da foto, `![legenda](/api/private-blob
 * ?pathname=…)`, no lugar onde deveria estar a foto. Foi o que aconteceu no
 * primeiro pacote publicado a partir de uma matéria.
 *
 * A conversão reusa o mesmo leitor de blocos da página do site: um formato só,
 * dois destinos, zero regras duplicadas.
 */

export type TextoDeRede = {
  texto: string
  /** Quantas mídias estavam escritas no texto e ficaram de fora da legenda. */
  midiasNoTexto: number
}

function inlinePlano(tokens: InlineToken[]): string {
  return tokens
    .map((t) => {
      if (t.type !== 'link') return t.text
      // Endereço nu é clicável em toda rede; rótulo sem endereço não leva a
      // lugar nenhum, porque nenhuma delas aceita link em texto.
      const rotulo = t.text.trim()
      return !rotulo || rotulo === t.href ? t.href : `${rotulo}: ${t.href}`
    })
    .join('')
}

export function textoParaRede(corpo: string): TextoDeRede {
  let midiasNoTexto = 0
  const paragrafos: string[] = []

  for (const bloco of parseContentBlocks(corpo)) {
    switch (bloco.type) {
      case 'image':
      case 'video':
      case 'audio':
        // A mídia da rede é anexo, não linha de texto: sai daqui e entra pela
        // seleção de mídias do destino. Contamos para poder avisar.
        midiasNoTexto++
        break
      case 'heading':
        paragrafos.push(inlinePlano(bloco.inline))
        break
      case 'quote':
        paragrafos.push(`“${inlinePlano(bloco.inline)}”`)
        break
      case 'list':
        paragrafos.push(
          bloco.items
            .map((item, i) => (bloco.ordenada ? `${i + 1}. ${inlinePlano(item)}` : `• ${inlinePlano(item)}`))
            .join('\n'),
        )
        break
      default:
        paragrafos.push(inlinePlano(bloco.inline))
    }
  }

  return { texto: paragrafos.join('\n\n').trim(), midiasNoTexto }
}

const MARCACAO_VISIVEL = [
  /(^|\n)!\[[^\]]*\]\(\S+/,   // linha de foto
  /(^|\n)#{1,6}\s/,           // intertítulo
  /(^|\n)>\s/,                // citação
  /(^|\n)[-*]\s/,             // item de lista
  /\*\*[^\n*]+\*\*/,          // negrito
  /\[[^\]\n]+\]\(\S+?\)/,     // link em marcação
]

/**
 * Diz se um texto ainda carrega marcação que a rede vai publicar literalmente.
 *
 * Existe para as legendas já salvas antes desta conversão — e para as que
 * alguém colar de uma IA direto no campo do destino. Sem isso, o defeito só
 * aparece depois de publicado.
 */
export function temMarcacaoVisivel(texto: string): boolean {
  return MARCACAO_VISIVEL.some((r) => r.test(texto))
}
