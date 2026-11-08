import { textoCorrido } from './ouvir'

/**
 * O guia para começar (docs/AJUDA.md §16): a página aberta /comecar, feita para quem usa pouco o computador — boa
 * parte da equipe da filial tem mais de 60 anos. Uma coisa de cada vez, frases curtas, letra grande, "Ouvir" em cada
 * parte e versão para imprimir. Ela vem antes do login: começa perguntando se a pessoa já tem o e-mail da Cruz
 * Vermelha e o acesso ao Palácio, e leva aos caminhos que já existem para pedir cada um:
 *
 * - o e-mail: o autocadastro pelo WhatsApp do Palácio ("quero me cadastrar", lib/whatsapp/autocadastro-regras.ts),
 *   que a coordenação do setor aprova com um toque; o e-mail e a senha provisória chegam no próprio WhatsApp;
 * - o Palácio: o convite da administração (Usuários e permissões, ou a ficha do RH), com o link para criar a senha.
 *
 * As duas travas (a aprovação e o convite) ficam de propósito: o e-mail fala em nome da Cruz Vermelha, e o Palácio
 * guarda CPF, saúde e documentos. O que sai é todo o resto do atrito: nada de formulário nem de senha para começar.
 *
 * Cada frase tem apoio no código ou na ajuda já conferida (conteudo/geral.ts e o guia de cada área). Puro: conferido
 * em scripts/conferir-ajuda.ts, e os textos do "Ouvir" entram em lib/ajuda/ouvir-textos.ts.
 */

/** Uma parte do guia: um título e frases curtas, uma ideia por frase. */
export type ParteDoGuia = {
  /** Âncora na página (/comecar#tela). */
  id: string
  titulo: string
  frases: string[]
  passos?: string[]
}

/**
 * Uma frase de uma lista do guia. `soDaRedacao`: a equipe da escola não tem (o Início, o "Criar", os chamados),
 * então some para ela, que está logada; sem login, a página mostra tudo (é a equipe da Redação que mais chega).
 */
export type ItemDoGuia = { texto: string; soDaRedacao?: true }

/** A tela, parte por parte: cada item com o ícone que a página desenha ao lado (o mesmo da tela de verdade). */
export type ItemDaTela = ItemDoGuia & { icone: 'menu' | 'inicio' | 'busca' | 'sino' | 'ajuda' | 'conta' | 'criar' }

/** Uma pergunta de sim ou não, com o que fazer em cada caso. */
export type EscolhaDoGuia = {
  id: 'email' | 'acesso'
  titulo: string
  pergunta: string
  sim: string[]
  nao: { passos: string[]; dica?: string }
}

/** "Quero…": o que dá para fazer no Palácio, dito do jeito de quem precisa, com o caminho até lá. */
export type CoisaQueDaParaFazer = {
  /** A área (href do menu): só aparece para quem a abre, e "Abrir" leva até ela. */
  area: string
  quero: string
  como: string
  /** O passo a passo da área que ensina isso (o id da tarefa no guia da área), quando há. */
  tarefa?: string
  /** Para a página aberta, sem login, dizer de quem é ("Para quem coordena o voluntariado"). */
  para?: string
}

export const O_QUE_E: ParteDoGuia = {
  id: 'o-que-e',
  titulo: 'O que é o Palácio Virtual',
  frases: [
    'O Palácio Virtual é o lugar de trabalho da Cruz Vermelha do Rio de Janeiro na internet.',
    'É aqui que a equipe conversa, combina o trabalho, aprova o que vai ser publicado e faz pedidos aos outros setores.',
    'Você não precisa aprender tudo de uma vez. Comece pelo que é seu; o resto vem com o tempo.',
    'Pode explorar com calma: abrir uma tela para olhar não apaga nem envia nada.',
  ],
}

/** O mesmo, para a equipe da escola (o texto das boas-vindas dela, components/app/ajuda/boas-vindas.tsx). */
export const O_QUE_E_DA_ESCOLA: ParteDoGuia = {
  ...O_QUE_E,
  frases: [
    'O Palácio Virtual é o lugar de trabalho da Cruz Vermelha do Rio de Janeiro na internet.',
    'Aqui a equipe da Escola de Educação e Saúde acompanha as vendas, o marketing e os advertoriais da escola. No Chat, você conversa nos canais para os quais chamaram você.',
    'Você não precisa aprender tudo de uma vez. Comece pelo que é seu; o resto vem com o tempo.',
    'Pode explorar com calma: abrir uma tela para olhar não apaga nem envia nada.',
  ],
}

