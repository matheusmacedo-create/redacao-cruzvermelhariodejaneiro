import { normalizarQuebras } from '@/lib/content-blocks'

/**
 * Conversão de texto colado para o formato da matéria.
 *
 * O caminho real da redação é copiar de algum lugar — de uma resposta de IA,
 * de um documento, de um e-mail — e colar aqui. O que chega nunca está no
 * formato: vem com `###` de três níveis, listas numeradas, `__negrito__`,
 * marcadores `•`, cercas de código e quebras do Windows. Sem tradução, tudo
 * isso aparece como texto cru na página publicada.
 *
 * Este módulo traduz. Ele é puro de propósito — a única parte que depende do
 * navegador é a leitura de HTML, isolada em htmlParaFormato.
 */

/** Um verso do formato: o que cada linha é depois de classificada. */
type Especie = 'titulo' | 'item' | 'numerado' | 'citacao' | 'midia' | 'texto' | 'vazia'

const LINHA_DE_MIDIA = /^!\[[^\]]*\]\(\S+?(?:\s+"[^"]*")?\)$/
/** Régua horizontal: --- *** ___ — some, não vira parágrafo de trações. */
const REGUA = /^\s*([-*_])(?:\s*\1){2,}\s*$/

function especieDa(linha: string): Especie {
  const t = linha.trim()
  if (!t) return 'vazia'
  if (LINHA_DE_MIDIA.test(t)) return 'midia'
  if (t.startsWith('## ')) return 'titulo'
  if (t.startsWith('> ')) return 'citacao'
  if (/^- /.test(t)) return 'item'
  if (/^\d+\. /.test(t)) return 'numerado'
  return 'texto'
}

/** Marcas que o navegador e os editores deixam e que só atrapalham. */
function limparInvisiveis(texto: string): string {
  return texto
    // Espaço não separável vira espaço comum: senão a linha nunca casa com
    // "- " ou "## ", porque o que parece um espaço não é um.
    .replace(/\u00A0|\u202F/g, ' ')
    // Largura zero, marcas de direção, separadores exóticos e BOM — vêm
    // colados de editores web e não representam nada no texto.
    .replace(/[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, '')
}

/**
 * Traduz a marcação que a IA usa para a que o formato entende, linha a linha.
 */
function traduzirLinha(linha: string): string | null {
  let t = linha.replace(/\s+$/, '')

  if (REGUA.test(t)) return null

  // Títulos de qualquer nível viram o único que existe aqui: a página já tem
  // um h1, que é o título da matéria — o resto é intertítulo.
  const titulo = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(t)
  if (titulo) return `## ${limparEnfase(titulo[1])}`

  // Citação, com ou sem espaço depois do >.
  const citacao = /^\s{0,3}>\s?(.*)$/.exec(t)
  if (citacao) return `> ${limparEnfase(citacao[1])}`

  // Marcadores de todo tipo, inclusive os indentados de sublista: o formato
  // tem um nível só, então a sublista sobe para o mesmo nível em vez de
  // aparecer como texto solto com um traço no meio da página.
  const item = /^\s*[-*+•·‣◦–—]\s+(.*)$/.exec(t)
  if (item) return `- ${limparEnfase(item[1])}`

  // Lista numerada: a IA vive produzindo passo a passo, e "1)" é tão comum
  // quanto "1.". Guardamos o número — a ordem é a informação.
  const numerado = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(t)
  if (numerado) return `${numerado[1]}. ${limparEnfase(numerado[2])}`

  // Linha inteira em negrito é subtítulo na prática, não uma frase gritada.
  const soNegrito = /^\*\*(.+?)\*\*:?$/.exec(t.trim())
  if (soNegrito && !soNegrito[1].includes('**')) return `## ${limparEnfase(soNegrito[1])}`

  t = limparEnfase(t)
  return t
}

/** Uniformiza ênfase e tira o que o formato não representa. */
function limparEnfase(texto: string): string {
  return texto
    // __negrito__ e _itálico_ são a mesma intenção com outra grafia. O
    // itálico exige borda não-palavra dos dois lados para não estragar
    // nome_de_arquivo.
    .replace(/__(.+?)__/g, '**$1**')
    .replace(/(^|[^\w`])_([^_\n]+)_(?=$|[^\w])/g, '$1*$2*')
    // Código inline não tem representação na página: fica o texto.
    .replace(/`([^`\n]+)`/g, '$1')
}

/**
 * Põe o texto colado no formato da matéria.
 *
 * Além de traduzir cada linha, agrupa: título e citação viram parágrafo
 * próprio, itens seguidos viram uma lista só, e linhas de texto seguidas se
 * juntam num parágrafo — texto quebrado na largura da tela de origem não
 * pode virar dez parágrafos de uma linha.
 */
export function normalizarTexto(bruto: string): string {
  if (!bruto) return ''

  const linhas = limparInvisiveis(normalizarQuebras(bruto))
    // Cercas de código: some a cerca, fica o conteúdo.
    .replace(/^\s*```.*$/gm, '')
    .split('\n')

  const grupos: string[] = []
  let atual: string[] = []
  let especieAtual: Especie | null = null

  const fechar = () => {
    if (atual.length) grupos.push(atual.join('\n'))
    atual = []
    especieAtual = null
  }

  for (const linha of linhas) {
    const traduzida = traduzirLinha(linha)
    if (traduzida === null) { fechar(); continue }

    const especie = especieDa(traduzida)
    if (especie === 'vazia') { fechar(); continue }

    // Título, citação e mídia nunca dividem parágrafo com o vizinho. Itens
    // seguidos, sim: é isso que faz uma lista.
    const juntavel = especie === 'item' || especie === 'numerado' || especie === 'texto'
    if (!juntavel || especie !== especieAtual) fechar()

    atual.push(traduzida)
    especieAtual = especie
  }
  fechar()

  return grupos
    // Uma linha de texto quebrada na origem vira um parágrafo só; item de
    // lista e citação mantêm suas linhas.
    .map((g) => (especieDa(g.split('\n')[0]) === 'texto' ? g.split('\n').join(' ') : g))
    .map((g) => g.trim())
    .filter(Boolean)
    .join('\n\n')
}

/** Endereços que podem virar link; barra javascript: e data:. */
function hrefUtil(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url, 'https://exemplo.invalido')
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? url : null
  } catch {
    return null
  }
}

function inlineDoNo(no: Node): string {
  if (no.nodeType === 3) return (no.textContent ?? '').replace(/\s+/g, ' ')
  if (no.nodeType !== 1) return ''
  const el = no as Element
  const dentro = Array.from(el.childNodes).map(inlineDoNo).join('')
  const tag = el.tagName.toLowerCase()

  if (tag === 'br') return '\n'
  if (!dentro.trim() && tag !== 'img') return dentro
  if (tag === 'strong' || tag === 'b') return `**${dentro.trim()}**`
  if (tag === 'em' || tag === 'i') return `*${dentro.trim()}*`
  if (tag === 'a') {
    const href = hrefUtil(el.getAttribute('href'))
    return href ? `[${dentro.trim()}](${href})` : dentro
  }
  return dentro
}

function blocosDoNo(el: Element, saida: string[]): void {
  const tag = el.tagName.toLowerCase()

  if (tag === 'ul' || tag === 'ol') {
    const itens = Array.from(el.children).filter((f) => f.tagName.toLowerCase() === 'li')
    const linhas = itens.map((li, i) => {
      const proprio = Array.from(li.childNodes)
        .filter((n) => !(n.nodeType === 1 && ['ul', 'ol'].includes((n as Element).tagName.toLowerCase())))
        .map(inlineDoNo).join('').replace(/\s+/g, ' ').trim()

      // O formato tem um nível só. Emitir a sublista como bloco separado
      // partiria a lista numerada em três — e o item seguinte recomeçaria em
      // "1." na página. Então os subitens entram na linha do pai.
      const subitens = Array.from(li.children)
        .filter((f) => ['ul', 'ol'].includes(f.tagName.toLowerCase()))
        .flatMap((f) => Array.from(f.children).filter((n) => n.tagName.toLowerCase() === 'li'))
        .map((n) => inlineDoNo(n).replace(/\s+/g, ' ').trim())
        .filter(Boolean)

      const marca = tag === 'ol' ? `${i + 1}. ` : '- '
      if (!subitens.length) return `${marca}${proprio}`
      const juncao = /[:;.,]$/.test(proprio) ? ' ' : ': '
      return `${marca}${proprio}${proprio ? juncao : ''}${subitens.join('; ')}`
    }).filter((l) => l.replace(/^(?:- |\d+\. )/, '').trim())
    if (linhas.length) saida.push(linhas.join('\n'))
    return
  }

  if (/^h[1-6]$/.test(tag)) {
    const texto = inlineDoNo(el).trim()
    if (texto) saida.push(`## ${texto}`)
    return
  }

  if (tag === 'blockquote') {
    const texto = inlineDoNo(el).trim().split('\n').filter(Boolean).map((l) => `> ${l}`).join('\n')
    if (texto) saida.push(texto)
    return
  }

  if (tag === 'table') {
    // A página não tem tabela. Cada linha vira um item, com as células
    // separadas por travessão: perde o alinhamento, não perde o conteúdo.
    const linhas = Array.from(el.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.children).map((c) => inlineDoNo(c).trim()).filter(Boolean).join(' — '),
    ).filter(Boolean)
    if (linhas.length) saida.push(linhas.map((l) => `- ${l}`).join('\n'))
    return
  }

  if (tag === 'pre') {
    const texto = (el.textContent ?? '').trim()
    if (texto) saida.push(texto)
    return
  }

  if (tag === 'hr' || tag === 'script' || tag === 'style' || tag === 'img') return

  // Container: desce. Bloco de texto: vira parágrafo.
  const temBlocoDentro = Array.from(el.children).some((f) =>
    /^(p|div|section|article|main|header|footer|ul|ol|h[1-6]|blockquote|table|pre|hr|figure)$/.test(f.tagName.toLowerCase()),
  )
  if (temBlocoDentro) {
    for (const filho of Array.from(el.childNodes)) {
      if (filho.nodeType === 1) blocosDoNo(filho as Element, saida)
      else if (filho.nodeType === 3) {
        const solto = (filho.textContent ?? '').trim()
        if (solto) saida.push(solto)
      }
    }
    return
  }

  const texto = inlineDoNo(el).trim()
  if (texto) saida.push(texto)
}

/**
 * Lê o HTML da área de transferência e devolve o formato da matéria.
 *
 * Colar de um chat de IA, do Docs ou de uma página traz HTML junto do texto.
 * O HTML é a versão fiel: tem o negrito, o link e o nível da lista que o
 * texto puro já perdeu. Usamos DOMParser porque HTML colado vem torto — com
 * span aninhado, atributo de estilo, tag sem fechar — e um parser de verdade
 * aguenta isso, expressão regular não.
 */
export function htmlParaFormato(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const saida: string[] = []
  for (const filho of Array.from(doc.body.childNodes)) {
    if (filho.nodeType === 1) blocosDoNo(filho as Element, saida)
    else if (filho.nodeType === 3) {
      const solto = (filho.textContent ?? '').trim()
      if (solto) saida.push(solto)
    }
  }
  return normalizarTexto(saida.join('\n\n'))
}

/**
 * O que colar, a partir do que a área de transferência oferece.
 *
 * O HTML vem primeiro quando existe e rende mais do que o texto puro — mas
 * um HTML que só embrulha texto sem marcação nenhuma não vale a viagem, e aí
 * o texto original, que preserva as quebras de linha do autor, é melhor.
 */
export function textoDaColagem(html: string | null | undefined, texto: string): string {
  const doHtml = html ? htmlParaFormato(html) : ''
  const doTexto = normalizarTexto(texto)
  if (!doHtml) return doTexto
  const marcado = /(\*\*|^## |^- |^\d+\. |^> |\]\()/m.test(doHtml)
  return marcado || !doTexto ? doHtml : doTexto
}
