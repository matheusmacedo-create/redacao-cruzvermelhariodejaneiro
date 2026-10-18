/**
 * Confere as regras do WhatsApp: `npx tsx scripts/conferir-whatsapp.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import {
  numeroCanonico, formatarNumero, mascararNumero,
  lerCategoriasDoWhatsapp, decidirWhatsapp, textoDoAviso, lerEventoDaKapso, estadoDoNumeroNaKapso, interpretarComando, textoDosAvisos, textoDasLidas,
  textoDoMenu, codigoNoFormato, emSilencio, fimDoSilencio, silencioSeAplica, proximaTentativa, falhaMereceReenvio,
  categoriaVaiPorWhatsapp, horaEmSaoPaulo, lerPedido, rotuloDoDia, textoDaAgenda, textoDosChamados, textoDasAprovacoes, textoDaAjuda, respostaParaWhatsapp,
  textoDoConviteDoPalacio, alvoDoLink, dicaDeResposta, lerDecisao, ehConfirmacao, ehCancelamento, ehPular, lerEscolha, textoDaConferencia, textoDaEscolha, textoPedeDetalhes, tituloDoRelato,
} from '../lib/whatsapp/regras'
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
igual(kapsoTexto.mensagens, [{ id: 'wamid.1', numero: '5521987654321', texto: 'menu', nome: 'Ana', citada: 'wamid.aviso', midia: null, ignorar: null }], 'kapso: texto, nome e citação')
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
const kapsoLote = lerEventoDaKapso({ type: 'whatsapp.message.received', batch: true, data: [
  { message: { id: 'a', type: 'text', from: '5521987654321', text: { body: '1' } }, phone_number_id: NUMERO_ID },
  { message: { id: 'b', type: 'interactive', from: '5521987654321', interactive: { button_reply: { id: '2' } } }, phone_number_id: NUMERO_ID },
] }, null, NUMERO_ID)
igual(kapsoLote.mensagens.map((m) => `${m.id}:${m.texto}`), ['a:1', 'b:2'], 'kapso: lote e resposta de botão')
const kapsoOutroNumero = lerEventoDaKapso({ message: { id: 'x', type: 'text', from: '5521987654321', text: { body: 'oi' } }, phone_number_id: '999999' }, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoOutroNumero.mensagens.length, 0, 'kapso: outro número do projeto é ignorado')
const kapsoSaida = lerEventoDaKapso({ message: { id: 'y', type: 'text', from: '5521987654321', text: { body: 'oi' }, kapso: { direction: 'outbound' } }, phone_number_id: NUMERO_ID }, 'whatsapp.message.received', NUMERO_ID)
igual(kapsoSaida.mensagens[0]?.ignorar, 'de_mim', 'kapso: mensagem que o número mandou não é respondida')
igual(lerEventoDaKapso({ message: { id: 'z' } }, 'whatsapp.message.delivered', NUMERO_ID).mensagens.length, 0, 'kapso: outros eventos não viram mensagem')
igual(lerEventoDaKapso('lixo', 'whatsapp.message.received', NUMERO_ID).mensagens.length, 0, 'kapso: corpo estranho não lança')

if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
console.log('WhatsApp: tudo certo.')
