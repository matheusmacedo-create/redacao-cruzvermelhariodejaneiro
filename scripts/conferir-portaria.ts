/**
 * Confere as regras da Portaria virtual: `npx tsx scripts/conferir-portaria.ts`.
 * Também o registro da visita pelo WhatsApp em etapas (lib/whatsapp/portaria-regras.ts: as etapas, Pular, Registrar
 * já, a autorização do visitante, a foto em qualquer etapa e na abertura, o telefone inválido, os botões e a
 * conferência), a ficha que quem é visitado recebe (o texto, os botões com o id que amarra a visita, quem pode
 * responder, o modelo de fora da janela e o recuo para o aviso de antes), a resposta ao visitante pelo modelo e a
 * foto do visitante normalizada no servidor (lib/portaria/foto-servidor.ts, com o sharp de verdade e imagens geradas
 * aqui — sem rede).
 * Sai com código 1 se algo estiver errado.
 */
import {
  crachaPendente, diaEmSaoPaulo, entrouEmOutroDia, ehTokenDaEntrada, fotoDaVisita, haQuanto, lerVisitante, linkDaEntrada, quemVisita,
  situacaoDaVisita, urlDaFotoDoVisitante, caminhoDaFotoDoVisitante, numerosDeCracha, prefixoDoCracha, folhasDeCrachas, formatoDoCracha, crachasPorFolha,
  lerRespostaDaVisita, respostaClaraDaVisita, linkDaVisita, parametrosParaVisitante, SITUACAO_PARA_VISITANTE, avisoParaPortaria, situacaoDaResposta,
} from '../lib/portaria/regras'
import {
  BOTOES_DA_ETAPA_OPCIONAL, BOTOES_DA_FOTO, BOTOES_DO_CONSENTIMENTO, ETAPAS_DE_TEXTO_LIVRE, ETAPAS_EM_QUE_NAO_RESPONDE, LIMITES_DA_VISITA, comFoto, dadosRedigidos,
  destinoDaImagem, ehPularNaVisita, ehRegistrarJa, fotoMantemAPergunta, fotoRecebida, lerConsentimento, lerCracha, lerLegendaDeVisita, perguntaDaVisita, perguntaSemFila,
  proximaEtapa, resultadoDaBusca, seguirNoRegistro, textoDaEntradaRegistrada, textoDaFotoNaPergunta, type DadosDaVisita, type FotoNaConversa, type PassoDoRegistro, type PerguntaDaVisita, type PessoaNaConversa,
  RESPOSTAS_DA_FICHA, idDoBotaoDaFicha, interativoDaFicha, lerBotaoDaFicha, modeloDaFichaForaDaJanela, montagemDaFicha, parametrosDaFicha, podeResponderPelaFicha,
  sobeAFotoDaFicha, textoDaFicha, tituloDoBotaoDaFicha, type FichaDaVisita,
} from '../lib/whatsapp/portaria-regras'
import { CATALOGO_DOS_MODELOS, LIMITES_DO_MODELO, corpoPreenchido, modeloDaSituacao, modeloDoCatalogo, type ModeloNaMeta } from '../lib/whatsapp/modelos'
import {
  BOTOES_DA_CONFERENCIA, LIMITES_DO_INTERATIVO, acharPeloNome, ehCancelamento, ehPular, lerEventoDaKapso, lerPedido, objetoInterativo, textoParaModelo, type Interativo,
  type MidiaRecebida, type ObjetoDoModelo,
} from '../lib/whatsapp/regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!texto.includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })

igual(situacaoDaVisita({ entrada_em: null, saida_em: null, descartada_em: null }), 'aguardando', 'autocadastro esperando')
igual(situacaoDaVisita({ entrada_em: '2026-09-27T13:00:00Z', saida_em: null, descartada_em: null }), 'dentro', 'dentro')
igual(situacaoDaVisita({ entrada_em: '2026-09-27T13:00:00Z', saida_em: '2026-09-27T14:00:00Z', descartada_em: null }), 'saiu', 'saiu')
igual(situacaoDaVisita({ entrada_em: null, saida_em: null, descartada_em: '2026-09-27T13:00:00Z' }), 'descartada', 'descartada')

igual(crachaPendente({ cracha_numero: 'V-07', cracha_devolvido_em: null, saida_em: '2026-09-27T14:00:00Z' }), true, 'saiu sem devolver')
igual(crachaPendente({ cracha_numero: 'V-07', cracha_devolvido_em: null, saida_em: null }), false, 'ainda dentro: não é pendência')
igual(crachaPendente({ cracha_numero: null, cracha_devolvido_em: null, saida_em: '2026-09-27T14:00:00Z' }), false, 'sem crachá')

// 02:30 UTC de 27/09 ainda é 26/09 em Brasília.
igual(diaEmSaoPaulo('2026-09-27T02:30:00Z'), '2026-09-26', 'dia no fuso de Brasília')
igual(entrouEmOutroDia({ entrada_em: '2026-09-26T20:00:00Z', saida_em: null }, '2026-09-27'), true, 'esqueceram a saída de ontem')
igual(entrouEmOutroDia({ entrada_em: '2026-09-27T12:00:00Z', saida_em: null }, '2026-09-27'), false, 'entrou hoje')

const agora = new Date('2026-09-27T15:00:00Z')
igual(haQuanto('2026-09-27T14:59:40Z', agora), 'agora', 'agora')
igual(haQuanto('2026-09-27T14:55:00Z', agora), 'há 5 min', 'minutos')
igual(haQuanto('2026-09-27T12:50:00Z', agora), 'há 2 h 10 min', 'horas e minutos')
igual(haQuanto('2026-09-24T15:00:00Z', agora), 'há 3 dias', 'dias')

igual(quemVisita({ visitado_texto: 'Voluntariado' }, 'Ana Lima'), 'Ana Lima · Voluntariado', 'pessoa e setor')
igual(quemVisita({ visitado_texto: 'ana lima' }, 'Ana Lima'), 'Ana Lima', 'sem repetir')
igual(quemVisita({ visitado_texto: null }, null), '', 'ninguém')

const p = lerVisitante(form({ nome: '  Maria   da Silva ', telefone: '(21) 99999-0000', visitado_id: '00000000-0000-4000-8000-00000000aa01', cracha_numero: ' V-07 ' }))
igual(p.erros, [], 'portaria: sem erros')
igual([p.dados.nome, p.dados.cracha_numero, p.dados.visitado_id], ['Maria da Silva', 'V-07', '00000000-0000-4000-8000-00000000aa01'], 'portaria: campos limpos')
igual(lerVisitante(form({ nome: 'A' })).erros, ['Escreva o nome do visitante.'], 'nome curto')
igual(lerVisitante(form({ nome: 'Ana', telefone: 'abc' })).erros, ['Telefone inválido: use só números, com DDD.'], 'telefone inválido')
igual(lerVisitante(form({ nome: 'Ana', visitado_id: 'x' })).erros, ['Pessoa visitada inválida.'], 'visitado inválido')
const pub = lerVisitante(form({ nome: 'Carlos', visitado_id: '00000000-0000-4000-8000-00000000aa01', cracha_numero: 'V-1', visitado_texto: 'Voluntariado' }), true)
igual([pub.erros, pub.dados.visitado_id, pub.dados.cracha_numero], [[], undefined, undefined], 'autocadastro não escolhe pessoa nem crachá')
igual(lerVisitante(form({ nome: 'Carlos' }), true).erros, ['Diga quem você vai visitar ou o motivo da visita.'], 'autocadastro precisa de quem ou por quê')

const ws = '7cbe994e-60db-42fa-b2da-db2429af4c45', vis = 'a0a0a0a0-0000-4000-8000-000000000001', arq = '11111111-1111-4111-8111-111111111111'
const caminho = caminhoDaFotoDoVisitante(ws, vis, arq)
igual(fotoDaVisita(caminho, ws, vis), true, 'foto desta visita')
igual(fotoDaVisita(caminho, ws, 'a0a0a0a0-0000-4000-8000-000000000002'), false, 'foto de outra visita')
igual(fotoDaVisita('voluntarios/x.jpg', ws, vis), false, 'caminho de outro lugar')
igual(urlDaFotoDoVisitante(vis, caminho), `/api/portaria/${vis}/foto?v=${arq}`, 'endereço da foto')
igual(ehTokenDaEntrada('abcdefghijklmnopqrstuvwxyz_-12'), true, 'token válido')
igual(ehTokenDaEntrada('curto'), false, 'token curto')
igual(ehTokenDaEntrada('a'.repeat(30) + '/'), false, 'token com barra')
igual(linkDaEntrada('https://palacio.exemplo/', 'T'.repeat(32)), `https://palacio.exemplo/visitante?t=${'T'.repeat(32)}`, 'link do QR')

