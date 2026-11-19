/**
 * Confere a edição escrita na própria Newsletter (lib/newsletter/edicao.ts), sem rede nem banco:
 *   npx tsx scripts/conferir-newsletter-edicao.ts
 *
 * É o que a tela "Nova edição" e a ação de envio têm em comum: limpar o que foi digitado e dizer o que impede o envio.
 */
import {
  conferirEdicao, horarioDoAgendamento, imagemDaEdicao, lerRascunho, linkDoBotao, nomeDaImagem, paraOCampoDeHorario, paragrafosDe,
  LIMITES, RASCUNHO_VAZIO,
} from '../lib/newsletter/edicao'
import { emailDaNewsletter } from '../lib/newsletter/modelo'

let falhas = 0
const ok = (cond: boolean, msg: string) => { if (!cond) { falhas++; console.error('✗', msg) } else console.log('✓', msg) }

const boa = { assunto: 'Novas turmas de dezembro', chamada: 'Inscrições abertas', texto: 'Olá!\n\nAbrimos novas turmas.\nVeja as datas.\n\n\nAté breve.', link: '', rotuloDoBotao: '', imagem: '' }

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

// ---------------------------------------------------------------- a imagem do topo
const ID = '3f2b8c1e-4d5a-4f6b-8a7c-9d0e1f2a3b4c'
const IMAGEM = `https://palacio.cruzvermelhariodejaneiro.org/api/newsletter/imagem/${ID}.jpg`
ok(imagemDaEdicao(IMAGEM) === IMAGEM && imagemDaEdicao(IMAGEM.replace('.jpg', '.png')) !== null && imagemDaEdicao('') === null, 'a imagem que o Palácio devolveu vale (jpg e png); vazio é sem imagem')
ok([
  'https://outro-site.org/foto.jpg', IMAGEM.replace('https:', 'http:'), IMAGEM.replace('.jpg', '.webp'), IMAGEM.replace('.jpg', '.svg'),
  `${IMAGEM}?x=1`, `${IMAGEM}#a`, IMAGEM.replace(ID, '../../files/1'), IMAGEM.replace(ID, 'abc'), 'javascript:alert(1)', 'data:image/png;base64,AAAA',
].every((u) => imagemDaEdicao(u) === null), 'imagem de fora, http, webp, svg, com parâmetros, com caminho montado ou embutida: recusadas')
ok(nomeDaImagem(`${ID}.jpg`) === `${ID}.jpg` && [`${ID}.gif`, `../${ID}.jpg`, `${ID}.jpg/x`, 'avatars/x.jpg', '', `${ID.toUpperCase()}.jpg`].every((n) => nomeDaImagem(n) === null),
  'a rota pública só serve o nome exato de uma imagem de edição')
const comImagem = conferirEdicao({ ...boa, imagem: IMAGEM })
ok(comImagem.erros.length === 0 && comImagem.edicao.imagemUrl === IMAGEM && certa.edicao.imagemUrl === undefined, 'com imagem: o endereço vai na edição; sem, o campo nem vai')
ok(conferirEdicao({ ...boa, imagem: 'https://outro-site.org/foto.jpg' }).erros.some((e) => e.includes('imagem')), 'imagem que não é do Palácio: erro, e não mensagem com imagem de terceiros')
const msgComImagem = emailDaNewsletter({ titulo: comImagem.edicao.assunto, ...comImagem.edicao, urlDeSaida: '#' })
ok(msgComImagem.html.includes(`<img src="${IMAGEM}"`) && msgComImagem.html.includes('alt="Novas turmas de dezembro"') && msgComImagem.html.indexOf('<img src="' + IMAGEM) < msgComImagem.html.indexOf('<h1'),
  'a mensagem leva a imagem acima do título, com o assunto como texto alternativo')

// ---------------------------------------------------------------- o horário do agendamento
const AGORA = new Date('2026-11-19T18:00:00Z') // 15:00 em Brasília
const h = (local: unknown) => horarioDoAgendamento(local, AGORA)
ok(JSON.stringify(h('2026-11-20T09:00')) === JSON.stringify({ quando: '2026-11-20T12:00:00.000Z' }), '9h de Brasília é 12h UTC')
ok(JSON.stringify(h('2026-11-19T23:30')) === JSON.stringify({ quando: '2026-11-20T02:30:00.000Z' }), '23h30 de Brasília cai no dia seguinte em UTC')
ok('erro' in h('2026-11-19T15:05') && 'erro' in h('2026-11-19T14:00') && 'erro' in h('2020-01-01T09:00'), 'menos de 10 minutos à frente, ou no passado: não agenda')
ok('quando' in h('2026-11-19T15:10') && 'quando' in h('2027-01-18T15:00') && 'erro' in h('2027-01-18T15:01'), 'os limites: 10 minutos e 60 dias, inclusive')
ok(['', null, undefined, 42, 'amanhã', '2026-13-01T09:00', '2026-02-31T09:00', '2026-11-20T25:00', '2026-11-20'].every((v) => 'erro' in h(v)), 'vazio, formato errado e data que não existe (31 de fevereiro, 25 horas): erro, sem quebrar')
ok(paraOCampoDeHorario(AGORA) === '2026-11-19T15:00' && JSON.stringify(h(paraOCampoDeHorario(new Date('2026-11-20T12:00:00Z')))) === JSON.stringify({ quando: '2026-11-20T12:00:00.000Z' }),
  'o campo mostra a hora de Brasília, e ida e volta dão no mesmo instante')

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
