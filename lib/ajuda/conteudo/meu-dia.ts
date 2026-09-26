import type { GuiaDaArea, Pergunta } from '../tipos'
import { EMAIL_DE_AVISO_NAO_CHEGOU, ESCOLHER_OS_EMAILS } from './geral'

/**
 * A ajuda do grupo sem título do menu — o que é do dia de cada pessoa:
 * Início (/dashboard), Aprovações (/aprovacoes, com /aprovacoes/[id] e as
 * conversas antigas em /mensagens/[id]) e Notificações (/notificacoes).
 *
 * Cada frase tem apoio no código: app/(app)/dashboard, components/app/dashboard,
 * lib/dashboard/painel.ts; app/(app)/aprovacoes, lib/aprovacoes/** e as actions
 * de aprovação em app/actions/editorial.ts (com a RPC vote_on_approval);
 * app/(app)/notificacoes, components/app/lista-de-notificacoes.tsx,
 * lib/notificacoes/** e app/actions/notificacoes.ts. Os alvos `inicio.*`,
 * `aprovacoes.*` e `notificacoes.*` são marcados com `data-ajuda` nessas telas.
 * Mudou a tela ou a regra, muda aqui no mesmo PR (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Início

const INICIO: GuiaDaArea = {
  href: '/dashboard',
  paraQueServe: 'O Início é a entrada do Palácio Virtual. Em cima, a saudação com o seu dia em uma frase, atalhos para começar algo e quatro números que levam direto ao que é seu. Depois, “Meu dia”: o que espera o seu voto e as suas pautas por prazo, com o que acontece hoje na comunicação, o tempo no Rio e a equipe ao lado. Mais abaixo, a semana da comunicação, quatro indicadores dos últimos 30 dias e, recolhido no fim, o mapa de todas as áreas. Essa é a arrumação padrão: em “Personalizar o Início”, cada pessoa escolhe o que aparece e em que ordem.',
  quemUsa: 'Toda a equipe do Palácio Virtual. “Minhas pautas” e “Esperando você” mostram só o que é seu; a semana, a saúde dos canais e os indicadores são da filial inteira, iguais para todo mundo.',
  tour: [
    {
      titulo: 'O seu Início',
      texto: 'O Início é a entrada do Palácio Virtual: o seu dia primeiro, depois a semana da comunicação, os indicadores e o mapa de todas as áreas. O detalhe de cada coisa continua na tela dela.',
    },
    {
      alvo: 'inicio.personalizar',
      titulo: 'Do seu jeito',
      texto: '“Personalizar o Início” escolhe o que aparece aqui e em que ordem: marque ou desmarque cada bloco e mude de lugar arrastando ou pelas setas. Vale só para você; “Voltar ao padrão” desfaz.',
      lado: 'bottom',
    },
    {
      alvo: 'inicio.resumo',
      titulo: 'O dia em uma frase',
      texto: 'A frase abaixo da saudação conta o que pede a sua atenção agora. Os botões começam uma atividade, uma publicação, um ofício ou um chamado. Os quatro números levam ao que espera o seu voto, às pautas atrasadas, às que vencem em 7 dias e às suas em aberto; ficam vermelhos quando pedem ação.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'inicio.esperando-voce',
      titulo: 'Esperando você',
      texto: 'Os conteúdos em que pediram o seu voto e que ainda esperam a sua decisão, do pedido mais antigo para o mais novo. Cada linha abre a tela de aprovação.',
      seAusente: 'pular',
    },
    {
      alvo: 'inicio.minhas-pautas',
      titulo: 'Minhas pautas',
      texto: 'As pautas em aberto em que você é responsável, separadas por prazo, de “Atrasadas” a “Sem prazo”. Cada linha abre a pauta; “Abrir o quadro” leva a Pautas.',
      seAusente: 'pular',
    },
    {
      alvo: 'inicio.areas',
      titulo: 'Todas as áreas',
      texto: 'No fim do Início, “Todas as áreas do Palácio” abre o mapa de tudo o que você pode abrir, agrupado como no menu: comunicação, planejamento, institucional, escola, pessoas. Um toque leva direto à área.',
      seAusente: 'pular',
    },
    {
      alvo: 'inicio.semana',
      titulo: 'A semana da operação',
      texto: 'Dia a dia, o que está no calendário, o que foi ao ar (com ✓) e o que falhou ao publicar. Os botões “Anterior” e “Próxima”, acima, trocam de semana.',
      seAusente: 'pular',
    },
    {
      alvo: 'inicio.canais',
      titulo: 'Saúde dos canais',
      texto: 'Cada canal em uso, com a última publicação. “Com falha”: a tentativa mais recente falhou. “Parado”: nada publicado há mais de 14 dias. O site aparece sempre.',
      seAusente: 'pular',
    },
    {
      alvo: 'inicio.indicadores',
      titulo: 'Indicadores',
      texto: 'Os últimos 30 dias comparados aos 30 anteriores, com a linha das últimas 8 semanas. Verde é melhora e vermelho é piora, conforme o indicador.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'personalizar-o-inicio',
      titulo: 'Escolher o que aparece no Início',
      passos: [
        'No Início, toque em “Personalizar o Início”, no alto, ao lado da data.',
        'Desmarque o que não quer ver e marque o que quer.',
        'Para mudar a ordem, arraste o bloco pela alça (os seis pontinhos) ou use as setas para subir e descer.',
        'Toque em “Salvar”. O Início já abre do seu jeito, em qualquer aparelho.',
      ],
      dica: 'Blocos de coluna larga e estreita em sequência ficam lado a lado, como o “Meu dia” de sempre. Para desfazer tudo, “Voltar ao padrão” e “Salvar”. Bloco escondido não é carregado: o Início fica mais leve.',
    },
    {
      id: 'ver-o-que-e-meu',
      titulo: 'Ver o que precisa de você hoje',
      passos: [
        'Abra “Início”, no alto do menu.',
        'Leia a frase abaixo da saudação: ela conta as pautas suas atrasadas, as que vencem nos próximos 7 dias e o que espera a sua aprovação.',
        'Em “Minhas pautas”, comece pelas “Atrasadas” e por “Para hoje”. Toque numa pauta para abri-la.',
        'Em “Esperando você”, toque num conteúdo para abrir a tela de aprovação.',
      ],
      dica: 'Uma pauta sai de “Minhas pautas” quando chega a “Pronto”, quando é arquivada ou quando outra pessoa passa a ser a responsável.',
    },
    {
      id: 'decidir-pelo-inicio',
      titulo: 'Decidir uma aprovação a partir do Início',
      passos: [
        'Em “Esperando você”, toque no conteúdo.',
        'Na tela de aprovação, leia o conteúdo e veja o que o setor da pauta pede para conferir.',
        'Em “Sua decisão”, escolha “Aprovar” (e marque os itens de “Antes de aprovar, confira”) ou “Pedir ajustes” (e escreva o comentário).',
        'Toque em “Confirmar decisão”. Você vai para “Aprovações”, e o item sai de “Esperando você”.',
      ],
    },
    {
      id: 'ver-outra-semana',
      titulo: 'Ver a semana passada ou a próxima',
      passos: [
        'No Início, desça até a parte da semana (“Esta semana na comunicação”).',
        'Toque em “Anterior” ou em “Próxima”.',
        'Para voltar à semana de hoje, toque em “Esta semana”, que aparece entre os dois botões quando você está em outra semana.',
      ],
      dica: 'Os indicadores de baixo não mudam com a semana: são sempre os últimos 30 dias.',
    },
    {
      id: 'achar-o-que-falhou',
      titulo: 'Descobrir o que falhou ao publicar',
      passos: [
        'Na semana, procure os itens em vermelho, marcados com “Falhou”.',
        'Toque no item para abrir a publicação em “Publicações”.',
        'Toque no número “falharam ao publicar” para abrir o “Histórico”, que lista o que foi ao ar e o que falhou, com o selo “Falhou”.',
        'Em “Saúde dos canais”, veja se o canal está “Com falha”.',
      ],
    },
    {
      id: 'ler-um-indicador',
      titulo: 'Ler um indicador',
      passos: [
        'Em “Indicadores da comunicação”, o número grande de cada cartão é o valor dos últimos 30 dias.',
        'Logo abaixo, a seta e a diferença comparam com os 30 dias anteriores.',
        'Pare o mouse sobre um ponto da linha para ver o valor daquela semana.',
        'Para ir mais fundo, toque em “Ver resultados”.',
      ],
      dica: '“Sem base de comparação” quer dizer que falta dado num dos dois períodos para comparar.',
    },
  ],
  perguntas: [
    {
      id: 'frase-do-resumo',
      pergunta: 'O que conta a frase abaixo da saudação?',
      resposta: 'Três coisas suas: as pautas em que você é responsável que passaram do prazo, as que vencem de hoje até 7 dias e os conteúdos que esperam o seu voto. Sem nada disso, ela avisa que nada seu está atrasado ou esperando decisão.',
      termos: ['resumo', 'saudação', 'bom dia', 'atrasadas'],
    },
    {
      id: 'pauta-nao-aparece',
      pergunta: 'Por que uma pauta minha não aparece em “Minhas pautas”?',
      resposta: 'Ali entram só as pautas em que você é a pessoa responsável e que ainda estão em aberto: “Entrada”, “Coleta”, “Produção”, “Revisão” ou “Aprovação”. Pauta em que você só participa, que chegou a “Pronto” ou que foi arquivada não aparece.\n\nCom muitas pautas, as atrasadas e as de hoje aparecem inteiras e o resto é cortado; o link “+ … no quadro” leva a Pautas.',
      termos: ['sumiu', 'responsável', 'minhas tarefas', 'participante'],
    },
    {
      id: 'grupos-de-prazo',
      pergunta: 'O que são “Para hoje”, “Próximos 7 dias” e “Mais adiante”?',
      resposta: 'São os grupos por prazo: “Atrasadas” (o prazo já passou), “Para hoje”, “Próximos 7 dias”, “Mais adiante” e “Sem prazo”. O dia vale pelo horário de Brasília.',
      termos: ['prazo', 'vencimento', 'data de entrega'],
    },
    {
      id: 'esperando-voce-vazio',
      pergunta: 'Pediram a minha aprovação, mas não aparece em “Esperando você”. Por quê?',
      resposta: 'Ali fica só o que ainda depende do seu voto. Se você já votou, ou se a rodada foi encerrada (alguém pediu ajustes ou todas as pessoas convidadas aprovaram), o item sai. Se você não está entre as pessoas convidadas a votar, ele também não aparece: veja a rodada em “Aprovações”, na aba “Todas”.',
      termos: ['aprovação', 'votar', 'pedido'],
    },
    {
      id: 'numero-esperando-aprovacao',
      pergunta: 'O número “esperando aprovação” da semana é o mesmo de “Esperando você”?',
      resposta: 'Não. O número da semana conta todas as rodadas em aberto da filial, de qualquer pessoa. “Esperando você” lista só as que esperam o seu voto.',
      termos: ['contador', 'aprovações pendentes'],
    },
    {
      id: 'equipe-agora',
      pergunta: 'O que aparece em “A equipe agora”?',
      resposta: 'Os 7 movimentos mais recentes da equipe: pautas criadas, movidas no quadro, comentadas, arquivadas ou restauradas; projetos criados, excluídos ou com a situação atualizada; ofícios emitidos, assinados, recusados ou cancelados; campanhas de imprensa enviadas, contatos importados e publicações no site.\n\nTocar num item de pauta, projeto, ofício ou imprensa abre o assunto (menos pauta arquivada e projeto excluído).',
      termos: ['feed', 'atividade', 'movimento', 'últimas ações'],
    },
    {
      id: 'projetos-no-inicio',
      pergunta: 'Quais projetos aparecem em “Projetos em andamento”, no Início?',
      resposta: 'Até quatro projetos em andamento: primeiro os seus (com o selo “Meu”), depois os em pior situação e os de prazo mais perto. A barra mostra o progresso pelas pautas do projeto. Sem projeto em andamento, essa parte nem aparece; o link “Carteira” abre a lista completa, em Projetos.',
      termos: ['projetos', 'campanhas', 'progresso'],
    },
    {
      id: 'itens-da-semana',
      pergunta: 'O que quer dizer cada tipo de item na semana?',
      resposta: 'Com borda tracejada: prazo, atividade ou outro compromisso do calendário. Com ✓, publicação que foi ao ar; em vermelho, com “Falhou”, publicação que não saiu; com borda contínua e sem ✓, publicação programada que ainda não consta como no ar.\n\nCada dia mostra até 5 itens; o resto fica em “+ … no calendário”.',
      termos: ['calendário', 'cores', 'agendado', 'publicado'],
    },
    {
      id: 'canal-parado',
      pergunta: 'O que quer dizer um canal “Parado” ou “Com falha”?',
      resposta: '“Parado”: nada foi publicado nele há mais de 14 dias. “Com falha”: nos últimos 14 dias, a tentativa mais recente de publicar falhou. “Sem publicação”: ainda não há nada publicado no canal. Canal que nunca foi usado não aparece; o site aparece sempre.',
      termos: ['saúde dos canais', 'instagram', 'facebook', 'site', 'erro ao publicar'],
    },
    {
      id: 'como-os-indicadores-contam',
      pergunta: 'Como cada indicador é calculado?',
      resposta: '“Publicações no ar”: cada canal conta uma vez (um post no Instagram e no Facebook são duas). “Abertura da imprensa”: quem abriu sobre quem recebeu, nas campanhas do período.\n\n“Pautas entregues no prazo”: das pautas com prazo que chegaram a “Pronto”, quantas chegaram até o prazo. “Tempo até a decisão”: a média entre o pedido de aprovação e a decisão (aprovar ou pedir ajustes).',
      termos: ['métricas', 'indicadores', 'porcentagem', 'média'],
    },
    {
      id: 'inicio-atualiza',
      pergunta: 'O Início se atualiza sozinho?',
      resposta: 'Não. Ele mostra o momento em que você abriu a página; para ver o que mudou depois, recarregue a página.',
      termos: ['atualizar', 'recarregar', 'desatualizado'],
    },
    {
      id: 'criar-do-inicio',
      pergunta: 'O botão “Criar” do Início é o mesmo do topo?',
      resposta: 'Quase. O do Início leva direto a “Registrar atividade”, que vira pauta na “Entrada”. O “Criar” do topo abre um menu com “Registrar atividade” e mais três opções: “Nova publicação”, “Novo ofício” e “Abrir chamado”.',
      termos: ['registrar', 'nova pauta', 'criar'],
    },
  ],
  relacionadas: ['/pautas', '/aprovacoes', '/calendario', '/registro', '/impacto'],
}

// ---------------------------------------------------------------- Aprovações

const APROVACOES: GuiaDaArea = {
  href: '/aprovacoes',
  paraQueServe: 'Quando alguém pede aprovação de um conteúdo ou de um pacote de “Publicações”, abre uma rodada: as pessoas convidadas votam “Aprovar” ou “Pedir ajustes”. A fila abre no que espera o seu voto e mostra, em cada rodada, o setor da pauta, o prazo do setor e quem ainda falta decidir.',
  quemUsa: 'Toda a equipe vê as rodadas, mas só vota quem recebeu o convite. Quem pediu a aprovação (ou um administrador) convida mais gente.',
  tour: [
    {
      titulo: 'A fila de aprovações',
      texto: 'Cada cartão é uma rodada: um conteúdo esperando votos antes de sair. A tela abre no que depende de você, com o setor da pauta, o prazo dele e quem ainda falta.',
    },
    {
      alvo: 'aprovacoes.numeros',
      titulo: 'Os números da fila',
      texto: 'Os números contam a fila inteira, não só o filtro aberto. Tocar num deles abre as rodadas em aberto daquela fila; “Atrasadas” abre a aba “Todas”, com as atrasadas no topo.',
    },
    {
      alvo: 'aprovacoes.abas',
      titulo: 'De quem é a fila',
      texto: '“Esperando meu voto”: o que depende de você. “Do meu setor” (só para quem tem coordenação): as pautas dela. “Pedidas por mim”: o que você enviou. “Todas”: a filial inteira.',
    },
    {
      alvo: 'aprovacoes.filtros',
      titulo: 'Situação e setor',
      texto: 'Escolha “Em aberto”, “Com ajustes”, “Aprovadas” ou “Qualquer situação”. Quando há pautas de mais de um setor na fila, dá para filtrar por setor também.',
    },
    {
      alvo: 'aprovacoes.rodada',
      titulo: 'Uma rodada',
      texto: 'A cor e o selo mostram o setor da pauta. O relógio diz quanto falta para o prazo do setor, ou há quanto tempo ele passou. Embaixo, quem já aprovou e quem falta.',
      seAusente: 'pular',
    },
    {
      alvo: 'aprovacoes.abrir',
      titulo: 'Abrir para votar',
      texto: '“Revisar agora” aparece quando falta o seu voto e abre a tela de decisão. Nas outras rodadas, o botão é “Ver rodada” ou mostra o que você já decidiu.',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/aprovacoes/[id]',
      rotulo: 'Tela de aprovação',
      tour: [
        {
          alvo: 'aprovacoes.conteudo',
          titulo: 'O conteúdo em votação',
          texto: 'O texto atual do conteúdo, com a pauta de origem no alto. Enquanto a rodada está aberta, quem pediu a aprovação tem o atalho “Editar matéria”.',
        },
        {
          alvo: 'aprovacoes.setor',
          titulo: 'O olhar do setor',
          texto: 'O selo mostra o setor da pauta e, logo abaixo, o que ele observa numa revisão. Em seguida vem o prazo do setor para decidir, contado desde o pedido.',
        },
        {
          alvo: 'aprovacoes.decisao',
          titulo: 'Sua decisão',
          texto: 'Escolha “Aprovar” ou “Pedir ajustes” e toque em “Confirmar decisão”; para pedir ajustes, o comentário é obrigatório. Se você não pode votar, o quadro diz por quê.',
        },
        {
          alvo: 'aprovacoes.conferencia',
          titulo: 'Antes de aprovar, confira',
          texto: 'Para aprovar, marque todos os itens da conferência. Se você é de outro setor com lista própria, os itens dele vêm juntos. O que você marcou fica registrado no voto.',
          seAusente: 'pular',
        },
        {
          alvo: 'aprovacoes.votos',
          titulo: 'Quem já decidiu',
          texto: 'Quem aprovou, quem pediu ajustes e quem ainda falta, com a data e o comentário de cada voto.',
        },
        {
          alvo: 'aprovacoes.convidar',
          titulo: 'Convidar mais gente',
          texto: 'Com a rodada aberta, quem pediu a aprovação (ou um administrador) chama mais pessoas para votar. Quem entra recebe o pedido nas notificações.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/mensagens/[id]',
      rotulo: 'Conversa de uma aprovação',
      tour: [
        {
          alvo: 'aprovacoes.conversa',
          titulo: 'A conversa de uma aprovação',
          texto: 'No alto, quem enviou o conteúdo, para quem e quando, com o voto de cada pessoa. “Abrir tela de aprovação” leva à rodada, onde se vota.',
        },
        {
          alvo: 'aprovacoes.conversa-mensagens',
          titulo: 'As mensagens',
          texto: 'Os comentários sobre este conteúdo, do mais antigo para o mais novo. São os mesmos que aparecem na tela do conteúdo.',
        },
        {
          alvo: 'aprovacoes.conversa-escrever',
          titulo: 'Responder',
          texto: 'Escreva a mensagem e toque em “Enviar”. Quem criou o conteúdo e quem já comentou nele recebem o aviso.',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'aprovar-um-conteudo',
      titulo: 'Aprovar um conteúdo',
      passos: [
        'Abra “Aprovações”. A tela já abre em “Esperando meu voto”.',
        'No cartão da rodada, toque em “Revisar agora”.',
        'Leia o conteúdo e veja, no quadro do setor, o que ele observa numa revisão.',
        'Em “Sua decisão”, toque em “Aprovar”.',
        'Em “Antes de aprovar, confira”, marque cada item que você conferiu.',
        'Se quiser, escreva um “Comentário”. Toque em “Confirmar decisão”.',
      ],
      dica: '“Confirmar decisão” só libera com todos os itens marcados. Se você não pode garantir algum item, não aprove: peça ajustes e diga o que falta.',
    },
    {
      id: 'pedir-ajustes',
      titulo: 'Pedir ajustes num conteúdo',
      passos: [
        'Abra a rodada pelo “Revisar agora”.',
        'Em “Sua decisão”, toque em “Pedir ajustes”.',
        'Em “Comentário”, escreva o que precisa mudar. Sem comentário, o botão não libera.',
        'Toque em “Confirmar decisão”.',
      ],
      dica: 'Um pedido de ajustes encerra a rodada na hora, mesmo que outras pessoas ainda não tenham votado: o conteúdo volta para a produção, e quem pediu a aprovação recebe o seu comentário.',
    },
    {
      id: 'enviar-para-aprovacao',
      titulo: 'Enviar um conteúdo para aprovação',
      passos: [
        'Abra o conteúdo: na pauta, aba “Conteúdos”, toque em “Abrir”.',
        'Toque em “Concluir matéria”.',
        'Em “Quem precisa aprovar”, marque as pessoas que devem votar.',
        'Toque em “Enviar para aprovação”. Você vai para “Aprovações”, e cada pessoa convidada recebe o pedido.',
      ],
      dica: 'Quem participa da pauta entra na rodada mesmo sem ser marcado. Quem escreveu, quem responde pelo conteúdo e quem envia ficam de fora: ninguém aprova o próprio texto.',
      quem: 'Responsável pelo conteúdo ou pela pauta, e administradores',
    },
    {
      id: 'aprovacao-pela-pauta',
      titulo: 'Abrir uma aprovação pela pauta',
      passos: [
        'Abra a pauta e vá à aba “Aprovações”.',
        'Em “Conteúdo existente”, escolha o conteúdo. Ou deixe “Criar caso rápido” e preencha “Título do caso” e “Texto ou link”.',
        'Em “Quem precisa aprovar”, marque quem deve votar.',
        'Toque em “Abrir aprovação”. A pauta passa para a coluna “Aprovação” e a tela da rodada abre.',
      ],
      dica: 'Também aqui quem participa da pauta entra na rodada, e quem escreveu o conteúdo fica de fora.',
    },
    {
      id: 'convidar-mais-gente',
      titulo: 'Convidar mais gente para uma rodada',
      passos: [
        'Abra a rodada (as que você enviou ficam em “Pedidas por mim”).',
        'Em “Convidar mais gente”, marque as pessoas em “Quem mais precisa aprovar”.',
        'Toque em “Convidar”. Cada pessoa recebe o pedido nas notificações.',
      ],
      dica: 'Só dá para convidar enquanto a rodada está em aberto. Quem já está na rodada continua nela, tenha votado ou não.',
      quem: 'Quem pediu a aprovação e administradores',
    },
    {
      id: 'destravar-rodada-parada',
      titulo: 'Destravar uma rodada sem ninguém para votar',
      passos: [
        'Abra a rodada. Aparece o aviso “Esta aprovação está parada: ninguém foi convidado para decidir.”',
        'Em “Convidar mais gente”, marque quem precisa aprovar.',
        'Toque em “Convidar”.',
      ],
      dica: 'Sem ninguém convidado, a rodada nunca fecha. Na fila, esse cartão aparece com “Ninguém convidado para votar”.',
      quem: 'Quem pediu a aprovação e administradores',
    },
    {
      id: 'reenviar-depois-dos-ajustes',
      titulo: 'Reenviar depois de fazer os ajustes',
      passos: [
        'Abra a rodada e leia, em “Solicitaram ajustes”, o comentário de quem pediu.',
        'Na pauta, aba “Conteúdos”, toque em “Abrir” no conteúdo. Faça as mudanças e toque em “Salvar”.',
        'Toque em “Concluir matéria”.',
        'Em “Quem precisa aprovar”, marque de novo quem deve votar: a rodada nova não copia a lista da anterior.',
        'Toque em “Enviar para aprovação”. Começa uma rodada nova, e todo mundo vota de novo.',
      ],
      dica: 'Quem participa da pauta entra de novo sem precisar ser marcado, como no primeiro envio. A rodada antiga continua na fila, em “Com ajustes”, como histórico.',
      quem: 'Responsável pelo conteúdo ou pela pauta, e administradores',
    },
    {
      id: 'ver-as-atrasadas',
      titulo: 'Ver as rodadas atrasadas',
      passos: [
        'Em “Aprovações”, toque no número “Atrasadas”, no alto.',
        'Abre a aba “Todas”, em “Em aberto”, com as atrasadas no topo e o selo vermelho “atrasada …”.',
        'Para ver só um setor, toque no nome dele na linha “Setor:”, quando ela aparece.',
        'Abra a rodada e veja, em “Ainda falta”, quem não votou.',
      ],
      dica: 'Atrasada não fecha sozinha: a rodada continua aberta até todas as pessoas convidadas decidirem ou alguém pedir ajustes.',
    },
    {
      id: 'acompanhar-o-que-enviei',
      titulo: 'Acompanhar o que você enviou',
      passos: [
        'Em “Aprovações”, toque na aba “Pedidas por mim”.',
        'Troque para “Qualquer situação” para ver também as aprovadas e as com ajustes.',
        'Em cada cartão, “Falta:” diz quem ainda não votou.',
      ],
      dica: 'Cada voto chega para você nas notificações; o último voto avisa que o conteúdo foi aprovado.',
    },
  ],
  perguntas: [
    {
      id: 'quem-vota',
      pergunta: 'Quem vota numa aprovação?',
      resposta: 'Só quem recebeu o convite. No envio de um conteúdo, entram as pessoas marcadas e quem participa da pauta; quem escreveu, quem responde pelo conteúdo e quem envia ficam de fora, para ninguém aprovar o próprio texto. Num pacote de “Publicações”, entram só as pessoas marcadas.\n\nDepois, quem pediu (ou um administrador) pode chamar mais gente em “Convidar mais gente”.',
      termos: ['aprovadores', 'revisores', 'votantes', 'convite'],
    },
    {
      id: 'de-onde-vem-o-pedido',
      pergunta: 'De onde vêm os pedidos de aprovação?',
      resposta: 'De três lugares: da tela do conteúdo (“Concluir matéria” e depois “Enviar para aprovação”), da aba “Aprovações” da pauta (“Abrir aprovação”) e de um pacote de “Publicações” (“Pedir aprovação”). O pacote chega à fila como “Pacote de redes”, com a página do site e cada post como vão sair.',
      termos: ['origem', 'pacote', 'publicações', 'pedir aprovação', 'enviar'],
    },
    {
      id: 'publicar-antes-de-aprovar',
      pergunta: 'Dá para publicar um pacote antes de a rodada fechar?',
      resposta: 'Não. Um pacote de “Publicações” que foi para aprovação só publica depois que a rodada dele fecha como “Aprovada”. Com a rodada em aberto, a publicação avisa “Este pacote está em aprovação. Aguarde a decisão antes de publicar.”; com ajustes pedidos, também não sai.',
      termos: ['publicar', 'bloqueado', 'em aprovação', 'pacote', 'redes'],
    },
    {
      id: 'nao-consigo-votar',
      pergunta: 'Por que não consigo votar?',
      resposta: 'Os botões ficam apagados quando você não está entre as pessoas convidadas, quando você já votou ou quando a rodada já foi encerrada. O quadro “Sua decisão” diz qual é o caso. Se você deveria votar, peça a quem enviou (ou a um administrador) para convidar você.',
      termos: ['botão apagado', 'desabilitado', 'não aparece aprovar'],
    },
    {
      id: 'confirmar-nao-libera',
      pergunta: '“Confirmar decisão” não libera. O que falta?',
      resposta: 'Primeiro, escolha “Aprovar” ou “Pedir ajustes”. Para aprovar, todos os itens de “Antes de aprovar, confira” precisam estar marcados; a tela diz quantos faltam. Para pedir ajustes, falta o comentário dizendo o que precisa mudar.',
      termos: ['botão cinza', 'não consigo aprovar', 'conferência'],
    },
    {
      id: 'o-que-e-a-conferencia',
      pergunta: 'O que é a lista “Antes de aprovar, confira”?',
      resposta: 'É a lista do que o setor da pauta confere antes de um conteúdo sair: no Jurídico, por exemplo, direitos de imagem e uso do emblema; na GRD, o alerta oficial e os números de emergência. Pauta sem setor, ou de setor sem lista própria, usa a conferência geral (fatos, princípios e marca, autorização de imagem).\n\nSe você é de outro setor com lista própria, os itens dele aparecem juntos. O que você conferiu fica registrado junto do seu voto.',
      termos: ['checklist', 'lista de conferência', 'critérios'],
    },
    {
      id: 'situacoes-da-rodada',
      pergunta: 'O que significam “Em aberto”, “Aprovada” e “Ajustes pedidos”?',
      resposta: '“Em aberto”: ainda falta voto. “Aprovada”: todas as pessoas convidadas aprovaram; o conteúdo está pronto para ser publicado e a pauta, se estava em “Aprovação”, vai para “Pronto”. “Ajustes pedidos” (no filtro, “Com ajustes”): alguém pediu mudanças, e o conteúdo voltou para a produção.',
      termos: ['status', 'situação', 'pendente'],
    },
    {
      id: 'um-ajuste-encerra',
      pergunta: 'Um só pedido de ajustes encerra a rodada?',
      resposta: 'Sim. Basta uma pessoa pedir ajustes para a rodada fechar, mesmo que outras ainda não tenham votado. O conteúdo volta para a produção e a pauta, se estava em “Aprovação”, volta para “Produção”. Depois dos ajustes, quem enviou a matéria manda de novo, e começa uma rodada nova.',
      termos: ['reprovar', 'rejeitar', 'ajustes'],
    },
    {
      id: 'desfazer-o-voto',
      pergunta: 'Votei errado. Dá para desfazer?',
      resposta: 'Não pela tela: depois de “Confirmar decisão”, o voto fica registrado. Se você aprovou por engano, avise quem pediu a aprovação. Se pediu ajustes por engano, a rodada já fechou, e quem enviou a matéria pode mandá-la de novo, numa rodada nova.',
      termos: ['mudar voto', 'engano', 'cancelar voto'],
    },
    {
      id: 'prazo-do-setor',
      pergunta: 'Como funciona o prazo de cada setor?',
      resposta: 'O prazo conta em horas corridas desde o pedido: 4 horas na GRD (alertas de emergência); 24 horas em Comunicação Social, Tecnologia da Informação e Esportes; 72 horas em Jurídico, Juventude e Psicologia / Serviço Social; 48 horas nos demais setores e nas pautas sem setor. Passou disso, a rodada aparece como atrasada e sobe na fila, mas continua aberta.',
      termos: ['atrasada', 'vence em', 'sla', 'urgência'],
    },
    {
      id: 'de-onde-vem-o-setor',
      pergunta: 'De onde vem o setor de uma aprovação?',
      resposta: 'Da coordenação da pauta: o campo “Coordenação responsável” de “Registrar atividade”. Pauta sem coordenação, e pacote de “Publicações” (que não tem pauta), aparece como “Sem setor”. Setor sem lista própria usa a conferência geral.',
      termos: ['coordenação', 'selo', 'cor do setor'],
    },
    {
      id: 'aba-do-meu-setor',
      pergunta: 'Por que não vejo a aba “Do meu setor”?',
      resposta: 'Ela só aparece para quem tem uma coordenação no cadastro. Quem define a coordenação de cada pessoa é um administrador.',
      termos: ['setor', 'coordenação', 'aba sumiu'],
    },
    {
      id: 'ordem-da-fila',
      pergunta: 'Em que ordem as rodadas aparecem?',
      resposta: 'As em aberto vêm primeiro: as atrasadas no topo, depois as que vencem antes. Em seguida, as encerradas, das mais novas para as mais antigas; delas, a fila mostra as 200 mais recentes.',
      termos: ['ordenar', 'prioridade'],
    },
    {
      id: 'quem-ve-as-rodadas',
      pergunta: 'Quem vê as rodadas de aprovação?',
      resposta: 'Toda a equipe vê a fila e pode abrir qualquer rodada, pela aba “Todas”. Votar, só quem recebeu o convite; convidar mais gente, só quem pediu a aprovação ou um administrador.',
      termos: ['privacidade', 'permissão', 'quem vê'],
    },
    {
      id: 'avisos-de-aprovacao',
      pergunta: 'Como fico sabendo de um pedido de aprovação?',
      resposta: 'Quem recebe o convite ganha uma notificação (“… pediu sua aprovação”), que também chega por e-mail conforme as suas preferências. Quem pediu recebe um aviso a cada voto e, no último, que o conteúdo foi aprovado. O número ao lado de “Aprovações”, no menu, conta o que espera o seu voto.',
      termos: ['aviso', 'e-mail', 'sino', 'notificação'],
    },
    {
      id: 'editar-durante-a-rodada',
      pergunta: 'Dá para mudar o texto com a rodada aberta?',
      resposta: 'Numa matéria, dá. Quem pediu a aprovação tem, na tela da rodada, o atalho “Editar matéria”, e a rodada passa a mostrar o texto novo. Os votos já dados continuam valendo, então, se a mudança for grande, avise quem já aprovou.\n\nNum pacote de “Publicações”, o texto da rodada é uma cópia feita no envio: mudar essa cópia não muda o que vai ser publicado.',
      termos: ['editar', 'corrigir', 'alterar texto'],
    },
    {
      id: 'conversa-antiga',
      pergunta: 'Abri um link antigo de “Mensagens” de uma aprovação. Que tela é essa?',
      resposta: 'É a conversa sobre um conteúdo enviado para aprovação: quem pediu, quem vota e o voto de cada pessoa, com os comentários. As mensagens são as mesmas da tela do conteúdo, e “Abrir tela de aprovação” leva à rodada. Só quem pediu, quem vota e os administradores abrem essa conversa.',
      termos: ['mensagens', 'conversa', 'comentários', 'link antigo'],
    },
  ],
  relacionadas: ['/pautas', '/dashboard', '/redes', '/notificacoes'],
}

// ---------------------------------------------------------------- Notificações

// Também em Meu perfil (administracao.ts), com o mesmo título: a busca mostra
// um só, então o texto é um só (o porquê está em geral.ts, antes de TOPICOS_GERAIS).
export const RESUMO_DIARIO: Omit<Pergunta, 'id'> = {
  pergunta: 'O que é o “Resumo diário”?',
  resposta: 'Um só e-mail por dia, de manhã, com as notificações que você ainda não abriu e que não foram por e-mail na hora: as dos assuntos em “Resumo diário” e as que ficaram para depois porque você estava com o Palácio Virtual aberto. Ficam de fora o que você já leu, os assuntos em “Só no sino” e os avisos de mais de 3 dias.',
  termos: ['resumo', 'um e-mail por dia', 'e-mail diário', 'digest'],
}

const NOTIFICACOES: GuiaDaArea = {
  href: '/notificacoes',
  paraQueServe: 'Tudo o que aconteceu com você no Palácio Virtual, lido e não lido: pedidos de aprovação, mensagens, chamados, ofícios e outros avisos para você. O sino do topo mostra as mais recentes; aqui ficam todas, das mais novas para as mais antigas.',
  quemUsa: 'Cada pessoa vê só as próprias notificações. Vale para toda a equipe, inclusive a da escola.',
  tour: [
    {
      titulo: 'Todas as suas notificações',
      texto: 'O sino do topo mostra as mais recentes. Aqui fica tudo, das mais novas para as mais antigas, 30 por página.',
    },
    {
      alvo: 'notificacoes.filtros',
      titulo: 'Todas ou só as não lidas',
      texto: '“Não lidas” mostra só o que falta ler, com a contagem. “Escolher o que chega por e-mail” abre as suas preferências no perfil.',
    },
    {
      alvo: 'notificacoes.lista',
      titulo: 'Cada aviso leva ao assunto',
      texto: 'As não lidas têm um ponto e o título em negrito. Tocar numa abre a página de que ela fala e a marca como lida. Pare o mouse sobre a hora para ver a data completa.',
    },
    {
      alvo: 'notificacoes.marcar',
      titulo: 'Marcar como lidas',
      texto: '“Marcar todas como lidas” vale para todas, inclusive as de outras páginas. Quando existe, “Marcar estas como lidas” marca só as que você está vendo.',
      seAusente: 'pular',
    },
    {
      alvo: 'notificacoes.paginas',
      titulo: 'As mais antigas',
      texto: '“Mais antigas” e “Mais recentes” andam de 30 em 30 notificações.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'ver-as-nao-lidas',
      titulo: 'Ver só o que você ainda não leu',
      passos: [
        'Abra o sino, no alto, e toque em “Ver todas”.',
        'Toque em “Não lidas”.',
        'Toque numa notificação para abrir o assunto; ela passa a contar como lida.',
      ],
    },
    {
      id: 'marcar-todas-como-lidas',
      titulo: 'Marcar todas como lidas',
      passos: [
        'Abra o sino, no alto, e toque em “Ver todas”.',
        'Acima da lista, toque em “Marcar todas como lidas”. Vale também para as das outras páginas.',
        'Para marcar só as que estão na tela, toque em “Marcar estas como lidas”, que aparece quando há não lidas em outras páginas.',
      ],
      dica: 'Os botões só aparecem quando há alguma notificação não lida. O sino também tem “Marcar todas como lidas”.',
    },
    { id: 'escolher-os-emails', ...ESCOLHER_OS_EMAILS },
    {
      id: 'achar-uma-antiga',
      titulo: 'Achar uma notificação antiga',
      passos: [
        'Em “Notificações”, deixe “Todas” marcado.',
        'No fim da lista, toque em “Mais antigas” para ir à página seguinte.',
        'Pare o mouse sobre a hora de uma notificação para ver a data completa.',
      ],
      dica: 'Não há busca nas notificações: elas vêm da mais nova para a mais antiga, 30 por página.',
    },
  ],
  perguntas: [
    {
      id: 'quando-conta-como-lida',
      pergunta: 'Quando uma notificação conta como lida?',
      resposta: 'Quando você toca nela (aqui ou no sino), quando usa “Marcar todas como lidas” ou “Marcar estas como lidas”, ou quando abre a página de que ela fala enquanto ela ainda está entre as mais recentes do sino.',
      termos: ['lida', 'não lida', 'ponto'],
    },
    {
      id: 'desmarcar-lida',
      pergunta: 'Dá para marcar como não lida de novo?',
      resposta: 'Não. Depois de lida, ela continua em “Todas”, sem o ponto de não lida.',
      termos: ['não lida', 'desfazer'],
    },
    {
      id: 'apagar-notificacao',
      pergunta: 'Dá para apagar uma notificação?',
      resposta: 'Não. As notificações ficam guardadas; use “Não lidas” para ver só o que falta.',
      termos: ['excluir', 'limpar', 'remover'],
    },
    {
      id: 'por-que-recebi',
      pergunta: 'Por que recebi esta notificação?',
      resposta: 'Porque algo aconteceu com você: um pedido de aprovação ou um voto no que você enviou, uma mensagem, uma pauta em que você entrou, um comentário num conteúdo seu, um chamado ou um ofício para assinar, entre outros. O que você mesmo fez não gera aviso para você.',
      termos: ['motivo', 'aviso', 'alerta'],
    },
    {
      id: 'sino-nao-mudou',
      pergunta: 'Chegou uma notificação e o sino não mudou. Por quê?',
      resposta: 'O sino se atualiza sozinho a cada minuto com a aba aberta, quando você volta para a aba e quando você o abre. Com pressa, abra o sino ou recarregue a página.',
      termos: ['atraso', 'contagem', 'número do sino'],
    },
    { id: 'email-nao-chegou', ...EMAIL_DE_AVISO_NAO_CHEGOU },
    { id: 'resumo-diario', ...RESUMO_DIARIO },
    {
      id: 'so-no-sino',
      pergunta: 'Escolhi “Só no sino”. Ainda vejo a notificação?',
      resposta: 'Sim. “Só no sino” desliga apenas o e-mail daquele assunto: a notificação continua aparecendo no sino e aqui.',
      termos: ['sem e-mail', 'desligar e-mail'],
    },
    {
      id: 'avisos-de-seguranca',
      pergunta: 'Os avisos de segurança da conta aparecem aqui?',
      resposta: 'Não. Os avisos de segurança (senha trocada, verificação em duas etapas ativada ou removida, papel mudado, conta desativada ou reativada) vão direto para o seu e-mail de recuperação confirmado, qualquer que seja a sua escolha, e não aparecem no sino. Quando o e-mail de recuperação muda, o aviso vai para o endereço antigo.',
      termos: ['segurança', 'senha', '2fa', 'verificação'],
    },
  ],
  relacionadas: ['/perfil', '/aprovacoes', '/chat'],
}

export const guias: GuiaDaArea[] = [INICIO, APROVACOES, NOTIFICACOES]
