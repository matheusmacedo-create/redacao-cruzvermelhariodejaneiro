/**
 * Confere a edição escrita na própria Newsletter (lib/newsletter/edicao.ts), sem rede nem banco:
 *   npx tsx scripts/conferir-newsletter-edicao.ts
 *
 * É o que a tela "Nova edição" e a ação de envio têm em comum: limpar o que foi digitado e dizer o que impede o envio.
 */
import { conferirEdicao, lerRascunho, linkDoBotao, paragrafosDe, LIMITES, RASCUNHO_VAZIO } from '../lib/newsletter/edicao'
import { emailDaNewsletter } from '../lib/newsletter/modelo'

let falhas = 0
const ok = (cond: boolean, msg: string) => { if (!cond) { falhas++; console.error('✗', msg) } else console.log('✓', msg) }

const boa = { assunto: 'Novas turmas de dezembro', chamada: 'Inscrições abertas', texto: 'Olá!\n\nAbrimos novas turmas.\nVeja as datas.\n\n\nAté breve.', link: '', rotuloDoBotao: '' }

// ---------------------------------------------------------------- parágrafos
ok(JSON.stringify(paragrafosDe(boa.texto)) === JSON.stringify(['Olá!', 'Abrimos novas turmas. Veja as datas.', 'Até breve.']), 'linha em branco separa parágrafos; quebra simples vira espaço; linhas em branco a mais somem')
ok(paragrafosDe('  \n\n \r\n ').length === 0 && paragrafosDe('um\r\n\r\ndois').length === 2, 'texto só de espaços não tem parágrafo; quebra do Windows conta igual')

// ---------------------------------------------------------------- o link do botão
ok(linkDoBotao('https://cruzvermelhariodejaneiro.org/doar') === 'https://cruzvermelhariodejaneiro.org/doar', 'https fica como está')
ok(linkDoBotao('cruzvermelhariodejaneiro.org/doar') === 'https://cruzvermelhariodejaneiro.org/doar', 'sem protocolo: entende https')
ok(linkDoBotao('') === null && linkDoBotao('   ') === null, 'vazio: sem botão')
ok(['http://site.org', 'javascript:alert(1)', 'mailto:a@b.org', 'data:text/html,x', 'https://semponto', 'duas palavras.org', 'ftp://a.org'].every((l) => linkDoBotao(l) === null),
  'http, javascript:, mailto:, data:, ftp, host sem ponto e texto com espaço: recusados')

// ---------------------------------------------------------------- a conferência
const certa = conferirEdicao(boa)
ok(certa.erros.length === 0 && certa.edicao.assunto === boa.assunto && certa.edicao.chamada === 'Inscrições abertas' && certa.edicao.paragrafos.length === 3 && certa.edicao.urlDaMateria === undefined && certa.edicao.rotuloDoBotao === undefined,
  'edição completa: sem erro, sem botão quando não há link')
ok(conferirEdicao({ ...boa, assunto: '   ' }).erros.some((e) => e.includes('assunto')), 'sem assunto: não envia')
ok(conferirEdicao({ ...boa, texto: ' \n\n ' }).erros.some((e) => e.includes('precisa de texto')), 'sem texto: não envia')
ok(conferirEdicao(RASCUNHO_VAZIO).erros.length >= 2 && conferirEdicao(null).erros.length >= 2 && conferirEdicao('texto solto').erros.length >= 2, 'em branco, null ou formato errado: erros, sem quebrar')
ok(conferirEdicao({ ...boa, assunto: 'NOVAS TURMAS DE DEZEMBRO' }).avisos.some((a) => a.includes('maiúsculas')) && conferirEdicao({ ...boa, assunto: 'NOVAS TURMAS DE DEZEMBRO' }).erros.length === 0,
  'assunto em maiúsculas: aviso (a regra do canal), e não erro')
ok(conferirEdicao({ ...boa, assunto: 'a'.repeat(70) }).avisos.some((a) => a.includes('60 caracteres')), 'assunto longo: aviso de corte no celular')
const comLink = conferirEdicao({ ...boa, link: 'cruzvermelhariodejaneiro.org/doar', rotuloDoBotao: ' Quero doar ' })
ok(comLink.erros.length === 0 && comLink.edicao.urlDaMateria === 'https://cruzvermelhariodejaneiro.org/doar' && comLink.edicao.rotuloDoBotao === 'Quero doar', 'com link: o botão entra, com o texto aparado')
ok(conferirEdicao({ ...boa, link: 'javascript:alert(1)' }).erros.some((e) => e.includes('link do botão')), 'link que não serve: erro, e não botão quebrado')
const soRotulo = conferirEdicao({ ...boa, rotuloDoBotao: 'Quero doar' })
ok(soRotulo.erros.length === 0 && soRotulo.avisos.some((a) => a.includes('sem link')) && soRotulo.edicao.rotuloDoBotao === undefined, 'texto do botão sem link: aviso, e a edição sai sem botão')
ok(conferirEdicao({ ...boa, texto: 'a'.repeat(LIMITES.texto + 1) }).erros.some((e) => e.includes('Gmail corta')), 'texto acima do limite: erro, com o porquê')
ok(conferirEdicao({ ...boa, chamada: '' }).edicao.chamada === undefined, 'sem chamada: o campo nem vai')

// ---------------------------------------------------------------- o que foi digitado não é confiável
const sujo = lerRascunho({ assunto: 'Uma\nlinha\tsó', chamada: 42, texto: ['x'], link: '  https://a.org  ', extra: 'ignorado' })
ok(sujo.assunto === 'Uma linha só' && sujo.chamada === '' && sujo.texto === '' && sujo.link === 'https://a.org' && !('extra' in sujo), 'rascunho: assunto numa linha só, tipos errados viram vazio, campo a mais é ignorado')

// ---------------------------------------------------------------- vira a mensagem de verdade
const msg = emailDaNewsletter({ titulo: comLink.edicao.assunto, ...comLink.edicao, urlDeSaida: 'https://palacio.exemplo/sair?t=x' })
ok(msg.html.includes('>Quero doar</a>') && msg.html.includes('href="https://cruzvermelhariodejaneiro.org/doar"') && msg.html.includes('Abrimos novas turmas. Veja as datas.') && msg.html.includes('Sair da lista'),
  'a edição conferida monta a mensagem: botão, parágrafos e link de saída')
const perigosa = conferirEdicao({ ...boa, assunto: 'Aviso <script>alert(1)</script>', texto: '<img src=x onerror=alert(1)>' })
const msgPerigosa = emailDaNewsletter({ titulo: perigosa.edicao.assunto, ...perigosa.edicao, urlDeSaida: '#' })
ok(!msgPerigosa.html.includes('<script>alert') && !msgPerigosa.html.includes('<img src=x'), 'HTML digitado no assunto ou no texto sai escapado na mensagem')
ok(!msg.html.includes('confirmou a inscrição'), 'o rodapé não fala mais em confirmar a inscrição')

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
