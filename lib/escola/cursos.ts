/**
 * Os cursos da Escola no Marketing (migração 20260929070000): cada curso com
 * quantos alunos tem (pela Únicopag) e o que foi criado para ele.
 *
 * A Únicopag registra o mesmo curso com vários nomes de produto ("Punção
 * Venosa", "Punção Venosa — Inscrição", "Taxa de inscrição — Punção
 * Venosa"). Aqui eles viram um curso só; produto de teste fica de fora; o
 * que não bate sozinho ("Curso", "Matrícula") espera a equipe associar
 * (escola_produtos).
 *
 * Aluno é pessoa distinta que pagou algum produto do curso (inscrição e curso
 * contam uma vez). Interessado é quem tentou e não pagou nada do curso: o
 * público do remarketing.
 *
 * Módulo puro: conferido por scripts/conferir-cursos-escola.ts.
 */

export type Curso = { id: string; nome: string; ativo: boolean; pagina_url: string | null; descricao: string | null }
export type Classificacao = { produto: string; curso_id: string | null; ignorado: boolean }
/** Uma linha de escola_compras_por_produto: um produto e uma pessoa (código, sem dado pessoal). */
export type Compra = { produto: string; pessoa: string; pagou: boolean; recebido: number; pagamentos: number; primeira_paga: string | null; ultima: string | null }

/** A chave de comparação: sem acento, minúsculas, espaços e travessões normalizados. */
export const chave = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()

/**
 * O nome do curso dentro do nome do produto: tira "Taxa de inscrição — " do
 * começo e " — Inscrição…" do fim.
 */
export function cursoNoProduto(produto: string): string {
  return chave(produto)
    .replace(/^taxa de inscricao\s*-\s*/, '')
    .replace(/\s+-\s+inscricao\b.*$/, '')
    .trim()
}

/** Produto de teste da integração: não conta aluno nem receita. */
export const ehProdutoDeTeste = (produto: string) =>
  /\b(teste|testes|test|dev)\b|nome do produto|nao pagar|integracao/.test(chave(produto))

export type Destino = { tipo: 'curso'; cursoId: string; manual: boolean } | { tipo: 'ignorado' } | { tipo: 'teste' } | { tipo: 'sem_curso' }

/** Para onde vai um produto: a decisão da equipe manda; depois o nome; depois o teste. */
export function destinoDoProduto(produto: string, cursos: Pick<Curso, 'id' | 'nome'>[], classificacoes: Map<string, Classificacao>): Destino {
  const c = classificacoes.get(produto)
  if (c?.ignorado) return { tipo: 'ignorado' }
  if (c?.curso_id && cursos.some((x) => x.id === c.curso_id)) return { tipo: 'curso', cursoId: c.curso_id, manual: true }
  const nome = cursoNoProduto(produto)
  const achado = nome ? cursos.find((x) => chave(x.nome) === nome) : undefined
  if (achado) return { tipo: 'curso', cursoId: achado.id, manual: false }
  if (!produto.trim() || ehProdutoDeTeste(produto)) return { tipo: 'teste' }
  return { tipo: 'sem_curso' }
}

export type NumerosDoCurso = {
  alunos: number
  /** Alunos cujo primeiro pagamento no curso foi nos últimos 30 dias. */
  alunos30: number
  interessados: number
  receita: number
  pagamentos: number
  produtos: string[]
  ultimaVenda: string | null
}

export type ProdutoSolto = { produto: string; pessoas: number; alunos: number; destino: Destino }

const vazio = (): NumerosDoCurso => ({ alunos: 0, alunos30: 0, interessados: 0, receita: 0, pagamentos: 0, produtos: [], ultimaVenda: null })

