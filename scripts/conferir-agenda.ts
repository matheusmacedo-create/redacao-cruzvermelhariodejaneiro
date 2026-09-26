/**
 * Confere os módulos puros da Agenda: `npx tsx scripts/conferir-agenda.ts`.
 *
 * - Páscoa e feriados móveis contra datas conhecidas;
 * - n-ésimo dia da semana (inclusive "último") e datas comemorativas;
 * - os alertas (data sem pauta, semana vazia, canal lotado, aprovação, feriado, vencimento);
 * - o arquivo ICS (escape, dobra de linha, dia inteiro e hora em UTC).
 *
 * Sai com código 1 se algo estiver errado.
 */
import { CAMADAS_DO_ICS, lerCamadas, type ItemDaAgenda } from '../lib/agenda/camadas'
import {
  descreverRegra, diferencaEmDias, feriados, nesimoDiaDaSemana, ocorrenciaNoAno, ocorrenciasEntre, pascoa,
  segundaDaSemana, somarDias, agoraEmBrasilia, type DataComemorativa,
} from '../lib/agenda/datas'
import { alertasDaAgenda } from '../lib/agenda/regras'
import { brasiliaParaUtc, dobrarLinha, escaparTexto, gerarIcs } from '../lib/agenda/ics'
import { ehLongo, janelaDaVisao, janelasParaCarregar, noDia } from '../lib/agenda/visao'

let falhas = 0
function igual<T>(obtido: T, esperado: T, rotulo: string) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) { falhas++; console.error(`✗ ${rotulo}\n   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`) }
}
const verdade = (v: boolean, rotulo: string) => igual(v, true, rotulo)

// ── Datas ───────────────────────────────────────────────────────────────────
igual(pascoa(2024), '2024-03-31', 'Páscoa 2024')
igual(pascoa(2025), '2025-04-20', 'Páscoa 2025')
igual(pascoa(2026), '2026-04-05', 'Páscoa 2026')
igual(pascoa(2027), '2027-03-28', 'Páscoa 2027')
igual(pascoa(2038), '2038-04-25', 'Páscoa 2038 (a mais tardia possível)')
const f2026 = feriados(2026)
igual(f2026.filter((f) => f.nome === 'Carnaval').map((f) => f.dia), ['2026-02-16', '2026-02-17'], 'Carnaval 2026')
igual(f2026.find((f) => f.nome === 'Sexta-feira Santa')?.dia, '2026-04-03', 'Sexta-feira Santa 2026')
igual(f2026.find((f) => f.nome === 'Corpus Christi')?.dia, '2026-06-04', 'Corpus Christi 2026')
igual(f2026.length, 15, 'feriados de 2026')
igual(somarDias('2026-12-31', 1), '2027-01-01', 'virada do ano')
igual(somarDias('2028-02-28', 1), '2028-02-29', 'ano bissexto')
igual(diferencaEmDias('2026-09-26', '2026-10-01'), 5, 'diferença de dias')
igual(segundaDaSemana('2026-09-27'), '2026-09-21', 'segunda de um domingo')
igual(segundaDaSemana('2026-09-21'), '2026-09-21', 'segunda de uma segunda')
igual(nesimoDiaDaSemana(2026, 9, 2, 6), '2026-09-12', '2º sábado de setembro de 2026')
igual(nesimoDiaDaSemana(2025, 9, 2, 6), '2025-09-13', '2º sábado de setembro de 2025')
igual(nesimoDiaDaSemana(2026, 5, -1, 0), '2026-05-31', 'último domingo de maio de 2026')
igual(nesimoDiaDaSemana(2026, 2, 5, 1), null, '5ª segunda de fevereiro de 2026 não existe')
igual(agoraEmBrasilia(new Date('2026-09-27T02:30:00Z')), { dia: '2026-09-26', hora: '23:30' }, 'fuso de Brasília')

