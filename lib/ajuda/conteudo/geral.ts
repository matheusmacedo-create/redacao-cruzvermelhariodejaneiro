import type { PassoDoTour, Pergunta, Tarefa, TopicoGeral } from '../tipos'

/**
 * A ajuda que não é de uma área: o tour de boas-vindas (o da equipe e o da
 * equipe da escola) e os tópicos gerais da Central — conta e acesso, como
 * navegar e como pedir ajuda.
 *
 * Os alvos são os `data-ajuda="shell.*"` do esqueleto da tela
 * (components/app/topbar.tsx, sidebar.tsx, sino.tsx). Cada frase tem apoio
 * no código: components/auth/**, lib/usuarios/**, lib/contas/**,
 * lib/notificacoes/** e ARQUITETURA.md §5 e §7.8. Mudou a tela, mude aqui.
 */

// Menu e busca mudam de lugar com a largura: no computador, a sidebar; no
// celular, o botão de menu e a lupa do topo. Os dois passos de menu são
// 'pular': só o que está na tela aparece, e a contagem fica certa.
// O menu do computador pode estar recolhido (a escolha fica guardada,
// components/app/cookies-do-menu.ts): aí ele mostra só os ícones, sem o nome
// dos grupos, e o texto precisa valer nos dois jeitos.
const MENU_NO_COMPUTADOR: PassoDoTour = {
  alvo: 'shell.menu',
  titulo: 'As áreas, por setor',
  texto: 'O menu junta as áreas por setor e por tipo de trabalho, como “Expediente”, “Redação” e “Gestão”, e só mostra o que o seu papel permite. Cada área aparece uma vez só; o que é parte de uma área vira aba dentro dela. O nome de um grupo abre e fecha a lista, e o botão no pé do menu deixa só os ícones ou volta a abrir tudo.',
  lado: 'right',
  seAusente: 'pular',
}

const MENU_NO_CELULAR: PassoDoTour = {
  alvo: 'shell.abrir-menu',
  titulo: 'As áreas ficam no menu',
  texto: 'O botão de menu, no alto à esquerda, abre as áreas, agrupadas por setor. Você só vê o que o seu papel permite.',
  seAusente: 'pular',
}

// Busca e ajuda também estão no celular (a lupa e o "?" do topo), onde não há
// teclado físico: o atalho de teclado é dito como coisa do computador.
const BUSCA: PassoDoTour = {
  alvo: 'shell.busca',
  titulo: 'Busca rápida',
  texto: 'Digite o nome de uma área, de uma ação ou uma dúvida; os nomes antigos das áreas também valem. No computador, ⌘K (no Mac) ou Ctrl K também abrem a busca, de qualquer tela.',
  lado: 'right',
}

const SINO: PassoDoTour = {
  alvo: 'shell.sino',
  titulo: 'Notificações',
  texto: 'O sino mostra o que aconteceu com você, com o número do que falta ler. Em “E-mails de aviso”, dentro dele, você escolhe o que também chega por e-mail.',
  lado: 'bottom',
}

// O "?" abre o painel (components/app/ajuda/painel.tsx); o tour sai do botão
// "Fazer o tour desta tela" lá dentro, que só aparece se a tela tem tour.
const AJUDA: PassoDoTour = {
  alvo: 'shell.ajuda',
  titulo: 'Ajuda em qualquer tela',
  texto: 'O “?” mostra a ajuda da tela aberta: como imaginamos a área funcionando, o passo a passo com exemplos, as perguntas frequentes e o tour. No fim, “O que achou desta tela?” e “Pergunte à equipe”; no celular, o “Beta” também fica aqui.',
  lado: 'bottom',
}

// O beta com a equipe (components/app/ajuda/beta.tsx): o botão do topo só
// existe do tablet para cima; no celular o mesmo formulário fica no alto do
// painel "?", e o balão da ajuda diz isso.
const BETA: PassoDoTour = {
  alvo: 'shell.beta',
  titulo: 'Estamos em beta: conte tudo',
  texto: '“Beta” manda para a equipe que está melhorando o Palácio um problema, uma ideia, uma dúvida ou um elogio, com a tela onde você está. A resposta volta no sino.',
  lado: 'bottom',
  seAusente: 'pular',
}

// O menu da foto lista o grupo Administração que a pessoa vê (topbar.tsx →
// MenuDaPessoa): "Configurações" não tem permissão, então toda a equipe da
// Redação vê; "Usuários e permissões" é só de administrador e fica de fora.
const CONTA: PassoDoTour = {
  alvo: 'shell.conta',
  titulo: 'A sua conta',
  texto: 'No menu da sua foto (ou iniciais) ficam “Meu perfil”, “Configurações”, “Ajuda” (a Central de ajuda) e “Sair”. No perfil você troca a senha, confirma o e-mail de recuperação e ativa a verificação em duas etapas.',
  lado: 'bottom',
}

