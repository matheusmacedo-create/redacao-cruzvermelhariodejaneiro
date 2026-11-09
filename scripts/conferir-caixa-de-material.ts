/**
 * Confere a caixa "Receba a lista do kit de emergência no seu e-mail" das matérias (lib/site/caixa-de-material.ts),
 * o cadastro do material (lib/newsletter/materiais.ts) e a mensagem que entrega o arquivo (lib/newsletter/modelo.ts).
 * Rode com: npx tsx scripts/conferir-caixa-de-material.ts
 *
 * - a lista de matérias: endereços válidos, sem repetição, e cada uma numa variante só;
 * - a página da matéria listada sai com a caixa (formulário, aceite, armadilha, estilo e script) e passa na guarda;
 * - o aceite que a caixa mostra é, letra por letra, o que a rota grava;
 * - a página de qualquer outra matéria sai sem nada da caixa;
 * - o id do material só aceita o que está cadastrado;
 * - a mensagem diz que o botão baixa E confirma, e leva o link de saída;
 * - a trava do arquivo: sem o PDF respondendo no site, a página sai sem a caixa.
 */
import { montarPaginaDoArtigo } from '../lib/site/artigo-html'
import { problemasDaPagina } from '../lib/site/guarda-da-pagina'
import { slugValido } from '../lib/site/slug'
import {
  MATERIAS_COM_A_LISTA_DO_KIT, ROTA_DE_INSCRICAO_PADRAO, caixaDaMateria, htmlDaCaixaDeMaterial, type Variante,
} from '../lib/site/caixa-de-material'
import { KIT_DE_EMERGENCIA, materialPorId, todosOsMateriais } from '../lib/newsletter/materiais'
import { emailDoMaterial } from '../lib/newsletter/modelo'
import { esquecerMateriaisConferidos, materialNoAr } from '../lib/site/material-no-ar'
import { TEXTO_DO_CONSENTIMENTO } from '../lib/newsletter/inscricao'

let falhas = 0
const ok = (cond: boolean, msg: string) => { if (!cond) { falhas++; console.error('✗', msg) } else console.log('✓', msg) }

// ---------------------------------------------------------------- a lista de matérias
const variantes = Object.keys(MATERIAS_COM_A_LISTA_DO_KIT) as Variante[]
const todas = variantes.flatMap((v) => MATERIAS_COM_A_LISTA_DO_KIT[v])
ok(todas.length > 0 && todas.every(slugValido), `os ${todas.length} endereços da lista são endereços válidos de matéria`)
ok(new Set(todas).size === todas.length, 'nenhuma matéria aparece duas vezes (nem em duas variantes)')
ok(variantes.every((v) => MATERIAS_COM_A_LISTA_DO_KIT[v].every((s) => caixaDaMateria(s)?.variante === v)), 'cada matéria da lista ganha a caixa da sua variante')
ok(caixaDaMateria('lei-do-voluntariado-o-que-diz-a-lei-9608') === null && caixaDaMateria('') === null && caixaDaMateria(null) === null && caixaDaMateria('previa') === null,
  'matéria fora da lista, endereço vazio e a prévia sem endereço ficam sem caixa')
ok(caixaDaMateria('kit-de-primeiros-socorros-escolar-lei-lucas') === null && caixaDaMateria('sinais-de-infarto-o-que-nao-ignorar') === null,
  'advertorial da Lei Lucas e sinais de infarto ficam de fora, como decidido na ronda')

// ---------------------------------------------------------------- o material
const kit = KIT_DE_EMERGENCIA
ok(materialPorId('kit-de-emergencia') === kit && materialPorId('  kit-de-emergencia ') === kit, 'o id cadastrado acha o material (com espaço em volta também)')
ok([undefined, null, '', 'kit', 'constructor', '__proto__', 'toString', 'KIT-DE-EMERGENCIA', 'kit-de-emergencia/../x', 42, {}, ['kit-de-emergencia']].every((v) => materialPorId(v) === null),
  'id ausente, desconhecido, herdado de objeto, com maiúscula, com caminho ou que não é texto: nenhum material')
for (const m of todosOsMateriais()) {
  ok(/^https:\/\/cruzvermelhariodejaneiro\.org\/[a-z0-9/-]+\.pdf$/.test(m.arquivo), `${m.id}: o arquivo é um PDF do site institucional`)
  ok(m.guia.startsWith('https://cruzvermelhariodejaneiro.org/') && m.guia.includes('#'), `${m.id}: o guia é do site e aponta a âncora de baixar`)
  ok(m.consentimento.includes('Autorizo') && m.consentimento.includes('sair da lista') && /not[ií]cias/.test(m.consentimento), `${m.id}: o aceite fala do envio, das notícias e de como sair`)
  ok(m.consentimento !== TEXTO_DO_CONSENTIMENTO, `${m.id}: o aceite é o do material, não o da inscrição comum`)
  ok(m.email.assunto.length <= 60 && m.email.chamada.length <= 140, `${m.id}: assunto até 60 e chamada até 140 caracteres`)
  ok(/^[a-z]+(_[a-z]+)*$/.test(m.evento), `${m.id}: o evento de medição tem nome de evento do GA4`)
  ok(m.recado.length <= 240 && m.recadoSemEnvio.length <= 240, `${m.id}: os recados cabem na página de resposta sem JavaScript (240 caracteres)`)
}

