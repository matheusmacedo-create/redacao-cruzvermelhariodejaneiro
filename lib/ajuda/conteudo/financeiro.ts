import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do Financeiro e das três áreas públicas da administração, no grupo
 * Institucional do menu: Financeiro (/financeiro, com /novo, /[id],
 * /cadastros, /conciliacao, /fechamento e /saude — Pedidos de compra,
 * /financeiro/compras, é outra área, em expediente.ts), Transparência
 * (/transparencia), Canais oficiais (/canais-oficiais) e Trilha pública
 * (/trilha-publica).
 *
 * Cada frase tem apoio no código:
 * - Financeiro: app/(app)/financeiro/**, components/app/financeiro/*.tsx,
 *   app/actions/financeiro.ts, lib/financeiro/** (acesso, regras, extrato,
 *   fechamento, saude, avisos), app/api/financeiro/** e as funções
 *   financeiro_* das migrações *_cvrj_financeiro*.sql e
 *   *_cvrj_escola_acesso_separado.sql (níveis, aprovação, mês fechado);
 * - Transparência e Canais oficiais: app/(app)/transparencia,
 *   app/(app)/canais-oficiais, components/app/transparencia/**,
 *   components/app/canais/**, app/actions/transparencia.ts,
 *   lib/transparencia/regras.ts e docs/auditoria-publica.md §5;
 * - Trilha pública: app/(app)/trilha-publica, components/app/trilha/**,
 *   app/actions/trilha.ts, lib/auditoria/catalogo.ts, ARQUITETURA.md §7.9 e
 *   docs/auditoria-publica.md.
 * Quem pode o quê: os níveis do Financeiro em lib/financeiro/regras.ts
 * (NIVEIS) e lib/financeiro/acesso.ts; transparencia.gerenciar e trilha.ver
 * (só admin) em lib/permissoes.ts.
 *
 * Os alvos `financeiro.*`, `transparencia.*`, `canais.*` e `trilha.*` são
 * marcados com `data-ajuda` nessas telas. Mudou a tela ou a regra, muda aqui
 * no mesmo PR (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Financeiro

const FINANCEIRO: GuiaDaArea = {
  href: '/financeiro',
  paraQueServe: 'O caixa da filial: despesas, receitas e contas a pagar e a receber, com a fonte de cada recurso e os comprovantes. Aqui também se concilia o extrato do banco, se acompanha a saúde do caixa e se fecha o mês para o contador. A filial e a Escola têm livros separados, cada uma com as suas contas e o seu fechamento.',
  quemUsa: 'Um administrador libera o acesso pessoa a pessoa, em “Cadastros” → “Quem acessa”. “Ver” só consulta; “Lançar” cria, paga e junta comprovantes; “Aprovar” também aprova despesas de outras pessoas; “Gestão e fechamento” também cuida dos cadastros, das regras e do fechamento do mês (é o nível do contador). Administradores têm acesso total, e o acesso pode valer para todas as empresas ou só para uma.',
  tour: [
    {
      titulo: 'O caixa da filial',
      texto: 'Despesas, receitas e contas a pagar, com a fonte de cada recurso e os comprovantes. Quem ainda não tem acesso vê só um aviso: o acesso é liberado por um administrador.',
    },
    {
      alvo: 'financeiro.empresa',
      titulo: 'De qual empresa são os livros',
      texto: 'A filial e a Escola têm livros separados, com contas e fechamento próprios. “Livros abertos” mostra qual está aberta; “Trocar empresa” troca em todas as seções de uma vez.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'financeiro.secoes',
      titulo: 'As seções do Financeiro',
      texto: '“Lançamentos” é o dia a dia. Nas outras abas ficam a “Saúde do caixa”, as “Compras”, a “Conciliação” com o banco, o “Fechamento” do mês e os “Cadastros”.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'financeiro.novo',
      titulo: 'Lançar despesa ou receita',
      texto: 'Os botões “Despesa” e “Receita” abrem o formulário de lançamento; a transferência entre contas também começa por eles. Aparecem para quem tem nível Lançar ou acima.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'financeiro.resumo',
      titulo: 'Os números do mês',
      texto: 'O saldo de hoje nas contas, o que vence e o que entra no mês escolhido, as contas atrasadas (de qualquer mês) e o resultado do mês.',
      seAusente: 'pular',
    },
    {
      alvo: 'financeiro.abas',
      titulo: 'A pagar, a receber e o movimento',
      texto: '“A pagar” e “A receber” mostram o que está em aberto até o fim do mês; “Movimento de …”, o que venceu ou foi pago nele. As setas trocam o mês.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'financeiro.filtros',
      titulo: 'Buscar e filtrar',
      texto: 'Busque por descrição, favorecido ou nº do documento e filtre por conta, categoria, fonte ou projeto, com “Filtrar”. Na lista, a descrição abre o lançamento.',
      lado: 'bottom',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/financeiro/novo',
      rotulo: 'Novo lançamento',
      tour: [
        {
          titulo: 'Um lançamento novo',
          texto: 'Uma despesa, uma receita ou uma transferência entre contas. Ele entra nos livros da empresa aberta no Financeiro; se não for a filial, o nome dela aparece no título.',
        },
        {
          alvo: 'financeiro.tipo',
          titulo: 'Despesa, receita ou transferência',
          texto: 'Escolha o tipo primeiro: os campos mudam com ele. Transferência só vale entre contas da mesma empresa.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.fonte',
          titulo: 'A fonte do recurso',
          texto: 'De onde vem o dinheiro. Fonte “com destino” (convênio, doação carimbada) só pode ser usada no convênio ou projeto dela. Ao escolher a conta, a fonte padrão dela, se houver, já vem marcada.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.competencia',
          titulo: 'Competência',
          texto: 'O mês a que a despesa ou a receita se refere: a luz de agosto paga em setembro é de agosto. Ela acompanha o vencimento até você mudar.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.repeticao',
          titulo: 'Parcelas e contas de todo mês',
          texto: '“Parcelada” divide o valor total; “Todo mês” repete o valor. Cada ocorrência vira um lançamento em aberto, criado de uma vez; a prévia mostra quantas são, o valor e o período.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.ja-pago',
          titulo: 'Já foi pago?',
          texto: 'Se o dinheiro já saiu, marque “Já foi pago” (na receita, “Já foi recebido”) e informe a data. Senão, o lançamento fica em aberto até alguém marcar como pago.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/financeiro/[id]',
      rotulo: 'Lançamento',
      tour: [
        {
          titulo: 'Um lançamento',
          texto: 'Tudo sobre uma despesa, receita ou transferência: valor, situação, conta, fonte, comprovantes e, se for parcela ou conta de todo mês, as outras do grupo.',
        },
        {
          alvo: 'financeiro.detalhes',
          titulo: 'Valor e situação',
          texto: 'A etiqueta diz a situação, como “Em aberto”, “Atrasado” ou “Pago”. Quando o lançamento é conciliado com o extrato do banco, a linha do banco aparece aqui.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.aprovacao',
          titulo: 'Aprovação',
          texto: 'Despesa a partir do valor definido nas regras é aprovada por alguém com nível Aprovar ou Gestão, nunca por quem lançou. O cartão mostra a decisão e, na recusa, o motivo.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.lancamento-acoes',
          titulo: 'Pagar, editar ou excluir',
          texto: '“Marcar como pago” registra a data, o valor e a conta. Pagou por engano? “Desfazer pagamento”. Só se exclui o que não foi pago.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.anexos',
          titulo: 'Comprovantes e notas',
          texto: 'Junte a nota, o boleto e o comprovante, em PDF ou foto de até 20 MB. Pagamento sem comprovante vira aviso na conferência do fechamento do mês.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/financeiro/cadastros',
      rotulo: 'Cadastros do Financeiro',
      tour: [
        {
          titulo: 'Os cadastros do Financeiro',
          texto: 'O que os lançamentos usam: a empresa, as contas, as fontes de recurso, as categorias, os favorecidos e as regras. Quase tudo aqui é mudado pela gestão do Financeiro.',
        },
        {
          alvo: 'financeiro.cadastros-abas',
          titulo: 'Uma aba para cada cadastro',
          texto: 'Contas, fontes e favorecidos são da empresa aberta; categorias e regras valem para todas. A aba “Quem acessa” só aparece para administradores.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.cadastro',
          titulo: 'Criar, editar e arquivar',
          texto: '“Nova conta” (ou “Nova fonte”, “Nova categoria”, “Novo favorecido”) abre o formulário; o lápis edita uma linha. Conta, fonte ou categoria fora de uso é arquivada em “Situação”.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/financeiro/conciliacao',
      rotulo: 'Conciliação bancária',
      tour: [
        {
          titulo: 'Conciliação bancária',
          texto: 'Você confere o extrato do banco com os lançamentos, linha a linha. Ao conciliar, a data e o valor do banco passam a valer no lançamento.',
        },
        {
          alvo: 'financeiro.conciliacao-contas',
          titulo: 'Uma conta por vez',
          texto: 'Escolha a conta: cada uma tem o seu extrato, as suas importações e a sua conferência de saldo.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.conciliacao-resumo',
          titulo: 'Como está a conta',
          texto: 'Quantas linhas faltam conciliar, quantas já foram e quantas ficaram de fora. Com extrato em OFX, o último cartão compara o saldo do banco com o do Palácio Virtual.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.importar-extrato',
          titulo: 'Importar o extrato',
          texto: 'Em “Escolher extrato (OFX ou CSV)”, envie o arquivo exportado do internet banking. Você confere o resumo antes de importar; movimento já importado não entra de novo.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.conciliar-sugestoes',
          titulo: 'As sugestões de uma vez',
          texto: 'Quando um único lançamento tem o mesmo valor e data próxima, o Palácio Virtual sugere. O botão “Conciliar as … sugestões” aceita todas de uma vez.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.conciliacao-linhas',
          titulo: 'Linha a linha',
          texto: 'Em cada linha: confirme a sugestão (“É …”), use “Escolher lançamento”, “Criar lançamento” (já pago ou recebido) ou “Ignorar”, com o motivo.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/financeiro/fechamento',
      rotulo: 'Fechamento do mês',
      tour: [
        {
          titulo: 'Fechamento do mês',
          texto: 'Conferir, fechar e mandar ao contador. Fechado, o que foi pago no mês não muda mais. Os meses fecham em ordem, um de cada vez.',
        },
        {
          alvo: 'financeiro.fechamento-acoes',
          titulo: 'Fechar e mandar ao contador',
          texto: '“Fechar …” trava o mês; “Pacote do contador” baixa o resumo, as planilhas e os comprovantes num arquivo .zip. Só a gestão do Financeiro vê estes botões.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.fechamento-mes',
          titulo: 'Qual mês',
          texto: 'A tela abre no próximo mês a fechar. As setas trocam o mês, e a etiqueta ao lado diz se ele está “Aberto” ou “Fechado”.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.fechamento-conferencia',
          titulo: 'Conferência',
          texto: 'O que está marcado “impede” precisa ser resolvido antes de fechar. O resto é aviso: dá para fechar com uma observação. Quando aparece, o link “resolver” leva ao lugar certo.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.fechamento-numeros',
          titulo: 'O retrato do mês',
          texto: 'O que entrou e saiu, o resultado e o trabalho voluntário. Mais abaixo, os números por categoria, conta e fonte do recurso e, quando houver, patrimônio e estoque.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/financeiro/saude',
      rotulo: 'Saúde do caixa',
      tour: [
        {
          titulo: 'Saúde do caixa',
          texto: 'Estamos bem? O dinheiro livre aparece separado do que tem destino, com quanto tempo ele aguenta e o que vem pela frente. Os números aparecem quando há lançamentos pagos.',
        },
        {
          alvo: 'financeiro.saude-alertas',
          titulo: 'Alertas',
          texto: 'O que pede atenção agora: caixa livre negativo, fôlego abaixo da reserva mínima, contas atrasadas, orçamento estourado ou convênio perto de acabar com dinheiro sobrando.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.saude-indicadores',
          titulo: 'Caixa livre e fôlego',
          texto: '“Caixa livre hoje” pode pagar qualquer despesa; “Com destino” é de convênios e doações carimbadas. “Fôlego” diz quantos meses o livre cobre as despesas fixas.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.saude-previsao',
          titulo: 'Os próximos 90 dias',
          texto: 'O saldo livre previsto com as contas a pagar e a receber já lançadas. Despesa que ainda não foi lançada não entra: lance as contas do mês que vem.',
          seAusente: 'pular',
        },
        {
          alvo: 'financeiro.saude-orcamento',
          titulo: 'Orçamento do mês',
          texto: 'O que já foi lançado em cada categoria no mês contra o orçado. A gestão do Financeiro define os valores no botão “Orçamento de …”, com o ano.',
          seAusente: 'pular',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'lancar-despesa',
      titulo: 'Lançar uma despesa',
      quem: 'Nível Lançar ou acima',
      passos: [
        'Em “Lançamentos”, toque em “Despesa”.',
        'Preencha a “Descrição” e o “Valor” e escolha o “Favorecido”. O botão “+” ao lado (“Novo favorecido”) cadastra alguém sem sair da tela.',
        'Escolha a “Categoria” e a “Conta de onde sai”. Confira a “Fonte do recurso”: troque se o dinheiro for de um convênio ou doação carimbada.',
        'Informe o “Vencimento”. A “Competência” acompanha o vencimento; mude se a conta for de outro mês.',
        'Se já foi pago, marque “Já foi pago” e informe a data (“Em”) e o “Valor pago”, se teve juros ou desconto.',
        'Preencha “Forma de pagamento” e “Nº do documento”, se tiver, e toque em “Lançar”.',
        'Na página do lançamento, junte a nota ou o boleto em “Juntar arquivo”.',
      ],
      dica: 'Se a aprovação estiver ligada nas regras e a despesa chegar ao valor definido, aparece um aviso e “Já foi pago” fica desativado: ela só pode ser paga depois que outra pessoa aprovar.',
    },
    {
      id: 'lancar-receita',
      titulo: 'Lançar uma receita',
      quem: 'Nível Lançar ou acima',
      passos: [
        'Em “Lançamentos”, toque em “Receita”.',
        'Preencha a “Descrição”, o “Valor” e, se souber, “Quem pagou (opcional)”.',
        'Escolha a “Categoria”, a “Conta onde entra” e a “Fonte do recurso”. Doação carimbada ou repasse de convênio vai numa fonte “com destino”.',
        'Informe a “Data prevista”. Se o dinheiro já entrou, marque “Já foi recebido” e informe a data.',
        'Toque em “Lançar”.',
      ],
    },
    {
      id: 'lancar-parcelas',
      titulo: 'Lançar uma compra parcelada ou uma conta de todo mês',
      quem: 'Nível Lançar ou acima',
      passos: [
        'Comece a despesa (ou a receita) como de costume, pelo botão “Despesa” ou “Receita”.',
        'Em “Repetição”, escolha “Parcelada” e informe em quantas parcelas, ou “Todo mês” e por quantos meses (de 2 a 120).',
        'Em “Parcelada”, o “Valor total” é dividido entre as parcelas; em “Todo mês”, o valor se repete.',
        'Confira a prévia logo abaixo: quantas são, o valor de cada uma e o período, da primeira à última data.',
        'Toque em “Lançar” seguido do número de lançamentos (por exemplo, “Lançar 3”).',
      ],
      dica: 'Parcelas e recorrências entram em aberto: marque cada uma como paga quando pagar. Os centavos que sobram da divisão vão para a primeira parcela.',
    },
    {
      id: 'marcar-pago',
      titulo: 'Marcar uma conta como paga',
      quem: 'Nível Lançar ou acima',
      passos: [
        'Na lista de “Lançamentos”, toque na descrição da conta para abrir o lançamento.',
        'Toque em “Marcar como pago” (na receita, “Marcar como recebido”).',
        'Confira a “Data em que foi pago”, o “Valor pago” (mude se teve juros, multa ou desconto), a “Conta” e a “Forma”.',
        'Toque em “Confirmar”.',
        'Em “Comprovantes e notas”, escolha “Comprovante de pagamento” e toque em “Juntar arquivo”.',
      ],
      dica: 'Pagou errado? “Desfazer pagamento” volta o lançamento para em aberto, enquanto o mês não estiver fechado.',
    },
    {
      id: 'aprovar-despesa',
      titulo: 'Aprovar ou recusar uma despesa',
      quem: 'Nível Aprovar ou Gestão',
      passos: [
        'Abra a aba “Esperando aprovação” em “Lançamentos”, ou o aviso “Despesa esperando aprovação” no sino.',
        'Abra a despesa e confira o valor, o favorecido e os comprovantes.',
        'Toque em “Aprovar”.',
        'Para recusar, toque em “Recusar”, escreva o motivo e toque em “Confirmar recusa”.',
      ],
      dica: 'Quem lançou recebe um aviso com a decisão e, na recusa, com o motivo. Ninguém aprova a despesa que lançou. A aba “Esperando aprovação” mostra as que vencem até o fim do mês escolhido: para ver as seguintes, avance o mês com as setas.',
    },
    {
      id: 'conciliar-extrato',
      titulo: 'Importar o extrato e conciliar',
      quem: 'Nível Lançar ou acima',
      passos: [
        'No internet banking, exporte o extrato da conta em OFX (Money/Quicken) ou CSV.',
        'Em “Conciliação”, escolha a conta, quando houver mais de uma.',
        'Toque em “Escolher extrato (OFX ou CSV)” e escolha o arquivo.',
        'Confira o resumo (quantos movimentos, período, entradas e saídas) e toque em “Importar em …”, com o nome da conta.',
        'Na aba “Para conciliar”, aceite as sugestões com “Conciliar as … sugestões”, ou uma a uma pelo botão “É …”.',
        'Nas outras linhas, use “Escolher lançamento”, “Criar lançamento” ou “Ignorar” (com o motivo).',
      ],
      dica: 'Movimento que já tinha sido importado não entra de novo, então dá para importar períodos que se sobrepõem.',
    },
    {
      id: 'fechar-mes',
      titulo: 'Fechar o mês',
      quem: 'Nível Gestão e fechamento',
      passos: [
        'Em “Fechamento”, confira o mês: a tela abre no próximo mês a fechar.',
        'Em “Conferência”, resolva o que está marcado “impede”. Quando aparece, o link “resolver” leva ao lugar certo.',
        'Leia os avisos (comprovante faltando, conta sem pagar, saldo diferente do banco) e resolva o que der.',
        'Toque em “Fechar …”, com o nome do mês.',
        'Se houver avisos, escreva a “Observação” e marque “Conferi os avisos e fecho mesmo assim”.',
        'Toque em “Fechar o mês”.',
        'Baixe o “Pacote do contador” e envie ao contador.',
      ],
      dica: 'Os meses fecham em ordem. Para reabrir o último mês fechado, a gestão usa “Reabrir …” e escreve o motivo; os administradores são avisados.',
    },
    {
      id: 'trocar-empresa',
      titulo: 'Abrir os livros da Escola (ou da filial)',
      passos: [
        'No alto de qualquer seção do Financeiro, em “Trocar empresa”, toque no nome da empresa.',
        'Espere a mensagem “Abrindo os livros de …” sumir.',
        'Confira em “Livros abertos” qual empresa está aberta antes de lançar.',
      ],
      dica: 'O cartão só aparece para quem tem acesso a mais de uma empresa. A escolha vale para todas as seções e fica guardada neste navegador. No menu da Escola, “Financeiro” abre direto os livros da Escola.',
    },
    {
      id: 'cadastrar-conta',
      titulo: 'Cadastrar uma conta do banco ou o caixa',
      quem: 'Nível Gestão e fechamento',
      passos: [
        'Em “Cadastros”, na aba “Contas”, toque em “Nova conta”.',
        'Dê um “Nome” (ex.: Itaú movimento) e escolha o “Tipo”.',
        'Preencha “Banco”, “Agência” e “Conta”.',
        'Em “Saldo inicial”, ponha o saldo do extrato no dia informado em “Em”.',
        'Se for a conta exclusiva de um convênio, escolha a “Fonte padrão” dele.',
        'Toque em “Salvar”.',
      ],
      dica: 'O saldo de hoje é o saldo inicial mais o que foi pago e recebido depois dele. Cadastre a fonte do convênio antes da conta, em “Fontes de recurso”.',
    },
    {
      id: 'cadastrar-fonte',
      titulo: 'Cadastrar um convênio ou uma doação carimbada (fonte de recurso)',
      quem: 'Nível Gestão e fechamento',
      passos: [
        'Em “Cadastros”, abra a aba “Fontes de recurso” e toque em “Nova fonte”.',
        'Dê um “Nome” (ex.: Termo de fomento 12/2026).',
        'Em “Tipo”, escolha “Com destino (convênio, doação carimbada)” ou “Livre”.',
        'Se tiver, preencha “Financiador”, “Projeto”, “Início da vigência”, “Fim da vigência” e “Valor previsto”.',
        'Toque em “Salvar”.',
      ],
      dica: 'Numa fonte com destino que tem “Fim da vigência”, a “Saúde do caixa” avisa quando faltam 60 dias ou menos e ainda sobra dinheiro nela: sobra de convênio costuma ter de ser devolvida.',
    },
    {
      id: 'ligar-aprovacao',
      titulo: 'Ligar a aprovação de despesas',
      quem: 'Gestão e fechamento de todas as empresas',
      passos: [
        'Em “Cadastros”, abra a aba “Regras”.',
        'Em “Aprovação de despesas”, marque “Despesas a partir de um valor precisam ser aprovadas antes de pagar”.',
        'Em “A partir de”, informe o valor: despesa desse valor para cima passa a pedir aprovação.',
        'Toque em “Salvar regras”.',
      ],
      dica: 'A regra vale para a filial e para a Escola. Quem lançou nunca aprova a própria despesa: confira em “Quem acessa” se há outra pessoa com nível Aprovar ou Gestão.',
    },
    {
      id: 'definir-orcamento',
      titulo: 'Definir o orçamento do ano',
      quem: 'Nível Gestão e fechamento',
      passos: [
        'Em “Saúde do caixa”, no cartão do orçamento, toque em “Orçamento de …”, com o ano.',
        'Informe quanto se espera gastar por mês em cada categoria de despesa. Deixe vazio o que não entra no orçamento.',
        'Toque em “Salvar”.',
      ],
      dica: 'O orçamento é da empresa aberta. Categoria que passa do orçado no mês vira alerta na “Saúde do caixa”.',
    },
    {
      id: 'dar-acesso',
      titulo: 'Dar acesso ao Financeiro a alguém',
      quem: 'Só administradores',
      passos: [
        'Em “Cadastros”, abra a aba “Quem acessa”.',
        'Na linha da pessoa, escolha o nível: “Ver”, “Lançar”, “Aprovar” ou “Gestão e fechamento”.',
        'Com mais de uma empresa, escolha também “Todas as empresas” ou “Só …” uma delas.',
      ],
      dica: '“Sem acesso” tira o acesso. A equipe da escola só pode receber os livros da Escola.',
    },
  ],
  perguntas: [
    {
      id: 'sem-acesso',
      pergunta: 'Por que aparece “Você ainda não tem acesso ao Financeiro”?',
      resposta: 'O Financeiro é liberado pessoa a pessoa. Peça a um administrador: o seu nível é definido em “Cadastros” → “Quem acessa”.',
      termos: ['acesso negado', 'não consigo abrir', 'liberar acesso', 'permissão', 'sem acesso'],
    },
    {
      id: 'niveis',
      pergunta: 'O que cada nível de acesso pode fazer?',
      resposta: '“Ver”: consulta lançamentos, cadastros e comprovantes, sem mudar nada. “Lançar”: cria e edita despesas e receitas, marca como pago, junta comprovante, cadastra favorecidos e importa e concilia o extrato.\n\n“Aprovar”: tudo isso, mais aprovar despesas que pedem aprovação (nunca as próprias); “Gestão e fechamento”: tudo, mais contas, fontes, categorias, regras e o fechamento do mês.\n\nCategorias, regras de aprovação e a reserva mínima valem para todas as empresas: só quem tem gestão de todas muda.',
      termos: ['nível', 'papel', 'contador', 'gestão', 'lançar', 'aprovar', 'Só a gestão do Financeiro muda estes cadastros'],
    },
    {
      id: 'filial-e-escola',
      pergunta: 'Qual a diferença entre os livros da filial e os da Escola?',
      resposta: 'A Escola é uma empresa à parte, com CNPJ, contas, fontes, favorecidos, lançamentos e fechamento próprios. Categorias e regras de aprovação valem para as duas. O cartão “Livros abertos”, no alto, mostra qual está aberta, e “Trocar empresa” muda para a outra.',
      termos: ['escola', 'empresa', 'cnpj', 'seletor', 'trocar empresa', 'livros abertos', 'entidade'],
    },
    {
      id: 'situacoes',
      pergunta: 'O que significa cada situação do lançamento?',
      resposta: '“Em aberto”: ainda não venceu; “Vence hoje”: vence hoje e não foi pago; “Atrasado”: venceu e não foi pago. “Esperando aprovação”: a despesa espera a decisão de alguém com nível Aprovar ou Gestão; “Recusado”: foi recusada e não pode ser paga.\n\n“Pago” e “Recebido”: o dinheiro já saiu ou já entrou.',
      termos: ['status', 'estado', 'atrasada', 'vencida', 'pendente'],
    },
    {
      id: 'competencia',
      pergunta: 'Qual a diferença entre vencimento, competência e data de pagamento?',
      resposta: 'O vencimento é quando a conta tem de ser paga. A competência é o mês a que ela se refere: a luz de agosto, paga em setembro, é de agosto. A data de pagamento é quando o dinheiro saiu de fato.\n\nO fechamento mostra o mês pelas duas óticas: caixa (o que foi pago no mês) e competência (o que é do mês, pago ou não).',
      termos: ['regime de caixa', 'regime de competência', 'mês de referência', 'data de pagamento'],
    },
    {
      id: 'fonte-com-destino',
      pergunta: 'O que é uma fonte “com destino”?',
      resposta: 'É dinheiro que só pode pagar aquilo para que foi dado: um convênio, um termo de fomento, uma doação carimbada. A norma das entidades sem fins lucrativos (ITG 2002) pede essa separação. Na “Saúde do caixa”, ele aparece à parte do caixa livre.',
      termos: ['fonte de recurso', 'recurso restrito', 'convênio', 'doação carimbada', 'recurso livre', 'ITG 2002'],
    },
    {
      id: 'nao-consigo-pagar',
      pergunta: 'Por que não consigo marcar a despesa como paga?',
      resposta: 'Se ela está “Esperando aprovação”, só pode ser paga depois de aprovada por outra pessoa com nível Aprovar ou Gestão. Se foi “Recusado”, corrija e salve pela edição (ela volta para a fila) ou exclua. A data do pagamento não pode ser no futuro nem cair num mês já fechado. E marcar como pago pede nível Lançar ou acima.',
      termos: ['A data não pode ser no futuro.', 'A data do pagamento não pode ser no futuro.', 'Esta despesa ainda espera aprovação.', 'Esta despesa precisa de aprovação antes de ser marcada como paga.', 'Esta despesa foi recusada e não pode ser paga.', 'A data do pagamento está num mês já fechado.', 'marcar como pago'],
    },
    {
      id: 'nao-consigo-aprovar',
      pergunta: 'Por que não consigo aprovar uma despesa?',
      resposta: 'Quem lançou a despesa nunca a aprova: peça a outra pessoa com nível Aprovar ou Gestão. E para aprovar é preciso ter um desses níveis na empresa da despesa.',
      termos: ['Quem lançou a despesa não pode aprová-la. Peça a outra pessoa com acesso de aprovação.', 'Você não tem acesso para aprovar despesas.', 'aprovação'],
    },
    {
      id: 'desfazer',
      pergunta: 'Lancei errado. Dá para desfazer?',
      resposta: 'Enquanto não está pago, dá para editar ou excluir. Depois de pago, a edição não muda a data nem o valor pagos: para isso, e antes de excluir, use “Desfazer pagamento”. Em parcelas e contas de todo mês, escolha “Só este” ou “Este e os próximos em aberto”.\n\nO que foi pago num mês já fechado não muda mais; ainda dá para juntar o comprovante de pagamento.',
      termos: ['excluir', 'apagar lançamento', 'corrigir', 'editar', 'Já foi pago. Desfaça o pagamento antes de excluir.', 'Foi pago num mês já fechado e não muda mais.', 'Mês fechado: só dá para juntar comprovante.'],
    },
    {
      id: 'transferencia',
      pergunta: 'Como registro dinheiro que passou de uma conta para outra?',
      resposta: 'Lance uma “Transferência”: toque em “Despesa” (ou “Receita”), escolha “Transferência” no alto do formulário e depois a conta em “Sai da conta” e a conta em “Vai para a conta”. Ela não conta como despesa nem como receita.\n\nEntre a filial e a Escola não há transferência: lance uma despesa numa empresa e a receita na outra.',
      termos: ['aplicação', 'resgate', 'transferir', 'entre contas', 'Transferência só entre contas da mesma empresa. Entre a filial e a escola, lance uma despesa numa e a receita na outra.'],
    },
    {
      id: 'aviso-de-vencimento',
      pergunta: 'O Palácio Virtual avisa das contas que vencem?',
      resposta: 'Sim. Toda manhã, os administradores e quem tem nível Lançar, Aprovar ou Gestão recebem no sino o aviso das contas a pagar que vencem hoje, das atrasadas e das que vencem nos próximos 3 dias (despesa esperando aprovação ou recusada fica de fora). O e-mail segue a preferência de cada pessoa no assunto “Financeiro”.\n\nNo dia 5, a gestão é lembrada de fechar o mês anterior, se ainda estiver aberto.',
      termos: ['lembrete', 'notificação', 'vencimento', 'e-mail', 'alerta', 'contas a pagar'],
    },
    {
      id: 'o-que-e-conciliar',
      pergunta: 'O que acontece quando concilio uma linha do extrato?',
      resposta: 'A linha fica ligada ao lançamento, e a data e o valor do banco passam a valer nele; se ainda não estava pago, fica pago. O botão de desfazer, na aba “Conciliadas e ignoradas”, devolve a linha para conciliar, mas o lançamento continua pago.',
      termos: ['extrato', 'ofx', 'csv', 'banco', 'desconciliar', 'conciliação bancária'],
    },
    {
      id: 'saldo-nao-bate',
      pergunta: 'O saldo do Palácio Virtual não bate com o do banco. E agora?',
      resposta: 'Confira na “Conciliação” se todo o extrato da conta está conciliado e se nenhum pagamento foi lançado com data ou valor diferente. Confira também o “Saldo inicial” da conta em “Cadastros”: o saldo de hoje é ele mais tudo o que foi pago e recebido depois. A comparação automática com o banco só aparece quando o extrato vem em OFX.',
      termos: ['saldo errado', 'diferença', 'não bate', 'Saldo bate com o do banco'],
    },
    {
      id: 'nao-consigo-fechar',
      pergunta: 'Por que não consigo fechar o mês?',
      resposta: 'Algo na “Conferência” está marcado “impede”: o mês ainda não acabou, há um mês anterior aberto (os meses fecham em ordem) ou há linhas do extrato do mês por conciliar. Os avisos não impedem: dá para fechar escrevendo uma observação. E só a gestão do Financeiro fecha o mês.',
      termos: ['fechamento', 'botão desativado', 'Os meses fecham em ordem', 'Só a gestão do Financeiro fecha o mês.', 'Há avisos no mês: escreva uma observação explicando por que fecha assim.'],
    },
    {
      id: 'lancado-sozinho',
      pergunta: 'O que é uma “Venda lançada sozinha a partir da Únicopag”?',
      resposta: 'Nos livros da Escola, cada venda paga na Únicopag entra sozinha como receita, e um estorno entra sozinho como despesa. Dá para corrigir categoria, descrição e fonte, mas o pagamento não se desfaz na mão: o valor recebido acompanha a transação.',
      termos: ['únicopag', 'unicopag', 'venda', 'estorno', 'chargeback', 'automático', 'Este lançamento veio da Únicopag e acompanha a venda.'],
    },
  ],
  relacionadas: ['/financeiro/compras', '/patrimonio', '/escola/financeiro'],
}

// ---------------------------------------------------------------- Transparência

const TRANSPARENCIA: GuiaDaArea = {
  href: '/transparencia',
  paraQueServe: 'O portal de transparência por dentro: os documentos (estatuto, atas, balanços, relatórios, certidões) e as parcerias com o poder público que a filial publica no site. Tudo nasce como rascunho. Publicado, não se troca em silêncio: arquivo novo vira versão nova, e cada publicação entra na trilha pública de auditoria.',
  quemUsa: 'Só administradores. O que está “No ar” aparece na página de transparência do site; rascunhos e PDFs aguardando publicação existem só aqui.',
  tour: [
    {
      titulo: 'O portal de transparência',
      texto: 'Os documentos e as parcerias que a filial publica na página de transparência do site. Tudo nasce como rascunho e só vai ao site quando você publica.',
    },
    {
      alvo: 'transparencia.lancamento',
      titulo: 'A página pública',
      texto: 'O aviso do topo diz se a página já está aberta ao público ou em lançamento oculto, fora dos buscadores e sem link no site. “Atualizar a página no site” refaz a página.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'transparencia.abas',
      titulo: 'Documentos e parcerias',
      texto: '“Documentos” guarda estatuto, atas, balanços, relatórios e certidões, pelas seções do portal. “Parcerias (MROSC)” guarda os termos e convênios com o poder público.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'transparencia.novo-documento',
      titulo: 'Novo documento',
      texto: '“Novo documento” abre a ficha: seção, título e período. Depois vem o PDF, que fica guardado aqui, “Aguardando publicação”, até você publicar.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'transparencia.nova-parceria',
      titulo: 'Nova parceria',
      texto: '“Nova parceria” abre a ficha com os dados que a Lei 13.019/2014 manda divulgar. Ela é salva como rascunho e só vai ao portal quando você publicar.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'transparencia.versao',
      titulo: 'Publicado não se troca',
      texto: 'Cada publicação ganha a impressão digital do arquivo e um código de verificação. Para corrigir, envie uma versão nova: a anterior fica listada como substituída.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'publicar-documento',
      titulo: 'Publicar um documento no portal',
      passos: [
        'Na aba “Documentos”, toque em “Novo documento” (ou em “Adicionar”, na seção certa).',
        'Escolha a “Seção do portal”, dê o “Título” e, se fizer sentido, o “Período” e a “Descrição”.',
        'Toque em “Criar e enviar o PDF”.',
        'Em “Escolher o PDF”, escolha ou arraste o arquivo (PDF até 20 MB) e toque em “Enviar”.',
        'Confira o arquivo em “Ver PDF”.',
        'Toque em “Publicar agora…”, leia o que vai acontecer e confirme em “Publicar”.',
      ],
      dica: 'Ainda não está certo? “Publicar depois” deixa o PDF em “Aguardando publicação” no cartão do documento, sem ir ao site.',
    },
    {
      id: 'versao-nova',
      titulo: 'Trocar o PDF de um documento publicado',
      passos: [
        'No cartão do documento, toque em “Enviar versão nova”.',
        'Escolha o PDF novo e toque em “Enviar”.',
        'Toque em “Publicar agora…” e confirme em “Publicar”.',
      ],
      dica: 'A versão no ar continua no ar até você publicar a nova. Depois, ela fica listada no portal como versão anterior, substituída, e a nova ganha outro código de verificação.',
    },
    {
      id: 'retirar-documento',
      titulo: 'Retirar um documento do portal',
      passos: [
        'No cartão do documento, toque em “Retirar do portal”.',
        'Escreva o “Motivo da retirada”, com pelo menos 5 caracteres.',
        'Toque em “Retirar do portal” para confirmar.',
        'Se o cartão avisar que o site não respondeu, toque em “Apagar os PDFs do site” para tentar de novo.',
      ],
      dica: 'Os PDFs saem do site, mas a trilha pública continua respondendo pelo código, com o estado “retirado”. O documento volta ao portal quando uma versão nova for publicada.',
    },
    {
      id: 'publicar-parceria',
      titulo: 'Cadastrar e publicar uma parceria (MROSC)',
      passos: [
        'Na aba “Parcerias (MROSC)”, toque em “Nova parceria”.',
        'Em “Instrumento”, escolha o “Tipo” e, se houver, o “Número” e a “Data de assinatura”.',
        'Preencha “Órgão ou entidade da administração pública” e o “Objeto”; depois, a vigência e os valores, e a “Situação” da prestação de contas.',
        'Em “Equipe paga com recursos da parceria”, use “Adicionar função” para cada função: só a função e a remuneração, nunca o nome.',
        'Toque em “Salvar rascunho”.',
        'No cartão da parceria, toque em “Publicar”, confira a equipe e confirme em “Publicar”.',
      ],
      dica: 'A lei manda manter a parceria no portal da celebração até 180 dias depois da prestação de contas final (Decreto 8.726/2016, art. 80); o cartão mostra até quando. Depois de publicada, cada mudança salva vira versão nova na trilha.',
    },
  ],
  perguntas: [
    {
      id: 'lancamento-oculto',
      pergunta: 'O que é o “Lançamento oculto”?',
      resposta: 'A página pública já é publicada, mas fica escondida dos buscadores e sem link no menu, no rodapé ou em matérias do site até a abertura, que ainda será decidida. Quem tiver o endereço consegue abrir: publique só o que já pode ser público.',
      termos: ['noindex', 'oculto', 'buscadores', 'google', 'abertura'],
    },
    {
      id: 'estados',
      pergunta: 'O que significam “Rascunho”, “No ar” e “Retirado do portal”?',
      resposta: '“Rascunho”: nada foi publicado ainda, e dá para excluir. “No ar”: a página do portal mostra a versão publicada mais nova. “Retirado do portal” (na parceria, “Retirada do portal”): saiu da página por um motivo registrado; a trilha continua respondendo pelo código.',
      termos: ['status', 'situação', 'rascunho', 'publicado', 'retirado'],
    },
    {
      id: 'publiquei-errado',
      pergunta: 'Publiquei o PDF errado. Dá para desfazer?',
      resposta: 'Não dá para desfazer nem trocar o arquivo publicado. Envie o PDF certo em “Enviar versão nova” e publique: a versão errada continua listada no portal como anterior, substituída. Se o arquivo não pode ficar público, use “Retirar do portal”, com o motivo: os PDFs de todas as versões do documento são apagados do site.',
      termos: ['desfazer', 'apagar', 'trocar arquivo', 'corrigir', 'Documento com versão publicada não se apaga: retire-o do portal com um motivo.'],
    },
    {
      id: 'codigo-de-verificacao',
      pergunta: 'Para que serve o código de verificação?',
      resposta: 'Cada publicação entra na trilha pública de auditoria e ganha um código. Quem tem o documento confere por ele, na página pública de verificação, se o arquivo é o mesmo que a filial publicou e se continua valendo.',
      termos: ['código', 'verificar', 'autenticidade', 'trilha', 'sha-256', 'hash'],
    },
    {
      id: 'sem-registro',
      pergunta: 'Por que a versão aparece “Sem registro na trilha”?',
      resposta: 'O registro na trilha falhou na hora de publicar (a publicação segue mesmo assim). Veja a falha em “Trilha pública”: a rotina diária tenta registrar de novo, e “Registrar pendências agora”, lá, faz na hora.',
      termos: ['Sem registro na trilha', 'código não aparece', 'sem código'],
    },
    {
      id: 'site-nao-respondeu',
      pergunta: 'Apareceu que o site não respondeu. O que faço?',
      resposta: 'Espere alguns minutos e use “Atualizar a página no site”: a página é refeita com o que está publicado aqui. Se foi uma retirada e o PDF ficou no site, o cartão do documento mostra “Apagar os PDFs do site” para tentar de novo.',
      termos: ['erro', 'site fora', 'não atualizou', 'ftp'],
    },
    {
      id: 'equipe-sem-nome',
      pergunta: 'Por que a equipe da parceria não leva nome?',
      resposta: 'A Lei 13.019/2014 pede as funções e a remuneração da equipe paga com a parceria. O portal mostra só isso, nunca o nome. Confira antes de publicar: o que é publicado não se apaga da trilha.',
      termos: ['equipe', 'remuneração', 'salário', 'dados pessoais', 'nome'],
    },
    {
      id: 'parceria-retirada',
      pergunta: 'Retirei uma parceria por engano. E agora?',
      resposta: 'Parceria retirada não volta ao portal nem se edita. Cadastre de novo e publique; a retirada continua registrada na trilha.',
      termos: ['desfazer retirada', 'voltar ao portal', 'engano', 'editar parceria retirada', 'Parceria não encontrada ou retirada do portal.'],
    },
    {
      id: 'secao-vazia',
      pergunta: 'Por que uma seção não aparece no portal?',
      resposta: 'O portal só mostra as seções que têm documento publicado. As seções ainda vazias aparecem no fim da aba “Documentos”, com um botão para começar por elas.',
      termos: ['seção', 'categoria', 'não aparece'],
    },
  ],
  relacionadas: ['/canais-oficiais', '/trilha-publica'],
}

// ---------------------------------------------------------------- Canais oficiais

const CANAIS: GuiaDaArea = {
  href: '/canais-oficiais',
  paraQueServe: 'A lista pública dos endereços, telefones e perfis que são mesmo da filial. É por ela que alguém confere se uma mensagem em nome da Cruz Vermelha é verdadeira. Cada publicação é uma versão nova e inteira da lista, registrada na trilha pública.',
  quemUsa: 'Só administradores mantêm a lista. A página pública mostra sempre a versão mais nova.',
  tour: [
    {
      titulo: 'Canais oficiais',
      texto: 'A lista pública dos endereços, telefones e perfis que são mesmo da filial. É por ela que alguém confere se uma mensagem em nome da Cruz Vermelha é verdadeira.',
    },
    {
      alvo: 'transparencia.lancamento',
      titulo: 'A página pública',
      texto: 'O aviso do topo diz se a página já está aberta ao público ou em lançamento oculto. “Atualizar a página no site” refaz a página com a versão no ar.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'canais.no-ar',
      titulo: 'A versão no ar',
      texto: 'A lista que a página mostra hoje, com quem publicou e o código de verificação dela na trilha pública.',
      seAusente: 'pular',
    },
    {
      alvo: 'canais.editor',
      titulo: 'A próxima versão',
      texto: 'Liste só os canais atuais, na ordem em que devem aparecer. “Publicar nova versão…” mostra o que entra e o que sai antes de você confirmar.',
      seAusente: 'pular',
    },
    {
      alvo: 'canais.historico',
      titulo: 'Versões anteriores',
      texto: 'Cada versão publicada é a lista inteira e não muda depois. As substituídas saem da página, mas continuam registradas na trilha.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'primeira-lista',
      titulo: 'Publicar a primeira lista de canais',
      passos: [
        'Em “Canais oficiais”, se aparecer o botão “Usar os dados do rodapé”, toque nele para começar com o site, o e-mail, o telefone, o endereço e o CNPJ que já estão no rodapé do site.',
        'Confira cada linha e acrescente os perfis em “Adicionar canal”: “Tipo”, “Endereço, número ou perfil” e, se houver, o “Link”.',
        'Ponha na ordem certa com as setas de subir e descer de cada linha.',
        'Toque em “Publicar a primeira versão…”.',
        'Confira a lista e confirme em “Publicar a versão 1”.',
      ],
    },
    {
      id: 'mudar-canal',
      titulo: 'Mudar a lista (perfil novo, telefone que mudou)',
      passos: [
        'O editor já vem com a versão no ar: mude, acrescente ou remova as linhas.',
        'Para tirar um perfil antigo, use a lixeira da linha: ele simplesmente sai da lista.',
        'Toque em “Publicar nova versão…”.',
        'Confira o que “Entram”, “Saem” e “Mudam o rótulo ou o link” e confirme em “Publicar a versão …”.',
      ],
      dica: 'Mexeu e desistiu? “Descartar mudanças” volta a lista para a versão no ar.',
    },
    {
      id: 'refazer-pagina',
      titulo: 'Refazer a página de canais no site',
      passos: [
        'Quando um aviso disser que o site não respondeu, toque em “Atualizar a página no site”, no alto da tela.',
        'Espere o recado “Página de canais oficiais refeita no site com a versão no ar.”',
        'Abra o endereço da página, no aviso do topo, e confira a lista.',
      ],
      dica: 'Refazer não publica nada novo: a página volta a mostrar a versão no ar.',
    },
  ],
  perguntas: [
    {
      id: 'link-recusado',
      pergunta: 'Por que o link do perfil foi recusado?',
      resposta: 'O link precisa começar com https:// e, nas redes, ser do domínio da própria rede (instagram.com, facebook.com, wa.me…). A página existe para desmentir golpe: não pode ela mesma apontar para lugar errado.',
      termos: ['erro na linha', 'o link precisa começar com https://', 'o link não é de', 'link inválido'],
    },
    {
      id: 'perfil-antigo',
      pergunta: 'Como aviso que um perfil antigo foi desativado?',
      resposta: 'Não precisa aviso: basta não listá-lo. A página mostra só os canais atuais, e o que sai da lista some da página, sem menção. A versão anterior continua na trilha, como substituída.',
      termos: ['perfil desativado', 'perfil antigo', 'canal abandonado', 'remover'],
    },
    {
      id: 'publiquei-com-erro',
      pergunta: 'Publiquei com erro. Dá para desfazer?',
      resposta: 'Não dá para desfazer uma versão publicada. Corrija no editor e publique outra versão: a errada fica na trilha como substituída.',
      termos: ['desfazer', 'corrigir', 'voltar versão'],
    },
    {
      id: 'publicar-desativado',
      pergunta: 'Por que o botão de publicar está desativado?',
      resposta: 'Nada mudou em relação à versão no ar. Mude uma linha, a ordem ou a observação para poder publicar.',
      termos: ['botão cinza', 'Nada mudou em relação à versão'],
    },
    {
      id: 'quantos-canais',
      pergunta: 'Quantos canais cabem na lista?',
      resposta: 'Até 60. E-mail e telefone não levam link. O rótulo é opcional: vazio, a página usa o nome do tipo.',
      termos: ['limite', 'máximo', 'rótulo'],
    },
    {
      id: 'quem-muda',
      pergunta: 'Quem pode mudar a lista?',
      resposta: 'Só administradores. Se um perfil, telefone ou endereço mudou, fale com um administrador.',
      termos: ['permissão', 'acesso', 'área restrita'],
    },
  ],
  relacionadas: ['/transparencia', '/trilha-publica'],
}

// ---------------------------------------------------------------- Trilha pública

const TRILHA: GuiaDaArea = {
  href: '/trilha-publica',
  paraQueServe: 'O registro verificável do que a filial publica e emite: matérias, comunicados, ofícios, certificados e o portal de transparência. Cada item ganha um código e uma impressão digital (hash), e todo dia um lote é fechado, assinado e registrado no Bitcoin, para qualquer pessoa conferir sem depender do Palácio Virtual. Esta tela acompanha a saúde disso tudo.',
  quemUsa: 'Só administradores. A consulta pública, na página de verificação do site, mostra bem menos do que esta tela.',
  tour: [
    {
      titulo: 'A trilha pública',
      texto: 'Tudo o que a filial publica e emite ganha um código verificável. Aqui você vê se a cadeia confere, como estão os lotes diários e o que falhou.',
    },
    {
      alvo: 'trilha.avisos',
      titulo: 'Abertura e chave',
      texto: 'Um cartão diz se a abertura ao público já começou; o outro, se a chave que assina os lotes está configurada. Sem ela, os lotes ficam sem assinatura.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'trilha.cadeia',
      titulo: 'Conferência da cadeia',
      texto: 'Cada evento guarda a impressão digital (hash) do anterior, e a conferência refaz as contas desde o início. “Cadeia íntegra” quer dizer que nada foi alterado direto no banco de dados.',
      seAusente: 'pular',
    },
    {
      alvo: 'trilha.rodar',
      titulo: 'Rodar agora',
      texto: 'A rotina da madrugada faz tudo sozinha. Os botões de “Rodar agora” servem para não esperar, depois de corrigir uma falha. Pode repetir: nada é feito duas vezes.',
      seAusente: 'pular',
    },
    {
      alvo: 'trilha.consulta',
      titulo: 'Consultar um código',
      texto: 'Cole o código de um documento para ver o que a consulta pública mostraria e, só aqui, a história inteira do registro.',
      seAusente: 'pular',
    },
    {
      alvo: 'trilha.lotes',
      titulo: 'Lotes diários',
      texto: 'Um lote por dia, com a assinatura, o carimbo de tempo (RFC 3161), o registro no Bitcoin e a publicação no site. A coluna “Último erro” mostra o que travou.',
      seAusente: 'pular',
    },
    {
      alvo: 'trilha.falhas',
      titulo: 'Falhas de registro',
      texto: 'Quando o registro na trilha falha, a operação principal segue e a falha fica anotada aqui. A rotina diária tenta de novo.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'consultar-codigo',
      titulo: 'Consultar um código',
      passos: [
        'Em “Consultar um código”, cole no campo “Código” os 26 caracteres da trilha, os 32 do rodapé do ofício ou o XXXX-XXXX do certificado.',
        'Toque em “Consultar”.',
        'Veja o estado do registro, o que a consulta pública mostra e a história dele, evento por evento.',
      ],
      dica: 'O código de 26 caracteres da trilha vale com ou sem hífens, e nele a letra O vale 0, e I e L valem 1.',
    },
    {
      id: 'rodar-agora',
      titulo: 'Registrar pendências ou fechar o lote sem esperar a madrugada',
      passos: [
        'Em “Rodar agora”, escolha a rodada: “Conferir a cadeia agora”, “Registrar pendências agora” ou “Fechar e carimbar o lote de ontem agora”.',
        'Leia a explicação e confirme.',
        'Espere o resumo aparecer. A rodada do lote pode levar até um minuto: mantenha a página aberta.',
      ],
      dica: 'Pode repetir sem receio: nada é registrado, fechado ou carimbado duas vezes.',
    },
    {
      id: 'historico-do-registro',
      titulo: 'Ver a história de um registro recente',
      passos: [
        'Em “Registros recentes”, ache a linha do registro.',
        'Toque em “Histórico”: a consulta, mais acima, mostra todos os eventos dele.',
        'Para ver o que o público vê, toque em “Conferir”, que abre a página pública de conferência numa aba nova.',
      ],
    },
    {
      id: 'gerar-chave',
      titulo: 'Gerar a chave de assinatura dos lotes',
      passos: [
        'No cartão “Chave de assinatura não configurada”, toque em “Gerar a chave de assinatura”.',
        'Leia o aviso e toque em “Gerar e guardar no cofre”.',
        'Confira a impressão digital que passa a aparecer no cartão.',
      ],
      dica: 'Ninguém vê a chave, só a impressão digital. Ela não se troca por aqui: trocar a chave é um evento que precisa ser anunciado.',
    },
  ],
  perguntas: [
    {
      id: 'o-que-entra',
      pergunta: 'O que entra na trilha pública?',
      resposta: 'Matérias publicadas no site, comunicados à imprensa, ofícios assinados, certificados de curso, documentos e parcerias do portal de transparência e as versões da página de canais oficiais. Entram sozinhos, na hora em que acontecem; ninguém precisa lembrar de registrar.',
      termos: ['registro', 'o que é registrado', 'auditoria', 'itens'],
    },
    {
      id: 'o-publico-ve',
      pergunta: 'O que a consulta pública mostra?',
      resposta: 'Para documentos públicos, o título, a data e a hora, o estado, a impressão digital (hash) e as provas. Nunca mostra o papel de quem agiu, o fluxo nem a posição na cadeia: a história inteira do registro, evento por evento, só aparece nesta tela, que é só de administradores.',
      termos: ['privacidade', 'dados pessoais', 'verificação pública', 'quem vê'],
    },
    {
      id: 'lote-diario',
      pergunta: 'O que é o lote diário?',
      resposta: 'Toda madrugada a rotina fecha o lote do dia anterior: junta os registros, assina, carimba numa autoridade de carimbo do tempo (RFC 3161) e ancora no Bitcoin pelo OpenTimestamps. Depois, publica os arquivos em /verificar/lotes/ no site. O lote fecha mesmo sem registros no dia.',
      termos: ['lote', 'carimbo', 'bitcoin', 'opentimestamps', 'assinatura'],
    },
    {
      id: 'estados-do-bitcoin',
      pergunta: 'O que significam “Pendente, na fila”, “Enviado, aguardando bloco” e “Confirmado”?',
      resposta: 'É o caminho do lote até o Bitcoin: na fila para enviar, enviado ao OpenTimestamps e esperando entrar num bloco, e confirmado no bloco indicado. Uma rotina diária confere se ele já entrou.',
      termos: ['aguardando bloco', 'pendente', 'confirmado', 'bloco'],
    },
    {
      id: 'aguardando-lote',
      pergunta: 'O que quer dizer “Aguardando lote”?',
      resposta: 'O registro já existe e tem código, mas ainda não entrou num lote diário. O lote é fechado na madrugada seguinte, e é a partir dele que sai a prova de cada item.',
      termos: ['aguardando', 'sem lote', 'prova'],
    },
    {
      id: 'divergencia',
      pergunta: 'Apareceu “Divergência na cadeia”. O que faço?',
      resposta: 'Algum registro não bate com a impressão digital (hash) esperada: alguém alterou a trilha direto no banco de dados, ou uma restauração de backup ficou incompleta. Não apague nem corrija nada nas tabelas da trilha. Anote onde está a quebra (o fluxo e a posição, ou o primeiro lote com divergência) e compare com o backup mais recente.',
      termos: ['quebra', 'erro na cadeia', 'hash', 'adulteração', 'Atenção'],
    },
    {
      id: 'codigo-nao-achado',
      pergunta: 'A consulta não achou o código. É falsificação?',
      resposta: 'Não necessariamente. Confira se o código foi copiado exatamente como está no documento. Documentos anteriores à trilha entram quando a rotina de pendências roda (“Registrar pendências agora”).',
      termos: ['não encontrado', 'Nenhum registro com o código', 'código errado', 'falso'],
    },
    {
      id: 'falha-de-registro',
      pergunta: 'O que é uma falha de registro?',
      resposta: 'Quando o registro na trilha falha, a operação principal (assinar, emitir, publicar, enviar) segue normalmente, e a falha fica anotada em “Falhas de registro nos últimos 30 dias”. A rotina diária tenta de novo, e “Registrar pendências agora” também. A lista guarda o histórico: falha já resolvida continua aparecendo.',
      termos: ['falha', 'erro', 'pendência'],
    },
    {
      id: 'divulgar-conferir',
      pergunta: 'Posso divulgar o link “Conferir”?',
      resposta: 'Ainda não, enquanto o lançamento for oculto: a página pública de conferência fica sem link no site e fora dos buscadores até a abertura. Os links “Conferir” desta tela servem para testar.',
      termos: ['lançamento oculto', 'divulgar', 'link público', 'verificar'],
    },
    {
      id: 'como-fico-sabendo',
      pergunta: 'Como fico sabendo de um problema na trilha?',
      resposta: 'Divergência na conferência da cadeia, registro que não entrou na trilha ou lote com erro (assinatura, carimbo, publicação) viram o aviso “Trilha pública pede atenção” no sino dos administradores, no assunto “Trilha pública”. O e-mail segue a preferência de cada pessoa. É no máximo um aviso por rodada diária.',
      termos: ['notificação', 'aviso', 'e-mail', 'alerta'],
    },
  ],
  relacionadas: ['/transparencia', '/canais-oficiais', '/oficios'],
}

export const guias: GuiaDaArea[] = [FINANCEIRO, TRANSPARENCIA, CANAIS, TRILHA]
