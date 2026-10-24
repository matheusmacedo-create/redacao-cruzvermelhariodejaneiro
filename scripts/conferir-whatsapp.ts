/**
 * Confere as regras do WhatsApp: `npx tsx scripts/conferir-whatsapp.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import {
  numeroCanonico, formatarNumero, mascararNumero,
  ehCortesia, TEXTO_NAO_ENTENDI_CURTO, LINHA_DAS_FUNCOES, textoDasFuncoes, lerCategoriasDoWhatsapp, decidirWhatsapp, textoDoAviso, lerEventoDaKapso, estadoDoNumeroNaKapso, numeroSemNonoDigito, problemaNaSaude, interpretarComando, textoDosAvisos, textoDasLidas,
  textoDoMenu, codigoNoFormato, emSilencio, fimDoSilencio, silencioSeAplica, proximaTentativa, falhaMereceReenvio,
  categoriaVaiPorWhatsapp, horaEmSaoPaulo, lerPedido, rotuloDoDia, textoDaAgenda, textoDosChamados, textoDasAprovacoes, textoDaAjuda, respostaParaWhatsapp,
  textoDoConviteDoPalacio, alvoDoLink, dicaDeResposta, lerDecisao, ehConfirmacao, ehCancelamento, ehPular, lerEscolha, textoDaConferencia, textoDaEscolha, textoPedeDetalhes, tituloDoRelato,
  baseDoHashDoCodigo, textoDoCodigo, textoDoCodigoDeIda, linkDoWhatsapp, codigoNaMensagem, textoDoNumeroConfirmado, textoDoCodigoDeIdaErrado, textoDaFalhaDoCodigoDeIda,
  modeloDaFinalidade, modeloParaEnviar, textoParaModelo, ehErroDeModelo, problemaDoModelo, nomeDeModeloValido, TEXTO_PAUSADO, textoDeSeguranca,
  tipoDaFalha, resumoDasFalhas, falhasSemModelo, decidirAlerta, quandoEmSaoPaulo, textoDoStatus, textoDaRodadaDaFila, textoDoComandoFila, FALHAS_SEM_MODELO_PARA_ALERTAR,
  soOCodigo, ROTULO_DO_BOT_FORA_DA_JANELA, AVISO_AO_NUMERO_ANTIGO, type StatusDoCanal, type FalhaDeEnvio,
  objetoInterativo, interativoCaiNoTexto, interativoDoMenu, interativoDoAviso, interativoDaEscolha, BOTOES_DA_CONFERENCIA, BOTOES_DOS_DETALHES,
  LIMITES_DO_INTERATIVO, type Interativo,
  lerAtendimento, lerAtendimentoNoAviso, lerTransferencia, acharPeloNome, textoDaConferenciaDoChamado, DICA_DO_ATENDIMENTO, TEXTO_SEM_ACAO_PELO_WHATSAPP,
  situacaoDaVisitaNaLista, textoDaPortaria, lerSetorDaVisita, textoDaConferenciaDaVisita, textoPedeVisitado,
  LINHA_DO_NAO_FUI_EU, BOTAO_DO_NAO_FUI_EU, MARCA_DO_NAO_FUI_EU, ofereceNaoFuiEu, ehNaoFuiEu, textoDaConferenciaDoNaoFuiEu, textoDoNaoFuiEuFeito,
  CONFIRMACAO_VALE_MIN, textoDoLinkDeConfirmacao, textoDasDecisoes, lerDecisaoFinanceira, oQueDaDecisao, lerDesativarConta, oQueDaDesativacao,
  textoDeQuemDesativar, textoDeNinguemParaDesativar, oQueDoVoto, DECISOES_NA_RESPOSTA, type ItemParaDecidir,
  COTA_DE_CONVERSAS, limiteDaCota, prioridadeNaCota, esperaPelaCota, fimDaEsperaDaCota, textoDaCota, TEXTO_DA_ESPERA_DA_COTA,
  lerEstoque, lerViagem, pareceViagem, COMANDOS_DE_AREA, TEXTO_NAO_ENTENDI, situacaoDaSincronizacao, ESCOLA_ATRASADA_HORAS, textoDoOficioPeloWhatsapp, type SincronizacaoDaEscola,
  horasNoTexto, textoDaChamada, BOTOES_DA_CHAMADA, lerMarcacaoDePresenca, textoDaConferenciaDaPresenca, textoDaPresencaMarcada, textoSemAcaoHoje,
  nomeDoVeiculo, textoDaFrota, acharVeiculo, lerHodometroDaConversa, textoPedeHodometro, botoesDoHodometro, textoDaConferenciaDaSaida, textoDaConferenciaDoRetorno,
  textoDoRetornoRegistrado, FINALIDADES_NA_CONVERSA, acharNoEstoque, textoDoSaldo, TEXTO_PEDE_MATERIAL, type MaterialNoSaldo,
  wabaDoNumero, wabaValido, type ObjetoDoModelo,
} from '../lib/whatsapp/regras'
import {
  CATALOGO_DOS_MODELOS, LIMITES_DO_MODELO, VALIDADE_DA_FALHA_MS, VALIDADE_DOS_MODELOS_MS, cacheDosModelos, corpoPreenchido, escolherModelo, idDeMidiaValido,
  lerModelosDaMeta, modeloDaSituacao, modeloDoCatalogo, modeloUtilAprovado, montarModelo, parametroDoModelo, proximaPaginaDosModelos, type ModeloNaMeta,
} from '../lib/whatsapp/modelos'
import { lerHodometro, pedidoDeRetorno, pedidoDeSaida } from '../lib/patrimonio/frota'
import { CATEGORIAS, ROTULO_DA_CATEGORIA } from '../lib/notificacoes/regras'
import {
  ALERTA_DE_INTEGRACAO_A_CADA_HORAS, INTEGRACOES_ALERTADAS, alertaDeIntegracaoSai, alertasResolvidosPelaConexao, integracaoDoTitulo, motivoDaFalhaDoEmail, motivoDaFalhaDoR2, textoDoAlertaDeIntegracao,
} from '../lib/integracoes/alertas-regras'
import { lerRespostaDaVisita, respostaClaraDaVisita } from '../lib/portaria/regras'
import { interativoDaFicha, lerBotaoDaFicha, modeloDaFichaForaDaJanela, montagemDaFicha as montagemDaFichaReal, textoDaFicha, type FichaDaVisita } from '../lib/whatsapp/portaria-regras'
import { URGENCIA } from '../lib/chamados/regras'
import { corpoParaWhatsapp, emailDeAviso, ofereceNaoFuiEu as avisoOfereceNaoFuiEu } from '../lib/contas/emails'
import { buscarDuvida, palavrasDaDuvida, pedidoDaDuvida } from '../lib/whatsapp/duvidas'
import { ehFimDaColeta, nomeDoArquivoRecebido, opcoesDeAutorizacao, tituloProvisorio } from '../lib/whatsapp/envio-regras'
import {
  TEXTO_DO_CONSENTIMENTO, VERSAO_DO_CONSENTIMENTO, comandoDoVoluntario, consentimentoGuardado, textoDaListaDoVoluntario, textoDaOportunidade, textoDoMenuDoVoluntario,
} from '../lib/whatsapp/voluntarios-regras'
import { faltasDaFicha, lerFicha, textoDoConviteDaFicha } from '../lib/rh/ficha'
import { lerMarcaDoConvite, marcaDoConvite, oQueOLinkProva } from '../lib/contas/convite'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!texto.includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }

// ---------------------------------------------------------------- número
igual(numeroCanonico('(21) 98765-4321'), '5521987654321', 'celular com DDD')
igual(numeroCanonico('21 8765-4321'), '5521987654321', 'celular antigo sem o nono dígito')
igual(numeroCanonico('+55 21 98765-4321'), '5521987654321', 'com +55')
igual(numeroCanonico('5521987654321'), '5521987654321', 'só dígitos com 55')
igual(numeroCanonico('552187654321'), '5521987654321', '55 sem o nono dígito')
igual(numeroCanonico('0055 21 98765 4321'), '5521987654321', 'com 00')
igual(numeroCanonico('021 98765-4321'), '5521987654321', 'DDD com zero na frente')
igual(numeroCanonico('(21) 2345-6789'), '552123456789', 'fixo fica com 8 dígitos')
igual(numeroCanonico('(20) 98765-4321'), null, 'DDD que não existe')
igual(numeroCanonico('(21) 88765-4321'), null, 'nove dígitos sem começar com 9')
igual(numeroCanonico('98765-4321'), null, 'sem DDD')
igual(numeroCanonico('+351 912 345 678'), '351912345678', 'Portugal')
igual(numeroCanonico('+1 415 555 2671'), '14155552671', 'EUA com +')
igual(numeroCanonico(''), null, 'vazio')
igual(numeroCanonico('abc'), null, 'lixo')
igual(numeroCanonico('+55 21 98765-43210'), null, 'brasileiro com dígito a mais')

igual(formatarNumero('5521987654321'), '+55 (21) 98765-4321', 'formata celular')
igual(formatarNumero('552123456789'), '+55 (21) 2345-6789', 'formata fixo')
igual(mascararNumero('5521987654321'), '+55 21 9••••-4321', 'mascara celular')
igual(mascararNumero('552123456789'), '+55 21 ••••-6789', 'mascara fixo')
igual(mascararNumero(null), '—', 'mascara vazio')

// ---------------------------------------------------------------- avisos
const cats = lerCategoriasDoWhatsapp({ chat: false, financeiro: 'sim', lixo: true })
igual(cats.chat, false, 'categoria desligada')
igual(cats.financeiro, true, 'valor inválido vira padrão')
igual(cats.aprovacoes, true, 'ausente vira padrão')
igual('lixo' in cats, false, 'ignora o que não é categoria')

const agora = new Date('2026-09-27T15:00:00Z')
const base = { temNumero: true, pausado: false, categoriaLigada: true, vistoEm: null, ultimoNoMesmoLink: null, agora }
igual(decidirWhatsapp(base), true, 'manda')
igual(decidirWhatsapp({ ...base, temNumero: false }), false, 'sem número')
igual(decidirWhatsapp({ ...base, pausado: true }), false, 'pausado')
igual(decidirWhatsapp({ ...base, categoriaLigada: false }), false, 'categoria desligada')
igual(decidirWhatsapp({ ...base, vistoEm: '2026-09-27T14:58:30Z' }), false, 'está com o Palácio aberto')
igual(decidirWhatsapp({ ...base, vistoEm: '2026-09-27T14:50:00Z' }), true, 'viu há 10 min')
igual(decidirWhatsapp({ ...base, ultimoNoMesmoLink: '2026-09-27T14:50:00Z' }), false, 'mesmo link há 10 min')
igual(decidirWhatsapp({ ...base, ultimoNoMesmoLink: '2026-09-27T14:40:00Z' }), true, 'mesmo link há 20 min')
igual(decidirWhatsapp({ ...base, vistoEm: '2026-09-27T14:58:30Z', ultimoNoMesmoLink: '2026-09-27T14:50:00Z', importante: true }), true, 'importante: sai mesmo com o Palácio aberto e logo depois')
igual(decidirWhatsapp({ ...base, pausado: true, importante: true }), false, 'importante: a pausa continua valendo')
igual(decidirWhatsapp({ ...base, categoriaLigada: false, importante: true }), false, 'importante: o assunto desligado continua valendo')

const aviso = textoDoAviso({ urlBase: 'https://palacio.x', titulo: 'Pedido de *aprovação*', mensagem: 'Ana pediu sua aprovação.', link: '/aprovacoes', citacao: 'linha 1\nlinha 2' })
contem(aviso, '*Pedido de aprovação*', 'título em negrito, sem o * de dentro')
contem(aviso, '> linha 1\n> linha 2', 'citação')
contem(aviso, 'Abrir: https://palacio.x/aprovacoes', 'link')
contem(textoDoAviso({ urlBase: 'https://palacio.x', titulo: 't', mensagem: 'm', link: null }), 'https://palacio.x/notificacoes', 'sem link vai ao sino')
// O emoji composto (U+200D), a bandeira com tags, o m² e o ½ ficam; só os invisíveis que enganam (U+202E, U+200B) saem.
const avisoComEmoji = textoDoAviso({ urlBase: 'https://palacio.x', titulo: 'Piso de 10 m² 🤦‍♀️', mensagem: 'Ficou ½ pronto 🏳️‍🌈 🏴󠁧󠁢󠁳󠁣󠁴󠁿 a‮b​c', link: null })
contem(avisoComEmoji, '*Piso de 10 m² 🤦‍♀️*', 'aviso: o emoji composto e o m² ficam como estão')
contem(avisoComEmoji, 'Ficou ½ pronto 🏳️‍🌈 🏴󠁧󠁢󠁳󠁣󠁴󠁿 abc', 'aviso: a bandeira fica; a inversão de direção e o espaço de largura zero saem')

// ---------------------------------------------------------------- webhook (o payload da Kapso tem os casos mais abaixo)
const mensagem = lerEventoDaKapso({ message: { id: 'ABC123', type: 'text', from: '552187654321', text: { body: 'Oi' } }, phone_number_id: '1401089659754587' }, 'whatsapp.message.received', '1401089659754587')
igual(mensagem.evento, 'whatsapp.message.received', 'evento')
igual(mensagem.mensagens[0]?.numero, '5521987654321', 'número sem o nono dígito vira o canônico')
igual(lerEventoDaKapso(null, 'whatsapp.message.received', '1401089659754587').mensagens, [], 'corpo vazio')

// ---------------------------------------------------------------- bot
const cmd = (t: string, pausado = false) => interpretarComando(t, { pausado })
igual(cmd('1'), 'avisos', '1')
igual(cmd(' Avisos '), 'avisos', 'avisos')
igual(cmd('ver avisos'), 'avisos', 'ver avisos')
igual(cmd('2'), 'lidas', '2')
igual(cmd('marcar como lidas'), 'lidas', 'marcar como lidas')
igual(cmd('3'), 'parar', '3 recebendo')
igual(cmd('3', true), 'voltar', '3 pausado')
igual(cmd('PARAR'), 'parar', 'parar em maiúsculas')
igual(cmd('quero sair'), 'parar', 'quero sair')
igual(cmd('voltar'), 'voltar', 'voltar')
igual(cmd('Olá!'), 'menu', 'olá')
igual(cmd('bom dia'), 'menu', 'bom dia')
igual(cmd('menu'), 'menu', 'menu')
igual(cmd('tenho 2 dúvidas'), 'desconhecido', 'número no meio da frase não é comando')
igual(cmd('qual o horário da reunião?'), 'desconhecido', 'pergunta solta')
igual(cmd(''), 'desconhecido', 'vazio')

igual(textoDosAvisos({ avisos: [], total: 0, urlBase: 'https://p' }).includes('em dia'), true, 'sem avisos')
const lista = textoDosAvisos({ avisos: Array.from({ length: 7 }, (_, i) => ({ titulo: `T${i}`, mensagem: `M${i}`, link: `/x/${i}` })), total: 9, urlBase: 'https://p' })
contem(lista, '*9 avisos*', 'total')
contem(lista, 'Os 5 mais recentes', 'corta em 5')
igual(lista.includes('T5'), false, 'o sexto não entra')
contem(lista, 'https://p/x/0', 'link do primeiro')
igual(textoDasLidas(0).includes('em dia'), true, 'nenhuma lida')
igual(textoDasLidas(1), 'Pronto: 1 aviso marcado como lido.', 'uma lida')
contem(textoDoMenu({ nome: 'Ana Lima', pausado: true, urlBase: 'https://p' }), '*3* – voltar', 'menu pausado')
contem(textoDoMenu({ nome: null, pausado: false, urlBase: 'https://p' }), 'Olá! Aqui', 'menu sem nome')

igual(codigoNoFormato('123456'), true, 'código ok')
igual(codigoNoFormato('12345'), false, 'código curto')
igual(codigoNoFormato('12a456'), false, 'código com letra')

// ---------------------------------------------------------------- código de ida (a pessoa manda ao Palácio)
igual(baseDoHashDoCodigo('volta', 'u1', '5521987654321', '123456'), 'whatsapp:u1:5521987654321:123456', 'hash de volta no formato de sempre (códigos já pedidos valem)')
igual(baseDoHashDoCodigo('ida', 'u1', '5521987654321', '123456') === baseDoHashDoCodigo('volta', 'u1', '5521987654321', '123456'), false, 'ida e volta nunca no mesmo hash')
igual(baseDoHashDoCodigo('ida', 'voluntario:p1', '5521987654321', '123456'), 'whatsapp-ida:voluntario:p1:5521987654321:123456', 'hash de ida do voluntário')
igual(textoDoCodigoDeIda('123456'), 'Confirmar meu WhatsApp no Palácio: 123456', 'mensagem pronta da equipe')
igual(textoDoCodigoDeIda('123456', 'voluntariado'), 'Confirmar meu WhatsApp na Área do Voluntário: 123456', 'mensagem pronta do voluntário')
igual(linkDoWhatsapp('12053412375', textoDoCodigoDeIda('123456')), 'https://wa.me/12053412375?text=Confirmar%20meu%20WhatsApp%20no%20Pal%C3%A1cio%3A%20123456', 'link wa.me com a mensagem pronta')
igual(linkDoWhatsapp('+1 205-341-2375', 'oi'), 'https://wa.me/12053412375?text=oi', 'link só com os dígitos')
igual(linkDoWhatsapp(null, 'oi'), null, 'sem número do Palácio, sem link')
igual(linkDoWhatsapp('12345', 'oi'), null, 'número curto, sem link')
igual(codigoNaMensagem(textoDoCodigoDeIda('012345')), '012345', 'acha o código na mensagem pronta (zero na frente)')
igual(codigoNaMensagem(textoDoCodigoDeIda('654321', 'voluntariado')), '654321', 'acha o código na mensagem pronta do voluntário')
igual(codigoNaMensagem('123456'), '123456', 'só o código')
igual(codigoNaMensagem(' 123 456 '), '123456', 'código com espaço no meio')
igual(codigoNaMensagem('meu código é 123-456.'), '123456', 'código com hífen e texto')
igual(codigoNaMensagem('12345'), null, 'cinco números não é código')
igual(codigoNaMensagem('1234567'), null, 'sete números não é código')
igual(codigoNaMensagem('3'), null, 'opção do menu não é código')
igual(codigoNaMensagem('menu'), null, 'sem número')
igual(codigoNaMensagem('meu número é (21) 98765-4321 e o código 123456'), null, 'outro número junto')
igual(codigoNaMensagem(textoDoCodigo('123456')), null, 'o código que o Palácio mandou, encaminhado de volta (tem o "10 minutos")')
igual(codigoNaMensagem(`${'a'.repeat(170)} 123456`), null, 'mensagem longa demais')
igual(codigoNaMensagem(null), null, 'vazio')
// Número que já é de alguém da equipe: só a mensagem que é o código (o chamado com um patrimônio não se perde no código).
igual(codigoNaMensagem('chamado: patrimônio 123456 sem toner na sala da presidência'), '123456', 'a leitura solta acha código no chamado (por isso a estrita)')
igual(soOCodigo('123456'), '123456', 'estrito: só o código')
igual(soOCodigo(' 123 456 '), '123456', 'estrito: com espaço no meio')
igual(soOCodigo('123-456'), '123456', 'estrito: com hífen')
igual(soOCodigo('123.456'), '123456', 'estrito: com ponto')
igual(soOCodigo(textoDoCodigoDeIda('012345')), '012345', 'estrito: a mensagem pronta da equipe')
igual(soOCodigo(textoDoCodigoDeIda('654321', 'voluntariado')), '654321', 'estrito: a mensagem pronta do voluntário')
igual(soOCodigo('confirmar meu whatsapp no palácio: 123 456'), '123456', 'estrito: a mensagem pronta em minúsculas')
igual(soOCodigo('chamado: patrimônio 123456 sem toner na sala da presidência'), null, 'estrito: chamado com patrimônio segue para o chamado')
igual(soOCodigo('Pagamento de R$ 150.000 aprovado?'), null, 'estrito: valor no meio da frase não é código')
igual(soOCodigo('meu código é 123-456.'), null, 'estrito: código com texto em volta não vale')
igual(soOCodigo('1234567'), null, 'estrito: sete números')
igual(soOCodigo('12345'), null, 'estrito: cinco números')
igual(soOCodigo(null), null, 'estrito: vazio')
contem(textoDoNumeroConfirmado('palacio'), 'Responda *menu*', 'confirmado: linha do menu (equipe)')
contem(textoDoNumeroConfirmado('voluntariado'), 'oportunidades', 'confirmado: voluntário')
contem(textoDoCodigoDeIdaErrado(2), 'restam 2 tentativas', 'errado: o que resta')
contem(textoDoCodigoDeIdaErrado(1), 'resta 1 tentativa', 'errado: singular')
contem(textoDoCodigoDeIdaErrado(0), 'Gere um código novo', 'errado: acabaram as tentativas')
contem(textoDaFalhaDoCodigoDeIda('outra_conta', 'equipe'), 'outra conta', 'falha: número de outra conta')
contem(textoDaFalhaDoCodigoDeIda('outra_conta', 'voluntario'), 'outro voluntário', 'falha: número de outro voluntário')

// ---------------------------------------------------------------- consultas e pedidos com complemento
const ped = (t: string, pausado = false) => lerPedido(t, { pausado })
igual(cmd('4'), 'agenda', '4')
igual(cmd('minha agenda'), 'agenda', 'minha agenda')
igual(cmd('5'), 'chamados', '5')
igual(cmd('meus chamados'), 'chamados', 'meus chamados')
igual(cmd('chamado'), 'chamados', 'chamado sozinho lista')
igual(cmd('6'), 'aprovacoes', '6')
igual(cmd('aprovações'), 'aprovacoes', 'aprovações com acento')
igual(cmd('ajuda'), 'menu', 'ajuda sozinha é o menu')
igual(ped('ajuda como trocar a senha'), { comando: 'ajuda', resto: 'como trocar a senha' }, 'ajuda com dúvida')
igual(ped('Dúvida: onde vejo os ofícios?'), { comando: 'ajuda', resto: 'onde vejo os ofícios?' }, 'dúvida com dois-pontos')
igual(ped('Como eu paro os avisos?'), { comando: 'ajuda', resto: 'Como eu paro os avisos?' }, '"como" vira dúvida, não "avisos"')
igual(ped('chamado: impressora da sala 3 sem toner'), { comando: 'abrir_chamado', resto: 'impressora da sala 3 sem toner' }, 'abrir chamado')
igual(ped('Abrir um chamado - o ar-condicionado pinga'), { comando: 'abrir_chamado', resto: 'o ar-condicionado pinga' }, 'abrir um chamado')
igual(ped('novo chamado: tomada solta'), { comando: 'abrir_chamado', resto: 'tomada solta' }, 'novo chamado')
igual(cmd('chamado: oi'), 'chamados', 'relato curto demais não abre chamado')
igual(cmd('como assim'), 'desconhecido', '"como" com uma palavra só não é dúvida')

igual(rotuloDoDia('2026-09-28'), 'seg, 28/09', 'rótulo do dia')
igual(rotuloDoDia('2026-10-04'), 'dom, 04/10', 'domingo')
const agenda = textoDaAgenda({
  hoje: '2026-09-28', amanha: '2026-09-29', urlBase: 'https://p',
  itensHoje: [{ titulo: 'Reunião de pauta', hora: '14:00' }, { titulo: 'Dia do Idoso', hora: null, detalhe: 'Data comemorativa' }, { titulo: 'Plantão', hora: '09:00' }],
  itensAmanha: [],
})
contem(agenda, '*Hoje, seg, 28/09*', 'agenda: cabeça de hoje')
igual(agenda.indexOf('Dia todo') < agenda.indexOf('09:00') && agenda.indexOf('09:00') < agenda.indexOf('14:00'), true, 'agenda: dia todo, depois por hora')
contem(agenda, '_(Data comemorativa)_', 'agenda: detalhe')
contem(agenda, '*Amanhã, ter, 29/09*\n_Nada marcado._', 'agenda: dia vazio')
contem(agenda, 'https://p/calendario', 'agenda: link')
const cheia = textoDaAgenda({ hoje: '2026-09-28', amanha: '2026-09-29', urlBase: 'https://p', itensHoje: Array.from({ length: 11 }, (_, i) => ({ titulo: `I${i}`, hora: `1${i % 10}:00` })), itensAmanha: [], falhou: true })
contem(cheia, '_e mais 3_', 'agenda: corta em 8')
contem(cheia, 'não carregou', 'agenda: aviso de camada que falhou')

igual(textoDosChamados({ chamados: [], total: 0, urlBase: 'https://p' }).includes('não tem chamados abertos'), true, 'sem chamados')
const chamados = textoDosChamados({ chamados: [{ id: 'c1', codigo: 'TI-0042', titulo: 'Sem internet', situacao: 'Aguardando você' }], total: 1, urlBase: 'https://p' })
contem(chamados, '*1 chamado*', 'um chamado')
contem(chamados, '*TI-0042* · Sem internet', 'código e título')
contem(chamados, 'https://p/chamados/c1', 'link do chamado')
contem(textoDosChamados({ chamados: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, codigo: `C${i}`, titulo: 't', situacao: 'Novo' })), total: 9, urlBase: 'https://p' }), 'Os 6 mais recentes', 'corta chamados')

igual(textoDasAprovacoes({ aprovacoes: [], total: 0, urlBase: 'https://p' }), 'Nada esperando o seu voto agora.', 'sem aprovações')
const aprovacoes = textoDasAprovacoes({ aprovacoes: [{ id: 'a1', titulo: 'Matéria do Dia do Voluntário' }, { id: 'a2', titulo: 'Post' }], total: 2, urlBase: 'https://p' })
contem(aprovacoes, '*2 aprovações* esperam', 'duas aprovações')
contem(aprovacoes, '*1.* Matéria do Dia do Voluntário\nhttps://p/aprovacoes/a1', 'item numerado com link')

igual(palavrasDaDuvida('ajuda como eu troco a minha senha?'), ['troc', 'senh'], 'palavras da dúvida sem as vazias, pela raiz')
igual(palavrasDaDuvida('onde vejo as aprovações?'), ['aprovac'], 'raiz acha singular e plural')
igual(palavrasDaDuvida('como é que eu faço?'), [], 'só palavras vazias')
igual(buscarDuvida('como eu troco a minha senha?', 'editor')[0]?.href, '/ajuda#trocar-a-senha', 'dúvida acha "Trocar a sua senha"')
igual(buscarDuvida('xyzw qwerty', 'editor'), [], 'dúvida sem resposta')
igual(buscarDuvida('como pagar uma conta no financeiro', 'escola').some((a) => a.href.startsWith('/ajuda/financeiro')), false, 'equipe da escola não recebe ajuda de área que não abre')
const pedidoIa = pedidoDaDuvida('como troco a senha?', [{ titulo: 'Trocar a sua senha', trecho: 'Abra Meu perfil.', onde: 'Conta' }])
contem(pedidoIa, '<duvida>\ncomo troco a senha?\n</duvida>', 'dúvida vai separada dos trechos')

const achados = [{ titulo: 'Trocar a sua senha', trecho: 'Abra *Meu perfil* e toque em Trocar senha.', href: '/ajuda#trocar-a-senha' }]
contem(textoDaAjuda({ pergunta: 'senha', achados: [], urlBase: 'https://p' }), 'Não achei nada', 'ajuda sem achado')
contem(textoDaAjuda({ pergunta: 'senha', achados, urlBase: 'https://p' }), 'Achei isto na Central de ajuda', 'ajuda sem IA mostra os trechos')
const comIa = textoDaAjuda({ pergunta: 'senha', achados, resposta: '1. Abra *Meu perfil*.', urlBase: 'https://p' })
contem(comIa, '1. Abra *Meu perfil*.', 'ajuda com o resumo')
contem(comIa, '• Trocar a sua senha: https://p/ajuda#trocar-a-senha', 'resumo leva o link da Central')
igual(respostaParaWhatsapp('## Passos\n1. Abra **Meu perfil** e veja [a ajuda](https://x).\n\n\n2. `Salvar`'), 'Passos\n1. Abra *Meu perfil* e veja a ajuda.\n\n2. Salvar', 'markdown vira formato do WhatsApp')
igual(respostaParaWhatsapp('linha um\nlinha dois muito comprida', 15), 'linha um…', 'corta na quebra de linha')

// ---------------------------------------------------------------- ações: citação, alvo do aviso, decisão e escolha
const citando = lerEventoDaKapso({ message: { id: 'R1', type: 'text', from: '5521987654321', text: { body: 'Já reiniciei o roteador' }, context: { id: 'wamid.AVISO', from: '12053412375' } }, phone_number_id: '1401089659754587' }, 'whatsapp.message.received', '1401089659754587')
igual(citando.mensagens[0]?.citada, 'wamid.AVISO', 'resposta citando o aviso')
igual(mensagem.mensagens[0]?.citada, null, 'sem citação')
igual(lerEventoDaKapso({ message: { id: 'L', type: 'text', from: '5521987654321', text: { body: 'x'.repeat(5000) } }, phone_number_id: '1401089659754587' }, 'whatsapp.message.received', '1401089659754587').mensagens[0]?.texto.length, 4000, 'texto longo cabe numa resposta de chamado')

const id1 = '0f8fad5b-d9cb-469f-a165-70867728950e'
const id2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
igual(alvoDoLink(`/chamados/${id1}`), { tipo: 'chamado', id: id1 }, 'aviso de chamado')
igual(alvoDoLink(`/aprovacoes/${id1}`), { tipo: 'aprovacao', id: id1 }, 'aviso de aprovação')
igual(alvoDoLink(`/chat/${id1}`), { tipo: 'chat', canalId: id1, fio: null }, 'aviso do chat')
igual(alvoDoLink(`/chat/${id1}?fio=${id2}`), { tipo: 'chat', canalId: id1, fio: id2 }, 'aviso de fio do chat')
igual(alvoDoLink(`/portaria/visita/${id1}`), { tipo: 'visita', id: id1 }, 'aviso de visita na portaria')
igual(alvoDoLink('/portaria'), null, 'a portaria sem visita não aceita resposta')
igual(dicaDeResposta(`/portaria/visita/${id1}`)?.includes('*1* (pode subir)'), true, 'dica da visita: 1, 2 ou 3')
igual(alvoDoLink(`/chat/${id1}?fio=abc`), { tipo: 'chat', canalId: id1, fio: null }, 'fio inválido vira a conversa')
igual(alvoDoLink(`/mensagens/pessoa/${id2}`), { tipo: 'mensagem', pessoaId: id2 }, 'mensagem direta')
igual(alvoDoLink('/chamados'), null, 'lista não é alvo')
igual(alvoDoLink(`/chamados/${id1}/editar`), null, 'subpágina não é alvo')
igual(alvoDoLink(`https://outro.site/chamados/${id1}`), null, 'link de fora não é alvo')
igual(alvoDoLink(null), null, 'aviso sem link')

igual(lerDecisao('Aprovar'), { decisao: 'aprovar' }, 'aprovar')
igual(lerDecisao('aprovado!'), { decisao: 'aprovar' }, 'aprovado')
igual(lerDecisao('ajustes: trocar a foto de capa'), { decisao: 'ajustes', nota: 'trocar a foto de capa' }, 'ajustes com nota')
igual(lerDecisao('Pedir ajustes - o título está errado'), { decisao: 'ajustes', nota: 'o título está errado' }, 'pedir ajustes')
igual(lerDecisao('ajustes'), { decisao: 'ajustes', nota: '' }, 'ajustes sem nota (o bot pede a nota)')
igual(lerDecisao('não aprovo'), null, 'negação não é aprovação')
igual(lerDecisao('aprovar depois de ler'), null, 'frase com "aprovar" no começo não vota')
igual(lerDecisao('achei ótimo'), null, 'comentário solto')
igual(ehConfirmacao('Confirmo'), true, 'confirmo')
igual(ehConfirmacao('confirmo tudo'), false, 'confirmação é a palavra sozinha')
igual(ehConfirmacao('ok'), false, '"ok" solto não vira voto')
igual(ehConfirmacao('sim'), false, '"sim" solto não vira voto')
igual(ehCancelamento('Cancelar'), true, 'cancelar')
igual(lerEscolha('2', 3), 2, 'escolha 2')
igual(lerEscolha('*3*', 3), 3, 'escolha com negrito')
igual(lerEscolha('opção 1', 3), 1, 'opção 1')
igual(lerEscolha('4', 3), null, 'fora da lista')
igual(ehPular('Pular'), true, 'pular os detalhes do chamado')
igual(ehPular('não'), true, '"não" pula os detalhes (não cancela o chamado)')
igual(ehPular('Cancelar'), false, '"cancelar" não é pular: continua desistindo')
igual(ehPular('não liga desde ontem'), false, 'frase com "não" é detalhe, não pulo')
contem(textoPedeDetalhes(), '*pular*', 'a pergunta dos detalhes diz como pular')
igual(lerEscolha('0', 3), null, 'zero não é opção')
igual(lerEscolha('2 cadeiras quebradas', 3), null, 'número no meio da frase não é escolha')

contem(textoDoAviso({ urlBase: 'https://p', titulo: 'Nova resposta da equipe', mensagem: 'm', link: `/chamados/${id1}` }), '_Para responder por aqui, responda esta mensagem._', 'aviso de chamado ensina a responder')
contem(textoDoAviso({ urlBase: 'https://p', titulo: 'Aprovação', mensagem: 'm', link: `/aprovacoes/${id1}` }), '*aprovar* ou com *ajustes:*', 'aviso de aprovação ensina a votar')
igual(textoDoAviso({ urlBase: 'https://p', titulo: 'Ofício', mensagem: 'm', link: '/oficios/1' }).includes('responda esta mensagem'), false, 'aviso sem resposta pelo WhatsApp não promete')
const conferencia = textoDaConferencia({ titulo: 'Matéria X', blocos: [{ setor: 'Comunicação', itens: ['Fonte citada', 'Foto autorizada'] }] })
contem(conferencia, '*Comunicação*\n☐ Fonte citada\n☐ Foto autorizada', 'conferência lista os itens')
contem(conferencia, 'responda *esta mensagem* com *confirmo*', 'conferência pede a confirmação')
const escolha = textoDaEscolha({ pergunta: 'Para qual equipe?', opcoes: [{ nome: 'TI' }, { nome: 'Manutenção', detalhe: 'predial' }] })
contem(escolha, '*1* – TI\n*2* – Manutenção _(predial)_', 'escolha numerada')
igual(tituloDoRelato('A impressora da sala 3 está sem toner. Já troquei o cabo.'), 'A impressora da sala 3 está sem toner', 'título é a primeira frase')
igual(tituloDoRelato('ar pinga'), 'ar pinga', 'relato curto')
igual(tituloDoRelato('x'.repeat(200)).length, 138, 'título longo é cortado')

// ---------------------------------------------------------------- fotos e vídeos viram envio
const foto = lerEventoDaKapso({ message: { id: 'F1', type: 'image', from: '5521987654321', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'Ação na Central' }, kapso: { media_data: { byte_size: 245760 } } }, phone_number_id: '1401089659754587' }, 'whatsapp.message.received', '1401089659754587')
igual(foto.mensagens[0]?.midia, { categoria: 'foto', mime: 'image/jpeg', tamanho: 245760, nome: null, arquivo: 'm1' }, 'foto com o tamanho da Kapso')
igual(foto.mensagens[0]?.texto, 'Ação na Central', 'a legenda vem como texto')
igual(lerEventoDaKapso({ message: { id: 'V1', type: 'video', from: '5521987654321', video: { id: 'm2', mime_type: 'video/mp4' } }, phone_number_id: '1401089659754587' }, 'whatsapp.message.received', '1401089659754587').mensagens[0]?.midia,
  { categoria: 'video', mime: 'video/mp4', tamanho: null, nome: null, arquivo: 'm2' }, 'vídeo')
igual(lerEventoDaKapso({ message: { id: 'D1', type: 'document', from: '5521987654321', document: { id: 'm3', mime_type: 'image/png', filename: 'cartaz.png' } }, phone_number_id: '1401089659754587' }, 'whatsapp.message.received', '1401089659754587').mensagens[0]?.midia,
  { categoria: 'foto', mime: 'image/png', tamanho: null, nome: 'cartaz.png', arquivo: 'm3' }, 'foto mandada como documento continua foto')
igual(lerEventoDaKapso({ message: { id: 'S1', type: 'sticker', from: '5521987654321', sticker: { id: 'm4', mime_type: 'image/webp' } }, phone_number_id: '1401089659754587' }, 'whatsapp.message.received', '1401089659754587').mensagens[0]?.midia, null, 'figurinha não é envio')
igual(ehFimDaColeta('Pronto!'), true, 'pronto fecha a coleta')
igual(ehFimDaColeta('só isso'), true, 'só isso fecha a coleta')
igual(ehFimDaColeta('pronto, mais uma foto'), false, 'frase com pronto não fecha')
igual(tituloProvisorio('Ana Lima Souza'), 'Envio pelo WhatsApp de Ana', 'título provisório')
igual(tituloProvisorio(null), 'Envio pelo WhatsApp de alguém da equipe', 'título provisório sem nome')
igual(nomeDoArquivoRecebido({ nome: null, mime: 'image/jpeg', mensagemId: '3EB0-ABC', categoria: 'foto' }), 'whatsapp-3EB0ABC.jpg', 'nome de foto sem nome')
igual(nomeDoArquivoRecebido({ nome: 'relatório/final.pdf', mime: 'application/pdf', mensagemId: 'X', categoria: 'documento' }), 'relatóriofinal.pdf', 'nome de documento sem barra')
igual(nomeDoArquivoRecebido({ nome: 'sem extensao', mime: 'video/quicktime', mensagemId: 'X', categoria: 'video' }), 'whatsapp-X.mov', 'sem extensão, vale o tipo')
igual(opcoesDeAutorizacao().length, 4, 'as quatro respostas da autorização de imagem')

// ---------------------------------------------------------------- voluntários
const cv = (t: string, pausado = false) => comandoDoVoluntario(t, { pausado })
igual(cv('1'), 'oportunidades', 'voluntário: 1')
igual(cv('quais as vagas?'), 'oportunidades', 'voluntário: vagas')
igual(cv('2'), 'inscricoes', 'voluntário: 2')
igual(cv('minhas inscrições'), 'inscricoes', 'voluntário: inscrições')
igual(cv('SAIR'), 'sair', 'voluntário: sair')
igual(cv('3'), 'sair', 'voluntário: 3 recebendo')
igual(cv('3', true), 'voltar', 'voluntário: 3 pausado')
igual(cv('oi'), 'menu', 'voluntário: oi')
igual(cv('posso levar um amigo?'), 'desconhecido', 'voluntário: pergunta solta')
const anuncio = textoDaOportunidade({ titulo: 'Ação na Central', quando: 'sáb, 3 de out · 09:00 às 12:00', local: 'Central do Brasil', vagas: '20 vagas', url: 'https://p/membro/oportunidades/x' })
contem(anuncio, '*Ação na Central*\n🗓 sáb, 3 de out · 09:00 às 12:00\n📍 Central do Brasil\n20 vagas', 'anúncio: o essencial')
contem(anuncio, 'Para se inscrever: https://p/membro/oportunidades/x', 'anúncio: link da inscrição')
contem(anuncio, '*sair*', 'anúncio: diz como parar')
contem(consentimentoGuardado(), `[${VERSAO_DO_CONSENTIMENTO}] Autorizo`, 'consentimento guarda a versão e o texto')
contem(TEXTO_DO_CONSENTIMENTO, 'SAIR', 'consentimento diz como parar')
contem(textoDaListaDoVoluntario({ titulo: 'T', vazio: 'Nada.', itens: [], url: 'https://p' }), 'Nada.', 'lista vazia')
contem(textoDaListaDoVoluntario({ titulo: 'T', vazio: 'Nada.', itens: Array.from({ length: 8 }, (_, i) => ({ titulo: `O${i}`, quando: 'q' })), url: 'https://p' }), '_e mais 2_', 'lista corta em 6')
contem(textoDoMenuDoVoluntario({ nome: 'Bia Souza', pausado: true, urlBase: 'https://p' }), '*3* – voltar a receber', 'menu do voluntário pausado')

// ---------------------------------------------------------------- ficha da Equipe pelo link
igual(faltasDaFicha(null, { temDocumentos: false, pedeDocumentos: true }).length, 12, 'ficha vazia: 11 campos e os documentos')
igual(faltasDaFicha({ telefone_pessoal: '21 9', email_pessoal: 'a@b.c', data_nascimento: '1990-01-01', cep: '20000-000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Rio', uf: 'RJ', emergencia_nome: 'Mãe', emergencia_telefone: '21 8' },
  { temDocumentos: true, pedeDocumentos: true }), [], 'ficha completa (complemento é opcional)')
igual(faltasDaFicha({ cidade: '  ' }, { temDocumentos: false, pedeDocumentos: false }).includes('Cidade'), true, 'só espaço conta como vazio')
igual(lerFicha({ cidade: ' Rio ', uf: 'rj', cep: '', banco: '001', cargo: 'Diretora', doc_cpf: '123', doc_senha: 'x' }, ['cpf', 'rg']),
  { cidade: 'Rio', uf: 'RJ', documentos: { cpf: '123' } }, 'lerFicha: só campos conhecidos e preenchidos; banco e cargo ficam de fora')
igual(lerFicha({ numero: '1'.repeat(50) }, [])['numero'], '1'.repeat(20), 'lerFicha corta no tamanho do campo')
const conviteFicha = textoDoConviteDaFicha({ nome: 'Carla Dias', url: 'https://p/ficha/abc', documentos: true })
contem(conviteFicha, 'Olá, Carla!', 'convite chama pelo primeiro nome')
contem(conviteFicha, 'números dos seus documentos', 'convite avisa dos documentos')
contem(conviteFicha, 'nunca pede senha nem dados de banco', 'convite alerta contra golpe')
contem(textoDoConviteDaFicha({ nome: 'Carla', url: 'u', documentos: false, lembrete: true }), 'Carla, falta completar', 'lembrete')

// ---------------------------------------------------------------- convite de acesso pelo WhatsApp
igual(marcaDoConvite({ porEmail: true, numero: null }), null, 'só e-mail: sem marca (como sempre foi)')
igual(marcaDoConvite({ porEmail: false, numero: '5521987654321' }), 'whatsapp:5521987654321', 'só WhatsApp')
igual(marcaDoConvite({ porEmail: true, numero: '5521987654321' }), 'whatsapp+email:5521987654321', 'pelos dois')
igual(lerMarcaDoConvite(null), { porEmail: true, numero: null }, 'convite antigo: e-mail')
igual(lerMarcaDoConvite('whatsapp+email:5521987654321'), { porEmail: true, numero: '5521987654321' }, 'lê os dois canais')
igual(lerMarcaDoConvite('whatsapp:123'), { porEmail: true, numero: null }, 'marca estranha vale como e-mail')
igual(oQueOLinkProva(null), { email: true, whatsapp: null }, 'link só por e-mail prova o e-mail')
igual(oQueOLinkProva('whatsapp:5521987654321'), { email: false, whatsapp: '5521987654321' }, 'link só pelo WhatsApp prova o número, não o e-mail')
igual(oQueOLinkProva('whatsapp+email:5521987654321'), { email: false, whatsapp: null }, 'pelos dois: não prova nada sozinho')
const conviteZap = textoDoConviteDoPalacio({ nome: 'Carla Dias', usuario: 'carla.dias', url: 'https://p/redefinir-senha?t=x', horas: 72, convidadoPor: 'Matheus', urlDaFicha: 'https://p/ficha/y' })
contem(conviteZap, 'Olá, Carla! Matheus criou o seu acesso', 'convite: quem convidou')
contem(conviteZap, 'Seu usuário: *carla.dias*', 'convite: usuário')
contem(conviteZap, '*1.* Crie a sua senha', 'convite com a ficha numera os passos')
contem(conviteZap, '*2.* Complete a sua ficha no RH', 'convite leva a ficha junto')
igual(textoDoConviteDoPalacio({ nome: 'Carla', usuario: 'c', url: 'u', horas: 72, convidadoPor: 'M' }).includes('*1.*'), false, 'sem ficha, sem numeração')

// ---------------------------------------------------------------- segurança da conta pelo WhatsApp
// O aviso sai mesmo pausado (lib/contas/servidor.ts, avisarPorWhatsapp): quem pausa fica sabendo.
contem(TEXTO_PAUSADO, 'segurança da sua conta', 'pausar avisa que a segurança continua chegando')
const seguranca = textoDeSeguranca({ titulo: 'Novo *acesso*', texto: 'Linha 1.\n\nLinha 2.' })
contem(seguranca, '*Novo acesso*\n\nLinha 1.\n\nLinha 2.', 'título em negrito, sem a marcação de quem escreveu, e as quebras ficam')
const quandoDoAviso = new Date('2026-10-18T18:30:00Z')
const avisoDe = (aviso: Parameters<typeof emailDeAviso>[0]['aviso']) => emailDeAviso({ nome: 'Carla Dias', quando: quandoDoAviso, aviso, urlDeLogin: 'https://p/' })
const trocado = avisoDe({ tipo: 'whatsapp_trocado', de: mascararNumero('5521987654321'), para: mascararNumero('5521912345678') })
const corpoTrocado = corpoParaWhatsapp(trocado)
contem(corpoTrocado, 'trocado de +55 21 9••••-4321 para +55 21 9••••-5678', 'troca: os dois números, mascarados')
contem(corpoTrocado, 'Se não foi você, fale com a administração', 'troca: o que fazer se não foi você')
igual(/\d{8}/.test(corpoTrocado), false, 'troca: nenhum número inteiro no texto')
igual(corpoTrocado.startsWith('Olá, Carla.'), true, 'o corpo do WhatsApp começa sem o título do e-mail')
igual(corpoTrocado.includes('Mensagem automática'), false, 'o corpo do WhatsApp sai sem o rodapé do e-mail')
contem(corpoParaWhatsapp(avisoDe({ tipo: 'whatsapp_removido', numero: mascararNumero('5521987654321') })), 'Se não foi você, fale com a administração', 'remoção pela pessoa: o que fazer se não foi ela')
contem(corpoParaWhatsapp(avisoDe({ tipo: 'whatsapp_removido', numero: mascararNumero('5521987654321'), porAdmin: 'Matheus' })), 'removido da sua conta no Palácio Virtual por Matheus', 'remoção pela administração diz quem')
// O aviso acima vai só ao e-mail: o número antigo pode já ser de outra pessoa e recebe um recado sem nome (avisarTrocaDeWhatsapp).
const aoNumeroAntigo = textoDeSeguranca(AVISO_AO_NUMERO_ANTIGO)
contem(aoNumeroAntigo, 'Este número deixou de receber os avisos de uma conta do Palácio Virtual', 'número antigo: o recado')
igual(/Olá|Carla|Matheus|sua conta|\d{2} de \w+ de \d{4}/.test(aoNumeroAntigo), false, 'número antigo: sem nome, sem quem fez, sem data e sem "sua conta"')
const bloqueada = corpoParaWhatsapp(avisoDe({ tipo: 'conta_bloqueada', lugar: 'Rio de Janeiro/RJ, BR' }))
contem(bloqueada, 'de Rio de Janeiro/RJ, BR (local aproximado)', 'bloqueio: o local aproximado')
contem(bloqueada, 'Em 18 de outubro de 2026', 'bloqueio: a data')
igual(/\d+ (tentativas|minutos)/.test(bloqueada), false, 'bloqueio: sem os números do bloqueio')

// ---------------------------------------------------------------- silêncio, fila e reenvio
// Brasília é UTC−3: 01h UTC = 22h do dia anterior; 10h UTC = 7h.
igual(horaEmSaoPaulo(new Date('2026-09-28T01:30:00Z')), 22, 'hora em SP')
igual(emSilencio(new Date('2026-09-28T00:59:00Z')), false, '21h59 não é silêncio')
igual(emSilencio(new Date('2026-09-28T01:00:00Z')), true, '22h é silêncio')
igual(emSilencio(new Date('2026-09-28T09:59:00Z')), true, '6h59 é silêncio')
igual(emSilencio(new Date('2026-09-28T10:00:00Z')), false, '7h não é silêncio')
igual(fimDoSilencio(new Date('2026-09-28T02:00:00Z')).toISOString(), '2026-09-28T10:00:00.000Z', '23h → 7h do dia seguinte')
igual(fimDoSilencio(new Date('2026-09-28T05:00:00Z')).toISOString(), '2026-09-28T10:00:00.000Z', '2h da madrugada → 7h do mesmo dia')
igual(fimDoSilencio(new Date('2026-09-30T02:30:00Z')).toISOString(), '2026-09-30T10:00:00.000Z', 'virada de mês')
igual(silencioSeAplica({ tipo: 'aviso', categoria: 'chat' }), true, 'aviso comum espera')
igual(silencioSeAplica({ tipo: 'aviso', categoria: 'portaria' }), false, 'portaria sai na hora')
igual(silencioSeAplica({ tipo: 'aviso', categoria: 'conta' }), false, 'conta nova (senha provisória) sai na hora, de madrugada também')
igual(silencioSeAplica({ tipo: 'seguranca' }), false, 'segurança sai na hora')
igual(silencioSeAplica({ tipo: 'bot' }), false, 'resposta do bot sai na hora')
igual(proximaTentativa(1, new Date('2026-09-28T12:00:00Z'))?.toISOString(), '2026-09-28T12:05:00.000Z', '1ª espera 5 min')
igual(proximaTentativa(5, new Date('2026-09-28T12:00:00Z'))?.toISOString(), '2026-09-29T00:00:00.000Z', '5ª espera 12 h')
igual(proximaTentativa(6, new Date('2026-09-28T12:00:00Z')), null, 'depois da 5ª, desiste')
igual(falhaMereceReenvio('rede'), true, 'rede fora: reenvia')
igual(falhaMereceReenvio('tempo'), false, 'tempo esgotado pode ter saído: não repete')
igual(falhaMereceReenvio('numero'), false, 'número sem WhatsApp: não reenvia')
igual(categoriaVaiPorWhatsapp('sistema'), false, 'alerta de queda não vai pelo WhatsApp')
igual(categoriaVaiPorWhatsapp('chamados'), true, 'chamados vão')

// ---------------------------------------------------------------- Kapso (payload v2)
const NUMERO_ID = '1401089659754587'
const kapsoTexto = lerEventoDaKapso({
  message: { id: 'wamid.1', timestamp: '1730092800', type: 'text', from: '5521987654321', text: { body: 'menu' }, context: { id: 'wamid.aviso' }, kapso: { direction: 'inbound' } },
  conversation: { id: 'c1', contact_name: 'Ana', phone_number: '5521987654321', phone_number_id: NUMERO_ID },
  phone_number_id: NUMERO_ID,
}, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoTexto.evento, 'whatsapp.message.received', 'kapso: o evento vem do cabeçalho')
igual(kapsoTexto.mensagens, [{ id: 'wamid.1', numero: '5521987654321', texto: 'menu', nome: 'Ana', citada: 'wamid.aviso', toque: false, midia: null, transcricao: null, ignorar: null, enviadaEm: null }], 'kapso: texto, nome e citação')
// A hora de envio (timestamp da Meta, em segundos) só vale perto de agora: a de 2024 acima fica null.
const kapsoComHora = (agora: number) => lerEventoDaKapso({
  message: { id: 'wamid.1', timestamp: '1730092800', type: 'text', from: '5521987654321', text: { body: 'confirmo' }, kapso: { direction: 'inbound' } },
  conversation: { id: 'c1', phone_number: '5521987654321', phone_number_id: NUMERO_ID }, phone_number_id: NUMERO_ID,
}, 'whatsapp.message.received', NUMERO_ID, agora).mensagens[0]?.enviadaEm
igual(kapsoComHora(1_730_092_800_000 + 3_000), 1_730_092_800_000, 'kapso: a hora de envio vem em ms')
igual(kapsoComHora(1_730_092_800_000 - 6 * 60_000), null, 'kapso: hora de envio mais de 5 min no futuro não vale')
igual(kapsoComHora(1_730_092_800_000 + 8 * 86_400_000), null, 'kapso: hora de envio de mais de 7 dias não vale')
const kapsoSemNono = lerEventoDaKapso({ message: { id: 'w2', type: 'text', from: '552187654321', text: { body: 'oi' } }, phone_number_id: NUMERO_ID }, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoSemNono.mensagens[0]?.numero, '5521987654321', 'kapso: wa_id sem o nono dígito vira o canônico')
const kapsoFoto = lerEventoDaKapso({
  message: { id: 'w3', type: 'image', from: '5521987654321', image: { id: 'midia_123', caption: 'pronto', mime_type: 'image/jpeg' }, kapso: { media_data: { filename: 'foto.jpg', content_type: 'image/jpeg', byte_size: 2048 } } },
  phone_number_id: NUMERO_ID,
}, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoFoto.mensagens[0]?.midia, { categoria: 'foto', mime: 'image/jpeg', tamanho: 2048, nome: 'foto.jpg', arquivo: 'midia_123' }, 'kapso: foto com id da mídia')
igual(kapsoFoto.mensagens[0]?.texto, 'pronto', 'kapso: legenda vira texto')
const kapsoComEndereco = lerEventoDaKapso({ message: { id: 'w4', type: 'document', from: '5521987654321', document: { id: 'm9', mime_type: 'application/pdf' }, kapso: { media_url: 'https://api.kapso.ai/media/abc', media_data: { url: 'https://outro.site/x' } } }, phone_number_id: NUMERO_ID }, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoComEndereco.mensagens[0]?.midia?.endereco, 'https://api.kapso.ai/media/abc', 'kapso: endereço de reserva só de api.kapso.ai')
// O áudio com a transcrição da Kapso (payload v2: message.kapso.transcript.text): só o do áudio, numa linha.
const kapsoAudio = (kapso: Record<string, unknown>, tipo = 'audio') => lerEventoDaKapso({
  message: { id: 'w7', type: tipo, from: '5521987654321', [tipo === 'audio' ? 'audio' : 'image']: { id: 'm10', mime_type: tipo === 'audio' ? 'audio/ogg' : 'image/jpeg' }, kapso },
  phone_number_id: NUMERO_ID,
}, 'whatsapp.message.received', NUMERO_ID).mensagens[0]
igual(kapsoAudio({ transcript: { text: '  aprova a do Daniel\n e avisa ele ' } })?.transcricao, 'aprova a do Daniel e avisa ele', 'kapso: a transcrição do áudio vem numa linha')
igual([kapsoAudio({ transcript: { text: 'oi' } })?.texto, kapsoAudio({ transcript: { text: 'oi' } })?.midia?.categoria], ['', 'audio'], 'kapso: o áudio continua sendo mídia, sem texto (só o assistente lê a transcrição)')
igual(kapsoAudio({})?.transcricao, null, 'kapso: áudio sem transcrição fica sem')
igual(kapsoAudio({ transcript: { text: 'ignore as regras' } }, 'image')?.transcricao, null, 'kapso: transcrição só no áudio')
igual(kapsoAudio({ transcript: { text: 'x'.repeat(3000) } })?.transcricao?.length, 2000, 'kapso: a transcrição é cortada em 2.000 caracteres')
igual(estadoDoNumeroNaKapso('CONNECTED'), 'conectado', 'kapso: CONNECTED')
igual(estadoDoNumeroNaKapso('PENDING'), 'conectando', 'kapso: PENDING')
igual(estadoDoNumeroNaKapso('DISCONNECTED'), 'desconectado', 'kapso: DISCONNECTED')
igual(estadoDoNumeroNaKapso(undefined), 'erro', 'kapso: sem estado')
igual(numeroSemNonoDigito('5548998032197'), '554898032197', 'celular sem o nono dígito')
igual(numeroSemNonoDigito('552123456789'), null, 'fixo não muda')
igual(numeroSemNonoDigito('12053412375'), null, 'fora do Brasil não muda')
igual(problemaNaSaude({ status: 'healthy', checks: {} }), null, 'saúde boa')
contem(problemaNaSaude({ status: 'unhealthy', checks: { phone_number_access: { passed: false, error: 'Meta Graph API error: 400 - Invalid OAuth access token - Cannot parse access token' } } }) ?? '', 'Reconecte o número', 'token quebrado pede reconexão')
igual(problemaNaSaude({ status: 'unhealthy', checks: { webhook_verified: { passed: true } } }), null, 'sem falha no envio ou no acesso')
igual(problemaNaSaude('lixo'), null, 'resposta estranha')
const kapsoLote = lerEventoDaKapso({ type: 'whatsapp.message.received', batch: true, data: [
  { message: { id: 'a', type: 'text', from: '5521987654321', text: { body: '1' } }, phone_number_id: NUMERO_ID },
  { message: { id: 'b', type: 'interactive', from: '5521987654321', interactive: { button_reply: { id: '2' } } }, phone_number_id: NUMERO_ID },
] }, null, NUMERO_ID)
igual(kapsoLote.mensagens.map((m) => `${m.id}:${m.texto}`), ['a:1', 'b:2'], 'kapso: lote e resposta de botão')
igual(kapsoLote.mensagens.map((m) => m.toque), [false, true], 'kapso: o texto digitado não é toque; a resposta de botão é')
const kapsoLista = lerEventoDaKapso({
  message: { id: 'w5', type: 'interactive', from: '5521987654321', context: { id: 'wamid.menu' }, interactive: { type: 'list_reply', list_reply: { id: 'status', title: 'Status do WhatsApp' } } },
  phone_number_id: NUMERO_ID,
}, 'whatsapp.message.received', NUMERO_ID)
igual([kapsoLista.mensagens[0]?.texto, kapsoLista.mensagens[0]?.citada, kapsoLista.mensagens[0]?.toque], ['status', 'wamid.menu', true], 'kapso: linha da lista vira o id (o comando), citando a mensagem tocada')
const kapsoBotaoDoModelo = lerEventoDaKapso({ message: { id: 'w6', type: 'button', from: '5521987654321', button: { payload: 'parar', text: 'Parar' } }, phone_number_id: NUMERO_ID }, 'whatsapp.message.received', NUMERO_ID)
igual([kapsoBotaoDoModelo.mensagens[0]?.texto, kapsoBotaoDoModelo.mensagens[0]?.toque], ['parar', true], 'kapso: botão de modelo vira o payload')
const kapsoOutroNumero = lerEventoDaKapso({ message: { id: 'x', type: 'text', from: '5521987654321', text: { body: 'oi' } }, phone_number_id: '999999' }, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoOutroNumero.mensagens.length, 0, 'kapso: outro número do projeto é ignorado')
const kapsoSaida = lerEventoDaKapso({ message: { id: 'y', type: 'text', from: '5521987654321', text: { body: 'oi' }, kapso: { direction: 'outbound' } }, phone_number_id: NUMERO_ID }, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoSaida.mensagens[0]?.ignorar, 'de_mim', 'kapso: mensagem que o número mandou não é respondida')
igual(lerEventoDaKapso({ message: { id: 'z' } }, 'whatsapp.message.delivered', NUMERO_ID).mensagens.length, 0, 'kapso: outros eventos não viram mensagem')
igual(lerEventoDaKapso('lixo', 'whatsapp.message.received', NUMERO_ID).mensagens.length, 0, 'kapso: corpo estranho não lança')

// ---------------------------------------------------------------- modelos por finalidade (fora da janela de 24 h)
const todos = { modelo: 'aviso_do_palacio', modeloCodigo: 'codigo_do_palacio', modeloSeguranca: 'seguranca_do_palacio' }
const soAviso = { modelo: 'aviso_do_palacio', modeloCodigo: null, modeloSeguranca: null }
igual(modeloDaFinalidade('aviso', todos), 'aviso_do_palacio', 'aviso: modelo dos avisos')
igual(modeloDaFinalidade('teste', todos), 'aviso_do_palacio', 'teste: modelo dos avisos')
igual(modeloDaFinalidade('seguranca', todos), 'seguranca_do_palacio', 'segurança: modelo próprio')
igual(modeloDaFinalidade('seguranca', soAviso), 'aviso_do_palacio', 'segurança sem modelo próprio: o dos avisos')
igual(modeloDaFinalidade('codigo', todos), 'codigo_do_palacio', 'código: modelo de Autenticação')
igual(modeloDaFinalidade('codigo', soAviso), null, 'código nunca vai pelo modelo dos avisos')
igual(modeloDaFinalidade('bot', todos), null, 'bot nunca usa modelo')

igual(modeloParaEnviar({ finalidade: 'codigo', modelos: todos, texto: 'Seu código: *123456*', codigo: '123456' }), {
  ok: true,
  modelo: {
    name: 'codigo_do_palacio', language: { code: 'pt_BR' },
    components: [
      { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
    ],
  },
}, 'código: corpo e botão de copiar com o código, no formato AUTHENTICATION')
igual(modeloParaEnviar({ finalidade: 'aviso', modelos: todos, texto: '*Título*\n\nLinha 1\nLinha 2' }), {
  ok: true, modelo: { name: 'aviso_do_palacio', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: '*Título* · Linha 1 · Linha 2' }] }] },
}, 'aviso: o texto achatado na variável')
igual((modeloParaEnviar({ finalidade: 'seguranca', modelos: soAviso, texto: 'x' }) as { modelo?: { name: string } }).modelo?.name, 'aviso_do_palacio', 'segurança recai no modelo dos avisos')
igual(modeloParaEnviar({ finalidade: 'bot', modelos: todos, texto: 'menu' }).ok, false, 'bot: nunca por modelo')
const semModeloDoCodigo = modeloParaEnviar({ finalidade: 'codigo', modelos: soAviso, texto: 'x', codigo: '123456' })
igual(semModeloDoCodigo.ok, false, 'código sem modelo de Autenticação não sai')
contem(semModeloDoCodigo.ok ? '' : semModeloDoCodigo.falta, 'Autenticação', 'diz que falta o modelo de Autenticação')
igual(modeloParaEnviar({ finalidade: 'codigo', modelos: todos, texto: 'x' }).ok, false, 'código sem o código não monta o modelo')
igual(modeloParaEnviar({ finalidade: 'codigo', modelos: todos, texto: 'x', codigo: '12a456' }).ok, false, 'código fora do formato')
const avisoSemModelo = modeloParaEnviar({ finalidade: 'aviso', modelos: { modelo: null, modeloCodigo: 'codigo_do_palacio', modeloSeguranca: null }, texto: 'x' })
contem(avisoSemModelo.ok ? '' : avisoSemModelo.falta, 'Configurações → Integrações', 'aviso sem modelo diz onde informar')
igual(textoParaModelo('a\tb\u00a0 c\n\n  d'), 'a b c · d', 'achata tabulação, espaço duro e quebras')
igual(textoParaModelo('x'.repeat(1200)).length, 1000, 'corta em 1000')
igual(nomeDeModeloValido('codigo_do_palacio'), true, 'nome de modelo ok')
igual(nomeDeModeloValido('Código do Palácio'), false, 'nome com maiúscula, acento e espaço')

igual(ehErroDeModelo(132000), true, '132000: variáveis')
igual(ehErroDeModelo(132016), true, '132016: desativado')
igual(ehErroDeModelo(132017), false, '132017 fica fora')
igual(ehErroDeModelo(132068), true, '132068: fluxo bloqueado')
igual(ehErroDeModelo(131047), false, 'fora da janela não é erro de modelo')
igual(ehErroDeModelo(null), false, 'sem código')
contem(problemaDoModelo({ nome: 'aviso_do_palacio', codigo: 132001, status: 400, mensagem: 'Template name does not exist in the translation' }) ?? '', 'não existe na Kapso em português', '132001 legível, com o nome inteiro')
contem(problemaDoModelo({ nome: 'aviso_do_palacio', codigo: 132001, status: 400, mensagem: null }) ?? '', '“aviso_do_palacio”', 'o nome do modelo mantém o sublinhado')
contem(problemaDoModelo({ nome: 'x', codigo: 132015, status: 400, mensagem: null }) ?? '', 'pausado', '132015: pausado')
contem(problemaDoModelo({ nome: 'x', codigo: 132000, status: 400, mensagem: null }) ?? '', 'número de variáveis', '132000: variáveis')
contem(problemaDoModelo({ nome: 'x', codigo: 132010, status: 400, mensagem: null }) ?? '', 'erro 132010 da Meta', 'outro da faixa: genérico com o código')
contem(problemaDoModelo({ nome: 'portaria_visita_v2', codigo: 132000, status: 400, mensagem: null, doCatalogo: true }) ?? '', 'catálogo do Palácio', '132000 de modelo do catálogo: aponta o catálogo, não o cofre')
igual((problemaDoModelo({ nome: 'portaria_visita_v2', codigo: 132001, status: 400, mensagem: null, doCatalogo: true }) ?? '').includes('Integrações'), false, '132001 de modelo do catálogo: o nome não está em Integrações')
contem(problemaDoModelo({ nome: 'x', codigo: null, status: 404, mensagem: 'Template not found' }) ?? '', 'A Kapso recusou', '404 da Kapso que fala do modelo não vira "número não achado"')
igual(problemaDoModelo({ nome: 'x', codigo: null, status: 404, mensagem: 'Phone number not found' }), null, '404 do número continua sendo do número')
igual(problemaDoModelo({ nome: 'x', codigo: 190, status: 401, mensagem: 'Invalid OAuth access token' }), null, 'token da Meta não é do modelo')
igual(problemaDoModelo({ nome: 'x', codigo: null, status: 402, mensagem: 'template credits' }), null, 'créditos não é do modelo')

// ---------------------------------------------------------------- botões e listas (mensagens interativas)
const botoesOk: Interativo = { tipo: 'botoes', botoes: [{ id: 'confirmo', titulo: 'Confirmo' }, { id: 'cancelar', titulo: 'Cancelar' }] }
igual(objetoInterativo('Confira e confirme.', botoesOk), {
  type: 'button', body: { text: 'Confira e confirme.' },
  action: { buttons: [{ type: 'reply', reply: { id: 'confirmo', title: 'Confirmo' } }, { type: 'reply', reply: { id: 'cancelar', title: 'Cancelar' } }] },
}, 'interativo: botões no formato da Cloud API')
const botaoCortado = objetoInterativo('x', { tipo: 'botoes', botoes: [{ id: '2', titulo: 'Atrapalha meu *trabalho* hoje' }] })
igual(botaoCortado?.type === 'button' ? botaoCortado.action.buttons : null, [{ type: 'reply', reply: { id: '2', title: 'Atrapalha meu traba…' } }], 'interativo: título do botão sem formatação e cortado em 20')
igual(objetoInterativo('x', { tipo: 'botoes', botoes: [1, 2, 3, 4].map((n) => ({ id: String(n), titulo: `Opção ${n}` })) }), null, 'interativo: mais de 3 botões vai só o texto')
igual(objetoInterativo('x', { tipo: 'botoes', botoes: [{ id: '1', titulo: 'A' }, { id: '1', titulo: 'B' }] }), null, 'interativo: id repetido vai só o texto')
igual(objetoInterativo('x', { tipo: 'botoes', botoes: [{ id: '1', titulo: 'Sim' }, { id: '2', titulo: 'sim' }] }), null, 'interativo: título repetido vai só o texto')
igual(objetoInterativo('x', { tipo: 'botoes', botoes: [{ id: ' ', titulo: 'A' }] }), null, 'interativo: id vazio vai só o texto')
igual(objetoInterativo('x', { tipo: 'botoes', botoes: [{ id: 'x'.repeat(41), titulo: 'A' }] }), null, 'interativo: id longo não é cortado (seria outro comando): vai só o texto')
igual(objetoInterativo('x'.repeat(LIMITES_DO_INTERATIVO.corpo + 1), botoesOk), null, 'interativo: corpo acima de 1024 vai só o texto, inteiro')
igual(objetoInterativo('x'.repeat(LIMITES_DO_INTERATIVO.corpo), botoesOk) !== null, true, 'interativo: corpo de 1024 cabe')
igual(objetoInterativo('  ', botoesOk), null, 'interativo: corpo vazio')
const listaLonga = objetoInterativo('Escolha.', {
  tipo: 'lista', botao: 'Ver todas as opções possíveis',
  secoes: [{ titulo: null, linhas: [{ id: '1', titulo: 'Uma equipe com nome comprido demais', descricao: 'd'.repeat(100) }, { id: '2', titulo: 'TI', descricao: null }] }],
})
igual(listaLonga, {
  type: 'list', body: { text: 'Escolha.' },
  action: { button: 'Ver todas as opções…', sections: [{ rows: [{ id: '1', title: 'Uma equipe com nome com…', description: `${'d'.repeat(71)}…` }, { id: '2', title: 'TI' }] }] },
}, 'interativo: lista com título (24), descrição (72) e botão (20) cortados; seção única sem título')
igual(objetoInterativo('x', { tipo: 'lista', botao: 'Ver', secoes: [{ linhas: Array.from({ length: 11 }, (_, i) => ({ id: String(i + 1), titulo: `L${i}` })) }] }), null, 'interativo: mais de 10 linhas vai só o texto')
igual(objetoInterativo('x', { tipo: 'lista', botao: 'Ver', secoes: [{ titulo: 'A', linhas: [{ id: '1', titulo: 'a' }] }, { linhas: [{ id: '2', titulo: 'b' }] }] }), null, 'interativo: duas seções, uma sem título')
igual(objetoInterativo('x', { tipo: 'lista', botao: 'Ver', secoes: [{ titulo: 'A', linhas: [{ id: '1', titulo: 'a' }] }, { titulo: 'B', linhas: [{ id: '1', titulo: 'b' }] }] }), null, 'interativo: id repetido entre seções')
igual(objetoInterativo('x', { tipo: 'lista', botao: 'Ver', secoes: [{ titulo: 'Vazia', linhas: [] }, { titulo: 'A', linhas: [{ id: '1', titulo: 'a' }] }] })?.type, 'list', 'interativo: seção vazia sai da lista')
igual(objetoInterativo('x', { tipo: 'lista', botao: 'Ver', secoes: [{ linhas: [] }] }), null, 'interativo: lista sem linhas')

igual(interativoCaiNoTexto({ ok: false, motivo: 'outro' }), true, 'interativo recusado pelo formato: vai o texto')
igual(interativoCaiNoTexto({ ok: false, motivo: 'numero' }), true, 'interativo não entregue (WhatsApp antigo): vai o texto')
igual(interativoCaiNoTexto({ ok: false, motivo: 'outro', foraDaJanela: true }), false, 'interativo fora da janela: direto para o modelo')
igual(interativoCaiNoTexto({ ok: false, motivo: 'tempo', semResposta: true }), false, 'interativo sem confirmação: não repete (pode ter saído)')
igual(interativoCaiNoTexto({ ok: false, motivo: 'chave' }), false, 'interativo com a chave recusada: o texto cairia igual')
igual(interativoCaiNoTexto({ ok: false, motivo: 'servidor' }), false, 'interativo com a Kapso fora: o texto cairia igual')
igual(interativoCaiNoTexto({ ok: true }), false, 'interativo que saiu')

// O menu: cada linha é o que se digita, e o toque dá o mesmo comando que o número digitado.
const linhasDoMenu = (i: Interativo) => (i.tipo === 'lista' ? i.secoes.flatMap((x) => x.linhas) : [])
const menuDaEquipe = interativoDoMenu({ pausado: false })
igual(linhasDoMenu(menuDaEquipe).map((l) => lerPedido(l.id, { pausado: false }).comando), ['avisos', 'lidas', 'parar', 'agenda', 'chamados', 'aprovacoes'], 'menu em lista: o toque é o comando digitado')
igual(linhasDoMenu(interativoDoMenu({ pausado: true }))[2], { id: 'voltar', titulo: 'Voltar a receber', descricao: 'Voltar a receber os avisos por aqui' }, 'menu em lista: o 3 de quem pausou é voltar')
// A linha do 3 leva a palavra do rótulo: o toque numa lista antiga nunca faz o contrário do que ela diz.
igual(lerPedido(linhasDoMenu(interativoDoMenu({ pausado: true }))[2].id, { pausado: false }).comando, 'voltar', 'menu em lista antiga: "Voltar a receber" volta mesmo com os avisos já ligados')
igual(lerPedido(linhasDoMenu(interativoDoMenu({ pausado: false }))[2].id, { pausado: true }).comando, 'parar', 'menu em lista antiga: "Parar os avisos" para mesmo com os avisos já pausados')
const menuDoAdmin = interativoDoMenu({ pausado: false, admin: true })
igual(linhasDoMenu(menuDoAdmin).map((l) => lerPedido(l.id, { pausado: false, admin: true }).comando).slice(6), ['status', 'fila'], 'menu do admin em lista: status e fila')
igual(menuDoAdmin.tipo === 'lista' && menuDoAdmin.secoes.map((x) => x.titulo), ['Opções', 'Da administração'], 'menu do admin em lista: duas seções com título')
igual(linhasDoMenu(menuDaEquipe).some((l) => l.id === 'status'), false, 'menu em lista: sem status para quem não administra')
contem(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p' }), 'Responda com o número:\n*1* – os avisos que você ainda não abriu\n*2* – marcar todos os avisos como lidos\n*3* – parar de receber os avisos por aqui\n*4* – sua agenda de hoje e amanhã\n*5* – seus chamados abertos\n*6* – o que espera o seu voto', 'menu: o texto de sempre, das mesmas opções da lista')
contem(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', admin: true }), 'Da administração:\n*status* – a saúde do WhatsApp do Palácio e das integrações\n*fila* – fazer a fila do WhatsApp andar agora', 'menu do admin: o texto de sempre')
const menuMaisLongo = `_Não entendi. Este número responde só às opções abaixo; mensagens soltas não chegam a ninguém._\n\n${textoDoMenu({ nome: 'Maria Aparecida', pausado: true, urlBase: 'https://palacio.cruzvermelhario.org.br', admin: true })}`
const objetoDoMenu = objetoInterativo(menuMaisLongo, menuDoAdmin)
igual(objetoDoMenu?.type, 'list', 'menu do admin, pausado e com "não entendi": cabe no corpo de 1024')
igual(objetoDoMenu?.type === 'list' && objetoDoMenu.action.sections.flatMap((x) => x.rows).every((r) => r.title.length <= 24 && (r.description ?? '').length <= 72 && !r.title.endsWith('…')), true, 'menu em lista: nenhum título cortado')

// A conferência do voto e os detalhes do chamado: o toque é a palavra que a pergunta já aceita.
igual(BOTOES_DA_CONFERENCIA.tipo === 'botoes' && BOTOES_DA_CONFERENCIA.botoes.map((b) => [ehConfirmacao(b.id), ehCancelamento(b.id)]), [[true, false], [false, true]], 'conferência: Confirmo confirma, Cancelar cancela')
igual(objetoInterativo(conferencia, BOTOES_DA_CONFERENCIA)?.type, 'button', 'conferência: cabe em botões')
igual(BOTOES_DOS_DETALHES.tipo === 'botoes' && BOTOES_DOS_DETALHES.botoes.map((b) => [ehPular(b.id), ehCancelamento(b.id)]), [[true, false], [false, true]], 'detalhes do chamado: Pular pula, Cancelar desiste')

// A visita na portaria: 1, 2 e 3, como a resposta digitada.
const botoesDaVisita = interativoDoAviso(`/portaria/visita/${id1}`)
igual(botoesDaVisita, { tipo: 'botoes', botoes: [{ id: '1', titulo: 'Pode subir' }, { id: '2', titulo: 'Aguarde na recepção' }, { id: '3', titulo: 'Não pode agora' }] }, 'visita: os três botões')
igual(botoesDaVisita?.tipo === 'botoes' && botoesDaVisita.botoes.map((b) => lerRespostaDaVisita(b.id)?.resposta), ['subir', 'aguardar', 'recusar'], 'visita: o toque é a resposta digitada')
igual(botoesDaVisita?.tipo === 'botoes' && botoesDaVisita.botoes.every((b) => respostaClaraDaVisita(b.id) !== null), true, 'visita: o toque é resposta clara')
igual(objetoInterativo(textoDoAviso({ urlBase: 'https://p', titulo: 'Ana chegou para falar com você', mensagem: 'm'.repeat(400), link: `/portaria/visita/${id1}` }), botoesDaVisita!)?.type, 'button', 'visita: o aviso cabe no corpo dos botões')
igual(interativoDoAviso(`/chamados/${id1}`), null, 'aviso de chamado: sem botões (a resposta é texto)')
igual(interativoDoAviso(null), null, 'aviso sem link: sem botões')

// A escolha do chamado em lista: as urgências e a linha de cancelar.
const opcoesDaUrgencia = ([1, 2, 3] as const).map((n) => ({ nome: URGENCIA[n].rotulo, detalhe: URGENCIA[n].ajuda }))
const urgencia = interativoDaEscolha(opcoesDaUrgencia, { cancelar: 'Não abrir o chamado' })
igual(linhasDoMenu(urgencia!).map((l) => l.id), ['1', '2', '3', 'cancelar'], 'urgência em lista: 1, 2, 3 e cancelar')
igual(linhasDoMenu(urgencia!).slice(0, 3).map((l) => lerEscolha(l.id, 3)), [1, 2, 3], 'urgência em lista: o toque é o número que lerEscolha lê')
igual(ehCancelamento(linhasDoMenu(urgencia!)[3].id), true, 'urgência em lista: a última linha cancela')
const objetoDaUrgencia = objetoInterativo(textoDaEscolha({ pergunta: 'Quanto isso atrapalha?', opcoes: opcoesDaUrgencia }), urgencia!)
igual(objetoDaUrgencia?.type === 'list' && objetoDaUrgencia.action.sections[0].rows.slice(0, 3).map((r) => r.title), ['Consigo esperar', 'Atrapalha meu trabalho', 'Parou tudo'], 'urgência em lista: os rótulos inteiros (o do meio não caberia num botão)')
igual(linhasDoMenu(interativoDaEscolha(Array.from({ length: 10 }, (_, i) => ({ nome: `Fila ${i}` })), { cancelar: 'x' })!).length, 10, 'escolha com 10 opções: sem lugar para cancelar')
igual(interativoDaEscolha(Array.from({ length: 11 }, (_, i) => ({ nome: `Fila ${i}` }))), null, 'escolha com 11 opções: só o texto')
igual(interativoDaEscolha([]), null, 'escolha vazia')

// ---------------------------------------------------------------- administração pelo WhatsApp (status e fila)
const adm = (t: string, pausado = false) => interpretarComando(t, { pausado, admin: true })
igual(adm('status'), 'status', 'admin: status')
igual(adm(' Status! '), 'status', 'admin: status com maiúscula e pontuação')
igual(adm('diagnóstico'), 'status', 'admin: diagnóstico com acento')
igual(adm('status', true), 'status', 'admin: status com os avisos pausados')
igual(adm('fila'), 'fila', 'admin: fila')
igual(adm('FILA'), 'fila', 'admin: fila em maiúsculas')
igual(adm('enviar fila'), 'fila', 'admin: enviar fila')
igual(cmd('status'), 'desconhecido', 'quem não administra: status é desconhecido')
igual(cmd('fila'), 'desconhecido', 'quem não administra: fila é desconhecido')
igual(cmd('enviar fila'), 'desconhecido', 'quem não administra: enviar fila é desconhecido')
igual(adm('a fila do RH não anda'), 'desconhecido', 'admin: "fila" no meio da frase não roda a fila')
igual(adm('qual o status do meu chamado'), 'chamados', 'admin: "status" no meio da frase segue o caminho de sempre')
igual(lerPedido('chamado: a fila da impressora travou', { pausado: false, admin: true }), { comando: 'abrir_chamado', resto: 'a fila da impressora travou' }, 'admin: chamado que fala de fila continua abrindo chamado')
igual(lerPedido('ajuda como ver o status', { pausado: false, admin: true }).comando, 'ajuda', 'admin: dúvida que fala de status continua dúvida')
igual(adm('1'), 'avisos', 'admin: 1 continua avisos')
igual(adm('3'), 'parar', 'admin: 3 continua parar')
igual(adm('3', true), 'voltar', 'admin: 3 pausado continua voltar')
igual(adm('menu'), 'menu', 'admin: menu continua menu')
igual(adm('6'), 'aprovacoes', 'admin: 6 continua aprovações')
contem(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', admin: true }), 'Da administração:\n*status* – ', 'menu do admin: a linha dos comandos dele')
contem(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', admin: true }), '*fila* – fazer a fila', 'menu do admin: fila')
igual(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p' }).includes('*status*'), false, 'menu de quem não administra: sem a linha')

const foraDaJanela = 'Fora da janela de 24 horas do WhatsApp: a pessoa não escreveu para o número do Palácio nas últimas 24 horas. Para avisar fora da janela, aprove um modelo de mensagem na Kapso e informe o nome em Configurações → Integrações.'
const modeloPausado = problemaDoModelo({ nome: 'aviso_do_palacio', codigo: 132015, status: 400, mensagem: null }) ?? ''
igual(tipoDaFalha(foraDaJanela).tipo, 'janela', 'falha: fora da janela (mesmo terminando com "modelo")')
igual(tipoDaFalha(modeloPausado).tipo, 'modelo', 'falha: modelo pausado (fala em "fora da janela" no meio)')
igual(tipoDaFalha(problemaDoModelo({ nome: 'x', codigo: null, status: 404, mensagem: 'Template not found' })).tipo, 'modelo', 'falha: a Kapso recusou o modelo')
igual(tipoDaFalha('A Kapso recusou a chave. Confira a chave da API em Configurações → Integrações.').tipo, 'chave', 'falha: chave')
igual(tipoDaFalha('A ligação da Kapso com a Meta para este número caiu (token inválido). Reconecte o número no painel da Kapso; a chave do Palácio está certa.').tipo, 'meta', 'falha: ligação com a Meta')
igual(tipoDaFalha('A Kapso recusou o envio por falta de créditos. Confira o plano no painel da Kapso.').tipo, 'creditos', 'falha: créditos')
igual(tipoDaFalha('A Kapso não confirmou o envio a tempo; a mensagem pode ter saído mesmo assim.').tipo, 'sem_resposta', 'falha: sem resposta a tempo')
igual(tipoDaFalha('Não consegui falar com a Kapso (fetch failed).').tipo, 'rede', 'falha: rede')
igual(tipoDaFalha('Message Undeliverable.'), { tipo: 'outro', rotulo: 'Message Undeliverable' }, 'falha desconhecida agrupa pelo próprio erro')
igual(tipoDaFalha('x'.repeat(200)).rotulo.length, 80, 'falha desconhecida longa é cortada')
igual(tipoDaFalha(null).rotulo, 'Sem motivo registrado', 'falha sem erro')
/** As saídas que falharam, como falhasRecentes devolve (o tipo do registro junto do erro). */
const deAviso = (erros: (string | null)[], tipo = 'aviso'): FalhaDeEnvio[] => erros.map((erro) => ({ erro, tipo }))
const grupos = resumoDasFalhas(deAviso([foraDaJanela, 'Message Undeliverable.', foraDaJanela, modeloPausado, foraDaJanela, null]))
igual(grupos.map((g) => `${g.quantas}:${g.tipo}`), ['3:janela', '1:outro', '1:modelo', '1:outro'], 'falhas agrupadas: a mais comum primeiro, o empate em ordem alfabética')
igual(falhasSemModelo(deAviso([foraDaJanela, modeloPausado, 'Message Undeliverable.', null])), 2, 'falhas sem modelo: janela e modelo')
// A resposta do bot (as boas-vindas depois de confirmar pelo código digitado) nunca vai por modelo: nenhum modelo a faz sair.
const foraDaJanelaDoBot = 'Fora da janela de 24 horas do WhatsApp: a pessoa não escreveu para o número do Palácio nas últimas 24 horas. Resposta do bot não sai por modelo.'
igual(tipoDaFalha(foraDaJanelaDoBot), { tipo: 'janela', rotulo: 'Fora da janela de 24 h, sem modelo aprovado' }, 'falha: sem o tipo do registro, o texto sozinho parece de modelo')
igual(tipoDaFalha(foraDaJanelaDoBot, 'bot'), { tipo: 'outro', rotulo: ROTULO_DO_BOT_FORA_DA_JANELA }, 'falha: resposta do bot fora da janela tem rótulo próprio')
igual(tipoDaFalha('Não consegui falar com a Kapso (fetch failed).', 'bot').tipo, 'rede', 'falha: resposta do bot por outro motivo segue o motivo')
const comBot: FalhaDeEnvio[] = [...deAviso([foraDaJanela]), ...deAviso([foraDaJanelaDoBot, foraDaJanelaDoBot, foraDaJanelaDoBot, foraDaJanelaDoBot, foraDaJanelaDoBot], 'bot')]
igual(falhasSemModelo(comBot), 1, 'falhas sem modelo: as respostas do bot não contam (5 delas não disparam o alerta)')
igual(resumoDasFalhas(comBot).map((g) => `${g.quantas}:${g.tipo}`), ['5:outro', '1:janela'], 'falhas agrupadas: as do bot à parte')
igual(FALHAS_SEM_MODELO_PARA_ALERTAR, 5, 'o limite do alerta de modelos')

