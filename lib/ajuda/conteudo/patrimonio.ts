import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do Patrimônio (/patrimonio): bens com plaqueta e QR, "Comigo",
 * Estoque de materiais, Doações em espécie, Frota, Inventário e Cadastros —
 * tudo numa área do menu, com uma tela interna por seção.
 *
 * Cada frase tem apoio no código:
 * - Bens, Comigo, Inventário e Cadastros: app/(app)/patrimonio/{page,[id],novo,
 *   comigo,inventario,cadastros}, components/app/patrimonio/{acoes,formulario,
 *   cadastros,secoes}.tsx, app/actions/patrimonio.ts e lib/patrimonio/regras.ts;
 * - Estoque: app/(app)/patrimonio/estoque/**, components/app/patrimonio/estoque.tsx,
 *   app/actions/estoque.ts e lib/patrimonio/estoque.ts;
 * - Doações: app/(app)/patrimonio/doacoes/**, components/app/patrimonio/doacoes.tsx,
 *   app/actions/doacoes.ts e lib/patrimonio/doacoes.ts;
 * - Frota: app/(app)/patrimonio/frota/**, components/app/patrimonio/frota.tsx,
 *   app/actions/frota.ts e lib/patrimonio/frota.ts;
 * - avisos: app/api/patrimonio/rotina e lib/patrimonio/destinatarios.ts.
 * Quem pode o quê: os níveis do próprio Patrimônio (NIVEIS em
 * lib/patrimonio/regras.ts; admin do espaço = Gestão), conferidos de novo
 * pelas funções do banco (supabase/migrations/20260925120000…150000).
 *
 * As telas '/patrimonio/[id]', '/patrimonio/estoque/[id]' e
 * '/patrimonio/frota/[id]' casam também com os endereços fixos vizinhos
 * (novo, comigo, movimentos, condutores…); por isso cada um deles tem a
 * própria tela aqui — senão herdaria o tour da ficha.
 *
 * Os alvos `patrimonio.*` são marcados com `data-ajuda` nessas telas. Mudou a
 * tela ou a regra, muda aqui no mesmo PR (docs/AJUDA.md).
 */

