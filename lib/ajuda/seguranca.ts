import { textoCorrido } from './ouvir'
import { textoDaParte, type ParteDoGuia } from './comecar'
import { SENHA_MINIMO } from '../usuarios/senha'
import { JANELA_MIN, LIMITE_POR_CONTA } from '../acessos/regras'
import { REPOSITORIO } from '../versao'

/**
 * Por que o Palácio existe e a segurança dele, explicados com calma (docs/AJUDA.md §18): o texto da página aberta /seguranca, para a
 * equipe da filial, boa parte com mais de 60 anos, que tinha medo de que quem constrói o Palácio (o Matheus e o
 * Claude) pudesse tirar os dados das pessoas. Mesmo cuidado do guia para começar (lib/ajuda/comecar.ts): frases
 * curtas, uma ideia por frase, comparação com a vida real e o "Ouvir" em cada parte.
 *
 * Cada frase tem apoio no código ou na infraestrutura, e a §18 diz onde. Os números vêm das próprias regras
 * (SENHA_MINIMO, LIMITE_POR_CONTA, JANELA_MIN): se a regra mudar, o texto muda junto. Promessa que o sistema não
 * cumpre não entra; o que a administração consegue ver é dito com honestidade, junto com as travas que existem.
 *
 * A trilha pública e o portal da transparência (TRANSPARENCIA) só aparecem para quem está logado: estão em
 * lançamento oculto, e a abertura ao público é decisão do Matheus (docs/auditoria-publica.md §1).
 */

/** Os desenhos das trancas e das regras (a página escolhe o ícone). */
export type IconeDaSeguranca =
  | 'chave' | 'porteiro' | 'bloqueio' | 'aviso' | 'livro' | 'cadeado' | 'celular' | 'copia'
  | 'projeto' | 'mercado' | 'anthropic'

/** Uma tranca ou uma regra: o nome em poucas palavras e o que o sistema faz de verdade. */
export type ItemDaSeguranca = { id: string; icone: IconeDaSeguranca; titulo: string; texto: string }

/** Uma lista com introdução: as trancas, quem vê o quê, as regras do Claude. */
export type ListaDaSeguranca = { id: string; titulo: string; frases: string[]; itens: ItemDaSeguranca[] }

/**
 * Por que o Palácio existe (pedido de 09/11/2026): o digital, o Google Ad Grants (ARQUITETURA §7.29d: a conta da filial,
 * as campanhas que o Palácio cria pausadas, dentro das regras do programa, e as conversões do GA4) e a aposta de
 * reconstruir a filial. Vem primeiro na página: a segurança existe por causa deste objetivo.
 */
export const POR_QUE_EXISTE: ParteDoGuia = {
  id: 'por-que-existe',
  titulo: 'Por que o Palácio existe',
  frases: [
    'O Palácio nasceu para levar a Cruz Vermelha do Rio de Janeiro para o digital: um lugar só para o trabalho da filial, ligado ao site, ao WhatsApp e às redes sociais.',
    'Um objetivo importante é o Google Ad Grants, um programa em que o Google doa anúncios gratuitos na pesquisa a organizações sem fins lucrativos, de até 10 mil dólares por mês. Os anúncios levam as pessoas ao site da filial, para virar voluntário, doar e conhecer o trabalho da Cruz Vermelha.',
    'Para usar essa doação, o Google exige uma organização séria e bem cuidada: um site seguro e com conteúdo de verdade, os resultados medidos e as regras do programa seguidas. O Palácio ajuda em tudo isso.',
    'É também uma aposta. Quando os caminhos de sempre ficam difíceis, com pouco dinheiro e pouca gente, o digital pode ajudar a reconstruir e fortalecer a filial.',
    'Por isso a segurança é tão importante: para receber apoio do Google, de parceiros e da sociedade, a filial precisa mostrar que cuida bem dos dados e presta contas.',
  ],
}

/**
 * As pessoas no centro (pedido de 09/11/2026): mesmo construindo rápido, a filial depende de cada setor no dia a dia.
 * O Palácio facilita a conversa entre as pessoas, e o que antes ficava no papel passa a ser registrado e claro.
 */
