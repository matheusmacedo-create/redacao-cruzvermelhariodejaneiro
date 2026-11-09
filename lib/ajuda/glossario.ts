/**
 * O glossário (docs/AJUDA.md §15): as palavras do Palácio Virtual que nem todo mundo conhece — "pauta", "rodada de
 * aprovação", "competência", "plaqueta" —, explicadas em uma ou duas frases, do jeito do guia de estilo (§4). Cada
 * definição tem apoio no código ou na própria ajuda da área; na dúvida, a palavra fica de fora.
 *
 * Aparece na Central (/ajuda/glossario), na aba "Palavras" do painel "?" das áreas citadas em `areas`, na busca da
 * ajuda e do ⌘K ("o que é pauta") e com o "Ouvir". Puro: conferido em scripts/conferir-ajuda.ts.
 *
 * A ordem da lista abaixo importa: a aba "Palavras" mostra seis termos e esconde o resto atrás de "Mostrar as
 * outras". Nela vêm primeiro os termos que têm a área como casa (a primeira de `areas`), depois os outros, cada grupo
 * na ordem daqui: ponha antes o que mais importa para entender a área ("Pauta" antes de "Checklist"). A página e a
 * busca usam a ordem alfabética (GLOSSARIO).
 */

export type Termo = {
  /** Âncora na Central (/ajuda/glossario#pauta). Minúsculas e hífen; não troque o de um termo que já existe. */
  id: string
  /** Como a palavra aparece na tela. */
  termo: string
  /** Uma a três frases, até 420 caracteres, com ponto final. O que é e para que serve, sem aula. */
  definicao: string
  /**
   * As áreas (href do guia) em que a palavra aparece: o painel "?" delas mostra o termo na aba "Palavras". A primeira
   * é a casa do termo: lá, ele vem antes dos que só passam pela área.
   */
  areas: string[]
  /** Outros jeitos de dizer, para a busca achar ("tag", "2FA", "ticket"). */
  termos?: string[]
  /** Ids de termos que ajudam a entender este. */
  veja?: string[]
}