// ---------------------------------------------------------------- a página
const base = { titulo: 'Plano familiar de emergência no Rio: como montar', subtitulo: 'O que combinar em casa.', corpo: 'Combine um ponto de encontro.\n\n## Fontes\n\n- Defesa Civil', baseUrl: 'https://cruzvermelhariodejaneiro.org/noticias', publicadoEm: new Date('2026-10-28T12:00:00Z') }
const comCaixa = montarPaginaDoArtigo({ ...base, slug: 'plano-familiar-de-emergencia-no-rio' })
const semCaixa = montarPaginaDoArtigo({ ...base, slug: 'lei-do-voluntariado-o-que-diz-a-lei-9608' })
const escapado = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

ok(comCaixa.includes('class="news-material"') && comCaixa.includes('Receba a lista do kit de emergência no seu e\u2011mail'), 'a matéria de emergência sai com a caixa e o título dela')
ok(comCaixa.includes(`action="${ROTA_DE_INSCRICAO_PADRAO}" method="post"`) && ROTA_DE_INSCRICAO_PADRAO === 'https://palacio.cruzvermelhariodejaneiro.org/api/newsletter/inscrever',
  'sem rota informada, o formulário manda para a rota de inscrição do Palácio')
ok(comCaixa.includes('<input type="hidden" name="material" value="kit-de-emergencia">'), 'o formulário leva o id do material')
ok(comCaixa.includes(`<span>${escapado(kit.consentimento)}</span>`), 'o aceite mostrado é, letra por letra, o texto que a rota grava')
ok(/<input type="checkbox" name="consentimento" value="1" required>/.test(comCaixa) && /type="email" name="email"[^>]* required>/.test(comCaixa), 'e-mail e aceite são obrigatórios no próprio formulário')
ok(comCaixa.includes('name="site" tabindex="-1"') && comCaixa.includes('news-material-armadilha'), 'a armadilha para robôs está no formulário, fora da tela e da ordem do teclado')
ok(comCaixa.includes('<label class="news-material-rotulo" for="news-material-email">Seu e-mail</label>') && comCaixa.includes('id="news-material-email"'), 'o campo tem rótulo escrito, ligado a ele')
ok(comCaixa.includes('<p class="news-material-guia" hidden>') && comCaixa.includes('href="/kit-de-emergencia/#baixar"'), 'o link do guia existe, escondido até o envio, a partir da raiz do site')
ok(comCaixa.includes('.news-material [hidden]{display:none}') && comCaixa.includes('min-height:52px') && comCaixa.includes('font-size:17px'), 'o estilo vem junto: [hidden] some de verdade, campo e botão com 52 px e letra de 17 px')
ok(comCaixa.includes("window.gtag('event', caixa.getAttribute('data-evento')") && comCaixa.includes('data-evento="kit_pedir"') && comCaixa.includes('data-variante="emergencia"'), 'o script mede o pedido aceito (kit_pedir, com a variante)')
ok(comCaixa.indexOf('class="news-material"') > comCaixa.indexOf('class="news-body"') && comCaixa.indexOf('class="news-material"') < comCaixa.indexOf('class="news-source"'), 'a caixa fica depois do texto e antes da linha "Publicado por"')
ok((comCaixa.match(/class="news-material"/g) ?? []).length === 1, 'uma caixa só por página')
ok(problemasDaPagina(comCaixa).length === 0, `a guarda da página aceita a matéria com a caixa: ${problemasDaPagina(comCaixa).join('; ')}`)

const primeirosSocorros = montarPaginaDoArtigo({ ...base, slug: 'suspeita-de-fratura-o-que-fazer' })
ok(primeirosSocorros.includes('Receba a lista do kit de primeiros socorros no seu e\u2011mail') && primeirosSocorros.includes('data-variante="primeiros-socorros"') && primeirosSocorros.includes('value="kit-de-emergencia"'),
  'a matéria de primeiros socorros muda o título e o texto, não o material')

const comRota = montarPaginaDoArtigo({ ...base, slug: 'plano-familiar-de-emergencia-no-rio', rotaDeInscricao: 'https://exemplo.org/api/newsletter/inscrever?a=1&b="2"' })
ok(comRota.includes('action="https://exemplo.org/api/newsletter/inscrever?a=1&amp;b=&quot;2&quot;"'), 'a rota informada entra no formulário, escapada')

ok(!semCaixa.includes('news-material') && !semCaixa.includes('kit_pedir') && !semCaixa.includes('name="material"'), 'matéria fora da lista: nada da caixa, nem estilo, nem script')
ok(semCaixa === montarPaginaDoArtigo({ ...base, slug: 'lei-do-voluntariado-o-que-diz-a-lei-9608', rotaDeInscricao: 'https://exemplo.org/x' }), 'e a rota informada não muda uma página sem caixa')

