/**
 * Confere as regras da área de Diplomas (lib/participantes/diplomas.ts) e o
 * texto impresso (lib/cursos/diploma-texto.ts).
 *
 *   npx tsx scripts/conferir-diplomas.ts
 */
import { filtrarDiplomas, lerCodigos, lerEscolhidos, lerFiltro, lerMotivo, pertoDoMarco, proximoMarco } from '../lib/participantes/diplomas'
import { textoDoDiploma } from '../lib/cursos/diploma-texto'
import { assinaturaDaPresidencia, assinaturasDoDiploma, assinaturasSugeridas, centrosDasAssinaturas, lerAssinaturas } from '../lib/cursos/assinaturas'

let falhas = 0
const conferir = (nome: string, ok: boolean, detalhe?: unknown) => {
  if (!ok) { falhas++; console.log(`FALHA: ${nome}`, detalhe ?? '') } else console.log(`ok: ${nome}`)
}

conferir('próximo marco de 0 h é 100', JSON.stringify(proximoMarco(0)) === '{"marco":100,"faltam":100}')
conferir('próximo marco de 99,5 h: faltam 0,5', proximoMarco(99.5)?.faltam === 0.5)
conferir('100 h exatas: o próximo é 500', proximoMarco(100)?.marco === 500)
conferir('depois de 1.000 h, não há próximo', proximoMarco(1000) === null)
conferir('perto: 80 h sim, 79 h não', pertoDoMarco(80) && !pertoDoMarco(79))
conferir('perto do 500: 420 h sim (80% entre 100 e 500), 400 h não', pertoDoMarco(420) && !pertoDoMarco(400))
conferir('perto do 1.000: 900 h sim, 899 não', pertoDoMarco(900) && !pertoDoMarco(899))
conferir('passou de 1.000: não está perto de nada', !pertoDoMarco(1500))

const codigos = lerCodigos(' abcd2345, ABCD-2345;EFGH-6789 xx  IIII-0000')
conferir('códigos normalizados, sem repetição e sem inválidos', JSON.stringify(codigos) === '["ABCD-2345","EFGH-6789"]', codigos)
conferir('códigos: no máximo 60', lerCodigos(Array.from({ length: 80 }, (_, i) => `ABCD-${String(2000 + i).replace(/[01]/g, '2')}`).join(',')).length <= 60)
conferir('códigos vazios', lerCodigos(null).length === 0)

const id = '0b6f0b0e-3c1f-4b8e-9a51-8f3c2d7e6a10'
conferir('escolhidos: sem repetição', lerEscolhidos([id, id, 'x']).ids.length === 1)
conferir('escolhidos: vazio dá erro', lerEscolhidos([]).erro === 'Escolha pelo menos um voluntário.')
conferir('escolhidos: acima de 100 dá erro', Boolean(lerEscolhidos(Array.from({ length: 101 }, (_, i) => id.slice(0, -3) + String(i).padStart(3, '0'))).erro))
conferir('motivo curto recusado', Boolean(lerMotivo('curto').erro))
conferir('motivo com espaços repetidos é limpo', lerMotivo('  pela   ajuda nas enchentes ').motivo === 'pela ajuda nas enchentes')

const f = lerFiltro({ q: ' Maria ', tipo: 'outro', situacao: 'x' })
conferir('filtro: tipo desconhecido vira todos; situação padrão é válidos', f.q === 'Maria' && f.tipo === '' && f.situacao === 'validos')
const lista = [
  { nome: 'Maria José', codigo: 'AAAA-2222', motivo: 'horas', texto: null, revogado_em: null },
  { nome: 'João', codigo: 'BBBB-3333', motivo: 'coordenacao', texto: 'Enchentes em Petrópolis', revogado_em: null },
  { nome: 'Ana', codigo: 'CCCC-4444', motivo: 'coordenacao', texto: 'Plantão', revogado_em: '2026-09-01T00:00:00Z' },
]
conferir('filtra por nome sem acento', filtrarDiplomas(lista, lerFiltro({ q: 'jose' })).length === 1)
conferir('filtra pelo motivo', filtrarDiplomas(lista, lerFiltro({ q: 'petropolis' }))[0]?.codigo === 'BBBB-3333')
conferir('cancelados só no filtro de cancelados', filtrarDiplomas(lista, lerFiltro({})).length === 2 && filtrarDiplomas(lista, lerFiltro({ situacao: 'cancelados' })).length === 1)
conferir('tipo horas', filtrarDiplomas(lista, lerFiltro({ tipo: 'horas', situacao: 'todos' })).length === 1)

conferir('texto da coordenação: minúscula e ponto final', textoDoDiploma({ motivo: 'coordenacao', marcoHoras: null, texto: 'Pela dedicação nas enchentes.' }) === 'em agradecimento aos relevantes serviços prestados à Cruz Vermelha Brasileira: pela dedicação nas enchentes.')
conferir('texto de horas cita o marco', textoDoDiploma({ motivo: 'horas', marcoHoras: 1000, texto: null }).includes('1.000 horas'))

// Quem assina
const sugeridas = assinaturasSugeridas()
conferir('sugestões: presidência, vice e coordenação do Voluntariado', sugeridas.map((a) => a.cargo).join('|') === 'Presidente|Vice-Presidente|Coordenação de Voluntariado', sugeridas)
conferir('lista vazia é recusada', Boolean(lerAssinaturas([]).erro))
conferir('mais de três é recusada', Boolean(lerAssinaturas([...sugeridas, { nome: 'Quarta Pessoa', cargo: 'Tesouraria' }]).erro))
conferir('nome curto é recusado', Boolean(lerAssinaturas([{ nome: 'Lu', cargo: 'Presidente' }]).erro))
conferir('sem cargo é recusada, citando o nome', lerAssinaturas([{ nome: 'Luiz Carlos', cargo: '' }]).erro?.includes('Luiz Carlos') === true)
conferir('linha toda em branco é ignorada; espaços somem', JSON.stringify(lerAssinaturas([{ nome: '  Antonio   Pedregal ', cargo: 'Vice-Presidente' }, { nome: '', cargo: '' }]).assinaturas) === '[{"nome":"Antonio Pedregal","cargo":"Vice-Presidente"}]')
conferir('diploma com lista gravada usa a dele', assinaturasDoDiploma([{ nome: 'Antiga Presidenta', cargo: 'Presidente' }], sugeridas)[0].nome === 'Antiga Presidenta')
conferir('diploma de antes usa a lista da filial', assinaturasDoDiploma(null, sugeridas).length === 3)
conferir('sem nada: só a presidência', JSON.stringify(assinaturasDoDiploma(null, null)) === JSON.stringify([assinaturaDaPresidencia()]))
conferir('lista gravada estragada cai na da filial', assinaturasDoDiploma('lixo', sugeridas.slice(0, 2)).length === 2)
conferir('uma assinatura fica no meio', JSON.stringify(centrosDasAssinaturas(1, 170, 1020)) === '[595]')
conferir('três distribuídas por igual', JSON.stringify(centrosDasAssinaturas(3, 100, 400)) === '[150,250,350]')

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo ok')
process.exit(falhas ? 1 : 0)
