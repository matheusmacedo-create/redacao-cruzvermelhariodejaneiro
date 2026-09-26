import type { GuiaDaArea, PassoDoTour, Pergunta, Tarefa, TelaDaArea, TopicoGeral } from './tipos'

/**
 * A ajuda da Área do Voluntário (/membro): as boas-vindas, o tour de cada
 * destino (e das telas internas), o passo a passo e as perguntas frequentes.
 * Mesmo formato da Redação (./tipos), mas com registro próprio: a área não
 * está em lib/navegacao.ts e quem entra não tem conta no Supabase Auth.
 *
 * A chave de cada guia é o `href` do destino em components/membro/navegacao.tsx
 * (SECOES). O que a pessoa já viu fica no aparelho (components/membro/ajuda.tsx).
 *
 * Cada frase aqui tem apoio no código da área (app/membro, components/membro,
 * lib/membro, app/actions/membro.ts e as funções `membro_*` do banco). Mudou a
 * tela ou a regra, muda aqui no mesmo PR (docs/AJUDA.md §5). Os alvos
 * `membro.*` são marcados com `data-ajuda` nos componentes da área.
 *
 * Módulo puro, sem imports de runtime: vai para o celular do voluntário e é
 * conferido com script (npx tsx scripts/conferir-ajuda.ts).
 */

// ---------------------------------------------------------------- boas-vindas

/**
 * O tour do convite de boas-vindas (e do "Refazer o tour de boas-vindas").
 * Aponta só para o que está em toda tela (as abas e o menu da conta): roda em
 * qualquer página da área. Das duas navegações, só uma está na tela — a barra
 * de baixo até lg, as abas do alto a partir dele —, e a outra some.
 */
export const BOAS_VINDAS_DO_MEMBRO: PassoDoTour[] = [
  {
    titulo: 'Boas-vindas à Área do Voluntário',
    texto: 'Aqui você faz seus cursos, se inscreve em ações e fala com a coordenação do Voluntariado. Em um minuto, mostramos onde fica cada coisa.',
  },
  {
    alvo: 'membro.navegacao-celular',
    titulo: 'Tudo a um toque',
    texto: 'A barra de baixo leva aos cinco destinos da área e fica sempre no mesmo lugar. O número em “Mensagens” conta respostas e avisos novos.',
    seAusente: 'pular',
  },
  {
    alvo: 'membro.navegacao-topo',
    titulo: 'Os cinco destinos',
    texto: 'As abas no alto levam aos cinco destinos da área e ficam sempre no mesmo lugar. O número em “Mensagens” conta respostas e avisos novos.',
    seAusente: 'pular',
  },
  {
    alvo: 'membro.nav-inicio',
    titulo: 'Início',
    texto: 'Primeiro aparece o que pede sua atenção, como um termo para aceitar ou uma prova final por fazer. Depois, sua próxima atividade, seu curso e suas horas.',
  },
  {
    alvo: 'membro.nav-formacao',
    titulo: 'Formação',
    texto: 'Cursos no seu ritmo, apostilas e certificados. Concluiu um curso, o certificado sai na hora, com um código que qualquer pessoa confere.',
  },
  {
    alvo: 'membro.nav-oportunidades',
    titulo: 'Oportunidades',
    texto: 'Ações, plantões e eventos da filial (no celular, a aba “Ações”). Com a presença confirmada pela coordenação, as horas entram no seu cadastro.',
  },
  {
    alvo: 'membro.nav-mensagens',
    titulo: 'Mensagens',
    texto: 'Fale direto com a coordenação do Voluntariado: a resposta chega aqui e no seu e-mail. Em “Avisos” ficam os recados para todo o voluntariado.',
  },
  {
    alvo: 'membro.conta',
    titulo: 'Perfil e Ajuda',
    texto: 'Seus dados ficam em “Perfil”. No menu da sua conta (as suas iniciais, no alto) estão “Meu perfil”, “Ajuda”, “Sair” e, nas telas que têm tour, “Tour desta tela”.',
  },
]

// ---------------------------------------------------------------- Início

const INICIO: GuiaDaArea = {
  href: '/membro',
  paraQueServe: 'O Início junta o que é seu. Primeiro, o que pede ação: um termo de bem para aceitar ou uma prova final por fazer. Depois, sua próxima atividade, o curso em andamento, seus números, os avisos da coordenação, seus certificados e as últimas atividades.',
  quemUsa: 'Cursos, inscrições, horas e certificados são só seus. Os avisos e as oportunidades abertas são os mesmos para todo o voluntariado.',
  tour: [
    {
      titulo: 'Seu Início',
      texto: 'O Início mostra primeiro o que pede ação e esconde o que ainda não tem nada a mostrar, como os números de quem acabou de chegar.',
    },
    {
      alvo: 'membro.pendencias',
      titulo: 'Pendências',
      texto: 'Quando há um termo de bem para aceitar ou uma prova final por fazer, o aviso fica no alto, com o botão que leva direto.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.primeiros-passos',
      titulo: 'Primeiros passos',
      texto: 'Para quem está chegando: contato de emergência, primeiro curso e primeira ação. O que você já fez ganha um check.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.atividade',
      titulo: 'Sua próxima atividade',
      texto: 'Aqui fica a próxima ação em que você tem vaga ou está na lista de espera. Sem nenhuma, aparecem as oportunidades abertas mais próximas.',
    },
    {
      alvo: 'membro.curso',
      titulo: 'Seu curso',
      texto: '“Continuar” leva direto à próxima aula do curso em andamento. Sem curso começado, aparece um para começar.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.numeros',
      titulo: 'Seus números',
      texto: 'Horas no ano e no total, ações no ano e formações em dia, a partir do que está registrado no seu cadastro.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.ajuda-link',
      titulo: 'Dúvidas?',
      texto: 'No fim do Início e no menu da sua conta fica a “Ajuda”, com o passo a passo de cada parte da área e as perguntas frequentes.',
    },
  ],
  tarefas: [
    {
      id: 'ver-minhas-horas',
      titulo: 'Ver quantas horas você já fez',
      passos: [
        'Abra o “Início”.',
        'Na faixa de números, veja as horas do ano e, logo abaixo, o total.',
        'Em “Últimas atividades”, veja as mais recentes, com as horas de cada uma.',
      ],
      dica: 'As horas de uma ação entram quando a coordenação registra a sua presença.',
    },
    {
      id: 'agenda-pelo-inicio',
      titulo: 'Pôr a próxima atividade na agenda',
      passos: [
        'No “Início”, vá até “Sua próxima atividade”.',
        'Toque em “Adicionar à agenda”: o aparelho baixa um arquivo de calendário.',
        'Abra o arquivo e confirme no seu aplicativo de agenda.',
      ],
    },
    {
      id: 'resolver-pendencia',
      titulo: 'Resolver uma pendência do alto do Início',
      passos: [
        'Leia o aviso no alto do “Início”.',
        'Termo de bem: toque em “Conferir e aceitar” e siga no “Perfil”.',
        'Prova final: toque em “Fazer a prova” (ou em “Ver cursos”, se forem várias).',
      ],
      dica: 'Resolvida a pendência, o aviso some sozinho.',
    },
  ],
  perguntas: [
    {
      id: 'numeros-nao-aparecem',
      pergunta: 'Por que não aparecem meus números?',
      resposta: 'A faixa de números só aparece quando há algo para contar: horas ou ações registradas, ou uma formação em dia. Para quem acabou de chegar, ela fica escondida em vez de mostrar zeros.',
      termos: ['horas', 'zero', 'estatísticas', 'contagem'],
    },
    {
      id: 'primeiros-passos-sumiram',
      pergunta: 'Os “Primeiros passos” sumiram. Por quê?',
      resposta: 'Eles aparecem só para quem acabou de chegar. Assim que você tem horas registradas, uma formação ou uma inscrição, o Início passa a mostrar o que é seu.',
      termos: ['checklist', 'começar', 'novo'],
    },
    {
      id: 'horas-nao-entraram',
      pergunta: 'Participei de uma ação, mas as horas não entraram. E agora?',
      resposta: 'As horas entram quando a coordenação registra a sua presença. Até lá, o cartão da ação em “Oportunidades” mostra “Aguardando registro de presença”.\n\nSe demorar, ou se aparecer “Ausência registrada” e você foi, escreva para a coordenação em “Mensagens”.',
      termos: ['horas', 'presença', 'faltou', 'não contou'],
    },
    {
      id: 'todos-os-avisos',
      pergunta: 'Onde vejo todos os avisos?',
      resposta: 'O Início mostra os três primeiros, com os fixados na frente. A lista completa fica em “Mensagens”, na aba “Avisos”. Aviso com prazo sai do mural quando vence.',
      termos: ['mural', 'recados', 'comunicados'],
    },
  ],
}

