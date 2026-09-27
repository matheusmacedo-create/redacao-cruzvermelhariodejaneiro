/**
 * Confere as regras do WhatsApp: `npx tsx scripts/conferir-whatsapp.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import {
  numeroCanonico, numeroDoJid, formatarNumero, mascararNumero, urlDoServidor, instanciaValida, estadoDaEvolution,
  lerCategoriasDoWhatsapp, decidirWhatsapp, textoDoAviso, lerEventoDoWebhook, interpretarComando, textoDosAvisos, textoDasLidas,
  textoDoMenu, codigoNoFormato, emSilencio, fimDoSilencio, silencioSeAplica, proximaTentativa, falhaMereceReenvio,
  categoriaVaiPorWhatsapp, horaEmSaoPaulo, enderecoLocal, lerPedido, rotuloDoDia, textoDaAgenda, textoDosChamados, textoDasAprovacoes, textoDaAjuda, respostaParaWhatsapp,
  alvoDoLink, lerDecisao, ehConfirmacao, ehCancelamento, lerEscolha, textoDaConferencia, textoDaEscolha, tituloDoRelato,
} from '../lib/whatsapp/regras'
import { buscarDuvida, palavrasDaDuvida, pedidoDaDuvida } from '../lib/whatsapp/duvidas'

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

igual(numeroDoJid('5521987654321@s.whatsapp.net'), '5521987654321', 'jid comum')
igual(numeroDoJid('552187654321@s.whatsapp.net'), '5521987654321', 'jid antigo sem o nono dígito')
igual(numeroDoJid('5521987654321:12@s.whatsapp.net'), '5521987654321', 'jid com aparelho')
igual(numeroDoJid('120363025246125244@g.us'), null, 'grupo')
igual(numeroDoJid('203958476372912@lid'), null, 'lid')
igual(numeroDoJid(undefined), null, 'sem jid')

igual(formatarNumero('5521987654321'), '+55 (21) 98765-4321', 'formata celular')
igual(formatarNumero('552123456789'), '+55 (21) 2345-6789', 'formata fixo')
igual(mascararNumero('5521987654321'), '+55 21 9••••-4321', 'mascara celular')
igual(mascararNumero('552123456789'), '+55 21 ••••-6789', 'mascara fixo')
igual(mascararNumero(null), '—', 'mascara vazio')

// ---------------------------------------------------------------- configuração
igual(urlDoServidor('https://evo.exemplo.org/'), 'https://evo.exemplo.org', 'tira a barra')
igual(urlDoServidor('http://10.0.0.5:8080'), 'http://10.0.0.5:8080', 'http com porta')
igual(urlDoServidor('https://exemplo.org/evolution/'), 'https://exemplo.org/evolution', 'com caminho')
igual(urlDoServidor('ftp://exemplo.org'), null, 'protocolo errado')
igual(urlDoServidor('https://user:senha@exemplo.org'), null, 'credencial na URL')
igual(urlDoServidor('https://exemplo.org/?apikey=x'), null, 'chave na URL')
igual(urlDoServidor('exemplo.org'), 'https://exemplo.org', 'sem protocolo vira https')
igual(urlDoServidor('gently-jaws-denim.ngrok-free.dev'), 'https://gently-jaws-denim.ngrok-free.dev', 'o caso que travou o primeiro cadastro')
igual(urlDoServidor('localhost:8080'), 'https://localhost:8080', 'localhost ganha protocolo…')
igual(enderecoLocal('https://localhost:8080'), true, '…mas é endereço local')
igual(enderecoLocal('http://192.168.0.10:8080'), true, 'rede de casa é local')
igual(enderecoLocal('http://172.20.1.5'), true, 'rede do Docker é local')
igual(enderecoLocal('https://gently-jaws-denim.ngrok-free.dev'), false, 'ngrok é público')
igual(enderecoLocal('https://8.8.8.8'), false, 'IP público não é local')
igual(instanciaValida('palacio'), true, 'instância simples')
igual(instanciaValida('Palacio-Virtual_1'), true, 'instância com traço')
igual(instanciaValida('com espaço'), false, 'instância com espaço')
igual(instanciaValida('../x'), false, 'instância com barra')
igual(estadoDaEvolution('open'), 'conectado', 'open')
igual(estadoDaEvolution('connecting'), 'conectando', 'connecting')
igual(estadoDaEvolution('close'), 'desconectado', 'close')
igual(estadoDaEvolution(undefined), 'erro', 'sem estado')

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

const aviso = textoDoAviso({ urlBase: 'https://palacio.x', titulo: 'Pedido de *aprovação*', mensagem: 'Ana pediu sua aprovação.', link: '/aprovacoes', citacao: 'linha 1\nlinha 2' })
contem(aviso, '*Pedido de aprovação*', 'título em negrito, sem o * de dentro')
contem(aviso, '> linha 1\n> linha 2', 'citação')
contem(aviso, 'Abrir: https://palacio.x/aprovacoes', 'link')
contem(textoDoAviso({ urlBase: 'https://palacio.x', titulo: 't', mensagem: 'm', link: null }), 'https://palacio.x/notificacoes', 'sem link vai ao sino')

// ---------------------------------------------------------------- webhook
const mensagem = lerEventoDoWebhook({
  event: 'messages.upsert', instance: 'palacio',
  data: { key: { remoteJid: '552187654321@s.whatsapp.net', fromMe: false, id: 'ABC123' }, pushName: 'Ana', message: { conversation: 'Oi' } },
})
igual(mensagem.evento, 'messages.upsert', 'evento')
igual(mensagem.instancia, 'palacio', 'instância')
igual(mensagem.mensagens, [{ id: 'ABC123', numero: '5521987654321', texto: 'Oi', nome: 'Ana', citada: null, ignorar: null }], 'mensagem comum')

const maiusculo = lerEventoDoWebhook({ event: 'MESSAGES_UPSERT', data: { key: { remoteJid: '5521987654321@s.whatsapp.net', id: 'X' }, message: { extendedTextMessage: { text: 'avisos' } } } })
igual(maiusculo.evento, 'messages.upsert', 'evento em maiúsculas')
igual(maiusculo.mensagens[0]?.texto, 'avisos', 'texto estendido')

const lid = lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '203958476372912@lid', remoteJidAlt: '5521987654321@s.whatsapp.net', id: 'L' }, message: { conversation: '1' } } })
igual(lid.mensagens[0]?.numero, '5521987654321', 'lid com o número ao lado')
const lidSemNumero = lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '203958476372912@lid', id: 'L2' }, message: { conversation: '1' } } })
igual(lidSemNumero.mensagens[0]?.ignorar, 'sem_numero', 'lid sem número')
const grupo = lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '120363025246125244@g.us', participant: '5521987654321@s.whatsapp.net', id: 'G' }, message: { conversation: 'oi' } } })
igual(grupo.mensagens[0]?.ignorar, 'grupo', 'grupo')
igual(grupo.mensagens[0]?.numero, null, 'grupo sem número')
const minha = lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '5521987654321@s.whatsapp.net', fromMe: true, id: 'M' }, message: { conversation: 'x' } } })
igual(minha.mensagens[0]?.ignorar, 'de_mim', 'mensagem do próprio número')
const efemera = lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '5521987654321@s.whatsapp.net', id: 'E' }, message: { ephemeralMessage: { message: { extendedTextMessage: { text: '2' } } } } } })
igual(efemera.mensagens[0]?.texto, '2', 'mensagem temporária')
const conexao = lerEventoDoWebhook({ event: 'connection.update', instance: 'palacio', data: { instance: 'palacio', state: 'open', statusReason: 200 } })
igual([conexao.evento, conexao.estado, conexao.mensagens.length], ['connection.update', 'open', 0], 'conexão')
igual(lerEventoDoWebhook(null).mensagens, [], 'corpo vazio')
igual(lerEventoDoWebhook({ event: 'messages.upsert', data: 'x' }).mensagens, [], 'dado inválido')

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
const citando = lerEventoDoWebhook({ event: 'messages.upsert', data: {
  key: { remoteJid: '5521987654321@s.whatsapp.net', id: 'R1' },
  message: { extendedTextMessage: { text: 'Já reiniciei o roteador', contextInfo: { stanzaId: '3EB0AVISO', participant: '552192368473@s.whatsapp.net' } } },
} })
igual(citando.mensagens[0]?.citada, '3EB0AVISO', 'resposta citando o aviso')
igual(lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '5521987654321@s.whatsapp.net', id: 'R2' }, contextInfo: { stanzaId: 'TOPO' }, message: { conversation: 'ok' } } }).mensagens[0]?.citada, 'TOPO', 'citação no contextInfo de fora (Evolution v2)')
igual(lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '5521987654321@s.whatsapp.net', id: 'R3' }, message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'x', contextInfo: { stanzaId: 'EFE' } } } } } } }).mensagens[0]?.citada, 'EFE', 'citação em mensagem temporária')
igual(mensagem.mensagens[0]?.citada, null, 'sem citação')
igual(lerEventoDoWebhook({ event: 'messages.upsert', data: { key: { remoteJid: '5521987654321@s.whatsapp.net', id: 'L' }, message: { conversation: 'x'.repeat(5000) } } }).mensagens[0]?.texto.length, 4000, 'texto longo cabe numa resposta de chamado')

const id1 = '0f8fad5b-d9cb-469f-a165-70867728950e'
const id2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
igual(alvoDoLink(`/chamados/${id1}`), { tipo: 'chamado', id: id1 }, 'aviso de chamado')
igual(alvoDoLink(`/aprovacoes/${id1}`), { tipo: 'aprovacao', id: id1 }, 'aviso de aprovação')
igual(alvoDoLink(`/chat/${id1}`), { tipo: 'chat', canalId: id1, fio: null }, 'aviso do chat')
igual(alvoDoLink(`/chat/${id1}?fio=${id2}`), { tipo: 'chat', canalId: id1, fio: id2 }, 'aviso de fio do chat')
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
igual(ehCancelamento('Cancelar'), true, 'cancelar')
igual(lerEscolha('2', 3), 2, 'escolha 2')
igual(lerEscolha('*3*', 3), 3, 'escolha com negrito')
igual(lerEscolha('opção 1', 3), 1, 'opção 1')
igual(lerEscolha('4', 3), null, 'fora da lista')
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

if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
console.log('WhatsApp: tudo certo.')
