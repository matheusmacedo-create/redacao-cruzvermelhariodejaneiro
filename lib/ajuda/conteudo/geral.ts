import type { PassoDoTour, TopicoGeral } from '../tipos'

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
const MENU_NO_COMPUTADOR: PassoDoTour = {
  alvo: 'shell.menu',
  titulo: 'As áreas, por tipo de trabalho',
  texto: 'O menu junta as áreas em grupos, como “Planejamento”, “Produção” e “Institucional”. O nome de um grupo abre e fecha a lista, e você só vê o que o seu papel permite.',
  lado: 'right',
  seAusente: 'pular',
}

const MENU_NO_CELULAR: PassoDoTour = {
  alvo: 'shell.abrir-menu',
  titulo: 'As áreas ficam no menu',
  texto: 'O botão de menu, no alto à esquerda, abre as áreas, agrupadas por tipo de trabalho. Você só vê o que o seu papel permite.',
  seAusente: 'pular',
}

const BUSCA: PassoDoTour = {
  alvo: 'shell.busca',
  titulo: 'Busca rápida',
  texto: 'Digite o nome de uma área, de uma ação ou uma dúvida. De qualquer tela, ⌘K (no Mac) ou Ctrl K abre a busca. Os nomes antigos das áreas também valem.',
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
  texto: 'O “?” mostra o passo a passo e as perguntas frequentes da tela aberta e, quando ela tem tour, o botão para fazê-lo. A tecla ? também abre. Tudo junto fica na Central de ajuda.',
  lado: 'bottom',
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
 * Primeiro acesso da equipe da Redação: 7 balões no computador, 6 no celular
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
  SINO,
  AJUDA,
  CONTA,
]