/**
 * Primeiro acesso da equipe da Redação: 8 balões no computador, 6 no celular
 * (lá o menu é um botão e a linha de Aprovações fica dentro dele, fechada).
 * Não há balão de abertura: a janela de boas-vindas (boas-vindas.tsx) já
 * apresenta a Redação, e o tour só sai dela. A ordem segue a tela: o menu e o
 * que está nele, depois a barra do topo, da esquerda para a direita.
 */
export const BOAS_VINDAS: PassoDoTour[] = [
  MENU_NO_COMPUTADOR,
  MENU_NO_CELULAR,
  BUSCA,
  {
    alvo: 'shell.aprovacoes',
    titulo: 'O que espera o seu voto',
    texto: 'Quando pedem a sua aprovação, é em “Aprovações” que você decide. O número ao lado conta só o que ainda espera o seu voto.',
    lado: 'right',
    seAusente: 'pular',
  },
  {
    alvo: 'shell.criar',
    titulo: 'Criar, de qualquer tela',
    texto: 'O botão “Criar” começa o que é mais comum sem passar pelo menu: “Registrar atividade”, “Nova publicação”, “Novo ofício” e “Abrir chamado”.',
    lado: 'bottom',
  },
  BETA,
  SINO,
  AJUDA,
  CONTA,
]

/**
 * Primeiro acesso da equipe da escola (6 balões no computador, 5 no celular): ela não tem "Criar" nem
 * Aprovações (topbar.tsx esconde o Criar; o menu dela é lib/navegacao.ts →
 * gruposDaEquipeDaEscola, sem "Configurações"). Os nomes antigos que a busca
 * aceita são de áreas da Redação, então não entram aqui.
 */
export const BOAS_VINDAS_ESCOLA: PassoDoTour[] = [
  {
    ...MENU_NO_COMPUTADOR,
    titulo: 'As áreas da Escola',
    texto: 'O menu mostra as áreas da Escola e o Chat. O que o seu acesso não abre não aparece.',
  },
  {
    ...MENU_NO_CELULAR,
    texto: 'O botão de menu, no alto à esquerda, abre as áreas da Escola e o Chat.',
  },
  {
    ...BUSCA,
    texto: 'Digite o nome de uma área ou a sua dúvida. No computador, ⌘K (no Mac) ou Ctrl K também abrem a busca, de qualquer tela.',
  },
  BETA,
  SINO,
  AJUDA,
  {
    ...CONTA,
    texto: 'No menu da sua foto (ou iniciais) ficam “Meu perfil”, “Ajuda” (a Central de ajuda) e “Sair”. No perfil você troca a senha, confirma o e-mail de recuperação e ativa a verificação em duas etapas.',
  },
]

// ------------------------------------------------ o que também mora numa área
//
// Estas tarefas e perguntas aparecem aqui e em Meu perfil ou Notificações
// (administracao.ts, meu-dia.ts). A busca mostra uma vez só o que tem o mesmo
// título (buscarNaAjuda, em lib/ajuda) — a daqui —, então o texto é um só: a
// área importa daqui e troca apenas o id, que é a âncora de cada lugar. Por
// isso o texto não supõe em que tela a pessoa está e diz o caminho até ela.

export const TROCAR_A_SENHA: Omit<Tarefa, 'id'> = {
  titulo: 'Trocar a sua senha',
  passos: [
    'Toque na sua foto (ou iniciais), no alto à direita, e abra “Meu perfil”.',
    'Na parte “Segurança”, digite a “Senha atual”, a “Nova senha” e repita a nova em “Confirmar nova senha”. O ícone de olho mostra o que você digitou.',
    'Siga o aviso embaixo dos campos até ele não apontar mais nenhum problema.',
    'Toque em “Trocar senha”. Aparece “Senha trocada. As outras sessões abertas foram encerradas.”',
  ],
  dica: 'A senha nova precisa de pelo menos 10 caracteres, com letras e números, sem o seu nome nem o seu usuário, e diferente da atual.',
}

export const CONFIRMAR_O_EMAIL: Omit<Tarefa, 'id'> = {
  titulo: 'Cadastrar e confirmar o e-mail de recuperação',
  passos: [
    'Em “Meu perfil”, na parte “E-mail de recuperação”, digite o endereço no campo. Se já houver um e-mail lá, toque antes em “Trocar e-mail”.',
    'Toque em “Enviar confirmação”.',
    'Abra o e-mail que chegou nesse endereço e toque no link. Ele vale por 48 horas.',
    'Na página que abrir, toque em “Confirmar este e-mail”. De volta ao perfil, o endereço aparece como “confirmado”.',
  ],
  dica: 'Nada muda até você tocar em “Confirmar este e-mail”: só então o endereço passa a valer. Se o link não chegou ou venceu, peça outro do mesmo jeito (com o endereço “não confirmado”, também há “Reenviar confirmação”).',
}

