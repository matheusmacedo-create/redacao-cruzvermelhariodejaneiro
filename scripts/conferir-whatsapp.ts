/**
 * Confere as regras do WhatsApp: `npx tsx scripts/conferir-whatsapp.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import {
  numeroCanonico, formatarNumero, mascararNumero,
  lerCategoriasDoWhatsapp, decidirWhatsapp, textoDoAviso, lerEventoDaKapso, estadoDoNumeroNaKapso, numeroSemNonoDigito, problemaNaSaude, interpretarComando, textoDosAvisos, textoDasLidas,
  textoDoMenu, codigoNoFormato, emSilencio, fimDoSilencio, silencioSeAplica, proximaTentativa, falhaMereceReenvio,
  categoriaVaiPorWhatsapp, horaEmSaoPaulo, lerPedido, rotuloDoDia, textoDaAgenda, textoDosChamados, textoDasAprovacoes, textoDaAjuda, respostaParaWhatsapp,
  textoDoConviteDoPalacio, alvoDoLink, dicaDeResposta, lerDecisao, ehConfirmacao, ehCancelamento, ehPular, lerEscolha, textoDaConferencia, textoDaEscolha, textoPedeDetalhes, tituloDoRelato,
  baseDoHashDoCodigo, textoDoCodigo, textoDoCodigoDeIda, linkDoWhatsapp, codigoNaMensagem, textoDoNumeroConfirmado, textoDoCodigoDeIdaErrado, textoDaFalhaDoCodigoDeIda,
  modeloDaFinalidade, modeloParaEnviar, textoParaModelo, ehErroDeModelo, problemaDoModelo, nomeDeModeloValido, TEXTO_PAUSADO, textoDeSeguranca,
  tipoDaFalha, resumoDasFalhas, falhasSemModelo, decidirAlerta, quandoEmSaoPaulo, textoDoStatus, textoDaRodadaDaFila, textoDoComandoFila, FALHAS_SEM_MODELO_PARA_ALERTAR,
  soOCodigo, ROTULO_DO_BOT_FORA_DA_JANELA, AVISO_AO_NUMERO_ANTIGO, type StatusDoCanal, type FalhaDeEnvio,
  objetoInterativo, interativoCaiNoTexto, interativoDoMenu, interativoDoAviso, interativoDaEscolha, BOTOES_DA_CONFERENCIA, BOTOES_DOS_DETALHES,
  LIMITES_DO_INTERATIVO, type Interativo,
} from '../lib/whatsapp/regras'
import { lerRespostaDaVisita, respostaClaraDaVisita } from '../lib/portaria/regras'
import { URGENCIA } from '../lib/chamados/regras'
import { corpoParaWhatsapp, emailDeAviso } from '../lib/contas/emails'
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
igual(kapsoTexto.mensagens, [{ id: 'wamid.1', numero: '5521987654321', texto: 'menu', nome: 'Ana', citada: 'wamid.aviso', toque: false, midia: null, ignorar: null }], 'kapso: texto, nome e citação')
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
igual(linhasDoMenu(interativoDoMenu({ pausado: true }))[2], { id: '3', titulo: 'Voltar a receber', descricao: 'Voltar a receber os avisos por aqui' }, 'menu em lista: o 3 de quem pausou é voltar')
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
  conexao: { estado: 'conectado', erro: null }, webhook: 'ligado', fila: { silencio: 0, volume: 0, falha: 0 },
  falhas: { total: 0, grupos: [] }, semChave: [], googleExpiradas: [], rotina: '2026-10-18T10:05:00Z', urlBase: 'https://p',
}
const statusEmDia = textoDoStatus(statusBase)
contem(statusEmDia, '*Status do WhatsApp do Palácio*', 'status: título')
contem(statusEmDia, '*Kapso:* Conectado\n*Recebimento (bot):* ligado\n*Fila:* vazia\n*Falhas em 24 h:* nenhuma\n*Integrações sem chave:* nenhuma\n*Contas Google:* em dia\n*Rotina diária:* dom, 18/10 às 07:05', 'status em dia: uma linha por assunto')
contem(statusEmDia, 'Detalhes: https://p/configuracoes/whatsapp', 'status: link da tela')
const statusComProblema = textoDoStatus({
  ...statusBase,
  conexao: { estado: 'erro', erro: 'A Kapso aponta *problema* no número.' }, webhook: 'desligado', fila: { silencio: 2, volume: 0, falha: 1 },
  falhas: { total: 9, grupos: resumoDasFalhas(deAviso([foraDaJanela, foraDaJanela, foraDaJanela, modeloPausado, 'a', 'b', 'c', 'd'])) },
  semChave: ['Hunter.io', 'Meta Ads'], googleExpiradas: [{ onde: 'E-mail dos setores', conta: 'comunicacao@cvb.org' }], rotina: null,
})
contem(statusComProblema, '*Kapso:* Sem resposta da Kapso – A Kapso aponta problema no número.', 'status: o erro da conexão, sem a marcação')
contem(statusComProblema, '*Recebimento (bot):* desligado', 'status: recebimento desligado')
contem(statusComProblema, '*Fila:* 3 mensagens (2 no silêncio até as 7h, 1 para reenviar)', 'status: a fila por motivo')
contem(statusComProblema, '*Falhas em 24 h:* 9\n• 3 – Fora da janela de 24 h, sem modelo aprovado\n• 1 – ', 'status: falhas agrupadas')
contem(statusComProblema, '_e mais 2 motivos_', 'status: corta os motivos em 4')
contem(statusComProblema, 'Configurações → Integrações', 'status: falha sem modelo diz onde configurar')
contem(statusComProblema, '*Integrações sem chave:* Hunter.io, Meta Ads', 'status: integrações sem chave, só os nomes')
contem(statusComProblema, 'E-mail dos setores (comunicacao@cvb.org) – a autorização expirou', 'status: Google expirado')
contem(statusComProblema, '*Rotina diária:* sem registro ainda', 'status: rotina sem registro')
contem(textoDoStatus({ ...statusBase, fila: null, falhas: null, semChave: null, webhook: 'desconhecido' }), '*Fila:* não deu para ler agora', 'status: o que não deu para ler')
const statusDoBot = textoDoStatus({ ...statusBase, falhas: { total: 2, grupos: resumoDasFalhas(deAviso([foraDaJanelaDoBot, foraDaJanelaDoBot], 'bot')) } })
contem(statusDoBot, `*Falhas em 24 h:* 2\n• 2 – ${ROTULO_DO_BOT_FORA_DA_JANELA}`, 'status: resposta do bot fora da janela com rótulo próprio')
igual(statusDoBot.includes('Os modelos aprovados'), false, 'status: resposta do bot fora da janela não puxa a dica dos modelos')

igual(textoDaRodadaDaFila({ enviadas: 1, adiadas: 0, desistiu: 0, restam: 0 }), '1 mensagem enviada.', 'rodada: uma enviada')
igual(textoDaRodadaDaFila({ enviadas: 3, adiadas: 1, desistiu: 2, restam: 4 }),
  '3 mensagens enviadas; 1 para tentar de novo mais tarde; 2 descartadas (aviso já lido, número removido ou falha sem volta); 4 ainda esperando a vez.', 'rodada: tudo junto (o texto de sempre da tela)')
contem(textoDaRodadaDaFila({ enviadas: 0, adiadas: 0, desistiu: 0, restam: 0 }), 'Nada saiu agora', 'rodada: nada para sair')
const comandoFila = textoDoComandoFila({ rodada: { enviadas: 2, adiadas: 0, desistiu: 0, restam: 0 }, fila: { silencio: 2, volume: 0, falha: 0 } })
contem(comandoFila, '*Fila do WhatsApp*\n\n2 mensagens enviadas.', 'comando fila: a rodada')
contem(comandoFila, 'Na fila agora: 2 mensagens (2 no silêncio até as 7h).', 'comando fila: o que ficou')

if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
console.log('WhatsApp: tudo certo.')