/**
 * Primeiro acesso da equipe da escola (5 balões): ela não tem "Criar" nem
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
    texto: 'Digite o nome de uma área ou a sua dúvida. De qualquer tela, ⌘K (no Mac) ou Ctrl K abre a busca.',
  },
  SINO,
  AJUDA,
  {
    ...CONTA,
    texto: 'No menu da sua foto (ou iniciais) ficam “Meu perfil”, “Ajuda” (a Central de ajuda) e “Sair”. No perfil você troca a senha, confirma o e-mail de recuperação e ativa a verificação em duas etapas.',
  },
]

export const TOPICOS_GERAIS: TopicoGeral[] = [
  {
    id: 'conta-e-acesso',
    titulo: 'Conta e acesso',
    resumo: 'Entrar, trocar e recuperar a senha, o e-mail de recuperação e a verificação em duas etapas.',
    tarefas: [
      {
        id: 'entrar',
        titulo: 'Entrar na Redação',
        passos: [
          'Abra a página inicial da Redação.',
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
      {
        id: 'trocar-a-senha',
        titulo: 'Trocar a sua senha',
        passos: [
          'Toque na sua foto (ou iniciais), no alto à direita, e abra “Meu perfil”.',
          'Na parte “Segurança”, preencha “Senha atual”, “Nova senha” e “Confirmar nova senha”.',
          'Toque em “Trocar senha”.',
        ],
        dica: 'A senha precisa de pelo menos 10 caracteres, com letras e números, sem o seu nome ou usuário. Ao trocar, as outras sessões abertas são encerradas.',
      },
      {
        id: 'confirmar-o-email',
        titulo: 'Cadastrar e confirmar o e-mail de recuperação',
        passos: [
          'Abra “Meu perfil”.',
          'Em “E-mail de recuperação”, digite o endereço no campo. Se já houver um e-mail lá, toque antes em “Trocar e-mail”.',
          'Toque em “Enviar confirmação”.',
          'Abra o e-mail que chegou nesse endereço e toque no link.',
          'Na página que abrir, toque em “Confirmar este e-mail”.',
        ],
        dica: 'O link de confirmação vale por 48 horas. Nada muda até você tocar em “Confirmar este e-mail”: só então o endereço passa a valer. Se o link não chegou ou venceu, peça outro do mesmo jeito.',
      },
      {
        id: 'ativar-a-verificacao',
        titulo: 'Ativar a verificação em duas etapas',
        passos: [
          'Instale no celular um app autenticador, como Google Authenticator, Microsoft Authenticator ou Authy.',
          'Em “Meu perfil”, na parte “Verificação em duas etapas”, toque em “Ativar verificação em duas etapas”.',
          'Em “Nome deste aparelho”, dê um nome que você reconheça (por exemplo, “Celular pessoal”) e toque em “Gerar QR Code”.',
          'No app, adicione uma conta e leia o QR Code (ou digite o código que aparece embaixo dele).',
          'Digite o número de 6 dígitos que o app mostra e toque em “Ativar”.',
        ],
        dica: 'Cadastre também um segundo aparelho com “Adicionar outro aparelho”: se perder o celular, você continua entrando pelo outro.',
      },
      {
        id: 'sair-da-conta',
        titulo: 'Sair da conta',
        passos: [
          'Toque na sua foto (ou iniciais), no alto à direita.',
          'No fim do menu, escolha “Sair”.',
          'Para voltar, entre de novo com o seu usuário (ou o e-mail confirmado) e a senha.',
        ],
        dica: 'Em “Meu perfil” também há o botão “Sair da conta”, no fim da página.',
      },
    ],
    perguntas: [
      {
        id: 'senha-provisoria',
        pergunta: 'Recebi uma senha provisória. E agora?',
        resposta: 'A senha que um administrador definiu só vale para o primeiro acesso. Logo depois de entrar, a Redação pede que você crie uma senha só sua: repita a temporária em “Senha temporária (a que você acabou de usar)” e escolha a nova. Nada funciona antes disso.',
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
      {
        id: 'por-que-confirmar-o-email',
        pergunta: 'Para que serve o e-mail de recuperação?',
        resposta: 'É para ele que vão o link de “Esqueci minha senha”, os avisos de segurança da sua conta e os e-mails de notificação que você escolher. Enquanto ele não estiver confirmado, nada disso tem para onde ir, e uma faixa amarela no alto das telas lembra você.\n\nConfirmado, ele também serve para entrar no lugar do usuário.',
        termos: ['e-mail de contato', 'confirmar e-mail', 'faixa amarela', 'aviso amarelo', 'cadastrar agora'],
      },
      {
        id: 'perdi-o-celular',
        pergunta: 'Perdi ou troquei de celular e não tenho o código. Como entro?',
        resposta: 'Se você cadastrou outro aparelho, escolha-o em “Aparelho”, na tela do código. Se não, toque em “Perdi ou troquei de celular — avisar os administradores”. Um administrador confirma com você e tira a verificação da sua conta; depois, você cadastra o app no celular novo.',
        termos: ['código do app', 'autenticador', 'celular novo', '2fa'],
      },
      {
        id: 'verificacao-obrigatoria',
        pergunta: 'A verificação em duas etapas é obrigatória?',
        resposta: 'Depende do seu papel: um administrador pode torná-la obrigatória para alguns papéis, e aí a Redação pede o cadastro logo depois do login. Para os outros, é opcional — mas quem cadastrou o app passa a digitar o código sempre.',
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
        dica: 'A Redação lembra a sua escolha neste navegador. No celular o menu não recolhe: ele abre e fecha pelo botão de menu.',
      },
      {
        id: 'usar-o-criar',
        titulo: 'Começar algo pelo botão “Criar”',
        passos: [
          'Toque em “Criar”, no alto à direita.',
          'Escolha “Registrar atividade”, “Nova publicação”, “Novo ofício” ou “Abrir chamado”.',
          '“Nova publicação” já cria o pacote e abre a tela dele; “Novo ofício” cria o rascunho do ofício e abre.',
        ],
        quem: 'Equipe da Redação',
      },
      {
        id: 'avisos-por-email',
        titulo: 'Escolher o que chega por e-mail',
        passos: [
          'Abra o sino e toque em “E-mails de aviso” (ou vá a “Meu perfil” → “E-mails de notificação”).',
          'Para cada assunto, escolha “Na hora”, “Resumo diário” ou “Só no sino”.',
          'Não há botão de salvar: ao tocar, a escolha já vale e aparece “Preferência salva.” embaixo da lista.',
        ],
        dica: 'Os e-mails vão para o seu e-mail de recuperação confirmado. Os avisos de segurança da conta (senha, verificação em duas etapas) chegam sempre.',
      },
    ],
    perguntas: [
      {
        id: 'area-nao-aparece',
        pergunta: 'Por que não vejo uma área que um colega vê?',
        resposta: 'O menu e a busca mostram só o que o seu papel permite abrir. Se você precisa de uma área que não aparece, peça a um administrador.',
        termos: ['sumiu', 'permissão', 'acesso', 'papel'],
      },
      {
        id: 'grupos-do-menu',
        pergunta: 'Como fecho um grupo do menu?',
        resposta: 'Toque no nome do grupo (por exemplo, “Planejamento”) para fechar ou abrir a lista. O grupo da tela em que você está fica sempre aberto, para você não perder onde está. A Redação lembra neste navegador os grupos que você fechou.',
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
      {
        id: 'sem-email-de-aviso',
        pergunta: 'Por que não recebi o e-mail de uma notificação?',
        resposta: 'Alguns motivos: o seu e-mail de recuperação não está confirmado; o assunto está em “Só no sino” ou “Resumo diário”; ou você estava com a Redação aberta, e aí o aviso fica para o resumo do dia se você não abrir.\n\nSobre a mesma coisa, sai no máximo um e-mail a cada 15 minutos.',
        termos: ['e-mail de aviso', 'não chegou', 'notificação por e-mail'],
      },
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
        dica: 'Numa tela que ainda não tem guia próprio, o painel mostra o que vale em toda a Redação: conta e acesso, como se achar e como pedir ajuda.',
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
        quem: 'Equipe da Redação',
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
        resposta: 'Se é sobre o trabalho, pergunte à equipe no Chat. Se algo não funciona, abra um chamado para a TI contando o que tentou fazer, em que tela e o que apareceu.\n\nQuem é da equipe da escola usa o Chat.',
        termos: ['suporte', 'problema', 'erro', 'bug', 'ti'],
      },
    ],
  },
]
