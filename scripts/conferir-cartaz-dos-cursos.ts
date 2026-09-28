// Conferência do cartaz de matrícula dos cursos da Escola (lib/escola/cartaz.ts,
// sobre lib/cartaz/copy.ts) e da copy por curso (lib/escola/cartaz-copy.ts).
// Rode com: npx tsx scripts/conferir-cartaz-dos-cursos.ts
import { MAXIMO_DO_TEXTO, MAXIMO_DO_TITULO_MONTADO, montarChamada, type Chamada } from '../lib/cartaz/copy'
import { chamadasDoCurso, CHAMADAS_DO_CURSO, CHAVE_PADRAO, linkDeMatricula, marcadoresDoCurso, MATRICULA_NO_SITE, modeloDoCurso, TEXTO_PADRAO, type CursoDoCartaz } from '../lib/escola/cartaz'
import { COPY_POR_CURSO } from '../lib/escola/cartaz-copy'

let falhas = 0
const igual = (obtido: unknown, esperado: unknown, nome: string) => {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.error(`FALHOU: ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`) }
}
const verdade = (ok: boolean, nome: string) => { if (!ok) { falhas++; console.error(`FALHOU: ${nome}`) } }

// ---------------------------------------------------------------- para onde o QR leva
igual(linkDeMatricula({ paginaUrl: 'https://cruzvermelhariodejaneiro.org/matricula-cursos-presenciais/?curso=puncao-venosa' }), { url: 'https://cruzvermelhariodejaneiro.org/matricula-cursos-presenciais/?curso=puncao-venosa', daPagina: true }, 'página cadastrada (https)')
igual(linkDeMatricula({ paginaUrl: null }), { url: MATRICULA_NO_SITE, daPagina: false }, 'sem página: a matrícula do site')
igual(linkDeMatricula({ paginaUrl: '  ' }), { url: MATRICULA_NO_SITE, daPagina: false }, 'página em branco: a matrícula do site')
igual(linkDeMatricula({ paginaUrl: 'http://exemplo.org/curso' }), { url: MATRICULA_NO_SITE, daPagina: false }, 'http (sem s) não vai para o QR')
igual(linkDeMatricula({ paginaUrl: 'javascript:alert(1)' }), { url: MATRICULA_NO_SITE, daPagina: false }, 'javascript: não vai para o QR')
verdade(MATRICULA_NO_SITE.startsWith('https://cruzvermelhariodejaneiro.org/'), 'a matrícula do site é no site da filial')

// ---------------------------------------------------------------- os modelos, pelo nome
const DO_SITE: [string, string | null][] = [
  ['Primeiros Socorros Básico', 'primeiros-socorros'],
  ['Primeiros Socorros Lei Lucas - Ambientes com Crianças', 'lei-lucas'],
  ['Punção Venosa', 'puncao'],
  ['Suporte Básico de Vida', 'sbv'],
  ['Bombeiro Civil', 'bombeiro'],
  ['Cuidador de Idosos (Curso Livre)', 'cuidador'],
  ['Micropigmentação Labial', 'micropigmentacao'],
  ['Curso de Oratória para Voluntários', null],
]
for (const [nome, modelo] of DO_SITE) igual(modeloDoCurso(nome), modelo, `modelo de "${nome}"`)
igual(modeloDoCurso('PUNCAO VENOSA'), 'puncao', 'sem acento e em caixa alta também casa')

// ---------------------------------------------------------------- a lista e os marcadores
const puncao: CursoDoCartaz = { id: '1', nome: 'Punção Venosa', descricao: '8 horas, com certificado.', paginaUrl: null }
const semDescricao: CursoDoCartaz = { id: '2', nome: 'Curso de Oratória', descricao: '  ', paginaUrl: null }
igual(montarChamada(CHAVE_PADRAO, CHAMADAS_DO_CURSO[CHAVE_PADRAO], marcadoresDoCurso(puncao)), { chave: CHAVE_PADRAO, rotulo: 'Inscrições abertas', titulo: ['Inscrições abertas:', 'Punção Venosa.'], texto: '8 horas, com certificado.' }, 'de sempre: com a descrição')
igual(montarChamada(CHAVE_PADRAO, CHAMADAS_DO_CURSO[CHAVE_PADRAO], marcadoresDoCurso(semDescricao))?.texto, TEXTO_PADRAO, 'sem descrição: o texto padrão')
const lista = chamadasDoCurso(puncao, COPY_POR_CURSO)
igual(lista[0]?.chave, CHAVE_PADRAO, 'a de sempre vem primeiro')
igual(new Set(lista.map((c) => c.chave)).size, lista.length, 'chaves únicas na lista')
verdade(lista.length >= Object.keys(CHAMADAS_DO_CURSO).length + Object.keys(COPY_POR_CURSO.puncao ?? {}).length, 'a lista tem as genéricas e as do modelo')

