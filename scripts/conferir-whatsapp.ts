/**
 * Confere as regras do WhatsApp: `npx tsx scripts/conferir-whatsapp.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import {
  numeroCanonico, numeroDoJid, formatarNumero, mascararNumero, urlDoServidor, instanciaValida, estadoDaEvolution,
  lerCategoriasDoWhatsapp, decidirWhatsapp, textoDoAviso, lerEventoDoWebhook, interpretarComando, textoDosAvisos, textoDasLidas,
  textoDoMenu, codigoNoFormato,
} from '../lib/whatsapp/regras'

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
igual(urlDoServidor('exemplo.org'), null, 'sem protocolo')
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
igual(mensagem.mensagens, [{ id: 'ABC123', numero: '5521987654321', texto: 'Oi', nome: 'Ana', ignorar: null }], 'mensagem comum')

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

if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
console.log('WhatsApp: tudo certo.')
