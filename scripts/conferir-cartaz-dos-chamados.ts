// Conferência das regras do cartaz com QR dos chamados (lib/chamados/cartaz.ts).
// Rode com: npx tsx scripts/conferir-cartaz-dos-chamados.ts
import { destinoSeguro, ehSlugDaFila, formularioDaFila, linkDoCartaz } from '../lib/chamados/cartaz'

let falhas = 0
const igual = (obtido: unknown, esperado: unknown, nome: string) => {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.error(`FALHOU: ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`) }
}

igual(linkDoCartaz('https://palacio.cruzvermelhariodejaneiro.org/', 'ti'), 'https://palacio.cruzvermelhariodejaneiro.org/chamado?fila=ti', 'link do QR sem barra dobrada')
igual(formularioDaFila('manutencao'), '/chamados/novo?fila=manutencao', 'formulário da fila')
igual(ehSlugDaFila('ti'), true, 'slug válido')
igual(ehSlugDaFila('TI'), false, 'maiúscula não é slug')
igual(ehSlugDaFila('a'), false, 'curto demais')
igual(ehSlugDaFila('../x'), false, 'caminho não é slug')
igual(ehSlugDaFila(null), false, 'vazio não é slug')

igual(destinoSeguro('/chamados/novo?fila=ti'), '/chamados/novo?fila=ti', 'volta para o formulário')
igual(destinoSeguro('//exemplo.com'), null, 'recusa outro site (//)')
igual(destinoSeguro('/\\exemplo.com'), null, 'recusa outro site (/\\)')
igual(destinoSeguro('https://exemplo.com'), null, 'recusa endereço completo')
igual(destinoSeguro('javascript:alert(1)'), null, 'recusa javascript:')
igual(destinoSeguro('/'), null, 'não volta para a entrada')
igual(destinoSeguro('/?voltar=/x'), null, 'não volta para a entrada com parâmetros')
igual(destinoSeguro('/chamados\n/x'), null, 'recusa quebra de linha')
igual(destinoSeguro('/' + 'a'.repeat(400)), null, 'recusa caminho longo demais')
igual(destinoSeguro(undefined), null, 'sem parâmetro')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('Cartaz dos chamados: tudo certo.')
