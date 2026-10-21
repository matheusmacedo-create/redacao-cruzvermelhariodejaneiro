/**
 * Confere o "Leia também" por tema (lib/site/relacionadas.ts).
 * Rode com: npx tsx scripts/conferir-relacionadas.ts
 *
 * - matérias do mesmo assunto vêm antes das mais recentes;
 * - palavra presente em quase todas (Cruz Vermelha, curso) não junta assuntos;
 * - a matéria que o corpo cita vem primeiro;
 * - sem tema em comum, completa com as mais recentes, sem repetir nem incluir a própria.
 */
import { radicais, relacionadasPorTema, type CandidataARelacionada } from '../lib/site/relacionadas'

let falhas = 0
const ok = (cond: boolean, msg: string) => { if (!cond) { falhas++; console.error('✗', msg) } else console.log('✓', msg) }

const B = 'https://cruzvermelhariodejaneiro.org/noticias'
let dia = 0
const m = (slug: string, titulo: string, descricao = ''): CandidataARelacionada =>
  ({ titulo, descricao, url: `${B}/${slug}/`, publicadaEm: new Date(Date.UTC(2026, 8, 24 + dia++)) })

// Títulos reais do site, do mais antigo ao mais recente.
const noAr = [
  m('curso-de-bombeiro-civil', 'Curso de Bombeiro Civil: o que faz e como se formar no RJ'),
  m('curso-de-primeiros-socorros-basico', 'Curso de Primeiros Socorros Básico: os primeiros minutos'),
  m('curso-lei-lucas', 'Lei Lucas: o que exige das escolas e como capacitar a equipe'),
  m('sinais-de-avc', 'Sinais de AVC: como reconhecer e quando ligar para o 192'),
  m('alerta-defesa-civil', 'Alerta da Defesa Civil no celular: como funciona no Rio'),
  m('cicv', 'CICV: o que é o Comitê Internacional da Cruz Vermelha'),
  m('lei-do-voluntariado', 'Lei do voluntariado: o que diz a Lei 9.608/1998'),
  m('sinais-de-infarto', 'Sinais de infarto: o que não ignorar e quando ligar 192'),
  m('sms-40199', 'SMS 40199: como receber alertas da Defesa Civil no Rio'),
  m('henry-dunant', 'Henry Dunant: quem foi o fundador da Cruz Vermelha'),
  m('termo-de-adesao', 'Termo de adesão voluntário: o que é e o que deve ter'),
  m('homologacao-bombeiro-civil', 'Homologação de bombeiro civil no CBMERJ: como funciona'),
  m('bebe-engasga', 'O que fazer quando o bebê engasga: sinais e quando ligar'),
  m('raios', 'Como se proteger de raios em casa e na rua'),
  m('solferino', 'Batalha de Solferino: a origem da Cruz Vermelha', 'Como a batalha de 1859 levou Henry Dunant a criar o movimento.'),
  m('quem-pode-ministrar-lei-lucas', 'Quem pode ministrar o curso de primeiros socorros da Lei Lucas'),
]
const urlDe = (slug: string) => `${B}/${slug}/`
const vizinhas = (slug: string, corpo = '') => {
  const atual = noAr.find((n) => n.url === urlDe(slug))!
  return relacionadasPorTema({ ...atual, corpo }, noAr).map((n) => n.url)
}

ok(radicais('Alertas da Defesa Civil').has('alerta') && radicais('alerta').has('alerta'), 'plural e singular dão o mesmo radical')
ok(!radicais('o que é como para').size, 'palavras vazias ficam de fora')

const sms = vizinhas('sms-40199')
ok(sms[0] === urlDe('alerta-defesa-civil'), 'SMS 40199 → primeiro o alerta da Defesa Civil')
const avc = vizinhas('sinais-de-avc')
ok(avc[0] === urlDe('sinais-de-infarto'), 'Sinais de AVC → primeiro sinais de infarto')
const homolog = vizinhas('homologacao-bombeiro-civil')
ok(homolog[0] === urlDe('curso-de-bombeiro-civil'), 'Homologação → primeiro o pilar de Bombeiro Civil (um mês mais antigo)')
const lucas = vizinhas('quem-pode-ministrar-lei-lucas')
ok(lucas.slice(0, 2).includes(urlDe('curso-lei-lucas')), 'Quem pode ministrar → o pilar da Lei Lucas entre as duas primeiras')
const dunant = vizinhas('henry-dunant')
ok(dunant[0] === urlDe('solferino'), 'Henry Dunant → Solferino (que cita Dunant na linha fina)')
ok(dunant.indexOf(urlDe('cicv')) === -1 || dunant.indexOf(urlDe('cicv')) > dunant.indexOf(urlDe('solferino')), '"Cruz Vermelha" sozinha pesa menos que Henry Dunant')

const comLink = vizinhas('raios', `Veja também [o pilar](/noticias/curso-de-primeiros-socorros-basico/).`)
ok(comLink[0] === urlDe('curso-de-primeiros-socorros-basico'), 'a matéria citada no corpo vem primeiro')

for (const slug of ['raios', 'sms-40199', 'cicv']) {
  const lista = vizinhas(slug)
  ok(lista.length === 8 && new Set(lista).size === 8 && !lista.includes(urlDe(slug)), `${slug}: 8 irmãs, sem repetir nem incluir a própria`)
}
ok(relacionadasPorTema({ url: urlDe('x'), titulo: 'x' }, []).length === 0, 'sem matérias no ar, lista vazia')
const sozinha = relacionadasPorTema({ url: urlDe('nova'), titulo: 'Assunto inédito qualquer' }, noAr)
ok(sozinha[0].url === urlDe('quem-pode-ministrar-lei-lucas'), 'sem tema em comum, cai nas mais recentes')

console.log('\nExemplos:')
for (const slug of ['sms-40199', 'homologacao-bombeiro-civil', 'raios']) {
  console.log(`- ${slug}: ${vizinhas(slug).slice(0, 5).map((u) => u.split('/').slice(-2, -1)[0]).join(', ')}`)
}

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1) }
console.log('\nTudo certo.')
