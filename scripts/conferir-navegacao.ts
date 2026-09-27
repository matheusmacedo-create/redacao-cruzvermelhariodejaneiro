/**
 * Confere o mapa do menu (lib/navegacao.ts) e o que a ajuda diz sobre ele.
 * Rode com: npx tsx scripts/conferir-navegacao.ts
 *
 * - cada área tem endereço, nome e ícone só dela (docs/NAVEGACAO.md §5);
 * - uma parte (`dentroDe`) aponta para uma área-mãe do mesmo grupo, que não é
 *   parte de outra; grupo com mais de 6 linhas no menu gera aviso;
 * - na ajuda, "Abra “X”, no grupo G do menu" só vale se X estiver mesmo em G,
 *   e todo "grupo G do menu" cita um grupo que existe.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ADMINISTRACAO, GRUPOS, TODOS_OS_GRUPOS, areaDoCaminho, familiaDaArea, hrefNoMenu } from '../lib/navegacao'

const erros: string[] = []
const avisos: string[] = []
const todas = TODOS_OS_GRUPOS.flatMap((g) => g.areas.map((a) => ({ ...a, grupo: g })))

function repetidos<T>(lista: T[]): T[] {
  return [...new Set(lista.filter((x, i) => lista.indexOf(x) !== i))]
}

for (const href of repetidos(todas.map((a) => a.href))) erros.push(`endereço repetido no mapa: ${href}`)
for (const rotulo of repetidos(todas.map((a) => a.rotulo))) erros.push(`nome repetido no menu: “${rotulo}” (cada área precisa de um nome só dela)`)
const icones = todas.map((a) => a.icone)
for (const icone of repetidos(icones)) {
  const quem = todas.filter((a) => a.icone === icone).map((a) => a.rotulo).join(', ')
  erros.push(`ícone repetido entre ${quem}`)
}

for (const a of todas) {
  if (!a.dentroDe) continue
  const mae = todas.find((m) => m.href === a.dentroDe)
  if (!mae) { erros.push(`${a.href}: dentroDe aponta para ${a.dentroDe}, que não existe`); continue }
  if (mae.dentroDe) erros.push(`${a.href}: a mãe ${mae.href} também é parte de outra área`)
  if (mae.grupo.id !== a.grupo.id) erros.push(`${a.href}: a mãe ${mae.href} está em outro grupo (${mae.grupo.id})`)
  if (mae.foraDoMenu) erros.push(`${a.href}: a mãe ${mae.href} não aparece no menu`)
}

for (const g of GRUPOS) {
  const linhas = g.areas.filter((a) => !a.foraDoMenu && !a.dentroDe).length
  if (!linhas) erros.push(`grupo ${g.id} sem nenhuma linha no menu`)
  if (g.rotulo && linhas > 6) avisos.push(`grupo “${g.rotulo}” com ${linhas} linhas no menu (o ideal é até 6)`)
}

// As regras de acender e das abas.
const casos: [string, string][] = [['/registro', '/impacto'], ['/canais-oficiais', '/transparencia'], ['/trilha-publica', '/transparencia'], ['/voluntariado/mensagens', '/voluntariado'], ['/escola/marketing/advertoriais', '/escola/marketing'], ['/pautas/abc', '/pautas'], ['/registrar', '/pautas']]
for (const [caminho, esperado] of casos) {
  const achado = areaDoCaminho(caminho)
  const acende = achado ? hrefNoMenu(achado.area) : null
  if (acende !== esperado) erros.push(`${caminho} deveria acender ${esperado} no menu, acende ${acende}`)
}
const abas = familiaDaArea('/canais-oficiais').map((a) => a.href).join(' ')
if (abas !== '/transparencia /canais-oficiais /trilha-publica') erros.push(`abas de Transparência: ${abas}`)
// Resultados e Histórico não pedem permissão: as duas abas aparecem para todos.
if (familiaDaArea('/impacto', () => false).length !== 2) erros.push('Resultados › Histórico devia ter as duas abas para todos')
if (familiaDaArea('/transparencia', () => false).length) erros.push('abas de Transparência aparecem para quem não tem permissão')
if (familiaDaArea('/pautas').length) erros.push('Pautas não tem partes e não devia ter abas')

// O que a ajuda (e a documentação) diz sobre o menu.
const rotulosDosGrupos = new Map(TODOS_OS_GRUPOS.filter((g) => g.rotulo).map((g) => [g.rotulo as string, g]))
function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const caminho = join(pasta, n)
    return statSync(caminho).isDirectory() ? arquivos(caminho) : /\.(ts|tsx|md)$/.test(n) ? [caminho] : []
  })
}
for (const arquivo of [...arquivos('lib/ajuda'), ...arquivos('docs')]) {
  const texto = readFileSync(arquivo, 'utf8')
  // "no grupo Redação do menu" ou, com nome de várias palavras, "no grupo “Conta e administração” do menu".
  for (const m of texto.matchAll(/grupos? (?:“([^”]+)”|"([^"]+)"|([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)) do menu/g)) {
    const nome = m[1] ?? m[2] ?? m[3]
    if (!rotulosDosGrupos.has(nome)) erros.push(`${arquivo}: cita o grupo “${nome}” do menu, que não existe mais`)
  }
  for (const m of texto.matchAll(/[Aa]bra “([^”]+)”, no grupo (?:“([^”]+)”|(\S+)) do menu/g)) {
    const grupo = rotulosDosGrupos.get(m[2] ?? m[3])
    if (grupo && !grupo.areas.some((a) => a.rotulo === m[1] && !a.dentroDe && !a.foraDoMenu)) {
      erros.push(`${arquivo}: manda abrir “${m[1]}” no grupo ${m[2] ?? m[3]}, mas ela não é uma linha desse grupo`)
    }
  }
}

const linhas = GRUPOS.flatMap((g) => g.areas).filter((a) => !a.foraDoMenu && !a.dentroDe).length
for (const a of avisos) console.log(`aviso: ${a}`)
for (const e of erros) console.log(`ERRO: ${e}`)
console.log(`Menu: ${GRUPOS.length} grupos, ${linhas} linhas (+ ${ADMINISTRACAO.areas.length} no menu da conta), ${todas.filter((a) => a.dentroDe).length} abas dentro de outras áreas; ${erros.length} erro(s).`)
if (erros.length) process.exit(1)
