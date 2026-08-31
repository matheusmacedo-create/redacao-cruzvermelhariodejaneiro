import { escapar } from '@/lib/site/artigo-html'

/**
 * Os modelos de e-mail da newsletter.
 *
 * Escritos com tabela e estilo em linha de propósito, o que em qualquer outro
 * lugar deste projeto seria erro. E-mail não é página: o Gmail remove a folha
 * de estilo, o Outlook renderiza com o motor do Word (sem flex, sem grid, sem
 * border-radius em elemento de bloco) e metade dos leitores abre em cliente
 * que ignora media query. Layout moderno aqui vira mensagem quebrada.
 *
 * Três regras que valem para todo modelo daqui:
 *
 *  - Toda mensagem leva versão em texto puro. Sem ela, os filtros pontuam a
 *    mensagem como spam antes mesmo de alguém ler.
 *  - Toda mensagem leva o link de saída visível no rodapé, além do cabeçalho
 *    List-Unsubscribe. Um esconde o outro não substitui.
 *  - Cor escrita por extenso, nunca herdada. Cliente de e-mail no modo escuro
 *    inverte o que não estiver declarado, e texto cinza sobre fundo invertido
 *    some.
 */

const SITE = 'https://cruzvermelhariodejaneiro.org'
const LOGO = `${SITE}/assets/logo-cvb-rj.png`

/** A paleta do site institucional, para o e-mail não parecer de outro lugar. */
const VERMELHO = '#cc0000'
const TINTA = '#1a202c'
const SUAVE = '#718096'
const LINHA = '#e2e8f0'

export type Modelo = { assunto: string; html: string; texto: string }