igual(numerosDeCracha('v', 1, 3), ['V-01', 'V-02', 'V-03'], 'numeração com zero')
igual(numerosDeCracha('V', 99, 101), ['V-099', 'V-100', 'V-101'], 'largura pelo maior número')
igual(numerosDeCracha('V', null, null).length, 9, 'padrão: uma folha')
igual(numerosDeCracha('V', 5, 2), ['V-05'], 'fim antes do início: só o início')
igual(numerosDeCracha('V', 1, 500).length, 99, 'no máximo 99 por vez')
igual(prefixoDoCracha('pres'), 'PRES', 'prefixo em maiúsculas')
igual(prefixoDoCracha('<b>'), 'V', 'prefixo inválido vira V')
igual(prefixoDoCracha('Visitânte'), 'V', 'mais de 5 letras vira V')
const folhas = folhasDeCrachas(numerosDeCracha('V', 1, 10))
igual(folhas.length, 2, 'dez crachás: duas folhas')
igual(folhas[0].verso.slice(0, 3), ['V-03', 'V-02', 'V-01'], 'verso espelhado na linha')
igual(folhas[1].frente.filter(Boolean), ['V-10'], 'segunda folha com o que sobrou')
igual(folhas[1].verso.slice(0, 3), [null, null, 'V-10'], 'verso da sobra no lugar certo')
const deitados = folhasDeCrachas(numerosDeCracha('V', 1, 12, crachasPorFolha('deitado')), 'deitado')
igual(numerosDeCracha('V', null, null, crachasPorFolha('deitado')).length, 10, 'deitado: padrão de uma folha com 10')
igual(deitados.length, 2, 'deitado: doze crachás, duas folhas')
igual(deitados[0].verso.slice(0, 4), ['V-02', 'V-01', 'V-04', 'V-03'], 'deitado: verso espelhado em cada linha de 2')
igual(deitados[1].verso.slice(0, 2), ['V-12', 'V-11'], 'deitado: sobra espelhada')
igual(formatoDoCracha('empe'), 'empe', 'formato em pé')
igual(formatoDoCracha('x'), 'deitado', 'formato padrão: deitado')

// A resposta de quem é visitado (migração 20260929160000)
igual(lerRespostaDaVisita('1'), { resposta: 'subir', recado: null }, 'resposta 1: pode subir')
igual(lerRespostaDaVisita('Pode subir!'), { resposta: 'subir', recado: null }, 'pode subir, com exclamação')
igual(lerRespostaDaVisita('2 estou em reunião, 10 min'), { resposta: 'aguardar', recado: 'estou em reunião, 10 min' }, 'aguardar com recado')
igual(lerRespostaDaVisita('Aguarde: já desço'), { resposta: 'aguardar', recado: 'já desço' }, 'aguarde com dois-pontos')
igual(lerRespostaDaVisita('3 - estou fora hoje'), { resposta: 'recusar', recado: 'estou fora hoje' }, 'recusar com recado')
igual(lerRespostaDaVisita('Não posso receber agora'), { resposta: 'recusar', recado: null }, 'não posso receber agora')
igual(lerRespostaDaVisita('nao'), { resposta: 'recusar', recado: null }, 'não sem acento')
igual(lerRespostaDaVisita('12 pessoas'), null, '12 não é 1')
igual(lerRespostaDaVisita('subindo a escada'), null, '"subindo" não é "sobe"')
igual(lerRespostaDaVisita('olá'), null, 'outra conversa')
igual(respostaClaraDaVisita('sim'), null, 'sem citar, "sim" solto não vale')
igual(respostaClaraDaVisita('ok'), null, 'sem citar, "ok" solto não vale')
igual(respostaClaraDaVisita('1')?.resposta, 'subir', 'sem citar, "1" vale')
igual(respostaClaraDaVisita('não posso, estou fora')?.resposta, 'recusar', 'sem citar, "não posso" vale')
igual(linkDaVisita('a'.repeat(8)), '/portaria/visita/aaaaaaaa', 'link da visita')
igual(parametrosParaVisitante({ quem: 'Ana Lima', setor: 'Comunicação Social', resposta: 'subir' }), ['Ana Lima (Comunicação Social)', SITUACAO_PARA_VISITANTE.subir], 'ao visitante: quem e o setor, e a situação')
igual(parametrosParaVisitante({ quem: '*Ana*\nLima', setor: null, resposta: 'aguardar' })[0], 'Ana Lima', 'ao visitante: o nome sem formatação nem quebra de linha')
igual(Object.values(SITUACAO_PARA_VISITANTE).every((t) => !/[\n\t*_~]| {4}/.test(t) && t.length <= LIMITES_DO_MODELO.parametro), true, 'ao visitante: cada situação cabe numa variável de modelo')
igual(Object.values(SITUACAO_PARA_VISITANTE).some((t) => /recado/i.test(t)), false, 'ao visitante: nunca o recado (é para a portaria)')
const aviso = avisoParaPortaria({ visitante: 'José Pereira', quemRespondeu: 'Ana Lima', resposta: 'recusar', recado: 'fora hoje', visitanteAvisado: true })
igual(aviso.titulo, 'Não pode receber agora: José Pereira', 'aviso à portaria: título')
contem(aviso.mensagem, 'O visitante também recebeu a resposta pelo WhatsApp. Recado: fora hoje.', 'aviso à portaria: o visitante avisado, antes do recado')
const semAviso = avisoParaPortaria({ visitante: 'José', quemRespondeu: 'Ana', resposta: 'subir', recado: 'x'.repeat(280), visitanteAvisado: false, visitanteSemAviso: true })
igual(semAviso.mensagem.slice(0, 280).includes('O visitante não pôde ser avisado pelo WhatsApp: dê a resposta a ele.'), true, 'aviso à portaria: o visitante sem aviso cabe nas 280 letras do sino, mesmo com recado longo')
igual(avisoParaPortaria({ visitante: 'José', quemRespondeu: 'Ana', resposta: 'subir', recado: null, visitanteAvisado: false }).mensagem.includes('WhatsApp'), false, 'aviso à portaria: sem autorização, nada sobre o WhatsApp do visitante')
igual(situacaoDaResposta({ visitado_id: null, resposta: null }), 'sem_pessoa', 'sem pessoa do Palácio, sem resposta')
igual(situacaoDaResposta({ visitado_id: 'x', resposta: null }), 'esperando', 'esperando a resposta')
const autorizou = (tel: string, marca: string | null) => lerVisitante({ get: (n: string) => ({ nome: 'José', telefone: tel, motivo: 'reunião', avisar_visitante: marca } as Record<string, unknown>)[n] ?? null }, true).dados.avisar_visitante
igual(autorizou('21999991234', 'on'), true, 'autorização com telefone')
igual(autorizou('', 'on'), false, 'autorização sem telefone não vale')
igual(autorizou('21999991234', null), false, 'sem marcar, não autoriza')

// ---------------------------------------------------------------- o registro da visita pelo WhatsApp, em etapas
const equipe: PessoaNaConversa[] = [
  { id: 'u-ana', nome: 'Ana Lima', setor: 'Comunicação' }, { id: 'u-anab', nome: 'Ana Beatriz Souza', setor: 'RH' }, { id: 'u-carlos', nome: 'Carlos Pereira', setor: null },
]
type Vez = { dados: DadosDaVisita; passo: PassoDoRegistro | null; pergunta: PerguntaDaVisita | null }
/** Uma resposta na conversa, como o servidor faz (lib/whatsapp/portaria.ts): o passo, a busca na equipe e a próxima pergunta. */
function responder(d: DadosDaVisita, texto: string): Vez {
  const passo = seguirNoRegistro(d, texto)
  if (passo.tipo === 'seguir') { const p = perguntaDaVisita(passo.dados); return { dados: { ...passo.dados, etapa: p.etapa }, passo, pergunta: p } }
  if (passo.tipo === 'buscar') {
    const achou = resultadoDaBusca(passo.dados, passo.busca, acharPeloNome(equipe, passo.busca))
    const p = achou.pergunta ?? perguntaDaVisita(achou.dados)
    return { dados: { ...achou.dados, etapa: p.etapa }, passo, pergunta: p }
  }
  return { dados: d, passo, pergunta: null }
}
/** A primeira pergunta de um registro (comecarVisita): o nome e, se veio, a foto. */
const comecar = (d: DadosDaVisita): Vez => { const p = perguntaDaVisita(d); return { dados: { ...d, etapa: p.etapa }, passo: null, pergunta: p } }
const botoes = (i: Interativo | null | undefined) => (i?.tipo === 'botoes' ? i.botoes.map((b) => b.titulo) : null)
/** O "não" que responde (acoes.ts, seguirPendencia): nessas etapas não desiste do registro. */
const naoCancela = (d: DadosDaVisita, texto: string) => ETAPAS_EM_QUE_NAO_RESPONDE.has(String(d.etapa)) && ehPular(texto)
const fotoDeTeste: FotoNaConversa = { midia: 'wamid-midia-1', mime: 'image/jpeg' }

