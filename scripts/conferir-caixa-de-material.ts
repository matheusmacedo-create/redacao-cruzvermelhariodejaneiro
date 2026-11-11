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
 * - quem já está na lista: recebe a lista (uma vez por dia), numa mensagem sem confirmação, e o formulário da home
 *   continua sem mandar nada a quem já confirmou (lib/newsletter/decisao.ts);
 * - a trava do arquivo: sem o PDF respondendo no site, a página sai sem a caixa.
 */
import { montarPaginaDoArtigo } from '../lib/site/artigo-html'
import { problemasDaPagina } from '../lib/site/guarda-da-pagina'
import { slugValido } from '../lib/site/slug'
import {
  MATERIAS_COM_A_LISTA_DO_KIT, ROTA_DE_INSCRICAO_PADRAO, caixaDaMateria, htmlDaCaixaDeMaterial, type Variante,
} from '../lib/site/caixa-de-material'
import {
  KIT_DE_EMERGENCIA, KIT_DE_PRIMEIROS_SOCORROS, KIT_LEI_LUCAS, MANUAL_DE_IDENTIDADE, MOCHILA_DE_EMERGENCIA, PLANO_FAMILIAR, QUANDO_LIGAR_192,
  ROTEIRO_PLANO_DE_CONTINGENCIA, VERAO_SEGURO, materialPorId,
  todosOsMateriais,
} from '../lib/newsletter/materiais'
import { emailDoMaterial } from '../lib/newsletter/modelo'
import { esquecerMateriaisConferidos, materialNoAr } from '../lib/site/material-no-ar'
import { TEXTO_DO_CONSENTIMENTO } from '../lib/newsletter/inscricao'
import {
  decidirInscricao, HORAS_ENTRE_ENTREGAS, LIMITE_POR_IP, MINUTOS_ENTRE_CONVITES, type Decisao, type InscritoExistente,
} from '../lib/newsletter/decisao'

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
ok(caixaDaMateria('kit-de-primeiros-socorros-escolar-lei-lucas') === null && caixaDaMateria('picada-de-cobra-o-que-fazer') === null && caixaDaMateria('choque-eletrico-o-que-fazer') === null,
  'advertorial da Lei Lucas, picada de cobra e choque elétrico ficam de fora: nenhum guia trata deles')

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
const comCaixa = montarPaginaDoArtigo({ ...base, slug: 'o-que-fazer-em-alagamento' })
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
ok(primeirosSocorros.includes('Receba a lista do kit de primeiros socorros no seu e\u2011mail') && primeirosSocorros.includes('data-variante="primeiros-socorros"') && primeirosSocorros.includes('value="kit-de-primeiros-socorros"')
  && primeirosSocorros.includes('data-evento="primeiros_socorros_pedir"') && primeirosSocorros.includes('href="/kit-de-primeiros-socorros/#baixar"')
  && primeirosSocorros.includes(`<span>${escapado(KIT_DE_PRIMEIROS_SOCORROS.consentimento)}</span>`) && !primeirosSocorros.includes('value="kit-de-emergencia"'),
  'a matéria de primeiros socorros pede o guia do kit de primeiros socorros: material, evento, guia e aceite dele')
ok(MATERIAS_COM_A_LISTA_DO_KIT.emergencia.every((s) => caixaDaMateria(s)?.material === KIT_DE_EMERGENCIA)
  && MATERIAS_COM_A_LISTA_DO_KIT['primeiros-socorros'].every((s) => caixaDaMateria(s)?.material === KIT_DE_PRIMEIROS_SOCORROS),
  'cada variante entrega o seu material')
ok(KIT_DE_PRIMEIROS_SOCORROS.arquivo === 'https://cruzvermelhariodejaneiro.org/kit-de-primeiros-socorros/kit-de-primeiros-socorros-cruz-vermelha-rj.pdf',
  'o arquivo do kit de primeiros socorros é o que o site publica (o endereço não muda sem mudar o site)')