/** Envolve o conteúdo no cabeçalho e rodapé comuns. */
function moldura(opcoes: { miolo: string; urlDeSaida: string; preheader: string }): string {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Cruz Vermelha Brasileira — Rio de Janeiro</title>
</head>
<body style="margin:0;padding:0;background:#f7f8fa;">
<!-- O preheader é o trecho que a caixa de entrada mostra ao lado do assunto.
     Sem ele, o cliente pega a primeira frase que encontrar — costuma ser
     "não consegue ver esta mensagem?". Escondido no corpo, visível na lista. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapar(opcoes.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f8fa;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${LINHA};border-radius:8px;">

    <tr><td style="padding:28px 32px 0;border-top:4px solid ${VERMELHO};border-radius:8px 8px 0 0;">
      <img src="${LOGO}" width="132" alt="Cruz Vermelha Brasileira — Rio de Janeiro" style="height:auto;display:block;border:0;">
    </td></tr>

    <tr><td style="padding:24px 32px 8px;font-family:Arial,Helvetica,sans-serif;color:${TINTA};font-size:16px;line-height:1.6;">
${opcoes.miolo}
    </td></tr>

    <tr><td style="padding:24px 32px 28px;border-top:1px solid ${LINHA};font-family:Arial,Helvetica,sans-serif;color:${SUAVE};font-size:12px;line-height:1.6;">
      <p style="margin:0 0 8px;">Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro</p>
      <p style="margin:0 0 12px;"><a href="${SITE}" style="color:${SUAVE};">cruzvermelhariodejaneiro.org</a></p>
      <p style="margin:0;">Você recebe esta mensagem porque confirmou a inscrição na nossa lista.
        <a href="${escapar(opcoes.urlDeSaida)}" style="color:${VERMELHO};font-weight:bold;">Sair da lista</a>.</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`
}

/** Botão em tabela: <a> com padding não é clicável inteiro no Outlook. */
function botao(url: string, rotulo: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td align="center" bgcolor="${VERMELHO}" style="border-radius:6px;">
    <a href="${escapar(url)}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapar(rotulo)}</a>
  </td></tr>
</table>`
}

/**
 * O convite de confirmação — a única mensagem que vai para quem ainda não
 * confirmou.
 *
 * O texto diz de onde veio o pedido e o que fazer se não foi a pessoa: quem
 * recebe um convite que não pediu precisa de uma saída que não seja o botão
 * de spam, senão é a reputação do domínio que paga.
 */
export function emailDeConfirmacao(dados: {
  nome: string
  urlConfirmar: string
  urlDeSaida: string
}): Modelo {
  const ola = dados.nome ? `Olá, ${escapar(dados.nome.split(' ')[0])}!` : 'Olá!'

  const miolo = `
      <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${VERMELHO};">Falta um passo</p>
      <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;color:#0f1318;">Confirme sua inscrição</h1>
      <p style="margin:0 0 16px;">${ola}</p>
      <p style="margin:0 0 16px;">Alguém — esperamos que você — pediu para receber as novidades da Cruz Vermelha do Rio de Janeiro: cursos, campanhas e o destino das doações.</p>
      <p style="margin:0 0 16px;">Para começar a receber, é só confirmar:</p>
      ${botao(dados.urlConfirmar, 'Confirmar inscrição')}
      <p style="margin:0 0 16px;font-size:14px;color:${SUAVE};">O link vale por 3 dias. Se o botão não funcionar, copie e cole este endereço no navegador:<br>
        <span style="word-break:break-all;color:${SUAVE};">${escapar(dados.urlConfirmar)}</span></p>
      <p style="margin:0;font-size:14px;color:${SUAVE};"><strong>Não foi você?</strong> Então não faça nada: sem a confirmação, nada é enviado e o pedido expira sozinho.</p>`

  const texto = [
    'CONFIRME SUA INSCRIÇÃO',
    '',
    dados.nome ? `Olá, ${dados.nome.split(' ')[0]}!` : 'Olá!',
    '',
    'Alguém — esperamos que você — pediu para receber as novidades da Cruz',
    'Vermelha do Rio de Janeiro: cursos, campanhas e o destino das doações.',
    '',
    'Para começar a receber, confirme neste endereço:',
    dados.urlConfirmar,
    '',
    'O link vale por 3 dias.',
    '',
    'Não foi você? Então não faça nada: sem a confirmação, nada é enviado e o',
    'pedido expira sozinho.',
    '',
    '--',
    'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro',
    SITE,
    `Sair da lista: ${dados.urlDeSaida}`,
  ].join('\n')

  return {
    assunto: 'Confirme sua inscrição na newsletter da Cruz Vermelha RJ',
    html: moldura({
      miolo,
      urlDeSaida: dados.urlDeSaida,
      preheader: 'Falta um clique para você começar a receber as novidades.',
    }),
    texto,
  }
}

/**
 * Uma edição da newsletter.
 *
 * `paragrafos` chega já em texto puro, vindo do texto-mestre da matéria — o
 * mesmo caminho que alimenta as redes sociais. O escape acontece aqui, e não
 * antes: é aqui que o texto vira HTML.
 */
export function emailDaNewsletter(dados: {
  titulo: string
  chamada?: string
  paragrafos: string[]
  urlDaMateria?: string
  rotuloDoBotao?: string
  imagemUrl?: string
  urlDeSaida: string
}): Modelo {
  const corpo = dados.paragrafos
    .filter((p) => p.trim())
    .map((p) => `      <p style="margin:0 0 16px;">${escapar(p)}</p>`)
    .join('\n')

  const imagem = dados.imagemUrl
    ? `      <img src="${escapar(dados.imagemUrl)}" width="536" alt="${escapar(dados.titulo)}" style="width:100%;max-width:536px;height:auto;display:block;border:0;border-radius:6px;margin:0 0 20px;">\n`
    : ''

  const chamada = dados.chamada?.trim()
    ? `      <p style="margin:0 0 20px;font-size:18px;line-height:1.5;color:${SUAVE};">${escapar(dados.chamada)}</p>\n`
    : ''

  const acao = dados.urlDaMateria
    ? botao(dados.urlDaMateria, dados.rotuloDoBotao?.trim() || 'Ler a matéria completa')
    : ''

  const miolo = `
${imagem}      <h1 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;color:#0f1318;">${escapar(dados.titulo)}</h1>
${chamada}${corpo}
      ${acao}`

  const texto = [
    dados.titulo.toUpperCase(),
    '',
    ...(dados.chamada?.trim() ? [dados.chamada, ''] : []),
    ...dados.paragrafos.filter((p) => p.trim()),
    ...(dados.urlDaMateria ? ['', `Leia a matéria completa: ${dados.urlDaMateria}`] : []),
    '',
    '--',
    'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro',
    SITE,
    `Sair da lista: ${dados.urlDeSaida}`,
  ].join('\n')

  return {
    assunto: dados.titulo,
    html: moldura({
      miolo,
      urlDeSaida: dados.urlDeSaida,
      // A chamada é o melhor preheader que existe; sem ela, o começo do corpo.
      preheader: (dados.chamada?.trim() || dados.paragrafos[0] || '').slice(0, 140),
    }),
    texto,
  }
}