export const CADA_SETOR: ParteDoGuia = {
  id: 'cada-setor',
  titulo: 'Por que cada setor é importante',
  frases: [
    'Com o Claude, dá para construir muito rápido, e de forma completa. Mas o Palácio não trabalha sozinho: quem faz a Cruz Vermelha acontecer são as pessoas, no dia a dia.',
    'Cada setor sabe o que só ele sabe e faz o que só ele faz: quem atende, quem ensina, quem cuida dos voluntários, das contas e dos documentos. Sem cada um deles, a filial para.',
    'O Palácio existe para facilitar a conversa entre as pessoas e entre os setores. Quando a informação chega a quem precisa, sem se perder, a filial cresce.',
    'Não dá mais para fazer como antes, tudo no papel: o papel se perde, demora para circular e não deixa ninguém conferir depois.',
    'Por isso, tudo é registrado desde o início, com clareza: quem pediu, quem aprovou e o que foi feito. E o que é público fica à vista de todos.',
    'É assim que a filial ganha força: cada setor fazendo a sua parte, e todo mundo sabendo o que está acontecendo.',
  ],
}

export const EM_POUCAS_PALAVRAS: ParteDoGuia = {
  id: 'em-poucas-palavras',
  titulo: 'Em poucas palavras',
  frases: [
    'O Palácio guarda informações da filial e das pessoas: nomes, telefones, documentos e conversas. Por isso, ele foi construído com as regras de segurança que as empresas sérias seguem.',
    'Ninguém consegue ver a sua senha, nem quem cuida do sistema.',
    'Cada pessoa vê só o que o trabalho dela pede.',
    'O que é importante fica registrado: quem entrou, quando, e o que mudou no sistema.',
    'E o Claude, a inteligência artificial que ajuda a construir o Palácio, segue regras escritas. Ele não faz tudo o que pedem a ele.',
  ],
}

export const POR_QUE: ParteDoGuia = {
  id: 'por-que',
  titulo: 'Por que tanta segurança?',
  frases: [
    'A Cruz Vermelha cuida de pessoas. No Palácio há dados de voluntários, de quem a filial atende e da própria equipe.',
    'A lei brasileira de proteção de dados, a LGPD, obriga quem guarda dados de pessoas a protegê-los e a usá-los só para o que foi combinado.',
    'E há um motivo ainda mais simples: confiança. Quem entrega os seus dados à filial precisa saber que eles estão bem guardados.',
  ],
}

export const TRANCAS: ListaDaSeguranca = {
  id: 'trancas',
  titulo: 'As trancas do Palácio',
  frases: ['Pense numa casa bem protegida: não é uma tranca só, são várias, cada uma num lugar. O Palácio é assim.'],
  itens: [
    {
      id: 'senha', icone: 'chave', titulo: 'A sua senha é só sua',
      texto: `Ela fica guardada embaralhada, de um jeito que não tem como desembaralhar. Nem a administração consegue ver. Se você esquecer, ela só pode criar uma senha nova, e você troca no primeiro acesso. A senha tem pelo menos ${SENHA_MINIMO} letras e números e não pode ter o seu nome. Quando você troca a senha, as outras sessões abertas são encerradas.`,
    },
    {
      id: 'porteiro', icone: 'porteiro', titulo: 'Um porteiro em cada sala',
      texto: 'Não basta entrar no Palácio. Cada vez que uma informação é aberta, o banco de dados confere quem está pedindo e se essa pessoa pode ver. Isso vale para todas as tabelas do banco. É como um prédio com porteiro na entrada e também na porta de cada sala.',
    },
    {
      id: 'bloqueio', icone: 'bloqueio', titulo: 'Errou demais, a porta tranca',
      texto: `Depois de ${LIMITE_POR_CONTA} senhas erradas em ${JANELA_MIN} minutos, a conta fica bloqueada por um tempo. Assim, ninguém fica tentando adivinhar a sua senha.`,
    },
    {
      id: 'aviso', icone: 'aviso', titulo: 'Aviso quando alguém entra de um lugar novo',
      texto: 'Se a sua conta for usada num aparelho novo ou em outro país, você recebe um aviso no e-mail e no WhatsApp que você confirmou. Se não foi você, troque a senha e avise a administração.',
    },
    {
      id: 'livro', icone: 'livro', titulo: 'Um livro de entradas',
      texto: 'O Palácio anota cada entrada: quando, de que cidade, mais ou menos, e com qual aparelho. Só a administração lê esse livro. E cada vez que alguém o abre, isso também fica anotado.',
    },
    {
      id: 'cadeado', icone: 'cadeado', titulo: 'Tudo viaja e fica guardado com cadeado',
      texto: 'O que você digita viaja embaralhado entre o seu aparelho e o Palácio: é o cadeado que aparece ao lado do endereço. E os dados ficam guardados embaralhados no servidor.',
    },
    {
      id: 'duas-etapas', icone: 'celular', titulo: 'Duas etapas, se você quiser',
      texto: 'No seu perfil, dá para ligar a verificação em duas etapas. Além da senha, você digita um código de 6 números de um aplicativo do celular, que muda o tempo todo. É como o código do banco.',
    },
    {
      id: 'copia', icone: 'copia', titulo: 'Uma cópia de segurança todo dia',
      texto: 'Todo dia, uma cópia do banco de dados e dos arquivos vai para outro lugar, embaralhada e com uma trava que impede apagar. Se algo der muito errado, dá para recuperar.',
    },
  ],
}

