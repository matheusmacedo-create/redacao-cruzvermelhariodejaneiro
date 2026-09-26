import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda da Escola de Educação e Saúde (grupo "escola" de lib/navegacao.ts):
 * Visão geral, Vendas, Financeiro da escola, Marketing, Advertoriais e Contas
 * e integrações. A equipe da escola (papel "escola") vê só isto, então o
 * texto é escrito também para ela.
 *
 * Cada frase tem apoio no código:
 * - quem abre o quê: lib/escola/servidor.ts (contextoDaEscola: nível na
 *   Escola) e lib/escola/marketing-servidor.ts (contextoDoMarketing: nível no
 *   marketing), conferidos de novo no banco (private.nivel_escola e
 *   private.nivel_marketing_escola);
 * - Visão geral: app/(app)/escola/page.tsx;
 * - Vendas: components/app/escola/{painel,grafico,atualizar}.tsx,
 *   app/(app)/escola/vendas/**, lib/escola/{painel,unicopag}.ts e
 *   app/actions/escola.ts;
 * - Financeiro: app/(app)/escola/financeiro/route.ts (redireciona para
 *   /financeiro nos livros da Escola), lib/financeiro/acesso.ts e a migração
 *   20260925220000 (as vendas viram receita sozinhas);
 * - Marketing: app/(app)/escola/marketing/**, components/app/escola/{marketing,
 *   meta}.tsx, lib/escola/{marketing,meta}.ts e app/actions/escola-marketing.ts;
 * - Advertoriais: app/(app)/escola/marketing/advertoriais, components/app/
 *   escola/advertoriais.tsx, lib/escola/advertoriais.ts e app/api/escola/{ir,v};
 * - Contas e integrações: app/(app)/escola/configuracoes, components/app/
 *   escola/{contas,meta}.tsx.
 *
 * "/escola/financeiro" não é uma tela: é um atalho que abre o Financeiro
 * (outra área) nos livros da Escola. Por isso a ajuda dele não tem tour — a
 * pessoa nunca fica nesse endereço.
 *
 * Os alvos `escola.*`, `escola-vendas.*`, `escola-marketing.*`,
 * `escola-advertoriais.*` e `escola-contas.*` são marcados com `data-ajuda`
 * nessas telas. Mudou a tela ou a regra, muda aqui no mesmo PR (docs/AJUDA.md).
 */