/** Soma as compras por curso. `agora` define a janela dos 30 dias. */
export function numerosPorCurso(compras: Compra[], cursos: Pick<Curso, 'id' | 'nome'>[], classificacoes: Map<string, Classificacao>, agora: Date = new Date()) {
  const limite = agora.getTime() - 30 * 86_400_000
  const porCurso = new Map<string, { pagantes: Map<string, number>; tentaram: Set<string>; n: NumerosDoCurso }>()
  const soltos = new Map<string, ProdutoSolto & { _p: Set<string>; _a: Set<string> }>()
  const todos = new Set<string>()

  for (const c of compras) {
    const destino = destinoDoProduto(c.produto, cursos, classificacoes)
    if (destino.tipo !== 'curso') {
      const s = soltos.get(c.produto) ?? { produto: c.produto, pessoas: 0, alunos: 0, destino, _p: new Set<string>(), _a: new Set<string>() }
      s._p.add(c.pessoa); if (c.pagou) s._a.add(c.pessoa)
      soltos.set(c.produto, s)
      continue
    }
    const g = porCurso.get(destino.cursoId) ?? { pagantes: new Map<string, number>(), tentaram: new Set<string>(), n: vazio() }
    g.tentaram.add(c.pessoa)
    if (!g.n.produtos.includes(c.produto)) g.n.produtos.push(c.produto)
    if (c.pagou) {
      const quando = c.primeira_paga ? new Date(c.primeira_paga).getTime() : 0
      g.pagantes.set(c.pessoa, Math.min(g.pagantes.get(c.pessoa) ?? Infinity, quando))
      g.n.receita += c.recebido
      g.n.pagamentos += c.pagamentos
      todos.add(c.pessoa)
    }
    if (c.ultima && (!g.n.ultimaVenda || c.ultima > g.n.ultimaVenda)) g.n.ultimaVenda = c.ultima
    porCurso.set(destino.cursoId, g)
  }

  const numeros = new Map<string, NumerosDoCurso>()
  for (const [id, g] of porCurso) {
    g.n.alunos = g.pagantes.size
    g.n.alunos30 = [...g.pagantes.values()].filter((t) => t >= limite).length
    g.n.interessados = [...g.tentaram].filter((p) => !g.pagantes.has(p)).length
    g.n.produtos.sort((a, b) => a.localeCompare(b, 'pt-BR'))
    numeros.set(id, g.n)
  }
  const produtosSoltos = [...soltos.values()]
    .map(({ _p, _a, ...s }) => ({ ...s, pessoas: _p.size, alunos: _a.size }))
    .sort((a, b) => b.pessoas - a.pessoas || a.produto.localeCompare(b.produto, 'pt-BR'))
  return { numeros, produtosSoltos, alunosNoTotal: todos.size, numerosDe: (id: string) => numeros.get(id) ?? vazio() }
}

/** Conversão: dos que tentaram, quantos pagaram. Sem tentativa, null. */
export const conversao = (n: Pick<NumerosDoCurso, 'alunos' | 'interessados'>) =>
  n.alunos + n.interessados ? n.alunos / (n.alunos + n.interessados) : null

export type Sinal = { tom: 'oportunidade' | 'atencao' | 'ok'; texto: string }

/**
 * Onde pôr esforço, em uma frase por curso. Olha a procura (alunos e
 * interessados) contra o que já foi feito (campanhas no ar e peças).
 */
export function sinalDoCurso(n: Pick<NumerosDoCurso, 'alunos' | 'alunos30' | 'interessados'>, feito: { campanhasNoAr: number; pecas: number }, ativo: boolean): Sinal | null {
  if (!ativo) return null
  const conv = conversao(n)
  if (n.interessados >= 10 || (n.interessados >= 3 && (conv ?? 1) < 0.5)) return { tom: 'oportunidade', texto: `${n.interessados} pessoas tentaram e não pagaram: vale remarketing e contato.` }
  if (n.alunos === 0 && feito.pecas === 0) return { tom: 'atencao', texto: 'Sem alunos e sem nada criado ainda: comece pela página do curso e um anúncio.' }
  if (n.alunos30 === 0 && n.alunos > 0 && feito.campanhasNoAr === 0) return { tom: 'atencao', texto: 'Nenhum aluno novo em 30 dias e nenhuma campanha no ar.' }
  if (n.alunos30 > 0 && feito.campanhasNoAr === 0 && feito.pecas <= 1) return { tom: 'oportunidade', texto: 'Vende quase sem marketing: uma campanha pode multiplicar.' }
  if (n.alunos30 > 0) return { tom: 'ok', texto: `${n.alunos30} ${n.alunos30 === 1 ? 'aluno novo' : 'alunos novos'} em 30 dias.` }
  return null
}
