/**
 * Confere as regras das perguntas das oportunidades (lib/oportunidades/perguntas.ts)
 * e a leitura do formulário nos tipos de resposta (lib/oportunidades/regras.ts).
 *
 *   npx tsx scripts/conferir-perguntas.ts
 */
import { estatisticas, faltando, lerPerguntas, lerRespostas, respostaLegivel, resultadoDoQuiz, type Pergunta } from '../lib/oportunidades/perguntas'
import { ehDeResposta, estadoDoPedido, lerOportunidade } from '../lib/oportunidades/regras'

let falhas = 0
const conferir = (nome: string, ok: boolean, detalhe?: unknown) => {
  if (!ok) { falhas++; console.log(`FALHA: ${nome}`, detalhe ?? '') } else console.log(`ok: ${nome}`)
}

// ---------------------------------------------------------------- lerPerguntas
const enquete = lerPerguntas(JSON.stringify([
  { enunciado: 'Tamanho da camiseta?', tipo: 'unica', alternativas: ['P', ' M ', '', 'G'] },
  { enunciado: 'Precisa de transporte?', tipo: 'sim_nao', corretas: [0] },
  { enunciado: 'Comentário', tipo: 'texto', obrigatoria: false },
]), 'enquete')
conferir('enquete válida', enquete.erros.length === 0, enquete.erros)
conferir('alternativa vazia sai e o resto é aparado', JSON.stringify(enquete.perguntas[0].alternativas) === '["P","M","G"]', enquete.perguntas[0].alternativas)
conferir('fora do quiz, "corretas" é ignorado', enquete.perguntas.every((p) => p.corretas === null))
conferir('obrigatória por padrão; texto opcional', enquete.perguntas[0].obrigatoria && !enquete.perguntas[2].obrigatoria)
conferir('enquete sem pergunta: recusada', lerPerguntas('[]', 'enquete').erros[0] === 'A enquete precisa de pelo menos uma pergunta.')
conferir('aviso sem pergunta: aceito', lerPerguntas('[]', 'aviso').erros.length === 0)
conferir('escolha com 1 alternativa: recusada', lerPerguntas([{ enunciado: 'Turno?', tipo: 'unica', alternativas: ['Manhã'] }], 'acao').erros[0]?.includes('de 2 a 10'))
conferir('enunciado curto: recusado', lerPerguntas([{ enunciado: 'Oi', tipo: 'texto' }], 'acao').erros[0]?.includes('enunciado'))
conferir('JSON quebrado: recusado', lerPerguntas('{', 'acao').erros[0] === 'Perguntas inválidas.')

const quiz = lerPerguntas([
  { enunciado: 'Número do SAMU?', tipo: 'unica', alternativas: ['190', '192'], corretas: [1] },
  { enunciado: 'Sinais de AVC?', tipo: 'multipla', alternativas: ['Boca torta', 'Febre', 'Fala enrolada'], corretas: [2, 0, 2] },
  { enunciado: 'Comentário', tipo: 'texto' },
], 'quiz')
conferir('quiz válido', quiz.erros.length === 0, quiz.erros)
conferir('certas sem repetição e em ordem', JSON.stringify(quiz.perguntas[1].corretas) === '[0,2]')
conferir('texto no quiz não vale nota', quiz.perguntas[2].corretas === null)
conferir('quiz sem certa: recusado', lerPerguntas([{ enunciado: 'Número do SAMU?', tipo: 'unica', alternativas: ['190', '192'] }], 'quiz').erros[0]?.includes('marque a resposta certa'))
conferir('única com 2 certas: recusada', lerPerguntas([{ enunciado: 'Número do SAMU?', tipo: 'unica', alternativas: ['190', '192'], corretas: [0, 1] }], 'quiz').erros[0]?.includes('só uma'))
conferir('certa fora da lista: descartada e recusada', lerPerguntas([{ enunciado: 'Número do SAMU?', tipo: 'unica', alternativas: ['190', '192'], corretas: [5] }], 'quiz').erros[0]?.includes('marque'))
conferir('quiz só com texto: recusado', lerPerguntas([{ enunciado: 'Comente', tipo: 'texto' }], 'quiz').erros[0]?.includes('pelo menos uma pergunta com resposta certa'))