// O caminho inteiro: nome → para quem (a lista) → telefone → autorização → de onde vem → motivo → crachá → foto → conferência.
let r = comecar({ nome: 'João Silva' })
igual(r.pergunta?.etapa, 'pessoa', 'registro: depois do nome, para quem')
r = responder(r.dados, 'Ana')
igual([r.passo?.tipo, r.dados.etapa, r.pergunta?.interativo?.tipo], ['buscar', 'escolher_pessoa', 'lista'], 'registro: duas Anas viram a lista para escolher')
contem(r.pergunta?.texto ?? '', 'Achei mais de uma pessoa com “Ana”', 'registro: a lista diz o que buscou')
r = responder(r.dados, '1')
igual([r.dados.pessoa?.id, r.dados.opcoes, r.dados.etapa], ['u-ana', undefined, 'telefone'], 'registro: escolheu a Ana Lima; vem o telefone')
igual(botoes(r.pergunta?.interativo), ['Pular', 'Registrar já', 'Cancelar'], 'registro: o telefone tem Pular, Registrar já e Cancelar')
contem(r.pergunta?.texto ?? '', '*registrar já* pula o resto', 'registro: a primeira opcional ensina o "registrar já"')
r = responder(r.dados, '(21) 99999-1234')
igual([r.dados.telefone, r.dados.etapa], ['5521999991234', 'consentimento'], 'registro: telefone canônico; vem a autorização')
igual(botoes(r.pergunta?.interativo), ['Sim', 'Não', 'Cancelar'], 'registro: a autorização é Sim ou Não')
contem(r.pergunta?.texto ?? '', '+55 (21) 99999-1234', 'registro: a autorização mostra o telefone formatado')
contem(r.pergunta?.texto ?? '', 'Só com o *sim* dele', 'registro: a autorização diz que só o sim vale')
r = responder(r.dados, 'aceita')
igual([r.dados.avisar, r.dados.etapa], [true, 'empresa'], 'registro: o toque em Sim autoriza; vem de onde vem')
r = responder(r.dados, 'Gráfica *Boa*')
igual([r.dados.empresa, r.dados.etapa], ['Gráfica Boa', 'motivo'], 'registro: de onde vem, sem formatação')
r = responder(r.dados, 'Reunião de orçamento')
igual([r.dados.motivo, r.dados.etapa], ['Reunião de orçamento', 'cracha'], 'registro: o motivo; vem o crachá')
r = responder(r.dados, 'crachá V-07')
igual([r.dados.cracha, r.dados.etapa], ['V-07', 'foto'], 'registro: o crachá; vem a foto')
igual(botoes(r.pergunta?.interativo), ['Sem foto', 'Cancelar'], 'registro: a foto tem Sem foto e Cancelar')
contem(r.pergunta?.texto ?? '', 'câmera do WhatsApp', 'registro: a foto pede a câmera do WhatsApp')
contem(r.pergunta?.texto ?? '', 'A foto entra no registro da visita, no Palácio, e vai na ficha que a pessoa visitada recebe no WhatsApp', 'registro: a foto diz onde fica e que vai na ficha')
igual(perguntaDaVisita({ nome: 'X', setor: 'Financeiro', telefone: '', empresa: '', motivo: '', cracha: '' }).texto.includes('ficha'), false, 'registro: com o setor, a foto não fala em ficha (não há)')
const comAFoto = comFoto(r.dados, fotoDeTeste)
const conferencia = perguntaDaVisita(comAFoto.dados, comAFoto.antes)
igual([conferencia.etapa, conferencia.interativo], ['conferencia', BOTOES_DA_CONFERENCIA], 'registro: com a foto, vem a conferência com Confirmo e Cancelar')
for (const trecho of ['Foto recebida ✓\n\nRegistrar a entrada de *João Silva*?', 'Para: *Ana Lima* (Comunicação)', 'Telefone: +55 (21) 99999-1234 (autorizou: recebe a resposta no WhatsApp)',
  'De: Gráfica Boa', 'Motivo: Reunião de orçamento', 'Crachá: V-07', 'Foto: recebida ✓']) contem(conferencia.texto, trecho, `conferência: ${trecho.slice(0, 30)}`)
igual(conferencia.texto.includes('Sem foto'), false, 'conferência: com foto, não pede foto')
igual(objetoInterativo(conferencia.texto, BOTOES_DA_CONFERENCIA)?.type, 'button', 'conferência: cabe nos botões')
igual(seguirNoRegistro({ ...comAFoto.dados, etapa: 'conferencia' }, 'confirmo'), { tipo: 'confirmar' }, 'conferência: "confirmo" registra')
igual(seguirNoRegistro({ ...comAFoto.dados, etapa: 'conferencia' }, 'sim').tipo, 'repetir', 'conferência: "sim" solto não registra')

// Pular: cada opcional fica em branco; sem telefone, nada de autorização.
let pulo = responder({ nome: 'Maria', pessoa: equipe[2], etapa: 'telefone' }, 'pular')
igual([pulo.dados.telefone, pulo.dados.etapa], ['', 'empresa'], 'pular: sem telefone, a autorização nem é perguntada')
pulo = responder(pulo.dados, 'não')
igual([pulo.dados.empresa, pulo.dados.etapa], ['', 'motivo'], 'pular: "não" deixa de onde vem em branco')
pulo = responder(pulo.dados, 'sem motivo')
igual([pulo.dados.motivo, pulo.dados.etapa], ['', 'cracha'], 'pular: "sem motivo"')
pulo = responder(pulo.dados, 'Pular')
igual([pulo.dados.cracha, pulo.dados.etapa], ['', 'foto'], 'pular: o crachá')
pulo = responder(pulo.dados, 'pular')
igual([pulo.dados.foto, pulo.dados.etapa], [null, 'conferencia'], 'pular: sem foto, a conferência')
contem(pulo.pergunta?.texto ?? '', 'Sem foto: mande agora pela câmera do WhatsApp, antes do *confirmo*', 'conferência sem foto: ainda dá para mandar')
igual(['Telefone:', 'De:', 'Motivo:', 'Crachá:'].some((t) => (pulo.pergunta?.texto ?? '').includes(t)), false, 'conferência: o que pulou não aparece')

// Registrar já: o resto fica em branco e vem a conferência — de qualquer opcional, inclusive da autorização.
const ja = responder({ nome: 'Pedro', pessoa: equipe[0], etapa: 'telefone' }, 'registrar ja')
igual([ja.dados.ja, ja.dados.etapa, ja.dados.telefone], [true, 'conferencia', undefined], 'registrar já: do telefone direto à conferência')
const jaNaAutorizacao = responder({ nome: 'Pedro', pessoa: equipe[0], telefone: '5521999991234', etapa: 'consentimento' }, 'Registrar já')
igual([jaNaAutorizacao.dados.avisar, jaNaAutorizacao.dados.etapa], [false, 'conferencia'], 'registrar já na autorização: sem o sim, não autoriza')
contem(jaNaAutorizacao.pergunta?.texto ?? '', '(não recebe mensagem do Palácio)', 'registrar já na autorização: a conferência diz que o número não recebe')
igual(responder({ nome: 'Pedro', pessoa: equipe[0], telefone: '', avisar: undefined, empresa: 'X', etapa: 'motivo' }, 'pronto').dados.etapa, 'conferencia', 'registrar já: "pronto" fecha')
igual(responder({ nome: 'Pedro', pessoa: equipe[0], telefone: '', empresa: '', motivo: '', cracha: '', etapa: 'foto' }, 'registrar já').dados.foto, null, 'registrar já na foto: sem foto')
igual(seguirNoRegistro({ nome: 'Pedro', etapa: 'pessoa' }, 'registrar já').tipo, 'buscar', 'registrar já: para quem é obrigatório (vira a busca)')