/** Na ordem da aba "Palavras" (o que mais importa primeiro), e não na alfabética. */
const TERMOS: Termo[] = [
  {
    id: 'pauta',
    termo: 'Pauta',
    definicao: 'Um assunto que a equipe vai transformar em comunicação: uma ação, um evento, uma história, uma ideia. A palavra vem das redações, onde a pauta é o assunto que vai virar matéria. No Palácio Virtual, cada pauta é um cartão no quadro de Pautas e anda pelas etapas, de “Entrada” a “Pronto”.',
    areas: ['/pautas', '/dashboard', '/projetos', '/calendario', '/envios', '/cerebro'],
    termos: ['assunto', 'cartão', 'atividade', 'pauta jornalística'],
    veja: ['sala-da-pauta', 'etapas-do-quadro', 'conteudo', 'registrar-atividade'],
  },
  {
    id: 'sala-da-pauta',
    termo: 'Sala da pauta',
    definicao: 'A página de uma pauta, que abre ao tocar no cartão. Nas abas, ela guarda a conversa da equipe, a descrição e a ficha do registro, os links dos arquivos, os conteúdos, as aprovações e o histórico do que foi feito.',
    areas: ['/pautas'],
    termos: ['página da pauta', 'abrir a pauta'],
    veja: ['pauta', 'aprovadores', 'checklist'],
  },
  {
    id: 'etapas-do-quadro',
    termo: 'Etapas do quadro',
    definicao: 'As colunas do quadro de Pautas, na ordem do trabalho: “Entrada”, “Coleta”, “Produção”, “Revisão”, “Aprovação” e “Pronto”. Toda pauta registrada nasce em “Entrada” e anda quando alguém arrasta o cartão. Em “Aprovação”, ela espera os votos: aprovada, vai sozinha para “Pronto”; com ajustes pedidos, volta para “Produção”.',
    areas: ['/pautas', '/dashboard'],
    termos: ['etapas', 'colunas', 'entrada', 'coleta', 'produção', 'revisão', 'pronto', 'status da pauta'],
    veja: ['pauta', 'rodada-de-aprovacao'],
  },
  {
    id: 'registrar-atividade',
    termo: 'Registrar atividade',
    definicao: 'O formulário que cria uma pauta completa (“Nova pauta completa”): o tipo do registro (ação, evento, história, ideia, material, sugestão ou outro), o nome, a coordenação, o responsável, o prazo e os detalhes. A ficha entra no quadro de Pautas, em “Entrada”.',
    areas: ['/pautas', '/dashboard'],
    termos: ['nova pauta completa', 'ficha', 'registro', 'tipo do registro'],
    veja: ['pauta'],
  },
  {
    id: 'conteudo',
    termo: 'Conteúdo',
    definicao: 'O texto que vai ser publicado a partir de uma pauta: a matéria do site, o post, a legenda. Uma pauta pode ter vários. O conteúdo passa por “Rascunho”, “Aprovação”, “Produção” (quando pedem ajustes) e “Pronto”, e pode ser arquivado para continuar depois.',
    areas: ['/pautas', '/aprovacoes'],
    termos: ['matéria', 'peça', 'texto', 'legenda', 'post', 'rascunho'],
    veja: ['pauta', 'rodada-de-aprovacao', 'pacote'],
  },
  {
    id: 'rodada-de-aprovacao',
    termo: 'Rodada de aprovação',
    definicao: 'O pedido de aprovação de um conteúdo ou de um pacote de Publicações: as pessoas convidadas votam “Aprovar” ou “Pedir ajustes”. A rodada fica “Aprovada” quando todas aprovam; um pedido de ajustes devolve o conteúdo para a produção.',
    areas: ['/aprovacoes', '/pautas', '/dashboard', '/redes'],
    termos: ['rodada', 'aprovação', 'votação', 'voto', 'pedir ajustes', 'em aberto', 'ajustes pedidos'],
    veja: ['conferencia', 'aprovadores', 'conteudo'],
  },
  {
    id: 'aprovadores',
    termo: 'Aprovadores',
    definicao: 'As pessoas que participam de uma pauta. Elas são convidadas a votar sempre que um conteúdo da pauta vai para aprovação, menos quem criou o conteúdo, quem responde por ele e quem envia.',
    areas: ['/pautas', '/aprovacoes'],
    termos: ['participantes', 'quem vota', 'convidados'],
    veja: ['rodada-de-aprovacao', 'sala-da-pauta'],
  },
  {
    id: 'conferencia',
    termo: 'Conferência (“Antes de aprovar, confira”)',
    definicao: 'A lista do que o setor da pauta confere antes de um conteúdo sair: fatos, princípios e marca, autorização de imagem e o que for próprio do setor. “Confirmar decisão” só libera com todos os itens marcados, e o que foi conferido fica registrado junto do voto.',
    areas: ['/aprovacoes'],
    termos: ['antes de aprovar', 'lista de conferência', 'checagem', 'revisão do setor'],
    veja: ['rodada-de-aprovacao', 'setor'],
  },
  {
    id: 'setor',
    termo: 'Setor (coordenação)',
    definicao: 'Cada área de trabalho da filial, como Diretoria, Jurídico, Comunicação Social, GRD e Voluntariado. Cada pessoa tem a sua coordenação, e cada pauta tem a “Coordenação responsável”, que decide a conferência e o prazo da aprovação. Cada setor também tem um canal privado no Chat, com quem é do setor.',
    areas: ['/pautas', '/aprovacoes', '/pessoas', '/chat'],
    termos: ['coordenação', 'coordenação responsável', 'área da filial', 'departamento'],
    veja: ['conferencia', 'grd'],
  },
  {
    id: 'grd',
    termo: 'GRD',
    definicao: 'Gestão de Riscos de Desastres: o setor que prepara a filial e responde a emergências. Nas aprovações, o prazo dele é o mais curto, de 4 horas, porque cuida de alertas de emergência.',
    areas: ['/aprovacoes', '/pautas'],
    termos: ['gestão de riscos', 'desastres', 'emergência', 'defesa civil'],
    veja: ['setor'],
  },
  {
    id: 'etiqueta',
    termo: 'Etiqueta',
    definicao: 'Uma marca com nome e cor que a equipe põe nas pautas, para achar e filtrar depois. Qualquer pessoa da equipe cria etiquetas, e elas valem para todos: apagar uma tira ela de todos os cartões.',
    areas: ['/pautas'],
    termos: ['tag', 'marcador', 'cor'],
    veja: ['checklist'],
  },
  {
    id: 'checklist',
    termo: 'Checklist',
    definicao: 'A lista de tarefas de uma pauta, marcada conforme o trabalho anda: entrevistar, escolher as fotos, escrever o texto.',
    areas: ['/pautas'],
    termos: ['lista de tarefas', 'to-do'],
    veja: ['etiqueta', 'sala-da-pauta'],
  },
  {
    id: 'projeto',
    termo: 'Projeto',
    definicao: 'Uma campanha, um evento ou uma iniciativa com começo, meio e fim, que reúne várias pautas. A situação (“No prazo”, “Em risco” ou “Atrasado”) vem da última atualização publicada pela equipe: ela não muda sozinha com as datas.',
    areas: ['/projetos', '/pautas', '/dashboard'],
    termos: ['campanha', 'iniciativa', 'carteira', 'em risco', 'atrasado'],
    veja: ['pauta'],
  },
  {
    id: 'pacote',
    termo: 'Pacote',
    definicao: 'Uma notícia com todos os lugares para onde ela vai: a página no site, a newsletter e cada rede, cada uma no seu formato (Feed, Stories, Reels…). Você escreve uma vez, em “A notícia”, e cada destino recebe uma versão adaptada ao limite dele.',
    areas: ['/redes', '/registro', '/cerebro', '/aprovacoes'],
    termos: ['publicação', 'destino', 'post', 'notícia'],
    veja: ['canal', 'conteudo', 'newsletter'],
  },
  {
    id: 'canal',
    termo: 'Canal',
    definicao: 'Depende de onde aparece. No Chat, é uma conversa de grupo com nome, como #geral, para um assunto ou um setor. Nas publicações, é cada lugar para onde uma notícia vai: o site, a newsletter e cada rede social (Instagram, Facebook, LinkedIn…).',
    areas: ['/chat', '/redes', '/dashboard', '/impacto'],
    termos: ['#geral', 'rede social', 'destino', 'canal do setor'],
    veja: ['mensagem-direta', 'pacote'],
  },
  {
    id: 'mensagem-direta',
    termo: 'Mensagem direta',
    definicao: 'Uma conversa do Chat, sem nome, entre você e até 8 pessoas. Para mais gente, crie um canal.',
    areas: ['/chat', '/pessoas'],
    termos: ['DM', 'conversa privada', 'mensagem privada'],
    veja: ['canal', 'fio'],
  },
  {
    id: 'fio',
    termo: 'Fio (no Chat)',
    definicao: 'A resposta a uma mensagem específica, que fica presa a ela, sem misturar com o resto da conversa do canal.',
    areas: ['/chat'],
    termos: ['thread', 'responder em fio', 'resposta'],
    veja: ['canal'],
  },
  {
    id: 'biblioteca-de-midia',
    termo: 'Biblioteca de mídia',
    definicao: 'O material de trabalho da equipe: fotos, vídeos, áudios e documentos, com a autorização de uso de imagem de cada um. É dela que saem as mídias das publicações. Os arquivos são privados: só quem entra no Palácio Virtual vê.',
    areas: ['/biblioteca', '/redes'],
    termos: ['biblioteca', 'fotos', 'mídias', 'arquivos', 'banco de imagens'],
    veja: ['acervo', 'autorizacao-de-imagem'],
  },
  {
    id: 'acervo',
    termo: 'Acervo',
    definicao: 'A memória da filial: documentos, fotos, vídeos, recortes de imprensa e registros da história, cada um com uma ficha (o que é, de quando, de quem). Tudo entra privado; só vai para o site, em cruzvermelhariodejaneiro.org/acervo, o que alguém publica.',
    areas: ['/acervo', '/biblioteca'],
    termos: ['memória', 'arquivo histórico', 'coleção'],
    veja: ['biblioteca-de-midia'],
  },
  {
    id: 'autorizacao-de-imagem',
    termo: 'Autorização de uso de imagem',
    definicao: 'A permissão de quem aparece numa foto ou num vídeo para a filial usar a imagem. Na Biblioteca, cada arquivo diz se tem “Uso autorizado”, se “Falta autorizar” (a publicação não sai assim) ou se é “Uso interno” (material de terceiro, que serve só de referência).',
    areas: ['/biblioteca', '/redes', '/aprovacoes'],
    termos: ['autorização de imagem', 'uso de imagem', 'falta autorizar', 'uso interno', 'direito de imagem', 'uso autorizado'],
    veja: ['biblioteca-de-midia'],
  },
  {
    id: 'envio-da-equipe',
    termo: 'Envio da equipe',
    definicao: 'O que alguém da equipe manda pelo link público “Mandar uma ação”, sem login: relato, áudio, fotos, vídeos e documentos de uma ação. Quem avalia os envios transforma o material em pauta, matéria e posts.',
    areas: ['/envios'],
    termos: ['envio', 'mandar uma ação', 'relato', 'material da ação'],
    veja: ['pauta'],
  },
  {
    id: 'cerebro',
    termo: 'Cérebro',
    definicao: 'Um serviço à parte que observa uma lista fechada de contas oficiais do Rio e sugere o que pode virar pauta. Ele não publica nada: as sugestões aparecem no Radar de pautas, e a equipe decide.',
    areas: ['/cerebro'],
    termos: ['IA', 'sugestões'],
    veja: ['radar-de-pautas'],
  },
  {
    id: 'radar-de-pautas',
    termo: 'Radar de pautas',
    definicao: 'Onde aparecem as sugestões do Cérebro: o que ele leu nas contas oficiais do Rio e acha que pode virar pauta, com o plano por canal. A equipe leva a sugestão adiante, e ela vira um pacote em rascunho em Publicações, ou a recusa.',
    areas: ['/cerebro'],
    termos: ['radar', 'sugestão de pauta'],
    veja: ['cerebro', 'pauta', 'pacote'],
  },
  {
    id: 'direct',
    termo: 'Direct',
    definicao: 'As mensagens privadas do Instagram (o “Direct”). No Palácio Virtual, o “Direct das redes” junta essas mensagens e os comentários das publicações recentes, para a equipe responder sem abrir cada aplicativo.',
    areas: ['/direct'],
    termos: ['DM', 'mensagem do Instagram', 'inbox', 'comentários'],
  },
  {
    id: 'newsletter',
    termo: 'Newsletter',
    definicao: 'As notícias da filial por e-mail, para quem se inscreveu e confirmou o endereço. A lista fica em Newsletter; cada edição é escrita e enviada em Publicações, como mais um destino do pacote.',
    areas: ['/newsletter', '/redes'],
    termos: ['boletim', 'e-mail de notícias', 'inscritos'],
    veja: ['pacote'],
  },
  {
    id: 'release',
    termo: 'Release',
    definicao: 'Um texto preparado para a imprensa, contando uma notícia da filial. Ele sai por e-mail para os contatos de imprensa, numa campanha em “Imprensa e contatos”.',
    areas: ['/imprensa'],
    termos: ['comunicado à imprensa', 'press release', 'campanha de imprensa'],
  },
  {
    id: 'devolucao-de-email',
    termo: 'Devolução (de e-mail)',
    definicao: 'Quando o servidor de quem recebe recusa a mensagem em definitivo, porque o endereço não existe mais ou foi desativado. Em “Imprensa e contatos”, o contato passa a “Inválido”, ganha o aviso “Devolveu em …” e fica de fora das campanhas; na newsletter, o endereço sai da lista de envio.',
    areas: ['/imprensa', '/newsletter'],
    termos: ['devolvido', 'bounce', 'e-mail voltou', 'endereço inválido', 'supressão'],
    veja: ['release'],
  },
  {
    id: 'oficio',
    termo: 'Ofício',
    definicao: 'Um documento oficial da filial. Você escreve, escolhe quem assina e emite: na emissão, ele ganha o número do ano (001/2026, 002/2026…) e o texto congela. A numeração recomeça a cada ano, e quem recebe o ofício confere a autenticidade numa página pública.',
    areas: ['/oficios'],
    termos: ['documento oficial', 'carta oficial', 'numeração', 'assinatura'],
    veja: ['trilha-publica'],
  },
  {
    id: 'chamado',
    termo: 'Chamado',
    definicao: 'Um pedido de um setor para outro, como TI, Manutenção ou Jurídico. Você abre, conversa com quem atende e confirma a solução. Cada chamado tem prioridade e dois prazos, o da 1ª resposta e o da solução, contados em horário de atendimento.',
    areas: ['/chamados'],
    termos: ['ticket', 'solicitação', 'suporte', 'pedido de ajuda'],
    veja: ['fila'],
  },
  {
    id: 'fila',
    termo: 'Fila (de chamados)',
    definicao: 'O grupo que atende um tipo de chamado (TI, Manutenção, Comunicação…), com a equipe, os assuntos e os prazos dele. Quem é da equipe de uma fila atende os chamados dela; administradores atendem todas.',
    areas: ['/chamados'],
    termos: ['equipe de atendimento', 'assunto do chamado'],
    veja: ['chamado'],
  },
  {
    id: 'pedido-de-compra',
    termo: 'Pedido de compra (PC) e ordem de compra (OC)',
    definicao: 'O pedido (PC-…) é o que o setor pede. A ordem de compra (OC-…) é o documento formal ao fornecedor, emitido só depois da aprovação, com numeração própria e o CNPJ para a nota fiscal.',
    areas: ['/financeiro/compras'],
    termos: ['pedido de compra', 'ordem de compra', 'PC', 'OC', 'compra', 'nota fiscal', 'fornecedor'],
    veja: ['cotacao'],
  },
  {
    id: 'cotacao',
    termo: 'Cotação',
    definicao: 'As propostas dos fornecedores para um pedido de compra, lado a lado, para escolher a melhor. Quantas propostas são precisas, e quem aprova, depende do valor da compra.',
    areas: ['/financeiro/compras'],
    termos: ['proposta', 'orçamento', 'fornecedor'],
    veja: ['pedido-de-compra'],
  },
  {
    id: 'lancamento',
    termo: 'Lançamento',
    definicao: 'Cada registro de dinheiro no Financeiro: uma despesa, uma receita, uma conta a pagar ou a receber, com a fonte do recurso, a categoria e os comprovantes.',
    areas: ['/financeiro', '/escola/financeiro'],
    termos: ['despesa', 'receita', 'conta a pagar', 'conta a receber'],
    veja: ['fonte', 'competencia', 'livros'],
  },
  {
    id: 'fonte',
    termo: 'Fonte de recursos',
    definicao: 'De onde vem o dinheiro de cada lançamento. A fonte “com destino” (um convênio, um termo de fomento, uma doação carimbada) só pode pagar aquilo para que foi dada; a fonte “Livre” paga qualquer despesa. Na “Saúde do caixa”, o “Caixa livre hoje” aparece à parte do que tem destino.',
    areas: ['/financeiro', '/financeiro/compras', '/escola/financeiro'],
    termos: ['fonte', 'fonte com destino', 'livre', 'caixa livre', 'verba', 'convênio', 'termo de fomento'],
    veja: ['lancamento'],
  },
  {
    id: 'competencia',
    termo: 'Competência',
    definicao: 'O mês a que uma conta se refere, mesmo paga em outro: a luz de agosto, paga em setembro, é de agosto. Não é o vencimento (quando a conta tem de ser paga) nem a data de pagamento (quando o dinheiro saiu de fato).',
    areas: ['/financeiro', '/escola/financeiro'],
    termos: ['vencimento', 'data de pagamento', 'regime de competência', 'regime de caixa'],
    veja: ['lancamento', 'fechamento-do-mes'],
  },
  {
    id: 'conciliacao',
    termo: 'Conciliação bancária',
    definicao: 'Conferir o extrato do banco com os lançamentos do Palácio Virtual, linha a linha. Cada linha conciliada fica ligada a um lançamento, que passa a valer com a data e o valor do banco.',
    areas: ['/financeiro', '/escola/financeiro'],
    termos: ['conciliação', 'conciliar', 'extrato', 'banco'],
    veja: ['lancamento', 'fechamento-do-mes'],
  },
  {
    id: 'fechamento-do-mes',
    termo: 'Fechamento do mês',
    definicao: 'Quando a gestão do Financeiro confere um mês e o fecha para o contador. Os meses fecham em ordem, e o mês fechado não muda: movimento de estoque e doação precisam de uma data de mês aberto, e a venda da Escola que chega depois entra no primeiro dia ainda aberto. Só a gestão reabre o último mês fechado, escrevendo o motivo.',
    areas: ['/financeiro', '/escola/financeiro', '/patrimonio'],
    termos: ['fechamento', 'mês fechado', 'fechar o mês', 'reabrir o mês', 'contador'],
    veja: ['conciliacao', 'competencia'],
  },
  {
    id: 'livros',
    termo: 'Livros (da filial e da Escola)',
    definicao: 'A filial e a Escola de Educação e Saúde são empresas separadas no Financeiro, cada uma com o seu livro: contas, lançamentos, conciliação e fechamento próprios. Os livros da Escola ficam no grupo Escola, com a faixa azul no alto.',
    areas: ['/financeiro', '/escola/financeiro', '/escola'],
    termos: ['entidade', 'empresa', 'CNPJ', 'faixa azul'],
    veja: ['lancamento'],
  },
  {
    id: 'unicopag',
    termo: 'Únicopag',
    definicao: 'A plataforma de pagamentos por onde a Escola de Educação e Saúde recebe inscrições e cursos. O Palácio Virtual só lê as vendas de lá, sem criar cobrança nem estornar, e as vendas pagas entram sozinhas como receita no Financeiro da escola.',
    areas: ['/escola', '/escola/vendas', '/escola/financeiro', '/escola/configuracoes'],
    termos: ['pagamento', 'checkout', 'vendas da escola', 'cobrança'],
    veja: ['estorno', 'livros'],
  },
  {
    id: 'estorno',
    termo: 'Estorno e contestação',
    definicao: 'Nas vendas da Escola, “Estornado” é a venda cujo dinheiro foi devolvido a quem pagou. “Em disputa” é a venda paga em que o titular do cartão abriu uma contestação: ainda conta como recebida. “Contestado” é a contestação confirmada (chargeback), com o valor de volta ao titular. O estorno entra sozinho como despesa no Financeiro da escola.',
    areas: ['/escola/vendas', '/escola/financeiro'],
    termos: ['estorno', 'contestação', 'estornado', 'contestado', 'em disputa', 'chargeback', 'devolução', 'reembolso'],
    veja: ['unicopag'],
  },
  {
    id: 'utm',
    termo: 'UTM',
    definicao: 'As marcas no fim do link de um anúncio que dizem de onde a pessoa veio (utm_source) e de qual campanha (utm_campaign). É por elas que a venda da Escola é ligada à campanha do marketing; os links com UTM se montam na página de cada campanha.',
    areas: ['/escola/marketing', '/escola/vendas', '/escola/marketing/advertoriais'],
    termos: ['utm_campaign', 'utm_source', 'origem da venda', 'link de campanha', 'rastreamento'],
    veja: ['ctr', 'advertorial'],
  },
  {
    id: 'ctr',
    termo: 'CTR',
    definicao: 'A taxa de cliques de uma peça: os cliques divididos pelas impressões, ou seja, de cada 100 vezes que o anúncio apareceu, quantas viraram clique.',
    areas: ['/escola/marketing'],
    termos: ['taxa de cliques', 'impressões', 'cliques'],
    veja: ['utm'],
  },
  {
    id: 'advertorial',
    termo: 'Advertorial',
    definicao: 'Uma matéria-anúncio da Escola: um texto com cara de notícia, publicado no site, que conta uma história e termina no botão de matrícula. Quem chega pelo anúncio lê a matéria e segue para a inscrição.',
    areas: ['/escola/marketing/advertoriais', '/escola/marketing'],
    termos: ['matéria-anúncio', 'publieditorial', 'conteúdo patrocinado'],
    veja: ['utm'],
  },
  {
    id: 'plaqueta',
    termo: 'Plaqueta',
    definicao: 'O número de patrimônio de um bem da filial, como CVRJ-00001, dado quando o bem é cadastrado. Ele sai numa etiqueta com QR, que se imprime e cola no bem: ler o QR com o celular abre a página do bem no Palácio Virtual.',
    areas: ['/patrimonio'],
    termos: ['número de patrimônio', 'etiqueta do bem', 'QR do bem', 'tombamento'],
    veja: ['termo-de-responsabilidade', 'inventario', 'baixa'],
  },
  {
    id: 'termo-de-responsabilidade',
    termo: 'Termo de responsabilidade',
    definicao: 'O documento que a pessoa aceita ao receber um bem da filial: a partir dele, ela responde pelo bem. Até aceitar, o bem fica com “termo pendente”; quem é da equipe aceita em “Comigo”, e quem é voluntário, na Área do Voluntário.',
    areas: ['/patrimonio'],
    termos: ['termo pendente', 'responsável pelo bem', 'entrega de bem'],
    veja: ['plaqueta'],
  },
  {
    id: 'inventario',
    termo: 'Inventário',
    definicao: 'Conferir, bem a bem, que tudo está onde o Palácio Virtual diz: com o inventário aberto, lê-se o QR de cada bem e marca-se “Está aqui”. Ao concluir, o que não foi conferido fica como não encontrado.',
    areas: ['/patrimonio'],
    termos: ['contagem', 'conferência dos bens', 'inventário físico'],
    veja: ['plaqueta'],
  },
  {
    id: 'baixa',
    termo: 'Baixa (de um bem)',
    definicao: 'Tirar um bem do patrimônio de vez, com destino, motivo e data. Só a gestão dá baixa, e ela não se desfaz: o bem sai do patrimônio e fica no histórico, com o motivo. Em furto ou perda, guarde o boletim de ocorrência.',
    areas: ['/patrimonio'],
    termos: ['dar baixa', 'descarte', 'perda', 'furto', 'doação do bem'],
    veja: ['plaqueta'],
  },
  {
    id: 'oportunidade',
    termo: 'Oportunidade',
    definicao: 'Uma vaga numa atividade para voluntários, como uma ação ou um evento, publicada na Área do Voluntário. Quando as vagas acabam, quem se inscreve vai para a lista de espera e sobe, por ordem de chegada, se abrir vaga.',
    areas: ['/voluntariado'],
    termos: ['vaga', 'lista de espera', 'atividade'],
    veja: ['area-do-voluntario'],
  },
  {
    id: 'area-do-voluntario',
    termo: 'Área do Voluntário',
    definicao: 'A parte do Palácio Virtual para quem é voluntário. Lá a pessoa vê os avisos, as oportunidades, os cursos, as horas e os certificados dela e escreve para a coordenação. Quem cuida do que aparece lá é a coordenação, em Voluntários.',
    areas: ['/voluntariado', '/voluntariado/mensagens'],
    termos: ['portal do voluntário', 'membro', 'voluntário'],
    veja: ['oportunidade'],
  },
  {
    id: 'lgpd',
    termo: 'LGPD',
    definicao: 'A Lei Geral de Proteção de Dados Pessoais. No Palácio Virtual, CPF, saúde e documentos só abrem para quem tem o nível de acesso certo; em Recursos humanos, cada abertura de documento fica registrada com o nome de quem abriu; e, a pedido da pessoa, os dados dela são apagados (no Voluntariado, “Apagar dados (LGPD)”).',
    areas: ['/voluntariado', '/equipe', '/newsletter', '/biblioteca', '/portaria'],
    termos: ['dados pessoais', 'dados sensíveis', 'proteção de dados', 'titular', 'privacidade'],
  },
  {
    id: 'trilha-publica',
    termo: 'Trilha pública',
    definicao: 'O registro verificável do que a filial publica e emite: matérias, ofícios assinados, certificados, documentos da transparência e a lista de canais oficiais. Cada item ganha um código e uma impressão digital, e todo dia um lote é registrado no Bitcoin, para qualquer pessoa conferir sem depender do Palácio Virtual.',
    areas: ['/trilha-publica', '/oficios', '/transparencia', '/canais-oficiais'],
    termos: ['auditoria', 'Bitcoin', 'hash', 'verificação', 'autenticidade', 'impressão digital'],
    veja: ['oficio', 'canais-oficiais'],
  },
  {
    id: 'canais-oficiais',
    termo: 'Canais oficiais',
    definicao: 'A lista pública dos endereços, telefones e perfis que são mesmo da filial. É por ela que alguém confere se uma mensagem em nome da Cruz Vermelha é verdadeira.',
    areas: ['/canais-oficiais'],
    termos: ['perfis oficiais', 'golpe', 'mensagem falsa', 'contatos oficiais'],
    veja: ['trilha-publica'],
  },
  {
    id: 'papel',
    termo: 'Papel',
    definicao: 'O que a pessoa pode fazer no Palácio Virtual. “Administrador” controla tudo: pessoas, acessos, integrações, site e dados. “Editor” toca a produção, publica e dispara campanhas. “Colaborador” registra, escreve, comenta e vota quando é convidado. “Equipe da escola” vê só a Escola de Educação e Saúde. Quem dá e muda o papel é a administração.',
    areas: ['/usuarios', '/perfil', '/pessoas'],
    termos: ['administrador', 'editor', 'colaborador', 'equipe da escola', 'permissão', 'perfil de acesso'],
  },
  {
    id: 'email-de-recuperacao',
    termo: 'E-mail de recuperação',
    definicao: 'O seu e-mail, para onde vão o link de “Esqueci minha senha”, os avisos de segurança da conta e os e-mails de notificação que você escolher. Enquanto ele não está confirmado, nada disso tem para onde ir.',
    areas: ['/perfil', '/usuarios'],
    termos: ['esqueci minha senha', 'recuperar senha', 'confirmar e-mail'],
    veja: ['verificacao-em-duas-etapas'],
  },
  {
    id: 'verificacao-em-duas-etapas',
    termo: 'Verificação em duas etapas',
    definicao: 'Uma segurança a mais na entrada: além da senha, um código do aplicativo autenticador do celular. Um administrador pode torná-la obrigatória para alguns papéis; para os outros é opcional, mas quem cadastrou o app passa a digitar o código sempre.',
    areas: ['/perfil', '/usuarios'],
    termos: ['2FA', 'código', 'app autenticador', 'autenticação em dois fatores'],
    veja: ['email-de-recuperacao', 'papel'],
  },
  {
    id: 'arquivar',
    termo: 'Arquivar',
    definicao: 'Tirar algo da lista sem apagar. A pauta arquivada sai do quadro, mas guarda tudo e volta com “Restaurar”. Excluir, ao contrário, apaga sem volta.',
    areas: ['/pautas', '/redes', '/envios'],
    termos: ['arquivada', 'restaurar', 'excluir', 'apagar'],
    veja: ['pauta'],
  },
  {
    id: 'tour',
    termo: 'Tour',
    definicao: 'Um passeio pela tela, em balões que apontam cada parte e dizem para que ela serve. Cada tela com tour oferece o dela na primeira visita, e dá para ver de novo pelo botão “?”, no alto de qualquer tela.',
    areas: [],
    termos: ['passeio', 'balões', 'visita guiada', 'ajuda'],
  },
]

/** Para ordenar e comparar sem acento nem caixa ("Únicopag" fica no U). */
export const chaveDoTermo = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const GLOSSARIO: Termo[] = [...TERMOS].sort((a, b) => chaveDoTermo(a.termo).localeCompare(chaveDoTermo(b.termo), 'pt-BR'))

export function termoDoGlossario(id: string): Termo | null {
  return GLOSSARIO.find((t) => t.id === id) ?? null
}

/** Os termos que aparecem numa área, para a aba "Palavras" do painel "?". O link de um termo: hrefDoGlossario (indice.ts). */
export function termosDaArea(href: string): Termo[] {
  const daqui = TERMOS.filter((t) => t.areas.includes(href))
  return [...daqui.filter((t) => t.areas[0] === href), ...daqui.filter((t) => t.areas[0] !== href)]
}

/** A letra do índice da página: a primeira, sem acento. */
export const letraDoTermo = (t: Termo) => chaveDoTermo(t.termo).charAt(0).toUpperCase()