export const ATIVAR_A_VERIFICACAO: Omit<Tarefa, 'id'> = {
  titulo: 'Ativar a verificação em duas etapas',
  passos: [
    'Instale no celular um app autenticador, como Google Authenticator, Microsoft Authenticator ou Authy.',
    'Em “Meu perfil”, na parte “Verificação em duas etapas”, toque em “Ativar verificação em duas etapas”.',
    'Em “Nome deste aparelho”, dê um nome que você reconheça (por exemplo, “Celular pessoal”) e toque em “Gerar QR Code”.',
    'No app, adicione uma conta e leia o QR Code. Se não der, digite o código que aparece em “Não dá para ler? Digite este código no app”.',
    'Digite o número de 6 dígitos que o app mostra e toque em “Ativar”. Do próximo login em diante, o Palácio Virtual pede também o código do app.',
  ],
  dica: 'Cadastre também um segundo aparelho com “Adicionar outro aparelho”: se perder o celular, você continua entrando pelo outro. O código do QR Code fica só no app, porque quem tiver esse código consegue gerar os seus números.',
}

export const SAIR_DA_CONTA: Omit<Tarefa, 'id'> = {
  titulo: 'Sair da conta',
  passos: [
    'Toque na sua foto (ou iniciais), no alto à direita.',
    'No fim do menu, escolha “Sair”.',
    'Para voltar, entre de novo com o seu usuário (ou o e-mail confirmado) e a senha.',
  ],
  dica: 'Em “Meu perfil” também há o botão “Sair da conta”, no fim da página.',
}

export const PARA_QUE_SERVE_O_EMAIL: Omit<Pergunta, 'id'> = {
  pergunta: 'Para que serve o e-mail de recuperação?',
  resposta: 'É para ele que vão o link de “Esqueci minha senha”, os avisos de segurança da sua conta e os e-mails de notificação que você escolher. Enquanto ele não estiver confirmado, nada disso tem para onde ir, e uma faixa amarela no alto das telas lembra você.\n\nConfirmado, ele também serve para entrar: digite-o em “Usuário ou e-mail”, na tela de entrada.',
  termos: ['e-mail de contato', 'recuperar senha', 'confirmar e-mail', 'faixa amarela', 'aviso amarelo', 'cadastrar agora'],
}

// A lista de assuntos para nos três primeiros: com todos, entraria “Chamados”,
// e o conferir-ajuda cobra o selo SO_DA_REDACAO de tarefa geral que cita
// chamado — mas esta vale também para a equipe da escola.
export const ESCOLHER_OS_EMAILS: Omit<Tarefa, 'id'> = {
  titulo: 'Escolher o que chega por e-mail',
  passos: [
    'Abra as suas preferências: no sino, “E-mails de aviso”; em “Notificações”, “Escolher o que chega por e-mail”; ou, em “Meu perfil”, a parte “E-mails de notificação”.',
    'Cada linha é um assunto, como “Chat”, “Aprovações” e “Mensagens”, com exemplos do que entra nele.',
    'Em cada um, escolha “Na hora”, “Resumo diário” ou “Só no sino”.',
    'Não há botão de salvar: ao tocar, a escolha já vale e aparece “Preferência salva.” embaixo da lista.',
  ],
  dica: 'Os e-mails vão para o seu e-mail de recuperação, e só depois que ele for confirmado. Os avisos de segurança da conta (senha, verificação em duas etapas) chegam sempre.',
}

export const EMAIL_DE_AVISO_NAO_CHEGOU: Omit<Pergunta, 'id'> = {
  pergunta: 'Por que não recebi o e-mail de uma notificação?',
  resposta: 'Alguns motivos: o seu e-mail de recuperação não está confirmado; o assunto está em “Só no sino” ou “Resumo diário”; ou você estava com o Palácio Virtual aberto, e aí o aviso não sai na hora: se você não abrir, ele vai no resumo do dia.\n\nSobre a mesma coisa, sai no máximo um e-mail a cada 15 minutos. Vale olhar também a caixa de spam.',
  termos: ['e-mail de aviso', 'não chegou', 'notificação por e-mail', 'spam'],
}