// A autorização: só o sim; o "não" responde (não desiste do registro); "cancelar" desiste.
const naAutorizacao: DadosDaVisita = { nome: 'Pedro', pessoa: equipe[0], telefone: '5521999991234', etapa: 'consentimento' }
igual(responder(naAutorizacao, 'Sim').dados.avisar, true, 'autorização: "Sim"')
igual(responder(naAutorizacao, 'não').dados.avisar, false, 'autorização: "não" recusa')
igual(responder(naAutorizacao, 'nao aceita').dados.avisar, false, 'autorização: o toque em Não recusa')
igual(responder(naAutorizacao, 'ok').passo?.tipo, 'repetir', 'autorização: "ok" solto não autoriza')
igual([naoCancela(naAutorizacao, 'não'), naoCancela(naAutorizacao, 'cancelar'), ehCancelamento('cancelar')], [true, false, true], 'autorização: "não" não cancela; "cancelar" cancela')
igual(naoCancela({ etapa: 'nome' }, 'não'), false, 'no nome, "não" desiste do registro')
igual(BOTOES_DO_CONSENTIMENTO.tipo === 'botoes' && BOTOES_DO_CONSENTIMENTO.botoes.map((b) => [lerConsentimento(b.id), ehCancelamento(b.id)]), [[true, false], [false, false], [null, true]],
  'autorização: os ids dos botões são lidos, e só o Cancelar cancela')
// Com o setor, ninguém responde: a autorização não é perguntada, e o telefone não recebe nada.
const paraOSetor = responder({ nome: 'Pedro', setor: 'Financeiro', etapa: 'telefone' }, '21 98888-7777')
igual([paraOSetor.dados.telefone, paraOSetor.dados.etapa], ['5521988887777', 'empresa'], 'setor: com telefone, sem a pergunta da autorização')

// O telefone inválido: pede de novo; com cara de telefone (6 dígitos ou mais), mesmo sem citar a pergunta.
const naoEntendi = seguirNoRegistro({ nome: 'Pedro', pessoa: equipe[0], etapa: 'telefone' }, '21 9999-12')
igual([naoEntendi.tipo, naoEntendi.tipo === 'repetir' && naoEntendi.sempre], ['repetir', true], 'telefone: dígitos de menos, pede de novo sempre')
const semDigitos = seguirNoRegistro({ nome: 'Pedro', pessoa: equipe[0], etapa: 'telefone' }, 'amanhã')
igual([semDigitos.tipo, semDigitos.tipo === 'repetir' && Boolean(semDigitos.sempre)], ['repetir', false], 'telefone: sem número, só se citou')
igual(seguirNoRegistro({ nome: 'Pedro', pessoa: equipe[0], etapa: 'telefone' }, '(20) 98765-4321').tipo, 'repetir', 'telefone: DDD que não existe')
igual(responder({ nome: 'Pedro', pessoa: equipe[0], etapa: 'telefone' }, '+351 912 345 678').dados.telefone, '351912345678', 'telefone: de fora do Brasil, com +')
igual(responder({ nome: 'Pedro', pessoa: equipe[0], etapa: 'telefone' }, 'não tem').dados.telefone, '', 'telefone: "não tem" pula')

// Nome, para quem e os textos livres.
igual(seguirNoRegistro({ etapa: 'nome' }, '1').tipo, 'repetir', 'nome: número não é nome')
igual(responder({ etapa: 'nome' }, '  Carlos   *Pereira* ').dados.nome, 'Carlos Pereira', 'nome: limpo')
igual(responder({ etapa: 'nome' }, 'visitante: Maria Souza').dados.nome, 'Maria Souza', 'nome: "visitante: Maria" responde com o nome que vem depois')
// "visitante: Maria" no meio de outro registro: não vira a empresa, o motivo, o crachá, o telefone nem a busca do visitante em
// curso — pede de novo só citando (sem `sempre`); sem citar, o bot segue para o registro novo (comecarVisita).
const emCurso: DadosDaVisita = { nome: 'João', pessoa: equipe[0], telefone: '', empresa: '', motivo: '' }
const outroNoMeio: [string, DadosDaVisita][] = [
  ['pessoa', { nome: 'João', etapa: 'pessoa' }], ['escolher_pessoa', { nome: 'João', opcoes: equipe.slice(0, 2), etapa: 'escolher_pessoa' }],
  ['telefone', { nome: 'João', pessoa: equipe[0], etapa: 'telefone' }], ['empresa', { ...emCurso, empresa: undefined, motivo: undefined, etapa: 'empresa' }],
  ['motivo', { ...emCurso, motivo: undefined, etapa: 'motivo' }], ['cracha', { ...emCurso, etapa: 'cracha' }],
]
for (const [etapa, d] of outroNoMeio) {
  const passo = seguirNoRegistro(d, 'visitante: Maria Souza')
  igual([passo.tipo, passo.tipo === 'repetir' && Boolean(passo.sempre)], ['repetir', false], `outro visitante na etapa ${etapa}: não é a resposta, e sem citar segue para o registro novo`)
}
const oOutro = seguirNoRegistro({ ...emCurso, motivo: undefined, etapa: 'motivo' }, 'visitante: Maria Souza')
contem(oOutro.tipo === 'repetir' ? oOutro.texto : '', 'termine ou cancele este registro primeiro', 'outro visitante citando a pergunta: diz o que fazer')
igual(seguirNoRegistro({ ...emCurso, etapa: 'cracha' }, 'visitante: Ana').tipo, 'repetir', 'crachá: "visitante: Ana" (curto) não vira o crachá')
igual(responder({ ...emCurso, empresa: undefined, motivo: undefined, etapa: 'empresa' }, 'Visitante da prefeitura').dados.empresa, 'Visitante da prefeitura', 'de onde vem: sem os dois-pontos, é a resposta')
igual(responder({ nome: 'X Y', etapa: 'pessoa' }, 'setor: Financeiro').dados.setor, 'Financeiro', 'para quem: o setor')
igual(responder({ nome: 'X Y', etapa: 'pessoa' }, 'Zé Ninguém').dados.etapa, 'pessoa', 'para quem: ninguém achado, pergunta de novo')
igual(responder({ nome: 'X Y', etapa: 'pessoa' }, 'carlos').dados.pessoa?.id, 'u-carlos', 'para quem: uma pessoa achada segue')
igual(seguirNoRegistro({ nome: 'X Y', opcoes: equipe.slice(0, 2), etapa: 'escolher_pessoa' }, '3').tipo, 'repetir', 'para quem: número fora da lista')
igual(seguirNoRegistro({ nome: 'X Y', pessoa: equipe[0], telefone: '', etapa: 'empresa' }, '42').tipo, 'repetir', 'de onde vem: número solto não é empresa')
igual(responder({ nome: 'X Y', pessoa: equipe[0], telefone: '', empresa: '', motivo: '', etapa: 'cracha' }, '7').dados.cracha, '7', 'crachá: o número solto vale')
igual([lerCracha('V-07'), lerCracha('crachá: V-07'), lerCracha('nº 7'), lerCracha('Crachá de visitante 12'), lerCracha('Nova 3'), lerCracha('x'.repeat(21))],
  ['V-07', 'V-07', '7', '12', 'Nova 3', null], 'crachá: o que vem antes do número sai; mais de 20, não')
igual(responder({ nome: 'X Y', pessoa: equipe[0], telefone: '', empresa: 'A', etapa: 'motivo' }, 'x'.repeat(400)).dados.motivo?.length, LIMITES_DA_VISITA.motivo, 'motivo: cortado em 300')
igual(seguirNoRegistro({ nome: 'X', pessoa: equipe[0], telefone: '', empresa: '', motivo: '', cracha: '', etapa: 'foto' }, 'segue').tipo, 'repetir', 'foto: texto que não pula pede a foto')
igual(seguirNoRegistro({ nome: 'X', etapa: undefined }, 'oi').tipo, 'perdido', 'etapa desconhecida: perdido')
igual(proximaEtapa({ nome: 'X', pessoa: equipe[0], etapa: 'motivo', motivo: 'Reunião' }), 'telefone', 'registro antigo (sem telefone): continua pelas perguntas novas')

