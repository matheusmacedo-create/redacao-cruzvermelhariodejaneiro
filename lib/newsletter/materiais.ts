/**
 * Os materiais que o site entrega por e-mail a quem deixa o endereço (09/11/2026).
 *
 * O segundo (11/11/2026) é o Manual de Identidade Institucional da Cruz Vermelha Brasileira, na página
 * /manual-de-identidade/ do site: lá o formulário é a porta do arquivo (o botão de baixar só aparece depois do e-mail),
 * e a mensagem leva o mesmo arquivo. Vale a decisão 3 abaixo: a porta é um convite, o PDF continua público.
 *
 * O primeiro é a lista do kit de emergência, em PDF: a caixa aparece no fim de algumas matérias do site
 * (lib/site/caixa-de-material.ts), a pessoa informa o e-mail, marca a autorização e recebe UMA mensagem com o botão
 * "Baixar a lista em PDF". O toque nesse botão baixa o arquivo e confirma a inscrição na newsletter: é a confirmação
 * em duas etapas de sempre (app/newsletter/confirmar), com o material no lugar do convite.
 *
 * Três decisões que estão aqui, e não espalhadas:
 *
 *  1. O TEXTO DO ACEITE É DO MATERIAL. Quem pede a lista autoriza duas coisas, a lista e depois as notícias, e é esse
 *     texto, e não o da home, que fica gravado na linha da pessoa (LGPD, art. 8º, § 2º). Por isso ele mora ao lado do
 *     material: a caixa mostra e a rota grava a mesma constante.
 *  2. QUEM JÁ ESTÁ NA LISTA TAMBÉM RECEBE, UMA VEZ POR DIA. Quem já confirmou não recebe convite, mas recebe o
 *     material que pediu, numa mensagem sem confirmação e sem mexer no registro dela, no máximo uma a cada 24 horas
 *     (lib/newsletter/decisao.ts, `entregar`). Até 09/11/2026 não recebia nada, e o primeiro pedido de verdade foi
 *     justamente de um inscrito antigo: a caixa disse "a lista vai para o seu e-mail" e nada chegou. O link do guia,
 *     que a caixa mostra depois do envio, continua: é o caminho de quem pede de novo no mesmo dia e de quando o
 *     e-mail não sai.
 *  3. O ARQUIVO É PÚBLICO. O PDF está no site institucional, sem senha. O e-mail em troca da lista é um convite, não
 *     uma cerca: nada aqui depende de o arquivo ser secreto, e por isso o link de baixar pode sempre terminar nele.
 *
 * Módulo puro, sem nada de servidor: é lido pela página da matéria (que também roda no navegador, na prévia), pela
 * rota de inscrição e pela de confirmação. Conferido em scripts/conferir-caixa-de-material.ts.
 */

const SITE = 'https://cruzvermelhariodejaneiro.org'

export type Material = {
  /** Vai no formulário, no link do e-mail e no evento de medição. Só letras minúsculas, números e hífen. */
  id: string
  /** Como o material entra numa frase, com artigo: "a lista do kit de emergência". */
  nome: string
  /** O arquivo, no site institucional. */
  arquivo: string
  /** A página do site que explica o material e também o entrega, com a âncora do botão de baixar. */
  guia: string
  /** O texto do link para o guia. */
  rotuloDoGuia: string
  /** O que a pessoa autoriza ao pedir. Uma cópia fica gravada na linha dela. */
  consentimento: string
  /** O que a caixa diz quando o pedido foi aceito (e nos caminhos que respondem igual, sem gravar). */
  recado: string
  /** O que a caixa diz quando o pedido foi gravado, mas o e-mail não saiu. */
  recadoSemEnvio: string
  /** O evento do GA4 que a caixa manda quando o pedido é aceito (docs/rastreamento.md, no repositório do site). */
  evento: string
  email: {
    assunto: string
    /** A linha que a caixa de entrada mostra ao lado do assunto. */
    chamada: string
    titulo: string
    /** O que é o arquivo, em uma frase. */
    descricao: string
    botao: string
    /** O arquivo em duas palavras, com artigo, nas frases sobre o botão: "a lista", "o manual". */
    objeto: string
    /** A pergunta que leva ao guia, antes de "Veja o <rotuloDoGuia>". */
    convite: string
  }
}

export const KIT_DE_EMERGENCIA: Material = {
  id: 'kit-de-emergencia',
  nome: 'a lista do kit de emergência',
  arquivo: `${SITE}/kit-de-emergencia/kit-de-emergencia-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/kit-de-emergencia/#baixar`,
  rotuloDoGuia: 'guia do kit de emergência',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail a lista do kit de '
    + 'emergência e, depois, notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer '
    + 'momento pelo link presente em todas as mensagens.',
  recado: 'Pronto! A lista vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar a lista em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. A lista também está no guia do kit de emergência, no nosso site.',
  evento: 'kit_pedir',
  email: {
    assunto: 'Sua lista do kit de emergência (PDF)',
    chamada: 'Toque no botão para baixar as duas folhas e marcar o que já tem em casa.',
    titulo: 'Sua lista do kit de emergência',
    descricao: 'São duas folhas em PDF para imprimir e marcar o que já tem em casa: o kit de emergência, o kit de primeiros socorros e os telefones da família.',
    botao: 'Baixar a lista em PDF',
    objeto: 'a lista',
    convite: 'Quer entender cada item da lista?',
  },
}

export const MANUAL_DE_IDENTIDADE: Material = {
  id: 'manual-de-identidade',
  nome: 'o Manual de Identidade Institucional da Cruz Vermelha Brasileira',
  arquivo: `${SITE}/manual-de-identidade/manual-de-identidade-institucional-cruz-vermelha-brasileira.pdf`,
  guia: `${SITE}/manual-de-identidade/#baixar`,
  rotuloDoGuia: 'página do manual de identidade',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail o Manual de Identidade '
    + 'Institucional e, depois, notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer '
    + 'momento pelo link presente em todas as mensagens.',
  recado: 'Pronto! O manual vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar o manual em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. O manual também está na página do manual de identidade, no nosso site.',
  evento: 'manual_pedir',
  email: {
    assunto: 'Seu Manual de Identidade da Cruz Vermelha (PDF)',
    chamada: 'Toque no botão para baixar o manual: emblema, logotipo, cor, tipografia e aplicações.',
    titulo: 'Seu Manual de Identidade Institucional',
    descricao: 'É o manual da Cruz Vermelha Brasileira em PDF (52 páginas, cerca de 14 MB): o emblema, o logotipo, a cor, a tipografia e as aplicações em papelaria, uniformes e veículos.',
    botao: 'Baixar o manual em PDF',
    objeto: 'o manual',
    convite: 'Quer um resumo da cor, do logotipo e de quem pode usar o emblema?',
  },
}

const MATERIAIS: readonly Material[] = [KIT_DE_EMERGENCIA, MANUAL_DE_IDENTIDADE]

/** O id vai em endereço e em atributo de HTML: nada além disto. */
const ID_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * O material com este id, ou null. O valor vem de formulário público e de endereço de link: só texto, só no formato
 * do id e só o que está na lista (nunca uma chave herdada de objeto, como "constructor").
 */
export function materialPorId(id: unknown): Material | null {
  if (typeof id !== 'string') return null
  const limpo = id.trim()
  if (limpo.length > 60 || !ID_VALIDO.test(limpo)) return null
  return MATERIAIS.find((m) => m.id === limpo) ?? null
}

/** Todos os materiais, para a conferência. */
export function todosOsMateriais(): readonly Material[] {
  return MATERIAIS
}