const caixaSolta = htmlDaCaixaDeMaterial({ material: kit, variante: 'emergencia' })
ok(!/<script/i.test(caixaSolta) && !/\son[a-z]+=/i.test(caixaSolta), 'o HTML da caixa não leva script nem atributo de evento (o script é um bloco só, no fim da página)')

// ---------------------------------------------------------------- a mensagem
const urlBaixar = 'https://palacio.cruzvermelhariodejaneiro.org/newsletter/confirmar?t=' + 'a'.repeat(48) + '&m=kit-de-emergencia'
const urlDeSaida = 'https://palacio.cruzvermelhariodejaneiro.org/newsletter/sair?t=' + 'b'.repeat(48)
const msg = emailDoMaterial({ material: kit, urlBaixar, urlDeSaida })
ok(msg.assunto === kit.email.assunto, 'o assunto é o do material')
ok(msg.html.includes(`href="${escapado(urlBaixar)}"`) && msg.html.includes('>Baixar a lista em PDF</a>'), 'o botão "Baixar a lista em PDF" leva ao link de confirmação com o material')
ok(msg.html.includes('você baixa a lista e confirma o seu e-mail') && msg.texto.includes('você baixa a lista e confirma o seu e-mail'), 'a mensagem diz, em HTML e em texto, que o botão baixa e confirma')
ok(msg.html.includes(`href="${urlDeSaida}"`) && msg.texto.includes(`Sair da lista: ${urlDeSaida}`), 'o link de saída vai no rodapé das duas versões')
ok(msg.html.includes('porque pediram a lista do kit de emergência no nosso site') && !msg.html.includes('porque confirmou a inscrição'), 'o rodapé diz por que a pessoa recebeu (ela ainda não confirmou nada)')
ok(msg.html.includes(`href="${kit.guia}"`) && msg.texto.includes(kit.guia), 'a mensagem aponta o guia do site')
ok(msg.html.includes('Não foi você?') && msg.texto.includes('Não foi você?'), 'e diz o que fazer a quem não pediu')
ok(msg.texto.includes(urlBaixar), 'a versão em texto tem o endereço de baixar por extenso')

// ---------------------------------------------------------------- a trava do arquivo
const semArquivo = montarPaginaDoArtigo({ ...base, slug: 'plano-familiar-de-emergencia-no-rio', semCaixaDeMaterial: true })
ok(!semArquivo.includes('news-material') && !semArquivo.includes('kit_pedir'), 'com a trava ligada, a matéria da lista sai sem a caixa, sem estilo e sem script')

async function trava() {
  const chamadas: { url: string; metodo?: string }[] = []
  const responde = (status: number, tipo: string): typeof fetch => (async (url: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(url), metodo: init?.method })
    return new Response(null, { status, headers: { 'content-type': tipo } })
  }) as typeof fetch
  const cai: typeof fetch = (async () => { throw new Error('sem rede') }) as typeof fetch
  let relogio = 1_000_000
  const agora = () => relogio

  esquecerMateriaisConferidos()
  ok(await materialNoAr(kit, responde(200, 'application/pdf'), agora) === true && chamadas[0]?.url === kit.arquivo && chamadas[0]?.metodo === 'HEAD', 'arquivo no ar (200, PDF): a caixa entra; a conferência é um HEAD no endereço do arquivo')
  ok(await materialNoAr(kit, responde(404, 'text/html'), agora) === true && chamadas.length === 1, 'a resposta boa fica guardada: a rodada inteira faz uma leitura só')
  relogio += 11 * 60_000
  ok(await materialNoAr(kit, responde(404, 'text/html'), agora) === false && chamadas.length === 2, 'passados 10 minutos, confere de novo; 404 é "não está no ar"')
  relogio += 30_000
  ok(await materialNoAr(kit, responde(200, 'application/pdf'), agora) === false && chamadas.length === 2, 'a falha fica guardada por um minuto (não martela o site)')
  relogio += 61_000
  ok(await materialNoAr(kit, responde(200, 'text/html; charset=utf-8'), agora) === false, '200 com página HTML não é o arquivo')
  relogio += 61_000
  ok(await materialNoAr(kit, cai, agora) === false, 'site fora do ar ou tempo esgotado: "não", sem lançar erro')
  relogio += 61_000
  ok(await materialNoAr(kit, responde(200, 'application/pdf'), agora) === true, 'e volta a "sim" quando o arquivo responde')
  esquecerMateriaisConferidos()
}

trava().then(() => {
  console.log(falhas ? `\n${falhas} falha(s)` : `\nTudo certo: ${todas.length} matérias com a caixa (${variantes.map((v) => `${MATERIAS_COM_A_LISTA_DO_KIT[v].length} de ${v}`).join(', ')}).`)
  process.exit(falhas ? 1 : 0)
})
