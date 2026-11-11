/**
 * Os materiais que o site entrega por e-mail a quem deixa o endereço (09/11/2026).
 *
 * Do sexto ao nono (11/11/2026, não publicados) são quatro guias no padrão dos guias gratuitos do site
 * (docs/padrao-guias-gratuitos.md, lá): a lista da mochila de emergência, o cartaz "Quando ligar 192", o guia
 * "Verão seguro no Rio" e a ficha do plano familiar de emergência. Cada um é pedido na página dele e na caixa de um
 * grupo de matérias (lib/site/caixa-de-material.ts), que antes ficavam com o kit de emergência ou sem caixa nenhuma.
 *
 * O quarto e o quinto (11/11/2026) são os materiais das páginas para instituições do site: o kit Lei Lucas para escolas,
 * em /lei-lucas-para-escolas/, e o roteiro do plano de contingência, em /plano-de-contingencia/. Seguem o modelo do
 * manual (o formulário da página é a porta do arquivo) e saem no padrão dos guias (scripts/gerar_guia_pdf.py, no site).
 *
 * O terceiro (11/11/2026) é o guia do kit de primeiros socorros, em PDF: duas folhas para imprimir e marcar e uma com
 * as fontes. É pedido na página /kit-de-primeiros-socorros/ do site e na caixa das matérias de primeiros socorros
 * (lib/site/caixa-de-material.ts), que até então entregava a lista do kit de emergência.
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
    chamada: 'Toque no botão para baixar o manual: emblema, logotipo, cores, tipografia e aplicações.',
    titulo: 'Seu Manual de Identidade Institucional',
    descricao: 'É o manual da Cruz Vermelha Brasileira em PDF, na edição de 2022 (85 páginas, cerca de 4 MB): o emblema, o logotipo, as cores, a tipografia e as aplicações em papelaria, trajes e veículos.',
    botao: 'Baixar o manual em PDF',
    objeto: 'o manual',
    convite: 'Quer um resumo da cor, do logotipo e de quem pode usar o emblema?',
  },
}

export const KIT_DE_PRIMEIROS_SOCORROS: Material = {
  id: 'kit-de-primeiros-socorros',
  nome: 'a lista do kit de primeiros socorros',
  arquivo: `${SITE}/kit-de-primeiros-socorros/kit-de-primeiros-socorros-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/kit-de-primeiros-socorros/#baixar`,
  rotuloDoGuia: 'guia do kit de primeiros socorros',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail a lista do kit de '
    + 'primeiros socorros e, depois, notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a '
    + 'qualquer momento pelo link presente em todas as mensagens.',
  recado: 'Pronto! A lista vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar a lista em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. A lista também está no guia do kit de primeiros socorros, no nosso site.',
  evento: 'primeiros_socorros_pedir',
  email: {
    assunto: 'Sua lista do kit de primeiros socorros (PDF)',
    chamada: 'Toque no botão para baixar as folhas e marcar o que já tem na caixa.',
    titulo: 'Sua lista do kit de primeiros socorros',
    descricao: 'São três folhas em PDF: duas para imprimir e marcar o que já tem na caixa de primeiros socorros, com o que fazer num corte que sangra e os telefones de emergência, e uma com todas as fontes.',
    botao: 'Baixar a lista em PDF',
    objeto: 'a lista',
    convite: 'Quer entender para que serve cada item?',
  },
}


export const KIT_LEI_LUCAS: Material = {
  id: 'lei-lucas-escolas',
  nome: 'o kit Lei Lucas para escolas',
  arquivo: `${SITE}/lei-lucas-para-escolas/lei-lucas-para-escolas-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/lei-lucas-para-escolas/#baixar`,
  rotuloDoGuia: 'guia da Lei Lucas para escolas',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail o kit Lei Lucas para escolas '
    + 'e, depois, notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer momento pelo '
    + 'link presente em todas as mensagens.',
  recado: 'Pronto! O kit vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar o kit em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. O kit também está no guia da Lei Lucas para escolas, no nosso site.',
  evento: 'leilucas_pedir',
  email: {
    assunto: 'Seu kit Lei Lucas para escolas (PDF)',
    chamada: 'Toque no botão para baixar o checklist, a ficha dos capacitados e o cartaz de emergência.',
    titulo: 'Seu kit Lei Lucas para escolas',
    descricao: 'São três folhas em PDF: duas para imprimir, com o checklist de adequação à Lei Lucas, a ficha dos profissionais capacitados para afixar na escola e o cartaz de emergência da sala dos professores, e uma com as fontes.',
    botao: 'Baixar o kit em PDF',
    objeto: 'o kit',
    convite: 'Quer saber o que a lei pede e como capacitar a equipe?',
  },
}

export const ROTEIRO_PLANO_DE_CONTINGENCIA: Material = {
  id: 'plano-de-contingencia',
  nome: 'o roteiro do plano de contingência',
  arquivo: `${SITE}/plano-de-contingencia/plano-de-contingencia-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/plano-de-contingencia/#baixar`,
  rotuloDoGuia: 'guia do plano de contingência',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail o roteiro do plano de '
    + 'contingência e, depois, notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer '
    + 'momento pelo link presente em todas as mensagens.',
  recado: 'Pronto! O roteiro vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar o roteiro em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. O roteiro também está no guia do plano de contingência, no nosso site.',
  evento: 'contingencia_pedir',
  email: {
    assunto: 'Seu roteiro do plano de contingência (PDF)',
    chamada: 'Toque no botão para baixar as perguntas do plano e a ficha de quem faz o quê.',
    titulo: 'Seu roteiro do plano de contingência',
    descricao: 'São três folhas em PDF: duas para imprimir e preencher em reunião, com as perguntas que o plano precisa responder e a ficha de quem faz o quê, os níveis de alerta e os telefones, e uma com as fontes.',
    botao: 'Baixar o roteiro em PDF',
    objeto: 'o roteiro',
    convite: 'Quer ver o que um bom plano precisa ter?',
  },
}

export const MOCHILA_DE_EMERGENCIA: Material = {
  id: 'mochila-de-emergencia',
  nome: 'a lista da mochila de emergência',
  arquivo: `${SITE}/mochila-de-emergencia/mochila-de-emergencia-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/mochila-de-emergencia/#baixar`,
  rotuloDoGuia: 'guia da mochila de emergência',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail a lista da mochila de emergência e, depois, '
    + 'notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer momento pelo link '
    + 'presente em todas as mensagens.',
  recado: 'Pronto! A lista vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar a lista em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. A lista também está no guia da mochila de emergência, no nosso site.',
  evento: 'mochila_pedir',
  email: {
    assunto: 'Sua lista da mochila de emergência (PDF)',
    chamada: 'Toque no botão para baixar as folhas e marcar o que já está na mochila.',
    titulo: 'Sua lista da mochila de emergência',
    descricao: 'São três folhas em PDF: duas para imprimir e marcar o que já está na mochila, com os documentos, o que fazer na hora de sair e os telefones da família, e uma com todas as fontes.',
    botao: 'Baixar a lista em PDF',
    objeto: 'a lista',
    convite: 'Quer entender cada item da mochila?',
  },
}

export const QUANDO_LIGAR_192: Material = {
  id: 'quando-ligar-192',
  nome: 'o cartaz Quando ligar 192',
  arquivo: `${SITE}/quando-ligar-192/quando-ligar-192-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/quando-ligar-192/#baixar`,
  rotuloDoGuia: 'guia Quando ligar 192',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail o cartaz Quando ligar 192 e, depois, '
    + 'notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer momento pelo link '
    + 'presente em todas as mensagens.',
  recado: 'Pronto! O cartaz vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar o cartaz em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. O cartaz também está no guia Quando ligar 192, no nosso site.',
  evento: 'quandoligar_pedir',
  email: {
    assunto: 'Seu cartaz Quando ligar 192 (PDF)',
    chamada: 'Toque no botão para baixar o cartaz com os sinais de AVC, infarto e engasgo.',
    titulo: 'Seu cartaz Quando ligar 192',
    descricao: 'São três folhas em PDF: duas para imprimir e deixar à vista, com os sinais de AVC, de infarto e de engasgo, o que fazer até o socorro chegar e o que dizer ao atendente, e uma com todas as fontes.',
    botao: 'Baixar o cartaz em PDF',
    objeto: 'o cartaz',
    convite: 'Quer entender cada sinal com calma?',
  },
}

export const VERAO_SEGURO: Material = {
  id: 'verao-seguro',
  nome: 'o guia Verão seguro no Rio',
  arquivo: `${SITE}/verao-seguro/verao-seguro-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/verao-seguro/#baixar`,
  rotuloDoGuia: 'guia Verão seguro no Rio',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail o guia Verão seguro no Rio e, depois, '
    + 'notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer momento pelo link '
    + 'presente em todas as mensagens.',
  recado: 'Pronto! O guia vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar o guia em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. O guia também está no guia Verão seguro no Rio, no nosso site.',
  evento: 'verao_pedir',
  email: {
    assunto: 'Seu guia Verão seguro no Rio (PDF)',
    chamada: 'Toque no botão para baixar o guia do calor, do sol e da praia.',
    titulo: 'Seu guia Verão seguro no Rio',
    descricao: 'São três folhas em PDF: duas para imprimir, com o que fazer nos dias de calor forte, os sinais de alerta no corpo e os cuidados na praia, e uma com todas as fontes.',
    botao: 'Baixar o guia em PDF',
    objeto: 'o guia',
    convite: 'Quer ver cada cuidado explicado?',
  },
}

export const PLANO_FAMILIAR: Material = {
  id: 'plano-familiar-de-emergencia',
  nome: 'a ficha do plano familiar de emergência',
  arquivo: `${SITE}/plano-familiar-de-emergencia/plano-familiar-de-emergencia-cruz-vermelha-rj.pdf`,
  guia: `${SITE}/plano-familiar-de-emergencia/#baixar`,
  rotuloDoGuia: 'guia do plano familiar de emergência',
  consentimento:
    'Autorizo a Cruz Vermelha Brasileira — Filial Rio de Janeiro a enviar para o meu e-mail a ficha do plano familiar de emergência e, depois, '
    + 'notícias, campanhas e informações sobre cursos. Sei que posso sair da lista a qualquer momento pelo link '
    + 'presente em todas as mensagens.',
  recado: 'Pronto! A ficha vai para o seu e-mail em instantes. Abra a mensagem e toque em “Baixar a ficha em PDF”. Confira também a caixa de spam.',
  recadoSemEnvio: 'Recebemos o seu pedido, mas o nosso envio de e-mail está fora do ar agora. A ficha também está no guia do plano familiar de emergência, no nosso site.',
  evento: 'planofamiliar_pedir',
  email: {
    assunto: 'Sua ficha do plano familiar de emergência (PDF)',
    chamada: 'Toque no botão para baixar a ficha e preencher com a família.',
    titulo: 'Sua ficha do plano familiar de emergência',
    descricao: 'São três folhas em PDF: duas para imprimir e preencher com a família, com os telefones, os pontos de encontro e quem ajuda quem, e uma com todas as fontes.',
    botao: 'Baixar a ficha em PDF',
    objeto: 'a ficha',
    convite: 'Quer ver como montar o plano, passo a passo?',
  },
}

const MATERIAIS: readonly Material[] = [
  KIT_DE_EMERGENCIA, MANUAL_DE_IDENTIDADE, KIT_DE_PRIMEIROS_SOCORROS, KIT_LEI_LUCAS, ROTEIRO_PLANO_DE_CONTINGENCIA,
  MOCHILA_DE_EMERGENCIA, QUANDO_LIGAR_192, VERAO_SEGURO, PLANO_FAMILIAR,
]

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