export const guias: GuiaDaArea[] = [
  {
    href: '/patrimonio',
    paraQueServe: 'Tudo o que é físico e da filial: os bens duráveis (com plaqueta e QR, onde estão, com quem, manutenção e quanto valem hoje), o estoque de materiais com lote e validade, as doações em espécie, com recibo e termo de entrega, e a frota de veículos. Serve para saber onde está cada coisa, quem responde por ela e prestar contas a financiadores e ao contador.',
    quemUsa: 'Toda a equipe vê “Comigo”, com os bens que estão sob a sua responsabilidade. O resto depende do nível no Patrimônio, dado por um administrador: “Ver” consulta; “Operar” cadastra, entrega, movimenta o estoque, as doações e a frota; “Gestão” também cuida de categorias, locais, baixas, inventário, campanhas, veículos e condutores. Administradores têm acesso total. Os avisos (manutenção, devolução atrasada, estoque baixo, validade, documentos e condutores da frota) vão para quem tem “Operar” ou “Gestão” e para os administradores.',
    tour: [
      {
        titulo: 'Patrimônio',
        texto: 'Aqui ficam os bens duráveis da filial: rádios, desfibriladores, macas, computadores. Cada um tem plaqueta com QR, lugar, estado e quem responde por ele.',
      },
      {
        alvo: 'patrimonio.secoes',
        titulo: 'As seções',
        texto: 'No alto ficam “Bens”, “Estoque”, “Doações”, “Frota”, “Comigo”, “Inventário” e “Cadastros”. Sem nível no Patrimônio, só aparece “Comigo”, com o que está sob a sua responsabilidade.',
        lado: 'bottom',
      },
      {
        alvo: 'patrimonio.resumo',
        titulo: 'O que pede atenção',
        texto: 'Quantos bens há e quanto valem hoje, depois da depreciação. Manutenção vencida, termo sem aceite ou devolução atrasada deixam o quadro em destaque, e ele abre a lista filtrada.',
        seAusente: 'pular',
      },
      {
        alvo: 'patrimonio.filtros',
        titulo: 'Buscar e filtrar',
        texto: 'Busque por plaqueta, nome, número de série ou por quem está com o bem. “No patrimônio” esconde os baixados; para vê-los, escolha “Baixados”.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'patrimonio.lista',
        titulo: 'A lista de bens',
        texto: 'O nome do bem abre a página dele: é lá que se entrega a alguém, recebe de volta, registra manutenção e imprime a etiqueta.',
        seAusente: 'pular',
      },
      {
        alvo: 'patrimonio.etiquetas',
        titulo: 'Etiquetas com QR',
        texto: 'Marque os bens na lista e use “Etiquetas dos marcados” para imprimir as plaquetas com QR em folha A4. Lido pelo celular, o QR abre o bem na Redação.',
        lado: 'bottom',
        seAusente: 'pular',
      },
      {
        alvo: 'patrimonio.novo',
        titulo: 'Cadastrar um bem',
        texto: 'O botão “Novo bem” abre o cadastro. A plaqueta é numerada ao salvar.',
        lado: 'bottom',
        seAusente: 'pular',
      },
    ],
    telas: [
      {
        caminho: '/patrimonio/[id]',
        rotulo: 'Bem',
        tour: [
          {
            titulo: 'A ficha do bem',
            texto: 'Situação, estado, onde está, com quem, manutenções e histórico. Tudo o que acontece com o bem fica registrado aqui.',
          },
          {
            alvo: 'patrimonio.bem-acoes',
            titulo: 'Entregar e receber de volta',
            texto: '“Entregar a alguém” registra a entrega com termo de responsabilidade; com o bem fora, o botão vira “Registrar devolução”. Aqui ficam também “Editar”, “Etiqueta” e, para a gestão, “Dar baixa”.',
            lado: 'bottom',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.bem-conferir',
            titulo: 'Inventário aberto',
            texto: 'Com um inventário aberto, confira o bem aqui: escolha onde ele foi achado e o estado, e use “Está aqui”.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.bem-manutencao',
            titulo: 'Manutenção',
            texto: 'Manutenções feitas e agendadas. Quem opera usa o botão “Manutenção” para registrar ou agendar; preventiva, calibração ou inspeção feita num bem com periodicidade já agenda a próxima.',
          },
          {
            alvo: 'patrimonio.bem-qr',
            titulo: 'QR da etiqueta',
            texto: 'Lido pelo celular, o QR da etiqueta abre esta página. É o jeito mais rápido de achar o bem, inclusive no inventário.',
            lado: 'left',
          },
          {
            alvo: 'patrimonio.bem-historico',
            titulo: 'Histórico',
            texto: 'Quem cadastrou, editou, entregou, recebeu de volta, registrou manutenção, aceitou o termo ou conferiu o bem, com data e hora.',
            lado: 'left',
            seAusente: 'pular',
          },
        ],
      },
      {
        caminho: '/patrimonio/novo',
        rotulo: 'Novo bem',
        tour: [
          {
            titulo: 'Cadastrar um bem',
            texto: 'Preencha o que é, onde fica e como chegou à filial. A plaqueta sai numerada ao salvar; depois imprima a etiqueta com QR na página do bem.',
          },
          {
            alvo: 'patrimonio.bem-plaqueta',
            titulo: 'A plaqueta',
            texto: 'O número previsto para a plaqueta; ele só é confirmado ao salvar. Se o bem já tinha número de patrimônio, guarde em “Plaqueta antiga”: a busca acha pelos dois.',
            lado: 'bottom',
          },
          {
            alvo: 'patrimonio.bem-categoria',
            titulo: 'Categoria',
            texto: 'A categoria traz a vida útil, que calcula a depreciação, e a manutenção periódica. Escolhida a categoria, o que ela usa aparece logo abaixo.',
          },
          {
            alvo: 'patrimonio.bem-aquisicao',
            titulo: 'Aquisição',
            texto: 'Escolha a “Origem”. Bem doado entra pelo valor de mercado; comodato não é da filial e não deprecia. “Comprado com”, quando aparece, liga o bem a um convênio.',
          },
        ],
      },
      {
        caminho: '/patrimonio/comigo',
        rotulo: 'Bens comigo',
        tour: [
          {
            titulo: 'Bens comigo',
            texto: 'O que é da filial e está sob a sua responsabilidade. Vale para toda a equipe, mesmo para quem não tem acesso ao resto do Patrimônio.',
          },
          {
            alvo: 'patrimonio.comigo-lista',
            titulo: 'Cada bem com você',
            texto: 'Cada cartão mostra o bem, a plaqueta, quando você recebeu, até quando devolver e o texto do termo de responsabilidade.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.comigo-aceitar',
            titulo: 'Aceitar o termo',
            texto: 'Confira o bem, marque “Li o termo, conferi o bem e o recebi.” e use “Aceitar o termo”. Sem o aceite, o bem aparece com “termo pendente” na lista de bens.',
            seAusente: 'pular',
          },
          {
            titulo: 'Devolver',
            texto: 'Para devolver, leve o bem a quem opera o Patrimônio: essa pessoa registra a devolução, e o bem sai desta lista.',
          },
        ],
      },
      {
        caminho: '/patrimonio/estoque',
        rotulo: 'Estoque de materiais',
        tour: [
          {
            titulo: 'Estoque de materiais',
            texto: 'Material de consumo (curativos, EPI, higiene, alimentos e kits): quanto há em cada lugar, o que está acabando e o que vence logo.',
          },
          {
            alvo: 'patrimonio.estoque-acoes',
            titulo: 'Entrada, saída e movimentos',
            texto: '“Entrada” registra compra, doação ou outra entrada; “Saída”, o uso, e sai primeiro o que vence primeiro. “Movimentos” mostra o mês. “Entrada”, “Saída” e “Novo material” pedem “Operar” ou “Gestão”.',
            lado: 'bottom',
          },
          {
            alvo: 'patrimonio.estoque-resumo',
            titulo: 'O que pede atenção',
            texto: 'Material abaixo do mínimo ou zerado e lote vencendo ou vencido deixam o quadro em destaque; ele abre a lista já filtrada.',
          },
          {
            alvo: 'patrimonio.estoque-filtros',
            titulo: 'Buscar e filtrar',
            texto: 'Busque por código ou nome e filtre por categoria, local ou situação: “Abaixo do mínimo”, “Vencendo”, “Com lote vencido”, “Só kits” ou “Arquivados”.',
            lado: 'bottom',
          },
          {
            alvo: 'patrimonio.estoque-lista',
            titulo: 'Os materiais',
            texto: 'O saldo soma todos os locais, e “Próxima validade” mostra o lote que vence primeiro. Abra o material para ver os lotes, transferir, contar ou registrar perda.',
          },
        ],
      },
      {
        caminho: '/patrimonio/estoque/[id]',
        rotulo: 'Material',
        tour: [
          {
            titulo: 'O material',
            texto: 'A ficha do material: saldo em todos os locais, mínimo, custo médio, os lotes com validade e cada movimento.',
          },
          {
            alvo: 'patrimonio.material-saldo',
            titulo: 'Saldo e custo',
            texto: 'O saldo soma todos os locais. O valor em estoque segue o custo médio das entradas.',
          },
          {
            alvo: 'patrimonio.material-acoes',
            titulo: 'Entrada, saída e kits',
            texto: '“Entrada” e “Saída” já vêm com este material escolhido. Num kit, “Montar kits” tira os componentes do estoque e põe os kits prontos no mesmo local.',
            lado: 'bottom',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.material-lotes',
            titulo: 'Onde está',
            texto: 'Cada linha é um lote num local. Para quem opera, os ícones da linha fazem “Transferir”, “Contar” e “Registrar perda”. Lote vencido não sai para uso: registre a perda.',
          },
          {
            alvo: 'patrimonio.material-movimentos',
            titulo: 'Movimentos',
            texto: 'Entradas, saídas, transferências, ajustes de contagem, perdas e montagens de kit, com a data e quem registrou.',
          },
        ],
      },
      {
        caminho: '/patrimonio/estoque/novo',
        rotulo: 'Novo material',
        tour: [
          {
            titulo: 'Novo material',
            texto: 'Cadastre o material uma vez; a quantidade entra depois, pela “Entrada”. O código (MAT-00001…) é gerado ao salvar.',
          },
          {
            alvo: 'patrimonio.material-validade',
            titulo: 'Lote e validade',
            texto: 'Marque “Controla lote e validade” para medicamento, curativo, alimento e água. A saída segue o que vence primeiro, e a Redação avisa antes de vencer.',
          },
          {
            alvo: 'patrimonio.material-minimo',
            titulo: 'Estoque mínimo',
            texto: 'Soma todos os locais. Quando uma saída deixa o material abaixo do mínimo, quem opera o estoque recebe aviso. Zero é sem mínimo.',
          },
          {
            alvo: 'patrimonio.material-kit',
            titulo: 'Kit',
            texto: 'Para kit de higiene ou de primeiros socorros, marque que é um kit e diga quanto de cada material vai em um kit. Depois, “Montar kits” faz o resto.',
            lado: 'top',
          },
        ],
      },
      {
        caminho: '/patrimonio/estoque/movimentos',
        rotulo: 'Movimentos do estoque',
        tour: [
          {
            titulo: 'Movimentos do mês',
            texto: 'Tudo o que entrou, saiu, foi transferido, contado ou perdido num mês. Serve para prestar contas; o mesmo resumo vai no fechamento do Financeiro.',
          },
          {
            alvo: 'patrimonio.movimentos-filtros',
            titulo: 'Mês e filtros',
            texto: 'Os botões com o nome do mês levam ao mês anterior e ao seguinte. Filtre por tipo de movimento ou por local.',
            lado: 'bottom',
          },
          {
            alvo: 'patrimonio.movimentos-totais',
            titulo: 'Totais do mês',
            texto: 'Somam compras, doações recebidas (valor de mercado), saídas para uso e perdas. Ficam fora transferências e montagens de kit, que só mudam o material de lugar ou de forma, ajustes de contagem e outras entradas.',
          },
        ],
      },
      {
        caminho: '/patrimonio/doacoes',
        rotulo: 'Doações',
        tour: [
          {
            titulo: 'Doações',
            texto: 'Itens doados (alimentos, roupas, ajuda humanitária): quem doou, com recibo, e para quem foi, com termo de entrega. Doação em dinheiro é receita no Financeiro.',
          },
          {
            alvo: 'patrimonio.doacoes-receber',
            titulo: 'Receber e entregar',
            texto: '“Receber doação” registra o que chegou e emite o recibo. “Entregar”, ao lado, registra o que saiu e para quem, e gera o termo para assinar.',
            lado: 'bottom',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.doacoes-resumo',
            titulo: 'O mês em números',
            texto: 'Doações recebidas, quanto valem a preço de mercado, entregas e pessoas atendidas neste mês.',
          },
          {
            alvo: 'patrimonio.doacoes-abas',
            titulo: 'Recebidas e entregues',
            texto: 'As abas “Recebidas” e “Entregues” listam os recibos e os termos. Filtre por campanha para ver só o que é de uma.',
          },
          {
            alvo: 'patrimonio.doacoes-campanhas',
            titulo: 'Campanhas e doadores',
            texto: '“Campanhas” junta o recebido e o entregue numa ação (enchentes, inverno) para prestar contas. “Doadores” mostra quem doou, quanto e quando.',
            lado: 'bottom',
          },
        ],
      },
      {
        caminho: '/patrimonio/doacoes/receber',
        rotulo: 'Receber doação',
        tour: [
          {
            titulo: 'Receber doação',
            texto: 'Registre o que chegou e emita o recibo. Cada material entra no Estoque e cada bem durável no Patrimônio, pelo valor de mercado.',
          },
          {
            alvo: 'patrimonio.receber-cabecalho',
            titulo: 'Doador e campanha',
            texto: 'Escolha o doador ou cadastre um pelo botão “Novo doador”, ao lado. Sem doador, o recibo sai como doação anônima. O CPF ou o CNPJ do doador sai no recibo.',
          },
          {
            alvo: 'patrimonio.receber-itens',
            titulo: 'Itens doados',
            texto: '“Material” vai para o Estoque; “Bem durável” (cadeira de rodas, geladeira) vai para o Patrimônio, e cada unidade ganha plaqueta. Informe o valor de mercado de cada um.',
          },
          {
            alvo: 'patrimonio.receber-registrar',
            titulo: 'Registrar e emitir recibo',
            texto: 'A Redação numera o recibo (ex.: DOA-2026-0001; a numeração recomeça a cada ano) e abre a doação, com o botão “Recibo (PDF)”.',
            lado: 'top',
          },
        ],
      },
      {
        caminho: '/patrimonio/doacoes/entregar',
        rotulo: 'Entregar doação',
        tour: [
          {
            titulo: 'Entregar doação',
            texto: 'Registre o que foi entregue e para quem. Os itens saem do Estoque, o que vence primeiro antes, e a Redação gera o termo de entrega para assinar.',
          },
          {
            alvo: 'patrimonio.entregar-quem',
            titulo: 'Quem recebe',
            texto: 'Escolha o “Tipo” (família, pessoa, instituição, abrigo ou ação da própria Cruz Vermelha), o nome, “Quem assina o recebimento” e “Pessoas atendidas”.',
          },
          {
            alvo: 'patrimonio.entregar-itens',
            titulo: 'Itens entregues',
            texto: 'Só aparece o que há no local escolhido em “Sai de”, sem contar vencidos. Kits prontos aparecem como qualquer material.',
          },
          {
            alvo: 'patrimonio.entregar-registrar',
            titulo: 'Registrar e emitir termo',
            texto: 'A Redação numera a entrega (ex.: ENT-2026-0001) e abre a tela com “Termo para assinar (PDF)”. Imprima e colha a assinatura de quem recebeu.',
            lado: 'top',
          },
        ],
      },
      {
        caminho: '/patrimonio/doacoes/campanhas',
        rotulo: 'Campanhas',
        tour: [
          {
            titulo: 'Campanhas',
            texto: 'Cada campanha junta as doações recebidas e as entregas, para a prestação de contas a doadores e financiadores.',
          },
          {
            alvo: 'patrimonio.campanhas-nova',
            titulo: 'Nova campanha',
            texto: 'Só a gestão do Patrimônio cria e muda campanhas. Campanha “Encerrada” sai das listas de “Receber doação” e “Entregar”, mas o histórico fica.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.campanhas-lista',
            titulo: 'Recebido e entregue',
            texto: 'Cada linha mostra o que a campanha recebeu, o que entregou e quantas pessoas atendeu. Abra a campanha para ver item a item, os recibos e as entregas.',
          },
        ],
      },
      {
        caminho: '/patrimonio/frota',
        rotulo: 'Frota',
        tour: [
          {
            titulo: 'Frota',
            texto: 'Ambulâncias e veículos: diário de bordo, abastecimento, manutenção por km e por data, e documentos com vencimento.',
          },
          {
            alvo: 'patrimonio.frota-veiculos',
            titulo: 'Os veículos',
            texto: 'Cada cartão mostra se o veículo está “Disponível”, “Em viagem”, “Em manutenção” ou “Fora de uso”, o hodômetro e os alertas de manutenção e documentos.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.frota-condutores',
            titulo: 'Condutores',
            texto: 'Só sai com veículo quem está em “Condutores”, com CNH válida na categoria certa. Ambulância pede também o curso de condutor de veículo de emergência.',
            lado: 'bottom',
          },
          {
            alvo: 'patrimonio.frota-alerta-condutores',
            titulo: 'CNH vencendo',
            texto: 'Este aviso lista quem está com a CNH ou o curso de emergência vencido ou vencendo nos próximos 30 dias.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.frota-novo',
            titulo: 'Novo veículo',
            texto: 'Só a gestão do Patrimônio cadastra veículos. Ligue o veículo ao bem do Patrimônio para ter plaqueta, valor e depreciação.',
            lado: 'bottom',
            seAusente: 'pular',
          },
        ],
      },
      {
        caminho: '/patrimonio/frota/[id]',
        rotulo: 'Veículo',
        tour: [
          {
            titulo: 'O veículo',
            texto: 'Hodômetro, consumo e custo por km, planos de manutenção, documentos, diário de bordo, abastecimentos e serviços, tudo numa ficha.',
          },
          {
            alvo: 'patrimonio.veiculo-acoes',
            titulo: 'Saída, retorno e abastecimento',
            texto: '“Saída” abre a viagem no diário de bordo e “Retorno” encerra, com o km. “Abastecer” e “Serviço” registram combustível e oficina.',
            lado: 'bottom',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.veiculo-resumo',
            titulo: 'Consumo e custo',
            texto: 'O consumo sai dos abastecimentos com tanque cheio. O custo por km soma combustível e serviços e divide pelo km das viagens encerradas, nos últimos 12 meses.',
          },
          {
            alvo: 'patrimonio.veiculo-planos',
            titulo: 'Manutenção programada',
            texto: 'Cada plano vence no que chegar primeiro: km ou tempo. “Registrar feito” lança o serviço, e o plano volta a contar dali.',
          },
          {
            alvo: 'patrimonio.veiculo-documentos',
            titulo: 'Documentos',
            texto: 'CRLV, licenciamento, seguro, vistorias. Com vencimento, a Redação avisa 30 e 7 dias antes e no dia seguinte ao vencimento. Quem opera cadastra pelo botão “Documento”.',
          },
          {
            alvo: 'patrimonio.veiculo-diario',
            titulo: 'Diário de bordo',
            texto: 'Cada viagem com condutor, destino, finalidade, km rodado e retorno. Viagem sem retorno aparece como “em viagem”.',
            lado: 'top',
          },
        ],
      },
      {
        caminho: '/patrimonio/frota/novo',
        rotulo: 'Novo veículo',
        tour: [
          {
            titulo: 'Novo veículo',
            texto: 'Preencha com os dados do documento (CRLV) e o hodômetro de hoje. Depois, o km sobe sozinho com as viagens e os abastecimentos.',
          },
          {
            alvo: 'patrimonio.veiculo-bem',
            titulo: 'Bem no patrimônio',
            texto: 'Ligue o veículo ao bem com plaqueta para ter valor e depreciação. Se o bem ainda não existe, cadastre antes em “Bens”.',
          },
          {
            alvo: 'patrimonio.veiculo-situacao',
            titulo: 'Situação',
            texto: '“Em manutenção” e “Fora de uso” impedem a saída do veículo. Só “Disponível” pode sair.',
          },
        ],
      },
      {
        caminho: '/patrimonio/frota/condutores',
        rotulo: 'Condutores',
        tour: [
          {
            titulo: 'Condutores',
            texto: 'Quem pode dirigir os veículos da filial, com CNH, categoria e curso de veículo de emergência. Só sai com veículo quem está aqui.',
          },
          {
            alvo: 'patrimonio.condutores-novo',
            titulo: 'Novo condutor',
            texto: 'Só a gestão do Patrimônio cadastra condutores: da equipe, voluntário ou outra pessoa, com a validade da CNH e do curso de emergência.',
            lado: 'bottom',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.condutores-lista',
            titulo: 'Validades',
            texto: 'O que venceu ou vence em até 30 dias aparece em destaque. Com CNH vencida, a pessoa fica bloqueada na “Saída” do veículo, com o motivo.',
            seAusente: 'pular',
          },
        ],
      },
      {
        caminho: '/patrimonio/inventario',
        rotulo: 'Inventário',
        tour: [
          {
            titulo: 'Inventário físico',
            texto: 'Conferir, bem a bem, que tudo está onde a Redação diz. Com o inventário aberto, leia o QR da etiqueta com o celular e marque “Está aqui” na página do bem.',
          },
          {
            alvo: 'patrimonio.inventario-abrir',
            titulo: 'Abrir o inventário',
            texto: 'Só a gestão do Patrimônio abre o inventário, e só um fica aberto por vez.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.inventario-progresso',
            titulo: 'Progresso',
            texto: 'Quantos bens já foram conferidos. Bem achado em outro lugar ou em outro estado é atualizado na hora da conferência.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.inventario-faltam',
            titulo: 'O que falta',
            texto: 'Os bens ainda não conferidos, agrupados por local. Cada um abre a página do bem, onde se confere.',
            seAusente: 'pular',
          },
          {
            alvo: 'patrimonio.inventario-concluir',
            titulo: 'Concluir',
            texto: 'Ao concluir, o que não foi conferido fica como não encontrado no resultado, que vai para “Inventários anteriores”.',
            seAusente: 'pular',
          },
        ],
      },
      {
        caminho: '/patrimonio/cadastros',
        rotulo: 'Cadastros',
        tour: [
          {
            titulo: 'Cadastros do Patrimônio',
            texto: 'As listas que o resto usa: categorias de bens e do estoque, locais, o prefixo da plaqueta e o texto do termo.',
          },
          {
            alvo: 'patrimonio.cadastros-abas',
            titulo: 'As abas',
            texto: '“Categorias de bens”, “Categorias do estoque”, “Locais”, “Plaqueta e termo” e, para administradores, “Quem acessa”.',
            lado: 'bottom',
          },
          {
            alvo: 'patrimonio.cadastros-conteudo',
            titulo: 'Criar e editar',
            texto: 'Só a gestão do Patrimônio cria e edita. Não há como apagar: arquive a categoria ou desative o local, e o que já usa continua como está.',
          },
          {
            titulo: 'Quem acessa',
            texto: 'Na aba “Quem acessa”, um administrador dá a cada pessoa o nível “Ver”, “Operar” ou “Gestão”. Quem fica em “Sem acesso” vê só “Comigo”.',
          },
        ],
      },
    ],
    tarefas: [
      {
        id: 'cadastrar-bem',
        titulo: 'Cadastrar um bem e imprimir a etiqueta',
        passos: [
          'Em “Bens”, use “Novo bem”.',
          'Preencha “Nome do bem”, “Categoria” e “Onde está”. Se o bem já tinha número de patrimônio, ponha em “Plaqueta antiga”.',
          'Em “Aquisição”, escolha a “Origem” e preencha “Data”, o valor e “Nota fiscal / documento”. Bem doado pede o “Valor de mercado”.',
          'Use “Cadastrar bem”: a plaqueta é numerada e a página do bem abre.',
          'Na página do bem, use “Etiqueta” para abrir o PDF com o QR, imprima e cole no bem.',
        ],
        dica: 'Para várias etiquetas de uma vez, marque os bens na lista de “Bens” e use “Etiquetas dos marcados” (folha A4, 3 × 8).',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'entregar-bem',
        titulo: 'Entregar um bem a alguém e registrar a devolução',
        passos: [
          'Abra o bem, pela lista de “Bens” ou lendo o QR da etiqueta.',
          'Use “Entregar a alguém” e escolha “Equipe (login do Redação)” ou “Voluntário”.',
          'Em “Quem recebe”, escolha a pessoa. Se o bem tem de voltar numa data, preencha “Devolver até (opcional)”; em “Observação”, anote o que foi junto.',
          'Use “Registrar entrega”. A pessoa da equipe recebe um aviso para aceitar o termo em “Comigo”; quem é voluntário aceita na Área do Voluntário e, se tiver e-mail cadastrado, recebe o aviso por e-mail.',
          'Quando o bem voltar, abra a página dele e use “Registrar devolução”.',
          'Diga “Em que estado voltou” e “Onde fica agora” e use “Confirmar devolução”. Se estava “Em uso”, o bem passa para “Reserva”.',
        ],
        dica: 'Um bem fica com uma pessoa por vez: para passar a outra, registre a devolução antes. Só voluntário ativo aparece na lista.',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'aceitar-termo',
        titulo: 'Aceitar o termo de um bem que está com você',
        passos: [
          'Abra “Patrimônio” e vá em “Comigo” (ou use o botão “Ver e aceitar” do aviso).',
          'Confira se o bem, a plaqueta e o número de série batem com o que você recebeu.',
          'Leia o termo de responsabilidade.',
          'Marque “Li o termo, conferi o bem e o recebi.” e use “Aceitar o termo”.',
        ],
        dica: 'Se o aviso chegou mas o bem não está com você, não aceite: fale com quem opera o Patrimônio.',
      },
      {
        id: 'registrar-manutencao',
        titulo: 'Registrar ou agendar a manutenção de um bem',
        passos: [
          'Abra o bem e, no quadro “Manutenção”, use o botão “Manutenção”.',
          'Escolha o “Tipo”: “Preventiva”, “Corretiva (conserto)”, “Calibração” ou “Inspeção”.',
          'Descreva em “O que foi (ou será) feito”.',
          'Marque “Já foi feita” e preencha “Feita em”, ou marque “Agendar” e preencha “Prevista para”.',
          'Preencha “Quem fez” e “Custo”, se houver, e use “Salvar”.',
          'Quando a agendada acontecer, use “Feita hoje” na linha dela.',
        ],
        dica: 'Preventiva, calibração ou inspeção feita num bem com periodicidade agenda a próxima sozinha. Da agendada, quem opera o Patrimônio recebe aviso 7 dias antes e no dia seguinte ao vencimento.',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'fazer-inventario',
        titulo: 'Fazer o inventário físico',
        passos: [
          'Em “Inventário”, dê um nome e use “Abrir inventário”.',
          'Com o celular, leia o QR da etiqueta de cada bem: a página do bem abre.',
          'No quadro “Inventário aberto”, confira onde o bem foi achado e o estado, e use “Está aqui”.',
          'Acompanhe em “Inventário” o que falta conferir, por local.',
          'No fim, use “Concluir inventário”. O que não foi conferido fica como não encontrado no resultado.',
        ],
        dica: 'Bem achado em outro lugar ou em outro estado é atualizado na hora da conferência.',
        quem: 'Abrir e concluir: só a gestão. Conferir: “Operar” ou “Gestão”',
      },
      {
        id: 'entrada-no-estoque',
        titulo: 'Dar entrada de material no estoque',
        passos: [
          'Se o material ainda não existe, cadastre em “Estoque” com “Novo material”.',
          'Em “Estoque”, use “Entrada” (ou abra o material e use “Entrada” lá).',
          'Escolha o “Material”, a “Origem” e “Para onde”.',
          'Informe a “Quantidade” e o “Valor de cada um” (na doação, “Valor de mercado de cada um”). Só na origem “Outra” o valor pode ficar vazio: aí vale o custo médio atual.',
          'Se o material controla validade, preencha a “Validade” (e o “Lote”, se houver).',
          'Use “Registrar entrada”.',
        ],
        dica: 'Material vencido não entra no estoque. O que foi comprado por “Pedidos de compra” entra pela própria compra, na aba “Dar entrada”.',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'saida-do-estoque',
        titulo: 'Registrar a saída de material',
        passos: [
          'Em “Estoque”, use “Saída”.',
          'Escolha o “Material” e “De onde”: só aparecem os locais com saldo.',
          'Informe a “Quantidade” e “Para quê”.',
          'Confira o quadro que mostra de quais lotes vai sair: o que vence primeiro sai antes.',
          'Preencha “Para quem / onde” e use “Registrar saída”.',
        ],
        dica: 'Se o material ficar abaixo do mínimo, quem opera o estoque recebe aviso. Para itens doados a famílias, use “Entregar” em “Doações”: sai do estoque e já gera o termo.',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'receber-doacao',
        titulo: 'Receber uma doação e emitir o recibo',
        passos: [
          'Em “Doações”, use “Receber doação”.',
          'Escolha o “Doador” ou cadastre um novo pelo botão ao lado. Sem doador, o recibo sai como doação anônima.',
          'Escolha a “Campanha”, se houver, e “Onde os itens ficam”.',
          'Em “Itens doados”, use “Material” para o que vai ao estoque e “Bem durável” para o que ganha plaqueta. Material ainda sem cadastro: escolha “+ Material que ainda não está cadastrado”.',
          'Informe a quantidade e o “Valor de mercado (cada)” de cada item.',
          'Use “Registrar e emitir recibo” e, na tela da doação, abra “Recibo (PDF)”.',
        ],
        dica: 'O valor é o de mercado, como pede a norma contábil (ITG 2002). Doação em dinheiro não entra aqui: é receita no Financeiro.',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'entregar-doacao',
        titulo: 'Entregar doação e emitir o termo',
        passos: [
          'Em “Doações”, use “Entregar”.',
          'Em “Quem recebe”, escolha o “Tipo” e preencha o nome, “Quem assina o recebimento” e “Pessoas atendidas”.',
          'Escolha a “Campanha”, se houver, e o local em “Sai de”.',
          'Em “Itens entregues”, escolha cada material e a quantidade; “Item” acrescenta uma linha.',
          'Use “Registrar e emitir termo”.',
          'Na tela da entrega, abra “Termo para assinar (PDF)”, imprima e colha a assinatura de quem recebeu.',
        ],
        dica: 'Os itens saem do estoque, o que vence primeiro antes. Se algum material ficar abaixo do mínimo, quem opera o estoque recebe aviso.',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'viagem-com-veiculo',
        titulo: 'Registrar a saída e o retorno de um veículo',
        passos: [
          'Em “Frota”, abra o veículo e use “Saída”.',
          'Em “Quem dirige”, escolha o condutor: quem não pode levar este veículo aparece bloqueado, com o motivo.',
          'Confira o “Hodômetro na saída”, escolha a “Finalidade”, escreva o “Destino” e use “Registrar saída”.',
          'Na volta, use “Retorno” e informe o “Hodômetro na chegada”.',
          'Anote em “Ocorrências” o que houve (luz acesa, pneu baixo) e use “Registrar retorno”.',
          'Se abasteceu, use “Abastecer” e marque “Encheu o tanque” quando encher: é assim que a Redação calcula o consumo.',
        ],
        dica: 'Veículo “Em manutenção” ou “Fora de uso” não mostra “Saída”; em viagem, o botão vira “Retorno”. Se a viagem venceu um plano de manutenção por km, quem opera o Patrimônio recebe aviso.',
        quem: 'Nível “Operar” ou “Gestão”',
      },
      {
        id: 'cadastrar-veiculo',
        titulo: 'Cadastrar um veículo, com planos e documentos',
        passos: [
          'Em “Frota”, use “Novo veículo”.',
          'Preencha “Placa”, “Tipo” e “Combustível” com os dados do CRLV, o “Hodômetro hoje” e a “Base”, onde o veículo fica.',
          'Em “Bem no patrimônio”, escolha o bem com plaqueta, se ele já estiver cadastrado em “Bens”.',
          'Use “Cadastrar veículo”: a página do veículo abre.',
          'Em “Manutenção programada”, use “Plano de manutenção” para o que se repete: dê um “Nome” e preencha “A cada (km)”, “Ou a cada (meses)” ou os dois.',
          'Em “Documentos”, use “Documento”, escolha o “Tipo” (CRLV, licenciamento, seguro…), preencha o “Vencimento” e use “Salvar”.',
        ],
        dica: 'Quem dirige precisa estar em “Condutores”, com a validade da CNH e, para ambulância, do curso de veículo de emergência.',
        quem: 'Veículo e planos: só a gestão. Documentos: “Operar” ou “Gestão”',
      },
      {
        id: 'dar-acesso',
        titulo: 'Dar a alguém acesso ao Patrimônio',
        passos: [
          'Abra “Patrimônio” e vá em “Cadastros”.',
          'Abra a aba “Quem acessa”: ela lista a equipe e o que cada nível permite.',
          'Na linha da pessoa, escolha “Ver”, “Operar” ou “Gestão”. “Sem acesso” tira o nível.',
        ],
        dica: 'A mudança vale na hora, sem botão de salvar. Administradores já têm acesso total; quem fica sem nível continua vendo “Comigo”.',
        quem: 'Só administradores',
      },
    ],
    perguntas: [
      {
        id: 'sem-acesso',
        pergunta: 'Por que só vejo “Comigo” no Patrimônio?',
        resposta: 'O Patrimônio tem níveis próprios: “Ver”, “Operar” e “Gestão”. Sem nível, a pessoa vê só “Comigo”, com o que está sob a responsabilidade dela. Quem dá o nível é um administrador, em “Cadastros”, aba “Quem acessa”.',
        termos: ['acesso', 'permissão', 'bloqueado', 'Você ainda não tem acesso ao Patrimônio', 'não aparece'],
      },
      {
        id: 'niveis',
        pergunta: 'O que cada nível do Patrimônio pode fazer?',
        resposta: '“Ver”: consulta bens, com quem estão, manutenções e histórico, além do estoque, das doações e da frota.\n\n“Operar”: também cadastra e edita bens e materiais, entrega e recebe de volta, registra manutenção, confere no inventário, movimenta o estoque, recebe e entrega doações e registra viagens, abastecimentos, serviços e documentos da frota.\n\n“Gestão”: também categorias, locais, prefixo da plaqueta e texto do termo, baixa de bens, abrir e concluir o inventário, campanhas, veículos, condutores, planos de manutenção e excluir lançamentos da frota.\n\nAdministradores têm acesso total.',
        termos: ['nível', 'ver', 'operar', 'gestão', 'quem pode'],
      },
      {
        id: 'numero-da-plaqueta',
        pergunta: 'Como a plaqueta é numerada? Dá para mudar?',
        resposta: 'A plaqueta é o prefixo mais um número em sequência (ex.: CVRJ-00001), dado quando o bem é salvo. A gestão muda o prefixo em “Cadastros”, aba “Plaqueta e termo”; mudar o prefixo não renumera os bens que já existem. Número antigo vai em “Plaqueta antiga”, e a busca acha pelos dois.',
        termos: ['plaqueta', 'número de patrimônio', 'prefixo', 'tombamento', 'etiqueta'],
      },
      {
        id: 'ler-o-qr',
        pergunta: 'O que acontece quando alguém lê o QR da etiqueta?',
        resposta: 'O celular abre a página do bem na Redação, pedindo login antes se preciso. Sem nível no Patrimônio, a pessoa só abre um bem que esteja com ela.',
        termos: ['qr code', 'celular', 'etiqueta', 'escanear'],
      },
      {
        id: 'termo-pendente',
        pergunta: 'O que quer dizer “termo pendente”?',
        resposta: 'O bem foi entregue, mas a pessoa ainda não aceitou o termo de responsabilidade. Quem é da equipe aceita em “Comigo”; quem é voluntário, na Área do Voluntário. O quadro de alertas em “Bens” conta quantos estão assim.\n\nO texto do termo é o de “Cadastros”, aba “Plaqueta e termo”, copiado na hora da entrega: mudar lá não altera termos já entregues.',
        termos: ['termo de responsabilidade', 'cautela', 'sem termo aceito', 'termo ainda não aceito', 'aceite'],
      },
      {
        id: 'situacao-do-bem',
        pergunta: 'Qual a diferença entre “Em uso”, “Reserva”, “Em manutenção” e “Baixado”?',
        resposta: '“Em uso”: o bem está em serviço (entregar a alguém põe nesta situação); “Reserva”: guardado, e é para onde ele volta depois da devolução. “Em manutenção”: parado para conserto; “Baixado”: saiu do patrimônio e não volta.\n\nO “Estado”, de “Novo” a “Inservível”, é outra coisa: a conservação do bem.',
        termos: ['situação', 'status', 'estado', 'guardado'],
      },
      {
        id: 'valor-hoje',
        pergunta: 'Como é calculado o valor do bem hoje?',
        resposta: 'Pela depreciação linear da categoria: o valor menos o residual, dividido pela vida útil em meses, a partir do mês seguinte à aquisição. Sem data de aquisição, ou em categoria sem vida útil, o bem não deprecia e vale o valor informado; bem em comodato não é da filial e fica fora dos totais. A gestão ajusta vida útil e valor residual em “Cadastros”.',
        termos: ['depreciação', 'valor contábil', 'vida útil', 'residual'],
      },
      {
        id: 'dar-baixa',
        pergunta: 'Como dou baixa num bem? Dá para desfazer?',
        resposta: 'Só a gestão dá baixa: na página do bem, “Dar baixa”, com destino, motivo e data. Se o bem está com alguém, registre a devolução antes. A baixa não se desfaz: o bem sai do patrimônio e fica no histórico, com o motivo. Em furto ou perda, guarde o boletim de ocorrência.',
        termos: ['baixa', 'descarte', 'furto', 'perda', 'vendido', 'excluir bem', 'apagar bem'],
      },
      {
        id: 'material-vencido',
        pergunta: 'Por que o material vencido não sai do estoque?',
        resposta: 'Material vencido não sai para uso nem para doação: a saída pega primeiro o que vence primeiro e pula o vencido. Abra o material e, na linha do lote vencido, use “Registrar perda” com “Venceu”.\n\nA Redação avisa quem opera o estoque quando um lote entra no prazo de aviso do material e no dia seguinte ao vencimento.',
        termos: ['validade', 'vencimento', 'lote vencido', 'Este lote está vencido: registre a perda.'],
      },
      {
        id: 'saldo-nao-bate',
        pergunta: 'O saldo da Redação não bate com a prateleira. O que faço?',
        resposta: 'Abra o material e, na linha do lote, use “Contar”. Informe “Quanto há de fato”; se der diferente, explique em “O que pode ter acontecido”, que aí é obrigatório, e use “Registrar contagem”. O acerto entra nos movimentos como “Ajuste de contagem”.',
        termos: ['contagem', 'ajuste', 'diferença', 'inventário do estoque', 'A contagem deu diferente: diga o que pode ter acontecido.'],
      },
      {
        id: 'kits',
        pergunta: 'Como funcionam os kits?',
        resposta: 'Um kit é um material montado com outros (kit de higiene, de primeiros socorros). No cadastro do material, marque que é um kit e diga quanto de cada material vai em um. Na página do kit, “Montar kits” tira os componentes do estoque, o que vence primeiro, e põe os kits prontos no mesmo local; o kit vence quando vence o primeiro componente.',
        termos: ['kit', 'montar', 'componentes', 'cesta'],
      },
      {
        id: 'mes-fechado',
        pergunta: 'Apareceu “Esta data está num mês já fechado no Financeiro”. E agora?',
        resposta: 'Movimentos de estoque e doações não podem ter data num mês que o Financeiro já fechou, porque o resumo daquele mês já foi para o fechamento. Use uma data de mês aberto ou fale com quem cuida do Financeiro. Data de mais de um ano atrás também não vale.',
        termos: ['mês fechado', 'fechamento', 'data inválida', 'Data muito antiga'],
      },
      {
        id: 'doacao-em-dinheiro',
        pergunta: 'Recebemos uma doação em dinheiro. Registro em “Doações”?',
        resposta: 'Não. “Doações” é para itens: alimentos, roupas, equipamentos. Dinheiro doado é receita e vai no Financeiro.',
        termos: ['pix', 'transferência', 'doação financeira', 'dinheiro'],
      },
      {
        id: 'corrigir-recibo',
        pergunta: 'Errei a quantidade numa doação recebida. Dá para corrigir o recibo?',
        resposta: 'Não pela tela: depois de registrado, o recibo não se edita nem se cancela, e continua com o que foi lançado. Para acertar o estoque, abra o material e use “Contar” no lote, explicando a diferença em “O que pode ter acontecido”.',
        termos: ['cancelar recibo', 'editar doação', 'estornar', 'desfazer'],
      },
      {
        id: 'condutor-bloqueado',
        pergunta: 'Por que não consigo escolher um condutor na saída do veículo?',
        resposta: 'Em “Quem dirige”, o condutor aparece bloqueado, com o motivo, quando a CNH venceu, a categoria não serve para o veículo ou, na ambulância, falta o curso de condutor de veículo de emergência válido. Quem não está em “Condutores”, ou está sem “Pode dirigir”, nem aparece. A gestão atualiza as validades em “Condutores”.',
        termos: ['CNH vencida', 'curso de emergência', 'categoria', 'ambulância', 'motorista'],
      },
      {
        id: 'avisos',
        pergunta: 'Quem recebe os avisos do Patrimônio, e quando?',
        resposta: 'Quem tem “Operar” ou “Gestão” e os administradores. Na hora: estoque abaixo do mínimo depois de uma saída ou de uma entrega de doação, e plano de manutenção por km vencido na volta de uma viagem.\n\nUma vez por dia: manutenção de bem (7 dias antes e no dia seguinte ao vencimento), devolução atrasada, lote que entra no prazo de aviso ou que venceu, documento de veículo (30 e 7 dias antes e no dia seguinte ao vencimento), CNH e curso de emergência (30 dias antes e no dia seguinte) e plano por tempo (7 dias antes e no dia seguinte).',
        termos: ['notificação', 'alerta', 'lembrete', 'vencimento', 'quem é avisado', 'devolução atrasada'],
      },
      {
        id: 'transferir-material',
        pergunta: 'Como passo material de um local para outro?',
        resposta: 'Abra o material e, na linha do lote, use “Transferir”: escolha “Para onde” e a “Quantidade”. O ícone só aparece quando há mais de um local ativo e o lote não está vencido. A transferência não muda o valor em estoque.',
        termos: ['transferência', 'mudar de lugar', 'mover estoque', 'almoxarifado', 'base'],
      },
      {
        id: 'apagar-lancamento-da-frota',
        pergunta: 'Lancei um abastecimento ou um serviço errado. Dá para apagar?',
        resposta: 'Só a gestão: na página do veículo, o ícone de lixeira (“Excluir”) ao lado do abastecimento, do serviço ou do documento. O registro some do histórico do veículo, então use só para corrigir um lançamento errado. Viagem do diário de bordo não se apaga.',
        termos: ['excluir', 'corrigir', 'errado', 'abastecimento', 'desfazer'],
      },
      {
        id: 'comprado-por-pedido',
        pergunta: 'O que foi comprado por “Pedidos de compra” precisa ser cadastrado aqui?',
        resposta: 'Não. Quando a compra chega, quem tem “Operar” ou “Gestão” no Patrimônio dá a entrada na própria compra, na aba “Dar entrada” de “Pedidos de compra”. Material vai para o Estoque e bem durável vira um bem por unidade, com plaqueta; o custo já vem da compra, com a parte do frete.',
        termos: ['compra', 'pedido de compra', 'nota fiscal', 'chegou', 'recebimento'],
      },
    ],
    relacionadas: ['/financeiro/compras', '/financeiro', '/voluntariado'],
  },
]
