/**
 * Confere a guarda da página de matéria (lib/site/guarda-da-pagina.ts).
 *   npx tsx scripts/conferir-guarda-da-pagina.ts
 */
import { problemasDaPagina } from '../lib/site/guarda-da-pagina'

let falhas = 0
function ok(cond: boolean, nome: string) {
  if (!cond) falhas++
  console.log(`${cond ? '✓' : '✗'} ${nome}`)
}

const pagina = (corpo: string, cabeca = '') =>
  `<!doctype html><html><head><title>Matéria</title>${cabeca}</head><body><article>${corpo}</article></body></html>`

// Passa: página limpa, e colchetes comuns e chaves continuam valendo.
ok(problemasDaPagina(pagina('<p>Texto conferido [nota] {x}.</p>')).length === 0, 'página limpa passa')

// Barra: acréscimo da IA no texto, em atributo e com um colchete só.
const noTexto = problemasDaPagina(pagina('<p>O fato. ⟦Contexto que a IA acrescentou.⟧ Mais texto.</p>'))
ok(noTexto.length === 1 && /⟦ ⟧/.test(noTexto[0]) && /Contexto que a IA/.test(noTexto[0]), `⟦ ⟧ no texto é barrado, com o trecho: ${noTexto.join('; ')}`)
ok(problemasDaPagina(pagina('<p>x</p>', '<meta name="description" content="⟦Linha fina⟧">')).length === 1, '⟦ ⟧ na linha fina (atributo) é barrado')
ok(problemasDaPagina(pagina('<p>Sobrou só o fechamento⟧</p>')).length === 1, 'colchete solto (só ⟧) é barrado')

// Não olha dentro de <script>: o JSON-LD repete o texto e já é coberto pelo que se vê.
ok(problemasDaPagina(pagina('<p>limpo</p><script type="application/ld+json">{"a":"⟦x⟧"}</script>')).length === 0, 'dentro de <script> não conta')

// As regras antigas continuam.
ok(problemasDaPagina(pagina('<p>**negrito solto</p>')).length === 1, 'negrito que não fechou continua barrado')
ok(problemasDaPagina(pagina('<img src="/api/private-blob?pathname=x">')).length === 1, 'endereço privado continua barrado')

if (falhas) {
  console.error(`\n${falhas} conferência(s) falharam.`)
  process.exit(1)
}
console.log('\nTudo certo.')
