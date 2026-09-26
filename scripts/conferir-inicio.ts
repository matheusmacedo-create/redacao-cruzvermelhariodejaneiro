/**
 * Confere as regras do Início modular: `npx tsx scripts/conferir-inicio.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import { ORDEM_PADRAO, alternar, arrumacaoPadrao, ehPadrao, faixas, lerArrumacao, levarPara, mover } from '../lib/inicio/blocos'

let falhas = 0
function igual<T>(obtido: T, esperado: T, rotulo: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.error(`✗ ${rotulo}\n   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
  }
}
const ids = (a: { id: string }[]) => a.map((b) => b.id)

// Leitura.
igual(ids(lerArrumacao(null)), ORDEM_PADRAO, 'nada guardado: a padrão')
igual(ids(lerArrumacao([])), ORDEM_PADRAO, 'lista vazia: a padrão')
igual(ids(lerArrumacao('lixo')), ORDEM_PADRAO, 'lixo: a padrão')
const lida = lerArrumacao([{ id: 'indicadores' }, { id: 'abertura', visivel: false }, { id: 'naoexiste' }, { id: 'indicadores' }])
igual(ids(lida).filter((id) => id === 'indicadores' || id === 'abertura'), ['indicadores', 'abertura'], 'mantém a ordem guardada e ignora repetido e desconhecido')
igual(ids(lida).slice(0, 3), ['indicadores', 'areas', 'abertura'], 'o que faltava entra depois do vizinho da ordem padrão')
igual(lida.find((b) => b.id === 'abertura')?.visivel, false, 'escondido continua escondido')
igual(lida.length, ORDEM_PADRAO.length, 'blocos que faltavam entram')
igual(lida.filter((b) => b.id !== 'abertura').every((b) => b.visivel), true, 'bloco novo entra visível')
// Bloco novo entra depois do vizinho da ordem padrão.
const semTempo = lerArrumacao(ORDEM_PADRAO.filter((id) => id !== 'tempo').map((id) => ({ id })))
igual(ids(semTempo), ORDEM_PADRAO, 'bloco novo entra no lugar dele')
const invertida = lerArrumacao([{ id: 'areas' }, { id: 'abertura' }])
igual(ids(invertida).slice(0, 3), ['areas', 'abertura', 'esperando'], 'bloco novo entra depois do vizinho que já está')

// Mover, levar, alternar.
const p = arrumacaoPadrao()
igual(ids(mover(p, 'pautas', -1)).slice(0, 3), ['abertura', 'pautas', 'esperando'], 'sobe um')
igual(ids(mover(p, 'abertura', -1)), ORDEM_PADRAO, 'o primeiro não sobe')
igual(ids(mover(p, 'areas', 1)), ORDEM_PADRAO, 'o último não desce')
igual(ids(levarPara(p, 'indicadores', 'abertura')).slice(0, 2), ['indicadores', 'abertura'], 'arrastar para o topo')
igual(ids(levarPara(p, 'abertura', 'areas')).slice(-2), ['areas', 'abertura'], 'arrastar para o fim')
igual(alternar(p, 'tempo').find((b) => b.id === 'tempo')?.visivel, false, 'esconder')
igual(ehPadrao(p), true, 'padrão é padrão')
igual(ehPadrao(mover(p, 'pautas', -1)), false, 'mexida não é padrão')

// Faixas.
igual(faixas(p), [
  { tipo: 'inteiro', id: 'abertura' },
  { tipo: 'colunas', largos: ['esperando', 'pautas', 'projetos'], estreitos: ['hoje', 'tempo', 'equipe'] },
  { tipo: 'inteiro', id: 'semana' }, { tipo: 'inteiro', id: 'indicadores' }, { tipo: 'inteiro', id: 'areas' },
], 'a padrão reproduz o Início de sempre')
// Arrumação completa, como a tela guarda: tempo, indicadores, pautas, equipe e o resto; a abertura escondida.
const misturada = lerArrumacao(['tempo', 'indicadores', 'pautas', 'equipe', 'abertura', 'esperando', 'projetos', 'hoje', 'semana', 'areas']
  .map((id) => ({ id, visivel: id !== 'abertura' })))
igual(faixas(misturada).slice(0, 3), [
  { tipo: 'colunas', largos: [], estreitos: ['tempo'] },
  { tipo: 'inteiro', id: 'indicadores' },
  { tipo: 'colunas', largos: ['pautas', 'esperando', 'projetos'], estreitos: ['equipe', 'hoje'] },
], 'um bloco inteiro separa as colunas; escondido não aparece')
igual(faixas(p.map((b) => ({ ...b, visivel: false }))), [], 'tudo escondido: nenhuma faixa')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('Início modular: tudo certo.')