export const ESCOLHA_DO_EMAIL: EscolhaDoGuia = {
  id: 'email',
  titulo: 'Passo 1: o seu e-mail da Cruz Vermelha',
  pergunta: 'Você já tem o e-mail da Cruz Vermelha, o que termina em @cruzvermelhariodejaneiro.org?',
  sim: ['Ótimo. Guarde o endereço e a senha num lugar seguro e siga para o passo 2.'],
  nao: {
    passos: [
      'Toque em “Pedir pelo WhatsApp”. A conversa com o WhatsApp do Palácio abre com a frase pronta: “quero me cadastrar”. Envie.',
      'Responda às perguntas, uma de cada vez: o seu nome, o seu setor, o seu e-mail pessoal, o seu endereço, um contato de emergência e uma foto do rosto para o crachá. Para desistir, escreva “cancelar”.',
      'A coordenação do seu setor confere e aprova.',
      'Aprovado, chegam ali mesmo, no WhatsApp, o seu e-mail novo, uma senha provisória e o passo a passo para entrar.',
      'No primeiro acesso ao e-mail, o Google pede uma senha nova: crie uma só sua.',
    ],
    dica: 'Tenha à mão o seu CEP e o telefone de alguém da família. Se preferir, peça a alguém da coordenação para fazer junto com você.',
  },
}

export const ESCOLHA_DO_ACESSO: EscolhaDoGuia = {
  id: 'acesso',
  titulo: 'Passo 2: o seu acesso ao Palácio',
  pergunta: 'Você já entra no Palácio Virtual, com usuário e senha?',
  sim: ['Então é só entrar. Se esquecer a senha, o passo 3 mostra como criar outra.'],
  nao: {
    passos: [
      'Peça o seu acesso à coordenação do seu setor. Quem cria o acesso é a administração do Palácio.',
      'O convite chega no seu WhatsApp (ou no seu e-mail), com o seu usuário e um link.',
      'Toque no link, escreva a senha que você quer, repita e toque em “Criar senha e continuar”.',
      'Pronto: entre com o seu usuário e a senha nova. Anote os dois num lugar seguro.',
    ],
    dica: 'O link do convite vale por 3 dias e funciona uma vez só. Se vencer, peça outro.',
  },
}

export const COMO_ENTRAR: ParteDoGuia = {
  id: 'entrar',
  titulo: 'Passo 3: como entrar',
  frases: ['Faça isto sempre que for usar o Palácio.'],
  passos: [
    'No navegador do celular ou do computador, abra o endereço palacio.cruzvermelhariodejaneiro.org.',
    'Em “Usuário ou e-mail”, escreva o seu usuário. Ele é o seu nome e o seu sobrenome, com um ponto no meio: nome.sobrenome.',
    'Escreva a sua senha e toque em “Entrar”.',
    'Esqueceu a senha? Toque em “Esqueci minha senha”. O link para criar outra chega no seu e-mail ou no seu WhatsApp.',
  ],
}

export const A_TELA: { id: string; titulo: string; itens: ItemDaTela[] } = {
  id: 'tela',
  titulo: 'A tela, parte por parte',
  itens: [
    { icone: 'menu', texto: 'O menu: no computador, fica à esquerda. No celular, abre pelo botão de três risquinhos, no alto, à esquerda. Ali estão as áreas, por setor, e você só vê as que o seu acesso abre.' },
    { icone: 'inicio', texto: 'O Início: é a primeira tela. Ela mostra o que precisa de você hoje.', soDaRedacao: true },
    { icone: 'busca', texto: 'A busca, a lupa: escreva o que procura, uma área ou uma dúvida.' },
    { icone: 'sino', texto: 'O sino: os seus avisos. O número diz quantos você ainda não leu.' },
    { icone: 'ajuda', texto: 'O ponto de interrogação, no alto: explica a tela em que você está. Lá dentro, o botão “Ouvir” lê o texto em voz alta.' },
    { icone: 'conta', texto: 'A sua foto, ou as suas iniciais, no alto à direita: abre “Meu perfil”, a Ajuda e “Sair”.' },
    { icone: 'criar', texto: 'O botão “Criar” (no celular, o sinal de mais): começa o que é mais comum, como registrar uma atividade e abrir um chamado.', soDaRedacao: true },
  ],
}

