/**
 * Confere os cursos da Escola no Marketing: `npx tsx scripts/conferir-cursos-escola.ts`.
 * Os nomes de produto são os que a Únicopag mandou de verdade (27/09/2026).
 */
import { chave, conversao, cursoNoProduto, destinoDoProduto, ehProdutoDeTeste, numerosPorCurso, sinalDoCurso, type Classificacao, type Compra } from '../lib/escola/cursos'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}

igual(chave('  Punção   Venosa '), 'puncao venosa', 'chave sem acento e espaço')
igual(cursoNoProduto('Taxa de inscrição — Punção Venosa'), 'puncao venosa', 'prefixo da taxa de inscrição')
igual(cursoNoProduto('Punção Venosa — Inscrição'), 'puncao venosa', 'sufixo da inscrição')
igual(cursoNoProduto('Primeiros Socorros Básico — Inscrição + Custos de processamento (opcional)'), 'primeiros socorros basico', 'sufixo longo')
igual(cursoNoProduto('Primeiros Socorros Lei Lucas - Ambientes com Crianças — Inscrição'), 'primeiros socorros lei lucas - ambientes com criancas', 'hífen do nome fica')
igual(cursoNoProduto('Bombeiro Civil'), 'bombeiro civil', 'nome puro')

for (const t of ['TESTE A 1real PIX', 'Curso para Testes - DEV', 'Teste (UnicoPag)', 'Nome do produto', 'TESTE de integracao - nao pagar', 'Taxa de inscrição — TESTE B 10reais 2x5', 'Produto teste', 'Curso Teste']) {
  igual(ehProdutoDeTeste(t), true, `teste: ${t}`)
}
for (const t of ['Punção Venosa', 'Bombeiro Civil', 'Matrícula + Curso presencial', 'Consultoria', 'Suporte Básico de Vida']) igual(ehProdutoDeTeste(t), false, `não é teste: ${t}`)

const cursos = [
  { id: 'ps', nome: 'Primeiros Socorros Básico' }, { id: 'pv', nome: 'Punção Venosa' }, { id: 'bc', nome: 'Bombeiro Civil' },
  { id: 'll', nome: 'Primeiros Socorros Lei Lucas - Ambientes com Crianças' },
]
const sem = new Map<string, Classificacao>()
igual(destinoDoProduto('Taxa de inscrição — Punção Venosa', cursos, sem), { tipo: 'curso', cursoId: 'pv', manual: false }, 'taxa vai para o curso')
igual(destinoDoProduto('Primeiros Socorros Lei Lucas - Ambientes com Crianças — Inscrição', cursos, sem), { tipo: 'curso', cursoId: 'll', manual: false }, 'Lei Lucas não vira Primeiros Socorros Básico')
igual(destinoDoProduto('Matrícula + Curso presencial', cursos, sem), { tipo: 'sem_curso' }, 'genérico espera a equipe')
igual(destinoDoProduto('TESTE A 1real PIX', cursos, sem), { tipo: 'teste' }, 'teste fora')
igual(destinoDoProduto('', cursos, sem), { tipo: 'teste' }, 'sem nome fora')
const manual = new Map<string, Classificacao>([
  ['Matrícula + Curso presencial', { produto: 'Matrícula + Curso presencial', curso_id: 'bc', ignorado: false }],
  ['Punção Venosa', { produto: 'Punção Venosa', curso_id: null, ignorado: true }],
])
igual(destinoDoProduto('Matrícula + Curso presencial', cursos, manual), { tipo: 'curso', cursoId: 'bc', manual: true }, 'a equipe associou')
igual(destinoDoProduto('Punção Venosa', cursos, manual), { tipo: 'ignorado' }, 'a decisão da equipe manda sobre o nome')

const agora = new Date('2026-09-27T12:00:00Z')
const compra = (produto: string, pessoa: string, pagou: boolean, recebido = 0, primeira_paga: string | null = null): Compra =>
  ({ produto, pessoa, pagou, recebido, pagamentos: pagou ? 1 : 0, primeira_paga, ultima: '2026-09-20T12:00:00Z' })
