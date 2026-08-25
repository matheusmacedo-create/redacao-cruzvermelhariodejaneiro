/**
 * Leitura da descrição de uma pauta.
 *
 * O texto chega quebrado em linhas e com uma estrutura que a Comunicação usa
 * de verdade — cabeçalho de calendário, seções em caixa alta, slides
 * numerados, legenda, hashtags e recados. Renderizado como um parágrafo só,
 * tudo isso vira um bloco ilegível, e o recado mais importante ("revisar com a
 * coordenação de Saúde antes de publicar") some no meio.
 *
 * Nada aqui é obrigatório: uma descrição escrita à mão, sem nenhuma dessas
 * marcas, sai como parágrafos com as quebras de linha preservadas — que já é
 * melhor do que estava.
 *
 * Lógica pura, fora de componente, para poder ser conferida sem navegador.
 */

export type ItemDaPauta = { marcador: string; texto: string }

export type BlocoDaPauta =
  | { tipo: 'ficha'; itens: { rotulo: string; valor: string }[] }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'itens'; itens: ItemDaPauta[] }
  | { tipo: 'nota'; texto: string }
  | { tipo: 'hashtags'; tags: string[] }
  | { tipo: 'paragrafo'; texto: string }

// Caixa alta: sem nenhuma minúscula, com letra de verdade, curta e sem dois
// pontos — "SLIDES" e "LEGENDA" entram, "NAO faca: ..." não.
const TITULO = /^[^a-zà-ÿ]{2,40}$/
const TEM_LETRA = /[A-ZÀ-Ý]/
// Rótulo curto antes dos dois pontos: "1", "6 (CTA)", "Gancho (0-3s)".
// A âncora nos 32 caracteres é o que impede um "Em emergencia: 192" no meio de
// uma legenda de virar item.
const ITEM = /^(.{1,32}?):\s+(.+)$/
const SO_HASHTAGS = /^#[^\s#]+(\s+#[^\s#]+)*$/

function fatiarFicha(linha: string): { rotulo: string; valor: string }[] {
  return linha
    .split('|')
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const comDoisPontos = /^([^:]{1,32}):\s*(.+)$/.exec(parte)
      if (comDoisPontos) return { rotulo: comDoisPontos[1].trim(), valor: comDoisPontos[2].trim() }
      // "CALENDARIO EDITORIAL - Semana 4, Qua"
      const comTravessao = /^([^a-zà-ÿ]{2,40}?)\s+[-–]\s+(.+)$/.exec(parte)
      if (comTravessao) return { rotulo: comTravessao[1].trim(), valor: comTravessao[2].trim() }
      return { rotulo: '', valor: parte }
    })
}

export function lerDescricao(descricao?: string | null): BlocoDaPauta[] {
  const texto = (descricao ?? '').replace(/\r\n?/g, '\n').trim()
  if (!texto) return []

  const linhas = texto.split('\n')
  const blocos: BlocoDaPauta[] = []
  let paragrafo: string[] = []
  let itens: ItemDaPauta[] = []

  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: 'paragrafo', texto: paragrafo.join('\n') })
    paragrafo = []
  }
  const fecharItens = () => {
    if (itens.length) blocos.push({ tipo: 'itens', itens })
    itens = []
  }
  const fecharTudo = () => { fecharItens(); fecharParagrafo() }

  linhas.forEach((bruta, indice) => {
    const linha = bruta.trim()
    if (!linha) { fecharTudo(); return }

    // A primeira linha costuma ser o cabeçalho do calendário editorial.
    if (indice === 0 && linha.includes('|')) {
      blocos.push({ tipo: 'ficha', itens: fatiarFicha(linha) })
      return
    }
    if (linha.startsWith('>>') || linha.startsWith('> ')) {
      fecharTudo()
      blocos.push({ tipo: 'nota', texto: linha.replace(/^>+\s*/, '') })
      return
    }
    if (SO_HASHTAGS.test(linha)) {
      fecharTudo()
      blocos.push({ tipo: 'hashtags', tags: linha.split(/\s+/) })
      return
    }
    if (TITULO.test(linha) && TEM_LETRA.test(linha)) {
      fecharTudo()
      blocos.push({ tipo: 'titulo', texto: linha })
      return
    }
    const item = ITEM.exec(linha)
    if (item) {
      fecharParagrafo()
      itens.push({ marcador: item[1].trim(), texto: item[2].trim() })
      return
    }
    fecharItens()
    paragrafo.push(linha)
  })

  fecharTudo()
  return blocos
}