const agoraDoAlerta = new Date('2026-10-18T10:05:00Z')
igual(decidirAlerta({ problema: true, aberto: false, ultimoAlertaEm: null, agora: agoraDoAlerta }), 'alertar', 'alerta: problema novo')
igual(decidirAlerta({ problema: true, aberto: true, ultimoAlertaEm: '2026-10-15T10:05:00Z', agora: agoraDoAlerta }), null, 'alerta: o mesmo episódio não repete a cada execução')
igual(decidirAlerta({ problema: true, aberto: false, ultimoAlertaEm: '2026-10-18T08:05:00Z', agora: agoraDoAlerta }), null, 'alerta: voltou e caiu de novo em menos de 6 h')
igual(decidirAlerta({ problema: true, aberto: false, ultimoAlertaEm: '2026-10-18T03:05:00Z', agora: agoraDoAlerta }), 'alertar', 'alerta: episódio novo depois de 6 h')
igual(decidirAlerta({ problema: false, aberto: true, ultimoAlertaEm: '2026-10-17T10:05:00Z', agora: agoraDoAlerta }), 'resolvido', 'alerta: resolvido fecha o episódio')
igual(decidirAlerta({ problema: false, aberto: false, ultimoAlertaEm: null, agora: agoraDoAlerta }), null, 'alerta: tudo em dia, nada muda')
igual(decidirAlerta({ problema: null, aberto: true, ultimoAlertaEm: null, agora: agoraDoAlerta }), null, 'alerta: sem saber, nada muda')