const compras: Compra[] = [
  compra('Primeiros Socorros Básico', 'ana', true, 28000, '2026-09-20T12:00:00Z'),
  compra('Taxa de inscrição — Primeiros Socorros Básico', 'ana', true, 9900, '2026-09-19T12:00:00Z'),
  compra('Primeiros Socorros Básico', 'bia', false),
  compra('Primeiros Socorros Básico — Inscrição', 'caio', true, 9900, '2026-07-01T12:00:00Z'),
  compra('Primeiros Socorros Básico', 'caio', false),
  compra('Punção Venosa', 'davi', false),
  compra('TESTE A 1real PIX', 'eva', true, 100, '2026-09-01T12:00:00Z'),
  compra('Matrícula + Curso presencial', 'fabio', true, 60, '2026-08-22T12:00:00Z'),
  compra('Matrícula + Curso presencial', 'gil', false),
]
const r = numerosPorCurso(compras, cursos, sem, agora)
const ps = r.numerosDe('ps')
igual([ps.alunos, ps.alunos30, ps.interessados, ps.receita, ps.pagamentos], [2, 1, 1, 47800, 3], 'Primeiros Socorros: Ana conta uma vez, Caio pagou a inscrição, Bia é interessada')
igual(ps.produtos.length, 3, 'os três nomes do produto no curso')
igual([r.numerosDe('pv').alunos, r.numerosDe('pv').interessados], [0, 1], 'Punção: só um interessado')
igual(r.numerosDe('bc').alunos, 0, 'Bombeiro sem nada')
igual(r.alunosNoTotal, 2, 'alunos distintos em todos os cursos (teste e solto fora)')
igual(r.produtosSoltos.map((s) => [s.produto, s.pessoas, s.alunos, s.destino.tipo]), [['Matrícula + Curso presencial', 2, 1, 'sem_curso'], ['TESTE A 1real PIX', 1, 1, 'teste']], 'produtos soltos')
const comMapa = numerosPorCurso(compras, cursos, manual, agora)
igual([comMapa.numerosDe('bc').alunos, comMapa.numerosDe('bc').interessados], [1, 1], 'associado pela equipe conta no curso')
igual(comMapa.numerosDe('pv').interessados, 0, 'produto ignorado não conta')

igual(conversao({ alunos: 2, interessados: 2 }), 0.5, 'conversão')
igual(conversao({ alunos: 0, interessados: 0 }), null, 'sem tentativa')
igual(sinalDoCurso({ alunos: 1, alunos30: 0, interessados: 5 }, { campanhasNoAr: 1, pecas: 3 }, true)?.tom, 'oportunidade', 'muita gente tentou')
igual(sinalDoCurso({ alunos: 31, alunos30: 9, interessados: 17 }, { campanhasNoAr: 0, pecas: 0 }, true)?.tom, 'oportunidade', 'muitos interessados, mesmo com boa conversão')
igual(sinalDoCurso({ alunos: 31, alunos30: 9, interessados: 17 }, { campanhasNoAr: 0, pecas: 0 }, true)?.texto.startsWith('17 pessoas'), true, 'o remarketing vem antes')
igual(sinalDoCurso({ alunos: 0, alunos30: 0, interessados: 0 }, { campanhasNoAr: 0, pecas: 0 }, true)?.tom, 'atencao', 'curso parado')
igual(sinalDoCurso({ alunos: 10, alunos30: 4, interessados: 1 }, { campanhasNoAr: 0, pecas: 0 }, true)?.tom, 'oportunidade', 'vende sem marketing')
igual(sinalDoCurso({ alunos: 10, alunos30: 4, interessados: 1 }, { campanhasNoAr: 2, pecas: 6 }, true)?.tom, 'ok', 'indo bem')
igual(sinalDoCurso({ alunos: 10, alunos30: 4, interessados: 1 }, { campanhasNoAr: 2, pecas: 6 }, false), null, 'curso inativo sem sinal')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('Cursos da Escola: tudo certo.')
