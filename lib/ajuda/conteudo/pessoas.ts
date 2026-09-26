import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do grupo Pessoas do menu: Diretório (/pessoas, com o perfil
 * /pessoas/[id], /pessoas/[id]/editar, /pessoas/adicionar e
 * /pessoas/setores), Recursos humanos (/equipe, com /novo, /[id] e
 * /[id]/editar) e Voluntários (/voluntariado, com o cadastro, avisos,
 * oportunidades, cursos e apostilas; /participantes redireciona para lá). As
 * mensagens dos voluntários (/voluntariado/mensagens) são outra área, em
 * conteudo/comunicacao.ts.
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
 *   *_cvrj_cursos.sql.
 * Quem pode o quê: "usuarios.gerenciar" em lib/permissoes.ts (Diretório) e
 * os níveis próprios de Recursos humanos (NIVEIS em lib/rh/regras.ts) e de
 * Voluntários (NIVEIS em lib/participantes/regras.ts), liberados por admin.
 *
 * Os alvos `diretorio.*`, `rh.*` e `voluntarios.*` são marcados com
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
      texto: 'Só administradores: “Adicionar pessoas” convida por e-mail quem ainda não tem login. Cada pessoa cria a própria senha pelo link.',
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
          texto: 'Confira nome e sobrenome, e-mail, setor e papel de cada pessoa. O papel vem sugerido pelo setor; na dúvida, “Colaborador”, que dá para mudar depois.',
        },
        {
          alvo: 'diretorio.enviar',
          titulo: 'Enviar os convites',
          texto: 'Cada pessoa recebe um e-mail com o usuário e um link para criar a própria senha, que vale 72 horas. O resultado de cada convite aparece logo abaixo.',
        },
        {
          alvo: 'diretorio.pendentes',
          titulo: 'Convites pendentes',
          texto: 'Quem tem conta e ainda não entrou. “Reenviar” gera um link novo (o anterior deixa de valer); “Cancelar” desativa a conta.',
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
        'Em “2. Confira e envie”, preencha o “E-mail” e confira “Setor”, “Papel” e “Cargo (opcional)”.',
        'Resolva o que aparecer como “Falta: …” embaixo de cada pessoa.',
        'Toque em “Enviar convite” (com mais gente, o botão mostra quantos convites vão sair).',
        'Confira o resultado de cada pessoa na lista que aparece embaixo do botão.',
      ],
      dica: 'Dá para convidar até 30 pessoas de uma vez. Para quem não tem e-mail, o acesso sai com senha temporária em “Usuários e permissões”.',
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
      dica: 'Reenviar invalida o link anterior. Cancelar desativa a conta; se precisar, ela é reativada em “Usuários e permissões”.',
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
      resposta: 'O link do convite vale 72 horas. Um administrador abre “Adicionar pessoas” e, em “Convites pendentes”, toca em “Reenviar”: sai um link novo, e o anterior deixa de valer.\n\nSe a tela avisar que o envio de e-mail não está configurado, nenhum convite sai: dê o acesso com senha temporária em “Usuários e permissões”.',
      termos: ['e-mail', 'link expirou', 'senha', 'reenviar', 'o e-mail não saiu'],
    },
  ],
  relacionadas: ['/usuarios', '/equipe', '/perfil', '/chat'],
}

// ---------------------------------------------------------------- Recursos humanos