const base: Omit<DataComemorativa, 'id' | 'nome' | 'regra' | 'mes'> = { descricao: null, categoria: 'saude', dia: null, semana: null, dia_da_semana: null, antecedencia_dias: 21, ativa: true }
const primeirosSocorros: DataComemorativa = { ...base, id: 'ps', nome: 'Primeiros Socorros', regra: 'nesimo_dia_semana', mes: 9, semana: 2, dia_da_semana: 6, antecedencia_dias: 30 }
const setembroAmarelo: DataComemorativa = { ...base, id: 'sa', nome: 'Setembro Amarelo', regra: 'mes', mes: 9 }
const cruzVermelha: DataComemorativa = { ...base, id: 'cv', nome: 'Dia Mundial da Cruz Vermelha', regra: 'fixa', mes: 5, dia: 8 }
const bissexto: DataComemorativa = { ...base, id: 'bx', nome: 'Dia 29/2', regra: 'fixa', mes: 2, dia: 29 }
const inativa: DataComemorativa = { ...cruzVermelha, id: 'in', ativa: false }
igual(ocorrenciaNoAno(setembroAmarelo, 2026)?.ate, '2026-09-30', 'mês temático vai até o fim do mês')
igual(ocorrenciaNoAno(bissexto, 2027)?.dia, '2027-02-28', '29/2 fora do bissexto cai no dia 28')
igual(
  ocorrenciasEntre([primeirosSocorros, setembroAmarelo, cruzVermelha, inativa], '2026-09-20', '2027-05-10').map((o) => `${o.data.id}:${o.dia}`),
  ['sa:2026-09-01', 'cv:2027-05-08'],
  'ocorrências na janela (mês em andamento entra; data passada e inativa, não)',
)
igual(descreverRegra(primeirosSocorros), '2º sábado de setembro', 'descrição da regra n-ésima')
igual(descreverRegra({ regra: 'nesimo_dia_semana', mes: 5, dia: null, semana: -1, dia_da_semana: 0 }), 'Último domingo de maio', 'descrição do último')
igual(descreverRegra(cruzVermelha), '8 de maio', 'descrição da regra fixa')
igual(lerCamadas(['financeiro', 'nada', 'financeiro', 3]), ['financeiro'], 'lerCamadas limpa e tira repetidas')
verdade(!CAMADAS_DO_ICS.includes('financeiro') && !CAMADAS_DO_ICS.includes('aniversarios'), 'ICS sem camadas sensíveis')

// ── Alertas ─────────────────────────────────────────────────────────────────
const agora = { dia: '2026-09-26', hora: '10:00' } // sábado
const item = (p: Partial<ItemDaAgenda> & Pick<ItemDaAgenda, 'id' | 'camada' | 'dia'>): ItemDaAgenda => ({ titulo: p.id, ...p })
const itens: ItemDaAgenda[] = [
  item({ id: 'dc1', camada: 'datas', titulo: 'Dia do Voluntário', dia: '2026-10-10', dataComemorativaId: 'x', antecedencia: 21, temPauta: false }),
  item({ id: 'dc2', camada: 'datas', titulo: 'Outubro Rosa', dia: '2026-10-01', ate: '2026-10-31', dataComemorativaId: 'y', antecedencia: 21, temPauta: true }),
  item({ id: 'dc3', camada: 'datas', titulo: 'Longe', dia: '2026-12-05', dataComemorativaId: 'z', antecedencia: 30, temPauta: false }),
  item({ id: 'p1', camada: 'publicacoes', titulo: 'Post A', dia: '2026-09-27', hora: '09:00', estado: 'em_aprovacao', canal: 'Instagram' }),
  item({ id: 'p2', camada: 'publicacoes', dia: '2026-10-12', canal: 'Instagram', estado: 'agendado' }),
  item({ id: 'p3', camada: 'publicacoes', dia: '2026-10-12', canal: 'Instagram', estado: 'agendado' }),
  item({ id: 'p4', camada: 'publicacoes', dia: '2026-10-12', canal: 'Instagram', estado: 'aprovado' }),
  item({ id: 'p5', camada: 'publicacoes', dia: '2026-10-20', hora: '10:00', estado: 'rascunho' }),
  item({ id: 'f1', camada: 'financeiro', titulo: 'Aluguel', dia: '2026-09-30' }),
  item({ id: 'f2', camada: 'financeiro', titulo: 'Luz', dia: '2026-09-20' }),
  item({ id: 'f3', camada: 'financeiro', titulo: 'Longe', dia: '2026-11-20' }),
]
const alertas = alertasDaAgenda(itens, agora)
const ids = alertas.map((a) => a.id)
verdade(ids.includes('data:dc1'), 'data comemorativa dentro da antecedência sem pauta')
verdade(!ids.includes('data:dc2'), 'data com pauta não alerta')
verdade(!ids.includes('data:dc3'), 'data longe não alerta')
igual(alertas.find((a) => a.id === 'data:dc1')?.criarPauta, { dataComemorativaId: 'x', ano: 2026, nome: 'Dia do Voluntário', dia: '2026-10-10' }, 'alerta oferece criar pauta')
verdade(!ids.includes('semana:2026-09-21'), 'semana atual tem publicação (p1 no domingo)')
verdade(ids.includes('semana:2026-09-28'), 'próxima semana vazia')
verdade(ids.includes('canal:2026-10-12|Instagram'), '3 posts no mesmo canal no mesmo dia')
verdade(ids.includes('aprovacao:p1'), 'post em 23 h sem aprovação')
verdade(!ids.includes('aprovacao:p5'), 'post daqui a semanas não cobra aprovação ainda')
verdade(ids.includes('feriado:p2'), 'post em 12/10 cai em feriado')
verdade(ids.includes('vence:f1') && ids.includes('vence:f2') && !ids.includes('vence:f3'), 'vencimentos próximos e vencidos')
igual(alertas.find((a) => a.id === 'vence:f2')?.nivel, 'urgente', 'conta vencida é urgente')
igual(alertas[0].nivel, 'urgente', 'alertas urgentes primeiro')
igual(alertasDaAgenda([], agora).map((a) => a.id), ['semana:2026-09-21', 'semana:2026-09-28'], 'agenda vazia só avisa as semanas')

