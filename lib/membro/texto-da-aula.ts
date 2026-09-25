/**
 * O texto de uma aula (ou a descrição de um curso) em blocos para exibir:
 * parágrafos, subtítulos e listas. A equipe escreve texto puro no editor do
 * curso — nunca HTML —, então isto só reconhece o que qualquer pessoa digita:
 *
 * - linha em branco separa parágrafos; quebra simples continua no parágrafo;
 * - linha que começa com "1." / "1)" vira lista numerada; com "-" ou "•", lista;
 * - linha curta que termina em ":", sem pontuação de frase no meio e com
 *   algo depois, vira subtítulo ("Passos:"). "Em caso de dúvida, ligue:" é
 *   frase e continua parágrafo.
 *
 * Puro (sem React): conferido com um script `npx tsx`. Quem desenha é
 * `components/membro/texto-da-aula.tsx`.
 */

export type BlocoDoTexto =
  | { tipo: 'paragrafo'; linhas: string[] }
  | { tipo: 'subtitulo'; texto: string }
  | { tipo: 'lista'; ordenada: false; itens: string[] }
  | { tipo: 'lista'; ordenada: true; inicio: number; itens: string[] }

// Até 3 dígitos: "2026. Foi o ano…" é frase, não item de lista.
const NUMERADO = /^(\d{1,3})[.)]\s+(\S.*)$/
// Hífen ou marcador. O travessão (—) fica de fora: em português abre fala.
const MARCADO = /^[-•]\s+(\S.*)$/
// Subtítulo é rótulo, não frase: mais longo que isso, ou com vírgula/ponto no
// meio, é um parágrafo que por acaso termina em dois-pontos.
const MAX_SUBTITULO = 60
const PONTUACAO_DE_FRASE = /[.,;!?]/

type Linha = { tipo: 'numerado'; numero: number; texto: string } | { tipo: 'marcado'; texto: string } | { tipo: 'texto'; texto: string }

function classificar(linha: string): Linha {
  const n = linha.match(NUMERADO)
  if (n) return { tipo: 'numerado', numero: Number(n[1]), texto: n[2] }
  const m = linha.match(MARCADO)
  if (m) return { tipo: 'marcado', texto: m[1] }
  return { tipo: 'texto', texto: linha }
}

export function blocosDoTexto(texto: string | null | undefined): BlocoDoTexto[] {
  if (!texto) return []
  // Espaços nas pontas e espaços repetidos no meio não mudam o sentido; tabulação vira espaço.
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[\t ]+/g, ' ').trim())
  // Índice da última linha com conteúdo: subtítulo no fim do texto não tem o que apresentar.
  let ultima = linhas.length - 1
  while (ultima >= 0 && !linhas[ultima]) ultima--

  const blocos: BlocoDoTexto[] = []
  const atual = () => blocos[blocos.length - 1]
  // Linha em branco fecha o bloco aberto: o próximo parágrafo ou lista começa do zero.
  let fechado = true

  linhas.forEach((bruta, i) => {
    if (!bruta) { fechado = true; return }
    const l = classificar(bruta)
    const ultimo = fechado ? undefined : atual()
    fechado = false

    if (l.tipo === 'numerado') {
      if (ultimo?.tipo === 'lista' && ultimo.ordenada) ultimo.itens.push(l.texto)
      else blocos.push({ tipo: 'lista', ordenada: true, inicio: l.numero, itens: [l.texto] })
      return
    }
    if (l.tipo === 'marcado') {
      if (ultimo?.tipo === 'lista' && !ultimo.ordenada) ultimo.itens.push(l.texto)
      else blocos.push({ tipo: 'lista', ordenada: false, itens: [l.texto] })
      return
    }
    if (l.texto.endsWith(':') && l.texto.length <= MAX_SUBTITULO && i < ultima) {
      const titulo = l.texto.replace(/\s*:+$/, '')
      if (titulo && !PONTUACAO_DE_FRASE.test(titulo)) {
        blocos.push({ tipo: 'subtitulo', texto: titulo })
        // O que vem logo abaixo do subtítulo começa bloco novo, mesmo sem linha em branco.
        fechado = true
        return
      }
    }
    if (ultimo?.tipo === 'paragrafo') ultimo.linhas.push(l.texto)
    else blocos.push({ tipo: 'paragrafo', linhas: [l.texto] })
  })
  return blocos
}

/**
 * Texto que passa de umas quatro linhas na largura do celular: a descrição do
 * curso começa recolhida ("Ler mais"). É só o palpite do servidor, para o
 * botão já vir no HTML; no navegador, quem decide é a medida de verdade.
 */
export const textoLongo = (texto: string | null | undefined) => !!texto && (texto.length > 280 || texto.split(/\n\s*\n/).length > 2)