// ---------------------------------------------------------------- Formação

const FORMACAO: GuiaDaArea = {
  href: '/membro/cursos',
  paraQueServe: 'Formação reúne os cursos da Cruz Vermelha RJ para o voluntariado, as apostilas e os seus certificados. Você faz os cursos no seu ritmo; ao concluir as aulas (e passar na prova final, quando o curso tem uma), o certificado sai na hora, com um código que qualquer pessoa confere.',
  tour: [
    {
      titulo: 'Formação',
      texto: 'Os cursos ficam aqui, no seu ritmo: dá para parar e continuar depois, a partir da próxima aula.',
    },
    {
      alvo: 'membro.abas-formacao',
      titulo: 'Cursos, apostilas e certificados',
      texto: 'As abas levam aos “Cursos”, às “Apostilas” (materiais em PDF) e aos seus “Certificados”.',
    },
    {
      alvo: 'membro.cursos',
      titulo: 'Os cursos',
      texto: 'Cada cartão mostra as aulas, a carga horária e se tem prova. Embaixo, onde você está: a barra de progresso, “Falta a prova final” ou “Concluído”.',
      seAusente: 'pular',
    },
    {
      titulo: 'Como se conclui um curso',
      texto: 'Em cada aula, toque em “Concluir e seguir”. No fim, faça a prova final, se houver. Com a aprovação, o certificado aparece em “Certificados”.',
    },
  ],
  telas: [
    {
      caminho: '/membro/cursos/[id]',
      rotulo: 'Curso',
      tour: [
        {
          alvo: 'membro.painel-do-curso',
          titulo: 'Sobre o curso',
          texto: 'Aulas, carga horária, nota mínima da prova e validade do certificado. O botão leva à próxima aula, à prova final ou ao certificado.',
        },
        {
          alvo: 'membro.conteudo-do-curso',
          titulo: 'Conteúdo do curso',
          texto: 'As aulas, módulo a módulo. O check marca as concluídas e “Próxima” mostra onde você parou. Dá para abrir qualquer aula.',
          seAusente: 'pular',
        },
        {
          alvo: 'membro.item-da-prova',
          titulo: 'Prova final',
          texto: 'A prova libera quando todas as aulas estão concluídas. São até 3 tentativas a cada 24 horas.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/membro/cursos/[id]/aulas/[aulaId]',
      rotulo: 'Aula',
      tour: [
        {
          titulo: 'A aula',
          texto: 'Cada aula pode ter vídeo, texto e uma apostila em PDF. Veja no seu ritmo.',
        },
        {
          alvo: 'membro.concluir-aula',
          titulo: 'Marque a aula como concluída',
          texto: '“Concluir e seguir” marca a aula e abre a próxima. Assistir ao vídeo não marca sozinho: a aula só conta com esse toque.',
          seAusente: 'pular',
        },
        {
          alvo: 'membro.aulas-do-curso',
          titulo: 'Aulas do curso',
          texto: 'A lista de aulas com o seu progresso. No celular, ela vem depois da aula.',
        },
      ],
    },
    {
      caminho: '/membro/cursos/[id]/prova',
      rotulo: 'Prova final',
      tour: [
        {
          titulo: 'Regras da prova',
          texto: 'Responda todas as questões e envie. Para passar, a nota precisa chegar à mínima do curso. São até 3 tentativas a cada 24 horas.',
        },
        {
          alvo: 'membro.prova',
          titulo: 'As questões',
          texto: 'Escolha uma alternativa em cada questão. Se faltar alguma ao enviar, a tela leva até ela e avisa qual é.',
          seAusente: 'pular',
        },
        {
          alvo: 'membro.enviar-prova',
          titulo: 'Enviar respostas',
          texto: 'A barra mostra quantas você já respondeu. Com a aprovação, o certificado sai na hora; senão, a tela mostra a nota e quantas tentativas restam.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/membro/apostilas',
      rotulo: 'Apostilas',
      tour: [
        {
          titulo: 'Apostilas',
          texto: 'Materiais de estudo e consulta da Cruz Vermelha RJ, em PDF. As de um curso ficam juntas, com “Ver curso”.',
        },
        {
          alvo: 'membro.apostilas',
          titulo: 'Abrir uma apostila',
          texto: 'Toque na apostila: o PDF abre numa nova aba, e a área continua aberta nesta.',
          seAusente: 'pular',
        },
        {
          titulo: 'A apostila de uma aula',
          texto: 'Dentro da aula, “Abrir a apostila desta aula” leva direto ao PDF daquela aula.',
        },
      ],
    },
    {
      caminho: '/membro/certificados',
      rotulo: 'Certificados',
      tour: [
        {
          alvo: 'membro.certificados',
          titulo: 'Seus certificados',
          texto: 'Cada certificado tem um código. Quando o curso tem validade, o selo mostra até quando ele vale. “Baixar PDF” entrega o arquivo.',
          seAusente: 'pular',
        },
        {
          alvo: 'membro.acoes-do-certificado',
          titulo: 'Para quem pediu comprovante',
          texto: '“Copiar link de verificação” copia o endereço público do certificado. Quem abrir vê se ele é autêntico e está válido.',
          seAusente: 'pular',
        },
        {
          titulo: 'Outras formações',
          texto: 'Se a coordenação registrou outras formações no seu cadastro, elas aparecem embaixo, em “Outras formações no seu cadastro”.',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'fazer-um-curso',
      titulo: 'Fazer um curso',
      passos: [
        'Abra “Formação” e toque no cartão do curso.',
        'Em “Sobre o curso”, veja as aulas, a carga horária e se há prova final.',
        'Toque em “Começar o curso”.',
        'Assista ou leia a aula e toque em “Concluir e seguir”.',
        'Repita até a última aula, onde o botão é “Concluir aula”.',
        'Se o curso tiver prova, você segue direto para ela; se não tiver, o certificado sai na hora.',
      ],
      dica: 'Dá para parar quando quiser: o botão do curso passa a ser “Continuar: …”, com o nome da próxima aula.',
    },
    {
      id: 'fazer-a-prova',
      titulo: 'Fazer a prova final',
      passos: [
        'Conclua todas as aulas do curso.',
        'Na página do curso, toque em “Fazer a prova final”.',
        'Escolha uma alternativa em cada questão.',
        'Toque em “Enviar respostas”.',
        'Passou: toque em “Baixar certificado”. Não passou: toque em “Rever as aulas” ou em “Tentar de novo”.',
      ],
      dica: 'São até 3 tentativas a cada 24 horas. Antes de tentar de novo, vale rever as aulas.',
    },
    {
      id: 'baixar-certificado',
      titulo: 'Baixar um certificado',
      passos: [
        'Abra “Formação” e toque na aba “Certificados”.',
        'No cartão do certificado, toque em “Baixar PDF”.',
      ],
      dica: 'Quando o certificado sai, você também recebe um e-mail com o link.',
    },
    {
      id: 'mandar-certificado',
      titulo: 'Mandar o certificado para quem pediu comprovante',
      passos: [
        'Em “Certificados”, ache o cartão do certificado.',
        'Toque em “Copiar link de verificação”.',
        'Cole o link na mensagem para a pessoa: ela confere ali se o certificado é autêntico e está válido.',
      ],
      dica: '“Adicionar ao LinkedIn” abre o LinkedIn com o nome do curso e a data já preenchidos.',
    },
    {
      id: 'abrir-apostila',
      titulo: 'Abrir uma apostila',
      passos: [
        'Abra “Formação” e toque na aba “Apostilas”.',
        'Toque na apostila: o PDF abre numa nova aba.',
      ],
    },
  ],
  perguntas: [
    {
      id: 'aula-nao-marcou',
      pergunta: 'Assisti à aula, mas ela não aparece como concluída. Por quê?',
      resposta: 'A aula só conta quando você toca em “Concluir e seguir” (ou em “Concluir aula”, na última). Assistir ao vídeo não marca sozinho.',
      termos: ['progresso', 'não marcou', 'check', 'concluída', 'vídeo'],
    },
    {
      id: 'rever-aula',
      pergunta: 'Dá para rever uma aula já concluída?',
      resposta: 'Dá. Na página do curso, toque na aula em “Conteúdo do curso”. Numa aula já concluída, o botão de baixo vira “Próxima aula” e não muda o seu progresso.',
      termos: ['assistir de novo', 'revisar', 'voltar', 'aula anterior'],
    },
    {
      id: 'prova-bloqueada',
      pergunta: 'Por que a prova final está bloqueada?',
      resposta: 'A prova libera quando todas as aulas do curso estão concluídas. Até lá, o item “Prova final” fica com um cadeado e diz o que falta.',
      termos: ['cadeado', 'não abre', 'Conclua todas as aulas antes da prova.'],
    },
    {
      id: 'tentativas-da-prova',
      pergunta: 'Quantas vezes posso fazer a prova?',
      resposta: 'Até 3 tentativas a cada 24 horas. Usou as três, a tela diz a partir de quando dá para tentar de novo. Não há limite total: passadas as 24 horas, as tentativas voltam.',
      termos: ['reprovado', 'reprovei', 'tentativa', 'Você já fez 3 tentativas nas últimas 24 horas.'],
    },
    {
      id: 'nota-minima',
      pergunta: 'Qual nota preciso tirar?',
      resposta: 'Cada curso tem a sua nota mínima: ela aparece em “Sobre o curso” e no alto da prova. A nota vai de 0 a 100 e é a porcentagem de questões certas.',
      termos: ['aprovação', 'passar', 'média'],
    },
    {
      id: 'respostas-certas',
      pergunta: 'Dá para ver as respostas certas?',
      resposta: 'Não. A tela mostra a sua nota e quantas questões você acertou, mas não quais. Vale rever as aulas antes de tentar de novo.',
      termos: ['gabarito', 'correção', 'errei'],
    },
    {
      id: 'certificado-vence',
      pergunta: 'O certificado vence?',
      resposta: 'Depende do curso: alguns têm validade (“Certificado válido por N meses”, em “Sobre o curso”) e outros não. Em “Certificados”, o selo mostra “Vale até …”, “Vence em … dias” ou “Venceu em …”.',
      termos: ['validade', 'vencido', 'expirou', 'prazo'],
    },
    {
      id: 'renovar-certificado',
      pergunta: 'Meu certificado venceu. Como renovo?',
      resposta: 'Fale com a coordenação: no cartão do certificado vencido aparece o link “fale com a coordenação”, que abre uma mensagem sobre “Documentos e certificados”. Refazer o curso não emite outro certificado, porque cada curso tem um certificado ativo por pessoa.',
      termos: ['renovação', 'vencido', 'reciclagem', 'refazer'],
    },
    {
      id: 'conferir-certificado',
      pergunta: 'Como alguém confere se meu certificado é verdadeiro?',
      resposta: 'Cada certificado tem um código (no formato ABCD-2345) e um endereço público de verificação. Quem abrir o link de “Copiar link de verificação” ou de “Página de verificação” vê se ele é autêntico e está válido, com o seu nome, o curso e as datas, sem contato, CPF ou nota.',
      termos: ['verificação', 'autenticidade', 'código', 'comprovante', 'validar'],
    },
    {
      id: 'nome-no-certificado',
      pergunta: 'Meu nome saiu errado no certificado. E agora?',
      resposta: 'O certificado sai com o nome de “Dados do cadastro”, no seu Perfil, que só a coordenação altera. Toque em “Pedir correção”, em “Dados do cadastro”, e explique o que precisa mudar.\n\nO certificado já emitido guarda o nome que estava no cadastro no dia da emissão: diga na mensagem qual certificado saiu errado.',
      termos: ['nome errado', 'corrigir nome', 'nome social'],
    },
    {
      id: 'outras-formacoes',
      pergunta: 'O que são as “Outras formações no seu cadastro”?',
      resposta: 'São formações que a coordenação registrou no seu cadastro, sem certificado emitido aqui. Por isso não têm PDF nem link de verificação na área.',
      termos: ['formações', 'cursos externos', 'registro'],
    },
    {
      id: 'apostila-nao-abre',
      pergunta: 'A apostila não abre. O que faço?',
      resposta: 'O PDF abre numa nova aba. Se aparecer “Não foi possível abrir essa apostila agora”, tente de novo; se continuar, toque em “Avisar a coordenação”.',
      termos: ['PDF', 'material', 'erro', 'baixar apostila'],
    },
  ],
}

// ---------------------------------------------------------------- Oportunidades

const OPORTUNIDADES: GuiaDaArea = {
  href: '/membro/oportunidades',
  paraQueServe: 'Oportunidades são as ações, os plantões e os eventos da filial abertos ao voluntariado. Aqui você se inscreve, entra na lista de espera, põe a atividade na agenda e cancela se precisar. Com a presença confirmada pela coordenação, as horas entram no seu cadastro.',
  quemUsa: 'As outras pessoas do voluntariado não veem quem se inscreveu: aparece só quantas vagas restam.',
  tour: [
    {
      titulo: 'Oportunidades',
      texto: 'Três partes: “Minhas inscrições”, “Abertas para inscrição” e “Onde você já esteve”. No celular, a aba de baixo se chama “Ações”.',
    },
    {
      alvo: 'membro.oportunidade',
      titulo: 'O cartão',
      texto: 'Data, horário, local, vagas livres, prazo de inscrição e quantas horas a atividade vale. “Ler mais” abre a descrição inteira.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.participar',
      titulo: 'Quero participar',
      texto: '“Quero participar” garante a vaga na hora, e a confirmação chega por e-mail. Sem vagas, o botão vira “Entrar na lista de espera”.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.agenda',
      titulo: 'Adicionar à agenda',
      texto: 'Baixa a atividade para o calendário do seu celular ou computador. Na véspera, quem tem vaga também recebe um lembrete por e-mail.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.sair-da-atividade',
      titulo: 'Imprevisto?',
      texto: '“Cancelar inscrição” (ou “Sair da lista de espera”) libera o lugar para a próxima pessoa. Dá para sair até a atividade começar; depois disso, fale com a coordenação.',
      seAusente: 'pular',
    },
    {
      titulo: 'Horas no cadastro',
      texto: 'Depois da atividade, a coordenação registra a presença. Com “Presença confirmada”, as horas entram no seu cadastro e aparecem no Início.',
    },
  ],
  tarefas: [
    {
      id: 'inscrever-se',
      titulo: 'Inscrever-se numa ação',
      passos: [
        'Abra “Oportunidades” (no celular, “Ações”).',
        'Em “Abertas para inscrição”, leia o cartão: data, local, vagas e prazo.',
        'Toque em “Quero participar”.',
        'Pronto: o cartão passa para “Minhas inscrições” com “Inscrição confirmada”, e os detalhes chegam no seu e-mail.',
      ],
      dica: 'Sem vagas, o botão é “Entrar na lista de espera”: se abrir uma vaga, você sobe automaticamente, pela ordem de chegada.',
    },
    {
      id: 'cancelar-inscricao',
      titulo: 'Cancelar uma inscrição',
      passos: [
        'Em “Minhas inscrições”, ache o cartão da atividade.',
        'Toque em “Cancelar inscrição”.',
        'Confirme em “Sim, cancelar” (ou toque em “Manter inscrição”, se mudou de ideia).',
      ],
      dica: 'Dá para cancelar até a atividade começar. Se as inscrições já encerraram, depois de cancelar não dá para voltar: a tela avisa antes.',
    },
    {
      id: 'sair-da-lista-de-espera',
      titulo: 'Sair da lista de espera',
      passos: [
        'Em “Minhas inscrições”, ache o cartão com “Na lista de espera”.',
        'Toque em “Sair da lista de espera”.',
        'Confirme em “Sim, sair” (ou toque em “Ficar na lista”).',
      ],
    },
    {
      id: 'por-na-agenda',
      titulo: 'Pôr uma atividade na agenda',
      passos: [
        'Em “Minhas inscrições” (ou no Início, em “Sua próxima atividade”), toque em “Adicionar à agenda”.',
        'Abra o arquivo de calendário que o aparelho baixar.',
        'Confirme no seu aplicativo de agenda.',
      ],
    },
  ],
  perguntas: [
    {
      id: 'lista-de-espera',
      pergunta: 'Como funciona a lista de espera?',
      resposta: 'Quando as vagas acabam, “Entrar na lista de espera” guarda o seu lugar. Se alguém cancelar ou a coordenação abrir mais vagas, quem está na lista sobe automaticamente, pela ordem de chegada, e recebe um e-mail.',
      termos: ['lotada', 'vagas preenchidas', 'espera', 'fila'],
    },
    {
      id: 'nao-consigo-cancelar',
      pergunta: 'Não consigo cancelar. Por quê?',
      resposta: 'O cancelamento vale até o início da atividade. Depois disso, o botão some; se tiver um imprevisto, avise a coordenação em “Mensagens”.',
      termos: ['desistir', 'cancelar', 'A atividade já começou; fale com a coordenação.'],
    },
    {
      id: 'inscrever-de-novo',
      pergunta: 'Cancelei. Posso me inscrever de novo?',
      resposta: 'Pode, enquanto as inscrições estiverem abertas: a atividade volta para “Abertas para inscrição”. Se as inscrições já encerraram, não dá para voltar, e a tela avisa isso antes de você confirmar.',
      termos: ['reinscrever', 'voltar', 'mudei de ideia'],
    },
    {
      id: 'prazo-de-inscricao',
      pergunta: 'Até quando posso me inscrever?',
      resposta: 'Até o prazo que aparece no cartão (“Inscrições até …”) ou, quando não há prazo, até a atividade começar.',
      termos: ['prazo', 'encerrada', 'As inscrições já encerraram.'],
    },
    {
      id: 'atividade-cancelada',
      pergunta: 'O que significa “Cancelada”?',
      resposta: 'A coordenação cancelou a atividade. O motivo aparece no cartão, e quem tinha vaga ou estava na lista de espera recebe um e-mail.',
      termos: ['cancelamento', 'motivo', 'Esta oportunidade foi cancelada.'],
    },
    {
      id: 'aguardando-presenca',
      pergunta: 'O que é “Aguardando registro de presença”?',
      resposta: 'A atividade terminou e a coordenação ainda não registrou quem foi. Com “Presença confirmada”, as horas entram no seu cadastro. “Ausência registrada” quer dizer que a presença não foi confirmada: se você foi, fale com a coordenação.',
      termos: ['presença', 'ausência', 'horas', 'falta'],
    },
    {
      id: 'vale-horas',
      pergunta: 'O que é “Vale … h” no cartão?',
      resposta: 'São as horas que entram no seu cadastro quando a coordenação confirma a sua presença. Ao registrar a presença, a coordenação pode lançar outro número.',
      termos: ['horas', 'carga horária', 'quantas horas'],
    },
    {
      id: 'lembrete-da-atividade',
      pergunta: 'Recebo lembrete da atividade?',
      resposta: 'Sim: na véspera, quem tem vaga recebe um e-mail de lembrete. Quem está só na lista de espera não recebe.',
      termos: ['lembrete', 'aviso', 'e-mail', 'véspera'],
    },
    {
      id: 'quem-ve-inscricao',
      pergunta: 'Outras pessoas do voluntariado veem que eu me inscrevi?',
      resposta: 'Não. Para as outras pessoas aparece só quantas vagas restam, nunca quem se inscreveu.',
      termos: ['privacidade', 'lista de inscritos'],
    },
    {
      id: 'acoes-antigas',
      pergunta: 'Onde vejo as ações de que já participei?',
      resposta: 'Em “Onde você já esteve”, com as dos últimos 60 dias. As horas de todas ficam no seu cadastro: o Início mostra o total e as últimas atividades.',
      termos: ['histórico', 'passadas', 'participações'],
    },
  ],
}

// ---------------------------------------------------------------- Mensagens

const MENSAGENS: GuiaDaArea = {
  href: '/membro/mensagens',
  paraQueServe: 'Mensagens é o canal direto com a coordenação do Voluntariado. Em “Conversas”, você escreve e acompanha as respostas, que também chegam no seu e-mail. Em “Avisos”, ficam os recados da coordenação para todo o voluntariado.',
  quemUsa: 'Só você e quem cuida do Voluntariado na filial veem as suas conversas.',
  tour: [
    {
      alvo: 'membro.abas-mensagens',
      titulo: 'Conversas e avisos',
      texto: '“Conversas” são as suas mensagens com a coordenação; “Avisos”, os recados para todo o voluntariado. O número mostra o que é novo.',
    },
    {
      alvo: 'membro.nova-mensagem',
      titulo: 'Nova mensagem',
      texto: '“Nova mensagem” abre o formulário: o assunto, do que se trata em “Sobre” e o texto. A coordenação é avisada quando você envia.',
    },
    {
      alvo: 'membro.conversas',
      titulo: 'Suas conversas',
      texto: 'A mais recente fica no alto. “Resposta nova” marca o que você ainda não leu; “Aguardando resposta”, o que está com a coordenação.',
      seAusente: 'pular',
    },
    {
      titulo: 'A resposta',
      texto: 'Quando a coordenação responde, a resposta aparece aqui e chega no seu e-mail. O número em “Mensagens” avisa também.',
    },
  ],
  telas: [
    {
      caminho: '/membro/mensagens/[id]',
      rotulo: 'Conversa',
      tour: [
        {
          alvo: 'membro.mensagens-da-conversa',
          titulo: 'A conversa',
          texto: 'As suas mensagens ficam à direita; as da coordenação, à esquerda, com o primeiro nome de quem respondeu.',
        },
        {
          alvo: 'membro.responder',
          titulo: 'Responder',
          texto: 'Escreva e toque no botão de enviar, ao lado do campo. No computador, Ctrl+Enter (⌘+Enter no Mac) também envia.',
        },
        {
          titulo: 'Conversa encerrada',
          texto: 'Se a coordenação encerrar a conversa, ainda dá para escrever: a sua mensagem reabre a conversa.',
        },
      ],
    },
    {
      caminho: '/membro/avisos',
      rotulo: 'Avisos',
      tour: [
        {
          alvo: 'membro.avisos',
          titulo: 'Os avisos',
          texto: 'Os fixados ficam no alto; depois, os mais novos. “Novo” marca o que você ainda não tinha visto.',
          seAusente: 'pular',
        },
        {
          alvo: 'membro.abas-mensagens',
          titulo: 'Avisos e conversas',
          texto: 'Os avisos são para todo o voluntariado. Para falar só com a coordenação, use a aba “Conversas”.',
        },
        {
          titulo: 'Também por e-mail',
          texto: 'Quer receber os avisos também por e-mail? Ligue em “Perfil”, em “Preferências”.',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'escrever-para-a-coordenacao',
      titulo: 'Escrever para a coordenação',
      passos: [
        'Abra “Mensagens”.',
        'Toque em “Nova mensagem”.',
        'Preencha o “Assunto” e escolha em “Sobre” do que se trata.',
        'Escreva em “Mensagem” e toque em “Enviar”.',
        'A conversa abre na hora. A resposta chega aqui e no seu e-mail.',
      ],
    },
    {
      id: 'responder-uma-conversa',
      titulo: 'Responder uma conversa',
      passos: [
        'Em “Mensagens”, toque na conversa.',
        'Escreva no campo “Escreva sua resposta”, no pé da tela.',
        'Toque no botão de enviar, ao lado do campo.',
      ],
    },
    {
      id: 'ler-os-avisos',
      titulo: 'Ler os avisos da coordenação',
      passos: [
        'Abra “Mensagens” e toque na aba “Avisos”.',
        'Os fixados vêm primeiro; “Novo” marca os que você ainda não tinha visto.',
      ],
      dica: 'Abrir a aba “Avisos” conta como visto: o número em “Mensagens” diminui.',
    },
  ],
  perguntas: [
    {
      id: 'quando-chega-a-resposta',
      pergunta: 'Como fico sabendo que a coordenação respondeu?',
      resposta: 'A conversa ganha o selo “Resposta nova”, o número em “Mensagens” aumenta e a resposta chega no seu e-mail.',
      termos: ['resposta', 'retorno', 'demora', 'notificação'],
    },
    {
      id: 'situacoes-da-conversa',
      pergunta: 'O que significam “Aguardando resposta”, “Respondida” e “Encerrada”?',
      resposta: '“Aguardando resposta”: a conversa está com a coordenação. “Respondida”: a coordenação respondeu. “Encerrada”: a coordenação deu o assunto por resolvido; se você escrever de novo, a conversa é reaberta.',
      termos: ['status', 'situação', 'fechada'],
    },
    {
      id: 'numero-em-mensagens',
      pergunta: 'O que é o número em “Mensagens”?',
      resposta: 'Soma as conversas com resposta da coordenação que você ainda não abriu e os avisos que ainda não viu. Abrir a conversa ou a aba “Avisos” faz o número baixar.',
      termos: ['contador', 'bolinha', 'notificação', 'novidades'],
    },
    {
      id: 'campo-sobre',
      pergunta: 'Para que serve o campo “Sobre”?',
      resposta: 'Diz à coordenação do que se trata a mensagem: “Dúvida”, “Disponibilidade”, “Documentos e certificados”, “Sugestão” ou “Outro assunto”.',
      termos: ['categoria', 'tipo de mensagem'],
    },
    {
      id: 'apagar-mensagem',
      pergunta: 'Dá para apagar uma mensagem?',
      resposta: 'Não: o que foi enviado fica na conversa. Se escreveu algo errado, mande outra mensagem corrigindo.',
      termos: ['excluir', 'apagar', 'editar', 'errei'],
    },
    {
      id: 'muitas-mensagens',
      pergunta: 'Apareceu “Muitas mensagens em pouco tempo”. O que houve?',
      resposta: 'Cada pessoa pode mandar até 15 mensagens por hora. Aguarde um pouco e envie de novo: o texto que você escreveu continua no campo.',
      termos: ['Muitas mensagens em pouco tempo. Aguarde um pouco e tente de novo.', 'limite', 'bloqueado', 'não envia'],
    },
    {
      id: 'avisos-por-email',
      pergunta: 'Posso receber os avisos por e-mail?',
      resposta: 'Pode: em “Perfil”, marque “Receber os avisos do mural também por e-mail”. E-mails sobre as suas inscrições, certificados e respostas às suas mensagens chegam sempre.',
      termos: ['e-mail', 'mural', 'notificação'],
    },
  ],
}

// ---------------------------------------------------------------- Perfil

const PERFIL: GuiaDaArea = {
  href: '/membro/perfil',
  paraQueServe: 'No Perfil ficam os seus dados. Contato, endereço, contato de emergência, habilidades, idiomas e quando você pode atuar você atualiza por aqui; nome, e-mail de acesso, CPF, nascimento, vínculo, função e setores só a coordenação altera. Aqui também ficam os bens da filial que estão com você e a preferência de avisos por e-mail.',
  tour: [
    {
      alvo: 'membro.completude',
      titulo: 'Falta preencher',
      texto: 'O selo mostra quanto do cadastro está completo. Cada item de “Falta preencher” leva direto ao campo.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.bens',
      titulo: 'Bens da filial com você',
      texto: 'Os bens da filial que estão com você. Leia o “Termo de responsabilidade”, marque a caixa e toque em “Aceitar o termo”.',
      seAusente: 'pular',
    },
    {
      alvo: 'membro.pedir-correcao',
      titulo: 'Dados do cadastro',
      texto: 'Nome, e-mail de acesso, CPF, nascimento, vínculo, função e setores só a coordenação altera. Viu algo errado? “Pedir correção” abre uma mensagem para ela.',
    },
    {
      alvo: 'membro.formulario-do-perfil',
      titulo: 'O que você atualiza',
      texto: 'Contato, endereço, contato de emergência, habilidades, idiomas e quando você pode atuar. Mexeu em algo, aparece embaixo a barra “Alterações não salvas”, com o “Salvar”.',
    },
    {
      alvo: 'membro.avisos-por-email',
      titulo: 'Avisos por e-mail',
      texto: 'Ligue ou desligue os avisos do mural por e-mail. Essa escolha é salva na hora, sem o “Salvar”.',
    },
    {
      alvo: 'membro.sair-da-area',
      titulo: 'Sair',
      texto: '“Sair da Área do Voluntário” encerra o acesso neste aparelho: num aparelho compartilhado, saia ao terminar. O “Sair” também fica no menu da sua conta, no alto.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'atualizar-dados',
      titulo: 'Atualizar telefone, endereço ou disponibilidade',
      passos: [
        'Abra “Perfil”.',
        'Mude o que precisar em “Contato”, “Endereço” ou “Perfil de voluntariado”.',
        'Toque em “Salvar”, na barra “Alterações não salvas”.',
        'Espere o recado “Cadastro atualizado.”.',
      ],
      dica: 'Em “Habilidades” e “Idiomas”, separe os itens por vírgula.',
    },
    {
      id: 'contato-de-emergencia',
      titulo: 'Preencher o contato de emergência',
      passos: [
        'Em “Perfil”, vá até “Contato de emergência”.',
        'Preencha “Nome”, “Telefone” e “Parentesco ou relação”.',
        'Toque em “Salvar”.',
      ],
      dica: 'É quem a filial avisa se algo acontecer com você durante uma ação.',
    },
    {
      id: 'aceitar-termo',
      titulo: 'Aceitar o termo de um bem da filial',
      passos: [
        'No Início, toque em “Conferir e aceitar” (ou abra “Perfil”, em “Bens da filial com você”).',
        'Confira o bem: nome, plaqueta e detalhes.',
        'Leia o “Termo de responsabilidade”.',
        'Marque “Li o termo, conferi o bem e o recebi.”.',
        'Toque em “Aceitar o termo”.',
      ],
      dica: 'O aceite fica registrado com a data do dia.',
    },
    {
      id: 'pedir-correcao',
      titulo: 'Corrigir nome, CPF ou e-mail',
      passos: [
        'Em “Perfil”, veja “Dados do cadastro”.',
        'Toque em “Pedir correção”.',
        'A nova mensagem abre com “Documentos e certificados” em “Sobre”. Escreva o que precisa mudar e toque em “Enviar”.',
      ],
    },
    {
      id: 'ligar-avisos-por-email',
      titulo: 'Ligar ou desligar os avisos por e-mail',
      passos: [
        'Em “Perfil”, vá até “Preferências”.',
        'Marque ou desmarque “Receber os avisos do mural também por e-mail”.',
        'Pronto: aparece “Preferência salva.”.',
      ],
    },
  ],
  perguntas: [
    {
      id: 'mudar-nome-cpf-email',
      pergunta: 'Por que não consigo mudar meu nome, CPF ou e-mail?',
      resposta: 'Esses dados ficam com a coordenação; o e-mail, por exemplo, é o seu acesso à área. Use “Pedir correção”, em “Dados do cadastro”.',
      termos: ['alterar', 'editar', 'dados errados', 'vínculo', 'setor', 'função'],
    },
    {
      id: 'nome-social',
      pergunta: 'O que é o “Nome social”?',
      resposta: 'É opcional. Se preenchido, é por ele que chamamos você aqui na área e nos e-mails. O certificado sai com o nome de “Dados do cadastro”.',
      termos: ['nome', 'apelido', 'como ser chamado'],
    },
    {
      id: 'cadastro-completo',
      pergunta: 'O que conta para o “Cadastro completo”?',
      resposta: 'Quatro blocos, de 25% cada: telefone ou WhatsApp; endereço (CEP, logradouro, cidade e UF); contato de emergência (nome e telefone); e quando você pode atuar.',
      termos: ['completo', 'porcentagem', 'falta preencher'],
    },
    {
      id: 'erro-ao-salvar',
      pergunta: 'Toquei em “Salvar” e deu erro. Perdi o que escrevi?',
      resposta: 'Não: o que você digitou continua na tela. Leia o recado de erro, corrija e toque em “Salvar” de novo.',
      termos: ['erro', 'não salvou', 'perdi'],
    },
    {
      id: 'termo-de-responsabilidade',
      pergunta: 'O que é o termo de responsabilidade?',
      resposta: 'É o texto que acompanha a entrega de um bem da filial, e ele aparece no próprio cartão, em “Termo de responsabilidade”. Ao aceitar, você confirma que leu, conferiu o bem e o recebeu.',
      termos: ['termo', 'cautela', 'equipamento', 'bem', 'patrimônio'],
    },
    {
      id: 'devolver-bem',
      pergunta: 'Como devolvo um bem da filial?',
      resposta: 'Combine a devolução com a coordenação, por “Mensagens”, por exemplo. Quando a devolução é registrada, o bem sai de “Bens da filial com você”.',
      termos: ['devolução', 'equipamento', 'patrimônio', 'plaqueta'],
    },
    {
      id: 'quem-ve-meus-dados',
      pergunta: 'Quem vê os meus dados?',
      resposta: 'A equipe da filial com acesso ao Voluntariado. As outras pessoas do voluntariado não veem os seus dados nem as suas inscrições.\n\nPara ajudar você, quem cuida do Voluntariado pode abrir a área do jeito que você a vê, só para leitura: nada é gravado em seu nome, e cada visualização fica registrada no seu cadastro.',
      termos: ['privacidade', 'dados pessoais', 'LGPD', 'segurança'],
    },
  ],
}

export const GUIAS_DO_MEMBRO: GuiaDaArea[] = [INICIO, FORMACAO, OPORTUNIDADES, MENSAGENS, PERFIL]

// ---------------------------------------------------------------- tópicos gerais

const ENTRAR_E_SAIR: TopicoGeral = {
  id: 'entrar-e-sair',
  titulo: 'Entrar e sair',
  resumo: 'Sem senha: você entra com um código de 6 dígitos que chega no seu e-mail.',
  tarefas: [
    {
      id: 'entrar-com-codigo',
      titulo: 'Entrar na Área do Voluntário',
      passos: [
        'Na tela de entrada, digite em “Seu e-mail” o mesmo e-mail que você usou na inscrição.',
        'Toque em “Enviar código”.',
        'Abra o seu e-mail: o código de 6 dígitos está no assunto, antes de “é o seu código de acesso”.',
        'Digite o código em “Código de 6 dígitos”. Com os 6 dígitos, a entrada segue sozinha (ou toque em “Entrar”).',
      ],
      dica: 'O código vale por 10 minutos. Se pedir mais de um, use o mais recente: só ele vale.',
    },
    {
      id: 'reenviar-codigo',
      titulo: 'Pedir outro código',
      passos: [
        'Na tela do código, espere a contagem de “Reenviar em …” terminar (1 minuto).',
        'Toque em “Reenviar código”.',
        'Use o código do e-mail mais recente.',
      ],
      dica: 'São até 5 pedidos por hora para o mesmo e-mail. Passou disso, espere alguns minutos.',
    },
    {
      id: 'sair-da-area',
      titulo: 'Sair da área',
      passos: [
        'Toque nas suas iniciais, no alto da tela.',
        'Toque em “Sair”.',
      ],
      dica: 'Também dá para sair no fim do “Perfil”, em “Sair da Área do Voluntário”. Ao sair, este aparelho esquece o e-mail que você usou para entrar.',
    },
  ],
  perguntas: [
    {
      id: 'codigo-nao-chegou',
      pergunta: 'O código não chegou. O que faço?',
      resposta: 'Procure por “código de acesso” no Spam, em Promoções ou no Lixo eletrônico, e confira se o e-mail digitado está certo. Depois de 1 minuto, dá para tocar em “Reenviar código”.\n\nSe ainda assim não chegar, abra “Não chegou?”, na tela do código: ali está o WhatsApp da coordenação do Voluntariado.',
      termos: ['não recebi', 'spam', 'lixo eletrônico', 'promoções', 'e-mail', 'código de acesso'],
    },
    {
      id: 'email-sem-cadastro',
      pergunta: 'Digitei meu e-mail e não recebi nada. Tenho cadastro?',
      resposta: 'Só recebe o código quem tem cadastro ativo no Voluntariado. Se você se inscreveu há pouco, o acesso é liberado quando a coordenação aprova a inscrição, e chega um e-mail de boas-vindas.\n\nAinda não se inscreveu? Na tela de entrada, toque em “Quero me inscrever”.',
      termos: ['inscrição', 'cadastro', 'aprovação', 'participe', 'novo voluntário'],
    },
    {
      id: 'codigo-incorreto',
      pergunta: 'Apareceu “Código incorreto”. E agora?',
      resposta: 'Confira os 6 dígitos no assunto do e-mail mais recente. São até 5 tentativas por código; depois disso, ou se o código tiver vencido, toque em “Enviar novo código”.',
      termos: ['Código incorreto', 'Código vencido ou já usado. Peça um novo.', 'Tentativas esgotadas', 'código inválido'],
    },
    {
      id: 'muitos-pedidos',
      pergunta: 'Apareceu “Muitos pedidos de código”. O que houve?',
      resposta: 'O mesmo e-mail pode pedir até 5 códigos por hora. Espere alguns minutos e tente de novo, usando sempre o código mais recente.',
      termos: ['Muitos pedidos de código. Espere alguns minutos e tente de novo.', 'bloqueado', 'limite'],
    },
    {
      id: 'tempo-de-acesso',
      pergunta: 'Por quanto tempo o acesso fica aberto neste aparelho?',
      resposta: 'Este aparelho fica conectado por 30 dias depois do último acesso: cada vez que você usa a área, o prazo recomeça. Passado esse tempo, é só pedir um novo código.',
      termos: ['sessão', 'logado', 'continuar conectado', 'deslogou'],
    },
    {
      id: 'sessao-terminou',
      pergunta: 'Apareceu “Sua sessão terminou”. O que houve?',
      resposta: 'O acesso deste aparelho venceu ou foi encerrado. Entre de novo com um código: depois dele, você volta para a página que estava abrindo.',
      termos: ['Sua sessão terminou. Entre de novo para continuar de onde parou.', 'expirou', 'desconectou'],
    },
    {
      id: 'aparelho-compartilhado',
      pergunta: 'Usei um aparelho de outra pessoa. Preciso sair?',
      resposta: 'Sim. Toque nas suas iniciais, no alto, e em “Sair”. Assim o acesso daquele aparelho se encerra e ele esquece o seu e-mail.',
      termos: ['computador público', 'celular emprestado', 'segurança'],
    },
    {
      id: 'mais-de-um-aparelho',
      pergunta: 'Dá para entrar no celular e no computador?',
      resposta: 'Dá. Cada aparelho pede o próprio código, e sair num deles não encerra o acesso do outro.',
      termos: ['dois aparelhos', 'tablet', 'notebook'],
    },
    {
      id: 'trocar-email',
      pergunta: 'Mudei de e-mail. Como faço para entrar?',
      resposta: 'O e-mail do cadastro é o seu acesso, e só a coordenação troca. Se ainda consegue entrar, use “Pedir correção”, no “Perfil”. Se não consegue, fale com a coordenação pelo WhatsApp que aparece em “Não chegou?”, na tela do código.',
      termos: ['novo e-mail', 'trocar e-mail', 'e-mail antigo'],
    },
  ],
}

const EMAILS: TopicoGeral = {
  id: 'emails-da-area',
  titulo: 'E-mails da área',
  resumo: 'O que a Área do Voluntário manda para o seu e-mail, e quando.',
  tarefas: [
    {
      id: 'parar-avisos-por-email',
      titulo: 'Parar de receber os avisos do mural por e-mail',
      passos: [
        'Abra “Perfil” e vá até “Preferências”.',
        'Desmarque “Receber os avisos do mural também por e-mail”.',
      ],
      dica: 'O link de saída no rodapé de cada aviso por e-mail faz o mesmo. Os avisos continuam em “Mensagens”, na aba “Avisos”.',
    },
  ],
  perguntas: [
    {
      id: 'que-emails-recebo',
      pergunta: 'Que e-mails a área manda?',
      resposta: 'As boas-vindas, quando a coordenação aprova a sua inscrição no Voluntariado; o código de acesso; a confirmação de cada inscrição numa atividade; o lembrete na véspera da atividade; o aviso de que a vaga é sua, quando você sai da lista de espera; o aviso quando a coordenação cancela uma atividade; o certificado emitido; as respostas da coordenação às suas mensagens; e o aviso de bem da filial entregue a você.\n\nOs avisos do mural chegam por e-mail só se essa opção estiver ligada no “Perfil”.',
      termos: ['notificações', 'e-mail', 'avisos', 'lembrete', 'confirmação'],
    },
    {
      id: 'emails-no-spam',
      pergunta: 'Os e-mails da área caem no spam. O que faço?',
      resposta: 'Procure no Spam, em Promoções ou no Lixo eletrônico e marque a mensagem como “Não é spam”.',
      termos: ['spam', 'lixo eletrônico', 'promoções', 'não chega'],
    },
  ],
}

const SOBRE_A_AJUDA: TopicoGeral = {
  id: 'tours-e-ajuda',
  titulo: 'Tours e ajuda',
  resumo: 'Como rever os tours e onde achar esta página.',
  tarefas: [
    {
      id: 'ver-tour-da-tela',
      titulo: 'Ver o tour da tela em que você está',
      passos: [
        'Toque nas suas iniciais, no alto da tela.',
        'Toque em “Tour desta tela” (aparece nas telas que têm tour).',
      ],
      dica: 'Nesta Ajuda, cada parte da área tem o botão “Fazer o tour”.',
    },
  ],
  perguntas: [
    {
      id: 'rever-boas-vindas',
      pergunta: 'Como vejo o tour de boas-vindas de novo?',
      resposta: 'No alto desta Ajuda, toque em “Refazer o tour de boas-vindas”.',
      termos: ['tour', 'apresentação', 'rever'],
    },
    {
      id: 'onde-fica-a-ajuda',
      pergunta: 'Onde fica esta Ajuda?',
      resposta: 'No menu da sua conta (as suas iniciais, no alto), em “Ajuda”, e no fim do Início, em “Ajuda: passo a passo e perguntas frequentes”.',
      termos: ['ajuda', 'dúvidas', 'perguntas frequentes', 'FAQ'],
    },
    {
      id: 'convite-de-novo',
      pergunta: 'O convite de boas-vindas apareceu de novo. Por quê?',
      resposta: 'O que você já viu fica guardado neste aparelho. Em outro celular, em outro navegador ou depois de limpar os dados do navegador, o convite volta: é só tocar em “Agora não”.',
      termos: ['convite', 'boas-vindas', 'tour'],
    },
  ],
}

export const TOPICOS_DO_MEMBRO: TopicoGeral[] = [ENTRAR_E_SAIR, EMAILS, SOBRE_A_AJUDA]

// ---------------------------------------------------------------- que tour vale aqui

/** '/membro/cursos/[id]' casa com '/membro/cursos/abc'. Mesmo desenho de `casarCaminho` (./index), sem trazer o registro da Redação para cá. */
function casa(padrao: string, pathname: string): boolean {
  const partes = padrao.split('/').filter(Boolean)
  const reais = pathname.split('/').filter(Boolean)
  return partes.length === reais.length && partes.every((p, i) => /^\[.+\]$/.test(p) || p === reais[i])
}

export type TourDoMembro = {
  passos: PassoDoTour[]
  /** O destino (href de SECOES) de onde o tour é. */
  destino: string
  /** A tela interna, quando o tour é dela (e não da raiz do destino). */
  tela: TelaDaArea | null
  /** Como fica lembrado como visto: o href do destino ou o caminho da tela ('/membro/cursos/[id]'). */
  chave: string
}

/**
 * O tour que vale neste endereço: o do destino, na raiz dele; o da tela
 * interna, quando há um (endereço fixo antes de endereço com `[id]`); em
 * qualquer outra tela, nenhum — o tour da lista apontaria para o que não está
 * na tela.
 */
export function tourDoMembro(pathname: string): TourDoMembro | null {
  const raiz = GUIAS_DO_MEMBRO.find((g) => g.href === pathname && g.tour.length)
  if (raiz) return { passos: raiz.tour, destino: raiz.href, tela: null, chave: raiz.href }
  const achados = GUIAS_DO_MEMBRO.flatMap((g) => (g.telas ?? []).filter((t) => t.tour.length && casa(t.caminho, pathname)).map((t) => ({ g, t })))
  const fixos = (c: string) => c.split('/').filter((p) => p && !p.startsWith('[')).length
  const melhor = achados.sort((a, b) => fixos(b.t.caminho) - fixos(a.t.caminho))[0]
  return melhor ? { passos: melhor.t.tour, destino: melhor.g.href, tela: melhor.t, chave: melhor.t.caminho } : null
}

// ---------------------------------------------------------------- busca

/** Sem acento e sem caixa. A mesma regra de `normalizar` (lib/navegacao.ts), sem trazer o mapa do Redação para o celular do voluntário. */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export type AchadoDoMembro =
  | { tipo: 'pergunta'; item: Pergunta; onde: string }
  | { tipo: 'tarefa'; item: Tarefa; onde: string }

/**
 * Busca por palavras nas tarefas e perguntas dos destinos e dos tópicos
 * gerais. Todas as palavras precisam aparecer; o título casando vem antes de
 * quem só casou pelo texto; no empate, perguntas antes de tarefas e a ordem da página. `onde` é o href do
 * destino ou o id do tópico geral.
 */
export function buscarNaAjudaDoMembro(busca: string, limite = 30): AchadoDoMembro[] {
  const palavras = normalizarBusca(busca).split(/\s+/).filter((p) => p.length > 1)
  if (!palavras.length) return []
  const fontes = [
    ...GUIAS_DO_MEMBRO.map((g) => ({ onde: g.href, tarefas: g.tarefas, perguntas: g.perguntas })),
    ...TOPICOS_DO_MEMBRO.map((t) => ({ onde: t.id, tarefas: t.tarefas, perguntas: t.perguntas })),
  ]
  // Perguntas antes de tarefas no empate: quem busca costuma chegar com uma dúvida.
  const candidatos = fontes.flatMap(({ onde, tarefas, perguntas }) => [
    ...perguntas.map((item) => ({ achado: { tipo: 'pergunta' as const, item, onde }, titulo: normalizarBusca(item.pergunta), corpo: normalizarBusca([item.resposta, ...(item.termos ?? [])].join(' ')) })),
    ...tarefas.map((item) => ({ achado: { tipo: 'tarefa' as const, item, onde }, titulo: normalizarBusca(item.titulo), corpo: normalizarBusca([...item.passos, item.dica ?? ''].join(' ')) })),
  ])
  return candidatos
    .map((c, ordem) => {
      if (!palavras.every((p) => c.titulo.includes(p) || c.corpo.includes(p))) return null
      const noTitulo = palavras.filter((p) => c.titulo.includes(p)).length
      return { achado: c.achado, pontos: noTitulo === palavras.length ? 0 : noTitulo > 0 ? 1 : 2, ordem }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.pontos - b.pontos || a.ordem - b.ordem)
    .slice(0, limite)
    .map((x) => x.achado)
}
