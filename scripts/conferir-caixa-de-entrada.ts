/**
 * Confere as regras da caixa de entrada do E-mail do setor (lib/correio/leitura.ts)
 * e a montagem da resposta (lib/correio/mensagem.ts).
 * Rode com: npx tsx scripts/conferir-caixa-de-entrada.ts
 */
import {
  assuntoDaResposta, cabecalhosDaResposta, citacao, consultaDaPasta, destinatariosDaResposta, documentoDeLeitura, envolveOEndereco,
  lerEnderecos, lerMensagem, limparBusca, partesDaMensagem, type MensagemDoGmail, type ParteDoGmail,
} from '../lib/correio/leitura'
import { comCitacao, corpoComAssinatura, montarMensagem } from '../lib/correio/mensagem'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`)
}
const b64 = (s: string, enc: BufferEncoding = 'utf8') => Buffer.from(s, enc).toString('base64url')
const h = (pares: Record<string, string>) => Object.entries(pares).map(([name, value]) => ({ name, value }))

// Endereços
confere('endereços com vírgula nas aspas', lerEnderecos('"Silva, Ana" <Ana@X.org>, b@y.org; Carlos <c@z.org>'), [
  { nome: 'Silva, Ana', email: 'ana@x.org' }, { nome: '', email: 'b@y.org' }, { nome: 'Carlos', email: 'c@z.org' }])
confere('nome em encoded-word', lerEnderecos('=?UTF-8?B?Sm/Do28=?= <j@x.org>')[0].nome, 'João')

// O que é do setor
const para = (to: string, extra: Record<string, string> = {}): ParteDoGmail => ({ headers: h({ From: 'fora@x.org', To: to, ...extra }) })
confere('para o endereço', envolveOEndereco(para('compras@cvrj.org'), 'compras@cvrj.org'), true)
confere('cc do endereço', envolveOEndereco(para('a@x.org', { Cc: 'Compras <COMPRAS@cvrj.org>' }), 'compras@cvrj.org'), true)
confere('delivered-to (cópia oculta)', envolveOEndereco(para('lista@x.org', { 'Delivered-To': 'compras@cvrj.org' }), 'compras@cvrj.org'), true)
confere('saiu do endereço', envolveOEndereco({ headers: h({ From: 'compras@cvrj.org', To: 'b@y.org' }) }, 'compras@cvrj.org'), true)
confere('de outro setor não', envolveOEndereco(para('rh@cvrj.org'), 'compras@cvrj.org'), false)
confere('parecido não conta', envolveOEndereco(para('compras@cvrj.org.br, xcompras@cvrj.org'), 'compras@cvrj.org'), false)

// A busca não solta a trava do endereço
confere('busca limpa', limparBusca('nota fiscal'), 'nota fiscal')
confere('parênteses e OR saem', limparBusca(') OR (deliveredto:rh@cvrj.org'), 'deliveredto:rh@cvrj.org')
confere('chaves e aspas saem', limparBusca('{to:rh@x} "a b"'), 'to:rh@x a b')
confere('entrada', consultaDaPasta('Compras@cvrj.org', 'entrada'), '(to:compras@cvrj.org OR cc:compras@cvrj.org OR deliveredto:compras@cvrj.org) in:inbox')
confere('enviados', consultaDaPasta('compras@cvrj.org', 'enviados'), 'from:compras@cvrj.org in:sent')
confere('entrada + busca maliciosa fica presa', consultaDaPasta('compras@cvrj.org', 'entrada', ') OR (to:rh@cvrj.org'),
  '(to:compras@cvrj.org OR cc:compras@cvrj.org OR deliveredto:compras@cvrj.org) in:inbox to:rh@cvrj.org')
confere('endereço com caractere estranho é limpo', consultaDaPasta('a) OR (b@x.org', 'enviados'), 'from:aorb@x.org in:sent')

// MIME: alternativa, latin1, anexo e imagem embutida
const raiz: ParteDoGmail = {
  mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/related', parts: [
      { mimeType: 'multipart/alternative', parts: [
        { partId: '0.0.0', mimeType: 'text/plain', headers: h({ 'Content-Type': 'text/plain; charset="ISO-8859-1"' }), body: { data: b64('Ol\xe1, cota\xe7\xe3o', 'latin1') } },
        { partId: '0.0.1', mimeType: 'text/html', headers: h({ 'Content-Type': 'text/html; charset=utf-8' }), body: { data: b64('<p>Olá <img src="cid:logo@x"></p><script>alert(1)</script><a href="javascript:alert(2)" onclick="x()">link</a>') } },
      ] },
      { partId: '0.1', mimeType: 'image/png', filename: 'logo.png', headers: h({ 'Content-ID': '<logo@x>', 'Content-Disposition': 'inline' }), body: { attachmentId: 'A1', size: 2048 } },
    ] },
    { partId: '1', mimeType: 'application/pdf', filename: 'proposta.pdf', headers: h({ 'Content-Disposition': 'attachment; filename="proposta.pdf"' }), body: { attachmentId: 'A2', size: 150000 } },
  ],
}
const partes = partesDaMensagem(raiz)
confere('texto em latin1', partes.texto, 'Olá, cotação')
confere('html achado', partes.html?.startsWith('<p>Olá'), true)
confere('anexos', partes.anexos.map((a) => [a.nome, a.parte, a.cid, a.embutido]), [['logo.png', '0.1', 'logo@x', true], ['proposta.pdf', '1', null, false]])
const doc = documentoDeLeitura(partes, (a) => `/api/correio/anexo?parte=${a.parte}`)
confere('script sai', doc.includes('<script'), false)
confere('onclick sai', /onclick/i.test(doc), false)
confere('javascript: sai', doc.includes('javascript:'), false)
confere('cid vira o anexo', doc.includes('src="/api/correio/anexo?parte=0.1"'), true)
confere('links em nova aba e CSP', doc.includes('<base target="_blank">') && doc.includes('Content-Security-Policy'), true)
confere('texto puro vira link', documentoDeLeitura({ html: null, texto: 'veja https://x.org/a <b>', anexos: [] }, () => '').includes('<a href="https://x.org/a">https://x.org/a</a> &lt;b&gt;'), true)

// Mensagem inteira e resposta
const msg: MensagemDoGmail = {
  id: 'm1', threadId: 't1', labelIds: ['INBOX', 'UNREAD'], snippet: 'Segue a proposta &#39;final&#39;', internalDate: String(Date.UTC(2026, 8, 27, 15, 0)),
  payload: { ...raiz, headers: h({ From: 'Loja <vendas@loja.com>', To: 'compras@cvrj.org, outro@loja.com', Cc: 'rh@cvrj.org', Subject: 'Proposta', 'Message-ID': '<abc@loja.com>', References: '<x@loja.com>' }) },
}
const lida = lerMensagem(msg)
confere('lida: não lida, resumo e assunto', [lida.naoLida, lida.resumo, lida.assunto, lida.de?.email], [true, "Segue a proposta 'final'", 'Proposta', 'vendas@loja.com'])
confere('responder: só o remetente', destinatariosDaResposta(lida, 'compras@cvrj.org', false), { para: ['vendas@loja.com'], cc: [] })
confere('responder a todos: sem o próprio endereço', destinatariosDaResposta(lida, 'compras@cvrj.org', true), { para: ['vendas@loja.com'], cc: ['outro@loja.com', 'rh@cvrj.org'] })
confere('responder ao que o setor mandou vai para quem recebeu', destinatariosDaResposta({ de: { nome: '', email: 'compras@cvrj.org' }, para: [{ nome: '', email: 'b@y.org' }], cc: [] }, 'compras@cvrj.org', false), { para: ['b@y.org'], cc: [] })
confere('Re: uma vez só', [assuntoDaResposta('Proposta', 'responder'), assuntoDaResposta('RE: Proposta', 'responder'), assuntoDaResposta('Proposta', 'encaminhar'), assuntoDaResposta('Fwd: x', 'encaminhar')], ['Re: Proposta', 'RE: Proposta', 'Enc: Proposta', 'Fwd: x'])
confere('cabeçalhos da conversa', cabecalhosDaResposta(lida), { emRespostaA: '<abc@loja.com>', referencias: '<x@loja.com> <abc@loja.com>' })
const cit = citacao(lida, 'responder')
confere('citação em texto', cit.texto.split('\n').slice(1), ['> Olá, cotação'])
const bruto = montarMensagem({
  de: { nome: 'Compras', email: 'compras@cvrj.org' }, para: ['vendas@loja.com'], assunto: 'Re: Proposta',
  ...comCitacao(corpoComAssinatura('Obrigado.', '<b>Compras</b>'), { html: '<p>preço $& e $1</p>', texto: '> x' }),
  emResposta: cabecalhosDaResposta(lida), fronteira: 'F',
}).bruto
confere('In-Reply-To e References', bruto.includes('In-Reply-To: <abc@loja.com>\r\nReferences: <x@loja.com> <abc@loja.com>'), true)
const html = Buffer.from(bruto.split('Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--F')[0].replace(/\r\n/g, ''), 'base64').toString('utf8')
confere('citação depois da assinatura, com $& intacto', html.indexOf('Compras</b>') < html.indexOf('preço $& e $1'), true)

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