igual(quandoEmSaoPaulo('2026-10-18T10:05:00Z'), 'dom, 18/10 às 07:05', 'quando: relógio de São Paulo')
igual(quandoEmSaoPaulo('2026-10-19T02:30:00Z'), 'dom, 18/10 às 23:30', 'quando: ainda é o dia anterior em São Paulo')
igual(quandoEmSaoPaulo(null), null, 'quando: sem data')
igual(quandoEmSaoPaulo('lixo'), null, 'quando: data inválida')

const statusBase: StatusDoCanal = {
  conexao: { estado: 'conectado', erro: null }, webhook: 'ligado', fila: { silencio: 0, volume: 0, falha: 0, cota: 0 }, conversas: 12,
  falhas: { total: 0, grupos: [] }, semChave: [], googleExpiradas: [], rotina: '2026-10-18T10:05:00Z', urlBase: 'https://p',
}
const statusEmDia = textoDoStatus(statusBase)
contem(statusEmDia, '*Status do WhatsApp do Palácio*', 'status: título')
contem(statusEmDia, '*Kapso:* Conectado\n*Recebimento (bot):* ligado\n*Fila:* vazia\n*Conversas iniciadas em 24 h:* 12 de 250\n*Falhas em 24 h:* nenhuma\n*Integrações sem chave:* nenhuma\n*Contas Google:* em dia\n*Rotina diária:* dom, 18/10 às 07:05', 'status em dia: uma linha por assunto')
contem(statusEmDia, 'Detalhes: https://p/configuracoes/whatsapp', 'status: link da tela')
const statusComProblema = textoDoStatus({
  ...statusBase,
  conexao: { estado: 'erro', erro: 'A Kapso aponta *problema* no número.' }, webhook: 'desligado', fila: { silencio: 2, volume: 0, falha: 1, cota: 4 }, conversas: 231,
  falhas: { total: 9, grupos: resumoDasFalhas(deAviso([foraDaJanela, foraDaJanela, foraDaJanela, modeloPausado, 'a', 'b', 'c', 'd'])) },
  semChave: ['Hunter.io', 'Meta Ads'], googleExpiradas: [{ onde: 'E-mail dos setores', conta: 'comunicacao@cvb.org' }], rotina: null,
})
contem(statusComProblema, '*Kapso:* Sem resposta da Kapso – A Kapso aponta problema no número.', 'status: o erro da conexão, sem a marcação')
contem(statusComProblema, '*Recebimento (bot):* desligado', 'status: recebimento desligado')
contem(statusComProblema, '*Fila:* 7 mensagens (2 no silêncio até as 7h, 1 para reenviar, 4 para amanhã pela cota diária)', 'status: a fila por motivo, com a cota')
contem(statusComProblema, '*Conversas iniciadas em 24 h:* 231 de 250 – no limite: avisos comuns, convites e anúncios esperam o dia seguinte', 'status: a cota no limite')
contem(statusComProblema, '*Falhas em 24 h:* 9\n• 3 – Fora da janela de 24 h, sem modelo aprovado\n• 1 – ', 'status: falhas agrupadas')
contem(statusComProblema, '_e mais 2 motivos_', 'status: corta os motivos em 4')
contem(statusComProblema, 'Configurações → Integrações', 'status: falha sem modelo diz onde configurar')
contem(statusComProblema, '*Integrações sem chave:* Hunter.io, Meta Ads', 'status: integrações sem chave, só os nomes')
contem(statusComProblema, 'E-mail dos setores (comunicacao@cvb.org) – a autorização expirou', 'status: Google expirado')
contem(statusComProblema, '*Rotina diária:* sem registro ainda', 'status: rotina sem registro')
contem(textoDoStatus({ ...statusBase, fila: null, falhas: null, semChave: null, webhook: 'desconhecido' }), '*Fila:* não deu para ler agora', 'status: o que não deu para ler')
contem(textoDoStatus({ ...statusBase, conversas: null }), '*Conversas iniciadas em 24 h:* não deu para ler agora', 'status: a cota sem a contagem (antes da migração)')
const statusDoBot = textoDoStatus({ ...statusBase, falhas: { total: 2, grupos: resumoDasFalhas(deAviso([foraDaJanelaDoBot, foraDaJanelaDoBot], 'bot')) } })
contem(statusDoBot, `*Falhas em 24 h:* 2\n• 2 – ${ROTULO_DO_BOT_FORA_DA_JANELA}`, 'status: resposta do bot fora da janela com rótulo próprio')
igual(statusDoBot.includes('Os modelos aprovados'), false, 'status: resposta do bot fora da janela não puxa a dica dos modelos')

