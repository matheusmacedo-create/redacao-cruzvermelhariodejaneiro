/**
 * Confere o índice de notícias (/noticias/): as editorias e a montagem da edição.
 *   npx tsx scripts/conferir-indice-noticias.ts
 */
import { editoriaDaMateria, ORDEM_DOS_CADERNOS } from '../lib/site/editorias'
import { MATERIAS_DE_CURSO, montarEdicao, paginaDeNoticias, type NoticiaDoIndice } from '../lib/site/indice-noticias'

let falhas = 0
function confere(nome: string, ok: boolean, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`)
}

// 1. Editorias: títulos reais do site, inclusive os empates que a ordem das regras decide.
const ESPERADO: [string, string][] = [
  ['Curso de primeiros socorros infantil: o que se aprende', 'cursos'],
  ['Reciclagem de bombeiro civil no RJ: prazo e carga horária', 'cursos'],
  ['Voluntariado para idosos: como começar depois dos 60', 'voluntariado'],
  ['Voluntário recebe salário? O que diz a lei', 'voluntariado'],
  ['Banho no leito do idoso: cuidados de quem cuida', 'cuidado'],
  ['Sobrecarga do cuidador: sinais e como pedir apoio', 'cuidado'],
  ['Criança bateu a cabeça: o que fazer e quando ligar 192', 'primeiros-socorros'],
  ['Kit de primeiros socorros escolar: o que a Lei Lucas pede', 'primeiros-socorros'],
  ['Sinais de AVC: como reconhecer e quando ligar para o 192', 'primeiros-socorros'],
  ['Diferença entre enchente e inundação: guia simples', 'emergencias'],
  ['Como se proteger de raios em casa e na rua', 'emergencias'],
  ['Leptospirose depois da enchente: como se proteger', 'emergencias'],
  ['Convenções de Genebra: o que são e o que protegem', 'movimento'],
  ['Cruz Vermelha é ONG? Como a instituição funciona', 'movimento'],
  ['Restabelecimento de laços familiares: como funciona', 'movimento'],
  ['Deam Digital RJ: como denunciar violência doméstica online', 'rio'],
  ['7 de Setembro', 'rio'],
]
for (const [titulo, id] of ESPERADO) {
  const achou = editoriaDaMateria(titulo).id
  confere(`editoria: ${titulo}`, achou === id, `esperava ${id}, veio ${achou}`)
}
confere('editoria pelo endereço quando o título não diz', editoriaDaMateria('Guia simples', 'https://x/noticias/voluntariado-guia/').id === 'voluntariado')
confere('todo caderno tem âncora única', new Set(ORDEM_DOS_CADERNOS.map((e) => e.id)).size === ORDEM_DOS_CADERNOS.length)
confere('cursos é o último caderno', ORDEM_DOS_CADERNOS[ORDEM_DOS_CADERNOS.length - 1].id === 'cursos')

// 2. A edição: cada matéria uma vez só, curso fora da primeira página.
const slugDeCurso = [...MATERIAS_DE_CURSO][0]
const base = new Date('2026-11-10T12:00:00Z').getTime()
const TITULOS = ESPERADO.map(([t]) => t)
const noticias: NoticiaDoIndice[] = Array.from({ length: 60 }, (_, i) => ({
  titulo: `${TITULOS[i % TITULOS.length]} (${i})`,
  descricao: i % 4 ? `Linha fina da matéria ${i}.` : null,
  url: `https://cruzvermelhariodejaneiro.org/noticias/${i === 0 ? slugDeCurso : `materia-${i}`}/`,
  publicadaEm: new Date(base - i * 3_600_000),
  capa: i % 5 ? `https://cruzvermelhariodejaneiro.org/noticias/materia-${i}/capa.jpg` : null,
}))
const edicao = montarEdicao(noticias)
const todas = [edicao.manchete!, ...edicao.secundarias, ...edicao.ultimas, ...edicao.cadernos.flatMap((c) => c.materias), ...edicao.arquivo]
confere('nenhuma matéria se perde', todas.length === noticias.length, `${todas.length} de ${noticias.length}`)
confere('nenhuma matéria se repete', new Set(todas).size === todas.length)
const naCapa = [edicao.manchete!, ...edicao.secundarias, ...edicao.ultimas]
confere('matéria de curso (lista do Ad Grants) fica fora da primeira página', !naCapa.some((n) => n.url.includes(slugDeCurso)))
confere('a manchete é a mais nova que não vende curso', edicao.manchete === noticias[1])
confere('as chamadas têm foto', edicao.secundarias.length === 3 && edicao.secundarias.every((n) => n.capa))
confere('caderno tem de 3 a 5 matérias', edicao.cadernos.length > 0 && edicao.cadernos.every((c) => c.materias.length >= 3 && c.materias.length <= 5))
confere('o arquivo segue da mais nova para a mais velha', edicao.arquivo.every((n, i, a) => i === 0 || a[i - 1].publicadaEm >= n.publicadaEm))

const sem = montarEdicao([])
confere('edição vazia não quebra', !sem.manchete && sem.arquivo.length === 0)
const soCurso = montarEdicao([noticias[0]])
confere('só matéria de curso: ela abre mesmo assim', soCurso.manchete === noticias[0])

// 3. A página.
const html = paginaDeNoticias(noticias, new Date(base))
const links = (html.match(/href="https:\/\/cruzvermelhariodejaneiro\.org\/noticias\/[^"]+\/"/g) ?? [])
confere('todas as matérias estão no HTML, sem depender de script', noticias.every((n) => html.includes(`href="${n.url}"`)))
confere('cada matéria tem um link só no corpo', noticias.every((n) => html.split(`<a href="${n.url}"`).length + html.split(`class="manchete" href="${n.url}"`).length + html.split(`class="destaque" href="${n.url}"`).length === 4), `${links.length} links`)
confere('um h1 só', (html.match(/<h1/g) ?? []).length === 1)
confere('só a capa da manchete carrega com prioridade', (html.match(/fetchpriority="high"/g) ?? []).length === 1)
confere('a página vazia avisa', paginaDeNoticias([]).includes('As primeiras notícias estão a caminho.'))

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
