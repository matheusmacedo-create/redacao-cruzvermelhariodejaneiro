/**
 * Confere o envio dos pagamentos da Escola à Meta (lib/escola/conversoes.ts):
 * `npx tsx scripts/conferir-conversoes-escola.ts`.
 */
import { createHash } from 'node:crypto'
import { categoriaDoProduto, fraseDoEnvio, lerPixelId, lerRespostaDeEventos, montarEvento, motivoParaNaoEnviar, normalizarPessoa, qualidadeDoEvento } from '../lib/escola/conversoes'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}

// Qual momento da trajetória.
igual(categoriaDoProduto('Taxa de inscrição — Punção Venosa'), 'taxa_de_inscricao', 'taxa com travessão')
igual(categoriaDoProduto('Taxa de Inscrição - Bombeiro Civil'), 'taxa_de_inscricao', 'taxa com hífen')
igual(categoriaDoProduto('Punção Venosa — Inscrição'), 'taxa_de_inscricao', 'sufixo inscrição')
igual(categoriaDoProduto('Primeiros Socorros Básico — Inscrição + Custos de processamento (opcional)'), 'taxa_de_inscricao', 'sufixo inscrição longo')
igual(categoriaDoProduto('Punção Venosa'), 'curso', 'curso puro')
igual(categoriaDoProduto('Primeiros Socorros Lei Lucas - Ambientes com Crianças'), 'curso', 'hífen no nome não é inscrição')
igual(categoriaDoProduto('Matrícula + Curso presencial'), 'curso', 'matrícula sem "inscrição" é curso')
igual(categoriaDoProduto(null), 'curso', 'sem produto: curso')

// O id do pixel.
igual(lerPixelId(' 1234567890123 '), '1234567890123', 'pixel com espaço')
igual(lerPixelId('123'), null, 'pixel curto demais')
igual(lerPixelId('act_123456'), null, 'id de conta de anúncios não é pixel')

// Dados da pessoa no formato da Meta.
igual(normalizarPessoa({ nome: 'Maria José da Silva', email: ' Maria.Silva@Exemplo.ORG ', telefone: '(21) 99999-8888', documento: '123.456.789-01' }),
  { em: 'maria.silva@exemplo.org', ph: '5521999998888', fn: 'maria', ln: 'silva' }, 'pessoa completa: o CPF não sai')
igual(normalizarPessoa({ nome: 'Ana', email: 'sem-arroba', telefone: '+55 21 3333-4444', documento: '12.345.678/0001-99' }),
  { em: null, ph: '552133334444', fn: 'ana', ln: null }, 'telefone fixo com +55, e-mail inválido, CNPJ fora')
igual(normalizarPessoa({ nome: null, email: null, telefone: '123', documento: null }), { em: null, ph: null, fn: null, ln: null }, 'telefone curto fora')
igual(normalizarPessoa({ nome: 'João-Pedro  Álvares', email: null, telefone: '021999998888', documento: null }).ph, '5521999998888', 'zero à esquerda sai')
igual(normalizarPessoa({ nome: 'João-Pedro  Álvares', email: null, telefone: null, documento: null }), { em: null, ph: null, fn: 'joao', ln: 'alvares' }, 'nome sem acento e sem hífen')

// Quando não envia.
const agora = new Date('2026-10-02T15:00:00Z')
const curso = { tipo: 'curso', cursoId: 'pv', manual: false } as const
igual(motivoParaNaoEnviar({ situacao: 'pago', valor: 15000, paga_em: '2026-10-01T10:00:00Z', produto: 'Punção Venosa' }, curso, agora), null, 'paga ontem: envia')
igual(motivoParaNaoEnviar({ situacao: 'em_disputa', valor: 15000, paga_em: '2026-10-01T10:00:00Z', produto: 'Punção Venosa' }, curso, agora), null, 'em disputa ainda é recebido: envia')
igual(motivoParaNaoEnviar({ situacao: 'pendente', valor: 15000, paga_em: null, produto: 'Punção Venosa' }, curso, agora), 'não está paga', 'pendente não envia')
igual(motivoParaNaoEnviar({ situacao: 'estornado', valor: 15000, paga_em: '2026-10-01T10:00:00Z', produto: 'Punção Venosa' }, curso, agora), 'não está paga', 'estornada não envia')
igual(motivoParaNaoEnviar({ situacao: 'pago', valor: 15000, paga_em: '2026-09-20T10:00:00Z', produto: 'Punção Venosa' }, curso, agora), 'paga há mais de 7 dias (a Meta não aceita)', 'venda velha não envia')
igual(motivoParaNaoEnviar({ situacao: 'pago', valor: 15000, paga_em: '2026-09-25T15:00:01Z', produto: 'Punção Venosa' }, curso, agora), null, 'no limite dos 7 dias envia')
igual(motivoParaNaoEnviar({ situacao: 'pago', valor: 15000, paga_em: '2026-10-01T10:00:00Z', produto: 'TESTE A 1real PIX' }, { tipo: 'teste' }, agora), 'produto de teste', 'produto de teste não envia')
igual(motivoParaNaoEnviar({ situacao: 'pago', valor: 15000, paga_em: '2026-10-01T10:00:00Z', produto: 'Curso' }, { tipo: 'ignorado' }, agora), 'produto ignorado pela equipe', 'ignorado não envia')
igual(motivoParaNaoEnviar({ situacao: 'pago', valor: 15000, paga_em: '2026-10-01T10:00:00Z', produto: 'Matrícula' }, { tipo: 'sem_curso' }, agora), null, 'sem curso conhecido ainda envia')
igual(motivoParaNaoEnviar({ situacao: 'pago', valor: 0, paga_em: '2026-10-01T10:00:00Z', produto: 'Punção Venosa' }, curso, agora), 'sem valor', 'valor zero não envia')

