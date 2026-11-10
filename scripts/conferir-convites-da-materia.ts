/**
 * Confere os convites da página de matéria (lib/site/convites-da-materia.ts).
 *   npx tsx scripts/conferir-convites-da-materia.ts
 */
import { montarPaginaDoArtigo } from '../lib/site/artigo-html'
import { ACEITE_DA_CAIXA_DE_NOTICIAS, conviteDoTitulo } from '../lib/site/convites-da-materia'
import { TEXTO_DO_CONSENTIMENTO } from '../lib/newsletter/inscricao'
import { problemasDaPagina } from '../lib/site/guarda-da-pagina'

let falhas = 0
function ok(cond: boolean, nome: string) {
  if (!cond) falhas++
  console.log(`${cond ? '✓' : '✗'} ${nome}`)
}

ok(ACEITE_DA_CAIXA_DE_NOTICIAS === TEXTO_DO_CONSENTIMENTO, 'o aceite da caixa de notícias é, letra por letra, o texto que a rota grava')

// 1. Qual convite em qual assunto.
const ESPERADO: [string, string | null][] = [
  ['Criança bateu a cabeça: o que fazer e quando ligar 192', 'escola'],
  ['Banho no leito do idoso: cuidados de quem cuida', 'escola'],
  ['Curso de primeiros socorros infantil: o que se aprende', 'escola'],
  ['Voluntário recebe salário? O que diz a lei', 'voluntariado'],
  ['Henry Dunant: quem foi o fundador da Cruz Vermelha', 'voluntariado'],
  ['Deam Digital RJ: como denunciar violência doméstica online', 'voluntariado'],
  ['Onda de calor: o que fazer para se proteger', 'kit'],
]
for (const [titulo, tipo] of ESPERADO) {
  const veio = conviteDoTitulo(titulo, '')?.tipo ?? null
  ok(veio === tipo, `convite: ${titulo} → ${tipo}${veio === tipo ? '' : ` (veio ${veio})`}`)
}
ok(conviteDoTitulo('Sirene da Defesa Civil: o que fazer quando toca', '', true) === null, 'emergência que já tem a caixa do kit não repete o convite do kit')
ok(conviteDoTitulo('Fratura: o que fazer na suspeita até o socorro chegar', '', true)?.tipo === 'escola', 'primeiros socorros com a caixa do kit mantém o convite da escola')

// 2. A página.
const base = { subtitulo: 'Linha fina.', corpo: 'Um parágrafo.\n\n## Fontes\n\n- Fonte', baseUrl: 'https://cruzvermelhariodejaneiro.org/noticias', publicadoEm: new Date('2026-11-05T12:00:00Z') }
const quantos = (html: string, trecho: string) => html.split(trecho).length - 1

const voluntariado = montarPaginaDoArtigo({ ...base, titulo: 'Idade mínima para ser voluntário: o que a lei diz', slug: 'idade-minima-para-ser-voluntario' })
ok(voluntariado.includes('data-convite="voluntariado"') && voluntariado.includes('href="/voluntariado/">Quero ser voluntário'), 'matéria de voluntariado: convite para ser voluntário')
ok(quantos(voluntariado, 'class="news-material news-assine"') === 1 && quantos(voluntariado, '<form') === 1, 'e uma caixa de newsletter, uma só')
ok(voluntariado.includes('<input type="hidden" name="origem" value="materia">') && !voluntariado.includes('name="material"'), 'a caixa manda origem=materia e não pede material')
ok(voluntariado.includes('data-evento="newsletter_inscrever"') && voluntariado.includes('data-variante="voluntariado"'), 'o evento é newsletter_inscrever, com a editoria')
ok(voluntariado.includes("origem: 'materia' }) })"), 'o script manda a origem também no envio em JSON')
ok(voluntariado.indexOf('news-convite"') > voluntariado.indexOf('class="news-body"') && voluntariado.indexOf('news-convite"') < voluntariado.indexOf('news-assine'), 'ordem: texto, convite, newsletter')
ok(voluntariado.includes('<p class="kicker">Voluntariado</p>'), 'o chapéu da matéria é a editoria')
ok(voluntariado.includes('class="rail-ajudar"') && voluntariado.includes('href="/doe/">Doe para a filial') && !voluntariado.includes('class="rail-cta"'), '"Como ajudar" na coluna lateral, com doação e voluntariado em botões')
ok(problemasDaPagina(voluntariado).length === 0, `a guarda da página aceita: ${problemasDaPagina(voluntariado).join('; ')}`)

const socorro = montarPaginaDoArtigo({ ...base, titulo: 'Engasgo adulto: o que fazer e quando pedir ajuda', slug: 'engasgo-adulto-o-que-fazer' })
ok(socorro.includes('data-convite="escola"') && socorro.includes('href="/matricula-cursos-presenciais/"') && !/R\$\s?\d/.test(socorro.slice(socorro.indexOf('news-convite'), socorro.indexOf('news-assine'))), 'primeiros socorros: convite da escola, sem preço')

const clima = montarPaginaDoArtigo({ ...base, titulo: 'Onda de calor: o que fazer para se proteger', slug: 'onda-de-calor-o-que-fazer' })
ok(clima.includes('data-convite="kit"') && clima.includes('href="/kit-de-emergencia/"') && clima.includes('news-assine'), 'emergência fora da lista do kit: convite para o guia e newsletter')

const comKit = montarPaginaDoArtigo({ ...base, titulo: 'Sirene da Defesa Civil: o que fazer quando toca', slug: 'sirene-da-defesa-civil-o-que-fazer-quando-toca' })
ok(comKit.includes('class="news-material"') && !comKit.includes('news-assine') && !comKit.includes('data-convite='), 'emergência com a caixa do kit: só ela (sem newsletter repetida, sem convite do kit)')
ok(quantos(comKit, '<form') === 1, 'e um formulário só')

const advertorial = montarPaginaDoArtigo({ ...base, titulo: 'Curso de punção venosa: para quem é', slug: 'curso-de-puncao-venosa-x', rastreio: { pixel: '1', botao: 'https://escola.cursoscruzvermelha.org/c/x' } })
ok(!advertorial.includes('data-convite=') && !advertorial.includes('news-assine') && !advertorial.includes('<form'), 'advertorial: nenhum convite e nenhuma caixa (o clique é o da matrícula)')
ok(advertorial.includes('<p class="kicker">Divulgação de curso</p>'), 'e continua identificado como divulgação de curso')

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