const msgPs = emailDoMaterial({ material: KIT_DE_PRIMEIROS_SOCORROS, urlBaixar: 'https://palacio.cruzvermelhariodejaneiro.org/newsletter/confirmar?t=' + 'a'.repeat(48) + '&m=kit-de-primeiros-socorros', urlDeSaida: 'https://palacio.cruzvermelhariodejaneiro.org/newsletter/sair?t=' + 'b'.repeat(48) })
ok(msgPs.assunto === KIT_DE_PRIMEIROS_SOCORROS.email.assunto && msgPs.html.includes('porque pediram a lista do kit de primeiros socorros no nosso site') && !/kit de emergência/.test(msgPs.html + msgPs.texto),
  'a mensagem do kit de primeiros socorros fala dele, e não do kit de emergência')

// Os quatro guias de 11/11/2026: cada grupo de matérias pede o seu material, e a caixa fala dele (botão e recado).
for (const [variante, m, slug, titulo, botao, naoChegou] of [
  ['quando-ligar-192', QUANDO_LIGAR_192, 'sinais-de-infarto-o-que-nao-ignorar', 'Receba o cartaz “Quando ligar 192” no seu e\u2011mail', 'Enviar o cartaz para o meu e-mail', 'Não chegou? O cartaz também está no'],
  ['verao', VERAO_SEGURO, 'onda-de-calor-o-que-fazer-para-se-proteger', 'Receba o guia “Verão seguro no Rio” no seu e\u2011mail', 'Enviar o guia para o meu e-mail', 'Não chegou? O guia também está no'],
  ['plano-familiar', PLANO_FAMILIAR, 'plano-familiar-de-emergencia-no-rio', 'Receba a ficha do plano familiar de emergência no seu e\u2011mail', 'Enviar a ficha para o meu e-mail', 'Não chegou? A ficha também está no'],
  ['mochila', MOCHILA_DE_EMERGENCIA, 'sirene-da-defesa-civil-o-que-fazer-quando-toca', 'Receba a lista da mochila de emergência no seu e\u2011mail', 'Enviar a lista para o meu e-mail', 'Não chegou? A lista também está no'],
] as const) {
  const pagina = montarPaginaDoArtigo({ ...base, slug })
  ok(materialPorId(m.id) === m && MATERIAS_COM_A_LISTA_DO_KIT[variante].every((s) => caixaDaMateria(s)?.material === m), `${variante}: o id acha o material e as matérias da variante o entregam`)
  ok(pagina.includes(escapado(titulo)) && pagina.includes(`data-variante="${variante}"`) && pagina.includes(`value="${m.id}"`) && pagina.includes(`data-evento="${m.evento}"`)
    && pagina.includes(`<span>${escapado(m.consentimento)}</span>`) && !pagina.includes('value="kit-de-emergencia"'),
  `${variante}: a matéria sai com o título, o material, o evento e o aceite dele`)
  ok(pagina.includes(`<button type="submit">${botao}</button>`) && pagina.includes(naoChegou) && pagina.includes(`href="${m.guia.replace('https://cruzvermelhariodejaneiro.org', '')}"`),
    `${variante}: o botão e o recado falam de ${m.email.objeto}, e o guia é o da página dele`)
  ok(m.arquivo === `https://cruzvermelhariodejaneiro.org/${m.id}/${m.id}-cruz-vermelha-rj.pdf`, `${m.id}: o arquivo segue o nome do padrão dos guias, na pasta da página`)
  const mensagem = emailDoMaterial({ material: m, urlBaixar: `https://palacio.cruzvermelhariodejaneiro.org/newsletter/confirmar?t=${'a'.repeat(48)}&m=${m.id}`, urlDeSaida: 'https://palacio.cruzvermelhariodejaneiro.org/newsletter/sair?t=' + 'b'.repeat(48) })
  ok(mensagem.html.includes(`>${m.email.botao}</a>`) && mensagem.html.includes(`você baixa ${m.email.objeto} e confirma o seu e-mail`) && !/kit de emergência/.test(mensagem.html + mensagem.texto),
    `${m.id}: a mensagem tem o botão dele, explica que baixa e confirma, e não fala do kit de emergência`)
}
ok(comCaixa.includes('<button type="submit">Enviar a lista para o meu e-mail</button>') && comCaixa.includes('Não chegou? A lista também está no'), 'a caixa do kit de emergência continua dizendo "a lista"')