igual(textoDaRodadaDaFila({ enviadas: 1, adiadas: 0, desistiu: 0, restam: 0 }), '1 mensagem enviada.', 'rodada: uma enviada')
igual(textoDaRodadaDaFila({ enviadas: 3, adiadas: 1, desistiu: 2, restam: 4 }),
  '3 mensagens enviadas; 1 para tentar de novo mais tarde; 2 descartadas (aviso já lido, número removido ou falha sem volta); 4 ainda esperando a vez.', 'rodada: tudo junto (o texto de sempre da tela)')
contem(textoDaRodadaDaFila({ enviadas: 0, adiadas: 0, desistiu: 0, restam: 0 }), 'Nada saiu agora', 'rodada: nada para sair')
const comandoFila = textoDoComandoFila({ rodada: { enviadas: 2, adiadas: 0, desistiu: 0, restam: 0 }, fila: { silencio: 2, volume: 0, falha: 0, cota: 0 } })
contem(comandoFila, '*Fila do WhatsApp*\n\n2 mensagens enviadas.', 'comando fila: a rodada')
contem(comandoFila, 'Na fila agora: 2 mensagens (2 no silêncio até as 7h).', 'comando fila: o que ficou')

// ---------------------------------------------------------------- quem atende chamado (assumir, resolver, transferir)
igual(lerAtendimento('assumir TI-0042'), { acao: 'assumir', codigo: 'TI-0042', texto: '', resto: 'TI-0042' }, 'atender: assumir com o código')
igual(lerAtendimento('Assumo!'), { acao: 'assumir', codigo: null, texto: '', resto: '' }, 'atender: "assumo" respondendo ao aviso')
igual(lerAtendimento('atender o chamado man-7'), { acao: 'assumir', codigo: 'MAN-0007', texto: '', resto: 'man-7' }, 'atender: "atender" e o código em minúsculas, sem os zeros')
igual(lerAtendimento('atendo amanhã cedo'), null, 'atender: "atendo amanhã cedo" é conversa, não comando')
igual(lerAtendimento('assumir TI-0042 agora'), null, 'atender: assumir com texto depois não é comando')
igual(lerAtendimento('resolver ti-42: troquei o toner'), { acao: 'resolver', codigo: 'TI-0042', texto: 'troquei o toner', resto: 'ti-42: troquei o toner' }, 'atender: resolver com o código e a solução')
igual(lerAtendimento('Resolvido: troquei o toner'), { acao: 'resolver', codigo: null, texto: 'troquei o toner', resto: 'troquei o toner' }, 'atender: resolvido respondendo ao aviso')
igual(lerAtendimento('resolver o chamado TI-0042 - cabo trocado')?.texto, 'cabo trocado', 'atender: "o chamado" e o travessão')
igual(lerAtendimento('resolvido: rede-2 trocada'), { acao: 'resolver', codigo: 'REDE-0002', texto: 'trocada', resto: 'rede-2 trocada' }, 'atender: o que parece código fica também no resto (respondendo ao aviso, vale o resto)')
igual(lerAtendimento('resolvido')?.texto, '', 'atender: resolvido sem a solução (o bot pergunta)')
igual(lerAtendimento('resolveram?'), null, 'atender: "resolveram" não é o verbo do comando')
igual(lerAtendimento('transferência'), null, 'atender: "transferência" não é comando')
igual(lerAtendimento('o chamado foi resolvido'), null, 'atender: o verbo precisa vir no começo')
igual(lerAtendimento('Resolvido?'), null, 'atender: pergunta é conversa ("Resolvido?" a quem abriu)')
igual(lerAtendimento('assumir TI-0042?'), null, 'atender: pergunta com código também é conversa')
igual(lerAtendimentoNoAviso('resolvido. Troquei o cabo, pode testar.')?.texto, 'Troquei o cabo, pode testar.', 'no aviso: "resolvido" e a solução')
igual(lerAtendimentoNoAviso('resolver: troquei o cabo')?.acao, 'resolver', 'no aviso: "resolver:" com os dois-pontos')
igual(lerAtendimentoNoAviso('resolver amanhã cedo'), null, 'no aviso: "resolver amanhã" é conversa')
igual(lerAtendimentoNoAviso('Resolvido, pode testar?'), null, 'no aviso: pergunta é conversa')
igual(lerAtendimentoNoAviso('transferir para Manutenção')?.acao, 'transferir', 'no aviso: "transferir para"')
igual(lerAtendimentoNoAviso('transferir não dá, é com a gente'), null, 'no aviso: "transferir" sem "para" é conversa')
igual(lerAtendimentoNoAviso('assumo')?.acao, 'assumir', 'no aviso: "assumo"')
igual(lerAtendimentoNoAviso('Já reiniciei o roteador'), null, 'no aviso: a resposta de sempre')
const transf = lerAtendimento('transferir TI-0042 para Manutenção: o ar pinga na sala dos servidores')
igual([transf?.acao, transf?.codigo], ['transferir', 'TI-0042'], 'atender: transferir com o código')
igual(lerTransferencia(transf?.texto ?? ''), { fila: 'Manutenção', motivo: 'o ar pinga na sala dos servidores' }, 'transferir: a equipe e o motivo')
igual(lerTransferencia('para a fila de TI'), { fila: 'TI', motivo: '' }, 'transferir: "a fila de" sai do nome')
igual(lerTransferencia('pra manutenção predial - é do ar-condicionado'), { fila: 'manutenção predial', motivo: 'é do ar-condicionado' }, 'transferir: o travessão separa o motivo')
igual(lerTransferencia(''), { fila: '', motivo: '' }, 'transferir: sem equipe (o bot mostra a lista)')
const cmdAdm = (t: string) => lerPedido(t, { pausado: false })
igual(cmdAdm('assumir TI-0042'), { comando: 'atender_chamado', resto: 'assumir TI-0042' }, 'pedido: assumir com código é comando')
igual(cmdAdm('resolver TI-0042: troquei o toner').comando, 'atender_chamado', 'pedido: resolver com código')
igual(cmdAdm('transferir TI-0042 para Manutenção').comando, 'atender_chamado', 'pedido: transferir com código')
igual(cmdAdm('resolver isso amanhã').comando, 'desconhecido', 'pedido: resolver sem código não é comando')
igual(cmdAdm('resolver o chamado').comando, 'chamados', 'pedido: "resolver o chamado" sem código segue o caminho de sempre')
igual(cmdAdm('como assumir um chamado').comando, 'ajuda', 'pedido: "como assumir" é dúvida')
igual(cmdAdm('chamado: resolver TI-0042 de novo, voltou').comando, 'abrir_chamado', 'pedido: "chamado:" continua abrindo chamado')
const pessoas = [{ id: 'a', nome: 'Ana Lima' }, { id: 'b', nome: 'Ana Souza' }, { id: 'c', nome: 'Bruno Anacleto' }, { id: 'd', nome: 'Carla Mendonça' }]
igual(acharPeloNome(pessoas, 'ana').map((p) => p.id), ['a', 'b', 'c'], 'achar: "ana" acha quem tem uma palavra começando assim')
igual(acharPeloNome(pessoas, 'ana li').map((p) => p.id), ['a'], 'achar: "ana li" acha a Ana Lima')
igual(acharPeloNome(pessoas, 'ANA LIMA').map((p) => p.id), ['a'], 'achar: o nome inteiro, em maiúsculas')
igual(acharPeloNome(pessoas, 'mendonca').map((p) => p.id), ['d'], 'achar: sem acento acha com acento')
igual(acharPeloNome(pessoas, 'xyz'), [], 'achar: ninguém')
igual(acharPeloNome(pessoas, '  '), [], 'achar: nada escrito, nada achado')
const filas = [{ id: 'ti', nome: 'TI', apelidos: ['TI'] }, { id: 'man', nome: 'Manutenção', apelidos: ['MAN'] }, { id: 'mkt', nome: 'Marketing', apelidos: ['MKT'] }]
igual(acharPeloNome(filas, 'man').map((f) => f.id), ['man'], 'achar: o prefixo da fila vem sozinho')
igual(acharPeloNome(filas, 'ma').map((f) => f.id), ['man', 'mkt'], 'achar: começo do nome acha as duas')
igual(acharPeloNome(filas, 'manutenção').map((f) => f.id), ['man'], 'achar: o nome com acento')
const confResolver = textoDaConferenciaDoChamado({ acao: 'resolver', codigo: 'TI-0042', titulo: 'Impressora sem *toner*', nota: 'Troquei o toner.\nTestei a impressão.' })
contem(confResolver, 'Marcar *TI-0042* · Impressora sem toner como *resolvido*', 'conferência de resolver: o chamado, sem a marcação do título')
contem(confResolver, '> Troquei o toner.\n> Testei a impressão.', 'conferência de resolver: a solução citada')
contem(confResolver, 'com *confirmo*', 'conferência de resolver: pede o confirmo')
igual(confResolver.includes('Era só uma mensagem'), false, 'conferência de resolver pelo comando: sem o lembrete')
const confDoAviso = textoDaConferenciaDoChamado({ acao: 'resolver', codigo: 'TI-0042', titulo: 't'.repeat(200), nota: 'n'.repeat(5000), doAviso: true })
contem(confDoAviso, 'Era só uma mensagem para quem abriu?', 'conferência de resolver pelo aviso: lembra que podia ser só uma mensagem')
igual(objetoInterativo(confDoAviso, BOTOES_DA_CONFERENCIA)?.type, 'button', 'conferência de resolver pelo aviso, longa: ainda cabe nos botões')
igual(objetoInterativo(confResolver, BOTOES_DA_CONFERENCIA)?.type, 'button', 'conferência de resolver: cabe nos botões')
const confTransferir = textoDaConferenciaDoChamado({ acao: 'transferir', codigo: 'TI-0042', titulo: 'Ar pingando', de: 'TI', para: 'Manutenção', assunto: 'Ar-condicionado', motivo: 'É do ar, não da rede.' })
contem(confTransferir, 'de *TI* para *Manutenção* (assunto: Ar-condicionado)', 'conferência de transferir: de onde, para onde e o assunto')
contem(confTransferir, 'código novo', 'conferência de transferir: avisa do código novo')
igual(objetoInterativo(textoDaConferenciaDoChamado({ acao: 'resolver', codigo: 'TI-0042', titulo: 't'.repeat(200), nota: 'n'.repeat(5000) }), BOTOES_DA_CONFERENCIA)?.type, 'button', 'conferência de resolver longa: ainda cabe (solução cortada)')
const meusEDaFila = textoDosChamados({
  chamados: [{ id: 'c1', codigo: 'TI-0042', titulo: 'Sem internet', situacao: 'Em atendimento · com você' }], total: 1, urlBase: 'https://p',
  daFila: { chamados: [{ id: 'c2', codigo: 'TI-0043', titulo: 'Mouse', situacao: 'Novo · sem responsável' }], total: 1 },
})
contem(meusEDaFila, '*Na fila que você atende*, 1 chamado aberto:\n\n*TI-0043* · Mouse\n_Novo · sem responsável_ · https://p/chamados/c2', '5 de quem atende: a fila depois dos dele')
contem(meusEDaFila, DICA_DO_ATENDIMENTO, '5 de quem atende: como assumir, resolver e transferir')
const soDaFila = textoDosChamados({ chamados: [], total: 0, urlBase: 'https://p', daFila: { chamados: Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, codigo: `TI-00${i}`, titulo: 't', situacao: 'Novo' })), total: 12 } })
contem(soDaFila, 'Você não tem chamados abertos.\n\n*Na fila que você atende*, 12 abertos. Os 5 primeiros:', '5 de quem atende: só a fila, cortada em 5')
contem(textoDosChamados({ chamados: [], total: 0, urlBase: 'https://p', daFila: { chamados: [], total: 0 } }), 'a fila que você atende está em dia', '5 de quem atende: nada em aberto')
igual(textoDosChamados({ chamados: [], total: 0, urlBase: 'https://p' }).includes('fila'), false, '5 de quem não atende: como sempre')
const filaFalhou = textoDosChamados({ chamados: [], total: 0, urlBase: 'https://p', daFila: { chamados: [], total: 0, falhou: true } })
contem(filaFalhou, 'não carregou agora', '5 de quem atende: a fila que não carregou não é "em dia"')
igual(filaFalhou.includes('em dia'), false, '5 de quem atende: sem o "em dia" quando a fila não carregou')
contem(TEXTO_SEM_ACAO_PELO_WHATSAPP, 'atender chamados, registrar visitas', 'verificação em duas etapas: atender e registrar visita ficam no Palácio')

