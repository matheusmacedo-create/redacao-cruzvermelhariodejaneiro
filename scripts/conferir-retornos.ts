/**
 * Confere as regras do beta (retornos da equipe): `npx tsx scripts/conferir-retornos.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import { aparelhoDoAgente, avisaNaHora, contextoLegivel, lerContexto, lerRetorno, linkDaCorrecao, maisUteis, mensagemDeErro, menosUteis, ramoDoErro, resumoPorTela } from '../lib/ajuda/retornos'

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

// "Achei um erro" (docs/AJUDA.md §17): as mensagens, o código do erro e a versão.
igual(lerContexto({ erros: ['/a — um', 42, '  ', '/b —\n dois', '/c — três', '/d — quatro'] }).erros, ['/b — dois', '/c — três', '/d — quatro'], 'erros: só texto, sem quebra de linha, os três últimos')
igual(lerContexto({ erros: ['x'.repeat(500)] }).erros?.[0].length, 240, 'erro cortado em 240')
igual(lerContexto({ erros: [] }).erros, undefined, 'lista de erros vazia não vai')
igual(lerContexto({ erros: 'não é lista' }).erros, undefined, 'erros que não são lista')
igual(lerContexto({ digest: '2348761234' }).digest, '2348761234', 'digest')
igual(lerContexto({ digest: '<script>' }).digest, undefined, 'digest estranho fica de fora')
igual(lerContexto({ versao: '3bb0897f00aa' }).versao, '3bb0897', 'versão em 7 caracteres')
igual(lerContexto({ versao: 'main' }).versao, undefined, 'versão que não é commit')
igual(mensagemDeErro(new TypeError("Cannot read properties of undefined (reading 'map')")), "TypeError: Cannot read properties of undefined (reading 'map')", 'erro com o tipo')
igual(mensagemDeErro(new Error('Falhou')), 'Falhou', 'Error sem repetir o tipo')
igual(mensagemDeErro('Script error.'), null, 'erro de outro site')
igual(mensagemDeErro('ResizeObserver loop completed with undelivered notifications.'), null, 'aviso do ResizeObserver')
igual(mensagemDeErro('x is not defined', 'chrome-extension://abc/content.js'), null, 'erro de extensão')
igual(mensagemDeErro({ message: 'The operation was aborted.' }), null, 'navegação cancelada')
igual(mensagemDeErro(null), null, 'sem mensagem')
igual(mensagemDeErro(new Error('An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.')), 'Erro no servidor ao montar a tela (a mensagem fica no registro da Vercel; veja o código do erro).', 'erro do servidor vira frase curta')
igual(ramoDoErro('1a2b3c4d-5e6f-7a8b-9c0d-112233445566'), 'claude/erro-1a2b3c4d', 'ramo do erro')
igual(linkDaCorrecao('1a2b3c4d-5e6f-7a8b-9c0d-112233445566'), 'https://github.com/matheusmacedo-create/redacao-cruzvermelhariodejaneiro/pulls?q=is%3Apr%20head%3Aclaude%2Ferro-1a2b3c4d', 'link da correção')

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
igual(lerRetorno({ tipo: 'problema', caminho: '/pautas', texto: 'A tela deu erro.', contexto: { largura: 390, erros: ['/pautas — TypeError: x'], digest: 'abc123', lixo: 1 } }).retorno?.contexto, { largura: 390, erros: ['/pautas — TypeError: x'], digest: 'abc123' }, 'problema leva os erros e o código')

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
