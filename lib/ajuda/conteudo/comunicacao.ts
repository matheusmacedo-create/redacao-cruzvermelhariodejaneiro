import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do grupo Comunicação do menu: Chat (/chat), Caixa de entrada
 * (/caixa-de-entrada), E-mail do setor (/correio), Envios da equipe (/envios)
 * e o canal com os voluntários (/voluntariado/mensagens).
 *
 * Cada frase tem apoio no código:
 * - Chat: app/(app)/chat, components/app/chat/**, lib/chat/**, app/actions/chat.ts
 *   e as funções chat_* das migrações 20260926000000 e 20260926010000;
 * - Caixa de entrada: app/(app)/caixa-de-entrada, components/app/atendimento/caixa.tsx,
 *   lib/atendimento/** e app/actions/atendimento.ts (mais archiveInboxItem e
 *   convertInboxToPauta em app/actions/editorial.ts);
 * - E-mail do setor: app/(app)/correio, components/app/correio/correio.tsx,
 *   lib/correio/** e app/actions/correio.ts;
 * - Envios da equipe: app/(app)/envios/**, components/app/envios/**,
 *   app/actions/envios.ts, lib/envios/** e o lado de quem manda (app/enviar,
 *   components/enviar/**, app/api/enviar/**); o aviso de publicação sai de
 *   lib/site/publicar-materia.ts;
 * - Voluntários: app/(app)/voluntariado/mensagens, components/app/canal/acoes.tsx,
 *   lib/canal/regras.ts, app/actions/canal.ts e o aviso ao time em app/actions/membro.ts.
 *
 * /chat só redireciona para uma conversa (/chat/[id]); por isso o tour do
 * Chat mora na tela da conversa, e não na raiz da área. Os alvos `chat.*`,
 * `caixa.*`, `correio.*`, `envios.*` e `canal-voluntarios.*` são marcados com
 * `data-ajuda` nessas telas. Mudou a tela ou a regra, muda aqui no mesmo PR
 * (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Chat

const CHAT: GuiaDaArea = {
  href: '/chat',
  paraQueServe: 'O Chat é a conversa da equipe: canais por assunto ou por setor e mensagens diretas, ao vivo e guardados. Dá para responder em fio, reagir, mandar arquivo e mensagem de voz e buscar tudo o que você pode ver.',
  quemUsa: 'Toda a equipe da Redação e a equipe da escola. Cada pessoa edita e apaga as próprias mensagens; só administradores apagam as dos outros, arquivam canais e veem o que foi editado ou apagado. A equipe da escola vê só os canais para que foi chamada e as mensagens diretas dela.',
  // /chat abre direto a última conversa com novidade: o tour fica na tela da conversa.
  tour: [],
  telas: [
    {
      caminho: '/chat/[id]',
      rotulo: 'Conversa',
      tour: [
        {
          titulo: 'O Chat da equipe',
          texto: 'Canais reúnem um assunto ou um setor; mensagens diretas são conversas com até 9 pessoas, contando você. Tudo chega na hora e fica guardado.',
        },
        {
          alvo: 'chat.conversas',
          titulo: 'Canais e mensagens diretas',
          texto: 'A lista mostra os seus canais, as mensagens diretas e os “Outros canais abertos”. Negrito e número marcam o que é novo. No celular, a seta no alto da conversa abre a lista.',
          lado: 'right',
        },
        {
          alvo: 'chat.criar',
          titulo: 'Buscar e começar conversas',
          texto: 'A lupa busca em todo o chat. O “#” cria um canal (só a equipe da Redação) e o “+” abre uma conversa direta. Na lista, “Menções a mim” junta o que chamou você.',
          lado: 'bottom',
        },
        {
          alvo: 'chat.mensagens',
          titulo: 'As mensagens',
          texto: 'Pare o mouse sobre uma mensagem (no celular, toque nela) para reagir, responder em fio e, nas suas, editar ou apagar. Quando há respostas, o resumo embaixo da mensagem abre o fio.',
          lado: 'left',
        },
        {
          alvo: 'chat.escrever',
          titulo: 'Escrever',
          texto: 'Enter envia e Shift+Enter quebra a linha. Digite @ para chamar alguém. O clipe anexa arquivos e o microfone grava uma mensagem de voz.',
          lado: 'top',
        },
        {
          alvo: 'chat.pessoas',
          titulo: 'Quem está na conversa',
          texto: 'O número no alto mostra quantas pessoas estão aqui e abre a lista delas. Num canal, a lista pode trazer também “Chamar pessoas” e “Sair do canal”.',
          lado: 'bottom',
        },
        {
          alvo: 'chat.avisos',
          titulo: 'Quando esta conversa avisa você',
          texto: 'O sino escolhe o aviso só desta conversa: “Avisar toda mensagem”, “Só quando me mencionarem” (nos canais) ou “Silenciar”.',
          lado: 'bottom',
          seAusente: 'pular',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'mandar-mensagem-direta',
      titulo: 'Mandar mensagem direta para alguém',
      passos: [
        'Na lista do Chat, toque em “+” (“Nova conversa”).',
        'Em “Buscar pessoa”, digite o nome e marque uma ou mais pessoas.',
        'Toque em “Abrir conversa”.',
        'Escreva na caixa de baixo e tecle Enter.',
      ],
      dica: 'Se já existe uma conversa com exatamente as mesmas pessoas, o Chat abre essa mesma, com o histórico. A conversa direta vai até 9 pessoas, contando você; para mais gente, crie um canal.',
    },
    {
      id: 'criar-canal',
      titulo: 'Criar um canal',
      quem: 'Equipe da Redação',
      passos: [
        'Na lista do Chat, toque em “#” (“Novo canal”).',
        'Escreva o nome (por exemplo, campanha-natal) e, se quiser, “Para que serve”.',
        'Marque “Privado” se só quem for chamado pode ver. Sem marcar, o canal é aberto: qualquer pessoa da Redação lê e entra.',
        'Em “Chamar pessoas”, marque quem já entra no canal.',
        'Toque em “Criar canal”.',
      ],
      dica: 'O nome vira minúsculas, sem acento e com hífen no lugar do espaço, e não pode repetir o de outro canal.',
    },
    {
      id: 'mencionar-alguem',
      titulo: 'Chamar alguém com @',
      passos: [
        'Na caixa de escrever, digite @ e o começo do nome.',
        'Escolha a pessoa na lista (com as setas e Enter, ou com um clique).',
        'Num canal, @canal chama todo mundo dele.',
        'Envie. Quem foi mencionado recebe aviso no sino e, conforme as preferências de cada pessoa, por e-mail.',
      ],
      dica: 'Num canal, só é avisado quem está nele. Se você mencionar alguém de fora, o Chat avisa e oferece “Chamar para o canal”.',
    },
    {
      id: 'responder-em-fio',
      titulo: 'Responder em fio',
      passos: [
        'Pare o mouse sobre a mensagem (no celular, toque nela).',
        'Toque em “Responder em fio” (a seta curva).',
        'No fio que se abre, escreva em “Responder no fio…” e tecle Enter.',
        'Para fechar o fio, toque no X (“Fechar o fio”).',
      ],
      dica: 'Recebem aviso quem escreveu a mensagem, quem já respondeu no fio e quem foi mencionado. Numa conversa direta, todo mundo dela.',
    },
    {
      id: 'enviar-arquivo-ou-voz',
      titulo: 'Enviar arquivo ou mensagem de voz',
      passos: [
        'Toque no clipe (“Anexar arquivos”), arraste o arquivo para a conversa ou cole o arquivo na caixa de escrever.',
        'Confira os arquivos acima da caixa; o X tira um deles.',
        'Para voz, toque no microfone (“Gravar mensagem de voz”), fale e toque em “Parar”. “Descartar” joga fora a gravação.',
        'Escreva um texto, se quiser, e toque na seta de enviar (ou tecle Enter).',
      ],
      dica: 'Até 10 arquivos por mensagem, com até 50 MB cada. A gravação para sozinha aos 10 minutos. Na primeira vez, o navegador pede para usar o microfone.',
    },
    {
      id: 'editar-ou-apagar',
      titulo: 'Editar ou apagar uma mensagem',
      passos: [
        'Pare o mouse sobre a sua mensagem (no celular, toque nela).',
        'Para editar, toque no lápis (“Editar mensagem”), mude o texto e toque em “Salvar”.',
        'Para apagar, toque na lixeira (“Apagar mensagem”) e confirme.',
      ],
      dica: 'Só quem escreveu edita. Apagar tira a mensagem da conversa, mas o original fica guardado para a administração.',
    },
    {
      id: 'buscar-no-chat',
      titulo: 'Achar uma mensagem antiga',
      passos: [
        'Toque na lupa (“Buscar no chat”), no alto da lista.',
        'Escreva palavras ou o nome de um arquivo e tecle Enter.',
        'Se quiser, troque “Em todo o chat” por “Só em” e o nome desta conversa, escolha uma pessoa em “De qualquer pessoa” ou marque “Menções a mim” e “Com arquivos”.',
        'Toque no resultado para ir até a mensagem.',
      ],
      dica: 'Vale começo de palavra e sem acento: “reun” acha “Reunião”. Para só voltar no tempo dentro da conversa, suba até o topo e toque em “Carregar mensagens anteriores”; “Arquivos desta conversa”, na lista, mostra o que foi anexado nela.',
    },
    {
      id: 'reagir',
      titulo: 'Reagir a uma mensagem',
      passos: [
        'Pare o mouse sobre a mensagem (no celular, toque nela).',
        'Toque num dos emojis que aparecem ou na carinha (“Mais reações”) para ver todos.',
        'A reação aparece embaixo da mensagem com o número de pessoas. Tocar nela de novo tira a sua.',
      ],
      dica: 'Parar o mouse sobre uma reação mostra quem reagiu. Num canal aberto em que você ainda não está, reagir faz você entrar nele. Em canal arquivado não dá para reagir.',
    },
    {
      id: 'escolher-avisos',
      titulo: 'Escolher quando uma conversa avisa você',
      passos: [
        'Abra a conversa.',
        'No alto, à direita, abra a lista ao lado do sino.',
        'Escolha “Avisar toda mensagem”, “Só quando me mencionarem” (só nos canais) ou “Silenciar”.',
      ],
      dica: 'Vale só para aquela conversa. Se o aviso vai também por e-mail (“Na hora”, “Resumo diário” ou “Só no sino”), você escolhe em Meu perfil, no assunto Chat.',
    },
    {
      id: 'entrar-ou-sair-de-canal',
      titulo: 'Entrar num canal aberto ou sair de um canal',
      passos: [
        'Os canais abertos em que você ainda não está ficam em “Outros canais abertos”, no fim da lista.',
        'Abra o canal e toque em “Entrar no canal”. Escrever ou reagir nele também faz você entrar.',
        'Para sair, toque no número de pessoas, no alto, e em “Sair do canal”.',
      ],
      dica: 'Do #geral e do canal do seu setor não dá para sair, mas dá para silenciar.',
    },
    {
      id: 'chamar-pessoas',
      titulo: 'Chamar pessoas para um canal',
      quem: 'Equipe da Redação',
      passos: [
        'Abra o canal.',
        'Toque no número de pessoas, no alto.',
        'Toque em “Chamar pessoas”, marque quem entra e toque em “Chamar”.',
      ],
      dica: 'Quem foi chamado recebe um aviso. A equipe da escola também pode ser chamada para um canal.',
    },
  ],
  perguntas: [
    {
      id: 'canal-ou-mensagem-direta',
      pergunta: 'Qual a diferença entre canal e mensagem direta?',
      resposta: 'Canal é uma conversa de grupo com nome, como #geral, para um assunto ou um setor. Mensagem direta é uma conversa sem nome entre você e até 8 pessoas. Para mais gente, crie um canal.',
      termos: ['grupo', 'conversa em grupo', 'dm', 'privado', 'particular'],
    },
    {
      id: 'quem-ve-o-canal',
      pergunta: 'Quem vê um canal aberto? E um privado?',
      resposta: 'Canal aberto: qualquer pessoa da equipe da Redação lê e entra quando quiser. Canal privado (com cadeado) e mensagem direta: só quem está neles.\n\nA equipe da escola vê só os canais para que foi chamada e as mensagens diretas dela.',
      termos: ['cadeado', 'privacidade', 'aberto', 'fechado', 'quem lê'],
    },
    {
      id: 'geral-e-setores',
      pergunta: 'O que são o #geral e os canais dos setores?',
      resposta: 'O #geral reúne toda a equipe da Redação. Cada setor tem um canal privado com quem é do setor: quem entra no setor passa a fazer parte do canal. Não dá para sair do #geral nem do canal do seu setor, mas dá para silenciar.',
      termos: ['setor', 'coordenação', 'canal automático', 'sair do geral'],
    },
    {
      id: 'numero-do-menu',
      pergunta: 'O que conta o número ao lado de “Chat” no menu?',
      resposta: 'As mensagens diretas não lidas, as menções a você (inclusive @canal) e as mensagens novas dos canais em que você escolheu “Avisar toda mensagem”. Conversa silenciada não conta.\n\nRespostas em fio ficam de fora da conta, a não ser a que menciona você num canal em “Só quando me mencionarem”.',
      termos: ['contador', 'não lidas', 'bolinha', 'notificação'],
    },
    {
      id: 'quem-recebe-aviso',
      pergunta: 'Quem é avisado quando eu escrevo?',
      resposta: 'Numa mensagem direta, todo mundo dela. Num canal, quem foi mencionado (todo o canal, com @canal) e quem escolheu “Avisar toda mensagem”; numa resposta em fio, quem escreveu a mensagem, quem já respondeu e quem foi mencionado.\n\nQuem silenciou a conversa não recebe. O aviso vai para o sino e, conforme as preferências de cada pessoa, por e-mail.',
      termos: ['notificação', 'sino', 'e-mail', 'avisar'],
    },
    {
      id: 'mencao-sem-aviso',
      pergunta: 'Mencionei alguém e a pessoa não foi avisada. Por quê?',
      resposta: 'Num canal, só é avisado quem está nele. Quando você menciona alguém de fora, aparece um recado dizendo que a pessoa não está no canal, com “Chamar para o canal” e “Deixar”. Quem silenciou a conversa também não recebe aviso.',
      termos: ['@', 'menção', 'marcar', 'não está no canal'],
    },
    {
      id: 'apagar-e-de-verdade',
      pergunta: 'Apagar uma mensagem apaga de verdade?',
      resposta: 'Ela some da conversa (fica escrito “mensagem apagada”), junto com os arquivos e as reações. O original continua guardado, e só administradores podem ver.\n\nNa edição é igual: aparece “(editada)” e a versão anterior fica guardada para a administração.',
      termos: ['excluir', 'histórico', 'editada', 'registro'],
    },
    {
      id: 'canal-arquivado',
      pergunta: 'O que é um canal arquivado?',
      resposta: 'É um canal encerrado: dá para ler tudo, mas não para escrever nem reagir. Na tela, só administradores arquivam e desarquivam, pelo número de pessoas no alto do canal (“Arquivar canal” e “Desarquivar”). O #geral não se arquiva.',
      termos: ['arquivar', 'desarquivar', 'encerrar canal', 'somente leitura'],
    },
    {
      id: 'alertas-no-computador',
      pergunta: 'Como recebo alerta no computador quando estou em outra aba?',
      resposta: 'Na lista do Chat, toque em “Ativar alertas no computador para mensagens novas” e permita no navegador. O alerta vale para o que é seu: mensagens diretas, menções e canais em “Avisar toda mensagem”.\n\nSe o botão não aparece, o navegador já guardou uma resposta; para mudar, use as permissões do site no próprio navegador. Com a Redação aberta em outra tela, o aviso aparece no canto de baixo, à direita.',
      termos: ['notificação do navegador', 'alerta', 'segundo plano', 'popup'],
    },
    {
      id: 'tamanho-de-arquivo',
      pergunta: 'Qual o tamanho máximo de um arquivo?',
      resposta: 'Até 50 MB por arquivo e até 10 arquivos por mensagem. A mensagem de voz grava até 10 minutos.\n\nFotos, áudios e os vídeos mais comuns aparecem na própria conversa. PDF vira um cartão que abre no navegador; os outros arquivos são baixados.',
      termos: ['anexo', 'limite', 'MB', 'vídeo', 'foto', 'áudio'],
    },
    {
      id: 'rascunho-guardado',
      pergunta: 'Comecei a escrever e mudei de tela. Perdi o texto?',
      resposta: 'Não. O texto fica guardado neste navegador, por conversa (e por fio), até você enviar. Os arquivos escolhidos e ainda não enviados não ficam guardados.',
      termos: ['rascunho', 'perdi', 'sumiu o texto'],
    },
    {
      id: 'quando-conta-como-lida',
      pergunta: 'Quando uma conversa conta como lida?',
      resposta: 'Quando você abre a conversa. Com ela aberta, as mensagens que chegam também contam como lidas. Nas outras conversas, o número e o negrito continuam até você abrir.',
      termos: ['lida', 'não lida', 'marcar como lida'],
    },
    {
      id: 'equipe-da-escola-no-chat',
      pergunta: 'A equipe da escola usa o Chat?',
      resposta: 'Usa. Ela vê só os canais para que foi chamada e as mensagens diretas dela. Não cria canais nem chama pessoas: quem é da Redação chama a equipe da escola para um canal.',
      termos: ['escola', 'professores', 'instrutores'],
    },
  ],
  relacionadas: ['/notificacoes', '/perfil'],
}

// ---------------------------------------------------------------- Caixa de entrada

const CAIXA_DE_ENTRADA: GuiaDaArea = {
  href: '/caixa-de-entrada',
  paraQueServe: 'A Caixa de entrada é o atendimento ao público nas redes: as mensagens do Direct do Instagram e os comentários nas publicações recentes, para ler e responder sem abrir cada aplicativo. A pasta “E-mail e materiais” guarda o que chegou por dentro, e um material pode virar pauta.',
  quemUsa: 'Toda a equipe da Redação. As respostas saem pela conta da filial em cada rede, não no seu nome. O que você abre fica marcado como lido só no seu aparelho.',
  tour: [
    {
      titulo: 'A Caixa de entrada',
      texto: 'Aqui chega o que o público escreve nas redes, em pastas. A Caixa consulta as redes quando abre; com a tela parada, nada novo aparece sozinho.',
    },
    {
      alvo: 'caixa.pastas',
      titulo: 'As três pastas',
      texto: '“Mensagens” traz o Direct do Instagram; “Comentários”, os das publicações recentes; “E-mail e materiais”, o que chegou por dentro. O número conta o que ainda pede atenção.',
      lado: 'right',
    },
    {
      alvo: 'caixa.conteudo',
      titulo: 'Ler e responder',
      texto: 'A mensagem direta abre a conversa inteira, em balões. O comentário aparece embaixo da publicação dele, com “Responder” e “Esconder”.',
      lado: 'left',
    },
    {
      alvo: 'caixa.atualizar',
      titulo: 'Atualizar',
      texto: '“Atualizar” consulta as redes de novo. Use quando voltar à tela depois de um tempo ou quando uma rede não tiver respondido.',
      lado: 'right',
    },
    {
      alvo: 'caixa.avisos',
      titulo: 'O que fica de fora',
      texto: 'No pé da Caixa, recolhido, fica o aviso das redes que não responderam e das que este painel não lê. Abra o aviso para saber o que olhar pelo aplicativo da rede.',
      lado: 'top',
      seAusente: 'pular',
    },
    {
      alvo: 'caixa.registrar',
      titulo: 'Registrar atividade',
      texto: '“Registrar atividade” abre o formulário para levar à Comunicação uma ação, um evento, uma história, uma ideia ou um material. O registro entra no quadro de pautas, em “Entrada”.',
      lado: 'bottom',
    },
  ],
  tarefas: [
    {
      id: 'responder-direct',
      titulo: 'Responder uma mensagem do Direct',
      passos: [
        'Abra “Caixa de entrada” e fique na pasta “Mensagens”.',
        'Toque na conversa. Ela abre inteira, em balões, e deixa de contar como não lida neste aparelho.',
        'Escreva no campo “Mensagem…” e toque no botão de enviar (“Enviar mensagem”).',
        'A sua resposta aparece à direita, como no Instagram. A seta no alto (“Voltar para as conversas”) volta para a lista.',
      ],
      dica: 'O Instagram só aceita resposta até 24 horas depois da última mensagem da pessoa. Passou disso, o campo some e a tela explica o motivo.',
    },
    {
      id: 'responder-comentario',
      titulo: 'Responder um comentário',
      passos: [
        'Abra a pasta “Comentários”.',
        'Ache o comentário embaixo da publicação dele. Com mais de uma rede, os botões do alto (“Todas as redes”, “Instagram”…) filtram a lista.',
        'Toque em “Responder”, escreva e toque no botão de enviar (“Publicar resposta”).',
        'A resposta aparece embaixo do comentário, marcada como “publicada”.',
      ],
      dica: 'Resposta a comentário é pública: todo mundo que vê a publicação lê. “ver publicação” abre o post na rede.',
    },
    {
      id: 'esconder-comentario',
      titulo: 'Esconder um comentário ofensivo ou falso',
      passos: [
        'Na pasta “Comentários”, ache o comentário.',
        'Toque em “Esconder”. Ele fica mais claro na tela e ganha o selo “Escondido do público”.',
        'Mudou de ideia? Toque em “Mostrar”, no mesmo lugar.',
      ],
      dica: 'Esconder não apaga: o comentário some para o público e pode voltar. Depois que a tela é recarregada, a Caixa não mostra mais que ele está escondido; para mostrar de novo mais tarde, use o aplicativo da rede.',
    },
    {
      id: 'transformar-material-em-pauta',
      titulo: 'Transformar um material em pauta',
      passos: [
        'Abra a pasta “E-mail e materiais” e toque no item.',
        'Leia o conteúdo e confira a coordenação.',
        'Toque em “Transformar em pauta”.',
        'A pauta nasce em “Entrada”, com você como responsável, e abre na hora.',
      ],
      dica: 'O título e o texto do material viram o título e a descrição da pauta. O material continua na pasta, sem o destaque de novo; para tirá-lo de lá, use “Arquivar”.',
    },
    {
      id: 'ver-o-que-chegou',
      titulo: 'Ver o que chegou agora',
      passos: [
        'Toque em “Atualizar”, embaixo das pastas. No celular, é o ícone de setas em círculo, no fim da faixa das pastas.',
        'Espere a consulta às redes terminar.',
        'Se uma rede não respondeu, abra o aviso no pé da Caixa para ver qual e tente de novo daqui a pouco.',
      ],
    },
    {
      id: 'redes-fora-do-painel',
      titulo: 'Descobrir que redes não passam por aqui',
      passos: [
        'No pé da Caixa, abra a linha “O que não é atendido por este painel” (ou a que diz quantas redes não responderam).',
        'Leia o motivo de cada rede.',
        'Atenda essas redes pelo aplicativo delas.',
      ],
      dica: 'A linha só aparece quando há rede ligada que este painel não lê, ou rede que não respondeu.',
    },
  ],
  perguntas: [
    {
      id: 'que-redes-aparecem',
      pergunta: 'Que redes aparecem na Caixa de entrada?',
      resposta: 'Os comentários do Instagram, do Facebook, do YouTube e do LinkedIn e as mensagens diretas do Instagram. O Messenger, o TikTok, o X e as outras redes ligadas não passam por aqui: o pé da Caixa lista o que fica de fora e por quê.',
      termos: ['messenger', 'tiktok', 'facebook', 'instagram', 'youtube', 'linkedin'],
    },
    {
      id: 'comentario-nao-aparece',
      pergunta: 'Por que um comentário não aparece?',
      resposta: 'A Caixa lê os comentários das publicações mais recentes (até 8) que saíram pelo Upload-Post, o serviço que “Publicações” usa para publicar nas redes, e até 25 comentários de cada uma. Post feito direto no aplicativo da rede não entra, e publicação mais antiga sai da lista.\n\nVale também tocar em “Atualizar” e olhar o aviso no pé da Caixa, que diz se alguma rede não respondeu.',
      termos: ['sumiu', 'faltando', 'post antigo', 'celular'],
    },
    {
      id: 'janela-de-24-horas',
      pergunta: 'Por que não consigo responder uma mensagem do Direct?',
      resposta: 'O Instagram só aceita resposta até 24 horas depois da última mensagem da pessoa. Fora dessa janela, o campo de resposta some e a tela explica o motivo; responda pelo aplicativo do Instagram, se ainda for possível.\n\nMais raramente, a Caixa não consegue saber para quem responder ou quando foi a última mensagem. O aviso no lugar do campo diz qual é o caso.',
      termos: ['24 horas', 'prazo', 'janela', 'direct', 'dm'],
    },
    {
      id: 'chega-sozinho',
      pergunta: 'As mensagens chegam sozinhas?',
      resposta: 'Não. A Caixa consulta as redes quando abre e quando você toca em “Atualizar”. Com a tela parada, nada novo aparece.',
      termos: ['tempo real', 'atualizar', 'recarregar'],
    },
    {
      id: 'lida-so-no-aparelho',
      pergunta: 'Abri uma conversa, mas no outro computador ela continua como não lida. Por quê?',
      resposta: 'O “lida” da Caixa fica guardado no navegador de cada aparelho, e não na conta. Abrir a conversa marca como lida só ali: no seu celular e nos computadores dos colegas, ela continua como estava.',
      termos: ['não lida', 'ponto', 'negrito', 'lida'],
    },
    {
      id: 'numero-das-pastas',
      pergunta: 'O que conta o número ao lado de cada pasta?',
      resposta: 'Em “Mensagens”, as conversas que esperam resposta e que você ainda não abriu neste aparelho. Em “E-mail e materiais”, os itens novos que você ainda não abriu neste aparelho.\n\nEm “Comentários”, todos os comentários carregados, menos os que você respondeu desde que abriu a tela. Ao recarregar, a conta recomeça.',
      termos: ['contador', 'bolinha', 'pendentes'],
    },
    {
      id: 'confira-quem-escreveu',
      pergunta: 'O que quer dizer “confira quem escreveu”?',
      resposta: 'A Caixa não conseguiu confirmar qual é a conta da filial nas conversas. Aí as respostas da filial podem aparecer como se fossem do público, e a conversa pode contar como esperando resposta. Leia a conversa com atenção antes de responder.',
      termos: ['identidade', 'aviso amarelo'],
    },
    {
      id: 'formato-nao-reconhecido',
      pergunta: 'E “formato não reconhecido”?',
      resposta: 'A rede devolveu um comentário sem texto e sem autor que a Caixa consiga ler. Para ver o que foi escrito, abra a publicação na rede em “ver publicação”.',
      termos: ['comentário estranho', 'sem texto'],
    },
    {
      id: 'esconder-e-nao-apagar',
      pergunta: 'Por que dá para esconder e não para apagar um comentário?',
      resposta: 'Porque esconder dá para desfazer e apagar não. Uma instituição humanitária recebe ataque e desinformação junto com as perguntas, e sumir com a fala de alguém precisa ter volta. O comentário escondido some para o público, mas continua na rede.',
      termos: ['apagar', 'excluir', 'ofensa', 'moderação', 'fake news'],
    },
    {
      id: 'arquivar-material',
      pergunta: 'Como tiro um material da pasta “E-mail e materiais”?',
      resposta: 'Abra o item e toque em “Arquivar”: ele sai da Caixa de entrada. Esta tela não traz de volta um material arquivado, então arquive só o que já foi resolvido.',
      termos: ['arquivar', 'limpar', 'remover material', 'tirar da caixa'],
    },
    {
      id: 'rascunhos-e-aprovacoes',
      pergunta: 'O que são “Meus rascunhos” e “Aguardando aprovação”, embaixo das pastas?',
      resposta: 'Lembretes com número: “Meus rascunhos” conta os conteúdos em rascunho em que você é responsável, e “Aguardando aprovação”, os pedidos que esperam o seu voto (este leva a Aprovações). Só aparecem quando há algum, e não aparecem no celular.',
      termos: ['atalho', 'rascunho', 'aprovação'],
    },
    {
      id: 'em-nome-de-quem',
      pergunta: 'A resposta sai no meu nome?',
      resposta: 'Não. A resposta sai pela conta da filial na rede, e não pelo seu perfil. Qualquer pessoa da equipe da Redação pode responder por aqui.',
      termos: ['perfil', 'assinatura', 'quem respondeu'],
    },
  ],
  relacionadas: ['/redes', '/pautas', '/aprovacoes'],
}

// ---------------------------------------------------------------- E-mail do setor

const EMAIL_DO_SETOR: GuiaDaArea = {
  href: '/correio',
  paraQueServe: 'O E-mail do setor envia e-mails pelo endereço oficial do seu setor, com a assinatura fixa dele, sem sair da Redação. Tudo o que sai, e o que falha, fica registrado para o setor.',
  quemUsa: 'Quem faz parte de um setor com endereço ativo envia por ele e vê o que o setor enviou. Administradores enviam por qualquer endereço ativo, veem todos os envios e ligam endereços e setores em Configurações.',
  tour: [
    {
      titulo: 'O e-mail oficial do setor',
      texto: 'Aqui você escreve e envia pelo endereço do seu setor, com a assinatura oficial dele. Tudo o que sai fica registrado, inclusive o que falhou.',
    },
    {
      alvo: 'correio.aviso',
      titulo: 'Por que não dá para enviar',
      texto: 'Quando o envio não está liberado, este quadro diz o motivo: a conta Google da filial desligada ou vencida, ou você fora de um setor com endereço ativo.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'correio.de',
      titulo: 'De',
      texto: 'O endereço do seu setor. Quando há mais de um endereço para você, escolha na lista; administradores podem escolher qualquer endereço ativo.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'correio.para',
      titulo: 'Para e Cc',
      texto: 'Separe os endereços por vírgula. O botão “Cc” abre o campo de cópia. São até 50 destinatários por mensagem, somando os dois.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'correio.assinatura',
      titulo: 'A assinatura do setor',
      texto: 'Vem do Gmail do setor e entra sozinha no fim de todo e-mail. Ela não se muda aqui.',
      lado: 'top',
      seAusente: 'pular',
    },
    {
      alvo: 'correio.enviar',
      titulo: 'Enviar',
      texto: '“Enviar” acende quando “Para”, “Assunto” e a mensagem estão preenchidos. O e-mail sai na hora e não dá para cancelar depois.',
      lado: 'left',
      seAusente: 'pular',
    },
    {
      alvo: 'correio.enviados',
      titulo: 'Enviados',
      texto: 'O que saiu pelos seus setores, com o selo “Enviado” ou “Falhou”. Toque numa linha para ler o texto e, se falhou, o motivo.',
      lado: 'top',
    },
  ],
  tarefas: [
    {
      id: 'enviar-email-do-setor',
      titulo: 'Enviar um e-mail pelo endereço do setor',
      passos: [
        'Abra “E-mail do setor”.',
        'Em “De”, confira o endereço. Se houver mais de um endereço para você, escolha na lista.',
        'Em “Para”, escreva os endereços separados por vírgula. Para mandar cópia, toque em “Cc”.',
        'Preencha “Assunto” e escreva a mensagem.',
        'Confira a assinatura do setor, que entra sozinha no fim.',
        'Toque em “Enviar”. O recado verde confirma de que endereço saiu e para quantos destinatários.',
      ],
      dica: 'São até 50 destinatários por mensagem, somando “Para” e “Cc”. Para listas maiores, use as campanhas de Imprensa e contatos.',
    },
    {
      id: 'achar-email-enviado',
      titulo: 'Achar um e-mail que o setor enviou',
      passos: [
        'Desça até “Enviados”.',
        'Use “Buscar”: vale o assunto, um endereço ou o nome de quem enviou.',
        'Toque na linha para ler o texto.',
      ],
      dica: 'A lista mostra os 200 envios mais recentes que você pode ver.',
    },
    {
      id: 'entender-falha',
      titulo: 'Entender por que um e-mail falhou',
      passos: [
        'Em “Enviados”, procure o selo vermelho “Falhou”.',
        'Toque na linha: o motivo aparece em vermelho, acima do texto.',
        'Corrija o que for preciso e envie de novo pelo formulário de cima.',
      ],
      dica: 'Erro de preenchimento, como endereço inválido ou mais de 50 destinatários, aparece na hora, acima do “Enviar”, e não entra em “Enviados”.',
    },
    {
      id: 'liberar-endereco',
      titulo: 'Liberar o endereço de um setor para a equipe',
      quem: 'Só administradores',
      passos: [
        'Abra “Configurações” e desça até “E-mail do setor” (o quadro desta tela tem o link quando falta algo).',
        'Em “2. Setores e quem é de cada um”, se o setor ainda não existe, escreva o nome e toque em “Criar setor”.',
        'No setor, toque em “Membros”, marque as pessoas e toque em “Salvar membros”.',
        'Em “3. Endereços (aliases do Gmail)”, escolha o setor de cada endereço na lista ao lado dele.',
        'Marque “Ativa” no endereço (ou use o botão que ativa de uma vez os endereços que já têm setor). A partir daí, quem é do setor já envia por ele.',
      ],
      dica: 'Endereço sem setor não pode ser ativado: sempre tem de haver um setor responsável por ele. Endereço novo no Gmail só aparece depois de “Sincronizar endereços”.',
    },
  ],
  perguntas: [
    {
      id: 'nao-faco-parte-de-setor',
      pergunta: 'Aparece “Você ainda não faz parte de um setor com endereço ativo”. O que faço?',
      resposta: 'Só envia por um endereço quem é do setor dono dele. Peça a um administrador para incluir você no seu setor. Administradores enviam por qualquer endereço ativo.',
      termos: ['sem acesso', 'não consigo enviar', 'setor'],
    },
    {
      id: 'conta-google',
      pergunta: 'O que quer dizer “A autorização da conta Google expirou”?',
      resposta: 'Os e-mails saem pelo Gmail da filial, e a Redação precisa de uma autorização para usá-lo. Quando ela vence, ou quando o correio ainda não foi ligado à conta Google, ninguém envia até um administrador usar “Reconectar” (ou “Conectar conta Google”) em Configurações, na parte “E-mail do setor”.',
      termos: ['gmail', 'google', 'desconectado', 'expirou', 'não foi ligado'],
    },
    {
      id: 'mudar-assinatura',
      pergunta: 'Posso mudar a assinatura?',
      resposta: 'Aqui não. A assinatura vem do Gmail do setor e entra sozinha no fim de todo e-mail, para que cada setor saia sempre com a assinatura oficial. A mudança é feita no Gmail, e a Redação passa a usá-la depois que um administrador toca em “Sincronizar endereços”, em Configurações.',
      termos: ['rodapé', 'logo', 'cargo', 'telefone'],
    },
    {
      id: 'onde-chegam-respostas',
      pergunta: 'Onde chegam as respostas dos e-mails?',
      resposta: 'Não aqui: esta tela só envia e guarda o que saiu. A resposta vai para o endereço do setor (ou para o endereço de resposta definido no Gmail) e é lida no Gmail, fora da Redação.',
      termos: ['caixa de entrada', 'resposta', 'receber e-mail'],
    },
    {
      id: 'quem-ve-os-enviados',
      pergunta: 'Quem vê o que o setor enviou?',
      resposta: 'Quem é do setor vê tudo o que saiu pelo endereço dele, de qualquer pessoa. Administradores veem os envios de todos os setores.',
      termos: ['histórico', 'enviados', 'privacidade'],
    },
    {
      id: 'como-escrever-enderecos',
      pergunta: 'Como escrevo mais de um endereço?',
      resposta: 'Separe por vírgula, ponto e vírgula ou quebra de linha. Também vale “Nome <endereco@exemplo.org>”. Endereço repetido no mesmo campo conta uma vez só.',
      termos: ['destinatários', 'vários', 'lista'],
    },
    {
      id: 'limite-de-destinatarios',
      pergunta: 'Quantas pessoas posso pôr num e-mail?',
      resposta: 'Até 50, somando “Para” e “Cc”. Para listas maiores, use as campanhas de Imprensa e contatos, que foram feitas para isso.',
      termos: ['limite', 'máximo', 'lista', 'disparo'],
    },
    {
      id: 'anexar-arquivo',
      pergunta: 'Dá para anexar um arquivo?',
      resposta: 'Por esta tela, não: ela envia só o texto, com a assinatura do setor.',
      termos: ['anexo', 'pdf', 'arquivo'],
    },
    {
      id: 'cancelar-envio',
      pergunta: 'Dá para cancelar um e-mail já enviado?',
      resposta: 'Não. Ao tocar em “Enviar”, o e-mail sai na hora pelo Gmail. Confira os endereços e o texto antes.',
      termos: ['desfazer', 'voltar', 'errei'],
    },
    {
      id: 'enviado-de-outra-tela',
      pergunta: 'Apareceu em “Enviados” um e-mail que não saiu desta tela. De onde veio?',
      resposta: 'Os pedidos de compra também enviam a ordem de compra pelo endereço do setor, e esses envios entram em “Enviados” como os outros. O nome do arquivo anexado aparece no fim do texto.',
      termos: ['ordem de compra', 'compras', 'fornecedor', 'anexo'],
    },
  ],
  relacionadas: ['/imprensa', '/newsletter', '/configuracoes'],
}

// ---------------------------------------------------------------- Envios da equipe

const ENVIOS_DA_EQUIPE: GuiaDaArea = {
  href: '/envios',
  paraQueServe: 'Envios da equipe é a caixa do que a equipe manda pelo link público, na tela “Mandar uma ação”, sem login: relato, áudio, fotos, vídeos e documentos de uma ação. Aqui você avalia, escolhe o material e transforma o envio em pauta, matéria e posts.',
  quemUsa: 'Só quem foi escolhido para avaliar os envios. A escolha é pessoa a pessoa, e não pelo papel: para as outras pessoas, a área não aparece no menu e o endereço não abre. Quem manda pelo link não precisa de conta e não entra nesta área.',
  tour: [
    {
      titulo: 'Os envios da equipe',
      texto: 'Aqui chega o que a equipe manda pelo link, sem login: relato, áudios, fotos, vídeos e documentos de uma ação. Você avalia e decide se vira pauta, matéria e posts.',
    },
    {
      alvo: 'envios.link',
      titulo: 'O link e o QR code',
      texto: '“Copiar link” copia o endereço para você colar no grupo da equipe; “Baixar QR code” baixa a imagem para imprimir no cartaz da ação. Qualquer pessoa com o link consegue mandar.',
      lado: 'bottom',
    },
    {
      alvo: 'envios.abas',
      titulo: 'Para avaliar e o resto',
      texto: '“Para avaliar” junta os envios novos e os já abertos. “Viraram pauta”, “Arquivados” e “Ainda chegando” guardam o resto. O número mostra quantos há em cada um.',
      lado: 'bottom',
    },
    {
      alvo: 'envios.lista',
      titulo: 'Cada envio num cartão',
      texto: 'Cada envio vira um cartão, do mais recente ao mais antigo, com a situação, o protocolo, a data, quem mandou e quantos arquivos de cada tipo chegaram. “imagem: conferir” pede cuidado com a autorização.',
      lado: 'top',
    },
  ],
  telas: [
    {
      caminho: '/envios/[id]',
      rotulo: 'Envio da equipe',
      tour: [
        {
          titulo: 'Um envio aberto',
          texto: 'Aqui estão o relato, os áudios, as fotos, os vídeos e os documentos que chegaram. Abrir um envio “Novo” já o passa para “Em avaliação”.',
        },
        {
          alvo: 'envios.ficha',
          titulo: 'Quem mandou e a ação',
          texto: 'Nome, setor, contatos, data, local, pessoas atendidas e parceiros. O WhatsApp abre a conversa com uma mensagem pronta. “Imagem das pessoas” mostra o que foi declarado.',
          lado: 'left',
        },
        {
          alvo: 'envios.transcricao',
          titulo: 'Transcrição do áudio',
          texto: '“Transcrever com IA” passa o áudio para texto em português. Faça antes de criar a pauta: a transcrição entra na pauta e na matéria.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'envios.fotos-e-videos',
          titulo: 'Fotos e vídeos',
          texto: 'Antes de virar pauta, marque o que vai para a matéria e os posts. O selo “na Biblioteca” mostra o que já foi copiado, e “original” baixa o arquivo como chegou.',
          lado: 'top',
          seAusente: 'pular',
        },
        {
          alvo: 'envios.acoes',
          titulo: 'O que fazer com o envio',
          texto: '“Criar matéria e posts” cria a pauta, a matéria e o pacote de publicação, e copia os arquivos marcados para a Biblioteca. “Só criar a pauta” não copia nada. “Arquivar” tira da fila.',
          lado: 'top',
          seAusente: 'pular',
        },
        {
          alvo: 'envios.virou-trabalho',
          titulo: 'Virou trabalho',
          texto: 'Os links para o pacote e a pauta. Com a matéria no site, aparece “Ver a matéria no site” e, se a pessoa pediu aviso e deixou WhatsApp, “Avisar pelo WhatsApp”.',
          lado: 'left',
          seAusente: 'pular',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'divulgar-o-link',
      titulo: 'Divulgar o link para a equipe',
      passos: [
        'Abra “Envios da equipe”, no grupo Comunicação do menu.',
        'No quadro “Link para a equipe mandar ações”, toque em “Copiar link” e cole o endereço no grupo da equipe.',
        'Para o cartaz da ação, toque em “Baixar QR code” e imprima a imagem.',
        'Quem abre o link ou lê o QR code cai na tela “Mandar uma ação” e manda, sem login, em quatro passos.',
      ],
      dica: 'O link é aberto: qualquer pessoa com ele consegue mandar. Nada do que chega é publicado sozinho: só vira pauta pelas mãos de quem avalia.',
    },
    {
      id: 'avaliar-envio',
      titulo: 'Avaliar um envio que chegou',
      passos: [
        'Na aba “Para avaliar”, toque no cartão do envio. Os mais recentes vêm primeiro.',
        'Leia o relato, ouça os áudios e veja as fotos, os vídeos e os documentos.',
        'Se houver áudio, toque em “Transcrever com IA” para ler o que foi dito.',
        'Confira “Imagem das pessoas”, no quadro com os dados de quem mandou.',
        'Para tirar uma dúvida, toque no WhatsApp ou no e-mail de quem mandou.',
        'Decida em “O que fazer com este envio”: “Criar matéria e posts”, “Só criar a pauta” ou “Arquivar”.',
      ],
      dica: 'Abrir o envio já tira o “Novo”: ele passa a “Em avaliação” e continua em “Para avaliar” até você decidir.',
    },
    {
      id: 'criar-materia-e-posts',
      titulo: 'Transformar um envio em matéria e posts',
      passos: [
        'Abra o envio.',
        'Em “Fotos e vídeos”, marque o que vai para a matéria e os posts. Já vêm marcados as fotos e os vídeos de até 300 MB.',
        'Toque em “Criar matéria e posts”. O botão mostra quantos arquivos estão marcados.',
        'A Redação cria a pauta, a matéria em rascunho (com o relato e a transcrição) e o pacote de publicação, e copia para a Biblioteca os arquivos marcados, com o crédito de quem mandou.',
        'Se tudo entrou, o pacote abre em seguida. Se algum arquivo ficou fora da Biblioteca, a tela fica no envio com um aviso amarelo, que diz o motivo e traz “Abrir o pacote (matéria e posts)”.',
      ],
      dica: 'Vão no máximo 30 arquivos para a Biblioteca; o que passar disso fica de fora, sem aviso. Transcreva o áudio antes de criar: a transcrição só entra na pauta e na matéria se já existir nessa hora.',
    },
    {
      id: 'so-criar-a-pauta',
      titulo: 'Criar só a pauta, sem matéria',
      passos: [
        'Abra o envio.',
        'Toque em “Só criar a pauta”.',
        'A pauta nasce em “Entrada”, com você como responsável e com o relato, a transcrição e os dados da ação na descrição.',
        'Ela abre na hora. Dali, o trabalho segue pela pauta, como qualquer outra.',
      ],
      dica: 'Nada vai para a Biblioteca, e depois disso os botões do envio somem. Se precisar de uma foto ou de um vídeo, baixe em “original”, no envio, e suba na Biblioteca.',
    },
    {
      id: 'arquivar-envio',
      titulo: 'Arquivar um envio (e trazer de volta)',
      passos: [
        'Abra o envio e toque em “Arquivar”.',
        'Ele sai de “Para avaliar” e vai para a aba “Arquivados”.',
        'Para trazer de volta, abra o envio em “Arquivados” e toque em “Tirar do arquivo”. Ele volta para “Para avaliar”.',
      ],
      dica: 'Arquivar não apaga nada e não avisa quem mandou. Um envio arquivado ainda pode virar pauta, pelos mesmos botões.',
    },
    {
      id: 'transcrever-audio',
      titulo: 'Transcrever o áudio de um envio',
      passos: [
        'Abra o envio. A parte “Transcrição do áudio” só aparece quando há áudio.',
        'Toque em “Transcrever com IA” e espere o “Transcrevendo…” terminar.',
        'O texto aparece ali mesmo e fica guardado no envio.',
        'Para refazer, toque em “Transcrever de novo”.',
      ],
      dica: 'Áudio com mais de 25 MB fica de fora, e a tela diz qual. Transcreva antes de criar a pauta: depois, a transcrição não entra mais nela nem na matéria.',
    },
    {
      id: 'avisar-quem-mandou',
      titulo: 'Avisar quem mandou que a ação virou matéria',
      passos: [
        'Quando a matéria do envio vai ao ar no site pela primeira vez, quem mandou e deixou e-mail recebe o link por e-mail, sem você fazer nada.',
        'Quem deixou só o WhatsApp não é avisado sozinho: você recebe no sino o lembrete “Avise … pelo WhatsApp”.',
        'Abra o envio. No quadro “Virou trabalho”, toque em “Avisar pelo WhatsApp”.',
        'O WhatsApp abre com a mensagem pronta e o link da matéria. É só enviar.',
        'O envio passa a mostrar “Avisado em …”.',
      ],
      dica: 'Só é avisado quem marcou “Me avise quando a ação virar post ou matéria”. O aviso sai com a matéria no site: post nas redes não gera aviso.',
    },
  ],
  perguntas: [
    {
      id: 'quem-ve-os-envios',
      pergunta: 'Quem vê os envios da equipe?',
      resposta: 'Só quem foi escolhido para avaliar os envios. A escolha é pessoa a pessoa, e não pelo papel: ter o papel “Administrador” não basta. Quem avalia também recebe os avisos de envio novo.\n\nQuem manda pelo link não tem acesso a esta área e não vê o que as outras pessoas mandaram.',
      termos: ['permissão', 'acesso', 'avaliador', 'quem avalia', 'privacidade'],
    },
    {
      id: 'nao-vejo-a-area',
      pergunta: 'Por que não vejo “Envios da equipe” no menu?',
      resposta: 'A área só aparece para quem foi escolhido para avaliar os envios; para as outras pessoas, o endereço também não abre (aparece um erro 404). Essa escolha não fica em “Usuários e permissões”, e não há botão para ela na Redação: fale com quem cuida da ferramenta.',
      termos: ['404', 'sumiu do menu', 'sem acesso', 'não aparece', 'não abre'],
    },
    {
      id: 'situacoes-do-envio',
      pergunta: 'O que significam “Chegando”, “Novo”, “Em avaliação”, “Virou pauta” e “Arquivado”?',
      resposta: '“Chegando”: os arquivos ainda estão subindo, ou quem mandou saiu da tela antes do fim; o envio fica em “Ainda chegando”. “Novo”: terminou de chegar e ninguém abriu. “Em avaliação”: já foi aberto, ou voltou do arquivo. Esses dois ficam em “Para avaliar”.\n\n“Virou pauta”: alguém criou a pauta a partir dele. “Arquivado”: saiu da fila, sem nada ser apagado.',
      termos: ['status', 'situação', 'estado', 'abas'],
    },
    {
      id: 'ainda-chegando',
      pergunta: 'Um envio ficou em “Ainda chegando”. O que faço?',
      resposta: 'Quem mandou ainda está enviando os arquivos, ou fechou a tela antes de terminar. Você já pode abrir o envio: a tela diz quantos arquivos ainda não chegaram, mostra o que chegou e tem os mesmos botões de sempre.\n\nEnvio parado aqui não gera aviso. Se faltar algo, fale com a pessoa pelo WhatsApp ou pelo e-mail do envio.',
      termos: ['chegando', 'incompleto', 'faltando arquivo', 'não chegou'],
    },
    {
      id: 'aviso-de-envio-novo',
      pergunta: 'Quando sou avisado de um envio novo?',
      resposta: 'Quando os arquivos de um envio terminam de chegar, quem avalia recebe um aviso no sino, com o resumo do que veio, e outro quando a pessoa manda mais arquivos para o mesmo envio. Se o aviso vai também por e-mail, você escolhe em Meu perfil, no assunto “Pautas e conteúdos”.\n\nEnvio só com texto, sem arquivo, entra direto em “Para avaliar”, sem aviso: vale olhar a aba de vez em quando.',
      termos: ['notificação', 'sino', 'e-mail', 'Nova ação enviada', 'Mais arquivos em'],
    },
    {
      id: 'imagem-conferir',
      pergunta: 'O que quer dizer “imagem: conferir”?',
      resposta: 'Que quem mandou respondeu “Não sei / não perguntei” ou “Tem criança ou adolescente” sobre a imagem das pessoas. Os arquivos desse envio que forem para a Biblioteca entram com o selo “Falta autorizar”: confira a autorização antes de publicar.\n\nCom “Sim, todas autorizaram” ou “Não aparece ninguém de frente”, eles entram com “Uso autorizado”.',
      termos: ['autorização de imagem', 'direito de imagem', 'menores', 'criança', 'pendente', 'Imagem das pessoas'],
    },
    {
      id: 'o-que-vai-para-a-biblioteca',
      pergunta: 'O que vai para a Biblioteca?',
      resposta: 'Só as fotos e os vídeos marcados, só com “Criar matéria e posts” e no máximo 30, com o crédito de quem mandou. Fica de fora o arquivo acima de 300 MB, de tipo que a Biblioteca não aceita ou que não cabe no espaço dela; o aviso amarelo diz qual.\n\nÁudios e documentos não vão. Tudo o que chegou continua guardado e aparece no envio.',
      termos: ['biblioteca de mídia', 'cota', 'espaço', 'crédito', 'acervo', 'a Biblioteca está cheia'],
    },
    {
      id: 'so-criei-a-pauta',
      pergunta: 'Escolhi “Só criar a pauta”. Como levo as fotos para a matéria depois?',
      resposta: 'Pelo envio, não dá mais: depois que ele vira pauta, os botões somem. Baixe o que precisar em “original”, embaixo da foto ou do vídeo, e suba na Biblioteca.',
      termos: ['fotos depois', 'copiar para a biblioteca', 'botões sumiram'],
    },
    {
      id: 'limites-do-link',
      pergunta: 'Há limite para o que a equipe manda?',
      resposta: 'Cada arquivo vai até 2 GB, e cada envio, até 60 arquivos: fotos, vídeos, áudios, PDF e documentos do Office. Outros tipos, como arquivo compactado, não passam.\n\nDa mesma conexão de internet, são até 10 envios por hora e 5 GB por dia; numa ação com todo mundo no mesmo Wi-Fi, o limite é de todos juntos. Enquanto não fecha a tela com o protocolo, quem mandou pode pôr mais arquivos no mesmo envio, por até 24 horas, em “Mandar mais arquivos para este envio”.',
      termos: ['tamanho', '2 GB', 'vídeo grande', 'limite', 'Muitos envios seguidos deste aparelho', 'limite diário'],
    },
    {
      id: 'dados-de-quem-manda',
      pergunta: 'O que acontece com os dados de quem manda?',
      resposta: 'O formulário avisa que o material fica guardado pela Cruz Vermelha Brasileira – Filial RJ e só é usado na comunicação da instituição, depois da avaliação. Nome, setor, WhatsApp e e-mail aparecem para quem avalia e, se o envio vira pauta, para a equipe, na pauta; o nome também vira crédito das fotos na Biblioteca.\n\nCom “Transcrever com IA”, o áudio vai para o serviço de IA que faz a transcrição. O aparelho de quem manda guarda o nome e os contatos, para não pedir de novo no próximo envio.',
      termos: ['LGPD', 'privacidade', 'dados pessoais', 'contato', 'telefone'],
    },
    {
      id: 'quem-mandou-fica-sabendo',
      pergunta: 'Quem mandou fica sabendo do que aconteceu com o envio?',
      resposta: 'Se marcou “Me avise quando a ação virar post ou matéria”, fica, quando a matéria vai ao ar no site pela primeira vez: por e-mail, sozinho, ou pelo WhatsApp, com o botão “Avisar pelo WhatsApp” do envio. Post nas redes não gera aviso, e arquivar não avisa ninguém.',
      termos: ['aviso', 'retorno', 'publicou', 'WhatsApp', 'agradecer'],
    },
  ],
  relacionadas: ['/pautas', '/redes', '/biblioteca'],
}

// ---------------------------------------------------------------- Voluntários (canal direto)

const CANAL_DOS_VOLUNTARIOS: GuiaDaArea = {
  href: '/voluntariado/mensagens',
  paraQueServe: 'É o canal direto entre quem é voluntário e a coordenação. A pessoa escreve pela Área do Voluntário; a equipe lê e responde daqui, e a resposta chega também por e-mail, quando o cadastro tem e-mail.',
  quemUsa: 'Quem gerencia o Voluntariado: administradores e quem tem o acesso “Gerenciar” ou “Dados sensíveis” ao cadastro de voluntários. Essas pessoas veem todas as conversas. Para as demais, a tela não abre (aparece um erro 404).',
  tour: [
    {
      titulo: 'Mensagens dos voluntários',
      texto: 'Cada conversa é de uma pessoa voluntária com a coordenação. Quem gerencia o Voluntariado vê todas e recebe aviso no sino a cada mensagem nova.',
    },
    {
      alvo: 'canal-voluntarios.abas',
      titulo: 'Aguardando, respondidas e encerradas',
      texto: '“Aguardando resposta” é a fila de trabalho, com a mais antiga primeiro. “Respondidas” e “Encerradas” guardam o resto. O número mostra quantas há em cada uma.',
      lado: 'bottom',
    },
    {
      alvo: 'canal-voluntarios.lista',
      titulo: 'As conversas',
      texto: 'Cada linha traz o assunto, o nome de quem escreveu e o tipo do assunto. O ponto e o negrito marcam o que ninguém da equipe abriu ainda.',
      lado: 'top',
    },
  ],
  telas: [
    {
      caminho: '/voluntariado/mensagens/[id]',
      rotulo: 'Conversa do canal',
      tour: [
        {
          alvo: 'canal-voluntarios.cabecalho',
          titulo: 'Quem escreveu',
          texto: 'O assunto, o nome de quem escreveu (que abre o cadastro), o e-mail, o telefone, o tipo do assunto e a situação da conversa.',
          lado: 'bottom',
        },
        {
          alvo: 'canal-voluntarios.conversa',
          titulo: 'A conversa',
          texto: 'As mensagens de quem escreveu ficam à esquerda; as da equipe, à direita, com o nome de quem respondeu. Abrir a conversa marca como lida para a equipe toda.',
          lado: 'top',
        },
        {
          alvo: 'canal-voluntarios.responder',
          titulo: 'Responder',
          texto: 'Escreva e toque em “Responder”. A conversa passa para “Respondidas”, e a pessoa recebe a resposta também por e-mail, se o cadastro tiver e-mail.',
          lado: 'top',
        },
        {
          alvo: 'canal-voluntarios.situacao',
          titulo: 'Encerrar ou reabrir',
          texto: '“Encerrar conversa” tira da fila o assunto resolvido; “Reabrir” devolve para “Aguardando resposta”. Se a pessoa escrever de novo, a conversa também volta sozinha para lá.',
          lado: 'bottom',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'responder-voluntario',
      titulo: 'Responder uma mensagem do canal',
      passos: [
        'Abra “Voluntários”, no grupo Comunicação do menu.',
        'Na aba “Aguardando resposta”, toque na conversa. As mais antigas vêm primeiro.',
        'Leia a conversa. Para ver o cadastro de quem escreveu, toque no nome da pessoa, no alto.',
        'Escreva a resposta no campo de baixo e toque em “Responder”.',
        'A conversa vai para “Respondidas”, e a pessoa recebe a resposta também por e-mail.',
      ],
      dica: 'O e-mail só sai se o cadastro da pessoa tiver e-mail. Na Área do Voluntário, a resposta aparece com o seu primeiro nome e “Coordenação”.',
    },
    {
      id: 'encerrar-conversa',
      titulo: 'Encerrar uma conversa resolvida',
      passos: [
        'Abra a conversa.',
        'Toque em “Encerrar conversa”, no alto, à direita.',
        'Ela vai para a aba “Encerradas”. Para trazer de volta, abra e toque em “Reabrir”: ela volta para “Aguardando resposta”.',
      ],
      dica: 'Se a pessoa escrever de novo numa conversa respondida ou encerrada, ela volta para “Aguardando resposta”. Se a equipe responder numa conversa encerrada, ela vai para “Respondidas”.',
    },
    {
      id: 'achar-conversa-antiga',
      titulo: 'Achar uma conversa já respondida ou encerrada',
      passos: [
        'Toque na aba “Respondidas” ou “Encerradas”.',
        'As mais recentes vêm primeiro.',
        'Toque na conversa para ler tudo o que foi dito.',
      ],
    },
  ],
  perguntas: [
    {
      id: 'quem-ve-e-responde',
      pergunta: 'Quem vê e responde estas mensagens?',
      resposta: 'Administradores e quem tem o acesso “Gerenciar” ou “Dados sensíveis” ao cadastro de voluntários. Todas essas pessoas veem todas as conversas e são avisadas no sino a cada mensagem nova.',
      termos: ['permissão', 'acesso', 'coordenação', 'gerenciar'],
    },
    {
      id: 'pagina-nao-encontrada',
      pergunta: 'Abro “Voluntários” e aparece um erro 404. Por quê?',
      resposta: 'O item aparece no menu para toda a equipe, mas a tela só abre para quem gerencia o Voluntariado, porque as conversas trazem dados pessoais.\n\nPeça a um administrador o acesso “Gerenciar” ao cadastro de voluntários. Esse acesso fica em Voluntários (grupo Pessoas), na aba “Quem acessa”.',
      termos: ['404', 'não abre', 'sem acesso', 'bloqueado'],
    },
    {
      id: 'situacoes-da-conversa',
      pergunta: 'O que significam “Aguardando resposta”, “Respondidas” e “Encerradas”?',
      resposta: '“Aguardando resposta”: a pessoa escreveu e a equipe ainda não respondeu, ou alguém da equipe reabriu a conversa. “Respondidas”: a equipe respondeu. “Encerradas”: alguém da equipe deu o assunto por encerrado.\n\nQuando a pessoa escreve de novo, a conversa volta para “Aguardando resposta”.',
      termos: ['status', 'situação', 'fila', 'aberta'],
    },
    {
      id: 'ponto-na-conversa',
      pergunta: 'O que marca o ponto ao lado de uma conversa?',
      resposta: 'Que ninguém da equipe abriu ainda a mensagem nova de quem escreveu. Basta uma pessoa da equipe abrir a conversa para o ponto sumir para todos.',
      termos: ['não lida', 'negrito', 'nova'],
    },
    {
      id: 'como-o-voluntario-ve',
      pergunta: 'Como a pessoa voluntária vê a minha resposta?',
      resposta: 'Na Área do Voluntário, em “Mensagens”, com o seu primeiro nome e “Coordenação”. Se o cadastro tiver e-mail, a resposta vai também por e-mail, com um link para a conversa.',
      termos: ['área do voluntário', 'e-mail', 'membro'],
    },
    {
      id: 'editar-ou-apagar-resposta',
      pergunta: 'Dá para editar ou apagar uma resposta?',
      resposta: 'Não. A resposta fica na conversa e pode já ter ido por e-mail. Se algo saiu errado, mande outra resposta corrigindo.',
      termos: ['errei', 'corrigir', 'excluir'],
    },
    {
      id: 'comecar-conversa',
      pergunta: 'Posso começar uma conversa com uma pessoa voluntária?',
      resposta: 'Por aqui, não: quem abre a conversa é a própria pessoa, na Área do Voluntário. Para falar com uma pessoa, use o e-mail ou o telefone do cadastro dela; para falar com todo o voluntariado, use o mural de avisos.',
      termos: ['nova mensagem', 'escrever para voluntário', 'iniciar'],
    },
    {
      id: 'recado-para-todos',
      pergunta: 'Como mando um recado para todo o voluntariado?',
      resposta: 'Pelo mural de avisos: em Voluntários, no grupo Pessoas do menu, abra “Avisos”. O aviso aparece na Área do Voluntário e, marcando “Enviar também por e-mail”, vai uma vez para cada pessoa ativa com e-mail que não saiu da lista.',
      termos: ['mural', 'aviso', 'comunicado', 'todos', 'todos os voluntários'],
    },
  ],
  relacionadas: ['/voluntariado'],
}

export const guias: GuiaDaArea[] = [CHAT, CAIXA_DE_ENTRADA, EMAIL_DO_SETOR, ENVIOS_DA_EQUIPE, CANAL_DOS_VOLUNTARIOS]