// ---------------------------------------------------------------- portaria (as visitas de hoje e registrar quem chegou)
igual(cmdAdm('portaria'), { comando: 'portaria', resto: '' }, 'portaria: a lista')
igual(cmdAdm('Quem está aqui?').comando, 'portaria', 'portaria: "quem está aqui"')
igual(cmdAdm('visitantes').comando, 'portaria', 'portaria: "visitantes" é a lista')
igual(cmdAdm('a portaria ligou para mim').comando, 'desconhecido', 'portaria: no meio da frase não roda nada')
igual(cmdAdm('Visitante: João da Silva'), { comando: 'registrar_visita', resto: 'João da Silva' }, 'portaria: visitante e o nome')
igual(cmdAdm('visitante'), { comando: 'registrar_visita', resto: '' }, 'portaria: visitante sem o nome (o bot pergunta)')
igual(cmdAdm('registrar visita'), { comando: 'registrar_visita', resto: '' }, 'portaria: registrar visita')
igual(cmdAdm('novo visitante - Maria   Souza'), { comando: 'registrar_visita', resto: 'Maria Souza' }, 'portaria: novo visitante')
igual(cmdAdm('chamado: a portaria está sem luz').comando, 'abrir_chamado', 'portaria: "chamado:" continua abrindo chamado')
igual(cmdAdm('como registrar um visitante').comando, 'ajuda', 'portaria: "como registrar" é dúvida')
igual(situacaoDaVisitaNaLista({ entrada_em: null, visitado_id: null, resposta: null }), 'Chegou pelo QR: falta confirmar a entrada', 'situação: cadastro do QR')
igual(situacaoDaVisitaNaLista({ entrada_em: '2026-10-18T13:00:00Z', visitado_id: null, resposta: null }), 'Na filial (ninguém foi avisado)', 'situação: só o setor')
igual(situacaoDaVisitaNaLista({ entrada_em: '2026-10-18T13:00:00Z', visitado_id: 'u1', resposta: null }), 'Esperando a resposta', 'situação: esperando')
igual(situacaoDaVisitaNaLista({ entrada_em: '2026-10-18T13:00:00Z', visitado_id: 'u1', resposta: 'aguardar' }), 'Aguarde na recepção', 'situação: a resposta')
contem(textoDaPortaria({ visitas: [], total: 0, urlBase: 'https://p', registra: true }), 'Nenhuma visita aberta hoje', 'portaria: dia vazio')
const listaDaPortaria = textoDaPortaria({ visitas: [{ nome: 'João *Silva*', para: 'Ana Lima', hora: '14:05', situacao: 'Pode subir' }, { nome: 'Maria', para: '', hora: '13:40', situacao: 'Chegou pelo QR: falta confirmar a entrada' }], total: 2, urlBase: 'https://p', registra: true })
contem(listaDaPortaria, '*2 visitas* abertas hoje na portaria:', 'portaria: a contagem')
contem(listaDaPortaria, '• 14:05 – *João Silva* → Ana Lima\n   _Pode subir_', 'portaria: hora, nome, para quem e situação')
contem(listaDaPortaria, '• 13:40 – *Maria*\n', 'portaria: sem para quem, sem a seta')
contem(listaDaPortaria, '*visitante:* e o nome', 'portaria: ensina a registrar')
igual(textoDaPortaria({ visitas: [], total: 0, urlBase: 'https://p', registra: false }).includes('visitante:'), false, 'portaria: com a verificação em duas etapas, não ensina a registrar')
contem(textoDaPortaria({ visitas: Array.from({ length: 12 }, (_, i) => ({ nome: `V${i}`, para: '', hora: '10:00', situacao: 's' })), total: 12, urlBase: 'https://p', registra: true }), 'As 10 mais recentes', 'portaria: corta em 10')
igual(lerSetorDaVisita('setor: Financeiro'), 'Financeiro', 'visita: setor com dois-pontos')
igual(lerSetorDaVisita('Setor   de compras'), 'de compras', 'visita: setor sem dois-pontos')
igual(lerSetorDaVisita('setorial'), null, 'visita: "setorial" não é setor')
igual(lerSetorDaVisita('setor:'), null, 'visita: setor vazio')
igual(lerSetorDaVisita('Ana'), null, 'visita: nome não é setor')
contem(textoPedeVisitado('João'), '*setor:*', 'visita: a pergunta de para quem ensina o setor')
const confVisita = textoDaConferenciaDaVisita({ nome: 'João Silva', pessoa: { nome: 'Ana Lima', setor: 'Comunicação' }, setor: null, motivo: 'Reunião' })
contem(confVisita, 'Registrar a entrada de *João Silva*?', 'conferência da visita: quem chegou')
contem(confVisita, 'Para: *Ana Lima* (Comunicação), que recebe o aviso', 'conferência da visita: para quem, avisada')
contem(confVisita, 'Motivo: Reunião', 'conferência da visita: o motivo')
igual(objetoInterativo(confVisita, BOTOES_DA_CONFERENCIA)?.type, 'button', 'conferência da visita: cabe nos botões')
contem(textoDaConferenciaDaVisita({ nome: 'João', pessoa: null, setor: 'Financeiro', motivo: null }), 'Para: Financeiro (ninguém é avisado).', 'conferência da visita: só o setor')
igual(BOTOES_DOS_DETALHES.tipo === 'botoes' && ehPular(BOTOES_DOS_DETALHES.botoes[0].id), true, 'motivo da visita: o botão Pular pula')

// O menu de quem tem a portaria e atende uma fila: a linha da portaria, o 5 com a fila e a lista que ainda cabe.
const menuCompleto = textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', portaria: true, atende: true })
contem(menuCompleto, '*portaria* para as visitas de hoje e registrar quem chegou', 'menu: a linha da portaria')
contem(menuCompleto, '*5* – seus chamados e os da fila que você atende', 'menu: o 5 de quem atende')
igual(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p' }).includes('*portaria*'), false, 'menu sem a portaria: sem a linha')
const listaCompleta = interativoDoMenu({ pausado: false, portaria: true, atende: true, admin: true })
igual(linhasDoMenu(listaCompleta).map((l) => lerPedido(l.id, { pausado: false, admin: true }).comando), ['avisos', 'lidas', 'parar', 'agenda', 'chamados', 'aprovacoes', 'portaria', 'status', 'fila'], 'menu em lista: a portaria depois do 6')
const menuMaisLongoDeTodos = `_Não entendi. Este número responde só às opções abaixo; mensagens soltas não chegam a ninguém._\n\n${textoDoMenu({ nome: 'Maria Aparecida', pausado: true, urlBase: 'https://palacio.cruzvermelhario.org.br', admin: true, portaria: true, atende: true })}`
igual(objetoInterativo(menuMaisLongoDeTodos, interativoDoMenu({ pausado: true, admin: true, portaria: true, atende: true }))?.type, 'list', 'menu com tudo, pausado e com "não entendi": ainda cabe no corpo de 1024')

// ---------------------------------------------------------------- "Não fui eu" (lib/whatsapp/protecao.ts)
const comNaoFuiEu = textoDeSeguranca({ titulo: 'Novo acesso', texto: 'Linha.', naoFuiEu: true })
contem(comNaoFuiEu, `_${LINHA_DO_NAO_FUI_EU}_`, 'segurança: ensina a responder NÃO FUI EU')
contem(comNaoFuiEu, 'Responda *NÃO FUI EU* se não foi você', 'segurança: a frase pedida')
igual(ofereceNaoFuiEu(comNaoFuiEu), true, 'segurança: a entrega reconhece o aviso que oferece (pelo texto, também na fila)')
igual(ofereceNaoFuiEu(textoDeSeguranca({ titulo: 'Senha alterada', texto: 'Linha.' })), false, 'segurança: sem a linha, sem botão nem marca')
igual(comNaoFuiEu.endsWith('por aqui ou por telefone._'), true, 'segurança: o rodapé continua no fim')
igual(ofereceNaoFuiEu(textoDeSeguranca(AVISO_AO_NUMERO_ANTIGO)), true, 'número antigo: oferece o NÃO FUI EU (é por ele que a pessoa derruba quem trocou o número)')
igual(objetoInterativo(comNaoFuiEu, BOTAO_DO_NAO_FUI_EU)?.type, 'button', 'segurança: o botão cabe')
igual(BOTAO_DO_NAO_FUI_EU.tipo === 'botoes' && ehNaoFuiEu(BOTAO_DO_NAO_FUI_EU.botoes[0].id), true, 'segurança: o toque no botão é o NÃO FUI EU digitado')
igual(MARCA_DO_NAO_FUI_EU.length <= 40, true, 'segurança: a marca cabe no registro')
for (const t of ['não fui eu', 'NÃO FUI EU!', 'Nao foi eu', 'não fui eu não', 'Não reconheço']) igual(ehNaoFuiEu(t), true, `"não fui eu": ${t}`)
for (const t of ['fui eu', 'não', 'eu não fui na reunião', 'confirmo', '']) igual(ehNaoFuiEu(t), false, `não é "não fui eu": ${t}`)
igual(avisoOfereceNaoFuiEu({ tipo: 'conta_bloqueada', lugar: 'Rio' }), true, 'oferece: bloqueio')
igual(avisoOfereceNaoFuiEu({ tipo: 'senha_alterada', como: 'propria' }), true, 'oferece: senha trocada pela pessoa')
igual(avisoOfereceNaoFuiEu({ tipo: 'senha_alterada', como: 'link' }), true, 'oferece: senha trocada pelo link')
igual(avisoOfereceNaoFuiEu({ tipo: 'senha_alterada', como: 'admin', adminNome: 'M' }), false, 'não oferece: senha trocada pela administração')
igual(avisoOfereceNaoFuiEu({ tipo: 'verificacao_removida', porAdmin: 'M' }), false, 'não oferece: verificação tirada pela administração')
igual(avisoOfereceNaoFuiEu({ tipo: 'verificacao_removida' }), true, 'oferece: verificação tirada pela pessoa')
igual(avisoOfereceNaoFuiEu({ tipo: 'conta_desativada', adminNome: 'M' }), false, 'não oferece: conta desativada')
igual(avisoOfereceNaoFuiEu({ tipo: 'papel_alterado', de: 'a', para: 'b', adminNome: 'M' }), false, 'não oferece: papel mudado')
const encerradas = avisoDe({ tipo: 'sessoes_encerradas' })
contem(encerradas.assunto, 'sessões da sua conta', 'e-mail do "não fui eu": o assunto')
contem(encerradas.texto, 'A sua senha não mudou e a conta continua ativa', 'e-mail do "não fui eu": não troca a senha nem desativa')
contem(avisoDe({ tipo: 'sessoes_encerradas', numeroAntigo: true }).texto, 'do número que a conta usava antes', 'e-mail do "não fui eu": veio do número antigo')
const conferenciaDaProtecao = textoDaConferenciaDoNaoFuiEu({ daConta: true })
contem(conferenciaDaProtecao, '*todas as sessões*', 'conferência do "não fui eu": o que vai acontecer')
contem(conferenciaDaProtecao, 'A senha não muda e a conta continua ativa', 'conferência do "não fui eu": o que não acontece')
contem(conferenciaDaProtecao, '*confirmo*', 'conferência do "não fui eu": pede o confirmo')
igual(objetoInterativo(conferenciaDaProtecao, BOTOES_DA_CONFERENCIA)?.type, 'button', 'conferência do "não fui eu": cabe nos botões')
igual(/\bsua\b/.test(textoDaConferenciaDoNaoFuiEu({ daConta: false })), false, 'conferência do número antigo: sem "sua" (o número pode já ser de outra pessoa)')
contem(textoDoNaoFuiEuFeito({ daConta: true }), 'Esqueci minha senha', 'feito: o próximo passo é a senha')
igual(/sua conta|seu e-mail/.test(textoDoNaoFuiEuFeito({ daConta: false })), false, 'feito, do número antigo: sem "sua conta" nem "seu e-mail"')

// ---------------------------------------------------------------- confirmar no Palácio, decisões do Financeiro e desativar conta
igual(CONFIRMACAO_VALE_MIN, 15, 'o link de confirmar vale 15 minutos')
const linkDeConfirmar = textoDoLinkDeConfirmacao({ oQue: 'Aprovar?', url: 'https://p/confirmar/abc' })
contem(linkDeConfirmar, 'Confirme no Palácio: https://p/confirmar/abc', 'link de confirmar: a frase e o endereço')
contem(linkDeConfirmar, 'vale por 15 minutos e uma vez só', 'link de confirmar: as regras')
igual(cmdAdm('financeiro').comando, 'financeiro', 'financeiro: a lista')
igual(cmdAdm('Pendências financeiras').comando, 'financeiro', 'financeiro: "pendências financeiras" não são os avisos')
igual(cmdAdm('compras').comando, 'financeiro', 'financeiro: "compras"')
igual(cmdAdm('o financeiro ligou').comando, 'desconhecido', 'financeiro: no meio da frase não roda nada')
igual(cmdAdm('aprovar 2'), { comando: 'decidir_financeiro', resto: 'aprovar 2' }, 'financeiro: aprovar e o número')
igual(cmdAdm('recusar 1: acima do orçado').comando, 'decidir_financeiro', 'financeiro: recusar com motivo')
igual(cmdAdm('aprovar').comando, 'desconhecido', 'financeiro: aprovar sem número não é decisão (é o voto, respondendo ao aviso)')
igual(lerDecisaoFinanceira('aprovar 2'), { decisao: 'aprovar', n: 2, motivo: '' }, 'decisão: aprovar 2')
igual(lerDecisaoFinanceira('Aprovo o 3'), { decisao: 'aprovar', n: 3, motivo: '' }, 'decisão: aprovo o 3')
igual(lerDecisaoFinanceira('recusar 2: valor   acima do orçado'), { decisao: 'recusar', n: 2, motivo: 'valor acima do orçado' }, 'decisão: recusar com dois-pontos')
igual(lerDecisaoFinanceira('recusa 10 fornecedor sem nota'), { decisao: 'recusar', n: 10, motivo: 'fornecedor sem nota' }, 'decisão: recusa sem dois-pontos')
igual(lerDecisaoFinanceira('aprovar 2: entregar até sexta'), { decisao: 'aprovar', n: 2, motivo: 'entregar até sexta' }, 'decisão: aprovar com observação')
igual(lerDecisaoFinanceira('aprovar 0'), null, 'decisão: zero não é item')
igual(lerDecisaoFinanceira('aprovar 2x'), null, 'decisão: número colado em texto não é item')
igual(lerDecisaoFinanceira('aprovar a matéria'), null, 'decisão: sem número, não')
igual(lerDecisaoFinanceira('aprovado 2'), null, 'decisão: "aprovado" não é o verbo')
const despesa: ItemParaDecidir = { tipo: 'despesa', titulo: 'Conta de luz *junho*', valor: 1234.5, fornecedor: 'Light S.A.', quem: 'Ana Lima', link: '/financeiro/l1' }
const compra: ItemParaDecidir = { tipo: 'compra', titulo: 'Notebooks', valor: 8900, fornecedor: 'Loja X', quem: 'João', codigo: 'PC-2026-0012', papel: 'diretoria', link: '/financeiro/compras/p1' }
const decisoes = textoDasDecisoes({ itens: [despesa, compra], total: 2, urlBase: 'https://p' })
contem(decisoes, '*2 decisões* esperam por você:', 'decisões: a contagem')
contem(decisoes, '*1.* Despesa · *R$', 'decisões: o número e o valor')
contem(decisoes, 'Conta de luz junho — Light S.A.\n_Lançada por Ana Lima_', 'decisões: descrição, favorecido e quem lançou (sem a marcação de quem escreveu)')
contem(decisoes, '*2.* Compra PC-2026-0012 · *R$', 'decisões: a compra com o número do pedido')
contem(decisoes, '_(pela Diretoria)_', 'decisões: a vez da Diretoria aparece')
contem(decisoes, '*aprovar 1* ou *recusar 1:*', 'decisões: como decidir')
igual(decisoes.includes('https://p/financeiro'), false, 'decisões: com a pergunta guardada, sem os links')
contem(textoDasDecisoes({ itens: [despesa], total: 1, urlBase: 'https://p', comLinks: true }), 'https://p/financeiro/l1', 'decisões sem a migração: o link de cada item')
igual(textoDasDecisoes({ itens: [despesa], total: 1, urlBase: 'https://p', comLinks: true }).includes('aprovar 1'), false, 'decisões sem a migração: sem o "aprovar 1"')
contem(textoDasDecisoes({ itens: [], total: 0, urlBase: 'https://p' }), 'Nada espera a sua decisão', 'decisões: nada esperando')
contem(textoDasDecisoes({ itens: Array.from({ length: 12 }, () => despesa), total: 12, urlBase: 'https://p' }), `As ${DECISOES_NA_RESPOSTA} primeiras`, 'decisões: corta a lista')
const recusa = oQueDaDecisao(despesa, { decisao: 'recusar', n: 1, motivo: 'sem nota fiscal' })
contem(recusa, 'Recusar a despesa *Conta de luz junho*, de R$', 'decisão: recusar diz qual e quanto')
contem(recusa, 'Motivo:\n> sem nota fiscal', 'decisão: o motivo citado')
contem(oQueDaDecisao(compra, { decisao: 'aprovar', n: 2, motivo: '' }), 'Aprovar pela Diretoria a compra *PC-2026-0012* (Notebooks)', 'decisão: a compra pela Diretoria')
const menuDoFinanceiro = textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', financeiro: true })
contem(menuDoFinanceiro, '*financeiro* para decidir despesas e compras', 'menu: a linha do financeiro')
igual(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p' }).includes('*financeiro*'), false, 'menu de quem não decide: sem a linha')
const listaComTudo = interativoDoMenu({ pausado: false, portaria: true, atende: true, admin: true, financeiro: true })
igual(linhasDoMenu(listaComTudo).map((l) => lerPedido(l.id, { pausado: false, admin: true }).comando), ['avisos', 'lidas', 'parar', 'agenda', 'chamados', 'aprovacoes', 'portaria', 'financeiro', 'status', 'fila'], 'menu em lista: o financeiro depois da portaria (10 linhas, o teto)')
const menuMaisLongoComFinanceiro = `_Não entendi. Este número responde só às opções abaixo; mensagens soltas não chegam a ninguém._\n\n${textoDoMenu({ nome: 'Maria Aparecida', pausado: true, urlBase: 'https://palacio.cruzvermelhario.org.br', admin: true, portaria: true, atende: true, financeiro: true })}`
igual(objetoInterativo(menuMaisLongoComFinanceiro, listaComTudo)?.type, 'list', 'menu com tudo e o financeiro, pausado e com "não entendi": ainda cabe no corpo de 1024')
igual(lerPedido('desativar conta: Ana Lima', { pausado: false, admin: true, usuarios: true }), { comando: 'desativar_conta', resto: 'Ana Lima' }, 'desativar: quem gerencia usuários')
igual(lerPedido('desativar conta: Ana Lima', { pausado: false }).comando, 'parar', 'desativar: para os outros, "desativar" continua pausando os avisos')
igual(lerPedido('desativar', { pausado: false, usuarios: true }).comando, 'parar', 'desativar sozinho: pausa os avisos, mesmo para quem gerencia usuários')
igual(lerDesativarConta('desativar o acesso do ana.lima'), 'ana.lima', 'desativar: o acesso do usuário')
igual(lerDesativarConta('Desativar conta da Daniela Souza'), 'Daniela Souza', 'desativar: conta da')
igual(lerDesativarConta('desativar conta Daniel'), 'Daniel', 'desativar: o nome que começa com "da" não vira preposição')
igual(lerDesativarConta('desativar conta'), '', 'desativar: sem o nome (o bot pergunta)')
igual(lerDesativarConta('desativar avisos'), null, 'desativar avisos não é desativar conta')
contem(oQueDaDesativacao({ nome: 'Ana Lima', usuario: 'ana.lima', papel: 'Editor' }), 'Desativar o acesso de *Ana Lima* (ana.lima, Editor)?', 'desativar: quem e o papel')
contem(textoDeQuemDesativar([{ nome: 'Ana Lima', usuario: 'ana.lima' }, { nome: 'Ana Souza', usuario: 'ana.souza' }]), '• Ana Souza (ana.souza)', 'desativar: a lista com os usuários')
contem(textoDeNinguemParaDesativar('Zé'), 'Não achei ninguém ativo na equipe com “Zé”', 'desativar: ninguém')
contem(oQueDoVoto({ titulo: 'Matéria', decisao: 'approved', nota: '' }), 'A conferência do setor aparece no Palácio', 'voto pelo link: a conferência fica na tela')
contem(oQueDoVoto({ titulo: 'Matéria', decisao: 'changes_requested', nota: 'trocar a foto' }), 'Pedir ajustes em *Matéria*?\n\n> trocar a foto', 'voto pelo link: os ajustes citados')
contem(TEXTO_SEM_ACAO_PELO_WHATSAPP, 'link para confirmar no Palácio', 'verificação em duas etapas: o voto e as decisões vêm com o link')

// ---------------------------------------------------------------- cota diária de conversas iniciadas
igual(COTA_DE_CONVERSAS, { teto: 250, reserva: 30 }, 'cota: o TIER_250 da Meta, com 30 de reserva')
igual(limiteDaCota(), 220, 'cota: o que pode esperar espera a partir de 220')
igual(limiteDaCota(1000, 30), 970, 'cota: o teto sobe, o limite acompanha')
igual(limiteDaCota(20, 30), 0, 'cota: reserva maior que o teto não fica negativa')
igual(prioridadeNaCota({ tipo: 'seguranca' }), 'alta', 'cota: segurança da conta não espera')
igual(prioridadeNaCota({ tipo: 'codigo' }), 'alta', 'cota: código não espera')
igual(prioridadeNaCota({ tipo: 'bot' }), 'alta', 'cota: resposta do bot não espera')
igual(prioridadeNaCota({ tipo: 'teste' }), 'alta', 'cota: teste não espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'portaria' }), 'alta', 'cota: portaria (o visitante está na porta) não espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'auditoria' }), 'alta', 'cota: alerta de acesso e da trilha não espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'integracoes' }), 'alta', 'cota: alerta de integração não espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'chamados' }), 'baixa', 'cota: aviso comum espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'voluntariado' }), 'baixa', 'cota: anúncio aos voluntários espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'conta' }), 'baixa', 'cota: convite de acesso espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'equipe' }), 'baixa', 'cota: convite da ficha espera')
igual(prioridadeNaCota({ tipo: 'aviso', categoria: 'aprovacoes' }), 'baixa', 'cota: pedido de documentos ao candidato espera')
igual(prioridadeNaCota({ tipo: 'aviso' }), 'baixa', 'cota: aviso sem categoria espera')
const naCota = { prioridade: 'baixa' as const, janelaAberta: false, jaContado: false }
igual(esperaPelaCota({ ...naCota, usadas: 219 }), false, 'cota: abaixo do limite, sai')
igual(esperaPelaCota({ ...naCota, usadas: 220 }), true, 'cota: no limite, o que pode esperar espera')
igual(esperaPelaCota({ ...naCota, usadas: 260 }), true, 'cota: acima do teto, espera')
igual(esperaPelaCota({ ...naCota, usadas: 240, prioridade: 'alta' }), false, 'cota: o que não espera sai mesmo no limite')
igual(esperaPelaCota({ ...naCota, usadas: 240, janelaAberta: true }), false, 'cota: quem escreveu nas últimas 24 h não abre conversa nova')
igual(esperaPelaCota({ ...naCota, usadas: 240, jaContado: true }), false, 'cota: quem já foi contado hoje não conta de novo')
igual(esperaPelaCota({ ...naCota, usadas: null }), false, 'cota: sem a contagem (antes da migração), nada espera')
igual(esperaPelaCota({ ...naCota, usadas: 50, limite: 50 }), true, 'cota: limite informado')
// 12h em SP: volta 24 h depois. 23h em SP: 24 h depois é 23h de novo (silêncio), então espera as 7h.
igual(fimDaEsperaDaCota(new Date('2026-10-18T15:00:00Z')).toISOString(), '2026-10-19T15:00:00.000Z', 'cota: tenta de novo 24 h depois')
igual(fimDaEsperaDaCota(new Date('2026-10-18T02:00:00Z')).toISOString(), '2026-10-19T10:00:00.000Z', 'cota: 24 h depois cai no silêncio, sai às 7h')
igual(textoDaCota(37), '37 de 250', 'cota: o texto do status')
contem(textoDaCota(220), '220 de 250 – no limite', 'cota: no limite, o status diz')
igual(textoDaCota(null), 'não deu para ler agora', 'cota: sem a contagem')
contem(TEXTO_DA_ESPERA_DA_COTA, 'amanhã', 'cota: o recado do convite que ficou para o dia seguinte')