// ---------------------------------------------------------------- toda a copy, em todos os cursos
const NOMES_LITERAIS = ['Primeiros Socorros', 'Lei Lucas', 'Punção Venosa', 'Punção', 'Suporte Básico de Vida', 'Bombeiro Civil', 'Cuidador de Idosos', 'Micropigmentação']
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function conferirChamada(onde: string, chave: string, c: Chamada, curso: CursoDoCartaz, generica = false) {
  verdade(/^[a-z0-9-]{1,40}$/.test(chave), `${onde}/${chave}: chave é slug`)
  const modelo = [c.titulo[0], c.titulo[1], c.texto].join(' ')
  verdade(!/\{(?!curso\}|descricao\})/.test(modelo), `${onde}/${chave}: só marcadores conhecidos`)
  // A copy de um curso pode falar do tema dele (a Lei Lucas, a punção); a genérica, de nenhum.
  if (generica) for (const n of NOMES_LITERAIS) verdade(!new RegExp(`(^|[^\\p{L}])${escapar(n)}(?![\\p{L}])`, 'iu').test(modelo), `${onde}/${chave}: nome de curso por extenso ("${n}")`)
  verdade((modelo.match(/!/g) ?? []).length <= 1, `${onde}/${chave}: no máximo um "!"`)
  verdade(!/R\$|\d{1,2}\/\d{1,2}|\d+ ?h(oras)?\b/i.test(modelo), `${onde}/${chave}: sem preço, data ou carga horária`)
  const pronta = montarChamada(chave, c, marcadoresDoCurso(curso))
  verdade(Boolean(pronta), `${onde}/${chave}: monta`)
  if (!pronta) return
  verdade(!/[{}]/.test([...pronta.titulo, pronta.texto].join(' ')), `${onde}/${chave}: sem marcador sobrando`)
  const titulo = `${pronta.titulo[0]} ${pronta.titulo[1]}`.trim()
  // Nome de curso comprido estoura qualquer molde (a folha encolhe a letra): o excesso que vem do nome não conta contra a chamada.
  const folga = Math.max(0, curso.nome.length - 30)
  verdade(titulo.length <= MAXIMO_DO_TITULO_MONTADO + folga, `${onde}/${chave}: título cabe (${titulo.length} > ${MAXIMO_DO_TITULO_MONTADO + folga}): "${titulo}"`)
  verdade(pronta.texto.length <= MAXIMO_DO_TEXTO, `${onde}/${chave}: frase cabe (${pronta.texto.length} > ${MAXIMO_DO_TEXTO})`)
  verdade(pronta.texto.length >= 20, `${onde}/${chave}: frase curta demais`)
}
const cursos = DO_SITE.map(([nome], i): CursoDoCartaz => ({ id: String(i), nome, descricao: null, paginaUrl: null }))
let porCurso = 0
for (const [modelo, chamadas] of Object.entries(COPY_POR_CURSO)) {
  const curso = cursos.find((c) => modeloDoCurso(c.nome) === modelo)
  verdade(Boolean(curso), `copy para modelo desconhecido: ${modelo}`)
  if (!curso) continue
  for (const [chave, c] of Object.entries(chamadas)) { porCurso++; conferirChamada(modelo, chave, c, curso) }
  verdade(!Object.keys(chamadas).some((k) => k in CHAMADAS_DO_CURSO), `${modelo}: chave não repete uma genérica`)
}
for (const [chave, c] of Object.entries(CHAMADAS_DO_CURSO)) for (const curso of cursos) conferirChamada(`generica@${curso.nome}`, chave, c, curso, true)

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log(`Cartaz dos cursos: tudo certo (${Object.keys(CHAMADAS_DO_CURSO).length} genéricas, ${porCurso} por curso em ${Object.keys(COPY_POR_CURSO).length} modelos).`)