export const guias: GuiaDaArea[] = [
  // ------------------------------------------------------------ Visão geral
  {
    href: '/escola',
    paraQueServe: 'A porta de entrada da Escola de Educação e Saúde, uma empresa da Cruz Vermelha RJ com receita e gestão próprias. Junta num lugar só as vendas do mês, o financeiro, o marketing, os advertoriais e o que pede atenção, e cada bloco leva à área dele. Alunos, turmas e secretaria continuam no sistema da escola.',
    quemUsa: 'Abre para quem tem acesso às vendas ou ao marketing da escola. Vendas: administradores, a equipe da escola, quem é da coordenação ou do setor Educação e Saúde e quem tem acesso aos livros da Escola no Financeiro. Marketing e advertoriais: essas mesmas pessoas, mais editores e a Comunicação Social. Cada bloco só aparece para quem pode abrir a área dele.',
    tour: [
      {
        titulo: 'A Escola como empresa',
        texto: 'A Escola de Educação e Saúde tem receita e gestão próprias. Esta visão geral junta as vendas, o financeiro, o marketing e os advertoriais, e cada bloco leva à área dele.',
      },
      {
        alvo: 'escola.secoes',
        titulo: 'As seções da Escola',
        texto: 'No alto de cada tela ficam as seções da Escola. “Vendas” e “Financeiro” aparecem para quem vê as vendas; “Marketing” e “Advertoriais”, para quem trabalha no marketing.',
        lado: 'bottom',
      },
      {
        alvo: 'escola.atencao',
        titulo: 'O que pede atenção',
        texto: 'Conta da Únicopag sem chave ou com erro, leitura do Meta com erro, campanha no ar sem utm_campaign, pagamento em disputa e advertorial não publicado. Cada linha leva ao lugar de resolver.',
        seAusente: 'pular',
      },
      {
        alvo: 'escola.blocos',
        titulo: 'Um bloco por área',
        texto: '“Vendas do mês”, “Financeiro da escola”, “Marketing” e “Advertoriais” resumem cada área, e cada um só aparece para quem pode abri-la. O link no pé do bloco abre a área inteira.',
      },
      {
        alvo: 'escola.sistema',
        titulo: 'Alunos e turmas ficam fora',
        texto: 'A ficha de cada estudante, as turmas, a triagem e a presença ficam no sistema da escola. Os botões do quadro “Alunos, turmas e secretaria” abrem esse sistema em outra aba.',
        seAusente: 'pular',
      },
    ],
    tarefas: [
      {
        id: 'acompanhar-o-mes',
        titulo: 'Acompanhar a escola num relance',
        passos: [
          'Abra “Visão geral”, no grupo “Escola de Educação e Saúde” do menu.',
          'Em “Vendas do mês”, veja o “Recebido” e a variação sobre o mês anterior, o que está “Aguardando”, o “Saldo nas contas” e o “Ticket médio”.',
          'Em “Financeiro da escola”, veja as receitas e despesas pagas no mês, o “Resultado do mês” e até quando o mês está fechado.',
          'Em “Marketing”, veja as campanhas no ar, o investido em anúncios, a receita das campanhas e o retorno.',
          'Em “Advertoriais”, veja quantos estão no site e as visitas e cliques no botão dos últimos 30 dias.',
          'Use o link no pé de cada bloco (“Abrir vendas”, “Abrir o marketing”…) para ver a área inteira.',
        ],
        dica: 'Cada bloco só aparece para quem pode abrir a área dele. Sem acesso aos livros da Escola, por exemplo, o bloco “Financeiro da escola” não aparece.',
      },
      {
        id: 'resolver-pendencias',
        titulo: 'Resolver o que pede atenção',
        passos: [
          'Abra “Visão geral”.',
          'Se aparecer o quadro “Pede atenção”, leia cada linha: ela diz o que está errado.',
          'Toque na linha para ir ao lugar de resolver: a conta em “Contas e integrações”, a campanha em “Marketing”, os pagamentos em disputa em “Transações” ou os advertoriais.',
          'Resolvido o problema, a linha some da visão geral.',
        ],
        dica: 'Erro de leitura da Únicopag ou do Meta só some depois de uma leitura que dê certo: use “Atualizar agora” em “Vendas” ou “Atualizar do Meta” no “Marketing”.',
      },
    ],
    perguntas: [
      {
        id: 'o-que-e-a-escola',
        pergunta: 'O que é a Escola na Redação?',
        resposta: 'A Escola de Educação e Saúde é uma empresa da Cruz Vermelha RJ com receita e gestão próprias. Na Redação fica a administração dela: vendas, financeiro, marketing e advertoriais. Alunos, turmas e secretaria ficam no sistema da escola.',
        termos: ['escola de educação e saúde', 'empresa', 'cursos', 'punção venosa'],
      },
      {
        id: 'onde-ficam-os-alunos',
        pergunta: 'Onde vejo alunos, turmas e presença?',
        resposta: 'No sistema da escola, não na Redação. Na Redação, a venda guarda só o nome de quem pagou, com o CPF mascarado. O quadro “Alunos, turmas e secretaria” tem o botão que abre o sistema da escola, quando o endereço dele está cadastrado.',
        termos: ['aluno', 'turma', 'secretaria', 'triagem', 'presença', 'ficha do aluno', 'inscrição'],
      },
      {
        id: 'abrir-sistema-da-escola',
        pergunta: 'Como abro o sistema da escola?',
        resposta: 'Na “Visão geral” ou em “Vendas”, desça até o quadro “Alunos, turmas e secretaria” e toque no botão com o nome da conta: o sistema abre em outra aba.\n\nO botão só aparece quando a conta da Únicopag tem o “Endereço do sistema da escola”, que um administrador preenche em “Contas e integrações”.',
        termos: ['sistema da escola', 'alunos', 'turmas', 'secretaria', 'atalho', 'botão sumiu'],
      },
      {
        id: 'nao-vejo-bloco',
        pergunta: 'Por que não vejo algum bloco ou alguma seção?',
        resposta: 'Cada bloco aparece só para quem pode abrir a área dele: vendas, para administradores, equipe da escola, Educação e Saúde e quem tem os livros da Escola; marketing e advertoriais, para essas pessoas, editores e a Comunicação Social.\n\nO bloco “Financeiro da escola” depende do acesso aos livros da Escola, que um administrador dá no Financeiro. Sem esse acesso, a seção “Financeiro” aparece, mas volta à “Visão geral” com um aviso.',
        termos: ['acesso', 'permissão', 'sumiu', 'não aparece', 'escondido'],
      },
      {
        id: 'pagina-nao-abre',
        pergunta: 'Por que uma tela da Escola dá erro 404 para mim?',
        resposta: 'As telas da Escola só abrem para quem tem acesso a elas; para os demais, a Redação responde como se a página não existisse. Peça o acesso a um administrador, dizendo se você precisa das vendas ou do marketing.',
        termos: ['404', 'página não encontrada', 'não abre', 'this page could not be found', 'acesso'],
      },
      {
        id: 'o-que-e-pede-atencao',
        pergunta: 'O que entra em “Pede atenção”?',
        resposta: 'Conta da Únicopag sem chave ou com a última leitura falhando, conta de anúncios do Meta com erro, campanha no ar sem utm_campaign (a receita não chega a ela), pagamento em disputa no cartão e advertorial ainda não publicado. Sem nada disso, o quadro não aparece.',
        termos: ['alerta', 'aviso', 'pendência', 'erro'],
      },
      {
        id: 'numeros-atualizados',
        pergunta: 'Os números da visão geral estão atualizados?',
        resposta: 'Vendas e anúncios são lidos da Únicopag e do Meta uma vez por dia. Para ler na hora, use “Atualizar agora” em “Vendas” ou “Atualizar do Meta” no “Marketing”. O bloco do financeiro mostra o que já está pago nos livros da Escola.',
        termos: ['atualizar', 'sincronizar', 'desatualizado', 'hoje', 'tempo real'],
      },
      {
        id: 'o-que-e-retorno',
        pergunta: 'O que é o “Retorno” do marketing?',
        resposta: 'É a receita das campanhas dividida pelo que foi investido em anúncios: 3× quer dizer que cada real investido trouxe três. A receita vem das vendas da Únicopag com o utm_campaign de cada campanha.',
        termos: ['roas', 'roi', 'retorno sobre investimento', 'receita ÷ investido'],
      },
      {
        id: 'livros-nao-liberados',
        pergunta: 'Apareceu “Os livros da Escola no Financeiro ainda não foram liberados para você”. E agora?',
        resposta: 'O acesso aos livros da Escola é à parte do resto. Peça a um administrador, que libera no Financeiro, em “Cadastros”, aba “Quem acessa”, escolhendo o nível e a empresa.',
        termos: ['sem acesso', 'livros', 'financeiro', 'liberar'],
      },
    ],
    relacionadas: ['/escola/vendas', '/escola/marketing', '/escola/marketing/advertoriais', '/escola/financeiro', '/escola/configuracoes'],
  },

  // ------------------------------------------------------------ Vendas
  {
    href: '/escola/vendas',
    paraQueServe: 'O dinheiro que entra pelas contas da Únicopag da escola, mês a mês: quanto foi recebido, o que está aguardando pagamento, o que voltou (estorno e contestação), o saldo nas contas e de onde veio cada venda, por curso, forma de pagamento e origem. Em “Transações”, cada cobrança, com filtros.',
    quemUsa: 'Administradores, a equipe da escola, quem é da coordenação ou do setor Educação e Saúde e quem tem acesso aos livros da Escola no Financeiro. Todas essas pessoas veem os números e usam “Atualizar agora”. Ligar, trocar a chave e tirar uma conta é só de administrador, em “Contas e integrações”.',
    tour: [
      {
        titulo: 'Vendas da escola',
        texto: 'O que entra pelas contas da Únicopag da escola, mês a mês: quanto foi recebido, o que está aguardando, o que voltou e de onde veio o dinheiro.',
      },
      {
        alvo: 'escola-vendas.vazio',
        titulo: 'Nenhuma conta ligada',
        texto: 'Sem conta da Únicopag ligada, não há o que mostrar. Um administrador liga as contas em “Contas e integrações”, com a chave de API de cada uma.',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-vendas.atualizar',
        titulo: 'Atualizar agora',
        texto: 'A Redação lê a Únicopag uma vez por dia. “Atualizar agora” lê de novo na hora; embaixo do botão aparece quando foi a última leitura.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-vendas.mes',
        titulo: 'Escolha o mês',
        texto: 'As setas ao lado do nome do mês trocam o mês do painel. No gráfico dos últimos 12 meses, um clique numa barra também abre aquele mês.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-vendas.indicadores',
        titulo: 'Os quatro números',
        texto: '“Recebido no mês” conta o que foi pago no mês. Ao lado ficam o que aguarda pagamento, os estornos e contestações e o saldo nas contas da Únicopag.',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-vendas.divisoes',
        titulo: 'De onde veio o dinheiro',
        texto: 'O recebido do mês por curso, por forma de pagamento e por origem da venda. Com mais de uma conta, também por conta.',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-vendas.ver-transacoes',
        titulo: 'Cada cobrança',
        texto: 'O botão “Ver as transações de…” abre a lista de cobranças do mês, com filtros e a situação de cada uma.',
        lado: 'top',
        seAusente: 'pular',
      },
    ],
    telas: [
      {
        caminho: '/escola/vendas/transacoes',
        rotulo: 'Transações',
        tour: [
          {
            titulo: 'Transações',
            texto: 'Cada cobrança das contas da escola na Únicopag, criada ou paga no mês escolhido. O CPF aparece mascarado; a ficha de quem estuda fica no sistema da escola.',
          },
          {
            alvo: 'escola-vendas.filtros',
            titulo: 'Filtrar',
            texto: 'Escolha o mês, a conta (quando há mais de uma), a situação e a forma de pagamento, ou busque por pagador, curso ou código. Depois, use “Filtrar”.',
            lado: 'bottom',
          },
          {
            alvo: 'escola-vendas.total',
            titulo: 'O total',
            texto: 'Quantas transações passaram no filtro e quanto delas foi recebido no mês. Com mais de 500, a tela mostra as 500 mais recentes.',
            lado: 'bottom',
          },
          {
            alvo: 'escola-vendas.tabela',
            titulo: 'A situação de cada uma',
            texto: '“Pago”, “Aguardando”, “Recusado”, “Cancelado”, “Estornado”, “Em disputa” ou “Contestado”. Pare o mouse sobre a situação para ver o que ela quer dizer.',
            seAusente: 'pular',
          },
          {
            alvo: 'escola-vendas.planilha',
            titulo: 'A planilha',
            texto: '“Planilha (CSV)” baixa todas as transações do filtro aplicado, mesmo quando passam de 500: conta, código, datas, situação, forma de pagamento, valor, curso e pagador. Serve para conferir com o repasse da Únicopag.',
            lado: 'bottom',
          },
        ],
      },
    ],
    tarefas: [
      {
        id: 'ver-vendas-do-mes',
        titulo: 'Ver quanto a escola recebeu num mês',
        passos: [
          'Abra “Vendas” na Escola.',
          'Use as setas ao lado do nome do mês para chegar ao mês que quer ver, ou toque na barra dele no gráfico dos últimos 12 meses.',
          'Leia “Recebido no mês”: o que foi pago naquele mês, com o número de pagamentos, o ticket médio e a variação sobre o mês anterior.',
          'Veja em “Por curso”, “Por forma de pagamento” e “Por origem da venda” de onde veio o dinheiro.',
        ],
        dica: 'O painel é em regime de caixa: uma cobrança de agosto paga em setembro conta em setembro.',
      },
      {
        id: 'atualizar-vendas',
        titulo: 'Ler a Únicopag agora',
        passos: [
          'Em “Vendas”, use “Atualizar agora”, no alto da tela.',
          'Espere o botão sair de “Lendo a Únicopag…”.',
          'Leia embaixo do botão o resultado da leitura ou, se alguma conta falhou, o erro dela.',
        ],
        dica: 'A leitura automática acontece uma vez por dia. Só as contas ativas são lidas, e conta sem chave de API volta com erro.',
      },
      {
        id: 'achar-transacao',
        titulo: 'Achar uma transação',
        passos: [
          'Em “Vendas”, use o botão “Ver as transações de…”, no pé do painel.',
          'Escolha o mês e, se precisar, a conta, a situação e a forma de pagamento.',
          'Em “Pagador, curso, código…”, digite o nome de quem pagou, o curso ou o código da transação.',
          'Use “Filtrar”.',
          'Pare o mouse sobre a situação para ver o que ela quer dizer.',
        ],
        dica: 'Uma cobrança criada num mês e paga no seguinte aparece nos dois meses.',
      },
      {
        id: 'ver-disputas',
        titulo: 'Ver os pagamentos em disputa',
        passos: [
          'Abra “Transações”, ou toque na linha de pagamentos em disputa em “Pede atenção”, na “Visão geral”.',
          'No filtro “Todas as situações”, escolha “Em disputa” e use “Filtrar”.',
          'A lista mostra só as cobranças criadas ou pagas no mês escolhido. Se a disputa não aparecer, troque o mês e use “Filtrar” de novo.',
          'Confira o pagador, o curso e o valor de cada um. A disputa em si se resolve na Únicopag: a Redação só lê.',
        ],
      },
    ],
    perguntas: [
      {
        id: 'recebido-regime-de-caixa',
        pergunta: 'Por que o “Recebido no mês” não bate com as cobranças do mês?',
        resposta: 'O painel é em regime de caixa: conta o que foi pago no mês, não o que foi cobrado. Uma cobrança criada em agosto e paga em setembro entra no recebido de setembro. Em “Transações”, ela aparece nos dois meses.',
        termos: ['caixa', 'competência', 'diferença', 'não bate', 'pago no mês'],
      },
      {
        id: 'situacoes',
        pergunta: 'O que quer dizer cada situação da transação?',
        resposta: '“Pago” é pagamento aprovado; “Aguardando”, cobrança aberta ou em análise; “Recusado”, recusado pelo banco, pelo antifraude ou com falha; “Cancelado”, cobrança cancelada ou expirada sem pagamento.\n\n“Estornado” quer dizer que o dinheiro foi devolvido a quem pagou; “Em disputa”, que foi pago, mas o titular do cartão abriu contestação (pré-chargeback); “Contestado”, chargeback confirmado, com o valor de volta ao titular do cartão. Na tabela de “Transações”, pare o mouse sobre a situação para ver essa explicação.',
        termos: ['status', 'pago', 'aguardando', 'recusado', 'cancelado', 'estornado', 'em disputa', 'contestado', 'chargeback', 'pré-chargeback'],
      },
      {
        id: 'em-disputa-conta',
        pergunta: 'Pagamento “Em disputa” entra no recebido?',
        resposta: 'Entra: a disputa ainda não devolveu o dinheiro. Se virar chargeback, a transação passa a “Contestado”, sai do recebido e conta em “Estornos e contestações”.',
        termos: ['disputa', 'contestação', 'chargeback', 'pré-chargeback'],
      },
      {
        id: 'estorno-no-mes-da-venda',
        pergunta: 'Por que o estorno aparece no mês da venda, e não no mês em que o dinheiro voltou?',
        resposta: 'A Únicopag não informa a data da devolução, então “Estornos e contestações” conta a devolução no mês em que a cobrança foi criada. No Financeiro da escola, o estorno entra como despesa no dia em que a Únicopag marcou a devolução.',
        termos: ['estorno', 'devolução', 'reembolso', 'mês errado'],
      },
      {
        id: 'aguardando',
        pergunta: 'O que é “Aguardando pagamento”?',
        resposta: 'A soma das cobranças criadas no mês que ainda esperam pagamento ou estão em análise. Embaixo, a porcentagem das cobranças já decididas no mês que foram pagas.',
        termos: ['pendente', 'em aberto', 'cobrança aberta', 'taxa de aprovação'],
      },
      {
        id: 'saldo-nas-contas',
        pergunta: 'De onde vem o “Saldo nas contas”?',
        resposta: 'É o saldo que a Únicopag informa para cada conta: o disponível e, embaixo, o que ainda está a liberar. Ele é lido junto com as transações, e o texto diz quando foi a última leitura.',
        termos: ['saldo', 'a liberar', 'disponível', 'dinheiro na conta'],
      },
      {
        id: 'valores-brutos',
        pergunta: 'Os valores já descontam as taxas da Únicopag?',
        resposta: 'Não. Os valores são os brutos da cobrança; as taxas aparecem no extrato de repasse da Únicopag.',
        termos: ['taxa', 'tarifa', 'líquido', 'repasse', 'bruto'],
      },
      {
        id: 'origem-da-venda',
        pergunta: 'O que é a “origem da venda”?',
        resposta: 'É o utm_source que veio com a venda, ou seja, de onde a pessoa chegou até a matrícula (facebook, instagram…). Venda sem essa marca aparece como “Direto / sem origem”. Os links com UTM se montam no “Marketing”, na página de cada campanha.',
        termos: ['utm', 'utm_source', 'canal', 'de onde veio', 'sem origem'],
      },
      {
        id: 'cpf-mascarado',
        pergunta: 'Por que o CPF aparece com asteriscos?',
        resposta: 'Por privacidade: a Redação guarda só o CPF mascarado e o nome do pagador. A ficha completa de quem estuda fica no sistema da escola.',
        termos: ['cpf', 'documento', 'lgpd', 'dados do aluno', 'privacidade'],
      },
      {
        id: 'nenhuma-conta',
        pergunta: 'Apareceu “Nenhuma conta da Únicopag ligada ainda”. O que fazer?',
        resposta: 'Um administrador precisa cadastrar as contas da Únicopag da escola, com a chave de API de cada uma, em “Contas e integrações”. Depois da primeira leitura, os números aparecem em “Vendas”.',
        termos: ['vazio', 'sem conta', 'ligar conta'],
      },
      {
        id: 'contas-com-problema',
        pergunta: 'O que fazer quando uma conta aparece em “Contas que precisam de atenção”?',
        resposta: 'Se a linha diz “sem chave de API”, a conta não está sendo lida: um administrador guarda a chave em “Contas e integrações”. Se aparece outro texto, é o erro da última leitura: chave recusada (401) pede uma chave nova; muitas consultas seguidas (429) ou problema na Únicopag costumam se resolver tentando de novo mais tarde.',
        termos: ['erro', '401', '403', '429', 'chave', 'falhou', 'leitura'],
      },
      {
        id: 'venda-nao-aparece',
        pergunta: 'Uma venda que acabou de acontecer não aparece. Por quê?',
        resposta: 'A Redação lê a Únicopag uma vez por dia. Use “Atualizar agora” para ler na hora. Confira também se está no mês certo e se nenhum filtro de “Transações” está escondendo a venda.',
        termos: ['sumiu', 'falta venda', 'não apareceu', 'atraso'],
      },
      {
        id: 'estornar-pela-redacao',
        pergunta: 'Dá para estornar ou cancelar uma cobrança pela Redação?',
        resposta: 'Não. A Redação só lê a Únicopag: não cria cobrança, não estorna e não cancela. Feito isso na Únicopag, a situação muda na Redação na leitura seguinte.',
        termos: ['estornar', 'cancelar', 'reembolsar', 'devolver'],
      },
      {
        id: 'variacao-sobre-o-mes-anterior',
        pergunta: 'Por que não aparece a variação sobre o mês anterior?',
        resposta: 'A variação só aparece quando o mês anterior teve algum valor recebido. Sem recebido no mês anterior, não há base para comparar.',
        termos: ['comparação', 'porcentagem', 'crescimento', 'mês passado'],
      },
    ],
    relacionadas: ['/escola', '/escola/financeiro', '/escola/configuracoes', '/escola/marketing'],
  },

  // ------------------------------------------------------------ Financeiro da escola
  {
    href: '/escola/financeiro',
    paraQueServe: 'Os livros da Escola no Financeiro. A escola é uma empresa à parte, com CNPJ, contas, lançamentos, conciliação e fechamento do mês próprios; “Financeiro”, na Escola, abre o Financeiro já nos livros dela. As vendas pagas na Únicopag entram lá sozinhas como receita, e os estornos, como despesa.',
    quemUsa: 'Só quem tem acesso aos livros da Escola, dado por um administrador no Financeiro (“Cadastros”, aba “Quem acessa”). O nível decide o que a pessoa faz: “Ver”, “Lançar”, “Aprovar” ou “Gestão e fechamento”. A equipe da escola só pode ter os livros da Escola; administradores têm acesso a tudo.',
    // Não há tela neste endereço: ele abre o Financeiro nos livros da Escola (route.ts).
    tour: [],
    tarefas: [
      {
        id: 'abrir-livros-da-escola',
        titulo: 'Abrir os livros da Escola',
        passos: [
          'No menu, em “Escola de Educação e Saúde”, abra “Financeiro” (ou a seção “Financeiro” no alto das telas da Escola).',
          'O Financeiro abre nos livros da Escola.',
          'Use as seções do Financeiro como de costume: “Lançamentos”, “Conciliação”, “Fechamento”, “Cadastros”…',
          'Quem vê mais de uma empresa confere o nome em “Livros abertos” e volta aos livros da filial em “Trocar empresa”.',
        ],
        dica: 'O Financeiro lembra a última empresa aberta. Depois de entrar pela Escola, ele continua nos livros dela até você trocar.',
      },
      {
        id: 'pedir-acesso-aos-livros',
        titulo: 'Pedir acesso aos livros da Escola',
        passos: [
          'Se, ao abrir “Financeiro” na Escola, você voltar à “Visão geral” com o aviso de que os livros ainda não foram liberados, falta o acesso.',
          'Peça a um administrador, dizendo o que você precisa fazer: só ver, lançar, aprovar ou fechar o mês.',
          'Com o acesso liberado, “Financeiro” abre direto nos livros da Escola.',
        ],
      },
      {
        id: 'liberar-livros',
        titulo: 'Liberar os livros da Escola para alguém',
        passos: [
          'Abra o Financeiro e vá em “Cadastros”, aba “Quem acessa”.',
          'Ache a pessoa na lista. Quem é da equipe da escola aparece com “(equipe da escola)”.',
          'Em “Nível no Financeiro”, escolha “Ver”, “Lançar”, “Aprovar” ou “Gestão e fechamento”.',
          'Em “De qual empresa”, escolha “Só” com o nome da Escola. Para quem é da equipe da escola, ela já vem escolhida.',
        ],
        dica: 'Para tirar o acesso, escolha “Sem acesso” em “Nível no Financeiro”.',
        quem: 'Só administradores',
      },
      {
        id: 'conferir-vendas-nos-livros',
        titulo: 'Conferir as vendas da Únicopag nos livros da Escola',
        passos: [
          'Abra os livros da Escola (“Financeiro”, na Escola).',
          'Em “Lançamentos”, procure as receitas que começam com “Únicopag ·”, seguidas do curso e da forma de pagamento. Elas ficam na conta “Únicopag · <nome da conta>”.',
          'Cada venda paga entra como receita em “Cursos e capacitações”. Estorno e chargeback entram como despesa em “Estornos e chargebacks”.',
          'Em “Nº do documento” vai o código da transação: com ele, quem vê as vendas acha a cobrança em “Transações”.',
        ],
        dica: 'Pode corrigir a categoria e a descrição de um lançamento automático: a leitura seguinte não desfaz.',
      },
      {
        id: 'mudar-inicio-dos-lancamentos',
        titulo: 'Mudar a partir de quando as vendas entram no Financeiro',
        passos: [
          'Em “Contas e integrações”, use o lápis da conta da Únicopag.',
          'Mude “Lançar no Financeiro da escola a partir de”.',
          'Use “Salvar”. As vendas pagas desde a nova data que ainda não estavam nos livros entram em seguida.',
        ],
        quem: 'Só administradores',
      },
    ],
    perguntas: [
      {
        id: 'lancar-vendas-a-mao',
        pergunta: 'Preciso lançar as vendas da escola à mão?',
        resposta: 'Não. A cada leitura da Únicopag (uma vez por dia ou pelo “Atualizar agora”), as vendas pagas entram sozinhas como receita nos livros da Escola. Estorno e chargeback entram como despesa em “Estornos e chargebacks”. Uma venda nunca entra duas vezes.',
        termos: ['automático', 'lançamento automático', 'receita', 'únicopag', 'importar vendas'],
      },
      {
        id: 'venda-em-mes-fechado',
        pergunta: 'E se a venda for de um mês já fechado?',
        resposta: 'O mês fechado não muda. A venda (ou o estorno) entra no primeiro dia ainda aberto, e a data real fica na “Observação” do lançamento.',
        termos: ['fechamento', 'mês fechado', 'data errada'],
      },
      {
        id: 'desfazer-pagamento-unicopag',
        pergunta: 'Dá para desfazer o pagamento de uma venda da Únicopag?',
        resposta: 'Não. O lançamento que veio da Únicopag acompanha a venda. Se o dinheiro voltou, o estorno entra sozinho na próxima leitura.',
        termos: ['desfazer', 'estorno', 'cancelar pagamento'],
      },
      {
        id: 'corrigir-lancamento-automatico',
        pergunta: 'Posso mudar a categoria ou a descrição de um lançamento automático?',
        resposta: 'Pode. Cada lançamento guarda a transação de onde veio, então a leitura seguinte não desfaz o que você corrigiu nem lança a venda de novo.',
        termos: ['editar', 'categoria', 'descrição', 'corrigir'],
      },
      {
        id: 'nome-do-aluno-no-lancamento',
        pergunta: 'Por que o nome de quem pagou não aparece no lançamento?',
        resposta: 'De propósito: o nome de quem paga o curso não vai para o Financeiro. A descrição leva o curso e a forma de pagamento, e o “Nº do documento” leva o código da transação, com o qual quem vê as vendas acha o pagador em “Transações”.',
        termos: ['aluno', 'pagador', 'privacidade', 'lgpd'],
      },
      {
        id: 'vendas-antigas',
        pergunta: 'Por que vendas antigas não estão no Financeiro?',
        resposta: 'Só entram as vendas pagas a partir da data “Lançar no Financeiro da escola a partir de”, da conta da Únicopag. O que foi pago antes fica só no painel de vendas. Um administrador muda essa data em “Contas e integrações”.',
        termos: ['faltando', 'histórico', 'data de início'],
      },
      {
        id: 'financeiro-na-empresa-errada',
        pergunta: 'Por que o Financeiro abriu nos livros da Escola?',
        resposta: 'O Financeiro lembra a última empresa aberta. Entrar pelo “Financeiro” da Escola abre os livros dela; para voltar aos da filial, use “Trocar empresa”, no alto do Financeiro.',
        termos: ['filial', 'empresa errada', 'trocar empresa', 'livros abertos', 'mudou sozinho'],
      },
      {
        id: 'volta-para-visao-geral',
        pergunta: 'Por que “Financeiro” me leva de volta à “Visão geral”?',
        resposta: 'Você ainda não tem acesso aos livros da Escola, e a “Visão geral” mostra o aviso. Peça a um administrador, que libera no Financeiro, em “Cadastros”, aba “Quem acessa”.',
        termos: ['sem acesso', 'não abre', 'redireciona', 'livros não liberados'],
      },
      {
        id: 'equipe-ve-a-filial',
        pergunta: 'A equipe da escola vê os livros da filial?',
        resposta: 'Não. A equipe da escola só pode ter acesso aos livros da Escola; as contas e os lançamentos da filial não aparecem para ela.',
        termos: ['filial', 'privacidade', 'separado', 'equipe da escola'],
      },
      {
        id: 'cnpj-da-escola',
        pergunta: 'Onde fica o CNPJ da Escola?',
        resposta: 'Nos livros da Escola, em “Cadastros”, aba “Empresa”. Só quem tem “Gestão e fechamento” muda. Enquanto ele falta, o bloco do financeiro na “Visão geral” mostra “CNPJ não informado”.',
        termos: ['cnpj', 'razão social', 'dados da empresa'],
      },
    ],
    relacionadas: ['/escola/vendas', '/escola/configuracoes', '/financeiro'],
  },

  // ------------------------------------------------------------ Marketing
  {
    href: '/escola/marketing',
    paraQueServe: 'O marketing da escola num lugar só: as campanhas, com o que custaram e o que trouxeram; as peças (páginas, anúncios, posts, e-mails) com imagem e números; e as referências de fora, para inspirar. Os anúncios do Meta entram sozinhos, e a receita vem das vendas da Únicopag pelo utm_campaign de cada campanha.',
    quemUsa: 'Administradores, a equipe da escola, quem é de Educação e Saúde ou tem acesso aos livros da Escola, editores e a Comunicação Social. Todas essas pessoas criam e editam campanhas e peças. Excluir uma campanha ou uma peça é de quem a criou e dos administradores.',
    tour: [
      {
        titulo: 'Marketing da escola',
        texto: 'Campanhas, páginas, anúncios e posts da escola, com o que custaram e o que trouxeram. Os anúncios vêm sozinhos do Meta, e a receita, da Únicopag.',
      },
      {
        alvo: 'escola-marketing.nova-campanha',
        titulo: 'Nova campanha',
        texto: 'O botão “Nova campanha” abre o cadastro. O “utm_campaign” dela é o que liga a venda na Únicopag à campanha.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-marketing.biblioteca',
        titulo: 'Biblioteca de peças',
        texto: 'O botão “Biblioteca de peças” abre todas as peças numa galeria, com imagem e números, e as referências de fora guardadas para inspirar as próximas.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-marketing.indicadores',
        titulo: 'O resumo',
        texto: 'Quantas campanhas há e quantas estão no ar, as peças criadas, o investido em anúncios e a receita que as campanhas trouxeram.',
      },
      {
        alvo: 'escola-marketing.meta',
        titulo: 'Anúncios do Meta',
        texto: 'A última leitura dos anúncios do Meta, ou o erro dela. Com a conta ligada, “Atualizar do Meta” lê de novo na hora; ligar a conta fica em “Contas e integrações”.',
      },
      {
        alvo: 'escola-marketing.campanhas',
        titulo: 'As campanhas',
        texto: 'Cada linha traz o investido e as matrículas das peças, a receita da Únicopag e o retorno. “sem UTM” quer dizer que falta o utm_campaign. O nome abre a campanha.',
      },
      {
        alvo: 'escola-marketing.linha-do-tempo',
        titulo: 'Linha do tempo',
        texto: 'Tudo o que já foi feito, mês a mês, do mais novo ao mais antigo, para ninguém começar do zero.',
        lado: 'top',
      },
    ],
    telas: [
      {
        caminho: '/escola/marketing/[id]',
        rotulo: 'Campanha',
        tour: [
          {
            titulo: 'A campanha',
            texto: 'Tudo de uma campanha num lugar: as peças, o que custaram, o que trouxeram e o que a equipe aprendeu.',
          },
          {
            alvo: 'escola-marketing.editar-campanha',
            titulo: 'Editar e aprendizados',
            texto: '“Editar e aprendizados” muda os dados da campanha e guarda o que funcionou e o que repetir. É o que fica para quem vier depois.',
            lado: 'bottom',
          },
          {
            alvo: 'escola-marketing.numeros',
            titulo: 'Os números',
            texto: 'Investido, contatos, matrículas, a conversão de contato em matrícula, a receita da Únicopag pelo utm_campaign e o retorno (receita ÷ investido).',
          },
          {
            alvo: 'escola-marketing.pecas',
            titulo: 'As peças',
            texto: 'A página de venda, os anúncios e os posts desta campanha, com imagem e números. “Nova peça” junta mais uma à campanha.',
          },
          {
            alvo: 'escola-marketing.utm',
            titulo: 'Link com UTM',
            texto: 'O quadro “Link com UTM” monta o link de cada anúncio e post. A venda que vier por ele entra na receita da campanha.',
            lado: 'top',
            seAusente: 'pular',
          },
        ],
      },
      {
        caminho: '/escola/marketing/biblioteca',
        rotulo: 'Biblioteca de peças',
        tour: [
          {
            titulo: 'Biblioteca de peças',
            texto: 'Cada página, anúncio, post e e-mail que a escola já usou, com a imagem e os números, e as referências guardadas para inspirar as próximas.',
          },
          {
            alvo: 'escola-marketing.nova-peca',
            titulo: 'Cadastrar uma peça',
            texto: '“Nova peça” cadastra uma peça da escola, com campanha, link, texto e resultados. A imagem entra depois, pelo cartão.',
            lado: 'bottom',
            seAusente: 'pular',
          },
          {
            alvo: 'escola-marketing.nova-referencia',
            titulo: 'Guardar uma referência',
            texto: '“Guardar referência” guarda um anúncio ou uma página de fora, com o link, de onde veio e por que vale guardar.',
            lado: 'bottom',
            seAusente: 'pular',
          },
          {
            alvo: 'escola-marketing.abas',
            titulo: 'Nossas peças e referências',
            texto: '“Nossas peças” são as da escola. “Referências” são anúncios e páginas de fora (concorrentes, outras filiais) que vale guardar.',
            lado: 'bottom',
          },
          {
            alvo: 'escola-marketing.filtros',
            titulo: 'Filtrar',
            texto: 'Filtre por tipo e canal (em “Nossas peças”, também por campanha e “Só vencedoras”) ou busque por título, texto e ângulo. Depois, use “Filtrar”.',
            lado: 'bottom',
          },
          {
            alvo: 'escola-marketing.galeria',
            titulo: 'O cartão da peça',
            texto: 'Imagem, tipo, canal e situação; nas nossas, também CTR e custo por contato e por matrícula. A estrela marca a vencedora; o lápis edita.',
            seAusente: 'pular',
          },
        ],
      },
    ],
    tarefas: [
      {
        id: 'criar-campanha',
        titulo: 'Criar uma campanha',
        passos: [
          'Em “Marketing”, use “Nova campanha”.',
          'Dê o “Nome da campanha” (o curso e a turma, por exemplo). O “utm_campaign” é sugerido a partir do nome; ajuste se quiser.',
          'Preencha “Curso”, “Objetivo”, “Situação”, “Início”, “Fim” e “Orçamento (R$)”. Se aparecer “Conta Únicopag”, escolha a conta.',
          'Em “Resumo”, anote o público, a oferta e a ideia central.',
          'Use “Salvar”: a página da campanha abre.',
        ],
        dica: 'Use o mesmo utm_campaign em todos os links da campanha: é por ele que a venda na Únicopag vira receita dela. Aceita só letras minúsculas, números, ponto, hífen e sublinhado.',
      },
      {
        id: 'montar-link-com-utm',
        titulo: 'Montar o link com UTM de um anúncio ou post',
        passos: [
          'Abra a campanha pelo nome dela, na lista de “Campanhas”.',
          'No quadro “Link com UTM”, confira a “Página de destino”. Ela já vem com a página de venda da campanha, se houver; senão, cole o endereço.',
          'Escolha o “Canal” e, se quiser separar os anúncios, preencha “Qual peça (utm_content)”.',
          'Use “Copiar” e cole o link no anúncio ou no post.',
        ],
        dica: 'O quadro só aparece quando a campanha tem utm_campaign. Sem ele, use “Editar e aprendizados” e preencha.',
      },
      {
        id: 'cadastrar-peca',
        titulo: 'Cadastrar uma peça numa campanha',
        passos: [
          'Na página da campanha, use “Nova peça”.',
          'Preencha “Título”, “Tipo”, “Canal” e “Situação”. A “Campanha” já vem escolhida.',
          'Cole o “Link” da peça no ar e anote o “Ângulo”, o “Formato” e o “Texto da peça”.',
          'Preencha “Publicada em” (e “Saiu do ar em”, se já saiu): é a data de publicação que põe a peça no mês certo da linha do tempo.',
          'Em “Resultados”, preencha o que souber (investimento, impressões, cliques, contatos e matrículas) e a data em “Números lidos em”.',
          'Use “Salvar”.',
          'No cartão da peça, use “Imagem” para pôr a arte.',
        ],
        dica: 'Anúncio do Meta não precisa ser cadastrado: com a conta de anúncios ligada, ele entra sozinho, com os números.',
      },
      {
        id: 'marcar-vencedora',
        titulo: 'Marcar a peça vencedora',
        passos: [
          'No cartão da peça, use o lápis (“Editar”).',
          'Marque “Peça vencedora” e escreva em “Nota” o que ela fez de diferente.',
          'Use “Salvar”. A estrela aparece no cartão.',
        ],
        dica: 'Na “Biblioteca de peças”, “Só vencedoras” junta todas: é um bom ponto de partida para a próxima campanha.',
      },
      {
        id: 'registrar-aprendizados',
        titulo: 'Registrar os aprendizados de uma campanha',
        passos: [
          'Abra a campanha e use “Editar e aprendizados”.',
          'Em “Aprendizados”, escreva o que funcionou, o que não funcionou e o que repetir.',
          'Se a campanha acabou, mude a “Situação” para “Encerrada”.',
          'Use “Salvar”. Os aprendizados ficam em destaque na página da campanha.',
        ],
      },
      {
        id: 'guardar-referencia',
        titulo: 'Guardar uma referência de fora',
        passos: [
          'Em “Marketing”, abra “Biblioteca de peças” e vá na aba “Referências”.',
          'Use “Guardar referência”.',
          'Preencha “Título”, “Tipo”, “Canal”, “De onde veio” e o “Link” (a Biblioteca de Anúncios do Meta, o site…).',
          'Em “Por que guardar”, anote o que vale copiar ou evitar e use “Salvar”.',
          'Se quiser, ponha a imagem pelo botão “Imagem” do cartão.',
        ],
      },
      {
        id: 'atualizar-do-meta',
        titulo: 'Trazer os números do Meta agora',
        passos: [
          'Em “Marketing”, no quadro “Anúncios do Meta”, use “Atualizar do Meta”.',
          'Espere o botão sair de “Lendo o Meta…”.',
          'Leia o resultado ao lado: quantas campanhas e anúncios foram lidos, ou o erro.',
        ],
        dica: 'A leitura automática é uma vez por dia. Se o quadro diz que os anúncios não estão ligados, um administrador liga a conta em “Contas e integrações”.',
      },
      {
        id: 'excluir-campanha-ou-peca',
        titulo: 'Excluir uma campanha ou uma peça',
        passos: [
          'Abra a campanha pelo nome dela, na lista de “Campanhas”. Para uma peça, ache o cartão dela na página da campanha ou na “Biblioteca de peças”.',
          'Na campanha, use “Excluir”, ao lado de “Editar e aprendizados”; na peça, a lixeira do cartão.',
          'Confirme na pergunta que aparece.',
        ],
        dica: 'Excluir a campanha não apaga as peças: elas continuam na biblioteca, sem campanha. Excluir na Redação não mexe no Meta: campanha ou anúncio lido de lá pode voltar na leitura seguinte.',
        quem: 'Quem criou e administradores',
      },
    ],
    perguntas: [
      {
        id: 'sem-utm',
        pergunta: 'Por que a campanha aparece “sem UTM” e sem receita?',
        resposta: 'A receita chega à campanha pelas vendas da Únicopag que trazem o utm_campaign dela. Sem utm_campaign na campanha, não há como ligar venda e campanha. Use “Editar e aprendizados”, preencha o “utm_campaign” e use o mesmo nos links dos anúncios.',
        termos: ['utm', 'utm_campaign', 'receita zerada', 'sem receita'],
      },
      {
        id: 'receita-de-quando',
        pergunta: 'A receita da campanha é de qual período?',
        resposta: 'De todas as vendas pagas com o utm_campaign dela, desde sempre, e não só entre o início e o fim da campanha. Vendas “Em disputa” contam; as estornadas e as contestadas, não.',
        termos: ['período', 'datas', 'receita', 'desde quando'],
      },
      {
        id: 'matriculas-x-pagamentos',
        pergunta: 'Por que as matrículas da campanha não batem com os pagamentos da receita?',
        resposta: '“Matrículas” somam o que cada peça registra: nos anúncios do Meta, o que o Meta contou; nas outras, o que a equipe digitou. Já a receita e o número de pagamentos vêm das vendas da Únicopag com o utm_campaign. São duas fontes e podem diferir.',
        termos: ['conversões', 'compras', 'diferença', 'não bate'],
      },
      {
        id: 'campanhas-do-meta',
        pergunta: 'Apareceram campanhas e peças que ninguém cadastrou. De onde vêm?',
        resposta: 'Do Meta. Com a conta de anúncios ligada, cada campanha do Meta vira campanha da escola (ou se liga a uma que já existia, pelo utm_campaign ou pelo nome), e cada anúncio vira peça, com o selo “Meta”.',
        termos: ['meta ads', 'facebook', 'instagram', 'automático', 'selo meta'],
      },
      {
        id: 'editar-peca-do-meta',
        pergunta: 'O que dá para mudar numa peça lida do Meta?',
        resposta: 'Título, campanha, ângulo, formato, texto, link, nota e a marca de vencedora, e a leitura seguinte não apaga o que você escreveu. Investimento, impressões, cliques, contatos, matrículas, situação e datas vêm do Meta a cada leitura.',
        termos: ['meta', 'editar anúncio', 'números do meta'],
      },
      {
        id: 'quem-exclui',
        pergunta: 'Quem pode excluir uma campanha ou uma peça?',
        resposta: 'Quem a criou e os administradores. Campanha ou peça que veio do Meta não foi criada por ninguém na Redação, então só um administrador exclui, e ela pode voltar na leitura seguinte, porque excluir na Redação não mexe no Meta. Excluir a campanha não apaga as peças: elas continuam na biblioteca, sem campanha.',
        termos: ['excluir', 'apagar', 'lixeira', 'permissão'],
      },
      {
        id: 'o-que-e-vencedora',
        pergunta: 'O que é uma peça “vencedora”?',
        resposta: 'É a peça que mais trouxe resultado, marcada pela equipe. A estrela aparece no cartão, e “Só vencedoras”, na biblioteca, junta todas.',
        termos: ['estrela', 'melhor anúncio', 'vencedora'],
      },
      {
        id: 'ctr-e-custos',
        pergunta: 'O que são CTR, “Por contato” e “Por matrícula”?',
        resposta: 'CTR é cliques ÷ impressões. “Por contato” é o investimento ÷ contatos (leads), e “Por matrícula”, o investimento ÷ matrículas. Aparecem quando a peça tem os números que a conta precisa.',
        termos: ['ctr', 'cpl', 'cpa', 'custo por lead', 'custo por matrícula', 'métricas'],
      },
      {
        id: 'referencia-nos-totais',
        pergunta: 'Referência entra nos totais da campanha?',
        resposta: 'Não. Referência é peça de fora (concorrente, outra filial, inspiração): fica só na aba “Referências” da biblioteca, sem campanha e sem investimento, contatos ou matrículas.',
        termos: ['referência', 'swipe file', 'concorrente', 'inspiração'],
      },
      {
        id: 'imagem-da-peca',
        pergunta: 'Que imagem posso pôr numa peça?',
        resposta: 'JPG, PNG ou WEBP, com até 10 MB. A Redação confere se o arquivo é mesmo uma imagem. Trocar a imagem apaga a anterior.',
        termos: ['imagem', 'arte', 'criativo', 'upload', 'foto'],
      },
      {
        id: 'meta-nao-ligado',
        pergunta: 'O quadro “Anúncios do Meta” diz que os anúncios não estão ligados. O que fazer?',
        resposta: 'Sem a conta de anúncios ligada, os números dos anúncios não entram sozinhos. Um administrador liga em “Contas e integrações”; enquanto isso, dá para cadastrar as peças e os números à mão.',
        termos: ['meta', 'não ligados', 'ligar anúncios'],
      },
      {
        id: 'erro-do-meta',
        pergunta: 'O que fazer quando a leitura do Meta falha?',
        resposta: 'O quadro mostra a mensagem do erro. Limite de consultas ou problema no Meta costumam se resolver tentando de novo mais tarde. Token vencido ou revogado pede um token novo, que um administrador guarda em “Contas e integrações”. Token sem permissão pede, no Meta, a permissão ads_read e o acesso à conta de anúncios para o usuário do sistema.',
        termos: ['erro', 'token', 'expirou', 'falhou', '190', 'permissão', 'ads_read'],
      },
      {
        id: 'situacao-da-campanha',
        pergunta: 'O que muda quando a campanha está “No ar”?',
        resposta: 'Ela passa a contar nas campanhas no ar (“Campanhas no ar”, na “Visão geral”, e “no ar agora”, no “Marketing”). Se estiver sem utm_campaign, aparece também em “Pede atenção”, porque a receita não chega a ela. Na campanha lida do Meta, a situação vem do Meta a cada leitura.',
        termos: ['planejada', 'no ar', 'encerrada', 'situação', 'status da campanha'],
      },
      {
        id: 'linha-do-tempo',
        pergunta: 'O que entra na linha do tempo?',
        resposta: 'As campanhas e as peças da escola, do mais novo ao mais antigo, agrupadas por mês. Vale a data de início da campanha ou de publicação da peça; sem ela, a data do cadastro. Referências não entram.',
        termos: ['histórico', 'cronologia', 'linha do tempo'],
      },
    ],
    relacionadas: ['/escola/marketing/advertoriais', '/escola/vendas', '/escola/configuracoes', '/escola'],
  },

  // ------------------------------------------------------------ Advertoriais
  {
    href: '/escola/marketing/advertoriais',
    paraQueServe: 'O banco de advertoriais da escola: matérias-anúncio publicadas como notícia no site para levar quem vem do anúncio até a matrícula. Cada uma com o funil dela: visitas, cliques no botão de matrícula, matrículas, receita e o que custaram os anúncios que apontam para ela.',
    quemUsa: 'Quem trabalha no marketing da escola: administradores, a equipe da escola, quem é de Educação e Saúde ou tem acesso aos livros da Escola, editores e a Comunicação Social. Todas essas pessoas acompanham os números e mudam os dados de cada advertorial. Criar e escrever o texto, no editor de matérias da Redação, fica com quem não é da equipe da escola.',
    tour: [
      {
        titulo: 'Advertoriais',
        texto: 'Matérias publicadas como notícia no site para levar quem vem do anúncio até a matrícula. Cada uma com o funil dela: visitas, cliques no botão, matrículas e custo.',
      },
      {
        alvo: 'escola-advertoriais.novo',
        titulo: 'Novo advertorial',
        texto: '“Novo advertorial” pede manchete, campanha e destino do botão. A matéria nasce em rascunho, já com a estrutura do texto e o botão de matrícula rastreado, e abre no editor.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-advertoriais.indicadores',
        titulo: 'O funil de todos',
        texto: 'Quantos advertoriais há e quantos estão no site, as visitas, os cliques no botão de matrícula, as matrículas e o investido nos anúncios.',
      },
      {
        alvo: 'escola-advertoriais.filtros',
        titulo: 'Ordem e campanha',
        texto: 'Ordene por mais recentes, matrículas, taxa de clique, visitas ou retorno, e filtre por campanha. Depois, use “Aplicar”.',
        lado: 'bottom',
      },
      {
        alvo: 'escola-advertoriais.banco',
        titulo: 'O cartão do advertorial',
        texto: 'Cada cartão mostra o funil da página. “Link para o anúncio” copia o endereço da matéria, com as UTMs da campanha se ela tiver; o ícone de ajustes muda campanha, destino do botão, situação e nota.',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-advertoriais.como-contam',
        titulo: 'Como os números chegam',
        texto: 'Visitas pela página publicada, cliques pelo botão, investido pelos anúncios que apontam para a página e matrículas pelo utm_content na Únicopag.',
        lado: 'top',
      },
    ],
    tarefas: [
      {
        id: 'criar-advertorial',
        titulo: 'Criar um advertorial',
        passos: [
          'Em “Advertoriais”, use “Novo advertorial”.',
          'Escreva a “Manchete”. Dá para mudar depois, no editor.',
          'Escolha a “Campanha” e, se quiser, o “Ângulo” (história, prova, preço, carreira…).',
          'Em “Botão de matrícula leva para”, cole o endereço da página de inscrição do curso, começando com https://.',
          'Use “Criar e abrir no editor”: a matéria nasce em rascunho, com a estrutura do texto e o botão de matrícula no lugar.',
          'Troque os trechos entre colchetes pelo texto de verdade. Mantenha sozinha na linha o link “Quero garantir minha vaga”: é essa linha que vira o botão.',
        ],
        dica: 'Ligue o advertorial a uma campanha com utm_campaign: o “Link para o anúncio” leva as UTMs dela, e a venda chega à campanha.',
        quem: 'Quem não é da equipe da escola',
      },
      {
        id: 'publicar-advertorial',
        titulo: 'Publicar o advertorial no site',
        passos: [
          'No cartão do advertorial, use “Escrever” para abrir a matéria no editor.',
          'Termine o texto.',
          'Em “Publicar esta matéria”, use “Criar pacote de publicação” e siga como em qualquer notícia do site.',
          'Publicado, o cartão mostra “Ver no site” e “Link para o anúncio”, e a página passa a contar visitas e cliques.',
        ],
        dica: 'Depois de publicado, o botão do cartão passa a se chamar “Editar texto”.',
        quem: 'Quem não é da equipe da escola',
      },
      {
        id: 'usar-no-anuncio',
        titulo: 'Pôr o advertorial num anúncio',
        passos: [
          'No cartão do advertorial publicado, use “Link para o anúncio”: o endereço é copiado.',
          'Cole esse endereço como link do anúncio no Meta.',
          'Com a conta de anúncios ligada, nas leituras seguintes do Meta o investido desse anúncio passa a contar no cartão do advertorial.',
        ],
        dica: 'Se a campanha do advertorial tem utm_campaign, o link já leva utm_source=facebook, utm_medium=paid, a campanha e a marca do advertorial. Sem isso, o link é o endereço da matéria, sem UTMs.',
      },
      {
        id: 'mudar-dados-do-advertorial',
        titulo: 'Mudar a campanha, o destino do botão ou a situação',
        passos: [
          'No cartão, use o ícone de ajustes, no canto de baixo à direita.',
          'Mude “Campanha”, “Ângulo”, “Botão leva para”, “Situação” ou “Nota”.',
          'Marque “Vencedora” se a página foi a que mais trouxe matrícula.',
          'Use “Salvar”.',
        ],
        dica: 'Isto não mexe no texto da matéria, e a equipe da escola também pode fazer.',
      },
      {
        id: 'comparar-advertoriais',
        titulo: 'Descobrir qual advertorial vende mais',
        passos: [
          'Em “Advertoriais”, escolha a ordem “Mais matrículas”, “Maior taxa de clique” ou “Melhor retorno”.',
          'Se quiser, escolha uma campanha. Depois, use “Aplicar”.',
          'Compare nos cartões as visitas, os cliques no botão (com a taxa), as matrículas, a receita e o custo por matrícula.',
          'No ícone de ajustes do cartão, anote o que aprendeu em “Nota”, marque “Vencedora” e use “Salvar”.',
        ],
      },
    ],
    perguntas: [
      {
        id: 'o-que-e-advertorial',
        pergunta: 'O que é um advertorial?',
        resposta: 'Uma matéria-anúncio: um texto com cara de notícia, publicado no site, que conta uma história e termina no botão de matrícula. Quem chega pelo anúncio lê a matéria e segue para a inscrição levando as marcas do anúncio.',
        termos: ['matéria patrocinada', 'página de venda', 'landing', 'advertorial'],
      },
      {
        id: 'como-contam-visitas',
        pergunta: 'Como as visitas são contadas?',
        resposta: 'A página publicada conta cada leitura, sem guardar nada de quem lê. Robôs e pré-visualizações de link (como as do WhatsApp e do Facebook) não contam.',
        termos: ['visitas', 'pixel', 'acessos', 'pageviews'],
      },
      {
        id: 'como-conta-clique',
        pergunta: 'Como o clique no botão é contado?',
        resposta: 'A linha do texto que é só o link de matrícula vira botão. O clique passa pela Redação, que conta e segue para a página de inscrição com as UTMs do anúncio e a marca do advertorial.',
        termos: ['clique', 'botão', 'garantir vaga', 'cta'],
      },
      {
        id: 'cliques-sem-matricula',
        pergunta: 'Por que o advertorial tem cliques, mas nenhuma matrícula?',
        resposta: 'A matrícula só conta quando a venda paga na Únicopag chega com a marca do advertorial (o utm_content). Venda ainda não paga, ou feita sem passar pelo botão, não conta. As vendas são lidas uma vez por dia.',
        termos: ['matrícula zerada', 'sem matrícula', 'conversão', 'utm_content'],
      },
      {
        id: 'investido-vazio',
        pergunta: 'Por que o “Investido” do advertorial está vazio?',
        resposta: 'O investido vem dos anúncios cujo link aponta para a página do advertorial. Sem anúncio assim, fica “—”. Use o “Link para o anúncio” do cartão ao montar o anúncio no Meta.',
        termos: ['investimento', 'custo', 'anúncio', 'gasto'],
      },
      {
        id: 'nao-vejo-escrever',
        pergunta: 'Por que não vejo “Novo advertorial” nem “Escrever” (ou “Editar texto”)?',
        resposta: 'O texto é escrito no editor de matérias da Redação, que a equipe da escola não abre. Quem é da equipe da escola acompanha os números e muda os dados do cartão; o texto fica com quem trabalha no editor, como a Comunicação.',
        termos: ['criar', 'escrever', 'editar texto', 'equipe da escola', 'permissão'],
      },
      {
        id: 'rascunho',
        pergunta: 'O que quer dizer “Rascunho — ainda não publicado”?',
        resposta: 'A matéria foi criada, mas ainda não saiu no site. Enquanto isso, ela não conta visitas nem cliques e não tem “Link para o anúncio”. A “Visão geral” avisa quantos advertoriais estão assim.',
        termos: ['rascunho', 'não publicado', 'publicar'],
      },
      {
        id: 'situacao-no-ar',
        pergunta: 'A situação muda sozinha quando a matéria é publicada?',
        resposta: 'Muda: quando a matéria sai no site, o cartão que estava em “Rascunho” passa a mostrar “No ar”. “Pausada” e “Encerrada” você marca nos dados do cartão, quando a página deixa de ser usada nos anúncios.',
        termos: ['no ar', 'pausada', 'encerrada', 'situação'],
      },
      {
        id: 'mudar-pagina-de-inscricao',
        pergunta: 'Mudou a página de inscrição. Preciso refazer o advertorial?',
        resposta: 'Não. Mude “Botão leva para” nos dados do cartão e use “Salvar”: o botão da matéria passa a levar ao novo endereço, sem mexer no texto.',
        termos: ['destino', 'link do botão', 'página de inscrição', 'trocar link'],
      },
      {
        id: 'marca-do-advertorial',
        pergunta: 'Qual é a marca do advertorial no link?',
        resposta: 'É o utm_content: o final do endereço da matéria ou, enquanto ela não tem um, um código que começa com “adv-”. É por ele que a venda na Únicopag volta para o advertorial.',
        termos: ['utm_content', 'adv-', 'rastreio', 'marca'],
      },
    ],
    relacionadas: ['/escola/marketing', '/escola', '/redes'],
  },

  // ------------------------------------------------------------ Contas e integrações
  {
    href: '/escola/configuracoes',
    paraQueServe: 'Onde a escola se liga ao mundo de fora: as contas da Únicopag por onde ela recebe e a conta de anúncios do Meta (Facebook e Instagram). A Redação só lê: não cria cobrança, não estorna e não mexe em anúncio. Daqui saem os números de “Vendas” e do “Marketing” e as vendas lançadas no Financeiro da escola.',
    quemUsa: 'Quem vê as vendas da escola enxerga as contas da Únicopag; quem trabalha no marketing, a conta do Meta. Só administradores cadastram, editam, pausam e tiram contas e guardam chaves e tokens.',
    tour: [
      {
        titulo: 'Contas e integrações',
        texto: 'As contas da Únicopag e a conta de anúncios do Meta da escola. A Redação só lê: não cria cobrança, não estorna e não mexe em anúncio.',
      },
      {
        alvo: 'escola-contas.unicopag',
        titulo: 'Contas da Únicopag',
        texto: 'Cada conta por onde a escola recebe, com a chave guardada no cofre, a última leitura, o saldo e desde quando as vendas entram no Financeiro da escola.',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-contas.nova-conta',
        titulo: 'Ligar uma conta',
        texto: '“Nova conta” cadastra uma conta da Únicopag com a chave de API dela, que é testada antes de ser guardada. Só administradores veem este botão.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-contas.meta',
        titulo: 'Anúncios do Meta',
        texto: 'A conta de anúncios do Facebook e do Instagram. Ligada, as campanhas, os anúncios e os números entram sozinhos no marketing, uma vez por dia.',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-contas.ligar-meta',
        titulo: 'Ligar o Meta',
        texto: 'Só administradores ligam a conta de anúncios, com o ID dela e o token de um usuário do sistema com a permissão ads_read.',
        lado: 'top',
        seAusente: 'pular',
      },
      {
        alvo: 'escola-contas.como-funciona',
        titulo: 'Como a leitura funciona',
        texto: 'Uma vez por dia a Redação lê as contas. Da venda ficam valor, forma, curso, origem e pagador com CPF mascarado. Ninguém vê a chave de novo, nem administradores.',
        lado: 'top',
      },
    ],
    tarefas: [
      {
        id: 'ligar-conta-unicopag',
        titulo: 'Ligar uma conta da Únicopag',
        passos: [
          'No painel da Únicopag da conta, em Integrações → API, copie a chave de API.',
          'Em “Contas e integrações”, use “Nova conta”. Se ainda não há nenhuma conta, o formulário já aparece aberto.',
          'Preencha “Nome da conta” (o curso ou a finalidade) e, se houver, o “Endereço do sistema da escola” e a “Descrição”.',
          'Cole a chave em “Chave de API da Únicopag”.',
          'Em “Lançar no Financeiro da escola a partir de”, escolha desde quando as vendas pagas entram nos livros da Escola.',
          'Use “Salvar”. A chave é testada antes de ser guardada; as transações começam a ser lidas. Atualize a página em um minuto.',
        ],
        dica: 'Chave recusada não é guardada: confira se é a chave desta conta e se ela ainda vale.',
        quem: 'Só administradores',
      },
      {
        id: 'trocar-chave',
        titulo: 'Trocar a chave de uma conta',
        passos: [
          'Use o lápis da conta (“Editar”).',
          'Em “Trocar a chave de API”, cole a chave nova. Deixe em branco para manter a atual.',
          'Use “Salvar”. A chave nova é testada e, se valer, substitui a antiga.',
        ],
        dica: 'A chave nunca mais aparece: a tela mostra só os 4 últimos caracteres, para saber qual está guardada.',
        quem: 'Só administradores',
      },
      {
        id: 'pausar-ou-tirar-conta',
        titulo: 'Pausar ou tirar uma conta da Únicopag',
        passos: [
          'Para pausar: use o lápis da conta, mude “Situação” para “Pausada” e use “Salvar”. A conta deixa de ser lida; o que já foi lido continua no painel.',
          'Para parar de ler sem apagar nada: use “Tirar a chave” e confirme. As transações já lidas continuam.',
          'Para tirar a conta da Redação: use “Tirar conta” e confirme.',
        ],
        dica: '“Tirar conta” apaga da Redação a chave e a cópia das transações. Os lançamentos já feitos no Financeiro da escola continuam, e na Únicopag nada muda.',
        quem: 'Só administradores',
      },
      {
        id: 'endereco-do-sistema',
        titulo: 'Pôr o atalho para o sistema da escola',
        passos: [
          'Use o lápis da conta da Únicopag.',
          'Em “Endereço do sistema da escola”, cole o endereço onde ficam alunos, turmas e secretaria, começando com https://.',
          'Use “Salvar”. O botão aparece no quadro “Alunos, turmas e secretaria”, na “Visão geral” e em “Vendas”.',
        ],
        quem: 'Só administradores',
      },
      {
        id: 'ligar-meta',
        titulo: 'Ligar a conta de anúncios do Meta',
        passos: [
          'No Business Manager do Meta, em Configurações do negócio → Usuários do sistema, gere um token com a permissão ads_read e acesso à conta de anúncios.',
          'Em “Contas e integrações”, use “Ligar a conta de anúncios” (ou “Ligar outra conta”, se já houver uma).',
          'Em “ID da conta de anúncios”, ponha o número que aparece ao lado do nome da conta no Gerenciador de Anúncios (act_…).',
          'Se a conta também tem anúncios de outras áreas da filial, preencha “Só campanhas com este nome” (por exemplo, Escola).',
          'Cole o token em “Token do usuário do sistema” e use “Ligar”. O token é testado antes de ser guardado, e os anúncios começam a ser lidos em seguida.',
        ],
        dica: 'Há um token só para todas as contas de anúncios. Com um token já guardado, o campo se chama “Trocar o token”: deixe em branco para manter o que está no cofre.',
        quem: 'Só administradores',
      },
      {
        id: 'pausar-ou-desligar-meta',
        titulo: 'Pausar ou desligar a conta de anúncios',
        passos: [
          'Em “Contas e integrações”, ache a linha da conta de anúncios, no quadro do Meta.',
          'Para pausar a leitura: toque no lápis, mude “Situação” para “Pausada” e use “Ligar” para gravar.',
          'Para desligar a conta: toque em “Desligar”, na mesma linha, e confirme. O que já foi lido continua no histórico.',
        ],
        quem: 'Só administradores',
      },
    ],
    perguntas: [
      {
        id: 'o-que-fica-de-cada-venda',
        pergunta: 'O que a Redação guarda de cada venda?',
        resposta: 'O valor, a forma de pagamento, o curso, a origem e o nome do pagador com o CPF mascarado. A ficha de quem estuda continua só no sistema da escola.',
        termos: ['dados', 'privacidade', 'lgpd', 'aluno', 'cpf'],
      },
      {
        id: 'chave-segura',
        pergunta: 'Onde a chave fica guardada? Alguém consegue vê-la?',
        resposta: 'No cofre criptografado da Redação. Depois de guardada, ninguém vê a chave de novo, nem administradores: a tela mostra só os 4 últimos caracteres. Ela também não aparece nas mensagens de erro.',
        termos: ['segurança', 'cofre', 'chave de api', 'token', 'senha'],
      },
      {
        id: 'redacao-so-le',
        pergunta: 'A Redação cria cobrança, estorna ou mexe nos anúncios?',
        resposta: 'Não. Ela só lê: saldo e transações da Únicopag; campanhas, anúncios e números do Meta.',
        termos: ['cobrar', 'estornar', 'pausar anúncio', 'somente leitura'],
      },
      {
        id: 'chave-recusada',
        pergunta: 'Apareceu “A Únicopag recusou a chave (401)”. O que fazer?',
        resposta: 'A chave não vale para esta conta ou deixou de valer. Gere uma nova no painel da Únicopag (Integrações → API) e troque pelo lápis da conta, em “Trocar a chave de API”. Se o erro for 403, a chave não tem permissão de leitura: peça o acesso à Únicopag.',
        termos: ['401', '403', 'erro', 'chave inválida', 'recusou'],
      },
      {
        id: 'quando-le',
        pergunta: 'De quanto em quanto tempo as contas são lidas?',
        resposta: 'Uma vez por dia, sozinhas. Para ler na hora, use “Atualizar agora” em “Vendas” (Únicopag) ou “Atualizar do Meta” no “Marketing”. Conta pausada não é lida.',
        termos: ['frequência', 'sincronização', 'atualizar', 'diário'],
      },
      {
        id: 'nao-vejo-botoes',
        pergunta: 'Por que não vejo “Nova conta” nem o lápis das contas?',
        resposta: 'Cadastrar, editar e tirar contas é só de administrador. As demais pessoas veem as contas, a última leitura e o saldo, e pedem a um administrador o que precisar mudar.',
        termos: ['permissão', 'admin', 'editar', 'não aparece'],
      },
      {
        id: 'so-uma-parte',
        pergunta: 'Por que só vejo a Únicopag (ou só o Meta)?',
        resposta: 'As contas da Únicopag aparecem para quem vê as vendas da escola; a conta do Meta, para quem trabalha no marketing. Quem tem os dois acessos vê as duas.',
        termos: ['acesso', 'sumiu', 'não aparece'],
      },
      {
        id: 'filtro-do-meta',
        pergunta: 'Para que serve “Só campanhas com este nome”?',
        resposta: 'Para quando a conta de anúncios também tem anúncios de outras áreas da filial. Só as campanhas cujo nome contém esse texto (sem ligar para acento ou maiúsculas) entram no marketing da escola.',
        termos: ['filtro', 'nome da campanha', 'outras áreas'],
      },
      {
        id: 'pausar-tirar-chave-tirar-conta',
        pergunta: 'Qual a diferença entre pausar, “Tirar a chave” e “Tirar conta”?',
        resposta: 'Pausada, a conta não é lida, mas guarda a chave e o que já foi lido. “Tirar a chave” tira a chave do cofre: a conta para de ser lida até uma chave nova ser guardada. “Tirar conta” apaga da Redação a chave e a cópia das transações; os lançamentos no Financeiro da escola continuam e, na Únicopag, nada muda.',
        termos: ['pausar', 'excluir conta', 'remover chave', 'desligar'],
      },
      {
        id: 'lancar-a-partir-de',
        pergunta: 'O que é “Lançar no Financeiro da escola a partir de”?',
        resposta: 'A data a partir da qual cada venda paga entra sozinha como receita nos livros da Escola (e o estorno, como despesa). O que foi pago antes fica só no painel de vendas. Numa conta nova, a data vem com o primeiro dia do mês atual.',
        termos: ['data de início', 'financeiro', 'lançamentos automáticos'],
      },
    ],
    relacionadas: ['/escola/vendas', '/escola/marketing', '/escola/financeiro'],
  },
]