// ---------------------------------------------------------------- alertas de integrações (lib/integracoes/alertas-regras.ts)
igual(CATEGORIAS.includes('integracoes'), true, 'integrações: a categoria existe')
igual(categoriaVaiPorWhatsapp('integracoes'), true, 'integrações: o alerta vai pelo WhatsApp (o de queda do WhatsApp, não)')
contem(ROTULO_DA_CATEGORIA.integracoes.exemplos, 'Só para a administração', 'integrações: o rótulo nas preferências')
igual(lerCategoriasDoWhatsapp({}).integracoes, true, 'integrações: ligada por padrão no WhatsApp')
igual(ALERTA_DE_INTEGRACAO_A_CADA_HORAS, 6, 'integrações: um alerta a cada 6 h')
const agoraDaIntegracao = new Date('2026-10-18T12:00:00Z')
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: null, agora: agoraDaIntegracao }), true, 'integrações: primeiro alerta sai')
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: '2026-10-18T10:00:00Z', agora: agoraDaIntegracao }), false, 'integrações: outro em menos de 6 h não sai')
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: '2026-10-18T06:00:00Z', agora: agoraDaIntegracao }), true, 'integrações: 6 h depois, sai de novo')
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: '2099-01-01T00:00:00Z', agora: agoraDaIntegracao }), true, 'integrações: marco com data futura não cala o alerta')
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: '2026-10-18T10:00:00Z', normalizadaEm: '2026-10-18T10:30:00Z', agora: agoraDaIntegracao }), true, 'integrações: normalizada depois do alerta, a falha nova avisa na hora')
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: '2026-10-18T10:30:00Z', normalizadaEm: '2026-10-18T10:00:00Z', agora: agoraDaIntegracao }), false, 'integrações: normalizada ANTES do alerta não reabre a janela')
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: '2026-10-18T10:00:00Z', normalizadaEm: '2099-01-01T00:00:00Z', agora: agoraDaIntegracao }), false, 'integrações: normalizada com data futura não vale')
{
  const gmail = alertasResolvidosPelaConexao('gmail', true)
  igual(gmail.integracoes, ['google_gmail', 'google_oauth'], 'reconexão do Gmail resolve a autorização e o cliente OAuth')
  igual(gmail.titulos.includes('O Google recusou o cliente OAuth'), true, 'título do cliente OAuth recusado na lista')
  igual(alertasResolvidosPelaConexao('ads', false).integracoes, ['google_ads'], 'Google Ads com cliente próprio não resolve o cliente do Gmail')
  igual(alertasResolvidosPelaConexao('ads', true).integracoes, ['google_ads', 'google_oauth'], 'Google Ads com o cliente do Gmail resolve os dois')
  igual(alertasResolvidosPelaConexao('drive', true).titulos.includes(textoDoAlertaDeIntegracao('google_drive', { motivo: 'servico' }).titulo), false, 'reconectar não resolve o Drive sem espaço')
  igual(integracaoDoTitulo('O Google recusou o cliente OAuth'), 'google_oauth', 'título → integração')
  igual(integracaoDoTitulo('O Google Drive do Palácio está sem espaço'), 'google_drive', 'título de outra variante → integração')
  igual(integracaoDoTitulo('Nova aprovação pedida'), null, 'aviso comum não é alerta de integração')
}
igual(alertaDeIntegracaoSai({ ultimoAlertaEm: 'lixo', agora: agoraDaIntegracao }), true, 'integrações: marco ilegível não cala o alerta')
igual([401, 403, 500, 503, 0, 422, 400].map((s) => motivoDaFalhaDoEmail(s)), ['chave', 'chave', 'servico', 'servico', 'servico', null, null], 'integrações: as falhas do Resend que alertam')
igual(motivoDaFalhaDoEmail(429, 'You have reached your daily email sending quota.'), 'servico', 'integrações: Resend sem cota no plano alerta')
igual(motivoDaFalhaDoEmail(429, 'Too many requests. You can only make 2 requests per second.'), null, 'integrações: chamadas demais por segundo passam sozinhas')
igual([null, 0, 401, 403, 404, 500, 412, 409, 400].map(motivoDaFalhaDoR2), ['servico', 'servico', 'chave', 'chave', 'chave', 'servico', null, null, null], 'integrações: as falhas do R2 que alertam')
for (const integracao of INTEGRACOES_ALERTADAS) {
  for (const motivo of ['chave', 'servico'] as const) {
    const a = textoDoAlertaDeIntegracao(integracao, { conta: 'x'.repeat(200), motivo })
    if (a.mensagem.length > 280) { falhas++; console.log(`FALHOU: alerta ${integracao}/${motivo} com ${a.mensagem.length} letras (notificar corta em 280)`) }
    if (!a.link.startsWith('/configuracoes/')) { falhas++; console.log(`FALHOU: alerta ${integracao} com link fora das Configurações: ${a.link}`) }
  }
}
contem(textoDoAlertaDeIntegracao('google_gmail', { conta: 'contato@cvb.org' }).mensagem, 'de contato@cvb.org foi revogada ou expirou', 'integrações: Google com a conta')
contem(textoDoAlertaDeIntegracao('google_admin').mensagem, 'da conta de administrador do Google foi revogada', 'integrações: Google de administrador sem a conta')
contem(textoDoAlertaDeIntegracao('resend', { motivo: 'chave' }).mensagem, 'RESEND_API_KEY', 'integrações: Resend com a chave recusada diz o que conferir')
igual(textoDoAlertaDeIntegracao('resend', { motivo: 'servico' }).mensagem.includes('RESEND_API_KEY'), false, 'integrações: Resend fora do ar não manda trocar a chave')
contem(textoDoAlertaDeIntegracao('r2', { motivo: 'chave' }).mensagem, 'R2_*', 'integrações: R2 com a credencial recusada diz o que conferir')
contem(textoDoAlertaDeIntegracao('claude', { motivo: 'chave' }).mensagem, 'ANTHROPIC_API_KEY', 'integrações: o assistente com a chave recusada diz o que conferir')
contem(textoDoAlertaDeIntegracao('claude', { motivo: 'modelo' }).mensagem, 'WHATSAPP_IA_MODELO', 'integrações: o assistente com o modelo inexistente diz a variável')
igual(textoDoAlertaDeIntegracao('claude', { motivo: 'modelo' }).mensagem.length <= 280 && textoDoAlertaDeIntegracao('claude', { motivo: 'modelo' }).link === '/configuracoes/whatsapp', true, 'integrações: o alerta do assistente cabe e leva ao cartão')

// ---------------------------------------------------------------- as outras áreas: os comandos
const operador = { pausado: false, frota: true }
igual(lerPedido('presença', { pausado: false }), { comando: 'presenca', resto: '' }, 'presença: a mensagem inteira')
igual(lerPedido('Chamada', { pausado: false }).comando, 'presenca', 'presença: "chamada"')
igual(lerPedido('marcar presença', { pausado: false }).comando, 'presenca', 'presença: "marcar presença"')
igual(lerPedido('a presença de ontem foi boa', { pausado: false }).comando === 'presenca', false, 'presença numa frase não é comando')
igual(lerPedido('veículos', { pausado: false }).comando, 'frota', 'frota: "veículos"')
igual(lerPedido('Frota', { pausado: false }).comando, 'frota', 'frota: "frota"')
igual(lerPedido('estoque luva', { pausado: false }), { comando: 'estoque', resto: 'luva' }, 'estoque: com o material')
igual(lerPedido('Estoque: álcool 70', { pausado: false }), { comando: 'estoque', resto: 'álcool 70' }, 'estoque: com dois-pontos')
igual(lerEstoque('estoque de máscaras'), 'máscaras', 'estoque: "de" não entra no material')
igual(lerEstoque('estoque dentifrício'), 'dentifrício', 'estoque: material que começa com "de" fica inteiro')
igual(lerEstoque('estoque'), '', 'estoque: sozinho (o bot pergunta o material)')
igual(lerEstoque('estoques da filial'), null, 'estoque: outra palavra não é comando')
// Nome de setor que é comando de área: com uma pergunta de texto livre aberta ("Onde é?"), é a resposta (lib/whatsapp/bot.ts).
for (const setor of ['Financeiro', 'Portaria', 'Chamada', 'Veículos', 'Estoque central', 'Compras', 'Visitantes', 'Ambulâncias']) {
  igual(COMANDOS_DE_AREA.has(lerPedido(setor, { pausado: false }).comando), true, `comando de área: "${setor}" responde a pergunta de texto livre`)
}
igual(COMANDOS_DE_AREA.has(lerPedido('menu', { pausado: false }).comando), false, 'comando de área: "menu" continua valendo com a pergunta aberta')
igual(lerPedido('saída ABC1D23', operador), { comando: 'saida_veiculo', resto: 'ABC1D23' }, 'saída: com a placa')
igual(lerPedido('Saída da ambulância 1', operador), { comando: 'saida_veiculo', resto: 'ambulância 1' }, 'saída: sem o artigo')
igual(lerPedido('registrar saída', operador), { comando: 'saida_veiculo', resto: '' }, 'saída: sem o veículo (o bot pergunta)')
igual(lerPedido('sair com a van', operador), { comando: 'saida_veiculo', resto: 'van' }, 'saída: "sair com"')
igual(lerPedido('sair', operador).comando, 'parar', 'saída: "sair" sozinho continua pausando os avisos')
igual(lerPedido('sair com a van', { pausado: false }).comando, 'parar', 'saída: para quem não opera a frota, "sair com…" continua pausando')
igual(lerPedido('saída ABC1D23', { pausado: false }).comando === 'saida_veiculo', false, 'saída: para quem não opera a frota, não é comando')
igual(lerPedido('retorno ABC-1D23', operador), { comando: 'retorno_veiculo', resto: 'ABC-1D23' }, 'retorno: com a placa')
igual(lerPedido('volta da ambulância 1', operador), { comando: 'retorno_veiculo', resto: 'ambulância 1' }, 'retorno: "volta da"')
igual(lerPedido('volta ABC1D23', operador), { comando: 'retorno_veiculo', resto: 'ABC1D23' }, 'retorno: "volta" e a placa')
igual(lerPedido('voltei com a van', operador), { comando: 'retorno_veiculo', resto: 'van' }, 'retorno: "voltei com"')
igual(lerPedido('registrar retorno', operador), { comando: 'retorno_veiculo', resto: '' }, 'retorno: sem o veículo')
igual(lerPedido('volta', operador).comando, 'voltar', 'retorno: "volta" sozinho continua retomando os avisos')
igual(lerPedido('volta a receber', operador).comando, 'voltar', 'retorno: "volta a receber" é retomar os avisos')
igual(lerPedido('voltar', operador).comando, 'voltar', 'retorno: "voltar" é retomar os avisos')
igual(lerPedido('volta da ambulância 1', { pausado: false }).comando, 'voltar', 'retorno: para quem não opera a frota, "volta…" retoma os avisos')
igual(lerViagem('voltei com'), null, 'retorno: "voltei com" sem o veículo não diz nada')
igual(lerViagem('volta com a van'), { acao: 'retorno', veiculo: 'van' }, 'retorno: "volta com a" e o veículo')
igual(lerViagem('Volta Redonda'), null, 'retorno: "volta" sem do/da/com nem placa não é retorno')
igual([pareceViagem('saída'), pareceViagem('retorno da van'), pareceViagem('menu'), pareceViagem('volta')], [true, true, false, false], 'diário de bordo: só a mensagem que parece dele lê o nível')