// ---------------------------------------------------------------- respostas
const comId = enquete.perguntas.map((p, i) => ({ ...p, id: `p${i}` })) as (Pergunta & { id: string })[]
conferir('falta a obrigatória', faltando(comId, [{ p: 'p1', e: [0] }])?.id === 'p0')
conferir('opcional em branco não falta', faltando(comId, [{ p: 'p0', e: [1] }, { p: 'p1', e: [1] }]) === null)
conferir('lerRespostas descarta lixo', JSON.stringify(lerRespostas([{ p: 'a', e: [1, 'x', -1] }, { p: 2 }, null, { p: 'b', t: 'oi' }])) === '[{"p":"a","e":[1]},{"p":"b","t":"oi"}]')
conferir('resposta legível', respostaLegivel(comId[0], { p: 'p0', e: [0, 2] }) === 'P; G' && respostaLegivel(comId[1], { p: 'p1', e: [1] }) === 'Não')

const est = estatisticas(comId, [
  [{ p: 'p0', e: [1] }, { p: 'p1', e: [0] }, { p: 'p2', t: 'Ótimo' }],
  [{ p: 'p0', e: [1] }, { p: 'p1', e: [1] }],
  [{ p: 'p0', e: [2] }, { p: 'p1', e: [0] }, { p: 'p2', t: '  ' }],
])
const tamanho = est[0]
conferir('estatística: M com 2 de 3 = 67%', tamanho.tipo !== 'texto' && tamanho.opcoes[1].votos === 2 && tamanho.opcoes[1].pct === 67, tamanho)
conferir('estatística: textos em branco não contam', est[2].tipo === 'texto' && est[2].responderam === 1)

conferir('resultado aprovado', resultadoDoQuiz({ nota: 67, acertos: 2, total: 3, aprovado: true, tentativas: 1, minima: 60 }) === 'Você foi aprovado, com nota 67 (2 de 3 acertos).')
conferir('resultado com tentativas', resultadoDoQuiz({ nota: 0, acertos: 0, total: 3, aprovado: false, tentativas: 1, minima: 70 }).endsWith('Você ainda tem 2 tentativas.'))
conferir('resultado sem tentativas', resultadoDoQuiz({ nota: 0, acertos: 0, total: 3, aprovado: false, tentativas: 3, minima: 70 }).endsWith('As 3 tentativas acabaram.'))

// ---------------------------------------------------------------- formulário
const agora = new Date('2026-09-26T15:00:30Z')
const f = (campos: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(campos)) d.set(k, v); return d }
const aviso = lerOportunidade(f({ titulo: 'Reunião geral', tipo: 'aviso', fim: '2026-10-01T18:00', vagas: '10', horas: '4' }), agora)
conferir('aviso: abre agora (minuto cheio) e ignora vagas/horas', aviso.dados?.inicio === '2026-09-26T15:00:00.000Z' && aviso.dados.vagas === null && aviso.dados.horas === null, aviso)
conferir('aviso sem prazo: recusado', lerOportunidade(f({ titulo: 'Reunião geral', tipo: 'aviso' }), agora).erros.includes('Informe o prazo para responder.'))
conferir('quiz: nota mínima padrão 70', lerOportunidade(f({ titulo: 'Quiz de socorro', tipo: 'quiz', fim: '2026-10-01T18:00' }), agora).dados?.nota_minima === 70)
conferir('quiz: nota 150 recusada', lerOportunidade(f({ titulo: 'Quiz de socorro', tipo: 'quiz', fim: '2026-10-01T18:00', nota_minima: '150' }), agora).erros[0] === 'Nota mínima: de 1 a 100.')
conferir('ação continua pedindo início e fim', lerOportunidade(f({ titulo: 'Ação no Maracanã', tipo: 'acao' }), agora).erros.includes('Informe início e fim.'))
conferir('ação não guarda nota mínima', lerOportunidade(f({ titulo: 'Ação no Maracanã', tipo: 'acao', inicio: '2026-10-01T08:00', fim: '2026-10-01T12:00', nota_minima: '50' }), agora).dados?.nota_minima === null)
conferir('ehDeResposta', ehDeResposta('quiz') && ehDeResposta('aviso') && !ehDeResposta('acao') && !ehDeResposta(null))
conferir('estado do pedido', estadoDoPedido({ inicio: '2026-09-27T00:00:00Z', fim: '2026-09-30T00:00:00Z', cancelada_em: null }, agora) === 'agendado'
  && estadoDoPedido({ inicio: '2026-09-20T00:00:00Z', fim: '2026-09-30T00:00:00Z', cancelada_em: null }, agora) === 'aberto'
  && estadoDoPedido({ inicio: '2026-09-20T00:00:00Z', fim: '2026-09-25T00:00:00Z', cancelada_em: null }, agora) === 'encerrado')

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo ok')
process.exit(falhas ? 1 : 0)
