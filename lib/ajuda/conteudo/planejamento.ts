import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do grupo Planejamento do menu — de onde a pauta nasce até quando
 * ela vai ao ar: Radar de pautas (/cerebro, com /cerebro/mapa), Pautas
 * (/pautas, com a sala /pautas/[id], o formulário /registrar e o editor
 * /conteudos/[id], que o menu põe em Pautas), Calendário (/calendario) e
 * Projetos (/projetos, com /projetos/[id]).
 *
 * Cada frase tem apoio no código: app/(app)/cerebro, components/app/cerebro,
 * app/actions/cerebro.ts e lib/cerebro/**; app/(app)/pautas,
 * components/app/pautas/quadro.tsx, app/actions/quadro.ts, lib/pautas/quadro.ts,
 * app/(app)/registrar, app/(app)/conteudos, components/app/descricao-da-pauta.tsx
 * e as actions de app/actions/editorial.ts (com as RPCs de aprovação);
 * app/(app)/calendario; app/(app)/projetos, components/app/projetos,
 * app/actions/projetos.ts e lib/projetos/cronograma.ts. Os alvos `cerebro.*`,
 * `pautas.*`, `registrar.*`, `conteudo.*`, `calendario.*` e `projetos.*` são
 * marcados com `data-ajuda` nessas telas. Mudou a tela ou a regra, muda aqui
 * no mesmo PR (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Radar de pautas

const RADAR: GuiaDaArea = {
  href: '/cerebro',
  paraQueServe: 'O Radar mostra o que o Cérebro leu nas contas oficiais do Rio e acha que pode virar pauta: o fato, por que apareceu, o que não pode e o plano por canal. O Cérebro recomenda; quem decide, produz e publica é a Redação. A sugestão que a equipe leva adiante vira um pacote em rascunho em “Publicações”.',
  quemUsa: 'Toda a equipe da Redação vê o Radar, leva sugestões adiante e recusa as que não servem. A recusa vale para a equipe inteira: a sugestão some daqui e do painel do Cérebro em “Publicações”.',
  tour: [
    {
      titulo: 'O Radar de pautas',
      texto: 'O Cérebro lê as contas oficiais do Rio e sugere o que pode virar pauta, com uma nota de 0 a 100. Ele recomenda; quem decide e publica é a Redação.',
    },
    {
      alvo: 'cerebro.briefing',
      titulo: 'O dia em números',
      texto: 'Quantas histórias há em cada fila e as três de nota mais alta. Tocar num desses títulos abre a história.',
      lado: 'bottom',
    },
    {
      alvo: 'cerebro.ferramentas',
      titulo: 'Briefing, mapa e sincronizar',
      texto: '“Gerar briefing” monta o resumo do dia para copiar, e “Mapa” mostra as ligações entre fontes, sinais e pacotes. “Sincronizar” busca a leitura mais recente.',
    },
    {
      alvo: 'cerebro.filas',
      titulo: 'As filas',
      texto: '“Agir agora”, “Produzir”, “Agendar”, “Conferir ação” e “Monitorar”. Cada linha traz a decisão, o título, o resumo com a conta de origem, até três selos e a nota.',
    },
    {
      alvo: 'cerebro.detalhe',
      titulo: 'A história aberta',
      texto: 'Tocar numa história abre o detalhe: o fato, “O que não pode”, o plano por canal, por que ela apareceu e os critérios do motor.',
    },
    {
      alvo: 'cerebro.acoes',
      titulo: 'Levar adiante ou recusar',
      texto: '“Rascunhar com IA”, “Trazer sem IA” ou “Trazer para pauta” abrem um pacote em rascunho em “Publicações”. “Não usar” recusa com um motivo, e o Cérebro aprende com ele.',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/cerebro/mapa',
      rotulo: 'Mapa do Radar',
      tour: [
        {
          titulo: 'O mapa do Cérebro',
          texto: 'Tudo ligado numa tela: eixos, contas observadas, sinais, datas do calendário e propostas, e o que a Redação já fez com isso, do pacote ao canal publicado.',
        },
        {
          alvo: 'cerebro.mapa-filtros',
          titulo: 'Buscar e filtrar',
          texto: '“Buscar no mapa…” destaca os nós pelo nome. Cada botão com bolinha colorida mostra ou esconde um tipo de nó; o número ao lado é quantos há.',
        },
        {
          alvo: 'cerebro.mapa-grafo',
          titulo: 'Andar pelo mapa',
          texto: 'Arraste o fundo para mover e use a roda do mouse para aproximar; de perto, os nomes aparecem. Tocar num nó abre o painel com tudo o que está ligado a ele.',
        },
        {
          titulo: 'Isolar um assunto',
          texto: 'No painel de um nó, “Isolar este ecossistema no mapa” mostra só ele e o que está a até duas ligações. “Ver o mapa inteiro” volta ao todo.',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'levar-sugestao-adiante',
      titulo: 'Levar uma sugestão para a produção',
      passos: [
        'Abra “Radar de pautas” e toque na história, na lista.',
        'Leia o “Fato”, “O que não pode” e o “Plano por canal”. Se aparecer o aviso de que o Cérebro não viu ação da filial, confirme com a operação antes de seguir.',
        'Toque em “Rascunhar com IA” para a IA redigir matéria, legenda e stories, ou em “Trazer sem IA” para partir da legenda da fonte. Sem IA disponível, o botão é “Trazer para pauta”.',
        'Espere: o pacote abre em “Publicações”, em rascunho.',
        'Leia, corrija e confira o rascunho antes de seguir com a publicação: ele é ponto de partida, não texto pronto.',
      ],
      dica: 'O pacote nasce com a matéria do site e com as redes marcadas “SIM” no “Plano por canal” (se o Cérebro vetou a publicação pública, nasce sem canais). Se a história já virou pacote, o botão passa a ser “Abrir pacote” e abre o mesmo, sem duplicar.',
    },
    {
      id: 'recusar-sugestao',
      titulo: 'Recusar uma sugestão',
      passos: [
        'Abra a história na lista.',
        'Toque em “Não usar”.',
        'Em “Por que não usar?”, escolha o motivo: “Repetitivo”, “Não é da Cruz”, “Sem ação nossa”, “Já falamos disso”, “Fonte fraca” ou “Outro motivo”.',
        'A história sai da lista para toda a equipe.',
      ],
      dica: 'O motivo ensina o Cérebro: ele pesa nas próximas leituras. Mudou de ideia antes de escolher o motivo? Toque em “Cancelar”.',
    },
    {
      id: 'gerar-briefing',
      titulo: 'Mandar o briefing do dia para a equipe',
      passos: [
        'No alto do Radar, toque em “Gerar briefing”.',
        'Confira o texto: até quatro histórias por fila, cada uma com o primeiro motivo do Cérebro, e o que não pode hoje.',
        'Toque em “Copiar briefing” e cole onde a equipe conversa.',
        'Toque em “Fechar” para voltar.',
      ],
    },
    {
      id: 'explorar-assunto',
      titulo: 'Ver o que já saiu sobre o assunto',
      passos: [
        'Abra a história e toque em “Explorar o assunto”.',
        'Em “No mesmo assunto”, veja o que saiu na imprensa, outros sinais do Cérebro (alguns com imagem) e o que a Casa já fez, marcado com “nossa”.',
        'Toque num item para abri-lo.',
      ],
      dica: 'Quando nada aparece, a tela avisa que o assunto é inédito por enquanto.',
    },
    {
      id: 'explorar-mapa',
      titulo: 'Explorar o mapa de ligações',
      passos: [
        'No alto do Radar, toque em “Mapa”.',
        'Use “Buscar no mapa…” para achar um nome, ou desligue nos botões ao lado os tipos que não interessam.',
        'Toque num nó para abrir o painel dele, com tudo o que está ligado.',
        'No painel, toque em “Isolar este ecossistema no mapa” para ver só aquele pedaço. “Ver o mapa inteiro” volta.',
        'Para voltar à lista, toque em “Ver em cartões”.',
      ],
    },
    {
      id: 'ver-leitura-recente',
      titulo: 'Ver a leitura mais recente',
      passos: [
        'Ao lado dos botões do alto, veja quando foi a leitura (“Atualizado …”).',
        'Toque em “Sincronizar”.',
        'Espere o botão sair de “Sincronizando…”: a lista é recarregada.',
      ],
      dica: '“Sincronizar” busca o que o Cérebro já leu; não faz ele ler as contas de novo.',
    },
  ],
  perguntas: [
    {
      id: 'o-que-e-o-cerebro',
      pergunta: 'O que é o Cérebro?',
      resposta: 'Um serviço à parte que observa uma lista fechada de contas oficiais do Rio, avalia cada publicação por seis perguntas e decide o que merece virar pauta. Ele não publica nada: o Radar é onde a Redação vê as sugestões e decide.\n\n“Abrir o Cérebro”, no alto da tela, leva ao próprio Cérebro.',
      termos: ['ia', 'inteligência artificial', 'sugestões', 'robô', 'radar'],
    },
    {
      id: 'filas-do-radar',
      pergunta: 'O que quer dizer cada fila?',
      resposta: '“Agir agora”: algo em curso, em que cada hora custa relevância. “Produzir”: pauta boa, sem urgência de minutos. “Agendar”: tem data certa; o lugar dela é o calendário. “Conferir ação”: nota alta, mas o Cérebro não viu ação da filial; confirme com a operação antes de pautar. “Monitorar”: informa a equipe, mas não vira peça por ora.',
      termos: ['agir agora', 'produzir', 'agendar', 'monitorar', 'conferir ação', 'modo', 'decisão'],
    },
    {
      id: 'nota-e-cores',
      pergunta: 'O que é a nota e o que significam as cores?',
      resposta: 'A nota, de 0 a 100, é a avaliação do Cérebro para a história: verde a partir de 72, amarela a partir de 55 e cinza abaixo disso.\n\nNo detalhe, “Critérios do motor” mostra a nota de cada pergunta: “É local?”, “É urgente?”, “Tem relação conosco?”, “Existe ação real?”, “Já falamos disso?” e “Fonte confiável?”.',
      termos: ['pontuação', 'score', 'critérios', 'verde', 'amarelo'],
    },
    {
      id: 'selos-da-linha',
      pergunta: 'O que são os selos embaixo de cada história?',
      resposta: 'Até três, do mais importante para a decisão: o que a Casa já fez (“Pacote · …”, com a situação do pacote, “Publicado pela Casa” ou “Em pauta na Redação”); “+… boletins juntos”, quando o Cérebro juntou publicações parecidas; a situação da mídia (“Mídia autorizada”, “Foto da Casa · confirmar termo” ou “Mídia: …”, com o tipo de direito); e “Fonte confiável” ou “Conferir fonte”.',
      termos: ['etiquetas', 'marcadores', 'boletins', 'flags'],
    },
    {
      id: 'o-que-nao-pode',
      pergunta: 'O que é “O que não pode”?',
      resposta: 'São as travas daquela história: o que a peça não pode dizer ou mostrar. O bloco fica sempre aberto no detalhe e vai junto para o pacote quando a história é levada adiante. Sem trava específica, valem as regras gerais do Movimento.',
      termos: ['travas', 'proibido', 'restrições', 'cuidados'],
    },
    {
      id: 'trazer-cria-o-que',
      pergunta: '“Trazer para pauta” cria um cartão no quadro de Pautas?',
      resposta: 'Não. “Rascunhar com IA”, “Trazer sem IA” e “Trazer para pauta” criam um pacote em rascunho em “Publicações”, com a matéria do site e uma versão para cada rede marcada “SIM” no “Plano por canal”. Nada é enviado: o trabalho segue no pacote, com a decisão da equipe.',
      termos: ['importar', 'pacote', 'publicações', 'quadro', 'virar pauta'],
    },
    {
      id: 'o-que-a-ia-escreve',
      pergunta: 'O que a IA escreve em “Rascunhar com IA”?',
      resposta: 'Título, linha fina, a matéria, a legenda do feed e três stories, com a voz da Casa e respeitando “O que não pode”, além de uma lista do que conferir. O que a IA acrescentou por conta própria vem entre ⟦ ⟧, e a peça não é publicada enquanto esses colchetes estiverem no texto.\n\nSe a IA falhar, o pacote nasce da legenda da fonte, e a tela avisa.',
      termos: ['ia', 'claude', 'redação automática', 'colchetes', 'para conferir', 'acréscimos da IA'],
    },
    {
      id: 'foto-da-sugestao',
      pergunta: 'A foto da sugestão já pode ir ao ar?',
      resposta: 'Não necessariamente. Ao levar a história adiante, a capa vai para a Biblioteca: material da Casa entra esperando autorização, e material de terceiros entra como de uso interno, só para referência. Nada vai ao ar sem a autorização de uso.',
      termos: ['imagem', 'direito de uso', 'autorização', 'mídia', 'termo', 'capa'],
    },
    {
      id: 'recusa-desfazer',
      pergunta: 'Quem vê a minha recusa? Dá para desfazer?',
      resposta: 'A recusa vale para toda a equipe: a sugestão some do Radar e do painel do Cérebro em “Publicações”, e o motivo fica gravado no Cérebro. Aqui no Radar não há botão para desfazer; por isso, na dúvida, antes de escolher o motivo toque em “Cancelar”.',
      termos: ['desfazer', 'recusar', 'não usar', 'errei', 'voltar atrás'],
    },
    {
      id: 'cerebro-indisponivel',
      pergunta: 'Apareceu “Cérebro indisponível”. E agora?',
      resposta: 'O Cérebro não respondeu: está fora do ar ou demorando. O resto da Redação continua funcionando; recarregue a página em instantes.',
      termos: ['erro', 'fora do ar', 'não carrega', 'O Cérebro demorou para responder', 'Não foi possível falar com o Cérebro'],
    },
    {
      id: 'acervo-semente',
      pergunta: 'O que quer dizer “acervo semente”?',
      resposta: 'Que o Cérebro está mostrando o acervo inicial dele, e não a leitura ao vivo das contas. Trate essas sugestões com cuidado e confira a fonte antes de usar.',
      termos: ['semente', 'dado vivo', 'exemplo'],
    },
    {
      id: 'radar-atualiza',
      pergunta: 'O Radar se atualiza sozinho?',
      resposta: 'A tela guarda a leitura do Cérebro por até 5 minutos. Para ver a mais recente na hora, toque em “Sincronizar”. Levar adiante ou recusar uma história já atualiza a lista.',
      termos: ['atualizar', 'recarregar', 'desatualizado', 'sincronizar'],
    },
  ],
  relacionadas: ['/redes', '/pautas', '/biblioteca'],
}

// ---------------------------------------------------------------- Pautas

const PAUTAS: GuiaDaArea = {
  href: '/pautas',
  paraQueServe: 'Pautas é o quadro editorial: cada cartão é uma pauta, e as colunas são as etapas, de “Entrada” a “Pronto”. Dentro de cada pauta, a sala guarda a conversa, a descrição, os links de arquivos, os conteúdos e as aprovações. Uma pauta nasce do “Registrar atividade”, do “Adicionar pauta” no quadro, do “Agendar” do calendário ou do “Transformar em pauta” da “Caixa de entrada”.',
  quemUsa: 'Toda a equipe cria, edita, move e arquiva pautas, e cria etiquetas. “Excluir pauta” aparece só para quem é responsável pela pauta e para administradores. No conteúdo, “Concluir matéria” aparece para quem responde pelo conteúdo ou pela pauta, e para administradores.',
  tour: [
    {
      titulo: 'O quadro de pautas',
      texto: 'Cada cartão é uma pauta; cada coluna, uma etapa: “Entrada”, “Coleta”, “Produção”, “Revisão”, “Aprovação” e “Pronto”. Arraste o cartão para mudar de etapa.',
    },
    {
      alvo: 'pautas.nova',
      titulo: 'Nova pauta completa',
      texto: '“Nova pauta completa” abre o formulário “Registrar atividade”, com tipo, coordenação, responsável, datas e publicações previstas. A pauta nasce em “Entrada”.',
    },
    {
      alvo: 'pautas.filtros',
      titulo: 'Buscar e filtrar',
      texto: 'Busque por título, tipo, coordenação, projeto ou etiqueta, e filtre por pessoa, prioridade, prazo e etiqueta. “Arquivadas” mostra o que saiu do quadro.',
    },
    {
      alvo: 'pautas.quadro',
      titulo: 'As colunas',
      texto: 'O número no alto de cada coluna conta os cartões visíveis nela; o ícone de arquivo ao lado arquiva a coluna de uma vez. No celular, deslize para o lado para ver as outras.',
    },
    {
      alvo: 'pautas.cartao',
      titulo: 'Um cartão',
      texto: 'A faixa colorida é a prioridade. Embaixo vêm o prazo (vermelho se atrasou), o checklist, as mensagens, os links, os conteúdos e quem participa; tocar abre o cartão.',
      seAusente: 'pular',
    },
    {
      alvo: 'pautas.adicionar',
      titulo: 'Criar rápido',
      texto: '“Adicionar pauta”, no pé da coluna, cria um cartão só com o título. Não existe em “Aprovação” nem em “Pronto”: essas etapas têm caminho próprio.',
    },
  ],
  telas: [
    {
      caminho: '/pautas/[id]',
      rotulo: 'Sala da pauta',
      tour: [
        {
          alvo: 'pautas.sala-resumo',
          titulo: 'O resumo da pauta',
          texto: 'Projeto, coordenação, prazo, prioridade, responsável e arquivos. Em “Aprovadores” estão os participantes: são convidados a votar quando um conteúdo da pauta vai para aprovação.',
        },
        {
          alvo: 'pautas.sala-status',
          titulo: 'Mudar a etapa',
          texto: '“Alterar status” move a pauta entre as etapas do quadro, até “Pronto” ou “Arquivado”. Para ir a “Aprovação”, use a aba “Aprovações”.',
        },
        {
          alvo: 'pautas.sala-pessoas',
          titulo: 'Chamar gente para a pauta',
          texto: '“Adicionar pessoas” põe alguém como participante: a pessoa é avisada, recebe as mensagens da conversa e é convidada a votar nos conteúdos enviados para aprovação.',
        },
        {
          alvo: 'pautas.sala-abas',
          titulo: 'As abas da sala',
          texto: '“Conversa”, “Informações” (descrição e ficha do registro), “Arquivos” (links), “Conteúdos”, “Aprovações” e “Histórico” do que foi feito na pauta.',
        },
        {
          alvo: 'pautas.sala-mais',
          titulo: 'Mais opções',
          texto: '“Mais opções” copia o link da pauta, troca o projeto e arquiva. Para quem é responsável pela pauta e para administradores, também tem “Excluir pauta”.',
        },
      ],
    },
    {
      caminho: '/registrar',
      rotulo: 'Registrar atividade',
      tour: [
        {
          titulo: 'Registrar uma atividade',
          texto: 'Conte o que aconteceu ou o que precisa ser feito. O registro vira uma pauta na coluna “Entrada” do quadro, com a ficha organizada para a Comunicação.',
        },
        {
          alvo: 'registrar.tipo',
          titulo: 'O tipo muda o formulário',
          texto: '“Ação”, “Evento”, “História”, “Ideia”, “Material”, “Sugestão” ou “Outro”. Cada tipo pede os seus campos na parte “Detalhes”, mais abaixo.',
        },
        {
          alvo: 'registrar.planejamento',
          titulo: 'Responsável, prioridade e datas',
          texto: 'A “Data da atividade / prazo” entra no calendário e vira o prazo do cartão. Com “Início” também, a pauta vira uma barra na linha do tempo do projeto.',
        },
        {
          alvo: 'registrar.publicacoes',
          titulo: 'Publicações previstas',
          texto: '“Adicionar publicação” marca data, canal e assunto. Cada uma entra no calendário e nasce com um conteúdo em rascunho que já traz o contexto do registro.',
        },
        {
          alvo: 'registrar.enviar',
          titulo: 'Enviar',
          texto: '“Enviar para Comunicação” cria a pauta e abre a sala dela. Fotos, vídeos e documentos entram depois, como links, na aba “Arquivos”.',
        },
      ],
    },
    {
      caminho: '/conteudos/[id]',
      rotulo: 'Editor de conteúdo',
      tour: [
        {
          alvo: 'conteudo.texto',
          titulo: 'O texto',
          texto: 'O título, a “Linha de apoio (opcional)” e o corpo. Logo acima do corpo, a contagem de palavras e o tempo de leitura.',
        },
        {
          alvo: 'conteudo.ferramentas',
          titulo: 'Formatação e mídia',
          texto: 'Título, negrito, itálico, lista, citação, link e emoji. Imagem, vídeo e áudio sobem para a Biblioteca e entram no texto; “Mídia anexada” lista o que entrou.',
        },
        {
          alvo: 'conteudo.acoes',
          titulo: 'Salvar',
          texto: '“Salvar” grava o texto como uma versão nova. Enquanto aparecer “Alterações não salvas”, o que você escreveu ainda não foi gravado.',
        },
        {
          alvo: 'conteudo.concluir',
          titulo: 'Concluir e pedir aprovação',
          texto: '“Concluir matéria” (ou “Atualizar aprovação”, se já estiver em aprovação) abre as opções: enviar para aprovação, marcando quem vota, ou arquivar e continuar depois.',
          seAusente: 'pular',
        },
        {
          alvo: 'conteudo.comentarios',
          titulo: 'Comentários',
          texto: 'A conversa sobre este conteúdo. Quem criou o conteúdo e quem já comentou nele recebem aviso de cada comentário novo.',
        },
        {
          alvo: 'conteudo.publicar',
          titulo: 'Da matéria à publicação',
          texto: '“Criar pacote de publicação” abre “Publicações” com o texto salvo já carregado, para montar a versão do site e de cada rede. Salve antes de criar.',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'criar-pauta',
      titulo: 'Criar uma pauta completa',
      passos: [
        'Em “Pautas”, toque em “Nova pauta completa” (ou, no topo, em “Criar” e depois “Registrar atividade”).',
        'Escolha o “Tipo do registro” e escreva o nome.',
        'Confira a “Coordenação responsável” (vem marcada a sua) e, se for o caso, escolha o “Projeto”.',
        'Em “Planejamento”, defina “Responsável”, “Prioridade” e a “Data da atividade / prazo”.',
        'Preencha os “Detalhes” pedidos pelo tipo e a “Descrição”.',
        'Toque em “Enviar para Comunicação”. A sala da pauta abre, e o cartão aparece em “Entrada”.',
      ],
      dica: 'Nome e coordenação são obrigatórios. Em “História”, “Ideia”, “Material”, “Sugestão” e “Outro”, o campo principal dos detalhes também é.',
    },
    {
      id: 'prever-publicacoes',
      titulo: 'Deixar as publicações no calendário ao registrar',
      passos: [
        'Em “Registrar atividade”, desça até “Publicações no calendário editorial”.',
        'Toque em “Adicionar publicação”.',
        'Preencha “Data da publicação”, o “Horário” (opcional), o “Canal” e o “Assunto da publicação”.',
        'Repita para cada publicação e toque em “Enviar para Comunicação”.',
      ],
      dica: 'Cada publicação vira uma data no calendário e um conteúdo em rascunho com o contexto do registro; no calendário, a data abre direto esse conteúdo. São até 12 por registro, e assunto em branco usa o nome da atividade.',
    },
    {
      id: 'criar-cartao-rapido',
      titulo: 'Criar um cartão rápido no quadro',
      passos: [
        'No pé da coluna, toque em “Adicionar pauta”.',
        'Escreva o título e aperte Enter (ou toque em “Adicionar”).',
        'O cartão entra no fim da coluna, com você como responsável e prioridade “Normal”.',
        'Toque no cartão para completar prazo, prioridade, etiquetas e checklist.',
      ],
      dica: 'Dá para criar assim em “Entrada”, “Coleta”, “Produção” e “Revisão”. No quadro filtrado por um projeto, o cartão já nasce nele.',
    },
    {
      id: 'mover-pauta',
      titulo: 'Mudar a etapa de uma pauta',
      passos: [
        'Arraste o cartão para outra coluna e solte na posição que quiser.',
        'Ou toque no cartão e escolha a “Etapa”.',
        'Ou, na sala da pauta, use “Alterar status”.',
      ],
      dica: 'Levar para “Aprovação” pelo quadro pede confirmação e abre a rodada de aprovação sem convidar ninguém para votar. Para escolher quem vota, prefira “Abrir aprovação”, na aba “Aprovações” da sala.',
    },
    {
      id: 'editar-cartao',
      titulo: 'Mudar responsável, prazo ou prioridade',
      passos: [
        'Toque no cartão no quadro.',
        'Ajuste “Responsável”, “Início”, “Prazo” ou “Prioridade”; o título se edita no alto.',
        'Toque em “Salvar”.',
      ],
      dica: 'Quem passa a ser responsável recebe um aviso. Mudar o prazo no cartão não mexe no calendário.',
    },
    {
      id: 'checklist-e-etiquetas',
      titulo: 'Usar checklist e etiquetas',
      passos: [
        'Toque no cartão.',
        'Em “Checklist”, escreva em “Adicionar item” e aperte Enter. Marque cada item quando estiver feito.',
        'Em “Etiquetas”, marque as que valem para a pauta, ou toque em “Nova etiqueta” (“Criar a primeira etiqueta”, se ainda não houver), escolha nome e cor e toque em “Criar”. A etiqueta nova já entra no cartão.',
        'Para renomear, trocar a cor ou apagar uma etiqueta, toque no lápis ao lado dela.',
      ],
      dica: 'As etiquetas são do espaço inteiro: apagar uma tira ela de todos os cartões. No cartão fechado, o checklist aparece como feitos/total.',
    },
    {
      id: 'arquivar-e-restaurar',
      titulo: 'Arquivar e restaurar uma pauta',
      passos: [
        'Para arquivar uma pauta, abra o cartão e toque em “Arquivar”.',
        'Para arquivar uma coluna inteira, toque no ícone de arquivo ao lado do número da coluna. Com filtro ligado, só saem os cartões visíveis.',
        'Para trazer de volta, toque em “Arquivadas”, ache a pauta e toque em “Restaurar”.',
      ],
      dica: 'A pauta volta para a etapa de onde saiu. Se saiu de “Aprovação”, volta para “Revisão”, porque a rodada daquela época não vale mais.',
    },
    {
      id: 'conversar-na-pauta',
      titulo: 'Conversar e chamar pessoas na pauta',
      passos: [
        'Abra a sala da pauta (no cartão, “Abrir sala da pauta”).',
        'Toque em “Adicionar pessoas” e escolha quem participa.',
        'Na aba “Conversa”, escreva a mensagem e toque em “Enviar”.',
      ],
      dica: 'O responsável e os participantes recebem cada mensagem nas notificações. Quem é adicionado também recebe um aviso.',
    },
    {
      id: 'escrever-descricao',
      titulo: 'Escrever ou editar a descrição (briefing)',
      passos: [
        'Na sala da pauta, abra a aba “Informações”.',
        'Em “Descrição”, toque em “Escrever” (ou em “Editar”, se já houver texto).',
        'Escreva. Linha inteira em caixa alta vira título; “>> PENDENCIA: texto” vira a barra de pendência; “>> texto” vira um recado.',
        'Toque em “Salvar descrição”.',
      ],
      dica: 'Resolveu a pendência? Apague a linha do “>>” e a barra some. Qualquer pessoa da equipe pode editar a descrição.',
    },
    {
      id: 'criar-conteudo',
      titulo: 'Criar e escrever um conteúdo da pauta',
      passos: [
        'Na sala da pauta, abra a aba “Conteúdos”.',
        'Preencha o “Título”, escolha o “Formato” e toque em “Criar conteúdo”.',
        'O editor abre: escreva e toque em “Salvar”.',
        'Quando estiver pronto, toque em “Concluir matéria”, marque quem precisa aprovar e toque em “Enviar para aprovação”.',
        'Aprovado, toque em “Criar pacote de publicação” para montar as versões em “Publicações”.',
      ],
      dica: '“Concluir matéria” aparece para quem responde pelo conteúdo ou pela pauta, e para administradores. Quem cria o conteúdo pela aba “Conteúdos” passa a responder por ele. “Criar pacote de publicação” leva o texto salvo: toque em “Salvar” antes.',
    },
    {
      id: 'abrir-aprovacao-pela-sala',
      titulo: 'Pedir aprovação pela sala da pauta',
      passos: [
        'Na sala da pauta, abra a aba “Aprovações”.',
        'Em “Conteúdo existente”, escolha o conteúdo. Sem conteúdo pronto, deixe “Criar caso rápido” e preencha “Título do caso” e “Texto ou link”.',
        'Em “Quem precisa aprovar”, marque quem vota. Os participantes da pauta entram junto.',
        'Toque em “Abrir aprovação”. A pauta vai para “Aprovação”, e a rodada abre com o convite para quem vota.',
      ],
      dica: 'Quem criou o conteúdo, quem responde por ele e quem envia não votam nele. Quando todos aprovam, o cartão vai sozinho para “Pronto”; um pedido de ajuste o devolve para “Produção”.',
    },
    {
      id: 'excluir-pauta',
      titulo: 'Excluir uma pauta',
      passos: [
        'Abra a sala da pauta.',
        'Toque em “Mais opções” (os três pontos, ao lado de “Adicionar pessoas”).',
        'Toque em “Excluir pauta”.',
        'Leia o aviso e toque em “Excluir definitivamente”.',
      ],
      dica: 'Excluir apaga a pauta com tudo o que há dentro e não tem volta. Se a pauta só saiu de cena, prefira “Arquivar pauta”: ela volta com “Restaurar”, em “Arquivadas”.',
      quem: 'Responsável pela pauta e administradores',
    },
  ],
  perguntas: [
    {
      id: 'etapas-do-quadro',
      pergunta: 'Como uma pauta anda pelas colunas?',
      resposta: 'As colunas seguem o caminho da pauta: “Entrada”, “Coleta”, “Produção”, “Revisão”, “Aprovação” e “Pronto”. Toda pauta registrada nasce em “Entrada”, e você a leva adiante arrastando o cartão.\n\nEm “Aprovação”, a pauta espera os votos: quando todos aprovam, ela vai sozinha para “Pronto”; se alguém pede ajustes, volta para “Produção”.',
      termos: ['etapas', 'status', 'colunas', 'kanban', 'entrada', 'coleta', 'produção', 'revisão', 'pronto'],
    },
    {
      id: 'nova-x-adicionar',
      pergunta: 'Qual a diferença entre “Nova pauta completa” e “Adicionar pauta”?',
      resposta: '“Nova pauta completa” abre o formulário “Registrar atividade”: tipo, coordenação, responsável, datas, detalhes e publicações previstas. “Adicionar pauta”, no pé da coluna, cria na hora só com o título; o resto você completa no cartão. Dos dois, só o formulário completo põe a data no calendário.',
      termos: ['criar pauta', 'registrar', 'cartão novo'],
    },
    {
      id: 'nao-cria-em-aprovacao',
      pergunta: 'Por que não dá para criar cartão em “Aprovação” nem em “Pronto”?',
      resposta: 'Porque essas etapas têm caminho próprio: chegar a “Aprovação” abre uma rodada de votos, e “Pronto” é o resultado. Crie o cartão numa das outras colunas e leve adiante.',
      termos: ['adicionar pauta sumiu', 'criar em pronto'],
    },
    {
      id: 'arrastei-para-aprovacao',
      pergunta: 'Arrastei um cartão para “Aprovação” e ninguém recebeu o pedido. Por quê?',
      resposta: 'Pelo quadro, a rodada abre com o conteúdo mais recente da pauta (ou com um novo, feito do título e da descrição), mas o arrasto não convida ninguém para votar. Em “Aprovações”, abra a aba “Pedidas por mim”, entre na rodada e, em “Convidar mais gente”, marque quem vota e toque em “Convidar”. Esse quadro aparece só para quem pediu a aprovação (quem arrastou o cartão) e para administradores.\n\nDa próxima vez, prefira “Abrir aprovação”, na aba “Aprovações” da sala: ali você escolhe quem vota.',
      termos: ['aprovação parada', 'ninguém convidado', 'votantes', 'arrastar'],
    },
    {
      id: 'conteudo-nao-move-cartao',
      pergunta: 'Enviei o conteúdo para aprovação, mas o cartão não foi para “Aprovação”. Por quê?',
      resposta: '“Enviar para aprovação”, dentro do conteúdo, abre a rodada só daquele conteúdo e não move o cartão da pauta. Quando a rodada fecha, o cartão só anda sozinho se já estiver em “Aprovação”. Para o cartão acompanhar desde o início, abra a aprovação pela aba “Aprovações” da sala, em “Abrir aprovação”.',
      termos: ['cartão parado', 'coluna', 'concluir matéria'],
    },
    {
      id: 'so-as-minhas',
      pergunta: 'Como vejo só as minhas pautas?',
      resposta: 'No filtro de pessoas, escolha “Minhas (responsável ou participante)”. Para ver as de outra pessoa, escolha o nome dela; “Sem responsável” mostra os cartões sem dono. “Limpar” tira todos os filtros de uma vez.',
      termos: ['filtro', 'meus cartões', 'responsável'],
    },
    {
      id: 'cores-do-cartao',
      pergunta: 'O que querem dizer as cores do cartão?',
      resposta: 'No prazo: vermelho, já passou; amarelo forte, vence hoje; amarelo claro, vence nos próximos 7 dias; cinza, mais adiante. Em “Pronto”, o prazo não fica vermelho.\n\nA faixa no alto do cartão é a prioridade: vermelha para “Crítica”, laranja para “Alta”, azul para “Normal” e cinza para “Baixa”.',
      termos: ['atrasada', 'vencida', 'prazo', 'prioridade', 'faixa'],
    },
    {
      id: 'quadro-ao-vivo',
      pergunta: 'O quadro se atualiza sozinho?',
      resposta: 'Sim, quando aparece “Ao vivo” ao lado de “Arquivadas”: o que outras pessoas mudam aparece em instantes. Com “Offline”, recarregue a página para ver as mudanças.',
      termos: ['atualizar', 'recarregar', 'tempo real', 'offline'],
    },
    {
      id: 'arquivar-x-excluir',
      pergunta: 'Qual a diferença entre arquivar e excluir uma pauta?',
      resposta: 'Arquivar tira a pauta do quadro, mas guarda tudo: ela volta com “Restaurar”, em “Arquivadas”. Excluir apaga a pauta e tudo o que está dentro dela (matérias, aprovações, mensagens, agendamentos e links) e não tem volta.\n\n“Excluir pauta”, em “Mais opções” na sala, aparece só para quem é responsável pela pauta e para administradores.',
      termos: ['apagar', 'deletar', 'remover', 'lixeira', 'desfazer'],
    },
    {
      id: 'restaurada-em-entrada',
      pergunta: 'Restaurei uma pauta e ela voltou para “Entrada”. Por quê?',
      resposta: 'Pauta arquivada pelo quadro volta para a etapa de onde saiu (quem saiu de “Aprovação” volta para “Revisão”). Pauta arquivada pela sala, em “Arquivar pauta” ou em “Alterar status”, não guarda a etapa de origem e volta para “Entrada”.',
      termos: ['restaurar', 'arquivadas', 'voltou', 'etapa errada'],
    },
    {
      id: 'quem-e-avisado',
      pergunta: 'Quem é avisado do que acontece numa pauta?',
      resposta: 'Quem é adicionado à pauta recebe um aviso, e também quem passa a ser responsável quando o cartão é mudado no quadro. Cada mensagem da “Conversa” avisa o responsável e os participantes, e cada comentário num conteúdo avisa quem criou o conteúdo e quem já comentou nele. Quem fez a ação não recebe aviso dela. Os avisos chegam no sino e, conforme a preferência de cada pessoa, por e-mail.',
      termos: ['notificação', 'e-mail', 'aviso', 'sino'],
    },
    {
      id: 'aprovadores-da-sala',
      pergunta: 'O que é “Aprovadores”, no alto da sala?',
      resposta: 'São os participantes da pauta. Eles são convidados a votar sempre que um conteúdo da pauta vai para aprovação por “Concluir matéria” ou por “Abrir aprovação”, menos quem criou o conteúdo, quem responde por ele e quem envia. Arrastar o cartão para “Aprovação” não convida ninguém.\n\nPara mudar a lista, use “Adicionar pessoas” ou o X ao lado do nome, em “Participantes”, na aba “Conversa”.',
      termos: ['participantes', 'revisores', 'quem aprova'],
    },
    {
      id: 'concluir-materia-nao-aparece',
      pergunta: 'Por que não aparece “Concluir matéria” no conteúdo?',
      resposta: 'Esse botão aparece para quem responde pelo conteúdo, para quem é responsável pela pauta e para administradores. Os conteúdos que nascem das publicações previstas do “Registrar atividade” não têm quem responda por eles: ali, o botão aparece só para o responsável pela pauta e para administradores.\n\nSe não é o seu caso, escreva, toque em “Salvar” e peça a uma dessas pessoas para enviar à aprovação. Com o conteúdo já em aprovação, o botão se chama “Atualizar aprovação”.',
      termos: ['enviar para aprovação', 'botão sumiu', 'concluir'],
    },
    {
      id: 'onde-ficam-os-arquivos',
      pergunta: 'Onde ponho as fotos e os vídeos da pauta?',
      resposta: 'Na aba “Arquivos” da sala, como links: toque em “Adicionar link”, preencha “Nome” e “Link do Drive” e toque em “Salvar link”. A pauta guarda o endereço, não o arquivo. Para pôr uma imagem, um vídeo ou um áudio dentro de um conteúdo, use os botões de mídia do editor, que sobem o arquivo para a Biblioteca.',
      termos: ['anexo', 'foto', 'vídeo', 'drive', 'upload', 'enviar arquivo'],
    },
    {
      id: 'conteudo-salva-sozinho',
      pergunta: 'O conteúdo salva sozinho?',
      resposta: 'Não. O texto só é gravado quando você toca em “Salvar”, “Enviar para aprovação” ou “Arquivar e continuar depois”. Enquanto aparecer “Alterações não salvas”, o que você escreveu ainda não foi gravado, e sair da tela antes perde essas mudanças.\n\nO aviso “Salvo automaticamente” só quer dizer que não há mudança pendente desde o último “Salvar”. Cada “Salvar” conta uma versão nova.',
      termos: ['salvar', 'perdi o texto', 'salvamento automático', 'rascunho', 'salvo automaticamente'],
    },
    {
      id: 'status-do-conteudo',
      pergunta: 'O que quer dizer o status do conteúdo?',
      resposta: '“Rascunho”: o conteúdo nasceu e ainda não foi enviado; “Aprovação”: há uma rodada de votos aberta; “Produção”: alguém pediu ajustes na rodada; “Pronto”: todos aprovaram; “Arquivado”: alguém escolheu “Arquivar e continuar depois” (ou “Cancelar aprovação e arquivar”).\n\nO conteúdo arquivado continua na aba “Conteúdos” da sala: abra e siga de onde parou.',
      termos: ['situação', 'rascunho', 'aprovação', 'produção', 'pronto', 'arquivado', 'selo'],
    },
    {
      id: 'nao-consigo-enviar-aprovacao',
      pergunta: 'Por que não consigo enviar o conteúdo para aprovação?',
      resposta: 'O envio pede um título com pelo menos 3 caracteres e um texto com pelo menos 10. Também precisa de ao menos uma pessoa para votar: quem você marcar em “Quem precisa aprovar” ou os participantes da pauta.\n\nQuem criou o conteúdo, quem responde por ele e quem envia não contam, porque ninguém aprova o próprio texto. Se só sobrou gente assim, marque outra pessoa.',
      termos: ['erro', 'escolha pelo menos uma pessoa', 'revisar', 'aprovadores', 'não envia'],
    },
  ],
  relacionadas: ['/aprovacoes', '/calendario', '/projetos', '/redes', '/cerebro'],
}

// ---------------------------------------------------------------- Calendário

const CALENDARIO: GuiaDaArea = {
  href: '/calendario',
  paraQueServe: 'O calendário editorial junta, mês a mês, as datas do trabalho: prazos, atividades registradas e publicações previstas ou agendadas. O item ligado a um conteúdo ou a uma pauta abre direto nele.',
  quemUsa: 'Toda a equipe vê o calendário e cria agendamentos.',
  tour: [
    {
      titulo: 'O calendário editorial',
      texto: 'Prazos, atividades e publicações do espaço, mês a mês. As datas vêm do registro das pautas, dos agendamentos feitos aqui e das publicações agendadas.',
    },
    {
      alvo: 'calendario.mes',
      titulo: 'Trocar de mês',
      texto: 'O calendário abre no mês atual. Escolha outro mês e ano no campo do mês; ao lado aparece o nome do mês aberto.',
    },
    {
      alvo: 'calendario.grade',
      titulo: 'Os itens de cada dia',
      texto: 'Cada item traz o título e, embaixo, o canal ou o tipo, com o horário. Publicações aparecem em destaque, e tocar abre o conteúdo ou a pauta ligada.',
    },
    {
      alvo: 'calendario.agendar',
      titulo: 'Agendar',
      texto: '“Agendar” cria uma data com título, dia, horário e tipo (“Publicação”, “Prazo” ou “Atividade”). Com “Criar pauta integrada”, a data ganha uma pauta no quadro.',
    },
  ],
  tarefas: [
    {
      id: 'agendar-data',
      titulo: 'Agendar uma data',
      passos: [
        'Toque em “Agendar”.',
        'Preencha “Título” e “Data”; o “Horário” é opcional.',
        'Escolha o “Tipo”: “Publicação”, “Prazo” ou “Atividade”.',
        'Se a data precisa de uma pauta, marque “Criar pauta integrada”.',
        'Toque em “Salvar agendamento”.',
      ],
      dica: 'Com “Criar pauta integrada”, nasce uma pauta em “Entrada” com o mesmo título, a data como prazo e você como responsável; o item do calendário passa a abrir essa pauta.',
    },
    {
      id: 'ver-outro-mes',
      titulo: 'Ver outro mês',
      passos: [
        'No alto, toque no campo do mês.',
        'Escolha o mês e o ano.',
        'Para voltar, escolha o mês atual no mesmo campo.',
      ],
      dica: 'O calendário traz as datas a partir de seis meses atrás; meses mais antigos aparecem vazios.',
    },
    {
      id: 'abrir-item',
      titulo: 'Abrir o que está por trás de uma data',
      passos: [
        'Toque no item, no dia.',
        'Se ele tem um conteúdo ligado, o editor do conteúdo abre; se tem só a pauta, abre a sala da pauta.',
        'Item que não abre não tem pauta nem conteúdo ligados.',
      ],
    },
  ],
  perguntas: [
    {
      id: 'de-onde-vem-cada-item',
      pergunta: 'De onde vêm os itens do calendário?',
      resposta: 'De quatro lugares: a “Data da atividade / prazo” de uma pauta feita em “Registrar atividade” (aparece como “Atividade”); as publicações previstas no mesmo formulário; os agendamentos feitos aqui, em “Agendar”; e as publicações agendadas em “Publicações”, com o nome do canal.',
      termos: ['origem', 'agenda', 'eventos', 'datas'],
    },
    {
      id: 'pauta-fora-do-calendario',
      pergunta: 'Por que a minha pauta não aparece no calendário?',
      resposta: 'Uma pauta entra no calendário quando é registrada em “Registrar atividade” com a “Data da atividade / prazo”, ou criada pelo “Agendar” com “Criar pauta integrada”. Prazo posto ou mudado depois, no cartão do quadro ou na linha do tempo do projeto, não cria nem move a data no calendário.',
      termos: ['prazo', 'data', 'sumiu', 'não aparece'],
    },
    {
      id: 'mudar-ou-apagar-data',
      pergunta: 'Dá para mudar ou apagar uma data do calendário?',
      resposta: 'Não por esta tela: o calendário só cria datas. As datas ligadas a uma pauta somem junto quando a pauta é excluída.',
      termos: ['editar', 'excluir', 'remover', 'apagar agendamento'],
    },
    {
      id: 'item-nao-abre',
      pergunta: 'Por que um item não abre quando toco nele?',
      resposta: 'O item abre o conteúdo ou a pauta ligada a ele. Agendamentos feitos sem “Criar pauta integrada” e as publicações agendadas em “Publicações” não têm pauta nem conteúdo ligados, então só marcam a data.',
      termos: ['clicar', 'link', 'não abre'],
    },
    {
      id: 'itens-em-destaque',
      pergunta: 'Por que alguns itens aparecem em destaque?',
      resposta: 'O destaque marca as publicações. Prazos e atividades aparecem em cinza. Embaixo do título vêm o canal (quando há) ou o tipo, e o horário.',
      termos: ['cores', 'publicação', 'prazo', 'atividade'],
    },
    {
      id: 'mes-antigo-vazio',
      pergunta: 'Por que um mês antigo aparece vazio?',
      resposta: 'O calendário carrega as datas a partir de seis meses atrás. O que é mais antigo continua registrado, mas não aparece aqui.',
      termos: ['histórico', 'passado', 'vazio'],
    },
    {
      id: 'calendario-no-celular',
      pergunta: 'Como fica o calendário no celular?',
      resposta: 'Em tela estreita, a grade do mês vira uma lista só com os dias que têm alguma coisa, em ordem.',
      termos: ['celular', 'lista', 'agenda', 'telefone'],
    },
  ],
  relacionadas: ['/pautas', '/redes', '/projetos'],
}

// ---------------------------------------------------------------- Projetos

const PROJETOS: GuiaDaArea = {
  href: '/projetos',
  paraQueServe: 'Projetos reúne campanhas, eventos e iniciativas com começo, meio e fim. A carteira mostra, numa linha por projeto, a situação, o progresso, o responsável, o prazo final e a última atualização. Dentro de cada projeto ficam as atualizações de status, os marcos e a linha do tempo das pautas.',
  quemUsa: 'Toda a equipe cria e edita projetos, publica atualizações, mexe nos marcos e conclui ou reabre projetos. “Excluir projeto” aparece para quem criou o projeto e para administradores; a lixeira de uma atualização, para quem a escreveu e para administradores.',
  tour: [
    {
      titulo: 'A carteira de projetos',
      texto: 'Uma linha por projeto, do que pede mais atenção para o que pede menos: primeiro os atrasados, depois os em risco, os sem atualização e os no prazo.',
    },
    {
      alvo: 'projetos.abas',
      titulo: 'Em andamento ou concluídos',
      texto: '“Em andamento”, “Concluídos” e “Todos”, com a contagem de cada um. Ao lado, “Buscar projeto” procura pelo nome.',
    },
    {
      alvo: 'projetos.lista',
      titulo: 'O que cada coluna diz',
      texto: '“Situação” vem da última atualização de status; “Progresso” conta as pautas prontas. “Última atualização” fica em destaque com mais de 14 dias sem novidade.',
    },
    {
      alvo: 'projetos.novo',
      titulo: 'Novo projeto',
      texto: '“Novo projeto” pede nome, objetivo, início, prazo final e responsável. Criado, o projeto abre para você pôr pautas e marcos.',
    },
  ],
  telas: [
    {
      caminho: '/projetos/[id]',
      rotulo: 'Página do projeto',
      tour: [
        {
          alvo: 'projetos.cabecalho',
          titulo: 'O projeto',
          texto: 'O nome, a situação, o período (início → prazo final) e o responsável. Passado o prazo final sem concluir, aparece “Prazo final vencido”.',
        },
        {
          alvo: 'projetos.acoes',
          titulo: 'Pautas e ajustes',
          texto: '“Nova pauta” registra uma pauta já dentro do projeto; “Quadro” abre o quadro só com as pautas dele. “Editar” muda os dados, e “Concluir” fecha o projeto.',
        },
        {
          alvo: 'projetos.atualizacao',
          titulo: 'Atualização de status',
          texto: 'Escolha “No prazo”, “Em risco” ou “Atrasado” e conte o que avançou e o que trava. É essa atualização que define a situação na carteira.',
        },
        {
          alvo: 'projetos.resumo',
          titulo: 'Resumo e progresso',
          texto: 'O progresso é quantas pautas do projeto estão em “Pronto”, sobre o total (arquivadas não contam). Embaixo, quantos dias faltam ou quantos de atraso.',
        },
        {
          alvo: 'projetos.marcos',
          titulo: 'Marcos',
          texto: 'As datas que não podem passar, como o dia do evento. Marque cada uma quando cumprir; marco vencido e não cumprido fica com a data em vermelho.',
        },
        {
          alvo: 'projetos.abas-do-projeto',
          titulo: 'Linha do tempo',
          texto: 'Em “Linha do tempo”, as pautas viram barras entre início e prazo, os marcos viram losangos e uma linha marca hoje. Tocar numa barra abre as datas da pauta para mudar.',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'criar-projeto',
      titulo: 'Criar um projeto',
      passos: [
        'Em “Projetos”, toque em “Novo projeto”.',
        'Preencha o “Nome” (pelo menos 3 caracteres) e, se quiser, o “Objetivo”.',
        'Defina “Início” e “Prazo final”.',
        'Escolha o “Responsável” (“Eu mesmo” é você).',
        'Toque em “Criar projeto”. A página do projeto abre.',
      ],
    },
    {
      id: 'por-pautas-no-projeto',
      titulo: 'Pôr pautas num projeto',
      passos: [
        'Para uma pauta nova: na página do projeto, toque em “Nova pauta”. O formulário já vem com o projeto escolhido.',
        'Para uma pauta que já existe: abra a sala da pauta e toque no nome do projeto (ou em “Sem projeto vinculado”), ou em “Mais opções” e depois “Alterar projeto”.',
        'Escolha o projeto em “Projeto” e toque em “Salvar”.',
      ],
      dica: 'No quadro do projeto (botão “Quadro”), “Adicionar pauta” já cria o cartão dentro dele.',
    },
    {
      id: 'publicar-atualizacao',
      titulo: 'Atualizar a situação do projeto',
      passos: [
        'Abra o projeto, na aba “Visão geral”.',
        'Em “Atualização de status”, escolha “No prazo”, “Em risco” ou “Atrasado”.',
        'Escreva o que avançou, o que está travando e qual é o próximo passo.',
        'Toque em “Publicar atualização”.',
      ],
      dica: 'A atualização entra no histórico logo abaixo e define a situação na carteira. Com mais de 14 dias sem atualização, a carteira destaca a “Última atualização” do projeto.',
    },
    {
      id: 'editar-projeto',
      titulo: 'Mudar os dados de um projeto',
      passos: [
        'Abra o projeto e toque em “Editar”.',
        'Ajuste “Nome”, “Objetivo”, “Início”, “Prazo final” ou “Responsável”.',
        'Toque em “Salvar”.',
      ],
      dica: 'Mudar as datas do projeto não mexe nas datas das pautas nem nos marcos.',
    },
    {
      id: 'marcar-marcos',
      titulo: 'Marcar as datas importantes (marcos)',
      passos: [
        'Em “Marcos”, escreva o nome em “Novo marco”.',
        'Escolha a data e toque em “Adicionar”.',
        'Quando cumprir, marque a caixa ao lado do marco.',
        'Para apagar, passe o mouse sobre o marco e toque na lixeira.',
      ],
    },
    {
      id: 'datas-na-linha-do-tempo',
      titulo: 'Pôr as pautas na linha do tempo',
      passos: [
        'Abra o projeto e toque em “Linha do tempo”.',
        'Em “Sem datas”, toque em “Definir datas” na pauta; para uma que já está na linha, toque na barra dela.',
        'Preencha “Início” e “Prazo” e toque em “Salvar datas”.',
      ],
      dica: 'São as mesmas datas do cartão no quadro: mudar aqui muda lá. Com só uma das duas datas, a pauta aparece como um dia.',
    },
    {
      id: 'concluir-projeto',
      titulo: 'Concluir ou reabrir um projeto',
      passos: [
        'Abra o projeto e toque em “Concluir”.',
        'Ele passa para a aba “Concluídos” da carteira, com a situação “Concluído”.',
        'Para voltar atrás, abra o projeto e toque em “Reabrir”.',
      ],
      dica: 'Concluir não mexe nas pautas: as que estão em aberto continuam no quadro.',
    },
    {
      id: 'excluir-projeto',
      titulo: 'Excluir um projeto',
      passos: [
        'Em “Projetos”, abra o projeto.',
        'Toque em “Excluir projeto”.',
        'Leia o aviso e toque em “Excluir definitivamente”.',
      ],
      dica: 'As pautas do projeto não são apagadas: ficam sem projeto. O projeto não volta; se ele só terminou, prefira “Concluir”.',
      quem: 'Quem criou o projeto e administradores',
    },
  ],
  perguntas: [
    {
      id: 'de-onde-vem-a-situacao',
      pergunta: 'De onde vem a situação do projeto?',
      resposta: 'Da última atualização de status publicada: “No prazo”, “Em risco” ou “Atrasado”. Antes da primeira, o projeto fica “Sem atualização”; concluído, fica “Concluído”. A situação não muda sozinha com as datas: alguém precisa publicar a atualização.',
      termos: ['status', 'situação', 'no prazo', 'em risco', 'atrasado', 'sem atualização'],
    },
    {
      id: 'como-conta-o-progresso',
      pergunta: 'Como o progresso é calculado?',
      resposta: 'É a parte das pautas do projeto que está em “Pronto”. Pautas arquivadas não entram na conta, e um projeto sem pautas fica em 0%.',
      termos: ['porcentagem', 'barra', 'andamento'],
    },
    {
      id: 'ultima-atualizacao-em-destaque',
      pergunta: 'Por que a “Última atualização” de um projeto está em destaque?',
      resposta: 'Porque o projeto está em andamento e não recebe atualização de status há mais de 14 dias (ou nunca recebeu). Publique uma atualização para a equipe saber como ele está.',
      termos: ['amarelo', 'desatualizado', 'nunca'],
    },
    {
      id: 'prazo-final-vermelho',
      pergunta: 'O que quer dizer o prazo final em vermelho?',
      resposta: 'O prazo final passou e o projeto não foi concluído. Na página do projeto aparece “Prazo final vencido” e, no “Resumo”, os dias de atraso.',
      termos: ['atraso', 'vencido', 'prazo'],
    },
    {
      id: 'apagar-atualizacao',
      pergunta: 'Dá para apagar uma atualização?',
      resposta: 'Sim, pela lixeira da atualização, que aparece para quem a escreveu e para administradores. A situação do projeto volta a ser a da atualização anterior.',
      termos: ['excluir', 'errei', 'desfazer'],
    },
    {
      id: 'excluir-projeto-e-pautas',
      pergunta: 'Se eu excluir um projeto, as pautas somem?',
      resposta: 'Não. As pautas continuam no quadro, só ficam sem projeto. Já o projeto, com as atualizações e os marcos, não volta. Se o projeto só terminou, prefira “Concluir”.',
      termos: ['apagar projeto', 'deletar', 'pautas'],
    },
    {
      id: 'pauta-fora-da-linha-do-tempo',
      pergunta: 'Por que uma pauta do projeto não aparece na linha do tempo?',
      resposta: 'A linha do tempo só desenha pautas com início ou prazo. As que não têm data ficam na lista “Sem datas”, logo abaixo, com o botão “Definir datas”. Pautas arquivadas não aparecem.',
      termos: ['cronograma', 'gantt', 'barra', 'sem data'],
    },
    {
      id: 'quadro-do-projeto',
      pergunta: 'Como vejo só as pautas de um projeto no quadro?',
      resposta: 'Na página do projeto, toque em “Quadro”. O quadro de Pautas abre com o nome do projeto no título e só com as pautas dele; “Limpar filtro” volta ao quadro inteiro.',
      termos: ['filtrar', 'kanban', 'pautas do projeto'],
    },
  ],
  relacionadas: ['/pautas', '/calendario'],
}

export const guias: GuiaDaArea[] = [RADAR, PAUTAS, CALENDARIO, PROJETOS]
