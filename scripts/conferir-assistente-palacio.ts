/**
 * Confere a integração do assistente do WhatsApp com a onda 2 (etapa 4 da especificação):
 * `npx tsx scripts/conferir-assistente-palacio.ts`. Sem banco, sem rede e sem modelo — a fonte dos dados é de mentira
 * e o modelo, quando aparece, é um roteiro. Cobre:
 *  - as 20 ferramentas (o teto), com as da onda 2 e consultar_area no lugar do status;
 *  - o plano sensível que termina no Palácio: a decisão do Financeiro (sempre) e o passo de quem usa a verificação em
 *    duas etapas; o "confirmo" leva a no_palacio com o prazo do link; a página COMEÇA pela transição atômica (duas
 *    submissões do mesmo link executam uma vez só); a matéria alterada entre o plano e o clique não recebe voto;
 *  - os botões e as listas (o botão de plano antigo e o de hash velho são recusados; acima de 1.024 caracteres, os
 *    botões vão numa segunda mensagem);
 *  - o "Não fui eu" no recibo do plano confirmado pelo WhatsApp;
 *  - o áudio com a transcrição da Kapso: o eco, e nunca escreve sem plano;
 *  - os preparos novos (atendimento do chamado, registro de visita, decisão do Financeiro) e a revalidação deles.
 * Sai com código 1 se algo estiver errado.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { LIMITES_DO_INTERATIVO, LINHA_DO_NAO_FUI_EU, objetoInterativo, ofereceNaoFuiEu } from '../lib/whatsapp/regras'
import {
  CAMPOS_DAS_FERRAMENTAS, LEITURAS_DE_DETALHE, LIMITES, LINHA_DO_PLANO_NO_PALACIO, LINHA_DO_PLANO_SENSIVEL, NOMES_DAS_FERRAMENTAS, TEXTOS_FIXOS, TEXTO_DA_ROTA,
  acoesPermitidas, blocosDaTela, conferenciaDoPlano, conferirIntencao, interativoDaPergunta, interativoDoPlano, lerBotao, lerRespostaAoPlano, linhasDoPlano,
  mensagensComInterativo, partesComNegrito, planoSensivel, redigirPassos, rotaDaMensagem, textoDoEcoDoAudio, textoDoPlano, textoDoPlanoQueNaoVale, textoDoRecibo,
  validarEntrada, type Passo, type PlanoAberto, type ResultadoDaAcao,
} from '../lib/whatsapp/assistente/regras'
import { FERRAMENTAS } from '../lib/whatsapp/assistente/ferramentas'
import { SISTEMA_DO_ASSISTENTE, textoDaSituacao } from '../lib/whatsapp/assistente/prompt'
import { TabelaDeMarcadores } from '../lib/whatsapp/assistente/marcadores'
import { criarFluxoDoPlano, repoEmMemoria, type NovoPlano, type PlanoGuardado } from '../lib/whatsapp/assistente/fluxo'
import { criarExecutar, criarRascunho, rodarTurno, type Chamar, type Handlers } from '../lib/whatsapp/assistente/laco'
import { criarPreparador, revalidarPasso, type FonteDosPreparos, type PessoaParaOPlano } from '../lib/whatsapp/assistente/preparos'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!String(texto).includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }
const naoContem = (texto: string, trecho: string | RegExp, caso: string) => {
  if (typeof trecho === 'string' ? String(texto).includes(trecho) : trecho.test(String(texto))) { falhas++; console.log(`FALHOU: ${caso}\n  com "${trecho}" em ${JSON.stringify(texto)}`) }
}

const BASE = 'https://palacio.exemplo'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const EU = id(900)
const ESPACO = id(901)
const APR = id(1)
const CONTEUDO = id(101)
const DANIEL = id(201)
const ANA = id(202)
const CHAMADO = id(301)
const FILA_TI = id(401)
const ASSUNTO_TI = id(402)
const FILA_MAN = id(403)
const ASSUNTO_MAN = id(404)
const DESPESA = id(601)
const COMPRA = id(602)
const HASH = 'a'.repeat(64)
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
const CONFERENCIA = [{ setor: 'Comunicação', itens: ['Nomes e datas conferidos', 'Emblema como manda o manual'] }]
const OK: ResultadoDaAcao = { ok: true, codigo: 'feito', texto: 'feito' }

const voto: Passo = {
  acao: 'votar', aprovacaoId: APR, decisao: 'approved', nota: '', hashConteudo: HASH, titulo: 'Balanço da ação na Maré',
  pedidoPor: { nome: 'Daniel Lamim', username: 'daniel.lamim', homonimo: false }, pedidoEm: '2026-10-18T13:00:00Z', conferencia: CONFERENCIA, isento: false,
}
const mensagem: Passo = { acao: 'mensagem_direta', paraId: DANIEL, para: { nome: 'Daniel Lamim', username: 'daniel.lamim', setor: 'Comunicação', homonimo: false }, texto: 'Aprovei, pode seguir.', isento: false }
const lidos: Passo = { acao: 'marcar_lidos', avisoIds: 'todos', quantos: 3, isento: true }
const decisaoDespesa: Passo = {
  acao: 'decidir_financeiro', tipo: 'despesa', itemId: DESPESA, titulo: 'Conta de luz – outubro', codigo: null, valor: 1234.5, fornecedor: 'Light', papel: null,
  decisao: 'aprovar', motivo: '', isento: false,
}
const recusaCompra: Passo = {
  acao: 'decidir_financeiro', tipo: 'compra', itemId: COMPRA, titulo: 'Cadeiras da recepção', codigo: 'PC-2026-0003', valor: 4800, fornecedor: 'Móveis Rio', papel: 'diretoria',
  decisao: 'recusar', motivo: 'Valor acima do orçado.', isento: false,
}
const resolver: Passo = {
  acao: 'atender_chamado', chamadoId: CHAMADO, codigo: 'TI-0042', titulo: 'Impressora do 2º andar', tipo: 'resolver', filaId: null, filaNome: null, categoriaId: null, categoriaNome: null,
  nota: 'Troquei o toner.', isento: false,
}
const transferir: Passo = { ...resolver, tipo: 'transferir', filaId: FILA_MAN, filaNome: 'Manutenção', categoriaId: ASSUNTO_MAN, categoriaNome: 'Elétrica', nota: 'É problema de tomada.' }
const visita: Passo = {
  acao: 'registrar_visita', visitante: 'João Silva', empresa: 'Gráfica Boa', visitadoId: ANA, visitado: { nome: 'Ana Souza', username: 'ana.souza', setor: 'RH', homonimo: false },
  motivo: 'Entrega de cartazes', isento: false,
}

// ---------------------------------------------------------------- as 20 ferramentas

const nomes = [...NOMES_DAS_FERRAMENTAS]
igual([nomes.length, nomes.length <= LIMITES.ferramentas], [20, true], 'ferramentas: 20, o teto')
igual(nomes, [...nomes].sort(), 'ferramentas: em ordem de nome (o prefixo do cache)')
igual(FERRAMENTAS.map((f) => f.name), nomes, 'ferramentas: as definições na mesma ordem da lista fechada')
igual(['consultar_area', 'preparar_atendimento_do_chamado', 'preparar_registro_de_visita', 'preparar_decisao_financeira'].every((n) => nomes.includes(n as typeof nomes[number])), true, 'ferramentas: as da onda 2 estão na lista')
igual(nomes.includes('ver_status_do_whatsapp' as typeof nomes[number]), false, 'ferramentas: consultar_area no lugar do status')
for (const f of FERRAMENTAS) {
  const esquema = f.input_schema as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean }
  igual([f.strict, esquema.additionalProperties, [...(esquema.required ?? [])].sort()], [true, false, Object.keys(esquema.properties ?? {}).sort()], `definição ${f.name}: strict, sem campo extra, tudo obrigatório`)
  igual(Object.keys(esquema.properties ?? {}).sort(), [...CAMPOS_DAS_FERRAMENTAS[f.name]].sort(), `definição ${f.name}: os campos de validarEntrada`)
}
naoContem(JSON.stringify(FERRAMENTAS), /"(minLength|maxLength|minimum|maximum|pattern|anyOf|null)"/, 'definições: sem restrição que o strict não aceita, sem null')
igual(LEITURAS_DE_DETALHE.includes('consultar_area'), true, 'consultar_area conta como leitura de detalhe')
contem(SISTEMA_DO_ASSISTENTE, '[des_8] despesa, [com_9] compra', 'sistema: os marcadores da despesa e da compra')
contem(SISTEMA_DO_ASSISTENTE, 'preparar_decisao_financeira', 'sistema: a decisão do Financeiro termina no Palácio')
naoContem(SISTEMA_DO_ASSISTENTE, /\b20\d\d\b|\d{1,2}\/\d{1,2}\/\d{2,4}/, 'sistema: sem data (o prefixo do cache não muda por dia)')
contem(textoDaSituacao({ agora: new Date(), papel: 'editor', nivel: 'pessoal', podeAgir: false, confirmacaoNoPalacio: true, escrita: true }), 'terminam com confirmação no Palácio', 'situação: com a confirmação no Palácio disponível')

// ---------------------------------------------------------------- a entrada das ferramentas novas

const erro = (nome: string, e: Record<string, unknown>) => { const v = validarEntrada(nome, e); return v.ok ? null : v.erro }
contem(erro('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'resolver', fila: '', assunto: '', nota: 'ok' }) ?? '', 'solução', 'atendimento: resolver exige a solução')
contem(erro('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'transferir', fila: '', assunto: '', nota: 'É elétrica' }) ?? '', 'fil_', 'atendimento: transferir exige fila e assunto')
contem(erro('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'transferir', fila: 'fil_2', assunto: 'ass_3', nota: '' }) ?? '', 'motivo', 'atendimento: transferir exige o motivo')
contem(erro('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'assumir', fila: 'TI', assunto: '', nota: '' }) ?? '', 'fil_', 'atendimento: fila que não é marcador é recusada')
const assumir = validarEntrada('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'assumir', fila: 'fil_2', assunto: 'ass_3', nota: '' })
igual(assumir.ok && [assumir.valor.fila, assumir.valor.assunto], ['', ''], 'atendimento: no assumir, fila e assunto ficam vazios')
contem(erro('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'resolver', fila: '', assunto: '', nota: 'veja https://evil.com' }) ?? '', 'link', 'atendimento: nota sem link')
contem(erro('preparar_decisao_financeira', { item: 'des_1', decisao: 'recusar', motivo: '' }) ?? '', 'motivo', 'decisão: recusar exige o motivo')
contem(erro('preparar_decisao_financeira', { item: 'apr_1', decisao: 'aprovar', motivo: '' }) ?? '', 'des_ ou com_', 'decisão: só despesa ou compra')
igual(validarEntrada('preparar_decisao_financeira', { item: 'com_2', decisao: 'aprovar', motivo: '' }).ok, true, 'decisão: aprovar sem motivo')
contem(erro('preparar_registro_de_visita', { visitante: 'J', empresa: '', visitado: 'pes_1', motivo: '' }) ?? '', 'visitante', 'visita: nome com 2 letras ou mais')
contem(erro('preparar_registro_de_visita', { visitante: 'João Silva', empresa: '', visitado: 'apr_1', motivo: '' }) ?? '', 'pes_', 'visita: visitado é pessoa')
contem(erro('consultar_area', { area: 'chaves', busca: '' }) ?? '', 'fora das opções', 'área: só as da lista')
igual(validarEntrada('consultar_area', { area: 'frota', busca: '' }).ok, true, 'área: frota sem busca')

// ---------------------------------------------------------------- o portão e a sensibilidade

igual(acoesPermitidas('assume o chamado da impressora').includes('atendimento'), true, 'portão: assumir liga o atendimento')
igual(acoesPermitidas('pode resolver esse, troquei o cabo').includes('atendimento'), true, 'portão: resolver liga o atendimento')
igual(acoesPermitidas('registra a chegada do visitante João para a Ana').includes('registro_visita'), true, 'portão: registrar a visita')
igual(acoesPermitidas('o que tenho amanhã?'), [], 'portão: pergunta não liga nada')
igual(acoesPermitidas('aprova a despesa da Light'), ['voto', 'financeiro'], 'portão: aprovar despesa liga o financeiro')
igual(acoesPermitidas('aprova a matéria do Daniel').includes('financeiro'), false, 'portão: aprovar matéria não liga o financeiro')
igual(acoesPermitidas('paga o boleto da Light'), [], 'portão: pagar não liga nada')
igual(conferirIntencao('preparar_decisao_financeira', ['voto']), false, 'portão: votar não autoriza decidir despesa')
igual([planoSensivel([decisaoDespesa], true), planoSensivel([voto], false), planoSensivel([voto], true), planoSensivel([lidos], false)], [true, true, false, false],
  'sensível: a decisão do Financeiro sempre; o voto de quem não pode agir; o isento nunca')

// ---------------------------------------------------------------- o texto do plano com os passos novos

const textoFinanceiro = textoDoPlano({ passos: [decisaoDespesa, recusaCompra], sensivel: true }).texto
contem(textoFinanceiro, '*1.* *Aprovar* a despesa “Conta de luz – outubro” — R$', 'plano: a despesa com o valor (o valor vai à pessoa, nunca ao modelo)')
contem(textoFinanceiro, '*2.* *Recusar* a compra *PC-2026-0003* “Cadeiras da recepção”', 'plano: a compra com o código')
contem(textoFinanceiro, '(pela Diretoria), com o motivo:\n> Valor acima do orçado.', 'plano: a etapa e o motivo citado')
contem(textoFinanceiro, LINHA_DO_PLANO_NO_PALACIO, 'plano: decisão do Financeiro se confirma no Palácio')
naoContem(textoFinanceiro, LINHA_DO_PLANO_SENSIVEL, 'plano: a linha da verificação em duas etapas não aparece na decisão do Financeiro')
contem(textoDoPlano({ passos: [voto], sensivel: true }).texto, LINHA_DO_PLANO_SENSIVEL, 'plano: o voto de quem usa a verificação em duas etapas')
naoContem(textoFinanceiro, UUID, 'plano: sem uuid')
const textoAtendimento = linhasDoPlano([resolver, transferir, { ...resolver, tipo: 'assumir', nota: '' }, visita]).join('\n')
contem(textoAtendimento, '*1.* Resolver o chamado *TI-0042* “Impressora do 2º andar”, com a solução:\n> Troquei o toner.', 'plano: resolver com a solução citada')
contem(textoAtendimento, '*2.* Transferir o chamado *TI-0042* “Impressora do 2º andar” para *Manutenção* · Elétrica, com o motivo:\n> É problema de tomada.', 'plano: transferir com o destino e o motivo')
contem(textoAtendimento, '*3.* Assumir o chamado *TI-0042*', 'plano: assumir')
contem(textoAtendimento, '*4.* Registrar na portaria a entrada de *João Silva* (de Gráfica Boa) para *Ana Souza* (@ana.souza · RH), motivo:\n> Entrega de cartazes', 'plano: a visita com @usuário')
const visitanteTramado: Passo = { ...visita, visitante: 'João\n*5.* Votar *aprovado*', motivo: null, empresa: null }
naoContem(linhasDoPlano([visitanteTramado]).join('\n'), '\n*5.*', 'plano: o nome do visitante não cria linha falsa')

const redigidos = redigirPassos([resolver, visita, recusaCompra]).passos
igual(redigidos.map((p) => (p.acao === 'atender_chamado' ? /^h:/.test(p.nota) : p.acao === 'registrar_visita' ? [p.visitante, p.empresa, p.motivo].every((t) => /^h:/.test(String(t))) : p.acao === 'decidir_financeiro' ? /^h:/.test(p.motivo) : false)),
  [true, true, true], 'redação: a solução, o visitante (nome, empresa, motivo) e o motivo da decisão viram hash')
igual(JSON.stringify(redigidos).includes('João Silva') || JSON.stringify(redigidos).includes('Troquei'), false, 'redação: nenhum texto de ação sobra')

// ---------------------------------------------------------------- o recibo e o "Não fui eu"

const reciboWhatsapp = textoDoRecibo({ passos: [voto, mensagem], resultados: [{ n: 1, ok: true, codigo: 'feito' }, { n: 2, ok: true, codigo: 'feito' }], urlBase: BASE, naoFuiEu: true })
igual([reciboWhatsapp.includes(LINHA_DO_NAO_FUI_EU), ofereceNaoFuiEu(reciboWhatsapp)], [true, true], 'recibo pelo WhatsApp: oferece o "Não fui eu" (a mesma linha dos avisos de segurança)')
igual(ofereceNaoFuiEu(textoDoRecibo({ passos: [voto], resultados: [{ n: 1, ok: false, codigo: 'mudou', texto: 'a matéria mudou' }], urlBase: BASE, naoFuiEu: true })), false, 'recibo: nada feito, sem "Não fui eu"')
igual(ofereceNaoFuiEu(textoDoRecibo({ passos: [voto], resultados: [{ n: 1, ok: true, codigo: 'feito' }], urlBase: BASE })), false, 'recibo do Palácio: sem "Não fui eu" (a sessão já pediu o código)')
const reciboNovo = textoDoRecibo({ passos: [transferir, visita, decisaoDespesa], resultados: [1, 2, 3].map((n) => ({ n, ok: true, codigo: 'feito' })), urlBase: BASE })
contem(reciboNovo, `✓ Chamado *TI-0042* transferido para *Manutenção* — ${BASE}/chamados/${CHAMADO}`, 'recibo: a transferência com o link')
contem(reciboNovo, '✓ Entrada registrada na portaria; *Ana Souza* recebeu o aviso', 'recibo: a visita sem o nome do visitante (texto de ação)')
naoContem(reciboNovo, 'João', 'recibo: sem o visitante')
contem(reciboNovo, `✓ Despesa “Conta de luz – outubro” *aprovada* — ${BASE}/financeiro/${DESPESA}`, 'recibo: a decisão com o link')

// ---------------------------------------------------------------- botões e listas

const botoes = interativoDoPlano(id(77), HASH)
const objeto = objetoInterativo('Confira o plano', botoes)
igual(objeto?.type, 'button', 'botões: cabem na Cloud API (ids de até 40 caracteres)')
igual(botoes.tipo === 'botoes' ? botoes.botoes.map((b) => lerBotao(b.id)) : null,
  [{ tipo: 'plano', id: '000000000000', hash8: 'aaaaaaaa', sim: true }, { tipo: 'plano', id: '000000000000', hash8: 'aaaaaaaa', sim: false }], 'botões: o código lê o id e o hash')
const curto = mensagensComInterativo('x'.repeat(LIMITES_DO_INTERATIVO.corpo), botoes, TEXTOS_FIXOS.confirma_o_plano)
igual([curto.length, curto[0].interativo !== null], [1, true], 'botões: até 1.024 caracteres, uma mensagem com eles')
const longo = mensagensComInterativo('x'.repeat(LIMITES_DO_INTERATIVO.corpo + 1), botoes, TEXTOS_FIXOS.confirma_o_plano)
igual(longo.map((p) => [p.texto.length > 100 ? 'plano' : p.texto, p.interativo !== null]), [['plano', false], [TEXTOS_FIXOS.confirma_o_plano, true]], 'botões: acima de 1.024, o plano sozinho e os botões depois')
const lista = interativoDaPergunta(id(78), ['pes_7', 'pes_8'], ['Ana Souza (@ana.souza · RH)', 'Ana Lima (@ana.lima · Comunicação) ⚠'])
const objetoLista = lista ? objetoInterativo('Qual Ana?', lista) : null
igual(objetoLista?.type === 'list' ? objetoLista.action.sections[0].rows.map((r) => [r.id, r.title, r.description]) : null, [
  ['esc:000000000000:pes_7', '1. Ana Souza', '@ana.souza · RH'], ['esc:000000000000:pes_8', '2. Ana Lima', '@ana.lima · Comunicação · ⚠ há outra pessoa com este nome'],
], 'lista: a opção com o nome no título, o @usuário e o ⚠ na descrição')
igual(lerBotao('esc:000000000000:pes_8'), { tipo: 'escolha', id: '000000000000', marcador: 'pes_8' }, 'lista: o toque escolhe a opção')
igual(interativoDaPergunta(id(78), Array.from({ length: 11 }, (_, i) => `pes_${i + 1}`), Array.from({ length: 11 }, () => 'X')), null, 'lista: mais de 10 opções, só o texto')
const listaLonga = interativoDaPergunta(id(78), ['apr_1', 'apr_2'], ['“Campanha de doação de sangue – outubro de 2026”', '“Curto”'])
igual(listaLonga?.tipo === 'lista' ? [listaLonga.secoes[0].linhas[0].descricao, listaLonga.secoes[0].linhas[1].descricao] : null, ['“Campanha de doação de sangue – outubro de 2026”', null], 'lista: o título longo vai inteiro na descrição')

const aberto = (situacao: 'aberto' | 'em_revisao' | 'pergunta', extra: Partial<NonNullable<PlanoAberto['plano']>> = {}): PlanoAberto => ({
  plano: { id: id(77), situacao, hash: HASH, opcoes: ['pes_7', 'pes_8'], entregueEm: Date.parse('2026-10-19T12:00:00Z'), ...extra }, citacao: 'plano', recente: null,
})
const resposta = (texto: string, a: PlanoAberto) => lerRespostaAoPlano(texto, a, { visitaEsperando: false, enviadaEm: Date.parse('2026-10-19T12:01:00Z') })?.tipo ?? null
igual(resposta('plano:000000000000:aaaaaaaa:sim', aberto('aberto')), 'confirmar', 'botão: Confirmar do plano aberto, com o hash certo')
igual(resposta('plano:000000000000:aaaaaaaa:nao', aberto('aberto')), 'cancelar', 'botão: Cancelar')
igual(resposta('plano:000000000000:bbbbbbbb:sim', aberto('aberto')), 'velho', 'botão: hash velho é recusado')
igual(resposta('plano:000000000099:aaaaaaaa:sim', aberto('aberto')), 'velho', 'botão: plano antigo é recusado')
igual(resposta('plano:000000000000:aaaaaaaa:sim', { plano: null, citacao: 'plano_velho', recente: null }), 'velho', 'botão: plano que já não está aberto')
igual(resposta('plano:000000000000:aaaaaaaa:sim', aberto('em_revisao')), 'revisao', 'botão: plano em revisão espera o novo')
igual(resposta('esc:000000000000:pes_8', aberto('pergunta')), 'escolha', 'lista: a opção da pergunta aberta')
igual(resposta('esc:000000000000:pes_9', aberto('pergunta')), 'velho', 'lista: opção que não é da pergunta')

// ---------------------------------------------------------------- o áudio (só com a transcrição da Kapso)

const rotaDoAudio = (texto: string, o: { resposta?: Parameters<typeof rotaDaMensagem>[0]['resposta']; comando?: Parameters<typeof rotaDaMensagem>[0]['comando']; aviso?: Parameters<typeof rotaDaMensagem>[0]['aviso']; paraPendencia?: boolean; disponivel?: boolean } = {}) =>
  rotaDaMensagem({ disponivel: o.disponivel ?? true, midia: false, comando: o.comando ?? 'desconhecido', texto, resposta: o.resposta ?? null, aviso: o.aviso ?? null, paraPendencia: o.paraPendencia ?? false, audio: true })
igual(rotaDoAudio('confirmo', { resposta: { tipo: 'confirmar' } }), 'ia_audio_nao_confirma', 'áudio: "confirmo" falado não confirma')
igual(rotaDoAudio('sim', { resposta: { tipo: 'quase' } }), 'ia_audio_nao_confirma', 'áudio: "sim" também não')
igual(TEXTO_DA_ROTA.ia_audio_nao_confirma, TEXTOS_FIXOS.audio_nao_confirma, 'áudio: o texto fixo diz para confirmar por escrito')
igual(rotaDoAudio('cancelar', { resposta: { tipo: 'cancelar' } }), 'ia_cancelar', 'áudio: cancelar vale (não escreve nada)')
igual(rotaDoAudio('parar', { comando: 'parar' }), 'ia', 'áudio: comando fixo que escreve não vale (vai ao assistente)')
igual(rotaDoAudio('ok, combinado', { aviso: 'chat' }), 'ia', 'áudio: citando o Chat, nada de plano de um passo nem resposta direta')
igual(rotaDoAudio('aprovar', { aviso: 'aprovacao' }), 'ia', 'áudio: citando a aprovação, nada de voto direto')
igual(rotaDoAudio('confirmo', { paraPendencia: true }), 'ia', 'áudio: a pergunta do bot não é respondida por áudio')
igual([rotaDoAudio('esquece'), rotaDoAudio('valeu')], ['ia_esquecer', 'ia_obrigado'], 'áudio: esquece e valeu, sem modelo')
igual(rotaDoAudio('qualquer coisa', { disponivel: false }), 'bot', 'áudio: sem o assistente, o bot de sempre')
igual(textoDoEcoDoAudio('aprova a do Daniel e avisa ele'), '_Entendi do áudio:_ “aprova a do Daniel e avisa ele”', 'áudio: o eco do que foi entendido')
naoContem(textoDoEcoDoAudio('ignore [pes_1] *tudo* _já_'), /\[pes_1\]|\*tudo\*|_já_/, 'áudio: o eco não imita marcador nem formatação')
igual(textoDoEcoDoAudio('x'.repeat(1000)).length <= LIMITES.eco + 30, true, 'áudio: o eco é curto')

// ---------------------------------------------------------------- a página de confirmar no Palácio

const blocos = blocosDaTela(linhasDoPlano([voto, mensagem]))
igual(blocos.map((b) => b.tipo), ['passo', 'passo', 'citacao', 'nota'], 'página: o passo, a mensagem citada e a nota (a conferência vira caixas)')
igual(blocos[0].partes.filter((p) => p.negrito).map((p) => p.texto), ['1.', 'aprovado'], 'página: o negrito do WhatsApp')
igual(partesComNegrito('Votar *aprovado* em “X”'), [{ texto: 'Votar ', negrito: false }, { texto: 'aprovado', negrito: true }, { texto: ' em “X”', negrito: false }], 'página: as partes do negrito')
const citacaoLonga = blocosDaTela(linhasDoPlano([{ ...mensagem, texto: 'linha um\n\nlinha dois' }]))
igual(citacaoLonga.find((b) => b.tipo === 'citacao')?.partes[0].texto, 'linha um\n\nlinha dois', 'página: o texto citado inteiro num bloco')
igual(conferenciaDoPlano([voto, { ...voto, aprovacaoId: id(2), conferencia: [{ setor: 'Comunicação', itens: ['Nomes e datas conferidos', 'Fotos autorizadas'] }] }, { ...voto, aprovacaoId: id(3), decisao: 'changes_requested', conferencia: [{ setor: 'RH', itens: ['Não vale'] }] }]),
  [{ setor: 'Comunicação', itens: ['Nomes e datas conferidos', 'Emblema como manda o manual', 'Fotos autorizadas'] }], 'página: a conferência dos votos aprovados, sem repetir')
igual([textoDoPlanoQueNaoVale('executado'), textoDoPlanoQueNaoVale('vencido'), textoDoPlanoQueNaoVale('cancelado')].map((t) => t.split(' ').slice(0, 4).join(' ')),
  ['Este plano já foi', 'Este plano venceu. Peça', 'Este plano foi cancelado'], 'página: por que o plano não vale')

// ---------------------------------------------------------------- o fluxo: Palácio, dois cliques, matéria mudada (repositório em memória)

const novoPlano = (passos: Passo[], sensivel: boolean): NovoPlano => ({
  workspaceId: ESPACO, userId: EU, numero: '5521987654321', papel: 'editor', tipo: 'plano', passos, opcoes: [], permitidas: ['voto', 'mensagem', 'financeiro'], pedidoEmAberto: null, sensivel,
})

async function conferirFluxo() {
  let agora = Date.parse('2026-10-19T12:00:00Z')
  const relogio = () => agora
  const dormidas: number[] = []
  const repo = repoEmMemoria(relogio)
  const fluxo = criarFluxoDoPlano(repo, relogio, async (ms) => { dormidas.push(ms); agora += ms })
  const confirmar = (plano: PlanoGuardado, mensagem: { id: string; enviadaEm: number | null; toque?: boolean }, executar = async () => OK) => fluxo.confirmar({
    plano, pessoaId: EU, mensagem, conferirIdentidade: async () => null, revalidar: async () => OK, executar, urlBase: BASE,
  })

  // O sensível: o "confirmo" leva a no_palacio, com o prazo do link contado de agora (não do plano), e nada é feito.
  {
    const A = (await fluxo.guardar(novoPlano([decisaoDespesa], true)))!
    await fluxo.marcarEntrega(A.id, ['wamid.planoA', 'wamid.botoesA'])
    igual((await repo.buscar(A.id))?.mensagens, ['wamid.planoA', 'wamid.botoesA'], 'entrega: o plano e os botões, as duas mensagens')
    agora += 14 * 60_000
    const executados: string[] = []
    const r = await confirmar((await repo.buscar(A.id))!, { id: 'wamid.toque', enviadaEm: agora - 1_000, toque: true }, async () => { executados.push('x'); return OK })
    const linha = await repo.buscar(A.id)
    igual([r.tipo, executados, linha?.situacao, linha?.expiraEm], ['no_palacio', [], 'no_palacio', new Date(agora + LIMITES.noPalacioMin * 60_000).toISOString()],
      'Palácio: a decisão do Financeiro nunca executa pelo WhatsApp; o plano espera o link por mais 15 minutos')
    igual(dormidas, [], 'botão: sem a espera de assentamento (é do "confirmo" por texto)')

    // Duas submissões da página com o mesmo link: só uma executa.
    const feitos: string[] = []
    const entradaNoPalacio = {
      planoId: A.id, pessoaId: EU, workspaceId: ESPACO, urlBase: BASE, conferirIdentidade: async () => null, revalidar: async () => OK,
      executar: async (p: Passo) => { feitos.push(p.acao); return OK },
    }
    const [r1, r2] = await Promise.all([fluxo.executarNoPalacio(entradaNoPalacio), fluxo.executarNoPalacio(entradaNoPalacio)])
    igual([[r1.tipo, r2.tipo].sort(), feitos], [['executado', 'nada'], ['decidir_financeiro']], 'Palácio: dois cliques, uma execução')
    const nada = [r1, r2].find((x) => x.tipo === 'nada')
    igual(nada && 'texto' in nada ? nada.texto : '', textoDoPlanoQueNaoVale('executado'), 'Palácio: o segundo clique diz que já foi confirmado')
    const feito = [r1, r2].find((x) => x.tipo === 'executado')
    igual(feito && 'texto' in feito ? ofereceNaoFuiEu(feito.texto) : true, false, 'Palácio: o recibo da página não oferece o "Não fui eu"')
    igual((await repo.buscar(A.id))?.redigidoEm !== null, true, 'Palácio: redigido na hora')
  }

  // A matéria alterada entre o plano e o clique: a revalidação recusa e nada é feito.
  {
    const B = (await fluxo.guardar(novoPlano([voto, mensagem], true)))!
    await fluxo.marcarEntrega(B.id, ['wamid.planoB'])
    agora += 60_000
    await confirmar((await repo.buscar(B.id))!, { id: 'wamid.confirmoB', enviadaEm: agora - 4_000 })
    const executados: string[] = []
    const r = await fluxo.executarNoPalacio({
      planoId: B.id, pessoaId: EU, workspaceId: ESPACO, urlBase: BASE, conferirIdentidade: async () => null,
      revalidar: async (p) => (p.acao === 'votar' ? { ok: false, codigo: 'mudou', texto: 'a matéria “Balanço da ação na Maré” mudou depois do plano' } : OK),
      executar: async (p) => { executados.push(p.acao); return OK },
    })
    const linha = await repo.buscar(B.id)
    igual([r.tipo, executados, linha?.situacao], ['falhou', [], 'falhou'], 'Palácio: matéria mudada, nada feito')
    contem('texto' in r ? r.texto : '', 'Nada foi feito: passo 1, a matéria “Balanço da ação na Maré” mudou depois do plano', 'Palácio: "a matéria mudou"')
    igual(JSON.stringify(linha?.passos).includes('Aprovei, pode seguir.'), false, 'Palácio: o texto da mensagem foi redigido')
  }

  // Outra pessoa, outro espaço, plano vencido: nada é feito.
  {
    const C = (await fluxo.guardar(novoPlano([voto], true)))!
    await fluxo.marcarEntrega(C.id, ['wamid.planoC'])
    agora += 60_000
    await confirmar((await repo.buscar(C.id))!, { id: 'wamid.confirmoC', enviadaEm: agora - 4_000 })
    const executados: string[] = []
    const base = { planoId: C.id, workspaceId: ESPACO, urlBase: BASE, conferirIdentidade: async () => null, revalidar: async () => OK, executar: async () => { executados.push('x'); return OK } }
    const outra = await fluxo.executarNoPalacio({ ...base, pessoaId: id(999) })
    igual([outra.tipo, executados], ['falhou', []], 'Palácio: o plano de outra pessoa não executa')
    const D = (await fluxo.guardar(novoPlano([voto], true)))!
    await fluxo.marcarEntrega(D.id, ['wamid.planoD'])
    agora += 60_000
    await confirmar((await repo.buscar(D.id))!, { id: 'wamid.confirmoD', enviadaEm: agora - 4_000 })
    agora += (LIMITES.noPalacioMin + 1) * 60_000
    const vencido = await fluxo.executarNoPalacio({ ...base, planoId: D.id, pessoaId: EU })
    igual([vencido.tipo, executados], ['nada', []], 'Palácio: depois do prazo do link, nada executa')
    const contaMudou = (await fluxo.guardar(novoPlano([voto], true)))!
    await fluxo.marcarEntrega(contaMudou.id, ['wamid.planoE'])
    agora += 60_000
    await confirmar((await repo.buscar(contaMudou.id))!, { id: 'wamid.confirmoE', enviadaEm: agora - 4_000 })
    const mudou = await fluxo.executarNoPalacio({ ...base, planoId: contaMudou.id, pessoaId: EU, conferirIdentidade: async () => 'pedir ações pelo assistente foi desligado' })
    igual([mudou.tipo, 'texto' in mudou ? mudou.texto : ''], ['falhou', 'Nada foi feito: pedir ações pelo assistente foi desligado. Peça de novo se quiser.'], 'Palácio: o assistente desligado no meio-tempo')
  }

  // O plano confirmado pelo WhatsApp: o recibo oferece o "Não fui eu"; o "confirmo" por texto assenta.
  {
    const F = (await fluxo.guardar(novoPlano([voto, mensagem], false)))!
    await fluxo.marcarEntrega(F.id, ['wamid.planoF'])
    agora += 60_000
    dormidas.length = 0
    const r = await confirmar((await repo.buscar(F.id))!, { id: 'wamid.confirmoF', enviadaEm: agora - 1_000 })
    igual([r.tipo, 'texto' in r && ofereceNaoFuiEu(r.texto)], ['executado', true], 'WhatsApp: o recibo oferece o "Não fui eu"')
    igual(dormidas, [2_000], 'WhatsApp: o "confirmo" por texto espera o assentamento')
  }

  // "cancelar" (e "esquece") alcança o plano que espera o Palácio.
  {
    const G = (await fluxo.guardar(novoPlano([decisaoDespesa], true)))!
    await fluxo.marcarEntrega(G.id, ['wamid.planoG'])
    agora += 60_000
    await confirmar((await repo.buscar(G.id))!, { id: 'wamid.confirmoG', enviadaEm: agora - 4_000 })
    const cancelados = await fluxo.cancelar(EU)
    igual([cancelados.some((c) => c.id === G.id), (await repo.buscar(G.id))?.situacao], [true, 'cancelado'], 'cancelar: o plano que esperava o Palácio também')
    const depois = await fluxo.executarNoPalacio({ planoId: G.id, pessoaId: EU, workspaceId: ESPACO, urlBase: BASE, conferirIdentidade: async () => null, revalidar: async () => OK, executar: async () => OK })
    igual([depois.tipo, 'texto' in depois ? depois.texto : ''], ['nada', textoDoPlanoQueNaoVale('cancelado')], 'cancelar: o link não executa mais')
  }
}

// ---------------------------------------------------------------- os preparos novos (fonte de mentira)

type Mundo = {
  pessoas: Record<string, PessoaParaOPlano>
  chamados: Record<string, { codigo: string; titulo: string; status: string; equipe: boolean; responsavelId: string | null; filaId: string }>
  assuntos: Record<string, { filaNome: string; assuntoNome: string; pedeLocal: boolean }>
  portaria: boolean
  decisoes: Record<string, { titulo: string; codigo: string | null; valor: number; fornecedor: string | null; papel: 'financeiro' | 'diretoria' | null }>
}
const mundoNovo = (): Mundo => ({
  pessoas: {
    [ANA]: { nome: 'Ana Souza', username: 'ana.souza', setor: 'RH', homonimo: false, ativa: true },
    [DANIEL]: { nome: 'Daniel Lamim', username: 'daniel.lamim', setor: 'Comunicação', homonimo: false, ativa: true },
  },
  chamados: { [CHAMADO]: { codigo: 'TI-0042', titulo: 'Impressora do 2º andar', status: 'em_atendimento', equipe: true, responsavelId: id(555), filaId: FILA_TI } },
  assuntos: { [`${FILA_MAN}:${ASSUNTO_MAN}`]: { filaNome: 'Manutenção', assuntoNome: 'Elétrica', pedeLocal: false }, [`${FILA_TI}:${ASSUNTO_TI}`]: { filaNome: 'TI', assuntoNome: 'Impressora', pedeLocal: true } },
  portaria: true,
  decisoes: { [`despesa:${DESPESA}`]: { titulo: 'Conta de luz – outubro', codigo: null, valor: 1234.5, fornecedor: 'Light', papel: null } },
})
const fonteDe = (m: Mundo): FonteDosPreparos => ({
  rodada: async () => ({ ok: true, titulo: 'Balanço da ação na Maré', contentId: CONTEUDO, pedidaPor: DANIEL, pedidaEm: '2026-10-18T13:00:00Z', conferencia: CONFERENCIA }),
  hashDoConteudo: async () => HASH,
  pessoa: async (p) => m.pessoas[p] ?? null,
  chamado: async () => null,
  assunto: async (f, a) => m.assuntos[`${f}:${a}`] ?? null,
  visitaEsperando: async () => null,
  avisosSemLer: async () => 0,
  mensagensDeHoje: async () => 0,
  canal: async () => null,
  chamadoParaAtender: async (c) => m.chamados[c] ?? null,
  temPortaria: async () => m.portaria,
  decisao: async (tipo, item) => m.decisoes[`${tipo}:${item}`] ?? null,
})

function preparadorDe(o: { podeAgir?: boolean; noPalacio?: boolean; mundo?: Mundo } = {}) {
  const tabela = TabelaDeMarcadores.de(null)
  tabela.emitir('chamado', CHAMADO) // cha_1
  tabela.emitir('fila', FILA_MAN) // fil_2
  tabela.emitir('assunto', ASSUNTO_MAN) // ass_3
  tabela.emitir('pessoa', ANA) // pes_4
  tabela.emitir('despesa', DESPESA) // des_5
  tabela.emitir('compra', COMPRA) // com_6
  tabela.emitir('aprovacao', APR) // apr_7
  tabela.emitir('fila', FILA_TI) // fil_8
  tabela.emitir('assunto', ASSUNTO_TI) // ass_9
  const mundo = o.mundo ?? mundoNovo()
  const rascunho = criarRascunho()
  const p = criarPreparador({
    fonte: fonteDe(mundo), tabela, rascunho, pessoaId: EU, podeAgir: o.podeAgir ?? true, noPalacio: o.noPalacio ?? true, escrita: true, recente: true, base: BASE, mensagensDia: 10,
  })
  return { ...p, rascunho, mundo }
}

async function conferirPreparos() {
  {
    // Quem usa a verificação em duas etapas, com a confirmação no Palácio: o voto entra (o plano vai ao Palácio).
    const p = preparadorDe({ podeAgir: false, noPalacio: true })
    const r = await p.preparar('preparar_voto', { aprovacao: 'apr_7', decisao: 'aprovar', nota: '' })
    igual([r.ok, r.ok && planoSensivel([r.passo], false)], [true, true], 'preparo 2FA com o Palácio: o voto entra e o plano é sensível')
    const sem = await preparadorDe({ podeAgir: false, noPalacio: false }).preparar('preparar_voto', { aprovacao: 'apr_7', decisao: 'aprovar', nota: '' })
    igual(sem.ok ? 'passou' : sem.erro, TEXTOS_FIXOS.dois_fatores, 'preparo 2FA sem o Palácio: de fora, com o link (como antes)')
  }
  {
    // A decisão do Financeiro: só com a confirmação no Palácio; relida agora; recusar com motivo.
    const sem = await preparadorDe({ noPalacio: false }).preparar('preparar_decisao_financeira', { item: 'des_5', decisao: 'aprovar', motivo: '' })
    igual(sem.ok ? 'passou' : [sem.link, /ainda não está ligada/.test(sem.erro)], [`${BASE}/financeiro/${DESPESA}`, true], 'decisão sem o Palácio: de fora, com o link da despesa')
    const p = preparadorDe()
    const r = await p.preparar('preparar_decisao_financeira', { item: 'des_5', decisao: 'aprovar', motivo: '' })
    igual(r.ok && r.passo, { ...decisaoDespesa }, 'decisão: o passo com o título, o valor e o fornecedor relidos')
    const outra = await p.preparar('preparar_decisao_financeira', { item: 'com_6', decisao: 'recusar', motivo: 'Valor acima do orçado.' })
    igual(outra.ok ? 'passou' : outra.motivo, 'o item não espera mais a sua decisão', 'decisão: item que não espera a pessoa fica de fora')
    const desconhecida = await p.preparar('preparar_decisao_financeira', { item: 'des_99', decisao: 'aprovar', motivo: '' })
    contem(desconhecida.ok ? 'passou' : desconhecida.erro, 'Marcador desconhecido', 'decisão: marcador que o código não mostrou')
    const repetida = await p.preparar('preparar_decisao_financeira', { item: 'des_5', decisao: 'recusar', motivo: 'Mudei de ideia' })
    igual(repetida.ok, true, 'decisão: o preparo não decide a duplicata (o rascunho é de quem chama)')
  }
  {
    // O atendimento do chamado: só a equipe da fila; o destino da transferência conferido.
    const p = preparadorDe()
    const r = await p.preparar('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'transferir', fila: 'fil_2', assunto: 'ass_3', nota: 'É problema de tomada.' })
    igual(r.ok && r.passo, transferir, 'atendimento: a transferência com o destino relido')
    const mesmaFila = await preparadorDe().preparar('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'transferir', fila: 'fil_8', assunto: 'ass_9', nota: 'Mesmo lugar' })
    contem(mesmaFila.ok ? 'passou' : mesmaFila.erro, 'já está nessa fila', 'atendimento: transferir para a mesma fila não vale')
    const solicitante = mundoNovo()
    solicitante.chamados[CHAMADO].equipe = false
    const naoEquipe = await preparadorDe({ mundo: solicitante }).preparar('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'assumir', fila: '', assunto: '', nota: '' })
    igual(naoEquipe.ok ? 'passou' : naoEquipe.erro, TEXTOS_FIXOS.so_quem_atende, 'atendimento: quem abriu não assume nem resolve')
    const resolvido = mundoNovo()
    resolvido.chamados[CHAMADO].status = 'resolvido'
    const jaResolvido = await preparadorDe({ mundo: resolvido }).preparar('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'resolver', fila: '', assunto: '', nota: 'Troquei o toner.' })
    igual(jaResolvido.ok ? 'passou' : jaResolvido.motivo, 'o chamado já está resolvido ou encerrado', 'atendimento: chamado resolvido fica de fora')
    const comigo = mundoNovo()
    comigo.chamados[CHAMADO].responsavelId = EU
    const meu = await preparadorDe({ mundo: comigo }).preparar('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'assumir', fila: '', assunto: '', nota: '' })
    igual(meu.ok ? 'passou' : meu.motivo, 'o chamado já está com você', 'atendimento: assumir o que já está com a pessoa')
    const doisFatores = await preparadorDe({ podeAgir: false, noPalacio: false }).preparar('preparar_atendimento_do_chamado', { chamado: 'cha_1', acao: 'assumir', fila: '', assunto: '', nota: '' })
    igual(doisFatores.ok ? 'passou' : doisFatores.link, `${BASE}/chamados/${CHAMADO}`, 'atendimento 2FA sem o Palácio: de fora, com o link do chamado')
  }
  {
    // O registro de visita: a portaria da pessoa e a pessoa visitada ativa.
    const p = preparadorDe()
    const r = await p.preparar('preparar_registro_de_visita', { visitante: 'João Silva', empresa: 'Gráfica Boa', visitado: 'pes_4', motivo: 'Entrega de cartazes' })
    igual(r.ok && r.passo, visita, 'visita: o passo com a pessoa visitada (@usuário)')
    if (r.ok) p.rascunho.acrescentar(r.passo, 'visita')
    const segunda = await p.preparar('preparar_registro_de_visita', { visitante: 'Maria', empresa: '', visitado: 'pes_4', motivo: '' })
    contem(segunda.ok ? 'passou' : segunda.erro, 'um por vez', 'visita: um registro por plano')
    const semPortaria = mundoNovo()
    semPortaria.portaria = false
    const fora = await preparadorDe({ mundo: semPortaria }).preparar('preparar_registro_de_visita', { visitante: 'João Silva', empresa: '', visitado: 'pes_4', motivo: '' })
    igual(fora.ok ? 'passou' : fora.motivo, 'a portaria fica fora do seu acesso', 'visita: sem a portaria, de fora')
    const inativa = mundoNovo()
    inativa.pessoas[ANA].ativa = false
    const saiu = await preparadorDe({ mundo: inativa }).preparar('preparar_registro_de_visita', { visitante: 'João Silva', empresa: '', visitado: 'pes_4', motivo: '' })
    contem(saiu.ok ? 'passou' : saiu.erro, 'não está mais no espaço', 'visita: pessoa visitada que saiu')
  }
  {
    // A revalidação dos passos novos, na hora da confirmação.
    const m = mundoNovo()
    const f = fonteDe(m)
    igual([(await revalidarPasso(decisaoDespesa, f, EU)).ok, (await revalidarPasso(transferir, f, EU)).ok, (await revalidarPasso(visita, f, EU)).ok], [true, true, true], 'revalidação: os passos novos conferem')
    delete m.decisoes[`despesa:${DESPESA}`]
    igual((await revalidarPasso(decisaoDespesa, f, EU)).codigo, 'encerrada', 'revalidação: a despesa decidida por outra pessoa no meio-tempo')
    m.chamados[CHAMADO].equipe = false
    igual((await revalidarPasso(resolver, f, EU)).codigo, 'sem_permissao', 'revalidação: saiu da equipe da fila')
    m.pessoas[ANA].ativa = false
    contem((await revalidarPasso(visita, f, EU)).texto, 'não está mais no espaço', 'revalidação: a pessoa visitada saiu')
  }
}

// ---------------------------------------------------------------- o laço: a decisão do Financeiro é um preparo como os outros (terminal)

async function conferirLaco() {
  const usos = [{ type: 'tool_use', id: 't1', name: 'preparar_decisao_financeira', input: { item: 'des_5', decisao: 'aprovar', motivo: '' } }]
  const resposta = { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: usos, stop_reason: 'tool_use', stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }
  let chamadas = 0
  const chamar: Chamar = async () => { chamadas++; return resposta as unknown as Anthropic.Beta.BetaMessage }
  const p = preparadorDe()
  const handlers: Handlers = { ler: async () => ({ ok: true, conteudo: '{}' }), preparar: p.preparar, perguntar: async () => ({ ok: false, erro: 'x' }) }
  const permitidas = acoesPermitidas('aprova a despesa da Light')
  const desfecho = await rodarTurno({
    chamar, executar: criarExecutar({ handlers, permitidas, quantidade: null, rascunho: p.rascunho }), relogio: Date.now, params: {} as never,
    inicial: [{ role: 'user', content: 'aprova a despesa da Light' }], uso: { somar: () => undefined }, rascunho: p.rascunho, prazo: Date.now() + 60_000,
  })
  igual([desfecho.tipo, chamadas, p.rascunho.passos.map((x) => x.acao)], ['plano', 1, ['decidir_financeiro']], 'laço: "aprova a despesa" vira plano numa chamada só')
  igual(planoSensivel(p.rascunho.passos, true), true, 'laço: e o plano é sensível (vai ao Palácio)')
}

// ---------------------------------------------------------------- o código: imports, a página e a migração

const raiz = process.cwd()
const ler = (caminho: string) => readFileSync(join(raiz, caminho), 'utf8')
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm), ...codigo.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
const executores = importsDe(ler('lib/whatsapp/assistente/executores.ts'))
igual(executores.filter((i) => /financeiro|confirmar-no-palacio|lib\/usuarios|lib\/contas|chaves/.test(i)), [], 'imports: o executor do WhatsApp não puxa nada do Financeiro (a decisão é só no Palácio)')
contem(ler('lib/whatsapp/assistente/palacio.ts'), "import 'server-only'", 'imports: palacio.ts é só do servidor')
for (const arquivo of ['lib/whatsapp/bot.ts', 'lib/whatsapp/assistente/index.ts', 'lib/whatsapp/assistente/plano.ts', 'app/api/webhooks/whatsapp/route.ts']) {
  igual(importsDe(ler(arquivo)).filter((i) => /palacio$/.test(i)), [], `imports: ${arquivo} não puxa a execução da página (palacio.ts traz as actions do Financeiro)`)
}
const naPagina = ler('lib/whatsapp/confirmar-no-palacio.ts')
igual((naPagina.match(/c\.acao === 'plano'/g) ?? []).length >= 3, true, 'onda 2: descrever, executar e o link tratam o plano antes de cair no ramo de desativar conta')
contem(ler('app/confirmar/[token]/acoes.ts'), "if (c.acao === 'plano') return executarPlanoNoPalacio(", 'página: o "Confirmar" do plano vai ao caminho dele')
const migracoes = readdirSync(join(raiz, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
const migracaoB = migracoes.find((f) => f.endsWith('_cvrj_whatsapp_assistente_confirmacao.sql'))
igual(Boolean(migracaoB && migracaoB > '20261019010000_cvrj_whatsapp_assistente.sql'), true, 'migração B: depois da do assistente')
const sqlB = migracaoB ? ler(`supabase/migrations/${migracaoB}`) : ''
contem(sqlB, 'add column if not exists plano_id uuid references public.whatsapp_ia_planos (id) on delete cascade', 'migração B: plano_id, só acrescenta')
contem(sqlB, 'whatsapp_confirmacoes_plano_coerente', 'migração B: acao plano ⇔ plano_id')
naoContem(sqlB.toLowerCase(), 'drop policy', 'migração B: sem drop policy')
naoContem(sqlB.toLowerCase(), /drop table|drop column|delete from/, 'migração B: nada é apagado')

conferirFluxo().then(conferirPreparos).then(conferirLaco).then(() => {
  if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
  console.log('Assistente (Palácio, botões e áreas): tudo certo.')
}).catch((causa) => { console.log('FALHOU: lançou', causa); process.exit(1) })