export const QUEM_VE: ListaDaSeguranca = {
  id: 'quem-ve',
  titulo: 'Quem pode ver o quê',
  frases: ['Uma resposta honesta, pessoa por pessoa.'],
  itens: [
    { id: 'voce', icone: 'chave', titulo: 'Você', texto: 'Os seus dados e o que o seu trabalho pede.' },
    { id: 'coordenacao', icone: 'porteiro', titulo: 'A coordenação do seu setor', texto: 'O que é do setor, como os pedidos que o setor precisa aprovar.' },
    {
      id: 'administracao', icone: 'livro', titulo: 'A administração do Palácio',
      texto: 'Quem cuida de qualquer sistema tem a chave técnica dele, como o síndico tem a chave da casa de máquinas do prédio. A administração usa essa chave para manter o Palácio funcionando e para dar e tirar acessos. Mesmo assim, ela não vê a sua senha, e até a consulta dela ao livro de entradas fica anotada.',
    },
    {
      id: 'claude', icone: 'projeto', titulo: 'O Claude',
      texto: 'Só quando alguém da equipe que constrói o Palácio abre uma sessão de trabalho para construir ou consertar alguma coisa, e com regras. Mais abaixo, explicamos como.',
    },
    {
      id: 'de-fora', icone: 'cadeado', titulo: 'Gente de fora',
      texto: 'Ninguém. Os dados só saem para os serviços que fazem o Palácio funcionar, como o envio de e-mail e o WhatsApp, e só o necessário. O Palácio não vende dados.',
    },
  ],
}

export const CONSTRUIDO: ParteDoGuia = {
  id: 'construido',
  titulo: 'Como o Palácio é construído, com o Claude',
  frases: [
    'O Palácio Virtual não foi comprado pronto. Ele é construído aqui, sob medida para a filial, por uma pequena equipe liderada pelo Matheus, com a ajuda do Claude.',
    'O Claude é um assistente de inteligência artificial, feito pela Anthropic, uma empresa dos Estados Unidos. Ele escreve o código do Palácio: as telas, os botões e as regras.',
    'Pense numa obra. O Matheus é o engenheiro responsável: diz o que a filial precisa e confere tudo. O Claude é um mestre de obras muito rápido, que constrói seguindo a planta e as normas. Nenhuma parte nova é inaugurada sem o engenheiro aprovar.',
    'O Claude trabalha numa sessão de trabalho à parte, que alguém da equipe abre e fecha. Ele não fica morando dentro do Palácio.',
    'As chaves do Palácio, que são as senhas dos serviços que ele usa, ficam num cofre da Vercel, o serviço que mantém o Palácio no ar. As regras proíbem o Claude de pedir, ler ou escrever essas chaves.',
    'Quando ele precisa olhar o banco de dados para achar um defeito, quem dá esse acesso é a pessoa responsável pela sessão, só para aquele trabalho. E tudo o que o Claude faz fica registrado na conversa de trabalho, passo a passo: dá para conferir depois.',
  ],
}