const comRota = montarPaginaDoArtigo({ ...base, slug: 'o-que-fazer-em-alagamento', rotaDeInscricao: 'https://exemplo.org/api/newsletter/inscrever?a=1&b="2"' })
ok(comRota.includes('action="https://exemplo.org/api/newsletter/inscrever?a=1&amp;b=&quot;2&quot;"'), 'a rota informada entra no formulário, escapada')

// Desde 10/11/2026 a matéria fora da lista leva a caixa da newsletter (lib/site/convites-da-materia.ts), que usa as
// mesmas classes; o que ela não pode levar é o pedido do material.
ok(!semCaixa.includes('class="news-material"') && !semCaixa.includes('data-evento="kit_pedir"') && !semCaixa.includes('name="material"'), 'matéria fora da lista: nada da caixa do kit (sem o material e sem o evento dele)')
ok(semCaixa.replace(ROTA_DE_INSCRICAO_PADRAO, 'https://exemplo.org/x') === montarPaginaDoArtigo({ ...base, slug: 'lei-do-voluntariado-o-que-diz-a-lei-9608', rotaDeInscricao: 'https://exemplo.org/x' }), 'e a rota informada só muda o destino do formulário da newsletter')

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

// ---------------------------------------------------------------- o manual de identidade (11/11/2026)
// Pedido na página /manual-de-identidade/ do site, não numa matéria: nenhuma matéria ganha caixa com ele.
const manual = MANUAL_DE_IDENTIDADE
ok(materialPorId('manual-de-identidade') === manual && new Set(todosOsMateriais().map((m) => m.id)).size === todosOsMateriais().length,
  'o manual tem id próprio e nenhum id se repete')
ok(manual.arquivo === 'https://cruzvermelhariodejaneiro.org/manual-de-identidade/manual-de-identidade-institucional-cruz-vermelha-brasileira.pdf',
  'o arquivo do manual é o que o site publica (o endereço não muda sem mudar o site)')
ok(todas.every((s) => caixaDaMateria(s)?.material !== manual), 'nenhuma matéria ganha a caixa do manual')
const urlManual = 'https://palacio.cruzvermelhariodejaneiro.org/newsletter/confirmar?t=' + 'a'.repeat(48) + '&m=manual-de-identidade'
const msgManual = emailDoMaterial({ material: manual, urlBaixar: urlManual, urlDeSaida })
ok(msgManual.html.includes('>Baixar o manual em PDF</a>') && msgManual.html.includes('você baixa o manual e confirma o seu e-mail') && msgManual.texto.includes('você baixa o manual e confirma o seu e-mail'),
  'a mensagem do manual fala do manual (botão e explicação), em HTML e em texto')
ok(!/\blista do kit\b|cada item da lista|baixa a lista/.test(msgManual.html + msgManual.texto), 'e nada nela fala da lista do kit')
const msgManualInscrito = emailDoMaterial({ material: manual, urlBaixar: manual.arquivo, urlDeSaida, jaInscrito: true })
ok(msgManualInscrito.html.includes('o botão abre o manual direto') && msgManualInscrito.texto.includes('acima abre o manual direto'), 'quem já está na lista: o botão abre o manual direto')

