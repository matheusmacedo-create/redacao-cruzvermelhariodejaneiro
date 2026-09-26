/**
 * Confere as filas de chamados propostas para os setores:
 * `npx tsx scripts/conferir-setores-dos-chamados.ts`. Sai com código 1 se algo estiver errado.
 */
import { NOMES_DOS_SETORES } from '../lib/equipe'
import { ICONES_DE_FILA, modeloDoSetor, prefixoDoSetor, propostasDeFila, setorJaTemFila, slugDoNome } from '../lib/chamados/setores'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU ${nome}: ${JSON.stringify(obtido)} ≠ ${JSON.stringify(esperado)}`) }
}

const filas = [{ slug: 'ti', nome: 'Tecnologia da Informação', prefixo: 'TI' }, { slug: 'manutencao', nome: 'Manutenção', prefixo: 'MAN' }]

confere('modelo TI pela sigla', modeloDoSetor('TI')?.prefixo, 'TI')
confere('sigla não casa dentro de palavra', modeloDoSetor('Tintas e Artes')?.prefixo, undefined)
confere('modelo comunicação', modeloDoSetor('Comunicação Social')?.icone, 'megaphone')
confere('modelo educação antes de saúde', modeloDoSetor('Educação e Saúde')?.prefixo, 'EDU')
confere('modelo psicologia', modeloDoSetor('Psicologia / Serviço Social')?.prefixo, 'PSS')
confere('modelo RH', modeloDoSetor('Recursos Humanos')?.prefixo, 'RH')
confere('sem modelo', modeloDoSetor('Almoço de Domingo'), null)

confere('slug', slugDoNome('Psicologia / Serviço Social'), 'psicologia-servico-social')
confere('prefixo do modelo', prefixoDoSetor('Jurídico', new Set()), 'JUR')
confere('prefixo das iniciais quando o do modelo está em uso', prefixoDoSetor('Comunicação Social', new Set(['COM'])), 'CS')
confere('prefixo por letras sem modelo', prefixoDoSetor('Almoxarife', new Set()), 'ALM')
confere('prefixo sem saída', prefixoDoSetor('Ab', new Set(['AB'])), null)

confere('TI já tem fila (pelo nome)', setorJaTemFila({ id: '1', nome: 'Tecnologia da Informação', descricao: null }, filas), true)
confere('TI já tem fila (pelo prefixo)', setorJaTemFila({ id: '1', nome: 'Informática', descricao: null }, filas), true)
confere('Jurídico não tem', setorJaTemFila({ id: '2', nome: 'Jurídico', descricao: null }, filas), false)

// A lista reserva de setores da filial inteira: todo setor sem fila ganha proposta válida, sem prefixo repetido.
const setores = NOMES_DOS_SETORES.map((nome, i) => ({ id: String(i), nome, descricao: null }))
const propostas = propostasDeFila(setores, filas)
const prefixos = propostas.map((p) => p.prefixo)
confere('TI fica de fora', propostas.some((p) => p.nome === 'Tecnologia da Informação'), false)
confere('todos com prefixo', prefixos.every((p) => p !== null && /^[A-Z]{2,6}$/.test(p)), true)
confere('prefixos distintos', new Set(prefixos).size, prefixos.length)
confere('prefixos novos não colidem com os existentes', prefixos.some((p) => p === 'TI' || p === 'MAN'), false)
confere('slugs válidos', propostas.every((p) => /^[a-z0-9-]{2,40}$/.test(p.slug)), true)
confere('ícones conhecidos', propostas.every((p) => (ICONES_DE_FILA as readonly string[]).includes(p.icone)), true)
confere('todos com assuntos', propostas.every((p) => p.assuntos.length > 0 && p.assuntos.every((a) => a.nome.length >= 2 && a.nome.length <= 80 && a.descricao.length <= 200)), true)
confere('nomes cabem na fila', propostas.every((p) => p.nome.length >= 2 && p.nome.length <= 60), true)
confere('dois setores de mesmo nome viram uma proposta', propostasDeFila([{ id: 'a', nome: 'Jurídico', descricao: null }, { id: 'b', nome: 'Juridico', descricao: null }], []).length, 1)

for (const p of propostas) console.log(`  ${p.prefixo?.padEnd(4)} ${p.icone.padEnd(16)} ${p.nome} (${p.assuntos.length} assuntos)`)
console.log(falhas ? `${falhas} falha(s).` : 'Setores dos chamados: tudo certo.')
process.exit(falhas ? 1 : 0)