export const NAO_FAZ_TUDO: ListaDaSeguranca & { exemplos: { titulo: string; frases: string[] }[] } = {
  id: 'nao-faz-tudo',
  titulo: 'Por que o Claude não faz tudo o que pedem',
  frases: [
    'Um bom profissional não faz tudo o que o cliente manda: ele segue as normas da profissão. Um eletricista não faz uma ligação perigosa só porque o dono da casa pediu. Com o Claude é igual.',
    'Ele segue três conjuntos de regras, e nenhum deles depende da vontade de quem está pedindo.',
  ],
  itens: [
    {
      id: 'regras-do-projeto', icone: 'projeto', titulo: 'As regras escritas do projeto',
      texto: 'Valem para qualquer pessoa ou programa que construa o Palácio. Nunca escrever senhas no código. Não mexer nos dados de verdade sem o responsável pedir com todas as letras. Nunca pôr nada no ar sem conferência. E contar o que aconteceu de verdade, inclusive o que deu errado.',
    },
    {
      id: 'regras-do-mercado', icone: 'mercado', titulo: 'As boas práticas do mercado',
      texto: 'Dar a cada pessoa só o acesso de que ela precisa. Pedir duas pessoas para as decisões sensíveis. Registrar o que acontece. E seguir a LGPD.',
    },
    {
      id: 'regras-da-anthropic', icone: 'anthropic', titulo: 'As regras da empresa que fez o Claude',
      texto: 'A Anthropic proíbe usar o Claude para vigiar pessoas ou tirar dados delas sem permissão, e o Claude é treinado para recusar esse tipo de pedido.',
    },
  ],
  exemplos: [
    {
      titulo: 'Um exemplo de verdade, deste projeto',
      frases: [
        'Para facilitar o começo da equipe, o Matheus pediu um primeiro passo “sem senha e com o mínimo de segurança”.',
        'O Claude deixou tudo o mais simples possível, mas manteve duas travas e explicou por quê: a coordenação do setor aprova o pedido de e-mail, e a administração convida a pessoa para o Palácio.',
        'Sem essas travas, qualquer pessoa com o link ganharia um e-mail da Cruz Vermelha, que fala em nome da instituição, ou entraria num sistema com CPF e documentos.',
      ],
    },
    {
      titulo: 'Outro exemplo: o botão “Achei um erro”',
      frases: [
        'Quando alguém avisa de um erro, o aviso chega ao Claude, que prepara a correção.',
        'Mas ele só pode ler o aviso: não muda nenhum dado, não põe nada no ar sozinho e nunca copia o que a pessoa escreveu para fora do Palácio. Quem aprova a correção é a administração.',
      ],
    },
  ],
}

export const GOVERNANCA: ParteDoGuia = {
  id: 'governanca',
  titulo: 'Como uma mudança chega ao Palácio',
  frases: [
    'Governança digital é o jeito de decidir e de registrar o que muda no sistema, para que nada aconteça escondido. No Palácio, toda mudança passa pelo mesmo caminho.',
  ],
  passos: [
    'Alguém da filial pede uma melhoria ou avisa de um problema, por exemplo pelo “Achei um erro”.',
    'O Claude ou alguém da equipe prepara a mudança numa cópia à parte, sem mexer no Palácio que está no ar.',
    'Verificações automáticas conferem a mudança: se o código está certo, se nada quebrou e se a ajuda continua dizendo a verdade.',
    'Uma versão de teste do Palácio é montada, para ver a mudança funcionando antes.',
    'Só quando o responsável aprova, a mudança entra no ar.',
    'Fica tudo registrado para sempre: quem fez, quando, o que mudou e por quê.',
  ],
}

/** O código aberto: o link vai ao repositório no GitHub (lib/versao.ts). */
export const CODIGO_ABERTO = {
  frases: [
    'O código do Palácio é aberto: qualquer pessoa pode ler, no GitHub. Se existisse uma porta escondida para tirar dados, ela estaria à vista de todos.',
    'As chaves, essas sim, ficam fora do código, guardadas no cofre.',
  ],
  link: REPOSITORIO,
}