// As palavras e os botões.
igual(BOTOES_DA_ETAPA_OPCIONAL.tipo === 'botoes' && BOTOES_DA_ETAPA_OPCIONAL.botoes.map((b) => [ehPularNaVisita(b.id), ehRegistrarJa(b.id), ehCancelamento(b.id)]),
  [[true, false, false], [false, true, false], [false, false, true]], 'botões das opcionais: Pular pula, Registrar já fecha, Cancelar cancela')
igual(BOTOES_DA_FOTO.tipo === 'botoes' && ehPularNaVisita(BOTOES_DA_FOTO.botoes[0].id), true, 'botão Sem foto pula')
igual([lerPedido('registrar ja', { pausado: false }).comando, lerPedido('aceita', { pausado: false }).comando, lerPedido('nao aceita', { pausado: false }).comando],
  ['desconhecido', 'desconhecido', 'desconhecido'], 'os ids dos botões não são outros comandos')
igual([lerConsentimento('Sim'), lerConsentimento('autorizo'), lerConsentimento('Não aceita'), lerConsentimento('talvez')], [true, true, false, null], 'autorização: as palavras')
igual([...ETAPAS_DE_TEXTO_LIVRE].includes('consentimento') || [...ETAPAS_DE_TEXTO_LIVRE].includes('conferencia'), false, 'texto livre: nem a autorização nem a conferência')
// Cada pergunta cabe nos botões com o nome mais longo (120) e a lista da escolha com 9 pessoas.
const longo: DadosDaVisita = { nome: 'N'.repeat(120), pessoa: { id: 'u', nome: 'P'.repeat(120), setor: 'S'.repeat(120) }, telefone: '5521999991234' }
for (const etapa of ['telefone', 'consentimento', 'empresa', 'motivo', 'cracha', 'foto'] as const) {
  const campos: DadosDaVisita = { telefone: { ...longo }, consentimento: { ...longo }, empresa: { ...longo, avisar: true }, motivo: { ...longo, avisar: true, empresa: '' },
    cracha: { ...longo, avisar: true, empresa: '', motivo: '' }, foto: { ...longo, avisar: true, empresa: '', motivo: '', cracha: '' } }[etapa]
  if (etapa === 'telefone') delete campos.telefone
  const pergunta = perguntaDaVisita(campos, 'Foto trocada ✓ (vale a última).')
  igual([pergunta.etapa, objetoInterativo(pergunta.texto, pergunta.interativo!)?.type], [etapa, 'button'], `${etapa}: a pergunta cabe nos botões`)
}
const cheia: DadosDaVisita = { ...longo, avisar: true, empresa: 'E'.repeat(120), motivo: 'M'.repeat(300), cracha: 'C'.repeat(20), foto: fotoDeTeste }
const conferenciaCheia = perguntaDaVisita(cheia, 'Foto trocada ✓ (vale a última).')
igual(conferenciaCheia.etapa, 'conferencia', 'conferência cheia: tudo dito')
igual(conferenciaCheia.texto.length <= LIMITES_DO_INTERATIVO.corpo && objetoInterativo(conferenciaCheia.texto, BOTOES_DA_CONFERENCIA)?.type === 'button', true, 'conferência cheia: cabe no corpo de 1024')
const nove = Array.from({ length: 9 }, (_, i) => ({ id: `u${i}`, nome: `Ana Beatriz de Souza ${i}`, setor: 'Comunicação Social e Marketing' }))
const escolha = resultadoDaBusca({ nome: 'N'.repeat(120) }, 'Ana', nove)
igual([escolha.pergunta?.etapa, objetoInterativo(escolha.pergunta!.texto, escolha.pergunta!.interativo!)?.type], ['escolher_pessoa', 'list'], 'escolha: 9 pessoas cabem na lista')
igual(resultadoDaBusca({ nome: 'X' }, 'a', [...nove, ...nove]).pergunta?.etapa, 'pessoa', 'escolha: mais de 9, pede mais do nome')

// A foto: em qualquer etapa, trocada, e abrindo o registro.
const noTelefone = comFoto({ nome: 'Lia', pessoa: equipe[0], etapa: 'telefone' }, fotoDeTeste)
const depoisDaFoto = perguntaDaVisita(noTelefone.dados, noTelefone.antes)
igual([depoisDaFoto.etapa, depoisDaFoto.texto.startsWith('Foto recebida ✓\n\nQual é o telefone')], ['telefone', true], 'foto no meio: recebida, e a pergunta de agora continua')
let fluxo = responder({ ...noTelefone.dados, etapa: 'telefone' }, 'pular')
fluxo = responder(fluxo.dados, 'pular')
fluxo = responder(fluxo.dados, 'pular')
fluxo = responder(fluxo.dados, 'pular')
igual(fluxo.dados.etapa, 'conferencia', 'foto no meio: a pergunta da foto não vem depois')
igual(comFoto(noTelefone.dados, { midia: 'outra', mime: 'image/png' }).antes, 'Foto trocada ✓ (vale a última).', 'foto de novo: a última vale')
// A foto no meio de uma pergunta que continua: só o recibo — a mensagem da pergunta (os botões, o "confirmo" citando) segue
// valendo; mandar a pergunta de novo trocaria a mensagem da pendência. Só a pergunta da foto avança.
const semFotoNaConferencia: DadosDaVisita = { nome: 'Maria', pessoa: equipe[2], telefone: '', empresa: '', motivo: '', cracha: '', foto: null, etapa: 'conferencia' }
const naPerguntaDaFoto: DadosDaVisita = { nome: 'Maria', pessoa: equipe[2], telefone: '', empresa: '', motivo: '', cracha: '', etapa: 'foto' }
igual([
  fotoMantemAPergunta({ nome: 'Lia', pessoa: equipe[0], etapa: 'telefone' }, noTelefone.dados),
  fotoMantemAPergunta({ etapa: 'nome' }, comFoto({ etapa: 'nome' }, fotoDeTeste).dados),
  fotoMantemAPergunta(semFotoNaConferencia, comFoto(semFotoNaConferencia, fotoDeTeste).dados),
  fotoMantemAPergunta(naPerguntaDaFoto, comFoto(naPerguntaDaFoto, fotoDeTeste).dados),
  fotoMantemAPergunta({ nome: 'Lia' }, comFoto({ nome: 'Lia' }, fotoDeTeste).dados),
], [true, true, true, false, false], 'foto no meio: a pergunta de agora continua (telefone, nome, conferência); na pergunta da foto, vem a seguinte')
igual(perguntaDaVisita(comFoto(naPerguntaDaFoto, fotoDeTeste).dados).etapa, 'conferencia', 'foto na pergunta da foto: vem a conferência')
igual([textoDaFotoNaPergunta('Foto recebida ✓', 'telefone'), textoDaFotoNaPergunta('Foto trocada ✓ (vale a última).', 'conferencia')],
  ['Foto recebida ✓ Siga respondendo a pergunta acima.', 'Foto trocada ✓ (vale a última). Agora toque em *Confirmo* na conferência acima.'], 'foto no meio: o recibo, e na conferência o Confirmo dela')
// As perguntas do registro levam o telefone do visitante: nunca esperam na fila (whatsapp_fila guardaria o texto).
igual([perguntaSemFila('registrar_visita'), perguntaSemFila('abrir_chamado'), perguntaSemFila(null)], [true, false, false], 'fila: a pergunta do registro da visita sai sem fila')
igual(comecar({ foto: fotoDeTeste }).pergunta?.texto.startsWith('Qual é o nome do visitante?'), true, 'foto sem nome na legenda: pergunta o nome')
igual(perguntaDaVisita({ foto: fotoDeTeste }, comFoto({}, fotoDeTeste).antes).texto.startsWith('Foto recebida ✓'), true, 'foto abrindo o registro: recebida')
const destino = (aberto: DadosDaVisita | null, legenda: string | null, extra: Partial<Parameters<typeof destinoDaImagem>[0]> = {}) =>
  destinoDaImagem({ categoria: 'foto', citouAviso: false, aberto, legenda, temPortaria: true, ...extra })