const RECURSOS_HUMANOS: GuiaDaArea = {
  href: '/equipe',
  paraQueServe: 'As fichas de toda a equipe contratada, inclusive coordenação, administrativo e diretoria: contrato e cargo, histórico de mudanças, arquivos, documentos e remuneração. O voluntariado fica em Voluntários; folha de pagamento, eSocial e ponto ficam com a contabilidade.',
  quemUsa: 'O acesso é liberado pessoa a pessoa por um administrador, em quatro níveis — “Ver a equipe”, “Gerenciar”, “Documentos” e “Remuneração e banco” —, e cada um inclui o anterior. Administradores têm tudo. Abrir documentos, dados bancários, remuneração e arquivos fica registrado com o nome de quem abriu.',
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
      id: 'cadastrar-ficha',
      titulo: 'Cadastrar uma pessoa na equipe',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Recursos humanos, toque em “Nova pessoa”.',
        'Preencha o “Nome completo” (o único campo obrigatório) e, se houver, o “Nome social”.',
        'Em “Login no Palácio Virtual”, escolha a conta da pessoa, se ela tiver.',
        'Em “Contrato e cargo”, escolha “Vínculo”, “Cargo”, “Setor”, “Gestor direto” e a data de “Admissão”.',
        'Complete os “Dados pessoais” que tiver à mão.',
        'Toque em “Cadastrar”.',
      ],
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
      resposta: 'Liga a ficha à conta da pessoa no Palácio Virtual. Com isso, o e-mail e o telefone de trabalho da ficha aparecem sozinhos nos contatos institucionais do perfil dela, e o nome social e o cargo da ficha passam a valer no perfil.',
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
  quemUsa: 'O acesso é liberado pessoa a pessoa por um administrador: “Ver a lista”; “Gerenciar” (cadastrar, aprovar inscrições, registrar horas e formações, exportar, cuidar de avisos, oportunidades e cursos); e “Dados sensíveis” (abrir CPF e saúde e apagar dados a pedido do titular). Administradores têm tudo.',
  tour: [
    {
      titulo: 'O cadastro do Voluntariado',
      texto: 'Todo o voluntariado, inclusive juventude e instrução voluntária. CPF e saúde ficam em sigilo, e cada abertura é registrada. A equipe contratada fica em Recursos humanos.',
    },
    {
      alvo: 'voluntarios.atalhos',
      titulo: 'A Área do Voluntário',
      texto: 'Daqui você cuida do que aparece do outro lado: “Oportunidades” e “Cursos e apostilas” e, para quem gerencia, “Mensagens” e “Avisos”.',
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
      texto: '“Voluntários” é o cadastro. “Inscrições pendentes” são as que chegaram pelo formulário público e esperam aprovação. “Quem acessa” aparece para quem tem “Dados sensíveis”.',
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
          titulo: 'O cadastro de uma pessoa',
          texto: 'Dados, formações e horas de voluntariado, o acesso à Área do Voluntário, os dados sensíveis e a situação da pessoa.',
        },
        {
          alvo: 'voluntarios.editar',
          titulo: 'Editar o cadastro',
          texto: '“Editar cadastro” muda dados, contato, setores, saúde e perfil de voluntariado. Cadastro com dados apagados (LGPD) não se edita mais.',
          lado: 'bottom',
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
          texto: '“Publicar” mostra a atividade na Área do Voluntário. “Cancelar atividade” pede o motivo e avisa por e-mail quem se inscreveu e quem está na espera. “Excluir” só aparece sem inscrições.',
          seAusente: 'pular',
        },
        {
          alvo: 'voluntarios.inscritos',
          titulo: 'Inscritos e presença',
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
      titulo: 'Aprovar ou recusar uma inscrição',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, abra a aba “Inscrições pendentes”.',
        'Toque no nome para conferir o cadastro, se quiser.',
        'Toque em “Aprovar” ou em “Recusar”.',
      ],
      dica: 'Aprovada, a pessoa passa a “Ativo” e, se tiver e-mail, recebe as boas-vindas com o caminho da Área do Voluntário. Recusada, a inscrição é apagada.',
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
      id: 'registrar-horas',
      titulo: 'Registrar horas de voluntariado',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra o cadastro da pessoa.',
        'Em “Horas de voluntariado”, toque em “Registrar horas”.',
        'Preencha a data, as horas e a atividade (ex.: cobertura do Réveillon).',
        'Toque em “Salvar”.',
      ],
      dica: 'Cada registro vai de 0,25 a 24 horas, e a data não pode ser futura. As horas de oportunidade com presença marcada entram sozinhas. Registro lançado por engano sai pela lixeira ao lado dele.',
    },
    {
      id: 'registrar-formacao',
      titulo: 'Registrar uma formação ou certificado',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra o cadastro da pessoa.',
        'Em “Formações e certificados”, toque em “Adicionar formação”.',
        'Preencha o nome da formação (ex.: Primeiros Socorros) e, se quiser, a instituição.',
        'Preencha “Concluída em” e, se o certificado vencer, “Válida até”.',
        'Toque em “Salvar”.',
      ],
      dica: 'Com “Válida até”, a formação ganha selo de validade, e as vencidas ou que vencem em até 60 dias entram na contagem do topo de Voluntários. Cursos da Área do Voluntário entram sozinhos.',
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
      titulo: 'Publicar um aviso para o voluntariado',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Avisos”.',
        'Escreva o título e o recado.',
        'Marque “Fixar no alto”, se for importante, e escolha a data em “Sai do mural em”, se o aviso tiver prazo.',
        'Marque “Enviar também por e-mail” se todo mundo precisa saber logo.',
        'Toque em “Publicar aviso”.',
      ],
      dica: 'O e-mail sai uma vez só por aviso, para quem está ativo, tem e-mail e não saiu da lista de avisos por e-mail. Cada aviso mostra quantos já viram; o lápis edita e a lixeira exclui.',
    },
    {
      id: 'publicar-banner',
      titulo: 'Publicar um banner na Área do Voluntário',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Banners”.',
        'Toque em “Enviar imagem” e escolha uma foto ou arte larga (1680×640), com o assunto no centro e sem texto escrito nela.',
        'Escreva o título e, se quiser, uma frase de apoio.',
        'Para levar a algum lugar, marque “Com botão” e preencha o texto do botão e o endereço: uma página da Área do Voluntário (/membro/oportunidades) ou um https://.',
        'Se o banner tiver prazo, preencha “De” e “até”. Toque em “Publicar banner”.',
      ],
      dica: 'Com mais de um no ar, eles se revezam no Início, na ordem que você der (menor primeiro); aparecem no máximo cinco. “Desligar” tira do ar sem apagar; a lixeira apaga o banner e a imagem.',
    },
    {
      id: 'criar-oportunidade',
      titulo: 'Criar e publicar uma oportunidade',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, toque em “Oportunidades” e depois em “Nova oportunidade”.',
        'Preencha “Título”, “Tipo”, “Local”, “Início” e “Fim”.',
        'Se houver limite, preencha “Vagas”; se as inscrições fecham antes do início, “Inscrições até”.',
        'Escreva a “Descrição”: o que vão fazer, o que levar, uniforme, pré-requisitos.',
        'Toque em “Criar (como rascunho)”.',
        'Na oportunidade, toque em “Publicar”.',
      ],
    },
    {
      id: 'marcar-presenca',
      titulo: 'Marcar presença numa oportunidade',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra a oportunidade, a partir do início da atividade.',
        'Em “Inscritos”, confira as horas ao lado de cada pessoa.',
        'Toque em “Presente” ou em “Ausente”.',
      ],
      dica: '“Presente” lança as horas no cadastro da pessoa; trocar para “Ausente” tira. Antes do início aparece “Presença a partir do início”.',
    },
    {
      id: 'cancelar-oportunidade',
      titulo: 'Cancelar uma oportunidade',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Abra a oportunidade e toque em “Cancelar atividade”.',
        'Escreva o “Motivo”: ele vai no aviso.',
        'Toque em “Cancelar e avisar”.',
      ],
      dica: 'Se ela estava publicada, quem se inscreveu e quem estava na espera recebem um e-mail com o motivo. A atividade continua na lista, marcada como cancelada. “Excluir” só existe enquanto ninguém se inscreveu.',
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
      id: 'exportar-planilha',
      titulo: 'Exportar a planilha de voluntários',
      quem: 'Nível “Gerenciar” ou acima',
      passos: [
        'Em Voluntários, escolha o vínculo, a situação e o setor, se quiser, e toque em “Filtrar”.',
        'Toque em “Exportar”.',
        'Abra o arquivo baixado no Excel ou em outra planilha.',
      ],
      dica: 'A busca por texto não entra na planilha. Sem escolher a situação, ela traz também as inscrições pendentes. CPF e saúde nunca saem, e cada exportação fica registrada.',
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
      id: 'sem-acesso-voluntarios',
      pergunta: 'Por que aparece “Você ainda não tem acesso a este cadastro”?',
      resposta: 'O cadastro de voluntários guarda dados pessoais e é liberado pessoa a pessoa. Peça a um administrador, que escolhe o seu nível na aba “Quem acessa”.',
      termos: ['cadeado', 'bloqueado', 'sem permissão', 'voluntariado'],
    },
    {
      id: 'niveis-voluntarios',
      pergunta: 'O que cada nível de acesso deixa fazer?',
      resposta: '“Ver a lista”: nome, vínculo, setores e contatos. “Gerenciar”: cadastrar, editar, aprovar inscrições, registrar horas e formações, exportar e cuidar de avisos, oportunidades e cursos.\n\n“Dados sensíveis”: tudo isso, mais abrir CPF e saúde e apagar dados a pedido do titular. Só administradores mudam o nível de alguém.',
      termos: ['nível', 'permissão', 'acesso'],
    },
    {
      id: 'link-inscricao',
      pergunta: 'Onde está o link do formulário de inscrição?',
      resposta: 'Em Voluntários, “Copiar link de inscrição” copia o endereço (o botão aparece para quem gerencia). Quem se inscreve por ele entra em “Inscrições pendentes”, e quem gerencia o Voluntariado recebe um aviso a cada inscrição nova.',
      termos: ['participe', 'formulário público', 'inscrever', 'divulgar'],
    },
    {
      id: 'status-voluntario',
      pergunta: 'O que significam “Inscrição pendente”, “Ativo”, “Inativo” e “Desligado”?',
      resposta: '“Inscrição pendente” chegou pelo formulário público e espera aprovação. Só quem está “Ativo” entra na Área do Voluntário.\n\n“Inativo” e “Desligado” continuam no cadastro e podem ser reativados; o desligamento guarda o motivo.',
      termos: ['situação', 'status', 'candidato'],
    },
    {
      id: 'area-como-entra',
      pergunta: 'Como alguém entra na Área do Voluntário?',
      resposta: 'Com o e-mail do cadastro e um código que chega por e-mail; não há senha. Só entra quem está “Ativo” e tem e-mail no cadastro. Se a pessoa ainda não entrou, use “Enviar convite por e-mail” no quadro “Área do Voluntário” do cadastro.',
      termos: ['login do voluntário', 'código', 'membro', 'senha', 'convite', 'Cadastre um e-mail para poder convidar.'],
    },
    {
      id: 'ver-como-voluntario',
      pergunta: 'Dá para ver a Área do Voluntário do jeito que ela aparece do outro lado?',
      resposta: 'Dá, para quem gerencia. “Ver Área do Voluntário”, no topo de Voluntários, abre a área com o conteúdo publicado, sem dados de ninguém. No cadastro de uma pessoa ativa, “Ver como este voluntário” mostra a área dela, só para leitura, e a visualização fica registrada.',
      termos: ['prévia', 'pré-visualizar', 'visualizar'],
    },
    {
      id: 'horas-sozinhas',
      pergunta: 'De onde vêm as horas que aparecem sozinhas no cadastro?',
      resposta: 'Da presença nas oportunidades: “Presente” lança as horas da atividade (ou as que você informou), com o título dela. Trocar para “Ausente” tira essas horas.',
      termos: ['horas', 'presença', 'automático'],
    },
    {
      id: 'formacao-sozinha',
      pergunta: 'Por que apareceu uma formação que ninguém registrou?',
      resposta: 'É o certificado de um curso da Área do Voluntário: ao concluir, a formação entra sozinha no cadastro, com a validade do certificado. Se o certificado for cancelado, ela sai.',
      termos: ['formação', 'certificado', 'automático'],
    },
    {
      id: 'anonimizado-sumiu',
      pergunta: 'Apaguei os dados (LGPD) e a pessoa sumiu da lista. É isso mesmo?',
      resposta: 'É. O cadastro fica como “Participante anonimizado”, desligado e fora da lista, e as horas continuam contando sem identificar ninguém. Não tem volta.',
      termos: ['LGPD', 'anonimizar', 'sumiu', 'apagar dados'],
    },
    {
      id: 'exportar-voluntarios',
      pergunta: 'A planilha exportada traz CPF e saúde?',
      resposta: 'Não: dado sensível não sai em planilha. “Exportar” leva nome, vínculo, situação, setores, função, contatos, nascimento, cidade, habilidades e disponibilidade, com os filtros de vínculo, situação e setor da tela. Cada exportação fica registrada.',
      termos: ['planilha', 'excel', 'csv', 'exportar'],
    },
    {
      id: 'lista-espera',
      pergunta: 'Como funciona a lista de espera das oportunidades?',
      resposta: 'Quando as vagas acabam, quem se inscreve vai para a lista de espera. Se alguém cancela a inscrição (dá até o início da atividade) ou você aumenta as vagas, quem está na espera sobe, por ordem de chegada, e recebe um e-mail avisando.',
      termos: ['espera', 'vagas', 'lotado', 'fila'],
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
      pergunta: 'Quando sai o certificado de um curso?',
      resposta: 'Sozinho, quando a pessoa conclui todas as aulas. Se o curso tem nota mínima, só depois de passar na prova, com até 3 tentativas a cada 24 horas. A validade vem de “Validade do certificado (meses)”; em branco, não vence.',
      termos: ['certificado', 'prova', 'nota', 'validade'],
    },
    {
      id: 'cancelar-certificado',
      pergunta: 'Dá para cancelar um certificado?',
      resposta: 'Dá, para quem gerencia: em “Cursos e apostilas”, na aba “Certificados”, toque em “Cancelar”, escreva o motivo e confirme em “Cancelar certificado”. Não tem volta: a página de verificação passa a dizer que ele foi cancelado, e a formação sai do cadastro da pessoa.',
      termos: ['revogar', 'certificado errado', 'verificação'],
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

export const guias: GuiaDaArea[] = [DIRETORIO, RECURSOS_HUMANOS, VOLUNTARIOS]