/** Só para quem está logado: em lançamento oculto (docs/auditoria-publica.md §1). */
export const TRANSPARENCIA: ParteDoGuia = {
  id: 'transparencia',
  titulo: 'O registro que ninguém apaga: a trilha pública e o portal da transparência',
  frases: [
    'A filial está preparando a trilha pública e o portal da transparência. Eles ainda não estão abertos ao público: a abertura é uma decisão da administração.',
    'Por quê: uma instituição que cuida de pessoas e recebe recursos precisa prestar contas. A lei das parcerias com o poder público, a Lei 13.019, de 2014, pede que essas parcerias fiquem públicas. E a confiança cresce quando qualquer pessoa pode conferir.',
    'O que é: cada documento oficial da filial, como matérias, comunicados, ofícios, certificados e os documentos do portal, ganha um código de conferência. Com ele, qualquer pessoa confere se o documento é o original e quando ele foi registrado.',
    'Como funciona, sem complicação: todo dia, os registros do dia são lacrados juntos, como um envelope com lacre de cera. Uma prova desse lacre vai para serviços de fora da filial, que ninguém daqui controla. Se alguém mudar um registro antigo escondido, o lacre não fecha mais, e a conferência mostra.',
    'Isso vale para todo mundo, inclusive para a administração e para o Claude: a história não se reescreve sem deixar marca.',
    'O que a conferência garante é que o registro não foi mudado. Ela não diz se o conteúdo está certo: isso continua sendo responsabilidade da filial.',
  ],
}

export const IA_NO_PALACIO: ParteDoGuia = {
  id: 'ia-no-palacio',
  titulo: 'A inteligência artificial dentro do Palácio',
  frases: [
    'Algumas ferramentas do Palácio usam inteligência artificial para poupar trabalho: melhorar o texto de uma matéria, adaptar uma legenda, criar uma imagem, ler o documento de um candidato a voluntário e o assistente do WhatsApp, para quem o tem ligado.',
    'Nesses casos, vai para a inteligência artificial só o que aquela tarefa precisa, e quem decide no fim é sempre uma pessoa.',
    'No documento do candidato a voluntário, ele é avisado antes e autoriza. A inteligência artificial só lê o que está impresso, e quem decide é uma pessoa da filial.',
    'Pelas regras dessas empresas para o uso profissional, o que o Palácio manda não é usado para treinar a inteligência artificial.',
  ],
}

export const SE_DESCONFIAR: ParteDoGuia = {
  id: 'se-desconfiar',
  titulo: 'Se você desconfiar de alguma coisa',
  frases: [
    'Recebeu um aviso de entrada que não foi você? Troque a senha em “Meu perfil” e avise a administração.',
    'Alguém pediu a sua senha? Não passe. Ninguém da filial precisa da sua senha, nem a administração.',
    'Você tem o direito de saber quais dados seus a filial guarda, de corrigir o que estiver errado e de pedir explicações. É a LGPD. Peça à administração da filial.',
  ],
}

/** As perguntas que a equipe faz, respondidas com honestidade. */
export const PERGUNTAS_DA_SEGURANCA: { id: string; pergunta: string; resposta: string }[] = [
  {
    id: 'senha',
    pergunta: 'O Matheus consegue ver a minha senha?',
    resposta: 'Não. A senha fica embaralhada de um jeito que não tem como desfazer. Ele só consegue criar uma senha nova para você, e você troca no primeiro acesso.',
  },
  {
    id: 'claude',
    pergunta: 'O Claude pode roubar os meus dados?',
    resposta: 'O Claude não age sozinho: ele só trabalha quando alguém da equipe que constrói o Palácio abre uma sessão de trabalho, e cada passo fica registrado. Ele segue regras que proíbem tirar dados das pessoas, e o código que ele escreve é aberto e conferido antes de entrar no ar.',
  },
  {
    id: 'administracao',
    pergunta: 'E quem cuida do sistema, pode?',
    resposta: 'Quem cuida de qualquer sistema tem a chave técnica dele, como o síndico tem a chave da casa de máquinas. Por isso existem as travas: a senha que ninguém vê, o livro de entradas que anota até quem o consulta, o código aberto, o registro de cada mudança e a LGPD, que responsabiliza quem usar dados de forma errada.',
  },
  {
    id: 'ia',
    pergunta: 'A inteligência artificial aprende com os meus dados?',
    resposta: 'Não. Nas ferramentas do Palácio que usam inteligência artificial, vai só o necessário para a tarefa e, pelas regras do uso profissional dessas empresas, isso não é usado para treinar a inteligência artificial.',
  },
  {
    id: 'onde',
    pergunta: 'Onde os dados ficam guardados?',
    resposta: 'Num serviço profissional de banco de dados, o Supabase, num centro de dados no Canadá, guardados embaralhados. E todo dia uma cópia de segurança vai para outro lugar, com trava.',
  },
]