export const TOPICOS_GERAIS: TopicoGeral[] = [
  {
    id: 'como-o-palacio-funciona',
    titulo: 'Como imaginamos o Palácio funcionando',
    resumo: 'O Palácio Virtual não é um monte de telas soltas: cada área passa o trabalho para a próxima. Estas quatro histórias mostram o caminho de ponta a ponta, com um caso de verdade. Cada área também tem o seu “Na prática”, no “?” e na Central.',
    naPratica: [
      {
        titulo: 'Da ação na rua à notícia no ar',
        passos: [
          'A Comunicação cria o evento em “Envios da equipe” e manda o link aos voluntários que vão à ação na Central do Brasil.',
          'Os voluntários mandam fotos, áudio e relato pelo celular, sem login; tudo chega em “Envios da equipe”.',
          '“Criar matéria e posts” abre a pauta em “Pautas”, a matéria em rascunho e o pacote em “Publicações”, com as fotos na “Biblioteca”.',
          'As pessoas que aparecem nas fotos assinam a autorização de imagem por link; a matéria vai para “Aprovações”.',
          'Aprovado, o pacote sai no site, na newsletter e nas redes; o “Histórico” registra cada destino e a “Trilha pública” guarda a prova.',
          'Quem mandou é avisado por e-mail, com o link da matéria e o do álbum do evento.',
        ],
        resultado: 'Do celular do voluntário ao site da filial sem planilha, sem grupo de fotos e com cada passo registrado.',
      },
      {
        titulo: 'Da necessidade do setor ao material na prateleira',
        passos: [
          'Um setor pede papel e canetas em “Pedidos de compra”.',
          'O Financeiro pede as propostas aos fornecedores habituais, que respondem por um link, sem login.',
          'A proposta mais vantajosa vai para aprovação; aprovada, sai a ordem de compra por e-mail.',
          'Quem pediu registra o que chegou; o Patrimônio dá entrada no estoque, e a conta a pagar entra no “Financeiro”.',
          'No fim do mês, o relatório de compras vai para o portal de “Transparência”.',
        ],
        resultado: 'Cada real gasto tem pedido, propostas, aprovação e nota, juntos.',
      },
      {
        titulo: 'Do formulário do site ao certificado do voluntário',
        passos: [
          'A pessoa se inscreve pelo site; a coordenação aprova em “Voluntários”.',
          'Ela entra na Área do Voluntário, vê as oportunidades e se candidata a uma ação.',
          'Faz o curso de primeiros socorros pela Área do Voluntário.',
          'A coordenação marca a presença na ação e registra as horas.',
          'O certificado sai com código de verificação, e a conversa com a coordenação fica em “Mensagens dos voluntários”.',
        ],
        resultado: 'O voluntário tem tudo num lugar, e a filial sabe quem fez o quê, por quantas horas.',
      },
      {
        titulo: 'Do dinheiro que entra ao fechamento do mês',
        passos: [
          'As matrículas pagas na Únicopag entram sozinhas como receita no Financeiro da Escola.',
          'As contas da filial são lançadas com categoria, fonte e comprovante; o sino avisa o que vence.',
          'O extrato do banco é importado e conciliado com os lançamentos.',
          'O mês é fechado e o pacote vai para o contador; os balanços aprovados vão para o portal de “Transparência”.',
        ],
        resultado: 'O caixa bate com o banco e a prestação de contas sai pronta.',
      },
    ],
    tarefas: [],
    perguntas: [
      {
        id: 'por-onde-comecar',
        pergunta: 'Sou novo no Palácio Virtual. Por onde começo?',
        resposta: 'Pelo Início: ele diz em uma frase o que é seu hoje. Depois, abra o “?” em cada tela que for usar: primeiro o “Na prática”, que conta como imaginamos a área funcionando, depois o passo a passo, com exemplos.\n\nSe algo não fizer sentido, é exatamente o que queremos saber: use o “Beta” para contar.',
        termos: ['começar', 'primeiro dia', 'novo', 'iniciante', 'como usar'],
      },
    ],
  },
  {
    id: 'beta',
    titulo: 'O beta: conte o que achou',
    resumo: 'O Palácio Virtual está em beta com a equipe: estamos melhorando a ferramenta todos os dias, a partir do que vocês contam. Cada opinião, dúvida, problema ou ideia chega direto a quem está construindo o Palácio, com a tela e o aparelho de onde veio.',
    tarefas: [
      {
        id: 'contar-um-problema',
        titulo: 'Contar um problema ou uma ideia',
        passos: [
          'Na tela onde aconteceu, toque em “Beta”, no alto (no celular, abra o “?” e toque em “Beta: conte um problema ou uma ideia”).',
          'Escolha “Algo deu errado”, “Tenho uma ideia”, “Tenho uma dúvida” ou “Gostei!”.',
          'Conte com as suas palavras: o que você fez, o que esperava e o que aconteceu.',
          'Se quiser, dê uma nota para a tela e toque em “Enviar”.',
        ],
        exemplo: '“Algo deu errado”: “Em Pedidos de compra, no celular, toquei em Pedir propostas e o botão Enviar ficou escondido embaixo do teclado.” Junto vai sozinho: a tela, “Celular · 390×844 · Chrome no Android”.',
        dica: 'Não precisa de print nem de explicar o aparelho: a tela e o tamanho da janela vão juntos. Nada do que está digitado na tela é enviado.',
      },
      {
        id: 'avaliar-a-tela',
        titulo: 'Dizer o que achou de uma tela',
        passos: [
          'Abra o “?” na tela.',
          'No fim do painel, em “O que achou desta tela?”, toque numa das cinco notas, de “Muito ruim” a “Ótima”.',
          'Se quiser, conte o que atrapalhou ou o que você mais gostou.',
          'Toque em “Enviar opinião”.',
        ],
        exemplo: 'A Ana dá “Ruim” para Pedidos de compra e escreve: “Não achei onde ficam as propostas”. A administração vê essa tela subir na lista das piores avaliadas e sabe por onde começar.',
      },
      {
        id: 'votar-numa-resposta',
        titulo: 'Dizer se uma resposta da ajuda ajudou',
        passos: [
          'Abra uma pergunta frequente, no “?” ou na Central de ajuda.',
          'Embaixo da resposta, toque em “Sim” ou “Não” em “Isso ajudou?”.',
          'Se tocar em “Não”, conte o que faltou e toque em “Enviar”.',
        ],
        exemplo: 'Em “Onde ficam as propostas de um pedido?”, o Bruno toca “Não” e escreve “faltou dizer que no celular fica mais embaixo”. A resposta é reescrita, e as que mais ajudam sobem em “Perguntas mais frequentes”.',
      },
      {
        id: 'ver-a-resposta',
        titulo: 'Ver a resposta da equipe',
        passos: [
          'Quando a equipe responde, chega um aviso no sino: “A equipe respondeu o seu retorno do beta”.',
          'Toque no aviso, ou abra a Central de ajuda e desça até “Seus retornos do beta”.',
          'Lá ficam tudo o que você mandou, a situação (“Novo”, “Em análise”, “Resolvido”) e a resposta.',
        ],
      },
    ],
    perguntas: [
      {
        id: 'quem-ve-o-que-eu-mando',
        pergunta: 'Quem vê o que eu mando pelo Beta?',
        resposta: 'A administração do Palácio Virtual, que cuida das melhorias. As outras pessoas da equipe não veem o que você mandou; nas “Perguntas mais frequentes”, a Central mostra só quantas pessoas acharam uma resposta útil, nunca quem votou.',
        termos: ['privacidade', 'anônimo', 'quem lê', 'feedback'],
      },
      {
        id: 'o-que-acontece-depois',
        pergunta: 'O que acontece com o que eu mando?',
        resposta: 'Problema, dúvida, ideia e nota ruim avisam a administração na hora. Cada retorno ganha uma situação (“Novo”, “Em análise”, “Resolvido” ou “Arquivado”) e, quando precisa, uma resposta, que chega no seu sino.\n\nOs retornos também viram prioridade: as telas com pior avaliação e as respostas da ajuda que não ajudaram vêm primeiro na fila de melhorias.',
        termos: ['depois de enviar', 'resposta', 'melhoria', 'prazo'],
      },
      {
        id: 'nao-vejo-o-beta',
        pergunta: 'Não vejo o botão “Beta”. Onde ele está?',
        resposta: 'No computador e no tablet, ele fica no alto, ao lado do sino. No celular o topo não tem espaço: abra o “?” e toque em “Beta: conte um problema ou uma ideia”, logo no começo do painel. “O que achou desta tela?” e “Pergunte à equipe” ficam no fim do mesmo painel.',
        termos: ['botão beta', 'celular', 'não aparece', 'opinião'],
      },
    ],
  },
  {
    id: 'conta-e-acesso',
    titulo: 'Conta e acesso',
    resumo: 'Entrar, trocar e recuperar a senha, o e-mail de recuperação e a verificação em duas etapas.',
    tarefas: [
      {
        id: 'entrar',
        titulo: 'Entrar no Palácio Virtual',
        passos: [
          'Abra a página inicial do Palácio Virtual.',
          'Em “Usuário ou e-mail”, digite o seu usuário (nome.sobrenome) ou o seu e-mail de recuperação.',
          'Digite a sua senha e toque em “Entrar”.',
          'Se você usa a verificação em duas etapas, digite o código de 6 dígitos que o app autenticador mostra.',
        ],
        dica: 'Entrar com o e-mail só funciona depois que ele foi confirmado em “Meu perfil”. Até lá, use o usuário.',
      },
      {
        id: 'esqueci-a-senha',
        titulo: 'Criar uma senha nova pelo “Esqueci minha senha”',
        passos: [
          'Na tela de entrada, toque em “Esqueci minha senha”.',
          'Em “Usuário ou e-mail”, informe o seu usuário ou o seu e-mail de recuperação e toque em “Enviar link por e-mail”.',
          'Abra o link que chegou no seu e-mail de recuperação (confira também o spam). Ele vale por 1 hora e funciona uma vez só.',
          'Digite a senha em “Nova senha”, repita em “Confirmar senha” e toque em “Salvar nova senha”.',
          'Entre de novo com o seu usuário e a senha nova.',
        ],
        dica: 'O link só vai para um e-mail de recuperação já confirmado. Sua senha antiga continua valendo até você salvar a nova; ao salvar, as sessões abertas em outros aparelhos são encerradas.',
      },
      { id: 'trocar-a-senha', ...TROCAR_A_SENHA },
      { id: 'confirmar-o-email', ...CONFIRMAR_O_EMAIL },
      { id: 'ativar-a-verificacao', ...ATIVAR_A_VERIFICACAO },
      { id: 'sair-da-conta', ...SAIR_DA_CONTA },
    ],
    perguntas: [
      {
        id: 'senha-provisoria',
        pergunta: 'Recebi uma senha provisória. E agora?',
        resposta: 'A senha que um administrador definiu só vale para o primeiro acesso. Logo depois de entrar, o Palácio Virtual pede que você crie uma senha só sua: repita a temporária em “Senha temporária (a que você acabou de usar)” e escolha a nova. Nada funciona antes disso.',
        termos: ['senha temporária', 'primeiro acesso', 'criar a sua senha', 'crie a sua senha'],
      },
      {
        id: 'convite-por-email',
        pergunta: 'Recebi um convite por e-mail. Como faço o primeiro acesso?',
        resposta: 'Abra o link do convite, preencha “Sua senha” e “Confirmar senha” e toque em “Criar senha e continuar”. Depois, entre com o usuário que aparece na página e a senha nova; o e-mail do convite já fica confirmado como e-mail de recuperação.\n\nO link vale por 72 horas e funciona uma vez só: se vencer, peça outro a um administrador.',
        termos: ['convite', 'primeiro acesso', 'link expirou', 'criar senha', 'conta nova'],
      },
      {
        id: 'sem-email-de-recuperacao',
        pergunta: 'Esqueci a senha e não tenho e-mail de recuperação. O que faço?',
        resposta: 'Peça a um administrador uma senha temporária para entrar. Depois, cadastre e confirme o seu e-mail de recuperação em “Meu perfil”, para da próxima vez resolver sozinho.',
        termos: ['não consigo entrar', 'bloqueado', 'recuperar acesso'],
      },
      { id: 'por-que-confirmar-o-email', ...PARA_QUE_SERVE_O_EMAIL },
      {
        id: 'perdi-o-celular',
        pergunta: 'Perdi ou troquei de celular e não tenho o código. Como entro?',
        resposta: 'Se você cadastrou outro aparelho, escolha-o em “Aparelho”, na tela do código. Se não, toque em “Perdi ou troquei de celular — avisar os administradores”. Um administrador confirma com você e tira a verificação da sua conta; depois, você cadastra o app no celular novo.',
        termos: ['código do app', 'autenticador', 'celular novo', '2fa'],
      },
      {
        id: 'verificacao-obrigatoria',
        pergunta: 'A verificação em duas etapas é obrigatória?',
        resposta: 'Depende do seu papel: um administrador pode torná-la obrigatória para alguns papéis, e aí o Palácio Virtual pede o cadastro logo depois do login. Para os outros, é opcional — mas quem cadastrou o app passa a digitar o código sempre.',
        termos: ['2fa', 'código', 'autenticador', 'segurança'],
      },
      {
        id: 'redefinir-e-verificacao',
        pergunta: 'Criar uma senha nova desliga a verificação em duas etapas?',
        resposta: 'Não. Com a senha nova, o login continua pedindo o código do app.',
        termos: ['2fa', 'esqueci minha senha'],
      },
      {
        id: 'conta-desativada',
        pergunta: 'Aparece “Esta conta está desativada” ao entrar. Por quê?',
        resposta: 'Um administrador desativou o seu acesso. Só um administrador pode reativá-lo, em “Usuários e permissões”.',
        termos: ['não consigo entrar', 'acesso bloqueado', 'reativar'],
      },
    ],
  },
  {
    id: 'navegar',
    titulo: 'Como se achar',
    resumo: 'O menu, a busca, o botão “Criar”, o caminho no alto da tela e as notificações — o que é igual em todas as telas.',
    tarefas: [
      {
        id: 'usar-a-busca',
        titulo: 'Achar uma área ou uma resposta pela busca',
        passos: [
          'Toque em “Buscar…”, no alto do menu (no celular, na lupa do topo), ou use ⌘K / Ctrl K.',
          'Digite o nome de uma área, de uma ação ou a sua dúvida.',
          'Ande pelos resultados com as setas e abra com Enter (ou toque no resultado).',
        ],
        dica: 'Nomes antigos também valem: “Cérebro” acha o Radar de pautas, “Impacto” acha Resultados e “Registro” acha Histórico.',
      },
      {
        id: 'recolher-o-menu',
        titulo: 'Recolher o menu para ganhar espaço',
        passos: [
          'No pé do menu, toque no botão “Recolher menu” (o ícone de painel).',
          'O menu fica só com os ícones; pare o mouse sobre um deles para ver o nome.',
          'Para abrir de novo, toque em “Expandir menu”, no mesmo lugar.',
        ],
        dica: 'O Palácio Virtual lembra a sua escolha neste navegador. No celular o menu não recolhe: ele abre e fecha pelo botão de menu.',
      },
      {
        id: 'usar-o-criar',
        titulo: 'Começar algo pelo botão “Criar”',
        passos: [
          'Toque em “Criar”, no alto à direita.',
          'Escolha “Registrar atividade”, “Nova publicação”, “Novo ofício” ou “Abrir chamado”.',
          '“Nova publicação” já cria o pacote e abre a tela dele; “Novo ofício” cria o rascunho do ofício e abre.',
        ],
        quem: 'Equipe do Palácio Virtual',
      },
      { id: 'avisos-por-email', ...ESCOLHER_OS_EMAILS },
    ],
    perguntas: [
      {
        // A reorganização do menu de 27/09/2026 (docs/NAVEGACAO.md §5). Os endereços não mudaram.
        id: 'onde-foi-parar',
        pergunta: 'O menu mudou. Onde foi parar cada área?',
        resposta: 'O menu agora segue os setores, e cada área aparece uma vez só. Chat e Calendário subiram para o topo, junto do Início e das Aprovações. Chamados, Pedidos de compra, Ofícios e E-mail do setor ficam em “Expediente”. A comunicação se divide em “Redação” (Radar de pautas, Pautas, Projetos, Publicações e Resultados), “Mídia” (Biblioteca, Envios da equipe e Acervo) e “Público” (Direct das redes, Newsletter e Imprensa). Financeiro, Patrimônio e Transparência ficam em “Gestão”. O que era parte de outra área virou aba dentro dela: o Histórico é uma aba de Resultados; Canais oficiais e Trilha pública, abas de Transparência; as Mensagens dos voluntários, um atalho em Voluntários; e os Advertoriais, uma aba do Marketing da escola. Os links antigos continuam abrindo, e a busca (Ctrl K) acha tudo pelo nome antigo.',
        termos: ['menu novo', 'sumiu', 'mudou de lugar', 'barra lateral', 'sidebar', 'histórico', 'canais oficiais', 'trilha pública', 'mensagens dos voluntários', 'advertoriais', 'institucional', 'relacionamento', 'análise'],
      },
      {
        id: 'area-nao-aparece',
        pergunta: 'Por que não vejo uma área que um colega vê?',
        resposta: 'O menu e a busca mostram só o que o seu papel permite abrir. Se você precisa de uma área que não aparece, peça a um administrador.',
        termos: ['sumiu', 'permissão', 'acesso', 'papel'],
      },
      {
        id: 'grupos-do-menu',
        pergunta: 'Como fecho um grupo do menu?',
        resposta: 'Toque no nome do grupo (por exemplo, “Redação”) para fechar ou abrir a lista. O grupo da tela em que você está fica sempre aberto, para você não perder onde está. O Palácio Virtual lembra neste navegador os grupos que você fechou.',
        termos: ['esconder', 'sidebar', 'barra lateral'],
      },
      {
        id: 'migalhas',
        pergunta: 'O que é o nome ao lado do ícone, no alto da tela?',
        resposta: 'É onde você está: a área (e, em telas largas, o grupo antes dela). Numa tela de dentro da área, o nome vira um link que volta para o começo dela.',
        termos: ['migalhas', 'caminho', 'breadcrumb', 'voltar'],
      },
      {
        id: 'numero-do-sino',
        pergunta: 'O que é o número no sino?',
        resposta: 'É quanto você ainda não leu. Uma notificação conta como lida quando você toca nela, quando abre a página de que ela fala ou quando usa “Marcar todas como lidas”. Todas ficam em “Ver todas”.',
        termos: ['notificações', 'avisos', 'não lidas', 'alertas'],
      },
      { id: 'sem-email-de-aviso', ...EMAIL_DE_AVISO_NAO_CHEGOU },
      {
        id: 'nomes-antigos',
        pergunta: 'Os nomes das áreas mudaram. Os links antigos ainda funcionam?',
        resposta: 'Sim. Os endereços continuam os mesmos, e a busca aceita os nomes antigos, como “Cérebro”, “Impacto”, “Registro” e “Correio”.',
        termos: ['link antigo', 'favorito', 'nome antigo'],
      },
    ],
  },
  {
    id: 'pedir-ajuda',
    titulo: 'Ajuda e suporte',
    resumo: 'O painel “?”, os tours, a Central de ajuda e o que fazer quando a dúvida continua.',
    tarefas: [
      {
        id: 'ajuda-da-tela',
        titulo: 'Ver a ajuda da tela em que você está',
        passos: [
          'Toque no “?”, no alto à direita (ou aperte a tecla ? fora de um campo de texto).',
          'Veja para que serve a tela, o passo a passo e as perguntas frequentes dela.',
          'Para outra dúvida, use a busca no alto do painel.',
          'Feche com o X ou com Esc.',
        ],
        dica: 'Numa tela que ainda não tem guia próprio, o painel mostra o que vale em todo o Palácio Virtual: conta e acesso, como se achar e como pedir ajuda.',
      },
      {
        id: 'fazer-um-tour',
        titulo: 'Fazer o tour de uma tela',
        passos: [
          'Abra a tela e toque no “?”.',
          'Toque em “Fazer o tour desta tela”.',
          'Avance com “Próximo” (ou a seta →) e volte com “Voltar” (ou ←).',
          'Feche quando quiser com o X ou com Esc; no último balão, “Concluir”.',
        ],
        dica: 'Na primeira visita a uma tela com tour, um cartão no canto da tela oferece o tour. “Agora não” não pergunta de novo naquela tela.',
      },
      {
        id: 'chamado-para-a-ti',
        titulo: 'Pedir ajuda à TI com um chamado',
        passos: [
          'Toque em “Criar” → “Abrir chamado”, ou no link “Ainda com dúvida? Abra um chamado para a TI”, no pé do painel “?” (esse link já escolhe a TI).',
          'Se a equipe ainda não estiver escolhida, escolha “Tecnologia da Informação”.',
          'Em “Qual é o assunto?”, escolha o que mais combina.',
          'Preencha “Resumo” e “Descreva com detalhes”: o que tentou fazer, em que tela, e o que apareceu.',
          'Em “Quanto isso atrapalha?”, marque a opção do seu caso.',
          'Se ajudar, anexe um print da tela em “Anexar foto, print ou arquivo”.',
          'Toque em “Abrir chamado”. As respostas chegam no sino e ficam em “Chamados”.',
        ],
        quem: 'Equipe do Palácio Virtual',
      },
      {
        id: 'recomecar-os-tours',
        titulo: 'Ver de novo as boas-vindas e os tours',
        passos: [
          'Abra a Central de ajuda (menu da sua foto → “Ajuda”).',
          'Em “Comece por aqui”, toque em “Rever as boas-vindas” para ver só as boas-vindas de novo.',
          'Ou toque em “Recomeçar as boas-vindas e os tours”: as boas-vindas abrem na hora e cada tela volta a oferecer o tour dela.',
        ],
      },
    ],
    perguntas: [
      {
        id: 'onde-fica-a-central',
        pergunta: 'Onde encontro todas as respostas juntas?',
        resposta: 'Na Central de ajuda: no menu da sua foto, em “Ajuda”, no link “Central de ajuda” do pé do painel “?” ou pela busca (⌘K). Ela junta o passo a passo e as perguntas de todas as áreas que você pode abrir, com uma busca própria.',
        termos: ['faq', 'manual', 'tutorial', 'central de ajuda'],
      },
      {
        id: 'desligar-a-tecla',
        pergunta: 'A ajuda abre quando aperto “?” sem querer. Dá para desligar?',
        resposta: 'Dá. Na Central de ajuda, em “Atalhos de teclado”, desmarque “Abrir a ajuda com a tecla ?”. O botão “?” no alto continua funcionando, e a escolha vale para a sua conta.',
        termos: ['atalho', 'tecla', 'teclado', 'ditado', 'interrogação'],
      },
      {
        id: 'rever-um-tour',
        pergunta: 'Fechei o tour sem querer. Dá para ver de novo?',
        resposta: 'Dá. Toque no “?” e em “Fazer o tour desta tela”, ou use “Fazer o tour” na página da área, na Central de ajuda.',
        termos: ['tour', 'rever', 'repetir'],
      },
      {
        id: 'clicar-durante-o-tour',
        pergunta: 'Por que não consigo clicar na tela durante o tour?',
        resposta: 'Enquanto o tour está aberto, a tela fica só para olhar: um clique fora do lugar mudaria de página no meio da explicação. Feche o tour com o X ou com Esc, e tudo volta a funcionar.',
        termos: ['tour travado', 'não clica', 'tela escura', 'sair do tour'],
      },
      {
        id: 'duvida-continua',
        pergunta: 'A ajuda não respondeu a minha dúvida. E agora?',
        resposta: 'Se é sobre o trabalho, pergunte à equipe no Chat. Se algo não funciona, abra um chamado para a TI contando o que tentou fazer, em que tela e o que apareceu.\n\nA equipe da escola não abre chamados: para ela, o caminho é o Chat.',
        termos: ['suporte', 'problema', 'erro', 'bug', 'ti'],
      },
    ],
  },
]