// O evento.
const t = { hash: 'abc123', situacao: 'pago' as const, valor: 15090, produto: 'Taxa de inscrição — Punção Venosa', paga_em: '2026-10-01T10:00:00.000Z', pessoa: { nome: 'Maria José da Silva', email: 'maria@exemplo.org', telefone: '21999998888', documento: '12345678901' } }
const e = montarEvento(t, { categoria: 'taxa_de_inscricao', curso: 'Punção Venosa', pagina: 'https://escola.exemplo.org/puncao', hash: sha })
igual(e.event_name, 'Purchase', 'evento Purchase')
igual(e.event_time, Math.floor(Date.parse('2026-10-01T10:00:00Z') / 1000), 'hora do pagamento em segundos')
igual(e.event_id, 'unicopag:abc123', 'id do evento é o hash da Únicopag')
igual(e.action_source, 'website', 'com página é website')
igual(e.event_source_url, 'https://escola.exemplo.org/puncao', 'página do curso')
igual(e.custom_data, { currency: 'BRL', value: 150.9, content_category: 'taxa_de_inscricao', content_name: 'Punção Venosa', content_type: 'product', content_ids: ['Taxa de inscrição — Punção Venosa'], order_id: 'abc123', num_items: 1 }, 'custom_data da taxa')
igual(e.user_data.em, [sha('maria@exemplo.org')], 'e-mail com hash')
igual(e.user_data.ph, [sha('5521999998888')], 'telefone com hash e 55')
igual(e.user_data.fn, [sha('maria')], 'primeiro nome com hash')
igual(e.user_data.ln, [sha('silva')], 'último nome com hash')
// O CPF nunca vai à Meta (os Termos das Ferramentas de Negócios proíbem número de documento): nem em claro, nem com hash.
igual('external_id' in e.user_data, false, 'sem external_id na user_data')
igual(Object.keys(e.user_data).sort(), ['country', 'em', 'fn', 'ln', 'ph'], 'user_data só com e-mail, telefone, nome e país')
igual(Object.values(e.user_data).flat().includes(sha('12345678901')), false, 'o hash do CPF não sai')
igual(JSON.stringify(e).includes('12345678901'), false, 'o CPF não aparece em claro no evento')
const soCpf = montarEvento({ ...t, pessoa: { nome: null, email: null, telefone: null, documento: '123.456.789-01' } }, { categoria: 'curso', curso: 'X', pagina: null, hash: sha })
igual(Object.keys(soCpf.user_data), ['country'], 'só com CPF: a user_data leva só o país')
igual(qualidadeDoEvento(soCpf), 'nenhuma', 'só com CPF: nenhuma')
igual(e.user_data.country, [sha('br')], 'país')
igual(Object.values(e.user_data).flat().every((h) => /^[0-9a-f]{64}$/.test(h)), true, 'nada em claro na user_data')
igual(JSON.stringify(e).includes('maria@'), false, 'o e-mail não aparece em claro no evento')
igual(qualidadeDoEvento(e), 'boa', 'com e-mail: boa')
const e2 = montarEvento({ ...t, pessoa: { nome: 'Maria', email: null, telefone: null, documento: null } }, { categoria: 'curso', curso: 'Punção Venosa', pagina: null, hash: sha })
igual(e2.action_source, 'other', 'sem página é other')
igual('event_source_url' in e2, false, 'sem página não manda endereço')
igual(e2.custom_data.content_category, 'curso', 'categoria curso')
igual(qualidadeDoEvento(e2), 'fraca', 'só nome: fraca')
igual(qualidadeDoEvento(montarEvento({ ...t, pessoa: { nome: null, email: null, telefone: '21999998888', documento: null } }, { categoria: 'curso', curso: 'X', pagina: null, hash: sha })), 'boa', 'só telefone: boa')
igual(qualidadeDoEvento(montarEvento({ ...t, pessoa: null }, { categoria: 'curso', curso: 'X', pagina: null, hash: sha })), 'nenhuma', 'sem pessoa: nenhuma')
igual(montarEvento({ ...t, produto: null }, { categoria: 'curso', curso: 'Punção Venosa', pagina: null, hash: sha }).custom_data.content_ids, ['Punção Venosa'], 'sem produto, o id é o curso')

// A resposta da Meta e a frase.
igual(lerRespostaDeEventos({ events_received: 2, messages: [], fbtrace_id: 'AbC' }), { recebidos: 2, rastro: 'AbC' }, 'resposta normal')
igual(lerRespostaDeEventos({ error: { message: 'x' } }), null, 'resposta de erro')
igual(lerRespostaDeEventos('x'), null, 'resposta estranha')
igual(fraseDoEnvio({ enviados: 0, falhas: 0, semPessoa: 0 }), '', 'nada a dizer')
igual(fraseDoEnvio({ enviados: 1, falhas: 0, semPessoa: 0 }), ' 1 evento enviado à Meta.', 'um evento')
igual(fraseDoEnvio({ enviados: 3, falhas: 1, semPessoa: 2 }), ' 3 eventos enviados à Meta, 1 falhou (2 sem e-mail nem telefone: a Meta pode não casar com ninguém).', 'com falha e aviso')

console.log(falhas ? `${falhas} falha(s)` : 'Tudo certo.')
process.exit(falhas ? 1 : 0)