igual([destino(null, 'João'), destino(null, ''), destino(null, null)], ['comecar', 'comecar', null], 'imagem sem registro aberto: a legenda "visitante:" abre; sem ela, o caminho de sempre')
igual([destino({ nome: 'João Silva' }, null), destino({ nome: 'João Silva' }, ''), destino({ nome: 'João Silva' }, 'joão  silva')], ['foto', 'foto', 'foto'], 'imagem com registro aberto: é a foto dele')
igual(destino({ nome: 'João Silva' }, 'Maria Souza'), 'comecar', 'imagem com a legenda de outro visitante: registro novo')
igual([destino({ nome: 'J' }, null, { categoria: 'video' }), destino({ nome: 'J' }, null, { citouAviso: true }), destino(null, 'João', { temPortaria: false })], [null, null, null],
  'vídeo, imagem citando aviso e quem não tem a portaria: o caminho de sempre')
const imagem = (m: Record<string, unknown>) => lerEventoDaKapso({ message: { id: 'wi', type: 'image', from: '5521987654321', image: { id: 'midia_9', mime_type: 'image/jpeg', ...m } } },
  'whatsapp.message.received', null).mensagens[0]
const comLegenda = imagem({ caption: 'visitante: João Silva' })
igual([lerPedido(comLegenda.texto, { pausado: false }), comLegenda.midia?.categoria], [{ comando: 'registrar_visita', resto: 'João Silva' }, 'foto'], 'a legenda "visitante:" chega como o pedido')
igual(lerLegendaDeVisita(comLegenda.texto), 'João Silva', 'a legenda "visitante:" dá o nome')
// Só com os dois-pontos: a legenda de foto para a comunicação ("Nova visita do governador…") segue para o envio de fotos.
igual(['visitante: João', 'visitante:', 'Registrar visita: Maria  *Souza*', 'Nova visita : Ana', 'novo visitante:Carlos'].map((t) => lerLegendaDeVisita(t)),
  ['João', '', 'Maria Souza', 'Ana', 'Carlos'], 'legenda: com os dois-pontos, o nome (ou vazio)')
igual(['Nova visita do governador ao hospital', 'Visitante ilustre na sede hoje', 'Novo visitante no abrigo', 'Registrar visita técnica ao hospital', 'visitante', '', 'Ação no abrigo: visitante']
  .map((t) => lerLegendaDeVisita(t)), [null, null, null, null, null, null, null], 'legenda: sem os dois-pontos logo depois, não é registro')
igual([destino(null, lerLegendaDeVisita('Nova visita do governador ao hospital')), destino(null, lerLegendaDeVisita('Visitante ilustre na sede hoje'))], [null, null],
  'legenda da comunicação, sem registro aberto: a foto segue para o envio de fotos')
const midia = (m: Partial<MidiaRecebida>): MidiaRecebida => ({ categoria: 'foto', mime: 'image/jpeg', tamanho: 200_000, nome: null, arquivo: 'midia_9', ...m })
igual(fotoRecebida(midia({})), { foto: { midia: 'midia_9', mime: 'image/jpeg' } }, 'foto: JPEG da câmera, o id da mídia')
igual(fotoRecebida(midia({ mime: 'image/png', endereco: 'https://api.kapso.ai/m/1' })), { foto: { midia: 'midia_9', mime: 'image/png', endereco: 'https://api.kapso.ai/m/1' } }, 'foto: PNG, com o endereço de reserva')
igual('erro' in (fotoRecebida(midia({ mime: 'image/heic' })) ?? {}), true, 'foto: HEIC recusado na chegada (o servidor não abre)')
igual('erro' in (fotoRecebida(midia({ mime: 'image/gif' })) ?? {}), true, 'foto: GIF não serve')
igual('erro' in (fotoRecebida(midia({ tamanho: 17 * 1024 * 1024 })) ?? {}), true, 'foto: grande demais')
igual('erro' in (fotoRecebida(midia({ arquivo: undefined })) ?? {}), true, 'foto: sem como baixar')
igual(fotoRecebida(midia({ arquivo: '../x', endereco: 'https://api.kapso.ai/m/2' })), { foto: { midia: '', mime: 'image/jpeg', endereco: 'https://api.kapso.ai/m/2' } }, 'foto: id estranho fica de fora, vale o endereço')
igual([fotoRecebida(midia({ categoria: 'video', mime: 'video/mp4' })), fotoRecebida(null)], [null, null], 'vídeo e mensagem sem mídia: não é foto')

// Depois do "confirmo": a resposta, e a pendência redigida.
const registrada = textoDaEntradaRegistrada({ nome: 'João Silva', hora: '14:05', pessoa: { nome: 'Ana Lima' }, setor: null, foto: 'ok', avisar: true, abrir: 'https://p/portaria' })
contem(registrada, 'Pronto: entrada de *João Silva* registrada às 14:05, com a foto. Ana recebeu o aviso', 'registrada: com a foto e quem foi avisado')
contem(registrada, 'O visitante autorizou: a resposta também vai para o WhatsApp dele.', 'registrada: a autorização')
contem(registrada, 'Tela da portaria: https://p/portaria', 'registrada: o link da tela')
const semAFoto = textoDaEntradaRegistrada({ nome: 'João', hora: '14:05', pessoa: null, setor: 'Financeiro', foto: 'falhou', avisar: true, abrir: 'https://p/portaria' })
contem(semAFoto, 'para Financeiro. Ninguém foi avisado', 'registrada: só o setor')
contem(semAFoto, 'A foto não entrou: tire pela tela da portaria.', 'registrada: a foto que não entrou')
igual(semAFoto.includes('autorizou'), false, 'registrada: com o setor, nada de resposta ao visitante')
const redigidos = dadosRedigidos({ ...cheia, etapa: 'conferencia', telefone: '5521999991234', opcoes: equipe })
igual(redigidos, { etapa: 'conferencia', redigida: true }, 'redigida: só a etapa fica')
igual(JSON.stringify(redigidos).includes('5521'), false, 'redigida: o telefone do visitante sai')

// ---------------------------------------------------------------- a ficha de quem é visitado
const VISITA = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
const idsDaFicha = RESPOSTAS_DA_FICHA.map((r) => idDoBotaoDaFicha(VISITA, r))
igual(idsDaFicha, ['ficha:1:1b4e28ba2fa141d2883f0016d3cca427', 'ficha:2:1b4e28ba2fa141d2883f0016d3cca427', 'ficha:3:1b4e28ba2fa141d2883f0016d3cca427'], 'ficha: o id de cada botão diz a resposta e a visita')
igual(idsDaFicha.every((id) => typeof id === 'string' && id.length <= LIMITES_DO_INTERATIVO.id && id.length <= LIMITES_DO_MODELO.payload), true, 'ficha: o id cabe nos 40 do interativo e no payload do modelo')
igual(idDoBotaoDaFicha(VISITA.toUpperCase(), 'subir'), idsDaFicha[0], 'ficha: o id da visita em maiúsculas dá o mesmo botão')
igual([idDoBotaoDaFicha('x', 'subir'), idDoBotaoDaFicha('', 'aguardar'), interativoDaFicha('x'), montagemDaFicha({ visitaId: 'x', visitante: 'J', empresa: null, motivo: null, chegada: '1', registradaPor: null })],
  [null, null, null, null], 'ficha: sem uuid da visita, sem botões nem modelo')
igual(idsDaFicha.map((id) => lerBotaoDaFicha(id ?? '')), RESPOSTAS_DA_FICHA.map((resposta) => ({ resposta, visitaId: VISITA })), 'ficha: o toque volta à resposta e à visita')
igual(['Pode subir', 'Aguarde na recepção', 'Não pode agora', 'não pode receber agora'].map((t) => lerBotaoDaFicha(t)),
  [{ resposta: 'subir', visitaId: null }, { resposta: 'aguardar', visitaId: null }, { resposta: 'recusar', visitaId: null }, { resposta: 'recusar', visitaId: null }],
  'ficha: pelo título (a resposta rápida sem o payload), a resposta sem recado; a visita vem da mensagem citada')
igual(['ficha:4:1b4e28ba2fa141d2883f0016d3cca427', `ficha:1:${'g'.repeat(32)}`, 'ficha:1:1b4e28ba', '1', '2', 'pode subir agora', 'Aguarde', ''].map((t) => lerBotaoDaFicha(t)),
  [null, null, null, null, null, null, null, null], 'ficha: o que não é botão da ficha (nem o "1" de sempre, que segue pelo aviso citado)')