// ---------------------------------------------------------------- os materiais das páginas para instituições (11/11/2026)
// Pedidos nas páginas /lei-lucas-para-escolas/ e /plano-de-contingencia/ do site, como o manual: nenhuma matéria ganha caixa.
for (const [m, id, arquivo, botao] of [
  [KIT_LEI_LUCAS, 'lei-lucas-escolas', 'https://cruzvermelhariodejaneiro.org/lei-lucas-para-escolas/lei-lucas-para-escolas-cruz-vermelha-rj.pdf', 'Baixar o kit em PDF'],
  [ROTEIRO_PLANO_DE_CONTINGENCIA, 'plano-de-contingencia', 'https://cruzvermelhariodejaneiro.org/plano-de-contingencia/plano-de-contingencia-cruz-vermelha-rj.pdf', 'Baixar o roteiro em PDF'],
] as const) {
  ok(materialPorId(id) === m, `${id}: o id acha o material`)
  ok(m.arquivo === arquivo, `${id}: o arquivo é o que o site publica (scripts/gerar_guia_pdf.py)`)
  ok(todas.every((s) => caixaDaMateria(s)?.material !== m), `${id}: nenhuma matéria ganha a caixa dele`)
  const msg = emailDoMaterial({ material: m, urlBaixar: `https://palacio.cruzvermelhariodejaneiro.org/newsletter/confirmar?t=${'a'.repeat(48)}&m=${id}`, urlDeSaida })
  ok(msg.html.includes(`>${botao}</a>`) && msg.html.includes(`você baixa ${m.email.objeto} e confirma o seu e-mail`), `${id}: a mensagem tem o botão e explica que ele baixa e confirma`)
}
ok(new Set(todosOsMateriais().map((m) => m.id)).size === todosOsMateriais().length && new Set(todosOsMateriais().map((m) => m.evento)).size === todosOsMateriais().length,
  'nenhum id nem evento de medição se repete entre os materiais')

// ---------------------------------------------------------------- quem já está na lista
// O caso que motivou a regra (09/11/2026): um inscrito antigo pediu a lista, a caixa disse "vai para o seu e-mail" e
// nada saiu. A decisão é pura, então cada caminho dela é conferido aqui, com relógio fixo.
const AGORA = Date.parse('2026-11-09T22:44:21Z')
const HORA = 3600_000
const ha = (ms: number) => new Date(AGORA - ms).toISOString()
const linha = (estado: NonNullable<InscritoExistente>['estado'], updated_at: string | null): InscritoExistente => ({ id: 'inscrito-1', estado, updated_at })
const decide = (existente: InscritoExistente, extra: { pedeMaterial?: boolean; inscricoesDoIpNaHora?: number } = {}): Decisao =>
  decidirInscricao({ existente, inscricoesDoIpNaHora: 0, agora: AGORA, ...extra })
const igual = (a: Decisao, b: Decisao) => JSON.stringify(a) === JSON.stringify(b)
const antigo = linha('confirmado', ha(70 * 24 * HORA))

ok(igual(decide(antigo, { pedeMaterial: true }), { acao: 'entregar', inscrito: 'inscrito-1' }), 'inscrito antigo que pede a lista: recebe a lista')
ok(igual(decide(antigo), { acao: 'silenciar', porque: 'ja-confirmado' }) && igual(decide(antigo, { pedeMaterial: false }), { acao: 'silenciar', porque: 'ja-confirmado' }),
  'o formulário da home continua sem mandar nada a quem já confirmou')
ok(igual(decide(linha('confirmado', ha(HORAS_ENTRE_ENTREGAS * HORA - 60_000)), { pedeMaterial: true }), { acao: 'silenciar', porque: 'entrega-recente' })
  && igual(decide(linha('confirmado', ha(0)), { pedeMaterial: true }), { acao: 'silenciar', porque: 'entrega-recente' }),
  `pediu de novo antes de ${HORAS_ENTRE_ENTREGAS} horas: nada é enviado (nem um minuto antes, nem no mesmo instante)`)
ok(igual(decide(linha('confirmado', ha(HORAS_ENTRE_ENTREGAS * HORA)), { pedeMaterial: true }), { acao: 'entregar', inscrito: 'inscrito-1' }),
  `completadas as ${HORAS_ENTRE_ENTREGAS} horas, recebe de novo`)
ok(HORAS_ENTRE_ENTREGAS * 60 > MINUTOS_ENTRE_CONVITES, 'a janela de quem já está na lista é mais longa que a do convite de quem não está')
ok(igual(decide(antigo, { pedeMaterial: true, inscricoesDoIpNaHora: LIMITE_POR_IP }), { acao: 'silenciar', porque: 'limite-de-ip' }),
  'o limite por IP continua vindo antes de tudo, também para quem já está na lista')
