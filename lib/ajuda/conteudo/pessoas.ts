import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do grupo Pessoas do menu: Diretório (/pessoas, com o perfil
 * /pessoas/[id], /pessoas/[id]/editar, /pessoas/adicionar e
 * /pessoas/setores), Recursos humanos (/equipe, com /novo, /[id] e
 * /[id]/editar) e Voluntários (/voluntariado, com o cadastro, avisos,
 * oportunidades, cursos e apostilas; /participantes redireciona para lá). As
 * mensagens dos voluntários (/voluntariado/mensagens) são outra área, em
 * conteudo/comunicacao.ts. O Livro de ponto (/livro-de-ponto) é o caminho até
 * o ponto da sede, que mora no site da filial.
 *
 * Cada frase tem apoio no código:
 * - Diretório: app/(app)/pessoas/**, components/app/pessoas/**,
 *   lib/pessoas/diretorio.ts, perfil.ts e perfil-servidor.ts,
 *   app/actions/usuarios.ts (convidarEmLote, reenviarConvite,
 *   cancelarConvite), app/actions/setores.ts e setor_salvar
 *   (*_cvrj_diretorio.sql); validade do convite em lib/contas/servidor.ts;
 * - Recursos humanos: app/(app)/equipe/**, components/app/equipe/**,
 *   lib/rh/regras.ts e acesso.ts, app/actions/equipe.ts,
 *   app/api/equipe/exportar e as funções *_equipe (*_cvrj_equipe*.sql);
 * - Voluntários: app/(app)/voluntariado/** (menos mensagens),
 *   components/app/participantes/**, cursos/**, oportunidades/**, o Mural de
 *   components/app/canal/acoes.tsx, lib/participantes/**,
 *   lib/oportunidades/regras.ts, lib/cursos/regras.ts, lib/membro/**,
 *   app/actions/participantes.ts, oportunidades.ts, cursos.ts e canal.ts,
 *   app/api/participe e app/api/voluntariado/exportar, e as funções das
 *   migrações *_cvrj_participantes.sql, *_cvrj_oportunidades.sql e
 *   *_cvrj_cursos.sql;
 * - Livro de ponto: app/(app)/livro-de-ponto/page.tsx; o ponto e o portal da
 *   secretaria estão no repositório do site (cruzvermelhariodejaneiro):
 *   site/matricula-cursos-presenciais/api/painel.php (entrada por link de 20
 *   minutos, sessão de 12 horas, abas do ponto), ponto/ e static/ponto.js
 *   (“Continuar”, “Registrar entrada”, “Estou saindo agora”, “Lembrar de mim
 *   neste celular”, localização só para conferir a distância).
 * Quem pode o quê: "usuarios.gerenciar" em lib/permissoes.ts (Diretório) e
 * os níveis próprios de Recursos humanos (NIVEIS em lib/rh/regras.ts) e de
 * Voluntários (NIVEIS em lib/participantes/regras.ts), liberados por admin.
 *
 * Os alvos `diretorio.*`, `rh.*`, `voluntarios.*` e `ponto.*` são marcados com
 * `data-ajuda` nessas telas. Atenção às telas: '/pessoas/[id]' casa também com
 * /pessoas/adicionar e /pessoas/setores, '/equipe/[id]' com /equipe/novo e
 * '/voluntariado/[id]' com avisos, cursos, oportunidades e novo — por isso
 * cada uma dessas tem tour próprio (o estático vence o dinâmico). Mudou a
 * tela ou a regra, muda aqui no mesmo PR (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Diretório

const DIRETORIO: GuiaDaArea = {
  href: '/pessoas',
  paraQueServe: 'A equipe inteira da filial num lugar só: quem tem login no Palácio Virtual, quem só tem ficha em Recursos humanos e quem está na lista oficial dos setores. Aqui você acha cargo, setor e contato de trabalho de cada pessoa, abre o perfil dela e manda mensagem.',
  quemUsa: 'Toda a equipe vê o Diretório, os perfis e os setores. Dar acesso ao Palácio Virtual, mudar os setores e ver o que falta no cadastro de cada um é só de administradores. O perfil, só a própria pessoa edita — nem administrador edita o de outra.',
  naPratica: {
    titulo: 'Achar quem cuida das doações em outro setor',
    passos: [
      'A Carla precisa falar com alguém do setor de Captação sobre uma doação.',
      'Abre o Diretório e filtra pelo setor.',
      'Vê o cargo e o contato de trabalho de cada pessoa, e abre o perfil de quem cuida das doações.',
      'Manda uma mensagem direta pelo Chat, dali mesmo.',
    ],
    resultado: 'Ninguém precisa perguntar no grupo “quem cuida disso?”.',
  },
  tour: [
    {
      titulo: 'A equipe da filial',
      texto: 'Toda a equipe da filial aparece aqui, com ou sem login no Palácio Virtual: cargo, setor, papel, e-mail e telefone. O nome ou a foto de quem tem login abre o perfil.',
    },
    {
      alvo: 'diretorio.busca',
      titulo: 'Buscar e mudar a vista',
      texto: 'Busque por nome, cargo, setor, e-mail ou telefone. “Pessoas” mostra os cartões; “Por setor” agrupa a equipe, com o responsável e o e-mail de cada setor.',
      lado: 'bottom',
    },
    {
      alvo: 'diretorio.filtros',
      titulo: 'Filtrar por setor e acesso',
      texto: 'Toque num setor para ver só quem é dele. Embaixo, filtre por “Com acesso”, “Convite pendente” ou “Sem acesso” ao Palácio Virtual.',
      lado: 'bottom',
    },
    {
      alvo: 'diretorio.cartao',
      titulo: 'O cartão de cada pessoa',
      texto: 'Cargo, setor, papel no Palácio Virtual e os atalhos de contato: e-mail, o botão com o endereço (copia o e-mail), telefone e WhatsApp (quando o número é de celular).',
      seAusente: 'pular',
    },
    {
      alvo: 'diretorio.setores',
      titulo: 'Os setores',
      texto: 'O botão “Setores” mostra a lista de setores da filial, com o responsável, o e-mail e quantas pessoas há em cada um.',
      lado: 'bottom',
    },
    {
      alvo: 'diretorio.adicionar',
      titulo: 'Dar acesso ao Palácio Virtual',
      texto: 'Só administradores: “Adicionar pessoas” convida pelo WhatsApp e/ou por e-mail quem ainda não tem login, e já cria a ficha no RH. Cada pessoa cria a própria senha pelo link.',
      lado: 'bottom',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/pessoas/[id]',
      rotulo: 'Perfil de uma pessoa',
      tour: [
        {
          titulo: 'O perfil',
          texto: 'A página de cada pessoa: apresentação, como ela responde à equipe e os contatos que ela escolheu mostrar. Só a própria pessoa edita o perfil.',
        },
        {
          alvo: 'diretorio.perfil-topo',
          titulo: 'Quem é',
          texto: 'Foto, cargo, setor e papel no Palácio Virtual. O selo “Costuma responder em…” aparece depois de pelo menos 3 respostas no chat nos últimos 90 dias.',
        },
        {
          alvo: 'diretorio.perfil-acoes',
          titulo: 'Mensagem ou edição',
          texto: 'No perfil de outra pessoa, “Mandar mensagem” abre uma conversa direta no Chat. No seu, “Editar perfil” muda a apresentação e os contatos.',
          seAusente: 'pular',
        },
        {
          alvo: 'diretorio.metricas',
          titulo: 'Como responde à equipe',
          texto: 'Tempo de resposta no chat e nas aprovações, chamados e produção, pela mediana dos últimos 90 dias. Quem prefere esconde esses números; administradores continuam vendo.',
        },
        {
          alvo: 'diretorio.contatos',
          titulo: 'Contatos',
          texto: 'Institucionais e pessoais. Você só vê o que a pessoa liberou para você; o resto nem chega à sua tela.',
        },
      ],
    },
    {
      caminho: '/pessoas/[id]/editar',
      rotulo: 'Editar meu perfil',
      tour: [
        {
          alvo: 'diretorio.editor-apresentacao',
          titulo: 'A sua apresentação',
          texto: '“Sobre você”, pronomes, disponibilidade, “Pode ajudar com” (separado por vírgula) e a cor da capa. Nome, foto, cargo e setor não mudam aqui.',
        },
        {
          alvo: 'diretorio.editor-institucionais',
          titulo: 'Contatos institucionais',
          texto: 'Ramal, e-mail do setor, WhatsApp de trabalho. O e-mail e o telefone de trabalho da sua ficha em Recursos humanos já aparecem sozinhos.',
        },
        {
          alvo: 'diretorio.editor-pessoais',
          titulo: 'Contatos pessoais',
          texto: 'Cada contato pessoal nasce “Só administradores”. Na caixa de visibilidade ao lado dele, abra para “Só o meu setor” ou “Toda a equipe”, se quiser.',
        },
        {
          alvo: 'diretorio.editor-metricas',
          titulo: 'As suas métricas',
          texto: 'Com “Mostrar minhas métricas no perfil” desmarcado, só você e os administradores veem os seus números.',
        },
        {
          alvo: 'diretorio.editor-salvar',
          titulo: 'Salvar',
          texto: '“Salvar perfil” grava tudo e volta para o seu perfil. Se um contato estiver fora do formato, o motivo aparece embaixo dele.',
          lado: 'top',
        },
      ],
    },
    {
      caminho: '/pessoas/adicionar',
      rotulo: 'Adicionar pessoas',
      tour: [
        {
          alvo: 'diretorio.candidatos',
          titulo: '1. Quem vai receber acesso',
          texto: 'Marque quem da equipe ainda não tem login: vem das fichas de Recursos humanos e da lista oficial dos setores. Para alguém de fora, “Outra pessoa (fora da lista)”.',
        },
        {
          alvo: 'diretorio.convites',
          titulo: '2. Confira e envie',
          texto: 'Confira nome e sobrenome, WhatsApp e/ou e-mail, setor e papel de cada pessoa. O convite sai pelo que estiver preenchido. O papel vem sugerido pelo setor; na dúvida, “Colaborador”, que dá para mudar depois.',
        },
        {
          alvo: 'diretorio.ficha',
          titulo: 'A ficha no RH vem junto',
          texto: 'Quem ainda não tem ficha em Recursos humanos ganha uma (“Criar a ficha no RH”); quem já tem fica ligado a ela. Com WhatsApp, o pedido para a pessoa completar a ficha vai na mesma mensagem do convite.',
          seAusente: 'pular',
        },
        {
          alvo: 'diretorio.enviar',
          titulo: 'Enviar os convites',
          texto: 'Cada pessoa recebe, pelo WhatsApp e/ou por e-mail, o usuário e um link para criar a própria senha, que vale 72 horas. O resultado de cada convite aparece logo abaixo.',
        },
        {
          alvo: 'diretorio.pendentes',
          titulo: 'Convites pendentes',
          texto: 'Quem tem conta e ainda não entrou. “Reenviar” gera um link novo pelo mesmo caminho do convite (WhatsApp e/ou e-mail), e o anterior deixa de valer; “Cancelar” desativa a conta.',
        },
      ],
    },
    {
      caminho: '/pessoas/setores',
      rotulo: 'Setores',
      tour: [
        {
          titulo: 'Os setores da filial',
          texto: 'A lista que aparece em Usuários e permissões, Recursos humanos, Voluntários, “Registrar atividade” e no E-mail do setor. Só administradores mudam esta lista.',
        },
        {
          alvo: 'diretorio.lista-setores',
          titulo: 'Cada setor',
          texto: 'Nome, quantas pessoas, descrição, responsável e e-mail. Setor desativado aparece marcado e sai das listas de escolha.',
        },
        {
          alvo: 'diretorio.novo-setor',
          titulo: 'Novo setor',
          texto: '“Novo setor” pede nome, responsável, descrição, e-mail e ordem. O lápis ao lado de cada setor abre a edição.',
          lado: 'bottom',
          seAusente: 'pular',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'achar-contato',
      titulo: 'Achar o contato de alguém da equipe',
      exemplo: 'Buscando “doações”, a Carla acha a Marta, da Captação, com o ramal e o e-mail de trabalho, e toca em “Mandar mensagem”.',
      passos: [
        'Abra “Diretório”, no grupo Pessoas do menu.',
        'No campo de busca, digite parte do nome, do cargo, do setor, do e-mail ou do telefone.',
        'No cartão da pessoa, use o ícone de e-mail, o botão com o endereço (ele copia o e-mail), o telefone ou o WhatsApp.',
        'Para ver outros contatos, toque no nome ou na foto e abra o perfil (só quem tem login tem perfil).',
      ],
      dica: 'O atalho do WhatsApp só aparece quando o telefone é de celular, com DDD.',
    },
    {
      id: 'ver-por-setor',
      titulo: 'Ver quem é de cada setor',
      passos: [
        'No Diretório, toque em “Por setor”.',
        'Cada setor aparece com as pessoas dele, a descrição, o responsável e o e-mail do setor.',
        'Para ver um setor só, toque no nome dele na fileira de setores; toque de novo para voltar a “Todos os setores”.',
      ],
      dica: 'Quem ainda não tem setor fica no fim, em “Sem setor”.',
    },
    {
      id: 'mandar-mensagem',
      titulo: 'Mandar mensagem para alguém',
      passos: [
        'No Diretório, toque no nome ou na foto da pessoa.',
        'No perfil, toque em “Mandar mensagem”.',
        'A conversa direta abre no Chat: escreva e envie.',
      ],
      dica: 'Quem ainda não tem login não tem perfil, então o nome dessa pessoa no Diretório não abre nada. Em conta desativada, o botão não aparece.',
    },
    {
      id: 'completar-meu-perfil',
      titulo: 'Completar o seu perfil',
      passos: [
        'Abra o seu perfil: em “Meu perfil”, toque em “Ver meu perfil público →”, ou ache o seu nome no Diretório.',
        'Toque em “Editar perfil” (ou em “Completar perfil”, se ele ainda estiver vazio).',
        'Escreva “Sobre você” e preencha “Disponibilidade” e “Pode ajudar com”, separando por vírgula.',
        'Em “Contatos institucionais” ou “Contatos pessoais”, toque em “Adicionar”, escolha o canal e preencha o contato.',
        'Na caixa de visibilidade de cada contato, escolha “Toda a equipe”, “Só o meu setor” ou “Só administradores”.',
        'Toque em “Salvar perfil”.',
      ],
      dica: 'Nome e foto você muda em “Meu perfil”, não aqui.',
    },
    {
      id: 'esconder-metricas',
      titulo: 'Esconder as suas métricas do perfil',
      passos: [
        'Abra o seu perfil e toque em “Editar perfil”.',
        'Desmarque “Mostrar minhas métricas no perfil”.',
        'Toque em “Salvar perfil”.',
      ],
      dica: 'Escondidas, as métricas continuam visíveis para você e para os administradores.',
    },
    {
      id: 'dar-acesso',
      titulo: 'Dar acesso ao Palácio Virtual a alguém da equipe',
      quem: 'Só administradores',
      passos: [
        'No Diretório, toque em “Adicionar pessoas” (ou em “Dar acesso”, no cartão de quem está “Sem acesso”).',
        'Em “1. Quem vai receber acesso”, marque as pessoas. Para alguém que não está na lista, toque em “Outra pessoa (fora da lista)”.',
        'Em “2. Confira e envie”, preencha o “WhatsApp” e/ou o “E-mail” e confira “Setor”, “Papel” e “Cargo (opcional)”.',
        'Deixe marcado “Criar a ficha no RH” (para quem ainda não tem ficha) e, se quiser, “Pedir, na mesma mensagem do WhatsApp, que a pessoa complete a ficha”.',
        'Resolva o que aparecer como “Falta: …” embaixo de cada pessoa.',
        'Toque em “Enviar convite” (com mais gente, o botão mostra quantos convites vão sair).',
        'Confira o resultado de cada pessoa na lista que aparece embaixo do botão.',
      ],
      dica: 'Dá para convidar até 30 pessoas de uma vez. Com WhatsApp e e-mail preenchidos, o convite sai pelos dois. Para quem não tem nenhum dos dois, o acesso sai com senha temporária em “Usuários e permissões”.',
    },
    {
      id: 'reenviar-convite',
      titulo: 'Reenviar ou cancelar um convite',
      quem: 'Só administradores',
      passos: [
        'No Diretório, toque em “Adicionar pessoas”.',
        'Em “Convites pendentes”, ache a pessoa.',
        'Toque em “Reenviar” para mandar um link novo, ou em “Cancelar” para desfazer o convite.',
      ],
      dica: 'Reenviar usa o mesmo caminho do convite (WhatsApp e/ou e-mail) e invalida o link anterior. Cancelar desativa a conta; se precisar, ela é reativada em “Usuários e permissões”.',
    },
    {
      id: 'editar-setores',
      titulo: 'Criar ou editar um setor',
      quem: 'Só administradores',
      passos: [
        'No Diretório, toque em “Setores”.',
        'Toque em “Novo setor”, ou no lápis ao lado de um setor para editar.',
        'Preencha “Nome”, “Responsável”, “Descrição”, “E-mail do setor” e “Ordem” (menor aparece antes nas listas).',
        'Para tirar um setor de uso, em “Situação”, escolha “Desativado”.',
        'Toque em “Salvar”.',
      ],
      dica: 'Renomear um setor leva o nome novo às pessoas, às fichas, aos voluntários e às pautas que já estão nele.',
    },
  ],
  perguntas: [
    {
      id: 'quem-aparece',
      pergunta: 'Quem aparece no Diretório?',
      resposta: 'Toda a equipe da filial: quem tem login no Palácio Virtual, quem só tem ficha em Recursos humanos e quem está na lista oficial dos setores e ainda não foi cadastrado. Ficha de quem foi desligado em Recursos humanos não entra. Contas desativadas só aparecem para administradores.',
      termos: ['lista', 'colaboradores', 'funcionários', 'desativado', 'equipe'],
    },
    {
      id: 'status-de-acesso',
      pergunta: 'O que significam “Com acesso”, “Convite pendente” e “Sem acesso”?',
      resposta: '“Com acesso”: já entrou no Palácio Virtual. “Convite pendente”: tem conta, mas ainda não fez o primeiro acesso. “Sem acesso”: está na equipe, mas não tem login.\n\n“Desativado”, que só administradores veem, é conta desativada.',
      termos: ['login', 'status', 'primeiro acesso', 'situação'],
    },
    {
      id: 'quem-edita-perfil',
      pergunta: 'Um administrador pode editar o meu perfil?',
      resposta: 'Não. Só a própria pessoa edita o perfil, nem administrador. O setor e o papel no Palácio Virtual, esses sim, quem muda é um administrador, em “Usuários e permissões”.',
      termos: ['editar perfil de outra pessoa', 'bio', 'apresentação'],
    },
    {
      id: 'mudar-nome-foto',
      pergunta: 'Como mudo o meu nome, a foto ou o cargo que aparecem no perfil?',
      resposta: 'Nome, foto e cargo você muda em “Meu perfil”, no menu da sua conta. Se você tem ficha em Recursos humanos, o nome social e o cargo de lá aparecem no lugar; quem cuida da ficha é que corrige.',
      termos: ['foto', 'avatar', 'nome', 'cargo errado'],
    },
    {
      id: 'quem-ve-contato',
      pergunta: 'Quem vê os meus contatos pessoais?',
      resposta: 'Cada contato tem a sua visibilidade: “Toda a equipe”, “Só o meu setor” (e administradores) ou “Só administradores”. Contato pessoal nasce “Só administradores”.\n\nO que alguém não pode ver nem chega à tela dessa pessoa: ela vê só um aviso de que há contatos restritos.',
      termos: ['privacidade', 'telefone pessoal', 'visibilidade', 'LGPD', 'celular'],
    },
    {
      id: 'metricas-como',
      pergunta: 'Como são calculadas as métricas do perfil?',
      resposta: 'Os tempos são dos últimos 90 dias, pela mediana e em tempo corrido. No chat, conta a primeira resposta quando a outra pessoa puxa assunto numa conversa direta e as respostas às menções nos canais.\n\nTambém entram o tempo para decidir aprovações, os chamados atendidos (com a nota, quando há) e a produção: pautas em andamento hoje e conteúdos criados no período.',
      termos: ['tempo de resposta', 'estatísticas', 'mediana', 'números'],
    },
    {
      id: 'selo-resposta',
      pergunta: 'Por que não aparece o selo “Costuma responder em…”?',
      resposta: 'O selo só aparece depois de pelo menos 3 respostas no chat nos últimos 90 dias. Também não aparece para os outros quando a pessoa escondeu as métricas.',
      termos: ['selo', 'tempo de resposta', 'badge'],
    },
    {
      id: 'visto-em',
      pergunta: 'Quem vê o “Visto em” e o ponto verde de online?',
      resposta: 'Só a própria pessoa e os administradores. Para o resto da equipe, o perfil não mostra quando a pessoa esteve no Palácio Virtual.',
      termos: ['online', 'último acesso', 'visto por último'],
    },
    {
      id: 'falta-cadastro',
      pergunta: 'O que é o “Falta: …” no cartão de uma pessoa?',
      resposta: 'Só administradores veem. É o que falta no cadastro da conta: nome completo, cargo, setor ou e-mail. “Completar” leva a “Usuários e permissões”, onde isso se resolve.',
      termos: ['pendência', 'cadastro incompleto', 'completar'],
    },
    {
      id: 'ficha-nao-ligada',
      pergunta: 'O que quer dizer “A ficha da Equipe desta pessoa não está ligada ao login — ligar”?',
      resposta: 'Há uma ficha em Recursos humanos com o mesmo nome da conta, mas as duas não estão ligadas. Toque em “ligar”: abre a edição da ficha; em “Login no Palácio Virtual”, escolha a conta e toque em “Salvar alterações”. Só administradores veem o aviso.',
      termos: ['ficha duplicada', 'aparece duas vezes', 'ligar login'],
    },
    {
      id: 'alerta-admins',
      pergunta: 'Por que aparece um alerta de administradores demais?',
      resposta: 'Quem é administrador cria contas, muda papéis e vê tudo no Palácio Virtual. O alerta aparece, só para administradores, quando há mais de 2 contas administradoras; o recomendado é 1 ou 2, um titular e um reserva. “Revisar papéis” leva a “Usuários e permissões”.',
      termos: ['admin', 'papéis', 'segurança'],
    },
    {
      id: 'setor-desativado',
      pergunta: 'O que acontece quando um setor é desativado?',
      resposta: 'Ele sai das listas de escolha, mas quem já está nele continua. Para voltar a usar, edite o setor e, em “Situação”, escolha “Em uso”.',
      termos: ['apagar setor', 'excluir setor', 'coordenação'],
    },
    {
      id: 'nao-vejo-adicionar',
      pergunta: 'Por que não vejo “Adicionar pessoas”?',
      resposta: 'Dar acesso ao Palácio Virtual é só de administradores. Se alguém precisa de login, peça a um administrador.',
      termos: ['convidar', 'criar usuário', 'novo login'],
    },
    {
      id: 'convite-nao-chegou',
      pergunta: 'O convite não chegou ou o link venceu. E agora?',
      resposta: 'O link do convite vale 72 horas. Um administrador abre “Adicionar pessoas” e, em “Convites pendentes”, toca em “Reenviar”: sai um link novo pelo mesmo caminho (WhatsApp e/ou e-mail), e o anterior deixa de valer.\n\nPelo WhatsApp, convite enviado entre 22h e 7h espera a manhã na fila. Se a tela avisar que nem o e-mail nem o WhatsApp do Palácio estão ligados, nenhum convite sai: dê o acesso com senha temporária em “Usuários e permissões”.',
      termos: ['e-mail', 'WhatsApp', 'link expirou', 'senha', 'reenviar', 'o e-mail não saiu', 'o WhatsApp não saiu'],
    },
  ],
  relacionadas: ['/usuarios', '/equipe', '/perfil', '/chat'],
}

// ---------------------------------------------------------------- Recursos humanos

const RECURSOS_HUMANOS: GuiaDaArea = {
  href: '/equipe',
  paraQueServe: 'As fichas de toda a equipe contratada, inclusive coordenação, administrativo e diretoria: contrato e cargo, histórico de mudanças, arquivos, documentos e remuneração. O voluntariado fica em Voluntários; folha de pagamento, eSocial e ponto ficam com a contabilidade.',
  quemUsa: 'O acesso é liberado pessoa a pessoa por um administrador, em quatro níveis — “Ver a equipe”, “Gerenciar”, “Documentos” e “Remuneração e banco” —, e cada um inclui o anterior. Administradores têm tudo. Abrir documentos, dados bancários, remuneração e arquivos fica registrado com o nome de quem abriu.',
  naPratica: {
    titulo: 'A contratação de uma nova técnica de enfermagem',
    passos: [
      'O RH cadastra a ficha da nova técnica de enfermagem, com cargo, contrato e data de início.',
      'Guarda os documentos da admissão na ficha (com acesso restrito).',
      'Registra a remuneração; só quem tem o nível certo vê valores.',
      'Quando ela muda de cargo, a mudança entra no histórico da ficha.',
    ],
    resultado: 'A vida funcional de cada pessoa da equipe fica num só lugar, com acesso controlado.',
  },
  tour: [
    {
      titulo: 'Recursos humanos',
      texto: 'As fichas da equipe contratada, com contrato, histórico, arquivos e remuneração. O acesso é liberado por nível, pessoa a pessoa; sem ele, você vê só o aviso para pedir a um administrador.',
    },
    {
      alvo: 'rh.numeros',
      titulo: 'O que pede atenção',
      texto: 'Ativos, afastados, fichas sem admissão ou vínculo e, para quem gerencia, arquivos vencidos ou que vencem nos próximos 60 dias (ASO, certificados).',
      seAusente: 'pular',
    },
    {
      alvo: 'rh.abas',
      titulo: 'Lista, organograma e acessos',
      texto: '“Pessoas” é a lista; “Organograma” monta a hierarquia pelo “Gestor direto” de cada ficha. A aba “Quem acessa” só administradores veem.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'rh.filtros',
      titulo: 'Buscar e filtrar',
      texto: 'Busque por nome, cargo, setor, e-mail ou telefone, filtre por vínculo, situação e setor e toque em “Filtrar”. Desligados só aparecem pedindo “Desligado” ou “Todas”.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'rh.lista',
      titulo: 'A lista',
      texto: 'Cada linha traz setor, vínculo, gestor, contato de trabalho e situação. O nome abre a ficha.',
      seAusente: 'pular',
    },
    {
      alvo: 'rh.nova',
      titulo: 'Nova ficha',
      texto: '“Nova pessoa” cria uma ficha, e só o nome é obrigatório. “Exportar” baixa a planilha com os filtros de vínculo, situação e setor, sem documentos, salários nem banco.',
      lado: 'bottom',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/equipe/[id]',
      rotulo: 'Ficha de uma pessoa',
      tour: [
        {
          titulo: 'A ficha, em camadas',
          texto: 'Contrato e cargo para quem vê a equipe; dados pessoais, histórico e arquivos para quem gerencia; documentos e remuneração só para os níveis desses dados.',
        },
        {
          alvo: 'rh.ficha-abas',
          titulo: 'As abas',
          texto: '“Contrato e cargo”, “Pessoal”, “Histórico”, “Arquivos”, “Documentos” e “Remuneração e banco”. Você vê só as abas do seu nível.',
          lado: 'bottom',
        },
        {
          alvo: 'rh.editar',
          titulo: 'Editar a ficha',
          texto: '“Editar ficha” muda o cadastro e o contrato. Mudança de cargo, setor, gestor, vínculo ou jornada entra no histórico com a data de vigência.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'rh.dar-acesso',
          titulo: 'Acesso ao Palácio Virtual',
          texto: 'Só administradores, em quem ainda não tem login: “Dar acesso e mandar o convite” cria a conta já ligada a esta ficha e manda o link da senha pelo WhatsApp e/ou por e-mail.',
          seAusente: 'pular',
        },
        {
          alvo: 'rh.pedir-ficha',
          titulo: 'A pessoa completa a ficha',
          texto: 'Na aba “Pessoal”, “Mandar pelo WhatsApp” manda à pessoa um link pessoal para ela completar os próprios dados, sem login. Vale uma vez e por 7 dias.',
          seAusente: 'pular',
        },
        {
          alvo: 'rh.situacao',
          titulo: 'Afastamento e desligamento',
          texto: '“Registrar afastamento”, “Registrar retorno”, “Reativar” e “Desligar” entram no histórico com a data. A ficha nunca é apagada.',
          seAusente: 'pular',
        },
        {
          titulo: 'Dados abertos sob demanda',
          texto: 'Documentos, dados bancários e remuneração ficam guardados em sigilo e só aparecem quando você toca em “Ver…”. Cada abertura fica registrada com o seu nome.',
        },
      ],
    },
    {
      caminho: '/equipe/novo',
      rotulo: 'Nova pessoa na equipe',
      tour: [
        {
          titulo: 'Uma ficha nova',
          texto: 'Só o nome é obrigatório; o resto dá para completar depois. As seções de documentos e de dados bancários aparecem só para quem tem esses níveis.',
        },
        {
          alvo: 'rh.login',
          titulo: 'Ligar ao login',
          texto: '“Login no Palácio Virtual” liga a ficha à conta da pessoa, se ela tiver. Assim o e-mail e o telefone de trabalho aparecem sozinhos no perfil dela.',
        },
        {
          alvo: 'rh.vinculo',
          titulo: 'Contrato e cargo',
          texto: 'Vínculo, cargo, setor, admissão e jornada. O tempo de casa é contado pela data de admissão, que também abre o histórico.',
        },
        {
          alvo: 'rh.gestor',
          titulo: 'Gestor direto',
          texto: 'É o que monta o organograma. Quem fica sem gestor e sem ninguém abaixo aparece à parte, em “Sem gestor definido”.',
        },
        {
          alvo: 'rh.salvar',
          titulo: 'Cadastrar',
          texto: '“Cadastrar” cria a ficha e já abre a página dela.',
          lado: 'top',
        },
      ],
    },
    {
      caminho: '/equipe/[id]/editar',
      rotulo: 'Editar ficha',
      tour: [
        {
          titulo: 'Editar a ficha',
          texto: 'Documentos e dados bancários guardados não voltam preenchidos: sem tocar em “Abrir para editar”, eles continuam como estão ao salvar.',
        },
        {
          alvo: 'rh.vigencia',
          titulo: 'Quando a mudança vale',
          texto: 'Mudou cargo, setor, gestor, vínculo ou jornada? “Vigência da mudança” é a data que vai para o histórico; em branco, vale hoje.',
        },
        {
          alvo: 'rh.login',
          titulo: 'Ligar ao login',
          texto: '“Login no Palácio Virtual” liga a ficha à conta da pessoa. A lista mostra só os logins que ainda não estão ligados a outra ficha.',
        },
        {
          alvo: 'rh.salvar',
          titulo: 'Salvar',
          texto: '“Salvar alterações” grava e volta para a ficha.',
          lado: 'top',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'pessoa-completa-a-ficha',
      titulo: 'Pedir para a pessoa completar a própria ficha',
      exemplo: 'A Carla entrou ontem: o RH manda o link, ela preenche endereço e contato de emergência no celular e o RH é avisado no sino.',
      passos: [
        'Abra a ficha da pessoa e vá à aba “Pessoal”. Embaixo aparece o que falta.',
        'Quem tem acesso a documentos pode marcar “Pedir também os números dos documentos”.',
        'Toque em “Mandar pelo WhatsApp”. O link vai para o WhatsApp que a pessoa confirmou no Palácio ou, se não houver, para o telefone pessoal da ficha. Sem celular, use “Só gerar o link” e mande como quiser.',
        'Quando ela enviar, você recebe “… completou a ficha” no sino. Se não enviar, o Palácio lembra 2 dias depois, no máximo duas vezes, com um link novo.',
      ],
      dica: 'O link vale uma vez e por 7 dias; pedir de novo cancela o anterior. Ele nunca mostra o que já está guardado, campo em branco não apaga nada, e dados bancários, cargo e salário não vão por ele.',
    },
    {
      id: 'cadastrar-ficha',
      titulo: 'Cadastrar uma pessoa na equipe',
      exemplo: 'A ficha da Joana Lima é cadastrada: técnica de enfermagem, CLT, início em 01/10/2026, setor Saúde.',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Recursos humanos, toque em “Nova pessoa”.',
        'Preencha o “Nome completo” (o único campo obrigatório) e, se houver, o “Nome social”.',
        'Em “Login no Palácio Virtual”, escolha a conta da pessoa, se ela tiver.',
        'Em “Contrato e cargo”, escolha “Vínculo”, “Cargo”, “Setor”, “Gestor direto” e a data de “Admissão”.',
        'Complete os “Dados pessoais” que tiver à mão.',
        'Toque em “Cadastrar”.',
      ],
      dica: 'Se a pessoa também vai usar o Palácio Virtual, é mais rápido começar pelo Diretório, em “Adicionar pessoas”: o convite de acesso já cria a ficha. Para quem já tem ficha, um administrador dá o acesso no quadro “Acesso ao Palácio Virtual” da própria ficha.',
    },
    {
      id: 'dar-acesso-pela-ficha',
      titulo: 'Dar acesso ao Palácio Virtual a partir da ficha',
      exemplo: 'A ficha da Joana já existe; a administração abre a ficha, confere o WhatsApp dela e manda o convite: a Joana cria a senha pelo link e a conta já nasce ligada à ficha.',
      quem: 'Só administradores',
      passos: [
        'Abra a ficha da pessoa, na aba “Contrato e cargo”.',
        'No quadro “Acesso ao Palácio Virtual”, confira o “WhatsApp” (vem do telefone pessoal da ficha) e/ou o “E-mail”, o “Setor” e o “Papel”.',
        'Se faltar algo na ficha, deixe marcado “Pedir, na mesma mensagem do WhatsApp, que a pessoa complete a ficha”.',
        'Toque em “Dar acesso e mandar o convite”.',
      ],
      dica: 'O quadro só aparece para quem ainda não tem login e não foi desligado. O link da senha vale 72 horas; se vencer, reenvie em “Adicionar pessoas”, em “Convites pendentes”.',
    },
    {
      id: 'trazer-lista',
      titulo: 'Criar as fichas de quem está na lista dos setores',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Recursos humanos, toque em “Trazer … da lista de setores” (o número é de quem ainda não tem ficha).',
        'Espere o recado de quantas fichas foram criadas.',
        'Abra cada ficha nova e complete o vínculo e a admissão.',
      ],
      dica: 'O botão só aparece quando há alguém da lista sem ficha. As fichas nascem com o setor e o cargo da lista e com o vínculo “Outro / a definir” (na Diretoria, “Estatutário (diretoria eleita)”). Quando há login com o mesmo nome, ele já vem ligado.',
    },
    {
      id: 'mudar-cargo',
      titulo: 'Registrar uma mudança de cargo, setor ou gestor',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra a ficha e toque em “Editar ficha”.',
        'Em “Contrato e cargo”, mude o que for preciso: “Cargo”, “Setor”, “Gestor direto”, “Vínculo” ou “Jornada semanal (horas)”.',
        'Em “Vigência da mudança”, ponha a data em que a mudança vale (em branco, vale hoje).',
        'Se quiser, explique em “Motivo da mudança”.',
        'Toque em “Salvar alterações”. A mudança aparece na aba “Histórico”.',
      ],
    },
    {
      id: 'afastar-desligar',
      titulo: 'Registrar afastamento, retorno ou desligamento',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra a ficha, na aba “Contrato e cargo”.',
        'No quadro “Situação”, toque em “Registrar afastamento”, “Registrar retorno”, “Reativar” ou “Desligar”.',
        'Confira a “Data”.',
        'No desligamento, escreva o “Motivo” (obrigatório); nos outros casos, se quiser, a “Observação (opcional)”.',
        'Confirme no botão da janela, que repete o nome da ação (por exemplo, “Desligar”).',
      ],
      dica: 'Desligar não apaga: a ficha fica guardada, marcada como desligada, com a data e o motivo, e entra no histórico.',
    },
    {
      id: 'guardar-arquivo',
      titulo: 'Guardar um arquivo na ficha (contrato, ASO, certificado)',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra a ficha e vá à aba “Arquivos”.',
        'Toque em “Adicionar arquivo” e em “Escolher arquivo” (PDF, JPG, PNG ou WEBP, até 20 MB).',
        'Escolha a “Categoria” e confira o “Título”.',
        'Preencha a “Data do documento” e, quando houver, “Válido até”.',
        'Toque em “Guardar”.',
      ],
      dica: '“ASO (exame ocupacional)”, “Atestado médico” e “Cópia de documento pessoal” pedem o nível “Documentos”. Com “Válido até”, o arquivo ganha selo de validade, e os vencidos ou que vencem em até 60 dias entram na contagem do topo de Recursos humanos.',
    },
    {
      id: 'excluir-arquivo',
      titulo: 'Excluir um arquivo enviado por engano',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Na aba “Arquivos” da ficha, toque na lixeira do arquivo.',
        'Escreva o “Motivo” (por exemplo, enviado na ficha errada).',
        'Toque em “Excluir”.',
      ],
      dica: 'O arquivo sai do armazenamento, mas fica registrado quem excluiu, quando e por quê, na lista de arquivos excluídos, no pé da aba.',
    },
    {
      id: 'ver-documentos',
      titulo: 'Ver ou corrigir CPF, RG e outros documentos',
      quem: 'Nível “Documentos” ou acima',
      passos: [
        'Abra a ficha e vá à aba “Documentos”.',
        'Toque em “Ver documentos”.',
        'Para incluir ou corrigir, toque em “Editar ficha” e vá à seção “Documentos”; se já houver documentos guardados, toque antes em “Abrir para editar”.',
        'Preencha os campos e toque em “Salvar alterações”.',
      ],
      dica: 'Cada abertura fica registrada com o seu nome. Sem “Abrir para editar”, os documentos guardados não mudam ao salvar a ficha.',
    },
    {
      id: 'registrar-remuneracao',
      titulo: 'Registrar salário e benefícios',
      quem: 'Nível “Remuneração e banco” ou administradores',
      passos: [
        'Abra a ficha e vá à aba “Remuneração e banco”.',
        'Toque em “Ver remuneração” e depois em “Registrar remuneração”.',
        'Preencha “Vigência”, “Motivo” e “Salário base (R$)”.',
        'Em “Benefícios”, ponha um por linha, com valor se houver (ex.: “Vale-refeição: 600,00”).',
        'Toque em “Registrar”.',
      ],
      dica: 'A remuneração em vigor é a de vigência mais recente até hoje; uma de data futura aparece como “(futura)”. Registro lançado por engano sai pela lixeira ao lado dele.',
    },
    {
      id: 'dar-acesso-rh',
      titulo: 'Liberar Recursos humanos para alguém',
      quem: 'Só administradores',
      passos: [
        'Em Recursos humanos, abra a aba “Quem acessa”.',
        'Ache a pessoa na lista.',
        'Escolha o nível: “Ver a equipe”, “Gerenciar”, “Documentos” ou “Remuneração e banco” (ou “Sem acesso”, para tirar).',
      ],
      dica: 'A mudança vale na hora e fica no “Registro de acessos e mudanças”, na mesma aba.',
    },
    {
      id: 'exportar-rh',
      titulo: 'Exportar a planilha da equipe',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Recursos humanos, escolha o vínculo, a situação e o setor, se quiser, e toque em “Filtrar”.',
        'Toque em “Exportar”.',
        'Abra o arquivo baixado no Excel ou em outra planilha.',
      ],
      dica: 'A planilha leva contrato, cargo e contato de trabalho, sem documentos, salários nem banco. A busca por texto não entra no filtro da planilha, e cada exportação fica registrada.',
    },
  ],
  perguntas: [
    {
      id: 'link-da-ficha-seguro',
      pergunta: 'O link da ficha é seguro? E se a pessoa repassar?',
      resposta: 'O link é pessoal, vale uma vez e por 7 dias, e só grava: não mostra nada do que já está na ficha (cada campo diz só “já preenchido”). Dados bancários, cargo, vínculo e salário não vão por ele — conta bancária por link abriria a porta para desviar o pagamento de alguém. Tudo o que chega fica na auditoria como “pela própria pessoa”, e os documentos são guardados cifrados, como quando o RH digita.',
      termos: ['link da ficha', 'completar a ficha', 'autopreenchimento', 'whatsapp', 'seguro'],
    },
    {
      id: 'sem-acesso-rh',
      pergunta: 'Por que aparece “Você ainda não tem acesso a Recursos humanos”?',
      resposta: 'Recursos humanos guarda contrato, documentos e remuneração, e é liberado pessoa a pessoa. Peça a um administrador, que escolhe o seu nível na aba “Quem acessa”.',
      termos: ['cadeado', 'bloqueado', 'sem permissão', 'RH'],
    },
    {
      id: 'niveis-rh',
      pergunta: 'O que cada nível de acesso deixa ver?',
      resposta: '“Ver a equipe”: nome, cargo, setor, gestor e contato de trabalho. “Gerenciar”: cadastrar e editar; dados pessoais, contrato, histórico e arquivos.\n\n“Documentos”: tudo isso, mais CPF, RG, PIS, CTPS e os arquivos de saúde (ASO e atestados). “Remuneração e banco”: tudo, mais salários, benefícios e dados bancários.',
      termos: ['nível', 'permissão', 'acesso', 'RH'],
    },
    {
      id: 'diferenca-diretorio',
      pergunta: 'Qual a diferença entre Recursos humanos e o Diretório?',
      resposta: 'O Diretório é para achar e falar com as pessoas, e toda a equipe vê. Recursos humanos é a ficha de trabalho da equipe contratada, com contrato, histórico e dados pessoais, e só quem tem o acesso liberado abre.',
      termos: ['equipe', 'pessoas', 'ficha'],
    },
    {
      id: 'voluntario-aqui',
      pergunta: 'Quem é voluntário entra em Recursos humanos?',
      resposta: 'Não. O voluntariado (vínculos “Voluntário”, “Juventude” e “Instrutor voluntário”) fica em Voluntários, com dados e acessos próprios. Aqui fica quem tem vínculo de trabalho com a filial: CLT, estágio, prestador, temporário, cedido e a diretoria eleita.',
      termos: ['voluntariado', 'juventude', 'instrutor'],
    },
    {
      id: 'desligado-sumiu',
      pergunta: 'Desliguei alguém e a ficha sumiu da lista. Foi apagada?',
      resposta: 'Não. A lista mostra “Ativos e afastados” por padrão. No filtro que mostra “Ativos e afastados”, escolha “Desligado” ou “Todas” e toque em “Filtrar”: a ficha continua lá, com a data e o motivo.',
      termos: ['sumiu', 'desligado', 'apagou', 'demitido'],
    },
    {
      id: 'desfazer-desligamento',
      pergunta: 'Dá para desfazer um desligamento?',
      resposta: 'Dá. Na ficha, no quadro “Situação”, toque em “Reativar”. A reativação também entra no histórico, com a data.',
      termos: ['reativar', 'readmitir', 'voltar'],
    },
    {
      id: 'organograma-sem-gestor',
      pergunta: 'Por que alguém aparece em “Sem gestor definido”?',
      resposta: 'O organograma é montado pelo gestor direto de cada ficha. Quem não tem gestor nem ninguém abaixo fica nesse quadro à parte. Defina o “Gestor direto” em “Editar ficha”.',
      termos: ['organograma', 'hierarquia', 'chefe'],
    },
    {
      id: 'vencendo',
      pergunta: 'O que conta em “arquivos vencidos ou vencendo”?',
      resposta: 'Arquivos da ficha com “Válido até” preenchido — ASO, certificados, cópias de documento — que já venceram ou vencem nos próximos 60 dias, só de quem não está desligado. O número aparece para quem gerencia e conta só o que o seu nível deixa ver: ASO e cópias de documento entram a partir do nível “Documentos”.',
      termos: ['ASO', 'validade', 'vencido', 'exame'],
    },
    {
      id: 'sem-admissao',
      pergunta: 'O que são as “fichas sem admissão ou vínculo”?',
      resposta: 'Fichas de quem não está desligado sem data de admissão ou com o vínculo “Outro / a definir”. Acontece com as fichas trazidas da lista de setores: abra cada uma e complete.',
      termos: ['admissão', 'vínculo', 'incompleta'],
    },
    {
      id: 'documentos-em-branco',
      pergunta: 'Abri “Editar ficha” e os documentos estão em branco. Perdi os dados?',
      resposta: 'Não. Documentos e dados bancários guardados não voltam preenchidos: a seção aparece fechada, com “Abrir para editar”. Sem abrir, o que está guardado não muda ao salvar.',
      termos: ['CPF sumiu', 'banco em branco', 'cifrado'],
    },
    {
      id: 'quem-abriu',
      pergunta: 'Dá para saber quem abriu os dados de alguém?',
      resposta: 'Dá, para administradores: a aba “Quem acessa” tem o “Registro de acessos e mudanças”, com quem criou e editou fichas, abriu documentos, remuneração ou arquivos, mudou acessos e exportou a planilha.',
      termos: ['auditoria', 'registro', 'log', 'quem viu'],
    },
    {
      id: 'ficha-e-login',
      pergunta: 'Para que serve ligar a ficha ao login?',
      resposta: 'Liga a ficha à conta da pessoa no Palácio Virtual. Com isso, o e-mail e o telefone de trabalho da ficha aparecem sozinhos nos contatos institucionais do perfil dela, e o nome social e o cargo da ficha passam a valer no perfil.\n\nQuem recebe acesso por “Adicionar pessoas” ou pelo quadro “Acesso ao Palácio Virtual” da ficha já fica ligado; não precisa fazer nada.',
      termos: ['login', 'conta', 'duplicado', 'Login no Palácio Virtual'],
    },
    {
      id: 'apagar-ficha',
      pergunta: 'Dá para apagar uma ficha?',
      resposta: 'Não há botão para apagar. Quem sai da filial é desligado: a ficha fica guardada, marcada como desligada, com a data e o motivo.',
      termos: ['excluir ficha', 'apagar pessoa'],
    },
  ],
  relacionadas: ['/pessoas', '/usuarios', '/voluntariado'],
}

// ---------------------------------------------------------------- Voluntários

const VOLUNTARIOS: GuiaDaArea = {
  href: '/voluntariado',
  paraQueServe: 'O cadastro do Voluntariado (vínculos “Voluntário”, “Juventude” e “Instrutor voluntário”), com formações e horas. Daqui a coordenação aprova as inscrições do formulário público e cuida do que aparece na Área do Voluntário: avisos, banners, oportunidades, cursos, apostilas e certificados.',
  quemUsa: 'O acesso é liberado pessoa a pessoa por um administrador: “Ver a lista”; “Gerenciar” (cadastrar, verificar e aprovar inscrições, registrar horas e formações, exportar, cuidar de avisos, oportunidades e cursos); e “Dados sensíveis” (abrir CPF, saúde e o documento do candidato, e apagar dados a pedido do titular). Administradores têm tudo.',
  naPratica: {
    titulo: 'De inscrição no site a voluntário com certificado',
    passos: [
      'O Lucas se inscreve pelo formulário do site para ser voluntário.',
      'A coordenação pede os documentos pelo link: ele manda a foto do RG, o atestado de antecedentes e duas referências; o Palácio lê o documento, consulta a CGU e mostra o que confere.',
      'A coordenação conclui a verificação como “apto” e aprova a inscrição; ele recebe o convite para a Área do Voluntário.',
      'Lá, ele se candidata à oportunidade “Ação de prevenção na Central” e faz o curso de primeiros socorros.',
      'A coordenação marca a presença dele na ação e registra as horas.',
      'Com o curso concluído, o certificado aparece na Área do Voluntário, verificável por código.',
    ],
    resultado: 'O voluntário tem tudo num lugar só, e a coordenação sabe quem fez o quê e por quantas horas.',
  },
  tour: [
    {
      titulo: 'O cadastro do Voluntariado',
      texto: 'Todo o voluntariado, inclusive juventude e instrução voluntária. CPF e saúde ficam em sigilo, e cada abertura é registrada. A equipe contratada fica em Recursos humanos.',
    },
    {
      alvo: 'voluntarios.atalhos',
      titulo: 'A Área do Voluntário',
      texto: 'Daqui você cuida do que aparece do outro lado: “Oportunidades”, “Cursos e apostilas” e “Diplomas” e, para quem gerencia, “Mensagens” e “Avisos”.',
      seAusente: 'pular',
    },
    {
      alvo: 'voluntarios.numeros',
      titulo: 'Os números',
      texto: 'Ativos, inscrições pendentes, horas de voluntariado no mês e formações vencidas ou que vencem nos próximos 60 dias.',
      seAusente: 'pular',
    },
    {
      alvo: 'voluntarios.abas',
      titulo: 'Cadastro e inscrições',
      texto: '“Voluntários” é o cadastro. “Inscrições pendentes” são as que chegaram pelo formulário público e esperam aprovação. “Fotos do crachá” são as fotos que os voluntários enviaram e esperam a sua aprovação. “Quem acessa” aparece só para administradores.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'voluntarios.filtros',
      titulo: 'Buscar e filtrar',
      texto: 'Busque por nome, e-mail, telefone, função ou cidade, filtre por vínculo, situação e setor e toque em “Filtrar”. O nome abre o cadastro.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'voluntarios.link',
      titulo: 'Link de inscrição',
      texto: '“Copiar link de inscrição” copia o endereço do formulário público. Quem se inscreve por ele cai em “Inscrições pendentes”.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'voluntarios.cartaz',
      titulo: 'Cartaz com QR',
      texto: '“Cartaz com QR” imprime o cartaz de inscrição (o QR abre o formulário público: para o mural, eventos e parceiros) ou o da Área do Voluntário (para quem já é). Escolha a chamada entre as escritas para cada um, ou escreva a sua.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'voluntarios.novo',
      titulo: 'Cadastrar direto',
      texto: '“Novo voluntário” cadastra alguém pela equipe, já como ativo. “Ver Área do Voluntário” abre a área como quem é voluntário a veria, só para ler.',
      lado: 'bottom',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/voluntariado/[id]',
      rotulo: 'Cadastro no Voluntariado',
      tour: [
        {
          alvo: 'voluntarios.foto',
          titulo: 'O cadastro de uma pessoa',
          texto: 'No alto, a foto de perfil (ou as iniciais), o nome e a situação. Abaixo, dados, formações e horas, a Área do Voluntário e os dados sensíveis.',
          lado: 'bottom',
        },
        {
          alvo: 'voluntarios.editar',
          titulo: 'Editar o cadastro',
          texto: '“Editar cadastro” muda dados, contato, setores, saúde e perfil de voluntariado. Cadastro com dados apagados (LGPD) não se edita mais.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.verificacao',
          titulo: 'Verificação do candidato',
          texto: '“Pedir documentos” manda um link pessoal: a pessoa aceita o termo e envia documento com foto, atestado de antecedentes e referências. Aqui a coordenação confere item a item, consulta a CGU e decide: apto, apto com restrição ou não apto.',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.formacoes',
          titulo: 'Formações e certificados',
          texto: '“Adicionar formação” registra um curso, com validade se houver. Certificado de curso da Área do Voluntário entra aqui sozinho.',
        },
        {
          alvo: 'voluntarios.horas',
          titulo: 'Horas de voluntariado',
          texto: '“Registrar horas” lança data, horas e atividade. Presença marcada numa oportunidade também vira horas aqui, sozinha.',
        },
        {
          alvo: 'voluntarios.foto-do-cracha',
          titulo: 'Foto do crachá',
          texto: 'A foto que o voluntário envia só vai para o crachá depois que o Voluntariado aprova. “Aprovar” libera; “Recusar” pede o motivo, que vai para o voluntário por e-mail. A foto que você mesmo põe em “Editar cadastro” já sai aprovada.',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.diplomas',
          titulo: 'Diplomas de reconhecimento',
          texto: 'Aos 100, 500 e 1.000 horas, o diploma sai sozinho. “Conceder diploma” homenageia um serviço especial, com o motivo que vai impresso. “Cancelar” tira a validade, e a verificação pública passa a mostrar “cancelado”. “Todos os diplomas” abre a área onde se emite para vários de uma vez e se imprime tudo num PDF.',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.area',
          titulo: 'Área do Voluntário',
          texto: 'Mostra o último acesso. “Enviar convite por e-mail” manda o caminho de entrada; “Ver como este voluntário” abre a área da pessoa só para leitura, e isso fica registrado.',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.sensiveis',
          titulo: 'CPF e saúde',
          texto: 'Só quem tem o nível “Dados sensíveis” abre, em “Ver CPF e saúde”. Cada abertura fica registrada com o nome de quem abriu.',
        },
        {
          alvo: 'voluntarios.situacao',
          titulo: 'Situação',
          texto: 'Aprovar a inscrição, marcar como inativo, reativar ou desligar. “Apagar dados (LGPD)” atende ao pedido do titular e não tem volta.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/voluntariado/novo',
      rotulo: 'Novo voluntário',
      tour: [
        {
          titulo: 'Cadastrar alguém',
          texto: 'Só o nome é obrigatório. Quem é cadastrado pela equipe já entra como ativo, sem passar por “Inscrições pendentes”.',
        },
        {
          alvo: 'voluntarios.cpf',
          titulo: 'CPF',
          texto: 'Fica guardado em sigilo e aparece mascarado, com asteriscos. Depois de guardado, deixe o campo em branco para manter o que está lá.',
        },
        {
          alvo: 'voluntarios.setores',
          titulo: 'Setores',
          texto: 'Marque um ou mais setores em que a pessoa atua. São eles que o filtro de setor da lista usa.',
        },
        {
          alvo: 'voluntarios.responsavel',
          titulo: 'Menores de idade',
          texto: 'Para menores de 18 anos, preencha “Responsável legal” e “Telefone do responsável”: o cadastro mostra um aviso de menor de idade com esses dados.',
        },
        {
          alvo: 'voluntarios.saude',
          titulo: 'Saúde',
          texto: 'Tipo sanguíneo e restrições são dado sensível: ficam em sigilo, e só quem tem “Dados sensíveis” vê.',
        },
        {
          alvo: 'voluntarios.salvar',
          titulo: 'Cadastrar',
          texto: '“Cadastrar” grava e abre o cadastro, onde você registra formações e horas.',
          lado: 'top',
        },
      ],
    },
    {
      caminho: '/voluntariado/[id]/editar',
      rotulo: 'Editar cadastro',
      tour: [
        {
          titulo: 'Editar o cadastro',
          texto: 'Mude o que for preciso e toque em “Salvar alterações”. CPF e saúde guardados não voltam preenchidos, para não aparecerem na tela.',
        },
        {
          alvo: 'voluntarios.foto-editar',
          titulo: 'Foto de perfil',
          texto: '“Escolher foto” (ou “Trocar foto”) e “Remover” valem na hora, sem o “Salvar alterações”. O voluntário também troca a própria foto pela Área do Voluntário.',
        },
        {
          alvo: 'voluntarios.cpf',
          titulo: 'CPF',
          texto: 'O CPF guardado aparece mascarado acima do campo. Deixe em branco para manter; digite outro só para trocar.',
        },
        {
          alvo: 'voluntarios.saude',
          titulo: 'Saúde',
          texto: 'Com dados de saúde guardados, aparece “Há dados de saúde guardados.” Toque em “Substituir” só se for trocar.',
        },
        {
          alvo: 'voluntarios.salvar',
          titulo: 'Salvar',
          texto: '“Salvar alterações” grava e volta para o cadastro.',
          lado: 'top',
        },
      ],
    },
    {
      caminho: '/voluntariado/avisos',
      rotulo: 'Avisos aos voluntários',
      tour: [
        {
          titulo: 'O mural dos voluntários',
          texto: 'Os avisos aparecem no início da Área do Voluntário, com a marca de novo até cada pessoa ver. São recados para todo o voluntariado ativo.',
        },
        {
          alvo: 'voluntarios.mural',
          titulo: 'Publicar um aviso',
          texto: 'Escreva o título e o recado e toque em “Publicar aviso”. “Fixar no alto” segura o aviso em cima; “Sai do mural em” programa a saída.',
        },
        {
          titulo: 'E-mail e leitura',
          texto: '“Enviar também por e-mail” manda o aviso uma vez só a quem está ativo, tem e-mail e não saiu da lista de avisos por e-mail. Cada aviso mostra quantos já viram.',
        },
      ],
    },
    {
      caminho: '/voluntariado/banners',
      rotulo: 'Banners da Área do Voluntário',
      tour: [
        {
          titulo: 'Os destaques do voluntariado',
          texto: 'Os banners aparecem no alto do Início da Área do Voluntário, para todo o voluntariado: campanhas, agradecimentos, chamadas e fotos das ações. Com mais de um no ar, eles se revezam.',
        },
        {
          alvo: 'voluntarios.banner-novo',
          titulo: 'Publicar um banner',
          texto: 'Envie a imagem (larga, 1680×640, com o assunto no centro e sem texto escrito nela), dê um título e, se quiser, uma frase e um botão. O botão leva a uma página da Área do Voluntário (/membro/…) ou a um endereço https://.',
        },
        {
          alvo: 'voluntarios.banners-lista',
          titulo: 'Período e ordem',
          texto: '“De” e “até” programam quando o banner fica no ar; sem datas, fica enquanto estiver ligado. A ordem menor aparece primeiro. “Desligar” tira do ar sem apagar.',
        },
      ],
    },
    {
      caminho: '/voluntariado/diplomas',
      rotulo: 'Diplomas de Reconhecimento',
      tour: [
        {
          titulo: 'Os diplomas num lugar só',
          texto: 'Aqui ficam todos os Diplomas de Reconhecimento da filial, no modelo oficial aprovado, com código de verificação. Aos 100, 500 e 1.000 horas registradas o diploma sai sozinho; a coordenação também homenageia quem quiser.',
        },
        {
          alvo: 'diplomas.emitir',
          titulo: 'Emitir para vários de uma vez',
          texto: 'Marque os voluntários (a busca e “Marcar os da lista” ajudam com uma turma inteira), escreva o motivo e toque em “Emitir”. Cada pessoa recebe o seu diploma, com código próprio, e ele aparece na Área do Voluntário. Até 100 por vez.',
          seAusente: 'pular',
        },
        {
          alvo: 'diplomas.motivo',
          titulo: 'O motivo vai impresso',
          texto: 'O texto entra no diploma depois de “em agradecimento aos relevantes serviços prestados à Cruz Vermelha Brasileira”. A prévia logo abaixo mostra como fica.',
          seAusente: 'pular',
        },
        {
          alvo: 'diplomas.perto',
          titulo: 'Perto do próximo diploma',
          texto: 'Quem está a menos de 20% dos 100, 500 ou 1.000 horas. Bom para preparar a cerimônia: o diploma sai sozinho quando as horas chegarem.',
          seAusente: 'pular',
        },
        {
          alvo: 'diplomas.assinaturas',
          titulo: 'Quem assina',
          texto: 'Até três assinaturas lado a lado no pé do diploma: a presidência e, se quiserem, a vice-presidência e a coordenação do Voluntariado. “Alterar” muda a lista (quem gerencia o Voluntariado); “Ver exemplo em PDF” mostra como fica. Cada diploma guarda quem assinava no dia em que saiu.',
        },
        {
          alvo: 'diplomas.lista',
          titulo: 'Imprimir de uma vez',
          texto: 'Marque os diplomas e toque em “Baixar em um PDF”: sai um arquivo com uma página A3 por diploma, pronto para a gráfica. “PDF” abre um só; o ícone ao lado abre a verificação pública; o “x” cancela, com motivo.',
        },
      ],
    },
    {
      caminho: '/voluntariado/oportunidades',
      rotulo: 'Oportunidades',
      tour: [
        {
          titulo: 'Oportunidades',
          texto: 'Ações, plantões e eventos em que o voluntariado se inscreve pela Área do Voluntário. Presença confirmada vira horas no cadastro.',
        },
        {
          alvo: 'voluntarios.oportunidades-abas',
          titulo: 'Próximas e passadas',
          texto: '“Próximas” mostra o que ainda não terminou; “Passadas”, o que já acabou, com quantos estiveram presentes.',
          lado: 'bottom',
        },
        {
          alvo: 'voluntarios.oportunidades-lista',
          titulo: 'Cada oportunidade',
          texto: 'Tipo, dia, local, inscritos, vagas e lista de espera. O ícone de olho mostra se está publicada ou em rascunho; cancelada aparece riscada.',
        },
        {
          alvo: 'voluntarios.nova-oportunidade',
          titulo: 'Nova oportunidade',
          texto: '“Nova oportunidade” cria uma atividade como rascunho: ela só aparece na Área do Voluntário depois de publicada.',
          lado: 'bottom',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/voluntariado/oportunidades/nova',
      rotulo: 'Nova oportunidade',
      tour: [
        {
          titulo: 'Criar uma oportunidade',
          texto: 'Título, tipo, local, início e fim. Ela nasce como rascunho; publique quando estiver pronta.',
        },
        {
          alvo: 'voluntarios.tipo-oportunidade',
          titulo: 'Tipo',
          texto: '“Para se inscrever”: ação, plantão, evento, formação. “Para responder”: aviso para confirmar, enquete / formulário e quiz. Nestes, somem vagas e horas e aparece o prazo para responder.',
        },
        {
          alvo: 'voluntarios.vagas',
          titulo: 'Vagas',
          texto: 'Em branco, sem limite. Quando lota, quem se inscreve vai para a lista de espera e sobe sozinho quando abre vaga.',
        },
        {
          alvo: 'voluntarios.horas-presenca',
          titulo: 'Horas por presença',
          texto: 'As horas que vão para o cadastro de quem estiver presente. Em branco, vale a duração da atividade.',
        },
        {
          alvo: 'voluntarios.perguntas',
          titulo: 'Perguntas',
          texto: 'Escolha única, várias escolhas, sim ou não, ou resposta curta. Numa ação, o voluntário responde ao se inscrever; no quiz, marque a resposta certa de cada uma.',
        },
        {
          alvo: 'voluntarios.salvar-oportunidade',
          titulo: 'Criar',
          texto: '“Criar (como rascunho)” grava e abre a oportunidade, onde fica o botão “Publicar”.',
          lado: 'top',
        },
      ],
    },
    {
      caminho: '/voluntariado/oportunidades/[id]',
      rotulo: 'Uma oportunidade',
      tour: [
        {
          titulo: 'Uma oportunidade',
          texto: 'A lista de quem se inscreveu, a publicação e os dados da atividade, num lugar só.',
        },
        {
          alvo: 'voluntarios.publicacao',
          titulo: 'Publicar ou cancelar',
          texto: '“Publicar” mostra a atividade na Área do Voluntário e, na primeira vez, manda pelo WhatsApp aos voluntários que autorizaram. “Cancelar atividade” pede o motivo e avisa por e-mail quem se inscreveu e quem está na espera. “Excluir” só aparece sem inscrições.',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.respostas',
          titulo: 'Respostas',
          texto: 'O resumo de cada pergunta (quantos votos e o percentual de cada opção) e a resposta de cada pessoa. No aviso, quantos confirmaram; no quiz, a nota. “Planilha (CSV)” baixa tudo.',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.inscritos',
          titulo: 'Inscritos e presença',
          seAusente: 'pular',
          texto: 'A partir do início da atividade, marque “Presente” ou “Ausente”. Presente lança as horas no cadastro; Ausente tira as que tinham sido lançadas.',
        },
        {
          alvo: 'voluntarios.vagas',
          titulo: 'Mudar as vagas',
          texto: 'Aumentou as vagas ou tirou o limite? Quem estava na lista de espera sobe, por ordem de chegada, e recebe um e-mail.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/voluntariado/cursos',
      rotulo: 'Cursos e apostilas',
      tour: [
        {
          titulo: 'Cursos e apostilas',
          texto: 'O que se estuda na Área do Voluntário: cursos com vídeos do YouTube (não listados), apostilas em PDF e o certificado, que sai sozinho ao concluir.',
        },
        {
          alvo: 'voluntarios.cursos-abas',
          titulo: 'Três abas',
          texto: '“Cursos”, “Apostilas” e “Certificados”, cada uma com a contagem ao lado.',
          lado: 'bottom',
        },
        {
          alvo: 'voluntarios.novo-curso',
          titulo: 'Novo curso',
          texto: '“Novo curso” pede só o nome. O curso nasce como rascunho; depois você monta módulos, aulas e, se quiser, a prova.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.cursos-grade',
          titulo: 'Os cursos',
          texto: 'Na aba “Cursos”, cada cartão mostra se o curso está publicado, quantas aulas tem, quantas pessoas começaram e quantas concluíram.',
        },
        {
          alvo: 'voluntarios.apostilas',
          titulo: 'Apostilas',
          texto: 'Na aba “Apostilas” ficam os PDFs, avulsos ou de um curso. Quem gerencia envia com “Nova apostila” (até 50 MB); o ícone de olho oculta ou mostra na Área do Voluntário.',
        },
        {
          alvo: 'voluntarios.certificados',
          titulo: 'Certificados',
          texto: 'Na aba “Certificados”: quem concluiu, o curso e o código, que abre a página pública de verificação. “Cancelar” revoga um certificado.',
        },
      ],
    },
    {
      caminho: '/voluntariado/cursos/[id]',
      rotulo: 'Editor de curso',
      tour: [
        {
          alvo: 'voluntarios.curso-dados',
          titulo: 'Dados do curso',
          texto: 'Título, resumo do cartão, descrição, carga horária, nota mínima na prova e validade do certificado. Toque em “Salvar” ao terminar.',
        },
        {
          alvo: 'voluntarios.curso-conteudo',
          titulo: 'Módulos e aulas',
          texto: 'Crie os módulos e, em cada um, use “Nova aula”: vídeo do YouTube (não listado), texto ou apostila. As setas mudam a ordem.',
        },
        {
          alvo: 'voluntarios.curso-prova',
          titulo: 'Prova final',
          texto: 'Opcional, e só vale com nota mínima. A prova é feita depois de concluir as aulas, com até 3 tentativas a cada 24 horas. “Nova questão” cria cada pergunta.',
        },
        {
          alvo: 'voluntarios.curso-publicacao',
          titulo: 'Publicar',
          texto: '“Publicar” pede pelo menos uma aula e, com nota mínima, questões na prova. Curso que já emitiu certificado não se exclui: despublique.',
        },
        {
          alvo: 'voluntarios.curso-capa',
          titulo: 'Capa',
          texto: '“Enviar capa” pede uma imagem 16:9 (ex.: 1280×720), JPG, PNG ou WEBP, até 5 MB. A capa aparece no cartão do curso.',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'aprovar-inscricao',
      titulo: 'Verificar e aprovar (ou recusar) uma inscrição',
      exemplo: 'A inscrição do Lucas Pereira chega do site. A coordenação toca em “Pedir documentos”; dois dias depois chega o aviso “Lucas enviou os documentos”. O Claude lê o RG e mostra que nome, nascimento e CPF conferem; a CGU responde “nada consta”; a Ana liga para as duas referências e registra “favorável”. Ela marca identidade e antecedentes como conferidos, conclui como “Apto” e aprova: ele recebe as boas-vindas por e-mail.',
      quem: 'Nível “Gerenciar” ou acima; identidade e antecedentes, “Dados sensíveis”',
      passos: [
        'Em Voluntários → “Inscrições pendentes”, toque no nome e vá ao quadro “Verificação do candidato”.',
        'Toque em “Pedir documentos” e escolha por onde mandar o link (e-mail, WhatsApp ou copiar). A pessoa aceita o termo e envia documento com foto, atestado de antecedentes e duas referências.',
        'Quando chegar o aviso, em “Identidade” toque em “Ler o documento com o Claude”, compare com o cadastro e com a foto do crachá e marque “Conferido” (ou “Divergente”).',
        'Em “Antecedentes”, valide o código no site da Polícia Civil e marque “Conferido”.',
        'Em “Sanções e pessoa exposta”, toque em “Consultar CEIS, CNEP, CEAF e PEP”; em “Referências”, registre o contato com cada pessoa; registre a entrevista.',
        'Em “Decisão”, escolha “Apto”, “Apto com restrição” (marque as restrições e o motivo) ou “Não apto”, e toque em “Concluir verificação”. Com “Aprovar a inscrição agora” marcado, a pessoa passa a “Ativo”.',
      ],
      dica: 'Sem identidade e antecedentes conferidos, “Aprovar” só funciona com a restrição “Não atua com crianças e adolescentes” e um motivo (Lei 14.811/2024). “Recusar” apaga a inscrição e os documentos. O atestado vale 90 dias e é renovado a cada 6 meses: a coordenação é avisada 15 dias antes e pede o novo pelo mesmo botão.',
    },
    {
      id: 'cadastrar-voluntario',
      titulo: 'Cadastrar alguém direto, sem o formulário público',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Novo voluntário”.',
        'Preencha o “Nome completo” (o único obrigatório) e o que tiver: nascimento, CPF, contato e endereço.',
        'Em “Vínculo com a filial”, escolha o “Vínculo”, preencha a “Função” e marque os “Setores”.',
        'Para menores de 18 anos, preencha “Responsável legal” e “Telefone do responsável”.',
        'Complete o “Perfil de voluntariado”: habilidades, idiomas e disponibilidade.',
        'Toque em “Cadastrar”.',
      ],
    },
    {
      id: 'trocar-foto-voluntario',
      titulo: 'Pôr, trocar ou tirar a foto de um voluntário',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'No cadastro da pessoa, toque em “Editar cadastro”.',
        'Em “Foto de perfil”, toque em “Escolher foto” (ou “Trocar foto”) e escolha a imagem.',
        'Espere o recado “Foto salva.” (ou “Foto trocada.”).',
        'Para tirar, toque em “Remover” e confirme em “Remover”.',
      ],
      dica: 'A foto é recortada em quadrado pelo centro e salva na hora, sem o “Salvar alterações”.',
    },
    {
      id: 'registrar-horas',
      titulo: 'Registrar horas ou uma formação no cadastro de alguém',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra o cadastro da pessoa.',
        'Horas: em “Horas de voluntariado”, toque em “Registrar horas”, preencha a data, as horas e a atividade (ex.: cobertura do Réveillon) e toque em “Salvar”.',
        'Formação: em “Formações e certificados”, toque em “Adicionar formação”, preencha o nome (ex.: Primeiros Socorros), a instituição se quiser, “Concluída em” e, se o certificado vencer, “Válida até”; toque em “Salvar”.',
      ],
      dica: 'Cada registro de horas vai de 0,25 a 24 horas, e a data não pode ser futura; o lançado por engano sai pela lixeira ao lado. Com “Válida até”, a formação ganha selo de validade, e as vencidas ou que vencem em até 60 dias entram na contagem do topo de Voluntários. Presença em oportunidade e curso da Área do Voluntário entram sozinhos.',
    },
    {
      id: 'convidar-area',
      titulo: 'Convidar alguém para a Área do Voluntário',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Confira que o cadastro está “Ativo” e tem e-mail.',
        'No quadro “Área do Voluntário” do cadastro, toque em “Enviar convite por e-mail”.',
        'A pessoa entra com o e-mail do cadastro e um código que recebe por e-mail.',
      ],
      dica: 'Só quem está “Ativo” entra na Área do Voluntário. Para ver o que a pessoa vê, use “Ver como este voluntário” (só leitura, e fica registrado).',
    },
    {
      id: 'desligar-voluntario',
      titulo: 'Marcar como inativo, desligar ou reativar',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra o cadastro da pessoa e vá ao quadro “Situação”.',
        'Toque em “Marcar como inativo”, “Desligar” ou “Reativar”.',
        'Para desligar, escreva o “Motivo” e confirme em “Desligar”.',
      ],
      dica: 'O cadastro desligado continua guardado, com o motivo, e pode ser reativado.',
    },
    {
      id: 'apagar-dados-lgpd',
      titulo: 'Apagar os dados a pedido do titular (LGPD)',
      quem: 'Nível “Dados sensíveis” ou administradores',
      passos: [
        'Abra o cadastro da pessoa e vá ao quadro “Situação”.',
        'Toque em “Apagar dados (LGPD)”.',
        'Escreva o “Motivo” e toque em “Apagar dados”.',
      ],
      dica: 'Não tem volta: nome, contatos, documentos, endereço, saúde e formações são apagados; ficam só vínculo, setores e horas, sem identificar ninguém.',
    },
    {
      id: 'publicar-aviso',
      titulo: 'Publicar um aviso ou um banner na Área do Voluntário',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Avisos” (um recado no mural) ou em “Banners” (uma imagem larga no Início da Área do Voluntário).',
        'Aviso: escreva o título e o recado; marque “Fixar no alto” se for importante, escolha a data em “Sai do mural em” se tiver prazo e marque “Enviar também por e-mail” se todo mundo precisa saber logo. Toque em “Publicar aviso”.',
        'Banner: toque em “Enviar imagem” (foto ou arte larga, 1680×640, com o assunto no centro e sem texto), escreva o título e, se quiser, uma frase de apoio. “Com botão” leva a uma página da Área do Voluntário (/membro/oportunidades) ou a um https://; “De” e “até” dão prazo. Toque em “Publicar banner”.',
      ],
      dica: 'O e-mail do aviso sai uma vez só, para quem está ativo, tem e-mail e não saiu da lista; cada aviso mostra quantos já viram. Banners: com mais de um no ar, eles se revezam no Início na ordem que você der (no máximo cinco); “Desligar” tira do ar sem apagar. Em ambos, o lápis edita e a lixeira exclui.',
    },
    {
      id: 'criar-oportunidade',
      titulo: 'Criar e publicar uma oportunidade',
      exemplo: 'A coordenação cria “Ação de prevenção na Central do Brasil — 26/09, 8h às 13h, 10 vagas”; os voluntários veem na Área do Voluntário e se inscrevem.',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Oportunidades” e depois em “Nova oportunidade”.',
        'Preencha “Título”, “Tipo”, “Local”, “Início” e “Fim”.',
        'Se houver limite, preencha “Vagas”; se as inscrições fecham antes do início, “Inscrições até”.',
        'Escreva a “Descrição”: o que vão fazer, o que levar, uniforme, pré-requisitos.',
        'Para perguntar algo na inscrição (“Tamanho da camiseta?”), em “Perguntas na inscrição” toque em “Pergunta” e escreva a pergunta com as alternativas.',
        'Toque em “Criar (como rascunho)”.',
        'Na oportunidade, toque em “Publicar”.',
      ],
      dica: 'O voluntário responde às perguntas antes de se inscrever; as respostas aparecem em “Respostas”, na própria oportunidade.',
    },
    {
      id: 'criar-pedido',
      titulo: 'Mandar um aviso para confirmar, uma enquete ou um quiz',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Oportunidades” e depois em “Nova oportunidade”.',
        'Em “Tipo”, escolha “Aviso para confirmar”, “Enquete / formulário” ou “Quiz”.',
        'Preencha o título, o “Texto” e o “Prazo para responder”. “Abre em” vazio abre assim que publicar.',
        'Em “Perguntas”, toque em “Pergunta” para cada uma e escolha o tipo. No quiz, marque a resposta certa e, se quiser, a “Nota mínima” (padrão 70).',
        'Toque em “Criar (como rascunho)” e, na oportunidade, em “Publicar”.',
      ],
      dica: 'Depois da primeira resposta, as perguntas e o tipo não mudam mais: mudar embaralharia o que já foi respondido. Precisa de outras perguntas? Crie outra.',
    },
    {
      id: 'marcar-presenca',
      titulo: 'Marcar presença ou cancelar uma oportunidade',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra a oportunidade.',
        'Presença, a partir do início da atividade: em “Inscritos”, confira as horas ao lado de cada pessoa e toque em “Presente” ou em “Ausente”. “Presente” lança as horas no cadastro; trocar para “Ausente” tira.',
        'Para cancelar: toque em “Cancelar atividade”, escreva o “Motivo” (ele vai no aviso) e toque em “Cancelar e avisar”.',
      ],
      dica: 'Ao cancelar uma oportunidade publicada, quem se inscreveu e quem estava na espera recebem um e-mail com o motivo; ela continua na lista, marcada como cancelada. “Excluir” só existe enquanto ninguém se inscreveu.',
    },
    {
      id: 'montar-curso',
      titulo: 'Montar e publicar um curso',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Cursos e apostilas” e em “Novo curso”; dê o nome e toque em “Criar”.',
        'Em “Dados do curso”, preencha o resumo, a descrição e a carga horária e toque em “Salvar”.',
        'Em “Conteúdo”, escreva o nome do primeiro módulo e toque em “Módulo”.',
        'No módulo, toque em “Nova aula”, dê o “Título da aula”, cole o link do vídeo do YouTube (não listado), escreva o texto ou escolha a apostila, e toque em “Adicionar aula”.',
        'Se quiser prova, preencha “Nota mínima na prova” (toque em “Salvar”) e crie as perguntas em “Prova final”, com “Nova questão”.',
        'Em “Capa”, toque em “Enviar capa”.',
        'Em “Publicação”, toque em “Publicar”.',
      ],
      dica: 'Sem nota mínima, o certificado sai ao concluir as aulas; com nota mínima, só depois de passar na prova.',
    },
    {
      id: 'publicar-apostila',
      titulo: 'Publicar uma apostila em PDF',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Cursos e apostilas” e abra a aba “Apostilas”.',
        'Toque em “Nova apostila” e em “Escolher PDF” (até 50 MB).',
        'Confira o “Título” e, se ela for de um curso, escolha-o em “Curso (opcional)”; senão, deixe “Apostila avulsa”.',
        'Toque em “Publicar apostila”.',
      ],
      dica: 'Ela já fica visível na Área do Voluntário; o ícone de olho oculta ou mostra de novo. Para usar numa aula, escolha a apostila em “Apostila da aula (opcional)”.',
    },
    {
      id: 'assinaturas-do-diploma',
      titulo: 'Escolher quem assina os diplomas',
      exemplo: 'Para a cerimônia de dezembro, a coordenação quer o diploma assinado pelo presidente, pelo vice e pela coordenação do Voluntariado: acrescenta os dois em “Quem assina” e confere no PDF de exemplo.',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Todos os diplomas” e desça até “Quem assina”.',
        'Toque em “Alterar”.',
        'Toque em “Vice-Presidente” ou em “Coordenação de Voluntariado” para acrescentar, ou em “Outra pessoa” para escrever nome e cargo. O “x” tira uma assinatura.',
        'Toque em “Salvar” e depois em “Ver exemplo em PDF” para conferir.',
      ],
      dica: 'São no máximo três, para caber com folga no diploma. A lista vale para os diplomas emitidos daqui em diante: cada um guarda quem assinava no dia, mesmo que a diretoria mude depois. Os emitidos antes desta opção existir seguem a lista atual.',
    },
    {
      id: 'dar-acesso-voluntariado',
      titulo: 'Liberar o cadastro de voluntários para alguém',
      quem: 'Só administradores',
      passos: [
        'Em Voluntários, abra a aba “Quem acessa”.',
        'Ache a pessoa na lista.',
        'Escolha “Ver a lista”, “Gerenciar” ou “Dados sensíveis” (ou “Sem acesso”, para tirar).',
      ],
      dica: 'A mudança vale na hora e fica no “Registro de acessos e mudanças”, na mesma aba. Quem tem “Dados sensíveis” também vê a aba, mas só administradores mudam os níveis.',
    },
  ],
  perguntas: [
    {
      id: 'oportunidade-no-whatsapp',
      pergunta: 'Quem recebe a oportunidade pelo WhatsApp?',
      resposta: 'Na primeira vez que você toca em “Publicar”, a oportunidade vai pelo WhatsApp do Palácio aos voluntários ativos que confirmaram o número e marcaram a autorização na Área do Voluntário, com o link para se inscrever. Despublicar e publicar de novo não manda outra vez, e oportunidade que já começou ou com inscrição encerrada não é anunciada.\n\nSai aos poucos, no máximo 12 mensagens por minuto e nunca entre 22h e 7h: numa lista grande, os últimos recebem mais tarde. Se a oportunidade for cancelada antes, quem ainda não recebeu não recebe mais.',
      termos: ['whatsapp', 'anunciar oportunidade', 'mandar para os voluntários', 'divulgar'],
    },
    {
      id: 'sem-acesso-voluntarios',
      pergunta: 'Por que aparece “Você ainda não tem acesso a este cadastro”?',
      resposta: 'O cadastro de voluntários guarda dados pessoais e é liberado pessoa a pessoa. Peça a um administrador, que escolhe o seu nível na aba “Quem acessa”.',
      termos: ['cadeado', 'bloqueado', 'sem permissão', 'voluntariado'],
    },
    {
      id: 'niveis-voluntarios',
      pergunta: 'O que cada nível de acesso deixa fazer?',
      resposta: '“Ver a lista”: nome, vínculo, setores e contatos. “Gerenciar”: cadastrar, editar, pedir documentos e conduzir a verificação do candidato, aprovar inscrições, registrar horas e formações, exportar e cuidar de avisos, oportunidades e cursos.\n\n“Dados sensíveis”: tudo isso, mais abrir CPF e saúde, abrir o documento e o atestado do candidato (e conferir identidade e antecedentes) e apagar dados a pedido do titular. Só administradores mudam o nível de alguém.',
      termos: ['nível', 'permissão', 'acesso'],
    },
    {
      id: 'link-inscricao',
      pergunta: 'Onde está o link do formulário de inscrição?',
      resposta: 'Em Voluntários, “Copiar link de inscrição” copia o endereço, e “Cartaz com QR” imprime um cartaz A4 com esse endereço no código, para o mural, eventos e parceiros: escolha a chamada entre as escritas (“Tem um tempo? Seja voluntário.” e outras) ou escreva a sua. O mesmo cartaz tem a versão da Área do Voluntário, para quem já é. Os dois botões aparecem para quem gerencia.\n\nQuem se inscreve pelo formulário entra em “Inscrições pendentes”, e quem gerencia o Voluntariado recebe um aviso a cada inscrição nova.',
      termos: ['participe', 'formulário público', 'inscrever', 'divulgar', 'cartaz', 'qr code', 'imprimir'],
    },
    {
      id: 'status-voluntario',
      pergunta: 'O que significam “Inscrição pendente”, “Ativo”, “Inativo” e “Desligado”?',
      resposta: '“Inscrição pendente” chegou pelo formulário público e espera aprovação. Só quem está “Ativo” entra na Área do Voluntário.\n\n“Inativo” e “Desligado” continuam no cadastro e podem ser reativados; o desligamento guarda o motivo.',
      termos: ['situação', 'status', 'candidato'],
    },
    {
      id: 'area-como-entra',
      pergunta: 'Como alguém entra na Área do Voluntário, e dá para ver como ela aparece do outro lado?',
      resposta: 'Com o e-mail do cadastro e um código que chega por e-mail; não há senha. Só entra quem está “Ativo” e tem e-mail no cadastro. Se a pessoa ainda não entrou, use “Enviar convite por e-mail” no quadro “Área do Voluntário” do cadastro.\n\nPara ver do outro lado (quem gerencia): “Ver Área do Voluntário”, no topo de Voluntários, abre a área com o conteúdo publicado, sem dados de ninguém; no cadastro de uma pessoa ativa, “Ver como este voluntário” mostra a área dela, só para leitura, e a visualização fica registrada.',
      termos: ['login do voluntário', 'código', 'membro', 'senha', 'convite', 'Cadastre um e-mail para poder convidar.', 'prévia', 'pré-visualizar', 'visualizar'],
    },
    {
      id: 'verificacao-trava',
      pergunta: 'Por que não consigo aprovar uma inscrição, e o que é a “verificação do candidato”?',
      resposta: 'Desde outubro de 2026, aprovar exige a verificação concluída como “Apto” ou “Apto com restrição”: a Lei 14.811/2024 pede atestado de antecedentes de todo colaborador de instituição que atende crianças e adolescentes, renovado a cada 6 meses. No quadro “Verificação do candidato” da ficha, “Pedir documentos” manda um link pessoal (14 dias) para a pessoa aceitar o termo e enviar documento com foto, atestado (gratuito, no site da Polícia Civil) e duas referências; o Claude lê o documento e compara com o cadastro, a CGU responde sobre sanções, e a coordenação decide.\n\nSem identidade e antecedentes conferidos, “Aprovar com restrição” aprova na hora com a restrição “Não atua com crianças e adolescentes” e um motivo; a restrição aparece na ficha até a verificação ser concluída. O parecer sai em PDF.',
      termos: ['kyc', 'antecedentes', 'certidão', 'atestado', 'documentos', 'restrição', 'Conclua a verificação do candidato antes de aprovar', 'CGU', 'referências', 'Lei 14.811'],
    },
    {
      id: 'horas-sozinhas',
      pergunta: 'De onde vêm as horas e as formações que aparecem sozinhas no cadastro?',
      resposta: 'As horas vêm da presença nas oportunidades: “Presente” lança as horas da atividade (ou as que você informou), com o título dela. Trocar para “Ausente” tira essas horas.\n\nA formação é o certificado de um curso da Área do Voluntário: ao concluir, ela entra sozinha no cadastro, com a validade do certificado. Se o certificado for cancelado, ela sai.',
      termos: ['horas', 'presença', 'automático', 'formação', 'certificado', 'ninguém registrou'],
    },
    {
      id: 'foto-do-voluntario',
      pergunta: 'De onde vem a foto do voluntário, e quem a vê?',
      resposta: 'O próprio voluntário põe a foto em “Meu perfil”, na Área do Voluntário; quem gerencia também pode trocar ou tirar em “Editar cadastro”. Ela aparece no cadastro para quem tem acesso ao Voluntariado, e não para as outras pessoas do voluntariado.\n\nA foto é reduzida no aparelho de quem envia, sem a localização gravada nela. “Apagar dados (LGPD)” apaga a foto também.',
      termos: ['foto', 'retrato', 'avatar', 'imagem do voluntário'],
    },
    {
      id: 'anonimizado-sumiu',
      pergunta: 'Apaguei os dados (LGPD) e a pessoa sumiu da lista. É isso mesmo?',
      resposta: 'É. O cadastro fica como “Participante anonimizado”, desligado e fora da lista, e as horas continuam contando sem identificar ninguém. Não tem volta.',
      termos: ['LGPD', 'anonimizar', 'sumiu', 'apagar dados'],
    },
    {
      id: 'exportar-voluntarios',
      pergunta: 'Como exporto a planilha de voluntários, e ela traz CPF e saúde?',
      resposta: 'Em Voluntários, escolha o vínculo, a situação e o setor, se quiser, toque em “Filtrar” e depois em “Exportar”; o arquivo abre no Excel ou em outra planilha. A busca por texto não entra; sem escolher a situação, vai também quem está com inscrição pendente.\n\nCPF e saúde nunca saem: dado sensível não vai em planilha. Vão nome, vínculo, situação, setores, função, contatos, nascimento, cidade, habilidades e disponibilidade. Cada exportação fica registrada.',
      termos: ['planilha', 'excel', 'csv', 'exportar', 'baixar a lista'],
    },
    {
      id: 'lista-espera',
      pergunta: 'Como funciona a lista de espera das oportunidades?',
      resposta: 'Quando as vagas acabam, quem se inscreve vai para a lista de espera. Se alguém cancela a inscrição (dá até o início da atividade) ou você aumenta as vagas, quem está na espera sobe, por ordem de chegada, e recebe um e-mail avisando.',
      termos: ['espera', 'vagas', 'lotado', 'fila'],
    },
    {
      id: 'quiz-nota',
      pergunta: 'Como o quiz dá a nota?',
      resposta: 'Cada pergunta de escolha com resposta certa marcada vale um ponto; na de várias escolhas, só conta se a pessoa marcar exatamente as certas. A nota é a porcentagem de acertos. Resposta curta não vale nota.\n\nSão até 3 tentativas; aprovado, o resultado fica.',
      termos: ['quiz', 'nota', 'gabarito', 'tentativas', 'nota mínima'],
    },
    {
      id: 'perguntas-travadas',
      pergunta: 'Por que não consigo mudar as perguntas?',
      resposta: 'Porque alguém já respondeu. Mudar a pergunta depois embaralharia o que foi respondido, então as perguntas e o tipo ficam como estão. Se precisar, crie outra oportunidade.',
      termos: ['editar pergunta', 'Já há respostas: as perguntas não mudam mais. Se precisar, crie outra.', 'Já há respostas: o tipo não muda mais.'],
    },
    {
      id: 'quem-nao-confirmou',
      pergunta: 'Como sei quem ainda não confirmou o aviso?',
      resposta: 'Na oportunidade, “Confirmações” mostra quantos confirmaram de quantos voluntários ativos e, em “Quem confirmou”, a lista com o horário. Quem não aparece ali ainda não confirmou.',
      termos: ['aviso', 'ciente', 'confirmou', 'confirmação'],
    },
    {
      id: 'lembrete-atividade',
      pergunta: 'Quem se inscreveu recebe lembrete da atividade?',
      resposta: 'Recebe. Na véspera de cada oportunidade publicada e não cancelada, quem está inscrito e ativo recebe um lembrete por e-mail, uma vez só. Quem está na lista de espera não recebe.',
      termos: ['lembrete', 'véspera', 'aviso', 'e-mail', 'esqueceu'],
    },
    {
      id: 'curso-nao-publica',
      pergunta: 'Por que o curso não publica?',
      resposta: 'Para publicar, o curso precisa de pelo menos uma aula. Se tiver “Nota mínima na prova”, precisa também de questões na “Prova final” — ou apague a nota mínima.',
      termos: ['publicar curso', 'Adicione pelo menos uma aula antes de publicar.', 'a prova não tem questões'],
    },
    {
      id: 'excluir-curso',
      pergunta: 'Dá para excluir um curso?',
      resposta: 'Só enquanto ele não emitiu nenhum certificado. Depois disso, despublique: o curso sai da Área do Voluntário e os certificados continuam valendo.',
      termos: ['apagar curso', 'Este curso já emitiu certificados.'],
    },
    {
      id: 'certificado-quando',
      pergunta: 'Quando sai o certificado de um curso, e dá para cancelar?',
      resposta: 'Sai sozinho, quando a pessoa conclui todas as aulas. Se o curso tem nota mínima, só depois de passar na prova, com até 3 tentativas a cada 24 horas. A validade vem de “Validade do certificado (meses)”; em branco, não vence.\n\nCancelar dá, para quem gerencia: em “Cursos e apostilas”, na aba “Certificados”, toque em “Cancelar”, escreva o motivo e confirme em “Cancelar certificado”. Não tem volta: a página de verificação passa a dizer que ele foi cancelado, e a formação sai do cadastro da pessoa.',
      termos: ['certificado', 'prova', 'nota', 'validade', 'revogar', 'certificado errado', 'verificação'],
    },
    {
      id: 'quem-abriu-voluntario',
      pergunta: 'Dá para saber quem abriu o CPF ou a saúde de alguém?',
      resposta: 'Dá, para administradores: a aba “Quem acessa” tem o “Registro de acessos e mudanças”, com quem cadastrou, editou, aprovou ou recusou inscrições, abriu CPF e saúde, apagou dados (LGPD), exportou a planilha e mudou acessos.',
      termos: ['auditoria', 'registro', 'log', 'quem viu', 'LGPD'],
    },
  ],
  relacionadas: ['/voluntariado/mensagens', '/equipe', '/pessoas'],
}

// ---------------------------------------------------------------- Livro de ponto

const LIVRO_DE_PONTO: GuiaDaArea = {
  href: '/livro-de-ponto',
  paraQueServe: 'O caminho até o ponto da sede, que funciona no site da filial. O tablet da recepção e o celular, pelo QR code do cartaz, registram a entrada e a saída; o portal da secretaria guarda as horas doadas pelos voluntários, a presença da equipe e dos alunos e a lista de emergência.',
  quemUsa: 'Toda a equipe vê a página e o jeito de registrar. O livro de ponto abre no portal da secretaria, que tem login próprio: só entra quem tem o e-mail da equipe cadastrado lá.',
  naPratica: {
    titulo: 'Saber quem está na sede quando o alarme toca',
    passos: [
      'Voluntários e equipe registram a entrada no tablet da recepção ou, com o celular, pelo QR code do cartaz.',
      'O alarme de incêndio toca e a secretaria precisa saber quem está no prédio.',
      'Ela abre o Livro de ponto no Palácio Virtual e toca em “Lista de emergência”.',
      'O portal mostra quem está na sede agora, com os alunos em aula, pronto para imprimir.',
    ],
    resultado: 'Na evacuação, ninguém fica esquecido lá dentro.',
  },
  tour: [
    {
      titulo: 'O livro de ponto',
      texto: 'O ponto da sede funciona no site da filial. Esta página junta o jeito de registrar e os atalhos para o portal da secretaria, que abre em outra aba.',
    },
    {
      alvo: 'ponto.abrir',
      titulo: 'Abrir o livro de ponto',
      texto: 'O botão “Abrir o livro de ponto” leva ao portal da secretaria, que pede o e-mail da equipe e manda um link de acesso.',
      lado: 'bottom',
    },
    {
      alvo: 'ponto.registrar',
      titulo: 'Registrar a entrada e a saída',
      texto: 'No tablet da recepção, com o CPF; no celular, pelo QR code do cartaz, que só registra perto da sede.',
    },
    {
      alvo: 'ponto.secretaria',
      titulo: 'Os atalhos da secretaria',
      texto: 'Cada linha abre uma parte do portal: colaboradores e horas, alunos nas aulas, lista de emergência, aparelhos e comunicação.',
    },
  ],
  tarefas: [
    {
      id: 'abrir-livro-de-ponto',
      titulo: 'Abrir o livro de ponto',
      passos: [
        'No menu, em Pessoas, abra “Livro de ponto”.',
        'Toque em “Abrir o livro de ponto”: o portal da secretaria abre em outra aba.',
        'Em “E-mail da equipe”, digite o e-mail e toque em “Receber link de acesso”.',
        'Abra o link que chega no e-mail: ele vale 20 minutos, e a sessão dura 12 horas.',
      ],
      dica: 'O portal só manda o link para os e-mails da equipe cadastrados nele.',
      quem: 'Secretaria',
    },
    {
      id: 'registrar-pelo-celular',
      titulo: 'Registrar a entrada pelo celular',
      passos: [
        'Na sede, aponte a câmera do celular para o QR code do cartaz.',
        'Digite o CPF e toque em “Continuar”.',
        'Permita a localização quando o celular pedir.',
        'Toque em “Registrar entrada”. Na hora de ir embora, faça o mesmo e toque em “Estou saindo agora”.',
      ],
      dica: 'Marque “Lembrar de mim neste celular” para não digitar o CPF da próxima vez.',
      exemplo: 'Exemplo: uma voluntária chega para o plantão da tarde, lê o QR code do cartaz na entrada e toca em “Registrar entrada”. No fim do plantão, toca em “Estou saindo agora”, e as horas do dia entram no mês dela.',
    },
  ],
  perguntas: [
    {
      id: 'por-que-fora-do-palacio',
      pergunta: 'Por que o livro de ponto abre fora do Palácio Virtual?',
      resposta: 'O ponto da sede funciona no site da filial, junto do tablet da recepção e do cartaz com o QR code. O Palácio Virtual só guarda o caminho até lá, e o portal da secretaria tem login próprio.',
      termos: ['ponto', 'portal da secretaria', 'site da filial'],
    },
    {
      id: 'nao-consigo-entrar',
      pergunta: 'Não consigo entrar no portal da secretaria',
      resposta: 'Só entra quem tem o e-mail cadastrado no portal. O link de acesso vale 20 minutos: se passou, peça outro em “Receber link de acesso”.',
      termos: ['login', 'link expirado', 'acesso negado', 'e-mail da equipe'],
    },
    {
      id: 'celular-nao-registra',
      pergunta: 'O celular não registra o ponto',
      resposta: 'O celular só registra perto da sede e com a localização permitida para o site. Se o navegador negou a localização, permita nas configurações dele e tente de novo, ou registre no tablet da recepção.',
      termos: ['localização', 'gps', 'permissão negada', 'fora da sede'],
    },
  ],
  relacionadas: ['/voluntariado', '/equipe', '/portaria'],
}

export const guias: GuiaDaArea[] = [DIRETORIO, RECURSOS_HUMANOS, VOLUNTARIOS, LIVRO_DE_PONTO]
