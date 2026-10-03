// Confere o mapa das traduções em inglês e as alternativas de idioma das páginas do site.
// Uso: npx tsx scripts/conferir-traducoes.ts
import { alternativasDaPagina, caminhoEmIngles } from '../lib/site/traducoes'
import mapa from '../lib/site/traducoes-en.json'

let erros = 0
const falha = (m: string) => { erros++; console.error('✗', m) }

for (const [pt, en] of Object.entries(mapa as Record<string, string>)) {
  if (!pt.startsWith('/noticias/') || !pt.endsWith('/')) falha(`caminho em português fora do padrão: ${pt}`)
  if (!en.startsWith('/en/news/') || !en.endsWith('/')) falha(`caminho em inglês fora do padrão: ${en}`)
}
const alt = alternativasDaPagina('/noticias/7-de-setembro/', 'https://cruzvermelhariodejaneiro.org/')
if (!alt || alt.length !== 3) falha('matéria com par deveria ter 3 alternativas')
else {
  const por = Object.fromEntries(alt.map((a) => [a.hreflang, a.url]))
  if (por['pt-BR'] !== 'https://cruzvermelhariodejaneiro.org/noticias/7-de-setembro/') falha(`pt-BR errado: ${por['pt-BR']}`)
  if (por['x-default'] !== por['pt-BR']) falha('x-default deve ser o português')
  if (!por.en?.startsWith('https://cruzvermelhariodejaneiro.org/en/news/')) falha(`en errado: ${por.en}`)
}
if (alternativasDaPagina('/noticias/materia-sem-traducao/', 'https://cruzvermelhariodejaneiro.org') !== null) falha('matéria sem par não pode declarar hreflang')
if (caminhoEmIngles('/noticias/') !== '/en/news/') falha('o índice deve apontar para /en/news/')

console.log(erros ? `${erros} erro(s)` : `ok: ${Object.keys(mapa).length} pares + índice`)
process.exit(erros ? 1 : 0)
