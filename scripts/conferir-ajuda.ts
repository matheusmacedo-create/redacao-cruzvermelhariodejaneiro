/**
 * Confere o conteúdo da ajuda contra o código: `npx tsx scripts/conferir-ajuda.ts`.
 *
 * - todo alvo citado num tour tem um `data-ajuda="..."` em algum arquivo;
 * - toda ajuda é de uma área que existe em lib/navegacao.ts (e toda área tem ajuda);
 * - ids de tarefa e pergunta são únicos dentro da área (viram âncora na Central);
 *   na Área do Voluntário, únicos na página inteira (/membro/ajuda junta tudo);
 * - telas internas moram dentro do endereço da área.
 *
 * Sai com código 1 se algo estiver errado, para caber num passo de validação.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GUIAS, TOPICOS_GERAIS, alvosCitados } from '../lib/ajuda'
import { GUIAS_DO_MEMBRO, BOAS_VINDAS_DO_MEMBRO, TOPICOS_DO_MEMBRO } from '../lib/ajuda/membro'
import { TODOS_OS_GRUPOS, areaDoCaminho } from '../lib/navegacao'

const raiz = join(__dirname, '..')
const erros: string[] = []
const avisos: string[] = []

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return nome === 'node_modules' || nome.startsWith('.') ? [] : arquivos(caminho)
    return /\.tsx?$/.test(nome) ? [caminho] : []
  })
}

// data-ajuda="x" e data-ajuda={... 'x' ...} (inclusive condicional: {primeiro ? 'x' : undefined}).
// Dentro das chaves só conta string com ponto (`<área>.<coisa>`): a condição
// (`tipo === 'institucional'`) não é alvo.
// Valor montado em tempo de execução (`${...}`) não conta: o conteúdo cita alvos fixos.
const marcados = new Set<string>()
for (const arquivo of [...arquivos(join(raiz, 'app')), ...arquivos(join(raiz, 'components'))]) {
  const texto = readFileSync(arquivo, 'utf8')
  for (const m of texto.matchAll(/data-ajuda="([^"$]+)"/g)) marcados.add(m[1])
  for (const m of texto.matchAll(/data-ajuda=\{([^}]*)\}/g)) for (const v of m[1].matchAll(/'([a-z0-9-]+\.[a-z0-9.-]+)'/g)) marcados.add(v[1])
}

const citados = [
  ...alvosCitados(),
  ...BOAS_VINDAS_DO_MEMBRO.flatMap((p) => (p.alvo ? [{ alvo: p.alvo, onde: 'boas-vindas do voluntário' }] : [])),
  ...GUIAS_DO_MEMBRO.flatMap((g) => [{ onde: g.href, passos: g.tour }, ...(g.telas ?? []).map((t) => ({ onde: t.caminho, passos: t.tour }))])
    .flatMap(({ onde, passos }) => passos.flatMap((p) => (p.alvo ? [{ alvo: p.alvo, onde: `voluntário ${onde}` }] : []))),
]
for (const { alvo, onde } of citados) {
  if (!marcados.has(alvo)) erros.push(`alvo sem elemento: "${alvo}" (tour de ${onde})`)
}

const hrefs = new Set(TODOS_OS_GRUPOS.flatMap((g) => g.areas.map((a) => a.href)))
const comAjuda = new Set<string>()
for (const guia of GUIAS) {
  if (!hrefs.has(guia.href)) erros.push(`ajuda de área que não existe no menu: ${guia.href}`)
  if (comAjuda.has(guia.href)) erros.push(`área com duas ajudas: ${guia.href}`)
  comAjuda.add(guia.href)
  const ids = [...guia.tarefas.map((t) => t.id), ...guia.perguntas.map((p) => p.id)]
  const repetidos = ids.filter((id, n) => ids.indexOf(id) !== n)
  if (repetidos.length) erros.push(`${guia.href}: ids repetidos ${[...new Set(repetidos)].join(', ')}`)
  for (const id of ids) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) erros.push(`${guia.href}: id fora do padrão "${id}"`)
  for (const tela of guia.telas ?? []) {
    // A tela é da área se o menu a põe lá (inclui as moradas: /mensagens/[id] é de Aprovações).
    const exemplo = tela.caminho.replace(/\[\.\.\.[^\]]+\]/g, 'x/y').replace(/\[[^\]]+\]/g, 'x')
    if (areaDoCaminho(exemplo)?.area.href !== guia.href) erros.push(`${guia.href}: tela fora da área ${tela.caminho}`)
    if (!tela.tour.length) avisos.push(`${guia.href}: tela sem tour ${tela.caminho}`)
  }
  for (const r of guia.relacionadas ?? []) if (!hrefs.has(r)) erros.push(`${guia.href}: relacionada inexistente ${r}`)
  if (guia.tour.length && (guia.tour.length < 2 || guia.tour.length > 8)) avisos.push(`${guia.href}: tour com ${guia.tour.length} passos (o ideal é 3 a 7)`)
  if (!guia.perguntas.length) avisos.push(`${guia.href}: sem perguntas frequentes`)
}
for (const href of hrefs) if (!comAjuda.has(href) && href !== '/ajuda') avisos.push(`área sem ajuda: ${href}`)

const idsGerais = TOPICOS_GERAIS.flatMap((t) => [t.id, ...t.tarefas.map((x) => x.id), ...t.perguntas.map((p) => p.id)])
const repetidosGerais = idsGerais.filter((id, n) => idsGerais.indexOf(id) !== n)
if (repetidosGerais.length) erros.push(`tópicos gerais: ids repetidos ${[...new Set(repetidosGerais)].join(', ')}`)

// A Central do voluntário (/membro/ajuda) põe destinos e tópicos numa página só: o id é âncora da página inteira.
const idsDoMembro = [
  ...GUIAS_DO_MEMBRO.flatMap((g) => [...g.tarefas.map((t) => t.id), ...g.perguntas.map((p) => p.id)]),
  ...TOPICOS_DO_MEMBRO.flatMap((t) => [...t.tarefas.map((x) => x.id), ...t.perguntas.map((p) => p.id)]),
]
const repetidosDoMembro = idsDoMembro.filter((id, n) => idsDoMembro.indexOf(id) !== n)
if (repetidosDoMembro.length) erros.push(`voluntário: ids repetidos ${[...new Set(repetidosDoMembro)].join(', ')}`)
for (const id of idsDoMembro) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) erros.push(`voluntário: id fora do padrão "${id}"`)

const usados = new Set(citados.map((c) => c.alvo))
const soltos = [...marcados].filter((m) => !usados.has(m))
if (soltos.length) avisos.push(`marcados sem uso em tour (ok se for de propósito): ${soltos.join(', ')}`)

for (const a of avisos) console.log(`aviso: ${a}`)
for (const e of erros) console.log(`ERRO: ${e}`)
console.log(`${GUIAS.length} áreas com ajuda, ${citados.length} alvos citados, ${marcados.size} marcados, ${erros.length} erro(s).`)
process.exit(erros.length ? 1 : 0)