ok(igual(decide(linha('confirmado', null), { pedeMaterial: true }), { acao: 'entregar', inscrito: 'inscrito-1' })
  && igual(decide(linha('confirmado', 'data-quebrada'), { pedeMaterial: true }), { acao: 'entregar', inscrito: 'inscrito-1' }),
  'linha sem hora (ou com hora ilegível) não trava a entrega: quem decide de verdade é a marca no banco')
ok(igual(decide(null, { pedeMaterial: true }), { acao: 'gravar', atualizar: null }) && igual(decide(null), { acao: 'gravar', atualizar: null }),
  'quem não está na lista entra como sempre, com ou sem material')
ok(igual(decide(linha('pendente', ha(5 * 60_000)), { pedeMaterial: true }), { acao: 'silenciar', porque: 'convite-recente' })
  && igual(decide(linha('pendente', ha((MINUTOS_ENTRE_CONVITES + 1) * 60_000)), { pedeMaterial: true }), { acao: 'gravar', atualizar: 'inscrito-1' }),
  `pendente: o convite (que é a mensagem da lista) não se repete em menos de ${MINUTOS_ENTRE_CONVITES} minutos, e depois sai de novo`)
ok(igual(decide(linha('descadastrado', ha(HORA)), { pedeMaterial: true }), { acao: 'gravar', atualizar: 'inscrito-1' })
  && igual(decide(linha('invalido', ha(HORA)), { pedeMaterial: true }), { acao: 'gravar', atualizar: 'inscrito-1' }),
  'quem saiu da lista não recebe a entrega direta: volta a pendente e só entra de novo confirmando')

// A mensagem de quem já está na lista: o botão é o arquivo, e nada nela fala em confirmar.
const msgInscrito = emailDoMaterial({ material: kit, urlBaixar: kit.arquivo, urlDeSaida, jaInscrito: true })
ok(msgInscrito.assunto === msg.assunto && msgInscrito.html.includes(`href="${kit.arquivo}"`) && msgInscrito.html.includes('>Baixar a lista em PDF</a>') && msgInscrito.texto.includes(kit.arquivo),
  'para quem já está na lista, o mesmo assunto e o mesmo botão, que abre o arquivo direto')
ok(!msgInscrito.html.includes('newsletter/confirmar') && !msgInscrito.texto.includes('newsletter/confirmar'), 'sem link de confirmação: não há o que confirmar')
ok([msgInscrito.html, msgInscrito.texto].every((t) => !t.includes('confirma o seu e-mail') && !t.includes('expira') && t.includes('não há nada a confirmar')),
  'a mensagem diz que não há nada a confirmar, e não promete o que só vale para o convite (HTML e texto)')
ok([msgInscrito.html, msgInscrito.texto].every((t) => t.includes('Não foi você?') && t.includes('nada muda na sua inscrição')), 'e diz a quem não pediu que nada muda na inscrição')
ok(msgInscrito.html.includes('porque pediram a lista do kit de emergência no nosso site') && msgInscrito.html.includes(`href="${urlDeSaida}"`) && msgInscrito.texto.includes(`Sair da lista: ${urlDeSaida}`),
  'o rodapé diz que a mensagem veio de um pedido no site, e o link de saída vai nas duas versões')
ok(msgInscrito.html.includes(`href="${kit.guia}"`) && msgInscrito.texto.includes(kit.guia), 'o guia do site continua na mensagem')
ok(msg.html !== msgInscrito.html && msg.html.includes('você baixa a lista e confirma o seu e-mail') && !msg.html.includes('não há nada a confirmar'), 'e a mensagem de quem ainda não confirmou não mudou')

// ---------------------------------------------------------------- a trava do arquivo
const semArquivo = montarPaginaDoArtigo({ ...base, slug: 'o-que-fazer-em-alagamento', semCaixaDeMaterial: true })
ok(!semArquivo.includes('class="news-material"') && !semArquivo.includes('data-evento="kit_pedir"') && !semArquivo.includes('name="material"'), 'com a trava ligada, a matéria da lista sai sem a caixa do kit (fica a da newsletter)')

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