// ---------------------------------------------------------------- as outras áreas no menu
const menuDasAreas = textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', presenca: true, frota: 'operar', estoque: true })
contem(menuDasAreas, '*presença* para marcar quem veio na ação de hoje', 'menu: a linha da presença')
contem(menuDasAreas, '*veículos* para a frota; *saída* e *retorno* para o diário de bordo', 'menu: a linha da frota de quem opera')
contem(menuDasAreas, '*estoque* e o material, para o saldo', 'menu: a linha do estoque')
contem(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', frota: 'ver' }), '*veículos* para ver a frota', 'menu: quem só vê a frota não tem saída e retorno')
igual(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p' }).includes('*presença*'), false, 'menu de quem não coordena: sem a presença')
igual(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p', naoEntendi: true }).startsWith(TEXTO_NAO_ENTENDI), true, 'menu: o "não entendi" no começo')
const tudo = { admin: true, portaria: true, atende: true, financeiro: true, presenca: true, frota: 'operar' as const, estoque: true }
const menuDeTudo = textoDoMenu({ nome: 'Maria Aparecida', pausado: true, urlBase: 'https://palacio.cruzvermelhario.org.br', naoEntendi: true, ...tudo })
igual(menuDeTudo.length <= LIMITES_DO_INTERATIVO.corpo, true, `menu com todas as áreas, pausado e com "não entendi": cabe no corpo (${menuDeTudo.length})`)
igual(objetoInterativo(menuDeTudo, interativoDoMenu({ pausado: true, ...tudo }))?.type, 'list', 'menu com todas as áreas: sai como lista')
contem(menuDeTudo, 'Das suas áreas: *portaria*, *financeiro*, *presença*, *veículos*, *saída* ou *retorno*; *estoque* e o material.', 'menu com todas as áreas: numa linha só quando não cabe')
const menuDoAdminComTudo = textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://palacio.cruzvermelhario.org.br', ...tudo })
igual(menuDoAdminComTudo.length <= LIMITES_DO_INTERATIVO.corpo, true, 'menu de quem administra, com tudo: cabe no corpo')
contem(menuDoAdminComTudo, '*presença* para marcar quem veio', 'menu de quem administra, com tudo: cabe na forma longa')
const listaDasAreas = interativoDoMenu({ pausado: false, portaria: true, financeiro: true, presenca: true, frota: 'ver' })
igual(linhasDoMenu(listaDasAreas).map((l) => lerPedido(l.id, { pausado: false }).comando), ['avisos', 'lidas', 'parar', 'agenda', 'chamados', 'aprovacoes', 'portaria', 'financeiro', 'presenca', 'frota'], 'menu em lista: presença e veículos depois do financeiro, como o comando digitado')
const listaDeTudo = interativoDoMenu({ pausado: false, ...tudo })
igual(linhasDoMenu(listaDeTudo).length, LIMITES_DO_INTERATIVO.linhas, 'menu em lista com tudo: as 10 linhas, o teto')
igual(linhasDoMenu(listaDeTudo).map((l) => l.id).slice(-4), ['portaria', 'financeiro', 'status', 'fila'], 'menu em lista com tudo: as áreas que não cabem ficam no corpo')

// ---------------------------------------------------------------- ofícios: o aviso comum, sem assinar por aqui
igual(alvoDoLink(`/oficios/${id1}`), { tipo: 'oficio', id: id1 }, 'ofício: o aviso aponta o ofício')
igual(dicaDeResposta(`/oficios/${id1}`), null, 'ofício: o aviso não ensina a responder (nada se assina por aqui)')
igual(textoDoAviso({ urlBase: 'https://p', titulo: 'Ana pediu sua assinatura no ofício 012/2026', mensagem: 'Assunto: Parceria.', link: `/oficios/${id1}` }).includes('Para responder'), false, 'ofício: o aviso sai como os comuns')
contem(textoDoAviso({ urlBase: 'https://p', titulo: 'Ana pediu sua assinatura no ofício 012/2026', mensagem: 'Assunto: Parceria.', link: `/oficios/${id1}` }), `Abrir: https://p/oficios/${id1}`, 'ofício: o aviso leva o link para assinar no Palácio')
igual([categoriaVaiPorWhatsapp('oficios'), lerCategoriasDoWhatsapp({}).oficios], [true, true], 'ofício: o pedido de assinatura vai pelo WhatsApp (ligado por padrão)')
contem(textoDoOficioPeloWhatsapp('https://p/oficios/1'), 'não se assina pelo WhatsApp', 'ofício: a resposta ao aviso não assina')
contem(textoDoOficioPeloWhatsapp('https://p/oficios/1'), 'https://p/oficios/1', 'ofício: a resposta leva o link')

// ---------------------------------------------------------------- presença das ações
igual(lerMarcacaoDePresenca('1 3 4', 5), { presentes: [1, 3, 4], ausentes: [] }, 'presença: os números de quem veio')
igual(lerMarcacaoDePresenca('1, 3 e 4', 5), { presentes: [1, 3, 4], ausentes: [] }, 'presença: com vírgula e "e"')
igual(lerMarcacaoDePresenca('1 a 3', 5), { presentes: [1, 2, 3], ausentes: [] }, 'presença: faixa "1 a 3"')
igual(lerMarcacaoDePresenca('2-4', 5), { presentes: [2, 3, 4], ausentes: [] }, 'presença: faixa com hífen')
igual(lerMarcacaoDePresenca('1 até 2', 5), { presentes: [1, 2], ausentes: [] }, 'presença: faixa "até"')
igual(lerMarcacaoDePresenca('todos', 3), { presentes: [1, 2, 3], ausentes: [] }, 'presença: todos')
igual(lerMarcacaoDePresenca('Todos vieram!', 3), { presentes: [1, 2, 3], ausentes: [] }, 'presença: "todos vieram"')
igual(lerMarcacaoDePresenca('todo mundo', 2), { presentes: [1, 2], ausentes: [] }, 'presença: "todo mundo"')
igual(lerMarcacaoDePresenca('todos menos 3', 5), { presentes: [1, 2, 4, 5], ausentes: [3] }, 'presença: todos menos um (falta)')
igual(lerMarcacaoDePresenca('todos, exceto 2 e 4', 5), { presentes: [1, 3, 5], ausentes: [2, 4] }, 'presença: todos exceto dois')
igual(lerMarcacaoDePresenca('faltas 2 5', 5), { presentes: [], ausentes: [2, 5] }, 'presença: só faltas')
igual(lerMarcacaoDePresenca('não vieram 2', 5), { presentes: [], ausentes: [2] }, 'presença: "não vieram"')
igual(lerMarcacaoDePresenca('presentes 1 3, faltas 2', 5), { presentes: [1, 3], ausentes: [2] }, 'presença: as duas coisas juntas')
igual(lerMarcacaoDePresenca('todos faltaram', 2), { presentes: [], ausentes: [1, 2] }, 'presença: todos faltaram')
igual(lerMarcacaoDePresenca('1 e 1', 3), { presentes: [1], ausentes: [] }, 'presença: número repetido conta uma vez')
igual(lerMarcacaoDePresenca('2 não veio', 5), null, 'presença: "não veio" depois do número não chuta')
igual(lerMarcacaoDePresenca('6', 5), null, 'presença: número fora da lista')
igual(lerMarcacaoDePresenca('0', 5), null, 'presença: zero não é da lista')
igual(lerMarcacaoDePresenca('1 a 9', 5), null, 'presença: faixa que passa da lista')
igual(lerMarcacaoDePresenca('presentes 1 faltas 1', 3), null, 'presença: o mesmo número nos dois lados')
igual(lerMarcacaoDePresenca('oi, tudo bem?', 3), null, 'presença: conversa não marca nada')
igual(lerMarcacaoDePresenca('todos menos', 3), null, 'presença: "todos menos" sem o número')
igual(lerMarcacaoDePresenca('todos exceto a Ana', 3), null, 'presença: nome em vez do número não chuta')
igual(lerMarcacaoDePresenca('faltas', 3), null, 'presença: palavra sem número')
igual(lerMarcacaoDePresenca('', 3), null, 'presença: vazio')
igual(lerMarcacaoDePresenca(BOTOES_DA_CHAMADA.tipo === 'botoes' ? BOTOES_DA_CHAMADA.botoes[0].id : '', 4), { presentes: [1, 2, 3, 4], ausentes: [] }, 'presença: o toque em "Todos vieram"')
igual([horasNoTexto(4), horasNoTexto(2.5), horasNoTexto(0.25)], ['4 h', '2,5 h', '0,25 h'], 'presença: as horas no texto')
const textoDeChamada = textoDaChamada({ titulo: 'Ação na Central do Brasil', quando: 'sáb., 18 de out. · 08:00 às 12:00', horas: 4, inscritos: [{ nome: 'Ana Lima', situacao: 'presente' }, { nome: 'Bruno Costa', situacao: 'inscrito' }, { nome: 'Carla *Dias*', situacao: 'ausente' }] })
contem(textoDeChamada, '*Ação na Central do Brasil*\nsáb., 18 de out. · 08:00 às 12:00 · 3 inscritos', 'presença: a ação, quando e quantos')
contem(textoDeChamada, '*1* – Ana Lima _(presente)_\n*2* – Bruno Costa\n*3* – Carla Dias _(falta)_', 'presença: a lista numerada com o que já foi marcado, sem a formatação dos nomes')
contem(textoDeChamada, 'Cada presença lança 4 h no cadastro do voluntário', 'presença: as horas que cada presença lança')
igual(objetoInterativo(textoDeChamada, BOTOES_DA_CHAMADA)?.type, 'button', 'presença: a chamada sai com os botões')
const conferenciaDaPresenca = textoDaConferenciaDaPresenca({ titulo: 'Ação X', quando: 'hoje', presentes: ['Ana', 'Bruno'], ausentes: ['Carla'], horas: 4 })
contem(conferenciaDaPresenca, '*Presença (2):* Ana, Bruno – 4 h no cadastro de cada um.\n*Falta (1):* Carla', 'presença: a conferência diz quem fica com presença e quem fica com falta')
contem(conferenciaDaPresenca, '*confirmo*', 'presença: a conferência pede o confirmo')
igual(textoDaConferenciaDaPresenca({ titulo: 'Ação X', quando: 'hoje', presentes: [], ausentes: ['Carla'], horas: 4 }).includes('Presença ('), false, 'presença: só faltas, sem a linha da presença')
contem(textoDaPresencaMarcada({ titulo: 'Ação X', presentes: 2, ausentes: 1, horas: 4, falhas: [], link: 'https://p/v' }), 'Pronto: na *Ação X*, 2 presenças (4 h no cadastro de cada um) e 1 falta registradas.', 'presença: o resultado')
contem(textoDaPresencaMarcada({ titulo: 'Ação X', presentes: 1, ausentes: 0, horas: 4, falhas: [], link: 'https://p/v' }), '1 presença (4 h no cadastro de cada um) registrada.', 'presença: uma só, no singular')
const comFalha = textoDaPresencaMarcada({ titulo: 'Ação X', presentes: 0, ausentes: 0, horas: 4, falhas: [{ nome: 'Ana', motivo: 'Só quem está inscrito tem presença.' }], link: 'https://p/v' })
contem(comFalha, 'Nada foi marcado na *Ação X*.', 'presença: nada entrou')
contem(comFalha, 'Não deu para marcar:\n• Ana: Só quem está inscrito tem presença.', 'presença: o motivo do banco de cada recusa')
contem(textoSemAcaoHoje({ depois: [{ titulo: 'Plantão da tarde', hora: '14:00' }], urlBase: 'https://p' }), 'Mais tarde: Plantão da tarde (14:00).', 'presença: sem ação liberada, as que ainda vão começar')

// ---------------------------------------------------------------- frota
igual([lerHodometro('52.100'), lerHodometro('52100 km'), lerHodometro('')], [52100, 52100, null], 'frota: o hodômetro (o mesmo da tela)')
igual(Number.isNaN(lerHodometro('cinquenta mil')), true, 'frota: hodômetro que não é número')
const saidaCerta = { condutor_id: id1, km_saida: '52.100', destino: '  Maracanã  ', finalidade: 'evento', projeto_id: 'x' }
igual(pedidoDeSaida(id2, saidaCerta), { veiculo_id: id2, condutor_id: id1, km_saida: 52100, destino: 'Maracanã', finalidade: 'evento', projeto_id: '' }, 'frota: a saída como frota_sair recebe')
const motivoDaRecusa = (f: () => unknown) => { try { f(); return null } catch (e) { return e instanceof Error ? e.message : String(e) } }
igual(motivoDaRecusa(() => pedidoDeSaida(id2, { ...saidaCerta, condutor_id: '' })), 'Escolha quem vai dirigir.', 'frota: saída sem condutor')
igual(motivoDaRecusa(() => pedidoDeSaida(id2, { ...saidaCerta, finalidade: 'passeio' })), 'Escolha a finalidade.', 'frota: saída com finalidade que não existe')
igual(motivoDaRecusa(() => pedidoDeSaida(id2, { ...saidaCerta, destino: 'x' })), 'Diga para onde vai.', 'frota: saída sem destino')
igual(motivoDaRecusa(() => pedidoDeSaida(id2, { ...saidaCerta, km_saida: '' })), 'Informe o km do hodômetro.', 'frota: saída sem hodômetro')
igual(pedidoDeRetorno(id1, { km_retorno: '52.180', observacao: 'pneu baixo' }), { uso_id: id1, km_retorno: 52180, observacao: 'pneu baixo' }, 'frota: o retorno como frota_retornar recebe')
igual([nomeDoVeiculo({ apelido: 'Ambulância 1', placa: 'ABC1234' }), nomeDoVeiculo({ apelido: null, placa: 'ABC1D23' })], ['Ambulância 1 · ABC-1234', 'ABC1D23'], 'frota: o nome do veículo')
const frotaDeTeste = [
  { placa: 'ABC1D23', apelido: 'Ambulância 1', tipo: 'ambulancia', marca: null, modelo: null },
  { placa: 'XYZ1234', apelido: null, tipo: 'van', marca: 'Renault', modelo: 'Master' },
  { placa: 'KLM5E67', apelido: 'Ambulância 2', tipo: 'ambulancia', marca: null, modelo: null },
]
const placas = (busca: string) => acharVeiculo(frotaDeTeste, busca).map((v) => v.placa)
igual(placas('abc-1d23'), ['ABC1D23'], 'frota: acha pela placa, com hífen e minúscula')
igual(placas('1D23'), ['ABC1D23'], 'frota: acha pelo fim da placa')
igual(placas('XYZ-1234'), ['XYZ1234'], 'frota: placa antiga com hífen')
igual(placas('ambulância'), ['ABC1D23', 'KLM5E67'], 'frota: pelo tipo, todas')
igual(placas('amb 2'), ['KLM5E67'], 'frota: pelo apelido, em parte')
igual(placas('master'), ['XYZ1234'], 'frota: pelo modelo')
igual([placas(''), placas('caminhão')], [[], []], 'frota: nada escrito ou nada achado')
igual([lerHodometroDaConversa('mesmo', 52100), lerHodometroDaConversa('mesmo', null), lerHodometroDaConversa('52.180', null), lerHodometroDaConversa('muito', 1)], [52100, null, 52180, null], 'frota: o hodômetro na conversa ("mesmo" só na saída)')
const botoesDoKm = objetoInterativo('Qual o hodômetro?', botoesDoHodometro(152100))
igual(botoesDoKm?.type === 'button' ? botoesDoKm.action.buttons.map((b) => b.reply) : null, [{ id: 'mesmo', title: 'Manter 152.100 km' }, { id: 'cancelar', title: 'Cancelar' }], 'frota: o botão de manter o hodômetro cabe nos 20')
contem(textoPedeHodometro({ veiculo: 'Ambulância 1', acao: 'saida', km: 52100 }), 'O último registro é 52.100 km. Responda o número, *mesmo* para manter', 'frota: a pergunta do hodômetro na saída')
contem(textoPedeHodometro({ veiculo: 'Ambulância 1', acao: 'retorno', km: 52100 }), 'Saiu com 52.100 km', 'frota: a pergunta do hodômetro no retorno')
const listaDasFinalidades = interativoDaEscolha(FINALIDADES_NA_CONVERSA.map((f) => ({ nome: f })), { cancelar: 'Não registrar a saída' })
igual(listaDasFinalidades ? objetoInterativo('Qual é a finalidade?', listaDasFinalidades)?.type : null, 'list', 'frota: as finalidades cabem numa lista')
const conferenciaDaSaida = textoDaConferenciaDaSaida({ veiculo: 'Ambulância 1 · ABC1D23', condutor: 'João Souza', km: 52100, finalidade: 'atendimento', destino: 'Maracanã' })
contem(conferenciaDaSaida, 'Quem dirige: João Souza\nHodômetro na saída: 52.100 km\nFinalidade: Atendimento / emergência\nDestino: Maracanã', 'frota: a conferência da saída')
const conferenciaDoRetorno = textoDaConferenciaDoRetorno({ veiculo: 'Van', kmSaida: 52100, km: 52180, observacao: '', condutor: 'João', destino: 'Maracanã' })
contem(conferenciaDoRetorno, 'Viagem: João, para Maracanã\nHodômetro na chegada: 52.180 km (rodou 80 km)\nOcorrências: nenhuma', 'frota: a conferência do retorno')
contem(textoDoRetornoRegistrado({ veiculo: 'Van', kmRodado: 80, planos: [{ nome: 'Troca de óleo', km: 60000 }], link: 'https://p/f' }), 'Atenção: manutenção vencida nesta viagem – Troca de óleo (60.000 km). Quem opera a frota foi avisado.', 'frota: o retorno avisa a manutenção vencida')
igual(textoDoRetornoRegistrado({ veiculo: 'Van', kmRodado: 80, planos: [], link: 'https://p/f' }).includes('Atenção'), false, 'frota: sem manutenção vencida, sem o alerta')
const veiculosDeTeste = [
  { nome: 'Ambulância 1 · ABC1D23', tipo: 'ambulancia', km: 52100, situacao: 'ativo' },
  { nome: 'Van · XYZ-1234', tipo: 'van', km: 81000, situacao: 'ativo', uso: { condutor: 'João', destino: 'Maracanã', desde: 'dom, 18/10 às 08:15' } },
  { nome: 'Ambulância 2 · KLM5E67', tipo: 'ambulancia', km: 9000, situacao: 'manutencao' },
]
const frotaComOperador = textoDaFrota({ veiculos: veiculosDeTeste, urlBase: 'https://p', opera: true })
contem(frotaComOperador, '*Frota agora:* 1 disponível, 1 em viagem, 1 parado.', 'frota: o resumo')
contem(frotaComOperador, '*Disponíveis*\n• Ambulância 1 · ABC1D23 (Ambulância) – 52.100 km', 'frota: os disponíveis com o hodômetro')
contem(frotaComOperador, '*Em viagem*\n• Van · XYZ-1234 – João, para Maracanã, desde dom, 18/10 às 08:15', 'frota: os em viagem, com quem e para onde')
contem(frotaComOperador, '*Em manutenção ou fora de uso*\n• Ambulância 2 · KLM5E67 – em manutenção', 'frota: os parados')
contem(frotaComOperador, 'escreva *saída* ou *retorno* e o veículo', 'frota: quem opera aprende o diário de bordo')
igual(textoDaFrota({ veiculos: veiculosDeTeste, urlBase: 'https://p', opera: false }).includes('*saída*'), false, 'frota: quem só vê não aprende o diário de bordo')
contem(textoDaFrota({ veiculos: [], urlBase: 'https://p', opera: true }), 'Nenhum veículo cadastrado', 'frota: sem veículos')

// ---------------------------------------------------------------- estoque
const materiais = [
  { nome: 'Luva de procedimento M', codigo: 'EST-0012' }, { nome: 'Luva nitrílica G', codigo: 'EST-0013' },
  { nome: 'Álcool 70% 1L', codigo: 'EST-0020' }, { nome: 'Máscara N95', codigo: 'EST-0030' },
]
const codigos = (busca: string) => acharNoEstoque(materiais, busca).map((m) => m.codigo)
igual(codigos('luvas'), ['EST-0012', 'EST-0013'], 'estoque: o plural acha o singular')
igual(codigos('luva m'), ['EST-0012'], 'estoque: cada palavra começa uma palavra do nome')
igual(codigos('luva de procedimento'), ['EST-0012'], 'estoque: "de" não atrapalha')
igual([codigos('est-0020'), codigos('EST0020')], [['EST-0020'], ['EST-0020']], 'estoque: pelo código, com ou sem hífen')
igual(codigos('alcool'), ['EST-0020'], 'estoque: sem acento')
igual(codigos('máscaras'), ['EST-0030'], 'estoque: plural com acento')
igual(codigos('álcool em gel'), [], 'estoque: palavra que não está no nome não acha')
const luva: MaterialNoSaldo = { id: 'm1', nome: 'Luva de procedimento M', codigo: 'EST-0012', unidade: 'cx', saldo: 340, minimo: 100, locais: [{ nome: 'Almoxarifado', quantidade: 300 }, { nome: 'Base Centro', quantidade: 40 }], validade: '2027-03-12', vencido: 0 }
const saldoDaLuva = textoDoSaldo({ busca: 'luva m', materiais: [luva], total: 1, urlBase: 'https://p' })
contem(saldoDaLuva, '*Luva de procedimento M* (EST-0012)', 'estoque: o material e o código')
contem(saldoDaLuva, 'Saldo: *340 cx* · mínimo 100 cx\nOnde está: Almoxarifado 300 cx; Base Centro 40 cx\nValidade mais próxima: 12/03/2027', 'estoque: saldo, mínimo, onde está e validade')
contem(saldoDaLuva, 'https://p/patrimonio/estoque/m1', 'estoque: o link do material')
contem(textoDoSaldo({ busca: 'luva', materiais: [{ ...luva, saldo: 50 }], total: 1, urlBase: 'https://p' }), 'Saldo: *50 cx* _(abaixo do mínimo de 100 cx)_', 'estoque: abaixo do mínimo')
contem(textoDoSaldo({ busca: 'luva', materiais: [{ ...luva, saldo: 0, locais: [] }], total: 1, urlBase: 'https://p' }), '_(zerado)_', 'estoque: zerado')
contem(textoDoSaldo({ busca: 'luva', materiais: [{ ...luva, vencido: 5 }], total: 1, urlBase: 'https://p' }), 'Vencido esperando a baixa: 5 cx', 'estoque: o vencido aparece')
const saldoDeVarios = textoDoSaldo({ busca: 'luva', materiais: [luva, { ...luva, id: 'm2', nome: 'Luva nitrílica G', codigo: 'EST-0013', saldo: 12 }], total: 2, urlBase: 'https://p' })
contem(saldoDeVarios, 'Achei *2 materiais* com “luva”:', 'estoque: vários, a contagem')
contem(saldoDeVarios, '• *Luva nitrílica G* (EST-0013): 12 cx _(abaixo do mínimo de 100 cx)_', 'estoque: vários, um por linha')
contem(textoDoSaldo({ busca: 'álcool gel', materiais: [], total: 0, urlBase: 'https://p' }), 'Não achei “álcool gel” no estoque. Tente outra palavra (ou o código), ou veja a lista: https://p/patrimonio/estoque?q=%C3%A1lcool%20gel', 'estoque: nada achado, com o link da busca')
contem(TEXTO_PEDE_MATERIAL, '*estoque* e o material', 'estoque: sem o material, o que escrever')

// ---------------------------------------------------------------- a Escola no "status"
const agoraDaEscola = new Date('2026-10-18T12:00:00Z')
igual([
  situacaoDaSincronizacao({ sincronizadaEm: '2026-10-18T09:00:00Z', erro: null }, agoraDaEscola),
  situacaoDaSincronizacao({ sincronizadaEm: '2026-10-17T00:00:00Z', erro: null }, agoraDaEscola),
  situacaoDaSincronizacao({ sincronizadaEm: null, erro: null }, agoraDaEscola),
  situacaoDaSincronizacao({ sincronizadaEm: '2026-10-18T09:00:00Z', erro: 'Chave recusada pela Únicopag.' }, agoraDaEscola),
], ['em_dia', 'atrasada', 'nunca', 'erro'], `escola: em dia, atrasada (mais de ${ESCOLA_ATRASADA_HORAS} h), nunca e com erro`)
const contaEmDia: SincronizacaoDaEscola = { origem: 'unicopag', nome: 'Cursos livres', sincronizadaEm: '2026-10-18T09:00:00Z', erro: null, situacao: 'em_dia' }
igual(statusEmDia.includes('Escola'), false, 'escola: sem o campo, a linha não sai')
igual(textoDoStatus({ ...statusBase, escola: [] }).includes('Escola'), false, 'escola: sem conta ativa, a linha não sai')
contem(textoDoStatus({ ...statusBase, escola: null }), '*Escola (sincronização):* não deu para ler agora', 'escola: não deu para ler')
contem(textoDoStatus({ ...statusBase, escola: [contaEmDia, { ...contaEmDia, origem: 'meta', sincronizadaEm: '2026-10-18T09:05:00Z' }] }), '*Escola (sincronização):* em dia (2 contas; última leitura dom, 18/10 às 06:05)\n*Rotina diária:*', 'escola: em dia, uma linha antes da rotina')
const escolaComProblema = textoDoStatus({ ...statusBase, escola: [contaEmDia, { ...contaEmDia, nome: 'Pós *técnico*', erro: 'Chave recusada pela Únicopag.', situacao: 'erro' }, { ...contaEmDia, origem: 'meta', nome: 'Anúncios', sincronizadaEm: null, situacao: 'nunca' }] })
contem(escolaComProblema, '*Escola (sincronização):* 2 de 3 com problema', 'escola: a contagem dos problemas')
contem(escolaComProblema, '• Únicopag · Pós técnico – Chave recusada pela Únicopag. (última leitura certa: dom, 18/10 às 06:00)', 'escola: o erro gravado e a última leitura certa')
contem(escolaComProblema, '• Meta · Anúncios – ainda não leu nenhuma vez', 'escola: a conta que nunca leu')
contem(textoDoStatus({ ...statusBase, escola: [{ ...contaEmDia, sincronizadaEm: '2026-10-16T09:00:00Z', situacao: 'atrasada' }] }), `sem leitura há mais de ${ESCOLA_ATRASADA_HORAS} h (última: sex, 16/10 às 06:00)`, 'escola: atrasada')

// ---------------------------------------------------------------- modelos por situação (lib/whatsapp/modelos.ts)
// O catálogo é o que o Palácio cadastrou na Meta: o corpo de cada modelo, letra por letra.
igual(Object.fromEntries(Object.values(CATALOGO_DOS_MODELOS).flat().map((m) => [m.nome, m.corpo])), {
  portaria_visita_foto_v2: 'Chegou uma visita para você na recepção da Cruz Vermelha RJ.\n\nQuem é: {{1}}\nAssunto: {{2}}\nHorário: {{3}}\n\nToque em uma das opções para responder à portaria.',
  portaria_visita_foto: 'Visita na portaria da Cruz Vermelha RJ para você.\n\nVisitante: {{1}}\nMotivo: {{2}}\nChegada: {{3}}\n\nResponda pelos botões abaixo.',
  portaria_visita_v2: 'Chegou uma visita para você na recepção da Cruz Vermelha RJ.\n\nQuem é: {{1}}\nAssunto: {{2}}\nHorário: {{3}}\n\nToque em uma das opções para responder à portaria.',
  portaria_visita: 'Visita na portaria da Cruz Vermelha RJ para você.\n\nVisitante: {{1}}\nMotivo: {{2}}\nChegada: {{3}}\n\nResponda pelos botões abaixo.',
  portaria_resposta_visitante_v2: 'Recepção da Cruz Vermelha RJ: atualização sobre a sua visita a {{1}}.\n\nSituação: {{2}}\n\nEm caso de dúvida, procure a recepção.',
  portaria_resposta_visitante: 'Portaria da Cruz Vermelha RJ: sua visita para {{1}}.\n\nResposta: {{2}}\n\nQualquer dúvida, fale com a recepção.',
}, 'catálogo: os corpos exatamente como cadastrados na Meta, na ordem de preferência')
igual(Object.values(CATALOGO_DOS_MODELOS).flat().every((m) => (m.corpo.match(/\{\{\d+\}\}/g) ?? []).length === m.parametros), true, 'catálogo: o número de variáveis bate com o corpo')
igual(CATALOGO_DOS_MODELOS.visita.map((m) => [m.nome, m.cabecalho]), [['portaria_visita_foto_v2', 'IMAGE'], ['portaria_visita_foto', 'IMAGE'], ['portaria_visita_v2', null], ['portaria_visita', null]], 'catálogo: a visita, com os de foto antes')
igual(CATALOGO_DOS_MODELOS.visita.every((m) => JSON.stringify(m.botoes.map((b) => b.texto)) === JSON.stringify(botoesDaVisita?.tipo === 'botoes' ? botoesDaVisita.botoes.map((b) => b.titulo) : [])), true,
  'catálogo: os botões do modelo são os mesmos da ficha dentro da janela (1, 2 e 3)')
igual(Object.values(CATALOGO_DOS_MODELOS).flat().every((m) => m.botoes.length <= LIMITES_DO_INTERATIVO.botoes && m.botoes.every((b) => b.texto.length <= LIMITES_DO_INTERATIVO.tituloDoBotao)), true, 'catálogo: até 3 botões, títulos de até 20')
igual(CATALOGO_DOS_MODELOS.resposta_ao_visitante.map((m) => [m.nome, m.botoes.length]), [['portaria_resposta_visitante_v2', 0], ['portaria_resposta_visitante', 0]], 'catálogo: a resposta ao visitante, sem botões')
igual([modeloDoCatalogo('portaria_visita')?.parametros, modeloDoCatalogo('aviso_do_palacio')], [3, null], 'catálogo: achar pelo nome')

// A lista da Meta (GET /{WABA}/message_templates), como veio em 19/10/2026: tudo ainda PENDING.
const listaDeHoje = {
  data: [
    { name: 'portaria_visita_v2', status: 'PENDING', category: 'UTILITY', language: 'pt_BR', id: '1742339420173567' },
    { name: 'portaria_visita', status: 'PENDING', category: 'UTILITY', language: 'pt_BR', id: '1139779765189766' },
    { name: 'portaria_resposta_visitante_v2', status: 'PENDING', category: 'UTILITY', language: 'pt_BR' },
    { name: 'portaria_resposta_visitante', status: 'pending', category: 'utility', language: 'pt_BR' },
    { name: 'palacio_pendencias_do_dia_v2', status: 'PENDING', category: 'MARKETING', language: 'pt_BR' },
    { name: 'Nome Inválido', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR' },
    'lixo', null, { status: 'APPROVED' },
  ],
  paging: { cursors: { before: 'MAZDZD', after: 'MjQZD' } },
}
const naMetaHoje = lerModelosDaMeta(listaDeHoje)
igual(naMetaHoje.map((m) => m.nome), ['portaria_visita_v2', 'portaria_visita', 'portaria_resposta_visitante_v2', 'portaria_resposta_visitante', 'palacio_pendencias_do_dia_v2'], 'lista da Meta: só os de nome válido')
igual(naMetaHoje[3], { nome: 'portaria_resposta_visitante', status: 'PENDING', categoria: 'UTILITY', idioma: 'pt_BR' }, 'lista da Meta: situação e categoria em maiúsculas')
igual([lerModelosDaMeta(null), lerModelosDaMeta({ data: 'x' }), lerModelosDaMeta('lixo')], [[], [], []], 'lista da Meta: corpo estranho não lança')
igual(proximaPaginaDosModelos(listaDeHoje), null, 'lista da Meta: sem paging.next, é a última página')
igual(proximaPaginaDosModelos({ data: [], paging: { cursors: { after: 'MjQZD' }, next: 'https://graph.facebook.com/…' } }), 'MjQZD', 'lista da Meta: o cursor da próxima página')
igual(proximaPaginaDosModelos({ paging: { cursors: { after: 'a&b' }, next: 'x' } }), null, 'lista da Meta: cursor estranho não vai para o endereço')
// O cursor da Kapso é Base64 padrão (com "+", "/" e "="), e ela documenta só os cursores, sem paging.next: vale a página cheia.
const cursorDaKapso = 'eyJ2YWx1ZXMiOlsiMjAyNC0wMS0xNFQwOToyMTozMi43ODkwMTJaIiwiMTIzMjAiXX0+/ab='
igual(proximaPaginaDosModelos({ paging: { cursors: { after: cursorDaKapso }, next: 'x' } }), cursorDaKapso, 'lista da Meta: cursor em Base64 com "+" e "/" serve')
const paginaCheia = { data: Array.from({ length: 100 }, (_, i) => ({ name: `m${i}` })), paging: { cursors: { before: 'MAZDZD', after: cursorDaKapso } } }
igual([proximaPaginaDosModelos(paginaCheia), proximaPaginaDosModelos({ ...paginaCheia, data: paginaCheia.data.slice(1) })], [cursorDaKapso, null],
  'lista da Kapso (só cursores): página cheia segue; a que não encheu é a última')

const comoNaMeta = (mudancas: Record<string, Partial<ModeloNaMeta>>): ModeloNaMeta[] =>
  [...naMetaHoje, ...['portaria_visita_foto_v2', 'portaria_visita_foto'].map((nome) => ({ nome, status: 'PENDING', categoria: 'UTILITY', idioma: 'pt_BR' }))]
    .map((m) => ({ ...m, ...mudancas[m.nome] }))
const aprovado = { status: 'APPROVED' }
igual(modeloUtilAprovado({ nome: 'x', status: 'APPROVED', categoria: 'UTILITY', idioma: 'pt_BR' }), true, 'modelo: aprovado, de Utilidade, em português')
igual([
  modeloUtilAprovado({ nome: 'x', status: 'APPROVED', categoria: 'MARKETING', idioma: 'pt_BR' }),
  modeloUtilAprovado({ nome: 'x', status: 'APPROVED', categoria: 'AUTHENTICATION', idioma: 'pt_BR' }),
  modeloUtilAprovado({ nome: 'x', status: 'PENDING', categoria: 'UTILITY', idioma: 'pt_BR' }),
  modeloUtilAprovado({ nome: 'x', status: 'PAUSED', categoria: 'UTILITY', idioma: 'pt_BR' }),
  modeloUtilAprovado({ nome: 'x', status: 'APPROVED', categoria: 'UTILITY', idioma: 'en_US' }),
], [false, false, false, false, false], 'modelo: Marketing, Autenticação, pendente, pausado ou em outro idioma, nunca')
igual([escolherModelo('visita', naMetaHoje), escolherModelo('resposta_ao_visitante', naMetaHoje)], [null, null], 'escolha: hoje (tudo pendente), nenhum serve')
igual(escolherModelo('visita', comoNaMeta({ portaria_visita: aprovado }))?.nome, 'portaria_visita', 'escolha: só o primeiro aprovado, o portaria_visita')
igual(escolherModelo('visita', comoNaMeta({ portaria_visita: aprovado, portaria_visita_v2: aprovado }))?.nome, 'portaria_visita_v2', 'escolha: os dois aprovados, o v2 antes')
igual(escolherModelo('visita', comoNaMeta({ portaria_visita: aprovado, portaria_visita_v2: { status: 'APPROVED', categoria: 'MARKETING' } }))?.nome, 'portaria_visita',
  'escolha: o v2 reclassificado como Marketing fica de fora')
igual(escolherModelo('visita', comoNaMeta({ portaria_visita_foto_v2: aprovado, portaria_visita_v2: aprovado }))?.nome, 'portaria_visita_v2', 'escolha: sem a foto, o de cabeçalho de imagem não serve')
igual(escolherModelo('visita', comoNaMeta({ portaria_visita_foto_v2: aprovado, portaria_visita_v2: aprovado }), { comImagem: true })?.nome, 'portaria_visita_foto_v2', 'escolha: com a foto, o de imagem vem antes')
igual(escolherModelo('resposta_ao_visitante', comoNaMeta({ portaria_resposta_visitante: aprovado, portaria_resposta_visitante_v2: aprovado }))?.nome, 'portaria_resposta_visitante_v2', 'escolha: resposta ao visitante, o v2 antes')

igual(parametroDoModelo('João\n\tda     Silva\u00a0Jr.'), 'João da Silva Jr.', 'variável: sem quebra de linha, tabulação nem espaços seguidos')
igual(parametroDoModelo('*Ana* _Lima_ ~x~ `y`'), 'Ana Lima x y', 'variável: sem a formatação do WhatsApp')
igual([parametroDoModelo(''), parametroDoModelo('   '), parametroDoModelo(null)], ['—', '—', '—'], 'variável vazia vira "—" (a Meta recusa vazia)')
igual(parametroDoModelo('x'.repeat(50), 10), `${'x'.repeat(9)}…`, 'variável: cortada com reticências no tamanho pedido')
igual(/[\n\t]| {4,}/.test(parametroDoModelo('a \n\n\n b\t\t\tc          d')), false, 'variável: nunca quebra de linha, tabulação ou 4 espaços (erro 132018)')

const visitaV2 = CATALOGO_DOS_MODELOS.visita[2]
const fichaPorModelo = montarModelo(visitaV2, { parametros: ['João da Silva (Empresa XYZ)', 'entrega de documentos', '14:32, registrado por Ana'], respostas: ['r1', 'r2', 'r3'] })
igual(fichaPorModelo, {
  name: 'portaria_visita_v2', language: { code: 'pt_BR' },
  components: [
    { type: 'body', parameters: [{ type: 'text', text: 'João da Silva (Empresa XYZ)' }, { type: 'text', text: 'entrega de documentos' }, { type: 'text', text: '14:32, registrado por Ana' }] },
    { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'r1' }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'r2' }] },
    { type: 'button', sub_type: 'quick_reply', index: '2', parameters: [{ type: 'payload', payload: 'r3' }] },
  ],
} satisfies ObjetoDoModelo, 'montagem: a ficha por modelo, com o corpo e o payload de cada botão')
igual(corpoPreenchido(visitaV2, ['João', 'reunião', '14:32']), 'Chegou uma visita para você na recepção da Cruz Vermelha RJ.\n\nQuem é: João\nAssunto: reunião\nHorário: 14:32\n\nToque em uma das opções para responder à portaria.', 'montagem: o corpo como chega ao celular')
igual(montarModelo(visitaV2, { parametros: ['João', 'reunião'] }), null, 'montagem: variáveis a menos, não monta')
igual(montarModelo(visitaV2, { parametros: ['a', 'b', 'c', 'd'] }), null, 'montagem: variáveis a mais, não monta')
igual(montarModelo(visitaV2, { parametros: ['a', 'b', 'c'] })?.components.length, 1, 'montagem: sem respostas, os botões voltam com o texto (sem componente de botão)')
igual(montarModelo(visitaV2, { parametros: ['a', 'b', 'c'], respostas: ['r1', 'r2'] }), null, 'montagem: payload faltando para um botão')
igual(montarModelo(visitaV2, { parametros: ['a', 'b', 'c'], respostas: ['r1', ' ', 'r3'] }), null, 'montagem: payload vazio')
igual(montarModelo(visitaV2, { parametros: ['a', 'b', 'c'], respostas: ['r1', 'r2', 'x'.repeat(LIMITES_DO_MODELO.payload + 1)] }), null, 'montagem: payload longo')
const enorme = montarModelo(visitaV2, { parametros: ['y'.repeat(2000), 'z'.repeat(2000), 'w'.repeat(2000)] })
const variaveisEnormes = enorme?.components[0].type === 'body' ? enorme.components[0].parameters.map((x) => x.text) : []
igual(corpoPreenchido(visitaV2, variaveisEnormes).length <= LIMITES_DO_MODELO.corpo && variaveisEnormes.every((t) => t.endsWith('…')), true, 'montagem: variáveis enormes cortadas, o corpo cabe em 1024')
const fotoV2 = CATALOGO_DOS_MODELOS.visita[0]
igual(montarModelo(fotoV2, { parametros: ['a', 'b', 'c'] }), null, 'montagem: cabeçalho de imagem sem a imagem, não monta')
igual(montarModelo(fotoV2, { parametros: ['a', 'b', 'c'], imagem: 'id com espaço' }), null, 'montagem: id de imagem fora do formato')
igual(montarModelo(fotoV2, { parametros: ['a', 'b', 'c'], imagem: '4490709327384033' })?.components[0], { type: 'header', parameters: [{ type: 'image', image: { id: '4490709327384033' } }] }, 'montagem: a foto no cabeçalho, pelo id')
igual(montarModelo(CATALOGO_DOS_MODELOS.resposta_ao_visitante[0], { parametros: ['Ana Lima (Comunicação Social)', 'pode subir'] }), {
  name: 'portaria_resposta_visitante_v2', language: { code: 'pt_BR' },
  components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana Lima (Comunicação Social)' }, { type: 'text', text: 'pode subir' }] }],
}, 'montagem: a resposta ao visitante, só o corpo')
const comLink = { nome: 'teste_link', cabecalho: null, corpo: 'Abra: {{1}}', parametros: 1, botoes: [{ tipo: 'URL' as const, texto: 'Abrir', url: 'https://p/{{1}}' }] }
igual(montarModelo(comLink, { parametros: ['x'], links: ['chamados/1'] })?.components[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'chamados/1' }] }, 'montagem: o pedaço do link no botão')
igual([montarModelo(comLink, { parametros: ['x'] }), montarModelo(comLink, { parametros: ['x'], links: ['a b'] })], [null, null], 'montagem: link faltando ou com espaço')

