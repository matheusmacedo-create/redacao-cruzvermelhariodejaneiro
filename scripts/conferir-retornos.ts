/**
 * Confere as regras do beta (retornos da equipe): `npx tsx scripts/conferir-retornos.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import { aparelhoDoAgente, avisaNaHora, contextoLegivel, lerContexto, lerRetorno, maisUteis, menosUteis, resumoPorTela } from '../lib/ajuda/retornos'

let falhas = 0
function igual<T>(obtido: T, esperado: T, rotulo: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.error(`✗ ${rotulo}\n   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
  }
}

// Aparelho.
igual(aparelhoDoAgente('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), { navegador: 'Chrome', sistema: 'Android' }, 'Chrome no Android')
igual(aparelhoDoAgente('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), { navegador: 'Safari', sistema: 'iOS' }, 'Safari no iPhone')
igual(aparelhoDoAgente('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'), { navegador: 'Edge', sistema: 'Windows' }, 'Edge no Windows')
igual(aparelhoDoAgente(''), { navegador: 'Outro', sistema: 'Outro' }, 'vazio')

// Contexto.
igual(lerContexto({ largura: 390.4, altura: 844, celular: true, navegador: 'Chrome', lixo: 'x', idioma: 42 }), { largura: 390, altura: 844, celular: true, navegador: 'Chrome' }, 'contexto limpo')
igual(lerContexto('texto'), {}, 'contexto inválido')
igual(contextoLegivel({ largura: 390, altura: 844, celular: true, navegador: 'Chrome', sistema: 'Android' }), 'Celular · 390×844 · Chrome no Android', 'contexto legível')

// Leitura.
igual(lerRetorno({ tipo: 'tela', caminho: '/financeiro/compras?aba=cotar#x' }).erro, 'Escolha uma nota de 1 a 5.', 'tela sem nota')
const tela = lerRetorno({ tipo: 'tela', caminho: '/financeiro/compras?aba=cotar', nota: 2, texto: '  confuso  ', util: true, pergunta_id: 'x' }).retorno
igual([tela?.caminho, tela?.nota, tela?.texto, tela?.util, tela?.pergunta_id], ['/financeiro/compras', 2, 'confuso', null, null], 'tela: sem query, sem campos de outro tipo')
igual(lerRetorno({ tipo: 'pergunta', caminho: '/ajuda', pergunta_id: 'Com Espaço', util: true }).erro, 'Voto inválido.', 'id de pergunta estranho')
igual(lerRetorno({ tipo: 'problema', caminho: '/x', texto: ' ' }).erro, 'Conte o que aconteceu.', 'problema sem texto')
igual(lerRetorno({ tipo: 'duvida', caminho: '/x', texto: 'ok' }).erro, 'Escreva a sua dúvida.', 'dúvida curta demais')
igual(lerRetorno({ tipo: 'elogio', caminho: '/x' }).retorno?.tipo, 'elogio', 'elogio pode ir sem texto')
igual(lerRetorno({ tipo: 'hack', caminho: '/x' }).erro, 'Tipo de retorno inválido.', 'tipo inválido')
igual(lerRetorno({ tipo: 'elogio', caminho: 'https://fora' }).erro, 'Tela inválida.', 'caminho de fora')

// Quem avisa na hora.
igual(avisaNaHora({ tipo: 'tela', nota: 2, util: null, texto: null }), true, 'nota 2 avisa')
igual(avisaNaHora({ tipo: 'tela', nota: 4, util: null, texto: 'boa' }), false, 'nota 4 não avisa')
igual(avisaNaHora({ tipo: 'pergunta', nota: null, util: false, texto: null }), false, '"não ajudou" sem texto não avisa')
igual(avisaNaHora({ tipo: 'pergunta', nota: null, util: false, texto: 'faltou o exemplo' }), true, '"não ajudou" com o que faltou avisa')
igual(avisaNaHora({ tipo: 'problema', nota: null, util: null, texto: 'x' }), true, 'problema avisa')

// Resumo por tela.
const r = resumoPorTela([
  { tipo: 'tela', caminho: '/a', nota: 5, estado: 'novo', created_at: '' },
  { tipo: 'tela', caminho: '/a', nota: 4, estado: 'resolvido', created_at: '' },
  { tipo: 'tela', caminho: '/b', nota: 1, estado: 'novo', created_at: '' },
  { tipo: 'problema', caminho: '/b', nota: null, estado: 'em_analise', created_at: '' },
  { tipo: 'pergunta', caminho: '/ajuda', nota: null, estado: 'novo', created_at: '' },
  { tipo: 'sugestao', caminho: '/c', nota: null, estado: 'novo', created_at: '' },
])
igual(r, [
  { caminho: '/b', opinioes: 1, media: 1, negativas: 1, abertos: 2 },
  { caminho: '/a', opinioes: 2, media: 4.5, negativas: 0, abertos: 1 },
  { caminho: '/c', opinioes: 0, media: null, negativas: 0, abertos: 1 },
], 'pior tela primeiro; voto em pergunta não conta como tela')

// Mais e menos úteis.
const votos = [
  { area: '/pautas', pergunta_id: 'a', sim: 5, nao: 0 },
  { area: '/pautas', pergunta_id: 'b', sim: 1, nao: 4 },
  { area: '/envios', pergunta_id: 'c', sim: 3, nao: 1 },
  { area: null, pergunta_id: 'd', sim: 9, nao: 0 },
]
igual(maisUteis(votos, [{ area: '/envios', id: 'c' }, { area: '/compras', id: 'x' }], 4), [
  { area: '/pautas', id: 'a', sim: 5 }, { area: '/envios', id: 'c', sim: 3 }, { area: '/pautas', id: 'b', sim: 1 }, { area: '/compras', id: 'x', sim: 0 },
], 'votos primeiro, depois as escolhidas sem repetir; sem área fica fora')
igual(menosUteis(votos).map((v) => v.pergunta_id), ['b', 'c'], 'as que não ajudaram')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('Beta (retornos): tudo certo.')