// ------------------------------------------------------------------ os vídeos de explicação

/**
 * Os vídeos curtos da página (docs/AJUDA.md §18), gravados sobre ela mesma (scripts/videos/roteiros.ts, com
 * `explica`). O da transparência só aparece com login, como a parte dele.
 */
export const VIDEOS_DA_SEGURANCA: { id: string; parte: string; soComLogin?: true }[] = [
  { id: 'seguranca-por-que-existe', parte: 'por-que-existe' },
  { id: 'seguranca-cada-setor', parte: 'cada-setor' },
  { id: 'seguranca-as-trancas', parte: 'trancas' },
  { id: 'seguranca-como-construimos', parte: 'nao-faz-tudo' },
  { id: 'seguranca-transparencia', parte: 'transparencia', soComLogin: true },
]

/** O texto que cada vídeo explica: a impressão dele vem daqui, e a conferência avisa quando o texto muda depois. */
export function textoExplicadoPeloVideo(id: string): string | null {
  if (id === 'seguranca-por-que-existe') return textoDaParte(POR_QUE_EXISTE)
  if (id === 'seguranca-cada-setor') return textoDaParte(CADA_SETOR)
  if (id === 'seguranca-as-trancas') return textoCorrido([textoDaParte(EM_POUCAS_PALAVRAS), textoDaListaDaSeguranca(TRANCAS), textoDaListaDaSeguranca(QUEM_VE)])
  if (id === 'seguranca-como-construimos') return textoCorrido([textoDaParte(CONSTRUIDO), textoDoNaoFazTudo(), textoDaParte(GOVERNANCA), ...CODIGO_ABERTO.frases])
  if (id === 'seguranca-transparencia') return textoDaParte(TRANSPARENCIA)
  return null
}

// ------------------------------------------------------------------ o texto do "Ouvir" de cada parte

/** Uma lista inteira (trancas, quem vê, as regras), na ordem da tela. */
export function textoDaListaDaSeguranca(l: ListaDaSeguranca): string {
  return textoCorrido([l.titulo, ...l.frases, ...l.itens.flatMap((i) => [i.titulo, i.texto])])
}

/** "Por que o Claude não faz tudo": a introdução, as três regras e os exemplos. */
export function textoDoNaoFazTudo(): string {
  return textoCorrido([textoDaListaDaSeguranca(NAO_FAZ_TUDO), ...NAO_FAZ_TUDO.exemplos.flatMap((e) => [e.titulo, ...e.frases])])
}

export function textoDasPerguntas(): string {
  return textoCorrido(['Perguntas que a equipe faz', ...PERGUNTAS_DA_SEGURANCA.flatMap((p) => [p.pergunta, p.resposta])])
}

/** Todos os textos da página, para a conferência (scripts/conferir-ajuda.ts). */
export function textosDaSeguranca(): string[] {
  return [
    ...[POR_QUE_EXISTE, CADA_SETOR, EM_POUCAS_PALAVRAS, POR_QUE, CONSTRUIDO, GOVERNANCA, TRANSPARENCIA, IA_NO_PALACIO, SE_DESCONFIAR].flatMap((p) => [p.titulo, ...p.frases, ...(p.passos ?? [])]),
    ...[TRANCAS, QUEM_VE, NAO_FAZ_TUDO].flatMap((l) => [l.titulo, ...l.frases, ...l.itens.flatMap((i) => [i.titulo, i.texto])]),
    ...NAO_FAZ_TUDO.exemplos.flatMap((e) => [e.titulo, ...e.frases]),
    ...CODIGO_ABERTO.frases,
    ...PERGUNTAS_DA_SEGURANCA.flatMap((p) => [p.pergunta, p.resposta]),
  ]
}
