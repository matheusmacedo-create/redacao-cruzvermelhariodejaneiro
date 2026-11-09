/**
 * Confere as regras puras das campanhas de imprensa, sem rede nem banco:
 * a assinatura e a leitura do webhook do Resend (lib/imprensa/webhook.ts) e o
 * agendamento, a repetição de lote e os alertas de entrega (lib/imprensa/campanha.ts).
 * O lado do banco (fila, supressão, eventos) está em supabase/tests/fila-de-campanhas.test.sql.
 *
 *   npx tsx scripts/conferir-campanhas.ts
 */
import { createHmac, randomBytes } from 'node:crypto'
import { assinaturaConfere, interpretarEvento, JANELA_EM_SEGUNDOS } from '../lib/imprensa/webhook'
import {
  agendamentoParaLer, alertaDeEntrega, DIAS_DE_AGENDAMENTO, lerAgendamento, minimoDoAgendamento, motivoDeFora,
  podeTerSaido, taxas, TENTATIVAS_A_MAIS, valeTentarDeNovo, type NumerosDeCampanhas,
} from '../lib/imprensa/campanha'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${ok ? '' : `\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`}`)
}

// ---------------------------------------------------------------- assinatura (padrão Svix)

// Segredo sorteado a cada execução: nenhum valor de verdade mora neste arquivo.
const bytes = randomBytes(24)
const segredo = `whsec_${bytes.toString('base64')}`
const outro = `whsec_${randomBytes(24).toString('base64')}`
const agoraMs = Date.parse('2026-11-09T15:00:00Z')
const ts = String(agoraMs / 1000)
const id = 'msg_teste_1'
const corpo = '{"type":"email.delivered","data":{"email_id":"e1","to":["a@b.invalid"]}}'
// Conta feita aqui, à parte da implementação: HMAC-SHA256 dos bytes do segredo sobre "id.timestamp.corpo".
const assinar = (chave: Buffer, i: string, t: string, c: string) => `v1,${createHmac('sha256', chave).update(`${i}.${t}.${c}`).digest('base64')}`
const boa = assinar(bytes, id, ts, corpo)

confere('assinatura certa confere', assinaturaConfere(segredo, { id, timestamp: ts, assinatura: boa }, corpo, agoraMs), true)
confere('segredo sem o prefixo whsec_ também serve', assinaturaConfere(bytes.toString('base64'), { id, timestamp: ts, assinatura: boa }, corpo, agoraMs), true)
confere('outro segredo não confere', assinaturaConfere(outro, { id, timestamp: ts, assinatura: boa }, corpo, agoraMs), false)
confere('corpo alterado não confere', assinaturaConfere(segredo, { id, timestamp: ts, assinatura: boa }, corpo.replace('e1', 'e2'), agoraMs), false)
confere('outro id não confere', assinaturaConfere(segredo, { id: 'msg_outro', timestamp: ts, assinatura: boa }, corpo, agoraMs), false)
confere('várias assinaturas (troca de segredo): basta uma bater', assinaturaConfere(segredo, { id, timestamp: ts, assinatura: `v1,AAAA ${boa}` }, corpo, agoraMs), true)
confere('versão desconhecida é ignorada', assinaturaConfere(segredo, { id, timestamp: ts, assinatura: boa.replace('v1,', 'v2,') }, corpo, agoraMs), false)
confere('assinatura vazia não confere', assinaturaConfere(segredo, { id, timestamp: ts, assinatura: '' }, corpo, agoraMs), false)
confere('sem segredo, nada confere', assinaturaConfere('', { id, timestamp: ts, assinatura: boa }, corpo, agoraMs), false)
confere('segredo que não é base64 não confere', assinaturaConfere('whsec_', { id, timestamp: ts, assinatura: boa }, corpo, agoraMs), false)
const velho = String(agoraMs / 1000 - JANELA_EM_SEGUNDOS - 1)
confere('entrega antiga reenviada (replay) é recusada', assinaturaConfere(segredo, { id, timestamp: velho, assinatura: assinar(bytes, id, velho, corpo) }, corpo, agoraMs), false)
const quaseVelho = String(agoraMs / 1000 - JANELA_EM_SEGUNDOS + 5)
confere('dentro da janela, passa', assinaturaConfere(segredo, { id, timestamp: quaseVelho, assinatura: assinar(bytes, id, quaseVelho, corpo) }, corpo, agoraMs), true)
confere('timestamp que não é número é recusado', assinaturaConfere(segredo, { id, timestamp: 'ontem', assinatura: boa }, corpo, agoraMs), false)

// ---------------------------------------------------------------- eventos (formato da documentação do Resend)

const base = { email_id: '56761188-7520', from: 'Comunicação <imprensa@exemplo.invalid>', to: ['Ana@Jornal.invalid'], subject: 'Release' }
confere('entregue', interpretarEvento({ type: 'email.delivered', data: base }),
  { tipo: 'entregue', resendId: '56761188-7520', email: 'ana@jornal.invalid', detalhe: '' })
confere('devolução definitiva', interpretarEvento({ type: 'email.bounced', data: { ...base, bounce: { type: 'Permanent', subType: 'General', message: 'caixa inexistente' } } }),
  { tipo: 'devolucao', resendId: '56761188-7520', email: 'ana@jornal.invalid', detalhe: 'General: caixa inexistente' })
confere('devolução temporária não tira ninguém', interpretarEvento({ type: 'email.bounced', data: { ...base, bounce: { type: 'Transient', subType: 'MailboxFull', message: 'caixa cheia' } } }), null)
confere('devolução indeterminada não tira ninguém', interpretarEvento({ type: 'email.bounced', data: { ...base, bounce: { type: 'Undetermined' } } }), null)
confere('devolução sem tipo não tira ninguém', interpretarEvento({ type: 'email.bounced', data: base }), null)
confere('denúncia de spam', interpretarEvento({ type: 'email.complained', data: base })?.tipo, 'denuncia')
confere('barrado pela supressão do Resend', interpretarEvento({ type: 'email.suppressed', data: { ...base, suppressed: { type: 'OnAccountSuppressionList', message: 'on the account-level suppression list' } } }),
  { tipo: 'suprimido', resendId: '56761188-7520', email: 'ana@jornal.invalid', detalhe: 'on the account-level suppression list' })
confere('falha de envio (cota)', interpretarEvento({ type: 'email.failed', data: { ...base, failed: { reason: 'reached_daily_quota' } } }),
  { tipo: 'falha', resendId: '56761188-7520', email: 'ana@jornal.invalid', detalhe: 'reached_daily_quota' })
confere('destinatário como texto, não lista', interpretarEvento({ type: 'email.delivered', data: { email_id: 'x', to: 'b@c.invalid' } })?.email, 'b@c.invalid')
confere('motivo comprido é cortado em 500', interpretarEvento({ type: 'email.bounced', data: { ...base, bounce: { type: 'Permanent', message: 'x'.repeat(900) } } })?.detalhe.length, 500)
for (const tipo of ['email.opened', 'email.clicked', 'email.sent', 'email.delivery_delayed', 'email.scheduled', 'email.received', 'contact.created', 'domain.updated']) {
  confere(`${tipo} é aceito e ignorado`, interpretarEvento({ type: tipo, data: base }), null)
}
confere('evento sem id nem destinatário é ignorado', interpretarEvento({ type: 'email.delivered', data: {} }), null)
confere('corpo que não é objeto é ignorado', interpretarEvento('email.bounced'), null)
confere('nulo é ignorado', interpretarEvento(null), null)

const supressao = { id: 'e169aa45', email: 'Steve@Exemplo.invalid', source_id: '4ef9a417', created_at: '2026-11-17T19:32:22.980Z' }
confere('supressão por devolução', interpretarEvento({ type: 'suppression.added', data: { ...supressao, origin: 'bounce' } }),
  { tipo: 'devolucao', resendId: '4ef9a417', email: 'steve@exemplo.invalid', detalhe: 'Entrou na lista de supressão do Resend por devolução.' })
confere('supressão por denúncia', interpretarEvento({ type: 'suppression.added', data: { ...supressao, origin: 'complaint' } })?.tipo, 'denuncia')
confere('supressão posta à mão (sem mensagem de origem)', interpretarEvento({ type: 'suppression.added', data: { ...supressao, origin: 'manual', source_id: null } }),
  { tipo: 'suprimido', resendId: '', email: 'steve@exemplo.invalid', detalhe: 'Posto à mão na lista de supressão do Resend.' })
confere('tirado da supressão: liberado', interpretarEvento({ type: 'suppression.removed', data: { ...supressao, origin: 'bounce' } }),
  { tipo: 'liberado', resendId: '', email: 'steve@exemplo.invalid', detalhe: '' })
confere('supressão sem endereço é ignorada', interpretarEvento({ type: 'suppression.added', data: { origin: 'bounce' } }), null)

// ---------------------------------------------------------------- agendamento

const agora = new Date('2026-11-09T15:00:00Z') // 12:00 em Brasília
confere('vazio: sai agora', lerAgendamento('', agora), { quando: null })
confere('só espaços: sai agora', lerAgendamento('   ', agora), { quando: null })
confere('o campo da tela é horário de Brasília', lerAgendamento('2026-11-10T09:00', agora), { quando: '2026-11-10T12:00:00.000Z' })
confere('com segundos também', lerAgendamento('2026-11-10T09:00:30', agora), { quando: '2026-11-10T12:00:30.000Z' })
confere('instante completo (com fuso) é respeitado', lerAgendamento('2026-11-10T09:00:00Z', agora), { quando: '2026-11-10T09:00:00.000Z' })
confere('no passado: erro', 'erro' in lerAgendamento('2026-11-09T11:00', agora), true)
confere('em cima da hora (1 minuto): erro', 'erro' in lerAgendamento('2026-11-09T12:01', agora), true)
confere('cinco minutos à frente: agenda', lerAgendamento('2026-11-09T12:05', agora), { quando: '2026-11-09T15:05:00.000Z' })
confere(`além de ${DIAS_DE_AGENDAMENTO} dias: erro`, 'erro' in lerAgendamento('2027-03-01T09:00', agora), true)
confere(`dentro de ${DIAS_DE_AGENDAMENTO} dias: agenda`, 'quando' in lerAgendamento('2027-02-01T09:00', agora), true)
confere('texto que não é data: erro', 'erro' in lerAgendamento('amanhã cedo', agora), true)
confere('data impossível: erro', 'erro' in lerAgendamento('2026-13-40T09:00', agora), true)
confere('para ler na confirmação', agendamentoParaLer('2026-11-10T09:00'), '10/11/2026 às 09:00')
confere('para ler: valor quebrado vira vazio', agendamentoParaLer('ontem'), '')
confere('o mínimo do campo é agora em Brasília, mais a margem', minimoDoAgendamento(agora), '2026-11-09T12:03')
confere('o mínimo do campo passa na regra do servidor', 'quando' in lerAgendamento(minimoDoAgendamento(agora), agora), true)

// ---------------------------------------------------------------- repetir um lote

confere('tempo esgotado: tenta de novo', valeTentarDeNovo(0, 'O Resend demorou demais para responder.', 0), true)
confere('erro do lado do Resend (5xx): tenta de novo', valeTentarDeNovo(503, 'Service Unavailable', 1), true)
confere('mesmo pedido ainda em andamento (409): tenta de novo', valeTentarDeNovo(409, 'concurrent_idempotent_requests', 0), true)
confere('limite de chamadas por segundo (429): tenta de novo', valeTentarDeNovo(429, 'Too many requests', 0), true)
confere('cota do dia (429): não adianta repetir', valeTentarDeNovo(429, 'You have reached your daily email quota. Limite de envio atingido no plano do Resend.', 0), false)
confere('cota do mês (429): não adianta repetir', valeTentarDeNovo(429, 'monthly_quota_exceeded', 0), false)
confere('chave ou domínio recusados (403): não repete', valeTentarDeNovo(403, 'domain is not verified', 0), false)
confere('pedido inválido (422): não repete', valeTentarDeNovo(422, 'invalid from', 0), false)
confere(`depois de ${TENTATIVAS_A_MAIS} repetições, desiste`, valeTentarDeNovo(0, 'tempo esgotado', TENTATIVAS_A_MAIS), false)
confere('dúvida se saiu: tempo esgotado', podeTerSaido(0), true)
confere('dúvida se saiu: 5xx', podeTerSaido(500), true)
confere('dúvida se saiu: 409', podeTerSaido(409), true)
confere('recusa clara não deixa dúvida (403)', podeTerSaido(403), false)
confere('recusa clara não deixa dúvida (429)', podeTerSaido(429), false)

// ---------------------------------------------------------------- quem fica de fora, números e alertas

confere('pode receber', motivoDeFora({ email: 'a@b.invalid', emailStatus: 'valido', descadastradoEm: null }), null)
confere('sem e-mail', motivoDeFora({ email: null, emailStatus: 'nao_verificado', descadastradoEm: null }), 'sem_email')
confere('saiu da lista', motivoDeFora({ email: 'a@b.invalid', emailStatus: 'valido', descadastradoEm: '2026-11-01T00:00:00Z' }), 'descadastrado')
confere('devolveu: fora, mesmo que alguém remarque como válido', motivoDeFora({ email: 'a@b.invalid', emailStatus: 'valido', descadastradoEm: null, devolvidoEm: '2026-11-01T00:00:00Z' }), 'devolvido')
confere('inválido', motivoDeFora({ email: 'a@b.invalid', emailStatus: 'invalido', descadastradoEm: null }), 'invalido')
confere('arriscado ainda recebe', motivoDeFora({ email: 'a@b.invalid', emailStatus: 'arriscado', descadastradoEm: null, devolvidoEm: null }), null)

const zero: NumerosDeCampanhas = { enviados: 0, aberturasUnicas: 0, aberturasTotais: 0, cliquesUnicos: 0, cliquesTotais: 0, descadastros: 0, falhas: 0, devolucoes: 0, denuncias: 0 }
confere('taxa de devolução', taxas({ ...zero, enviados: 200, devolucoes: 9 }).devolucao, 4.5)
confere('taxa de denúncia', taxas({ ...zero, enviados: 1000, denuncias: 2 }).denuncia, 0.2)
confere('sem envio, as taxas são zero', [taxas(zero).devolucao, taxas(zero).denuncia], [0, 0])
confere('lista saudável: sem alerta', alertaDeEntrega({ ...zero, enviados: 500, devolucoes: 10, denuncias: 1 }), null)
confere('devolução acima de 4%: alerta', alertaDeEntrega({ ...zero, enviados: 200, devolucoes: 9 })?.startsWith('Devoluções em 4,5%'), true)
confere('exatamente 4% ainda não alerta', alertaDeEntrega({ ...zero, enviados: 200, devolucoes: 8 }), null)
confere('denúncia acima de 0,3%: alerta, e vem primeiro', alertaDeEntrega({ ...zero, enviados: 500, devolucoes: 30, denuncias: 2 })?.startsWith('Denúncias de spam em 0,4%'), true)
confere('pouco envio não alerta (uma devolução em dez)', alertaDeEntrega({ ...zero, enviados: 10, devolucoes: 1, denuncias: 1 }), null)

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