igual(RESPOSTAS_DA_FICHA.map(tituloDoBotaoDaFicha), CATALOGO_DOS_MODELOS.visita.map((m) => m.botoes.map((b) => b.texto))[2], 'ficha: os títulos dos botões são os do modelo cadastrado')
igual(podeResponderPelaFicha({ visitado_id: 'u-ana' }, 'u-ana'), true, 'ficha: quem é visitado responde')
igual([podeResponderPelaFicha({ visitado_id: 'u-ana' }, 'u-carlos'), podeResponderPelaFicha({ visitado_id: null }, 'u-ana'), podeResponderPelaFicha(null, 'u-ana'), podeResponderPelaFicha({ visitado_id: 'u-ana' }, '')],
  [false, false, false, false], 'ficha: o id do botão não autoriza — outra pessoa, visita para o setor ou que não existe, nunca')

const ficha: FichaDaVisita = { visitaId: VISITA, visitante: 'João Silva', empresa: 'Gráfica Boa', motivo: 'Entrega de cartazes', chegada: '14:05', registradaPor: 'Maria Souza' }
const BASE = 'https://palaciovirtual.cruzvermelharj.org.br'
const textoFicha = textoDaFicha(ficha, BASE)
contem(textoFicha, '*Visita para você na portaria*', 'ficha: o título')
contem(textoFicha, 'Visitante: *João Silva* (Gráfica Boa)\nMotivo: Entrega de cartazes\nChegada: 14:05, registrada por Maria Souza', 'ficha: quem é, de onde vem, o motivo e a chegada')
contem(textoFicha, 'Para responder à portaria: _Responda esta mensagem com *1* (pode subir)', 'ficha: o 1, 2 ou 3 de sempre, que vale com os botões e sem eles')
igual(textoFicha.toLowerCase().includes('toque'), false, 'ficha: o texto não manda tocar em botão (pode sair sem eles)')
contem(textoFicha, `Abrir: ${BASE}/portaria/visita/${VISITA}`, 'ficha: o link da visita')
const fichaSem = textoDaFicha({ ...ficha, empresa: null, motivo: null, registradaPor: null, visitante: '*José*' }, BASE)
contem(fichaSem, 'Visitante: *José*\nMotivo: não informado\nChegada: 14:05\n', 'ficha: sem empresa, motivo e quem registrou; o nome sem a formatação de quem escreveu')
const enorme: FichaDaVisita = { visitaId: VISITA, visitante: 'A'.repeat(500), empresa: 'B'.repeat(500), motivo: 'C'.repeat(3000), chegada: '14:05'.repeat(10), registradaPor: 'D'.repeat(500) }
const textoEnorme = textoDaFicha(enorme, BASE)
igual(textoEnorme.length <= LIMITES_DO_INTERATIVO.corpo, true, 'ficha: com tudo no máximo, o corpo cabe em 1.024')
const fichaComFoto = objetoInterativo(textoFicha, interativoDaFicha(VISITA, '4490709327384033') as Interativo)
igual(fichaComFoto?.type === 'button' ? [fichaComFoto.header, fichaComFoto.action.buttons.map((b) => [b.reply.id, b.reply.title])] : null,
  [{ type: 'image', image: { id: '4490709327384033' } }, idsDaFicha.map((id, i) => [id ?? '', ['Pode subir', 'Aguarde na recepção', 'Não pode agora'][i]])], 'ficha: a foto no cabeçalho e os três botões')
const fichaSemFoto = objetoInterativo(textoEnorme, interativoDaFicha(VISITA) as Interativo)
igual(fichaSemFoto?.type === 'button' ? [fichaSemFoto.header, fichaSemFoto.action.buttons.length] : null, [undefined, 3], 'ficha: sem foto, sem cabeçalho; e a enorme ainda vai com os botões')

// Fora da janela: o modelo aprovado da visita, com o mesmo id nos botões; sem ele, o aviso de antes pelo modelo do cofre.
const naMeta = (aprovados: Record<string, string>): ModeloNaMeta[] => Object.values(CATALOGO_DOS_MODELOS).flat()
  .map((m) => ({ nome: m.nome, status: aprovados[m.nome] ? 'APPROVED' : 'PENDING', categoria: aprovados[m.nome] ?? 'UTILITY', idioma: 'pt_BR' }))
const cofre = { modelo: 'aviso_do_palacio', modeloCodigo: null, modeloSeguranca: null }
const montagem = montagemDaFicha(ficha)
igual([montagem?.parametros, montagem?.respostas, montagem?.imagem], [['João Silva (Gráfica Boa)', 'Entrega de cartazes', '14:05, registrada por Maria Souza'], idsDaFicha, null], 'ficha: as variáveis do modelo e o payload de cada botão')
igual(parametrosDaFicha({ ...ficha, empresa: null, motivo: null, registradaPor: null }), ['João Silva', 'Não informado', '14:05'], 'ficha: as variáveis sem empresa, motivo e quem registrou')
const foraV2 = modeloDaFichaForaDaJanela({ naMeta: naMeta({ portaria_visita_v2: 'UTILITY', portaria_visita: 'UTILITY' }), montagem, cofre, textoDoAviso: 'aviso' })
const botoesDoModelo = (m: ObjetoDoModelo | null) => (m?.components ?? []).flatMap((c) => (c.type === 'button' && c.sub_type === 'quick_reply' ? [[c.index, c.parameters[0].payload]] : []))
igual([foraV2?.name, botoesDoModelo(foraV2)], ['portaria_visita_v2', idsDaFicha.map((id, i) => [String(i), id])], 'ficha fora da janela: o v2 aprovado, com o id da visita em cada resposta rápida')
const corpoV2 = foraV2?.components.find((c) => c.type === 'body')
igual(corpoV2?.type === 'body' ? corpoPreenchido(modeloDoCatalogo('portaria_visita_v2')!, corpoV2.parameters.map((x) => x.text)) : '',
  'Chegou uma visita para você na recepção da Cruz Vermelha RJ.\n\nQuem é: João Silva (Gráfica Boa)\nAssunto: Entrega de cartazes\nHorário: 14:05, registrada por Maria Souza\n\nToque em uma das opções para responder à portaria.',
  'ficha fora da janela: o corpo como chega ao celular')
igual(modeloDaFichaForaDaJanela({ naMeta: naMeta({ portaria_visita: 'UTILITY' }), montagem, cofre, textoDoAviso: 'aviso' })?.name, 'portaria_visita', 'ficha fora da janela: só o v1 aprovado, ele')
igual(modeloDaFichaForaDaJanela({ naMeta: naMeta({ portaria_visita_v2: 'MARKETING', portaria_visita: 'UTILITY' }), montagem, cofre, textoDoAviso: 'aviso' })?.name, 'portaria_visita',
  'ficha fora da janela: o v2 reclassificado como Marketing fica de fora')
const fotoAprovada = naMeta({ portaria_visita_foto_v2: 'UTILITY', portaria_visita_v2: 'UTILITY' })
igual(modeloDaFichaForaDaJanela({ naMeta: fotoAprovada, montagem, cofre, textoDoAviso: 'aviso' })?.name, 'portaria_visita_v2', 'ficha fora da janela: sem a foto, o de foto não serve')
const modeloComAFoto = modeloDaFichaForaDaJanela({ naMeta: fotoAprovada, montagem: montagemDaFicha(ficha, '4490709327384033'), cofre, textoDoAviso: 'aviso' })
igual([modeloComAFoto?.name, modeloComAFoto?.components[0]], ['portaria_visita_foto_v2', { type: 'header', parameters: [{ type: 'image', image: { id: '4490709327384033' } }] }], 'ficha fora da janela: com a foto, o de foto')
const doAvisoAntigo = '*João Silva chegou para falar com você*\n\nDe Gráfica Boa.\n\nAbrir: https://p/portaria/visita/1'
const hoje = modeloDaFichaForaDaJanela({ naMeta: naMeta({}), montagem, cofre, textoDoAviso: doAvisoAntigo })
igual([hoje?.name, hoje?.components], ['aviso_do_palacio', [{ type: 'body', parameters: [{ type: 'text', text: textoParaModelo(doAvisoAntigo) }] }]], 'ficha fora da janela: hoje (tudo pendente), o aviso de antes pelo modelo do cofre')
igual(modeloDaFichaForaDaJanela({ naMeta: naMeta({}), montagem, cofre: { ...cofre, modelo: null }, textoDoAviso: doAvisoAntigo }), null, 'ficha fora da janela: sem modelo nenhum, não sai (como o aviso de antes)')
igual(modeloDaFichaForaDaJanela({ naMeta: naMeta({ portaria_visita_v2: 'UTILITY' }), montagem: null, cofre, textoDoAviso: 'aviso' })?.name, 'aviso_do_palacio', 'ficha fora da janela: sem montagem, o do cofre')