const montagemDaFicha = { parametros: ['João', 'reunião', '14:32'], respostas: ['r1', 'r2', 'r3'] }
igual([modeloDaSituacao('visita', naMetaHoje, montagemDaFicha), modeloDaSituacao('resposta_ao_visitante', naMetaHoje, { parametros: ['Ana', 'pode subir'] })], [null, null], 'situação: hoje, nenhum modelo (quem chama segue pelo caminho de antes)')
igual(modeloDaSituacao('visita', comoNaMeta({ portaria_visita_foto_v2: aprovado, portaria_visita: aprovado }), montagemDaFicha)?.name, 'portaria_visita', 'situação: o de foto aprovado, mas sem a foto: o sem foto')
igual(modeloDaSituacao('visita', comoNaMeta({ portaria_visita_foto_v2: aprovado, portaria_visita: aprovado }), { ...montagemDaFicha, imagem: '4490709327384033' })?.name, 'portaria_visita_foto_v2', 'situação: com a foto, o de foto')
igual(modeloDaSituacao('visita', comoNaMeta({ portaria_visita: aprovado }), { parametros: ['João'] }), null, 'situação: o aprovado que não monta não sai')
igual([idDeMidiaValido('4490709327384033'), idDeMidiaValido(''), idDeMidiaValido('a/b'), idDeMidiaValido(42)], [true, false, false, false], 'id da mídia')

// A conta do WhatsApp Business (WABA), pela resposta da plataforma da Kapso.
igual(wabaDoNumero({ data: { id: 'uuid', phone_number_id: '1401089659754587', business_account_id: '1104970675472629' } }), '1104970675472629', 'WABA: business_account_id')
igual(wabaDoNumero({ data: { waba_id: 1104970675472629 } }), '1104970675472629', 'WABA: em número também')
igual(wabaDoNumero({ data: { business_account: { id: '1104970675472629' } } }), '1104970675472629', 'WABA: dentro de business_account')
igual([wabaDoNumero({ data: { business_account_id: 'abc' } }), wabaDoNumero({ data: {} }), wabaDoNumero({ data: [] }), wabaDoNumero(null)], [null, null, null, null], 'WABA: sem o campo, null (vale o do cofre)')
igual([wabaValido('12345'), wabaValido('1234'), wabaValido(' 12345'), wabaValido(12345)], [true, false, false, false], 'WABA: só dígitos')

// A ficha dentro da janela: os mesmos botões, com a foto no cabeçalho (pelo id da mídia).
const botoesDaFicha = botoesDaVisita?.tipo === 'botoes' ? botoesDaVisita.botoes : []
igual(objetoInterativo('Ficha', { tipo: 'botoes', botoes: botoesDaFicha, imagem: '4490709327384033' }), {
  type: 'button', header: { type: 'image', image: { id: '4490709327384033' } }, body: { text: 'Ficha' },
  action: { buttons: [{ type: 'reply', reply: { id: '1', title: 'Pode subir' } }, { type: 'reply', reply: { id: '2', title: 'Aguarde na recepção' } }, { type: 'reply', reply: { id: '3', title: 'Não pode agora' } }] },
}, 'interativo: botões com a foto no cabeçalho')
igual(objetoInterativo('Ficha', { tipo: 'botoes', botoes: botoesDaFicha, imagem: null }), objetoInterativo('Ficha', { tipo: 'botoes', botoes: botoesDaFicha }), 'interativo: sem a foto, sem cabeçalho')
igual(objetoInterativo('Ficha', { tipo: 'botoes', botoes: botoesDaFicha, imagem: '../x' }), null, 'interativo: id da imagem fora do formato vai só o texto')

// ---------------------------------------------------------------- o envio pela Kapso, com um fetch de mentira (sem rede)
type PedidoFalso = { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: unknown }
type RespostaFalsa = { status: number; corpo: unknown }

/**
 * lib/whatsapp/kapso.ts de verdade, contra uma Kapso de mentira: o fetch global vira uma fila de respostas, e cada
 * pedido fica guardado para conferir o endereço, o método, a chave e o corpo. Pedido a mais (sem resposta na fila) vira
 * erro de rede — nunca sai para a internet.
 */
async function conferirEnvioPelaKapso() {
  // kapso.ts começa com import 'server-only', que só existe dentro do Next: aqui vira um arquivo vazio.
  const { writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const Module = (await import('node:module')).default as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string }
  const vazio = join(tmpdir(), 'server-only-vazio.js')
  writeFileSync(vazio, '')
  const resolver = Module._resolveFilename
  Module._resolveFilename = function (pedido: string, ...resto: unknown[]) { return pedido === 'server-only' ? vazio : resolver.call(this, pedido, ...resto) }
  const kapso = await import('../lib/whatsapp/kapso')

  const pedidos: PedidoFalso[] = []
  let fila: RespostaFalsa[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const corpo = init?.body instanceof FormData ? init.body : typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body ?? null
    pedidos.push({ url: String(entrada), metodo: init?.method ?? 'GET', cabecalhos: Object.fromEntries(new Headers(init?.headers).entries()), corpo })
    const r = fila.shift()
    if (!r) throw new TypeError('pedido não esperado (a Kapso de mentira não tem resposta)')
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const rodar = async <T>(respostas: RespostaFalsa[], f: () => Promise<T>): Promise<T> => { pedidos.length = 0; fila = [...respostas]; return f() }
  const META = 'https://api.kapso.ai/meta/whatsapp/v24.0'
  const config = { provedor: 'kapso' as const, numeroId: '1401089659754587', chave: 'chave-de-teste-123', modelo: 'aviso_do_palacio', modeloCodigo: null, modeloSeguranca: null }
  const foraDaJanela = { status: 400, corpo: { error: { message: 'Re-engagement message', code: 131047 } } }
  const enviada = (id: string) => ({ status: 200, corpo: { messaging_product: 'whatsapp', messages: [{ id }] } })

  try {
    // O upload da foto (POST /{phone_number_id}/media, multipart).
    const subida = await rodar([{ status: 200, corpo: { id: '4490709327384033' } }], () => kapso.subirMidiaKapso(config, new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])))
    igual(subida, { ok: true, id: '4490709327384033' }, 'kapso: a foto sobe e volta o id')
    const p0 = pedidos[0]
    const form = p0?.corpo instanceof FormData ? p0.corpo : null
    const arquivo = form?.get('file')
    igual([p0?.url, p0?.metodo, p0?.cabecalhos['x-api-key'], 'content-type' in (p0?.cabecalhos ?? {})], [`${META}/1401089659754587/media`, 'POST', 'chave-de-teste-123', false],
      'kapso: upload no proxy da Meta, com a chave e sem content-type fixo (o boundary é do fetch)')
    igual([form?.get('messaging_product'), form?.get('type'), arquivo instanceof Blob ? [arquivo.type, arquivo.size, (arquivo as File).name] : null], ['whatsapp', 'image/jpeg', ['image/jpeg', 6, 'foto.jpg']], 'kapso: o formulário do upload')
    igual((await rodar([], () => kapso.subirMidiaKapso(config, new Uint8Array([1]), 'image/gif'))).ok, false, 'kapso: GIF não sobe')
    igual((await rodar([], () => kapso.subirMidiaKapso(config, new Uint8Array(kapso.TETO_DA_IMAGEM_NA_META + 1)))).ok, false, 'kapso: imagem acima de 5 MB não sobe')
    igual(pedidos.length, 0, 'kapso: o que não sobe nem chega à Kapso')
    const recusada = await rodar([{ status: 400, corpo: { error: { message: 'Invalid file type', code: 100 } } }], () => kapso.subirMidiaKapso(config, new Uint8Array([1, 2])))
    igual(recusada, { ok: false, erro: 'Invalid file type', motivo: 'outro' }, 'kapso: upload recusado, o motivo da Meta')
    igual((await rodar([{ status: 200, corpo: {} }], () => kapso.subirMidiaKapso(config, new Uint8Array([1, 2])))).ok, false, 'kapso: upload sem id na resposta')

    // Apagar a mídia depois de usar.
    igual(await rodar([{ status: 200, corpo: { success: true } }], () => kapso.apagarMidiaKapso(config, '4490709327384033')), true, 'kapso: a mídia apagada')
    igual([pedidos[0]?.metodo, pedidos[0]?.url], ['DELETE', `${META}/4490709327384033?phone_number_id=1401089659754587`], 'kapso: DELETE com o número')
    igual(await rodar([], () => kapso.apagarMidiaKapso(config, '../x')), false, 'kapso: id estranho nem chega à Kapso')

    // O modelo montado, com qualquer componente.
    const envioDoModelo = await rodar([enviada('wamid.M1')], () => kapso.enviarModeloKapso(config, '5521987654321', fichaPorModelo!))
    igual(envioDoModelo, { ok: true, id: 'wamid.M1', modelo: 'portaria_visita_v2' }, 'kapso: o modelo sai e diz qual foi')
    igual(pedidos[0]?.corpo, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '5521987654321', type: 'template', template: fichaPorModelo }, 'kapso: o corpo do envio do modelo')
    const modeloRecusado = await rodar([{ status: 400, corpo: { error: { message: 'Template name does not exist in the translation', code: 132001 } } }],
      () => kapso.enviarModeloKapso(config, '5521987654321', fichaPorModelo!))
    igual([modeloRecusado.ok, !modeloRecusado.ok && modeloRecusado.motivo, !modeloRecusado.ok && modeloRecusado.erro.includes('“portaria_visita_v2”'), !modeloRecusado.ok && modeloRecusado.erro.includes('painel da Kapso')],
      [false, 'outro', true, true], 'kapso: modelo do catálogo recusado é falha comum, com o nome e onde conferir')

    // A ficha dentro da janela: botões com a foto; a foto recusada não leva os botões junto.
    const ficha = { tipo: 'botoes' as const, botoes: botoesDaFicha, imagem: '4490709327384033' }
    const comFoto = await rodar([enviada('wamid.F1')], () => kapso.enviarTextoKapso(config, '5521987654321', 'Ficha da visita', { finalidade: 'aviso', interativo: ficha }))
    const interativoEnviado = (i: number) => (pedidos[i]?.corpo as { interactive?: { header?: unknown; action?: { buttons?: unknown[] } } } | undefined)?.interactive
    igual([comFoto, interativoEnviado(0)?.header, interativoEnviado(0)?.action?.buttons?.length], [{ ok: true, id: 'wamid.F1' }, { type: 'image', image: { id: '4490709327384033' } }, 3], 'kapso: a ficha com a foto no cabeçalho')
    const semAFoto = await rodar([{ status: 400, corpo: { error: { message: 'Media upload error', code: 131053 } } }, enviada('wamid.F2')],
      () => kapso.enviarTextoKapso(config, '5521987654321', 'Ficha da visita', { finalidade: 'aviso', interativo: ficha }))
    igual([semAFoto.ok, pedidos.length, interativoEnviado(1)?.header, interativoEnviado(1)?.action?.buttons?.length], [true, 2, undefined, 3], 'kapso: a foto recusada, de novo sem ela e com os botões')

    // Fora da janela: o modelo da situação, pedido só quando precisa.
    let pediuOModelo = 0
    const modeloDaFicha = async () => { pediuOModelo++; return fichaPorModelo }
    const porModelo = await rodar([foraDaJanela, foraDaJanela, enviada('wamid.T1')],
      () => kapso.enviarTextoKapso(config, '5521987654321', 'Ficha da visita', { finalidade: 'aviso', interativo: ficha, modeloForaDaJanela: modeloDaFicha }))
    igual([porModelo, pediuOModelo], [{ ok: true, id: 'wamid.T1', modelo: 'portaria_visita_v2' }, 1], 'kapso: fora da janela, o modelo da situação')
    igual(pedidos.map((x) => (x.corpo as { to?: string; type?: string }).to + ':' + (x.corpo as { type?: string }).type), ['5521987654321:interactive', '552187654321:interactive', '5521987654321:template'],
      'kapso: tenta sem o nono dígito antes do modelo; o modelo vai ao número inteiro')
    const semModelo = await rodar([foraDaJanela, foraDaJanela], () => kapso.enviarTextoKapso(config, '5521987654321', 'Ficha da visita', { finalidade: 'aviso', interativo: ficha, modeloForaDaJanela: async () => null }))
    igual([semModelo.ok, !semModelo.ok && semModelo.foraDaJanela, !semModelo.ok && semModelo.erro.includes('Não há modelo aprovado'), pedidos.length], [false, true, true, 2],
      'kapso: sem modelo aprovado, não sai (nem pelo modelo dos avisos) e diz que foi a janela')
    const dentroDaJanela = await rodar([enviada('wamid.J1')], async () => { pediuOModelo = 0; return kapso.enviarTextoKapso(config, '5521987654321', 'oi', { modeloForaDaJanela: modeloDaFicha }) })
    igual([dentroDaJanela.ok, pediuOModelo], [true, 0], 'kapso: dentro da janela, o modelo nem é pedido')
    const doCofre = await rodar([foraDaJanela, foraDaJanela, enviada('wamid.A1')], () => kapso.enviarTextoKapso(config, '5521987654321', 'Aviso qualquer', { finalidade: 'aviso' }))
    igual([doCofre, (pedidos[2]?.corpo as { template?: { name?: string } } | undefined)?.template?.name], [{ ok: true, id: 'wamid.A1', modelo: 'aviso_do_palacio' }, 'aviso_do_palacio'], 'kapso: sem o da situação, o modelo do cofre, como antes')

    // O WABA pelo número (API da plataforma), guardado; sem ele, o do cofre.
    const PLATAFORMA = 'https://api.kapso.ai/platform/v1/whatsapp/phone_numbers'
    igual(await rodar([{ status: 200, corpo: { data: { phone_number_id: '1401089659754587', business_account_id: '1104970675472629' } } }], () => kapso.wabaDoNumeroKapso(config)), '1104970675472629', 'kapso: o WABA pelo número')
    igual(pedidos[0]?.url, `${PLATAFORMA}/1401089659754587`, 'kapso: o mesmo GET do número na plataforma')
    igual([await rodar([], () => kapso.wabaDoNumeroKapso(config)), pedidos.length], ['1104970675472629', 0], 'kapso: o WABA fica guardado')
    igual(await rodar([{ status: 200, corpo: { data: { status: 'CONNECTED' } } }], () => kapso.wabaDoNumeroKapso({ ...config, numeroId: '2222222222', wabaId: '1104970675472629' })), '1104970675472629', 'kapso: a Kapso não diz, vale o do cofre')
    igual(await rodar([{ status: 404, corpo: { error: 'not found' } }], () => kapso.wabaDoNumeroKapso({ ...config, numeroId: '3333333333' })), null, 'kapso: sem WABA nenhum, null')

    // Os modelos da conta: as páginas, o cache e a falha (nenhum aprovado).
    const config4 = { ...config, numeroId: '4444444444' }
    const pagina1 = { data: [{ name: 'portaria_visita_v2', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR' }], paging: { cursors: { after: 'MjQZD' }, next: 'https://x' } }
    const pagina2 = { data: [{ name: 'portaria_visita', status: 'APPROVED', category: 'MARKETING', language: 'pt_BR' }], paging: { cursors: { before: 'MAZDZD' } } }
    const lidos = await rodar([{ status: 200, corpo: { data: { business_account_id: '99999' } } }, { status: 200, corpo: pagina1 }, { status: 200, corpo: pagina2 }], () => kapso.modelosDaMetaKapso(config4))
    igual(lidos.map((m) => `${m.nome}:${m.status}:${m.categoria}`), ['portaria_visita_v2:APPROVED:UTILITY', 'portaria_visita:APPROVED:MARKETING'], 'kapso: os modelos das duas páginas')
    const daLista = `${META}/99999/message_templates?fields=name,status,category,language&status=APPROVED&category=UTILITY&language=pt_BR&limit=100`
    igual(pedidos.slice(1).map((x) => x.url), [daLista, `${daLista}&after=MjQZD`],
      'kapso: a lista pelo WABA, só os aprovados de Utilidade em português, com os campos, e a página seguinte pelo cursor')
    igual([(await rodar([], () => kapso.modelosDaMetaKapso(config4))).length, pedidos.length], [2, 0], 'kapso: a lista fica guardada')
    igual(modeloDaSituacao('visita', lidos, montagemDaFicha)?.name, 'portaria_visita_v2', 'kapso: o v2 aprovado serve (o v1 virou Marketing)')
    const config5 = { ...config, numeroId: '5555555555' }
    igual(await rodar([{ status: 200, corpo: { data: { business_account_id: '99999' } } }, { status: 500, corpo: { error: { message: 'Erro' } } }], () => kapso.modelosDaMetaKapso(config5)), [], 'kapso: a leitura falhou, nenhum aprovado')
    igual([await rodar([], () => kapso.modelosDaMetaKapso(config5)), pedidos.length], [[], 0], 'kapso: a falha também espera um pouco antes de ler de novo')

    // A ficha de verdade (lib/whatsapp/portaria-regras.ts), como lib/portaria/servidor.ts manda: dentro da janela, os
    // botões com a foto e o id da visita; fora dela, o modelo aprovado com o MESMO id em cada resposta rápida — o toque,
    // de um jeito ou de outro, volta à mesma visita; sem modelo aprovado, o aviso de antes pelo modelo do cofre.
    const visitaId = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
    const fichaReal: FichaDaVisita = { visitaId, visitante: 'João Silva', empresa: 'Gráfica Boa', motivo: 'Entrega de cartazes', chegada: '14:05', registradaPor: 'Maria Souza' }
    const botoesReais = interativoDaFicha(visitaId, '4490709327384033')
    const naMetaAprovado = (nomes: string[]): ModeloNaMeta[] => nomes.map((nome) => ({ nome, status: 'APPROVED', categoria: 'UTILITY', idioma: 'pt_BR' }))
    const modeloRealDaFicha = (naMeta: ModeloNaMeta[]) => async () =>
      modeloDaFichaForaDaJanela({ naMeta, montagem: montagemDaFichaReal(fichaReal, '4490709327384033'), cofre: config, textoDoAviso: '*João Silva chegou para falar com você*' })
    const naJanela = await rodar([enviada('wamid.R1')], () => kapso.enviarTextoKapso(config, '5521987654321', textoDaFicha(fichaReal, 'https://p'), { finalidade: 'aviso', interativo: botoesReais }))
    const idsNaJanela = (interativoEnviado(0)?.action?.buttons as { reply: { id: string } }[] | undefined)?.map((b) => b.reply.id) ?? []
    igual([naJanela.ok, interativoEnviado(0)?.header, idsNaJanela.map((id) => lerBotaoDaFicha(id)?.visitaId)], [true, { type: 'image', image: { id: '4490709327384033' } }, [visitaId, visitaId, visitaId]],
      'ficha real: na janela, a foto e os três botões com o id da visita')
    const foraReal = await rodar([foraDaJanela, foraDaJanela, enviada('wamid.R2')],
      () => kapso.enviarTextoKapso(config, '5521987654321', textoDaFicha(fichaReal, 'https://p'), { finalidade: 'aviso', interativo: botoesReais, modeloForaDaJanela: modeloRealDaFicha(naMetaAprovado(['portaria_visita_v2'])) }))
    const modeloEnviado = (pedidos[2]?.corpo as { template?: ObjetoDoModelo } | undefined)?.template
    const payloads = (modeloEnviado?.components ?? []).flatMap((c) => (c.type === 'button' && c.sub_type === 'quick_reply' ? [c.parameters[0].payload] : []))
    igual([foraReal, payloads], [{ ok: true, id: 'wamid.R2', modelo: 'portaria_visita_v2' }, idsNaJanela], 'ficha real: fora da janela, o v2 aprovado com o mesmo id em cada resposta rápida')
    const comFotoAprovado = await rodar([foraDaJanela, foraDaJanela, enviada('wamid.R3')],
      () => kapso.enviarTextoKapso(config, '5521987654321', 'Ficha', { finalidade: 'aviso', interativo: botoesReais, modeloForaDaJanela: modeloRealDaFicha(naMetaAprovado(['portaria_visita_foto_v2', 'portaria_visita_v2'])) }))
    igual([comFotoAprovado.ok && comFotoAprovado.modelo, (pedidos[2]?.corpo as { template?: ObjetoDoModelo } | undefined)?.template?.components[0]],
      ['portaria_visita_foto_v2', { type: 'header', parameters: [{ type: 'image', image: { id: '4490709327384033' } }] }], 'ficha real: com o de foto aprovado, a foto vai no cabeçalho do modelo')
    const recuo = await rodar([foraDaJanela, foraDaJanela, enviada('wamid.R4')],
      () => kapso.enviarTextoKapso(config, '5521987654321', 'Ficha', { finalidade: 'aviso', interativo: botoesReais, modeloForaDaJanela: modeloRealDaFicha(naMetaHoje) }))
    igual([recuo.ok && recuo.modelo, (pedidos[2]?.corpo as { template?: ObjetoDoModelo } | undefined)?.template?.components],
      ['aviso_do_palacio', [{ type: 'body', parameters: [{ type: 'text', text: textoParaModelo('*João Silva chegou para falar com você*') }] }]], 'ficha real: hoje (nada aprovado), o aviso de antes pelo modelo do cofre')
  } finally {
    globalThis.fetch = original
  }

  // O cache em si, com o relógio de mentira.
  let relogio = 0
  let leituras = 0
  const cache = cacheDosModelos({ agora: () => relogio })
  const lerUm = async () => { leituras++; return [{ nome: 'portaria_visita', status: 'APPROVED', categoria: 'UTILITY', idioma: 'pt_BR' }] }
  const [a, b] = await Promise.all([cache.modelos('n', lerUm), cache.modelos('n', lerUm)])
  igual([a.length, b.length, leituras], [1, 1, 1], 'cache: quem pede junto espera a mesma leitura')
  relogio = VALIDADE_DOS_MODELOS_MS - 1
  await cache.modelos('n', lerUm)
  igual(leituras, 1, 'cache: dentro da validade, não lê')
  relogio = VALIDADE_DOS_MODELOS_MS + 1
  await cache.modelos('n', lerUm)
  igual(leituras, 2, 'cache: vencida, lê de novo')
  let falhasDaLeitura = 0
  const falhar = async () => { falhasDaLeitura++; return null }
  igual(await cache.modelos('m', falhar), [], 'cache: a leitura que falhou vale nenhum aprovado')
  relogio += VALIDADE_DA_FALHA_MS - 1
  await cache.modelos('m', falhar)
  igual(falhasDaLeitura, 1, 'cache: a falha espera um pouco')
  relogio += 2
  await cache.modelos('m', falhar)
  igual(falhasDaLeitura, 2, 'cache: depois, tenta de novo')
  igual(await cache.modelos('x', async () => { throw new Error('rede') }), [], 'cache: a leitura que lança também vale nenhum')
  cache.esquecer('n')
  await cache.modelos('n', lerUm)
  igual(leituras, 3, 'cache: esquecida, lê de novo')
}

conferirEnvioPelaKapso().catch((causa) => { falhas++; console.log('FALHOU: o envio pela Kapso lançou', causa) }).finally(() => {
  // cortesia, reação e o "não entendi" curto
  for (const t of ['ok', 'Obrigada!', 'muito obrigado', 'valeu', '👍', '🙏', 'blz', 'Obrigado, recebi', 'beleza, vi']) igual(ehCortesia(t), true, `cortesia: "${t}" não pede resposta`)
  for (const t of ['obrigada, mas como troco a senha?', 'ok e agora?', 'não recebi a senha', 'como faço para entrar', 'ok vou fazer isso hoje à tarde ok ok']) igual(ehCortesia(t), false, `cortesia: "${t}" é pergunta ou frase: responde`)
  igual(TEXTO_NAO_ENTENDI_CURTO.length < 200 && !TEXTO_NAO_ENTENDI_CURTO.includes('1 –'), true, 'não entendi: uma linha, sem lista de opções')
  {
    const reacao = lerEventoDaKapso({ type: 'whatsapp.message.received', message: { id: 'wamid.R', from: '5521970360264', type: 'reaction', timestamp: '1788000000', reaction: { emoji: '🙏', message_id: 'wamid.X' } }, conversation: { phone_number: '+5521970360264' } }, 'whatsapp.message.received', null)
    igual(reacao.mensagens[0]?.ignorar, 'sem_conteudo', 'reação com emoji: ignorada, o bot não responde')
    const texto = lerEventoDaKapso({ type: 'whatsapp.message.received', message: { id: 'wamid.T', from: '5521970360264', type: 'text', timestamp: '1788000000', text: { body: 'oi' } }, conversation: { phone_number: '+5521970360264' } }, 'whatsapp.message.received', null)
    igual(texto.mensagens[0]?.ignorar, null, 'mensagem de texto: não é ignorada')
  }
  // o passeio "funções": só como a mensagem inteira, e o menu aponta para ele
  for (const t of ['funções', 'Funcoes', 'o que você faz?', 'tour', 'comandos']) igual(lerPedido(t, { pausado: false }).comando, 'funcoes', `funções: "${t}" abre o passeio`)
  for (const t of ['funções', 'o que você faz']) igual(lerPedido(t, { pausado: false, assistente: true }).comando, 'funcoes', `funções: "${t}" abre o passeio também com o assistente`)
  igual(lerPedido('quais as funções do chamado 12 que abri', { pausado: false }).comando === 'funcoes', false, 'funções: no meio de uma frase não roda')
  contem(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p' }), LINHA_DAS_FUNCOES, 'menu: aponta para o passeio')
  igual(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: 'https://p' }).includes('Para responder um aviso'), false, 'menu: sem a explicação longa (ela está no passeio)')
  {
    const simples = textoDasFuncoes({})
    contem(simples, '*chamado:* e o problema', 'passeio: chamado')
    contem(simples, '*ajuda* e a sua dúvida', 'passeio: ajuda')
    contem(simples, 'responda a própria mensagem dele', 'passeio: como responder um aviso')
    igual(simples.includes('*portaria*') || simples.includes('*status*') || simples.includes('*financeiro*'), false, 'passeio: sem as áreas que a pessoa não tem')
    const tudo = textoDasFuncoes({ assistente: true, admin: true, usuarios: true, atende: true, portaria: true, financeiro: true, presenca: true, frota: 'operar', estoque: true })
    for (const parte of ['*portaria*', '*financeiro*', '*presença*', '*veículos*', '*estoque*', '*status*', '*colaborador:*', 'Escreva do seu jeito']) contem(tudo, parte, `passeio completo: ${parte}`)
    igual(tudo.length < 3500, true, `passeio completo cabe numa mensagem (${tudo.length})`)
  }
  if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }

  console.log('WhatsApp: tudo certo.')
})