// ── ICS ─────────────────────────────────────────────────────────────────────
igual(escaparTexto('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne', 'escape do ICS')
igual(brasiliaParaUtc('2026-09-26', '22:30'), '20260927T013000Z', 'hora de Brasília em UTC (vira o dia)')
igual(brasiliaParaUtc('2026-09-26', '09:00', 60), '20260926T130000Z', 'fim com duração')
const longa = 'SUMMARY:' + 'Ação de vacinação '.repeat(8)
const dobrada = dobrarLinha(longa)
verdade(dobrada.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'linhas dobradas com até 75 octetos')
igual(dobrada.split('\r\n ').join(''), longa, 'dobra não perde nem parte caractere')
const ics = gerarIcs([
  item({ id: 'pub:1', camada: 'publicacoes', titulo: 'Post, com vírgula', dia: '2026-10-01', hora: '09:00', canal: 'Instagram', href: '/redes/1' }),
  item({ id: 'data:sa:2026', camada: 'datas', titulo: 'Setembro Amarelo', dia: '2026-09-01', ate: '2026-09-30' }),
], { nome: 'Agenda', baseUrl: 'https://exemplo.org/', agora: new Date('2026-09-26T12:00:00Z') })
verdade(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'), 'ICS com CRLF')
verdade(ics.includes('DTSTART:20261001T120000Z') && ics.includes('DTEND:20261001T130000Z'), 'evento com hora em UTC')
verdade(ics.includes('DTSTART;VALUE=DATE:20260901') && ics.includes('DTEND;VALUE=DATE:20261001'), 'mês inteiro com DTEND exclusivo')
verdade(ics.includes('SUMMARY:Post\\, com vírgula') && ics.includes('URL:https://exemplo.org/redes/1'), 'resumo escapado e link')
verdade(ics.includes('UID:data-sa-2026@palaciovirtual'), 'UID estável')

// ── Visões ──────────────────────────────────────────────────────────────────
const mes = janelaDaVisao('mes', '2026-09-26')
igual([mes.de, mes.ate, mes.titulo, mes.anterior, mes.proximo], ['2026-08-30', '2026-10-03', 'Setembro de 2026', '2026-08-01', '2026-10-01'], 'janela do mês')
const dez = janelaDaVisao('mes', '2026-12-10')
igual([dez.anterior, dez.proximo], ['2026-11-01', '2027-01-01'], 'dezembro vira o ano')
const semana = janelaDaVisao('semana', '2026-09-30')
igual([semana.de, semana.ate, semana.titulo], ['2026-09-27', '2026-10-03', '27 de set. a 3 de out. de 2026'], 'janela da semana entre meses')
igual(janelaDaVisao('lista', '2026-09-26').ate, '2026-10-25', 'lista de 30 dias')
verdade(ehLongo(item({ id: 'm', camada: 'datas', dia: '2026-09-01', ate: '2026-09-30' })) && !ehLongo(item({ id: 'c', camada: 'escola', dia: '2026-09-01', ate: '2026-09-03' })), 'itens longos vão para a faixa')
verdade(noDia(item({ id: 'c', camada: 'escola', dia: '2026-09-01', ate: '2026-09-03' }), '2026-09-02'), 'item de vários dias aparece no meio')
igual(janelasParaCarregar({ de: '2026-08-30', ate: '2026-10-03' }, { de: '2026-09-19', ate: '2026-11-25' }), [{ de: '2026-08-30', ate: '2026-11-25' }], 'janela perto: uma leitura só')
igual(janelasParaCarregar({ de: '2027-05-30', ate: '2027-07-03' }, { de: '2026-09-19', ate: '2026-11-25' }).length, 2, 'janela longe: duas leituras')

if (falhas) { console.error(`\n${falhas} verificação(ões) falharam.`); process.exit(1) }
console.log('Agenda: tudo certo.')