// A resposta ao visitante: só o modelo aprovado (ele nunca escreveu ao número).
const paraOVisitante = modeloDaSituacao('resposta_ao_visitante', naMeta({ portaria_resposta_visitante_v2: 'UTILITY', portaria_resposta_visitante: 'UTILITY' }),
  { parametros: parametrosParaVisitante({ quem: 'Ana Lima', setor: 'Comunicação Social', resposta: 'aguardar' }) })
const corpoAoVisitante = paraOVisitante?.components.find((c) => c.type === 'body')
igual(corpoAoVisitante?.type === 'body' ? corpoPreenchido(modeloDoCatalogo('portaria_resposta_visitante_v2')!, corpoAoVisitante.parameters.map((x) => x.text)) : '',
  'Recepção da Cruz Vermelha RJ: atualização sobre a sua visita a Ana Lima (Comunicação Social).\n\nSituação: Aguarde na recepção, por favor. Avisaremos por aqui quando puder subir.\n\nEm caso de dúvida, procure a recepção.',
  'ao visitante: o v2, como chega ao celular')
igual(modeloDaSituacao('resposta_ao_visitante', naMeta({ portaria_resposta_visitante_v2: 'MARKETING' }), { parametros: ['Ana', SITUACAO_PARA_VISITANTE.subir] }), null,
  'ao visitante: sem modelo de Utilidade aprovado, nada sai (a portaria fica sabendo)')

// A foto só sobe para a Meta quando pode aparecer.
igual([
  sobeAFotoDaFicha({ temFoto: true, janelaAberta: true, modeloComFoto: false }), sobeAFotoDaFicha({ temFoto: true, janelaAberta: null, modeloComFoto: false }),
  sobeAFotoDaFicha({ temFoto: true, janelaAberta: false, modeloComFoto: true }), sobeAFotoDaFicha({ temFoto: true, janelaAberta: false, modeloComFoto: false }),
  sobeAFotoDaFicha({ temFoto: false, janelaAberta: true, modeloComFoto: true }),
], [true, true, true, false, false], 'ficha: a foto sobe com a janela aberta (ou sem saber) ou com modelo de foto aprovado; fechada e sem ele, não')

// O toque chega ao webhook: o botão da ficha (button_reply) e a resposta rápida do modelo (button), sempre citando a ficha.
const toque = (message: Record<string, unknown>) => lerEventoDaKapso({ message: { id: 'wt', from: '5521987654321', context: { id: 'wamid.FICHA' }, ...message } },
  'whatsapp.message.received', null).mensagens[0]
const noBotao = toque({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: idsDaFicha[1], title: 'Aguarde na recepção' } } })
igual([noBotao.toque, noBotao.citada, lerBotaoDaFicha(noBotao.texto)], [true, 'wamid.FICHA', { resposta: 'aguardar', visitaId: VISITA }], 'ficha: o toque no botão traz o id e cita a ficha')
const noModelo = toque({ type: 'button', button: { payload: idsDaFicha[2], text: 'Não pode agora' } })
igual([noModelo.toque, lerBotaoDaFicha(noModelo.texto)], [true, { resposta: 'recusar', visitaId: VISITA }], 'ficha: a resposta rápida do modelo, pelo payload')
const semPayload = toque({ type: 'button', button: { text: 'Pode subir' } })
igual([semPayload.toque, lerBotaoDaFicha(semPayload.texto)], [true, { resposta: 'subir', visitaId: null }], 'ficha: sem o payload, o título — a visita vem da ficha citada')
const digitado = toque({ type: 'text', text: { body: idsDaFicha[0] } })
igual(digitado.toque, false, 'ficha: o id digitado não é toque (o bot só lê a ficha pelo toque)')

// ---------------------------------------------------------------- a foto do visitante no servidor (sharp de verdade, sem rede)
async function conferirFotoDoServidor() {
  // foto-servidor.ts começa com import 'server-only', que só existe dentro do Next: aqui vira um arquivo vazio.
  const { writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { crc32 } = await import('node:zlib')
  const Module = (await import('node:module')).default as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string }
  const vazio = join(tmpdir(), 'server-only-vazio.js')
  writeFileSync(vazio, '')
  const resolver = Module._resolveFilename
  Module._resolveFilename = function (pedido: string, ...resto: unknown[]) { return pedido === 'server-only' ? vazio : resolver.call(this, pedido, ...resto) }
  const { normalizarFotoDoVisitante, LADO_DA_FOTO_DO_VISITANTE } = await import('../lib/portaria/foto-servidor')
  const { farejarTipo, jpegTemMetadados } = await import('../lib/midia/regras')
  const sharp = (await import('sharp')).default

  const cor = (l: number, a: number, alfa = 1) => sharp({ create: { width: l, height: a, channels: 4, background: { r: 200, g: 30, b: 30, alpha: alfa } } })
  // A foto de celular deitada (Orientation 6) e com GPS: sai em pé, reduzida e sem nada.
  // (O Orientation vai por withMetadata: no withExif, o sharp não o escreve.)
  const celular = await cor(3000, 2000).jpeg().withExif({ IFD0: { Make: 'Teste' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '22/1 54/1 0/1' } }).withMetadata({ orientation: 6 }).toBuffer()
  const original = await sharp(celular).metadata()
  igual([original.orientation, Boolean(original.exif)], [6, true], 'foto do servidor: a foto de teste chega deitada e com EXIF')
  const saida = await normalizarFotoDoVisitante(new Uint8Array(celular))
  const meta = saida ? await sharp(saida).metadata() : null
  igual([meta?.format, meta?.width, meta?.height], ['jpeg', 683, LADO_DA_FOTO_DO_VISITANTE], 'foto do servidor: girada pelo EXIF e no máximo 1024 px')
  igual([Boolean(meta?.exif), Boolean(meta?.xmp), (meta?.orientation ?? 1) > 1, saida ? jpegTemMetadados(new Uint8Array(saida)) : true], [false, false, false, false], 'foto do servidor: sem EXIF, GPS nem orientação')
  // PNG pequeno com transparência: JPEG, sem aumentar, com fundo branco.
  const png = await normalizarFotoDoVisitante(new Uint8Array(await cor(300, 200, 0.5).png().toBuffer()))
  const metaPng = png ? await sharp(png).metadata() : null
  igual([png ? farejarTipo(new Uint8Array(png)) : null, metaPng?.width, metaPng?.height, metaPng?.hasAlpha], ['jpeg', 300, 200, false], 'foto do servidor: PNG pequeno vira JPEG do mesmo tamanho')
  igual(Boolean(await normalizarFotoDoVisitante(new Uint8Array(await cor(800, 800).webp().toBuffer()))), true, 'foto do servidor: WebP abre')
  // O que não é foto não chega ao sharp.
  igual(await normalizarFotoDoVisitante(new Uint8Array(await cor(50, 50).gif().toBuffer())), null, 'foto do servidor: GIF não')
  igual(await normalizarFotoDoVisitante(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')), null, 'foto do servidor: SVG não')
  igual(await normalizarFotoDoVisitante(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 64 }, (_, i) => i)])), null, 'foto do servidor: JPEG quebrado não')
  // A bomba de descompressão: um PNG de 10 × 10 que diz ter 20.000 × 20.000 px (400 MP) para no teto de pixels.
  const pequeno = Buffer.from(await cor(10, 10).png().toBuffer())
  pequeno.writeUInt32BE(20_000, 16)
  pequeno.writeUInt32BE(20_000, 20)
  pequeno.writeUInt32BE(crc32(pequeno.subarray(12, 29)) >>> 0, 29)
  igual(await normalizarFotoDoVisitante(new Uint8Array(pequeno)), null, 'foto do servidor: a bomba de descompressão para no teto de pixels')
}

conferirFotoDoServidor().catch((causa) => { falhas++; console.log('FALHOU: a foto do servidor lançou', causa) }).finally(() => {
  if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
  console.log('Portaria: tudo certo.')
})