/** "O que dá para fazer": em ordem do que mais se usa. Cada pessoa vê só o que abre (com login). */
export const O_QUE_DA_PARA_FAZER: CoisaQueDaParaFazer[] = [
  { area: '/dashboard', quero: 'Ver o que precisa de mim hoje', como: 'Toque em “Início”, o primeiro item do menu. Ali estão o que espera o seu voto e as suas pautas, por prazo.', tarefa: 'ver-o-que-e-meu' },
  { area: '/aprovacoes', quero: 'Aprovar o que pediram para eu conferir', como: 'Em “Aprovações”, abra o pedido, leia com calma e escolha “Aprovar” ou “Pedir ajustes”.', tarefa: 'aprovar-um-conteudo' },
  { area: '/chat', quero: 'Conversar com a equipe', como: 'No “Chat”, escolha uma conversa, escreva embaixo e envie. Dá para mandar mensagem de voz.' },
  { area: '/notificacoes', quero: 'Ver os meus avisos', como: 'Toque no sino, no alto da tela. O número mostra o que você ainda não leu.' },
  { area: '/calendario', quero: 'Ver a agenda da filial', como: 'No “Calendário” ficam as datas: publicações, prazos, ações do voluntariado, aniversários e feriados.' },
  { area: '/chamados', quero: 'Pedir algo à TI, à Manutenção ou a outro setor', como: 'Toque em “Criar” e escolha “Abrir chamado”. Conte o que precisa e envie: a resposta chega no sino.' },
  { area: '/pautas', quero: 'Contar uma ação ou uma ideia para a Comunicação', como: 'Toque em “Criar” e escolha “Registrar atividade”. Preencha o que aconteceu e toque em “Enviar para Comunicação”.', tarefa: 'criar-pauta' },
  { area: '/pessoas', quero: 'Achar o contato de alguém da equipe', como: 'No “Diretório”, procure pelo nome: aparecem o cargo, o setor e o contato de trabalho.' },
  { area: '/voluntariado', quero: 'Ver e aprovar as inscrições de voluntários', como: 'Em “Voluntários”, a coordenação vê o cadastro de cada pessoa e aprova as inscrições.', para: 'Para quem cuida do voluntariado' },
  { area: '/escola', quero: 'Ver como vai a Escola', como: 'Na “Visão geral” da Escola estão as vendas do mês, o financeiro, o marketing e o que pede atenção.', para: 'Para a equipe da Escola' },
  { area: '/perfil', quero: 'Trocar a minha foto ou a minha senha', como: 'Toque na sua foto (ou nas suas iniciais), no alto à direita, e depois em “Meu perfil”.' },
]

/** Os vídeos de começo, na ordem em que fazem sentido (os ids de lib/ajuda/videos.json). */
export const VIDEOS_PARA_COMECAR = ['inicio-o-que-e-meu', 'pautas-criar-pauta', 'aprovacoes-aprovar-conteudo']

export const SE_TRAVAR: { id: string; titulo: string; itens: ItemDoGuia[] } = {
  id: 'se-travar',
  titulo: 'Se você travar',
  itens: [
    { texto: 'Toque no ponto de interrogação, no alto da tela: ele explica a tela em que você está, com o botão “Ouvir”.' },
    { texto: 'Não entendeu uma palavra? O glossário, na Central de ajuda, explica em poucas frases.' },
    { texto: 'Peça ajuda a alguém da equipe pelo Chat.' },
    { texto: 'Algo não funciona? Toque em “Criar” e abra um chamado para a TI.', soDaRedacao: true },
    { texto: 'No fim do ponto de interrogação, em “Conte para a equipe”, você manda a sua dúvida, e a resposta chega no sino.' },
  ],
}

/** Os itens que valem para quem está vendo: a equipe da escola não recebe os que são só da Redação. */
export function itensPara<T extends ItemDoGuia>(itens: T[], equipeDaEscola: boolean): T[] {
  return equipeDaEscola ? itens.filter((i) => !i.soDaRedacao) : itens
}

// ------------------------------------------------------------------ o texto do "Ouvir" de cada parte

export function textoDaParte(p: ParteDoGuia): string {
  return textoCorrido([p.titulo, ...p.frases, ...(p.passos ?? []).map((x, i) => `Passo ${i + 1}: ${x}`)])
}

/** O título e os itens de uma lista do guia (a tela, se travar), na versão de quem está vendo. */
export function textoDaLista(lista: { titulo: string; itens: ItemDoGuia[] }, equipeDaEscola: boolean): string {
  return textoCorrido([lista.titulo, ...itensPara(lista.itens, equipeDaEscola).map((i) => i.texto)])
}

/** O "sim" e o "não" de uma escolha são ouvidos em separado: cada um aparece sozinho na tela. */
export function textoDoSim(e: EscolhaDoGuia): string {
  return textoCorrido(e.sim)
}

export function textoDoNao(e: EscolhaDoGuia): string {
  return textoCorrido([...e.nao.passos.map((x, i) => `Passo ${i + 1}: ${x}`), e.nao.dica ? `Dica: ${e.nao.dica}` : null])
}

export function textoDaCoisa(c: CoisaQueDaParaFazer): string {
  return textoCorrido([`${c.quero}.`, c.como])
}

/** Todos os textos do guia que o "Ouvir" pode tocar. */
export function textosDoGuia(): string[] {
  return [
    textoDaParte(O_QUE_E),
    textoDaParte(O_QUE_E_DA_ESCOLA),
    ...[ESCOLHA_DO_EMAIL, ESCOLHA_DO_ACESSO].flatMap((e) => [textoDoSim(e), textoDoNao(e)]),
    textoDaParte(COMO_ENTRAR),
    ...[false, true].flatMap((escola) => [textoDaLista(A_TELA, escola), textoDaLista(SE_TRAVAR, escola)]),
    ...O_QUE_DA_PARA_FAZER.map(textoDaCoisa),
  ]
}
