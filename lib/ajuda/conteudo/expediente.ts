import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do expediente da filial, no grupo Institucional do menu: Ofícios
 * (/oficios, com /oficios/[id]), Chamados (/chamados, com /chamados/novo,
 * /chamados/[id] e /chamados/configurar) e Pedidos de compra
 * (/financeiro/compras, com /novo, /[id] e /[id]/editar).
 *
 * Cada frase tem apoio no código:
 * - Ofícios: app/(app)/oficios, components/app/oficios/** (editor, painel,
 *   documento), app/actions/oficios.ts, lib/oficios/documento.ts e
 *   lib/oficios/pdf.ts, a página pública app/verificar/[codigo] e as funções
 *   emitir/assinar/recusar/cancelar das migrações *_cvrj_oficios*.sql;
 * - Chamados: app/(app)/chamados, components/app/chamados/**,
 *   app/actions/chamados.ts, lib/chamados/regras.ts e servidor.ts,
 *   app/api/chamados/rotina e docs/CHAMADOS.md;
 * - Pedidos de compra: app/(app)/financeiro/compras,
 *   components/app/financeiro/compras/**, app/actions/compras.ts,
 *   lib/compras/regras.ts e servidor.ts e as funções compras_* das migrações
 *   *_cvrj_compras*.sql.
 * Quem pode o quê: lib/permissoes.ts (oficios.gerenciar_de_outros,
 * chamados.configurar, chamados.ver_todos) e os níveis do Financeiro em
 * lib/financeiro/regras.ts.
 *
 * Os alvos `oficios.*`, `chamados.*` e `compras.*` são marcados com
 * `data-ajuda` nessas telas. Mudou a tela ou a regra, muda aqui no mesmo PR
 * (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Ofícios

const OFICIOS: GuiaDaArea = {
  href: '/oficios',
  paraQueServe: 'O livro de ofícios da filial. Você escreve o ofício, escolhe quem assina e emite: na emissão ele ganha o número do ano e o texto congela. Depois de todas as assinaturas, a prova vai ao Bitcoin, e quem recebe o documento confere tudo numa página pública.',
  quemUsa: 'Toda a equipe do Palácio Virtual vê o livro e pode criar ofícios. Editar, emitir, apagar o rascunho e cancelar é de quem criou o ofício ou de um administrador; assinar é de quem foi escolhido na emissão.',
  tour: [
    {
      titulo: 'O livro de ofícios',
      texto: 'Todos os ofícios da filial, numerados por ano. Emitido não se apaga: cancelado continua na lista, com o número que usou e o motivo.',
    },
    {
      alvo: 'oficios.novo',
      titulo: 'Escrever um ofício',
      texto: 'O botão “Novo ofício” abre um rascunho em branco. Ele só ganha número na emissão, quando o texto é congelado para assinatura.',
      lado: 'bottom',
    },
    {
      alvo: 'oficios.esperando',
      titulo: 'Esperando a sua assinatura',
      texto: 'Quando alguém pede a sua assinatura, o ofício aparece neste quadro, com “Assinar →”.',
      seAusente: 'pular',
    },
    {
      alvo: 'oficios.filtros',
      titulo: 'Filtrar e buscar',
      texto: 'Veja só um estado (“Rascunho”, “Em assinatura”, “Assinado”, “Cancelado”) ou busque por número, assunto ou destinatário.',
      lado: 'bottom',
    },
    {
      alvo: 'oficios.lista',
      titulo: 'A lista',
      texto: 'Cada linha traz o número, o assunto, o estado, quantas pessoas já assinaram e o registro no Bitcoin. Tocar no número ou no assunto abre o ofício.',
    },
  ],
  telas: [
    {
      caminho: '/oficios/[id]',
      rotulo: 'Ofício',
      tour: [
        {
          titulo: 'Um ofício',
          texto: 'Enquanto é rascunho, você escreve e vê a folha como vai sair. Depois de emitido, o texto fica congelado, e o painel do ofício mostra as assinaturas e a prova.',
        },
        {
          alvo: 'oficios.formulario',
          titulo: 'O rascunho',
          texto: 'Preencha origem, destinatário e texto; a folha mostra como vai sair (em telas menores, na aba “Pré-visualizar”). O rascunho salva sozinho logo depois que você para de digitar.',
          seAusente: 'pular',
        },
        {
          alvo: 'oficios.emitir',
          titulo: 'Emitir para assinatura',
          texto: 'O botão “Emitir para assinatura” pede quem assina e como (senha do Palácio Virtual ou gov.br). Na emissão o ofício ganha o número do ano e o texto congela.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'oficios.assinar',
          titulo: 'A sua assinatura',
          texto: 'Quando o ofício espera a sua assinatura, este cartão mostra como assinar: com a sua senha, em “Assinar”, ou pelo gov.br, baixando o PDF, assinando lá e enviando o arquivo de volta.',
          seAusente: 'pular',
        },
        {
          alvo: 'oficios.assinaturas',
          titulo: 'Quem assina',
          texto: 'A lista segue a ordem da folha e mostra quem já assinou, quem recusou e quem ainda falta.',
          seAusente: 'pular',
        },
        {
          alvo: 'oficios.integridade',
          titulo: 'PDF e conferência',
          texto: 'O quadro “Integridade” traz o código que identifica o texto assinado, “Baixar PDF do ofício” e a página pública de conferência, que também serve para imprimir.',
          seAusente: 'pular',
        },
        {
          alvo: 'oficios.bitcoin',
          titulo: 'Registro no Bitcoin',
          texto: 'Quando todos assinam, só o código do manifesto vai ao Bitcoin, sem texto nem nomes. O selo mostra “Na fila”, “Aguardando bloco” ou “Confirmado”.',
          seAusente: 'pular',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'escrever-oficio',
      titulo: 'Escrever um ofício',
      passos: [
        'Em “Ofícios”, toque em “Novo ofício”.',
        'Em “Origem”, preencha o “Setor” e confira o “Local”.',
        'Em “Destinatário”, preencha o “Nome” ou o “Órgão ou empresa” (um dos dois é obrigatório); “Cargo” e “Endereço” são opcionais.',
        'Em “Texto”, escreva o “Assunto” e o “Corpo”, deixando uma linha em branco entre os parágrafos. Confira o “Vocativo” e o “Fecho”.',
        'Confira a folha ao lado. Em telas menores, ela fica na aba “Pré-visualizar”.',
        'Espere aparecer “Rascunho salvo às…”: o rascunho salva sozinho.',
      ],
      dica: 'O “Vocativo” já vem com “Prezado(a) Senhor(a),”, o “Local” vazio vira “Rio de Janeiro” e o “Fecho” vazio vira “Atenciosamente,”. No “Corpo”, linhas que começam com “-”, “•”, “1)” ou “a)” viram itens de lista.',
    },
    {
      id: 'emitir-oficio',
      titulo: 'Emitir um ofício para assinatura',
      quem: 'Quem criou o rascunho, ou um administrador',
      passos: [
        'Abra o rascunho e toque em “Emitir para assinatura”.',
        'Em “Como vão assinar”, escolha “Senha do Palácio Virtual” ou “Assinatura gov.br”.',
        'Em “Adicionar pessoa”, escolha quem assina, até 10 pessoas. A ordem da lista é a ordem dos nomes na folha; use as setas para mudar e “Tirar” para remover.',
        'Confira o cargo de cada pessoa: é o que sai embaixo da assinatura.',
        'Toque em “Emitir e enviar para assinatura”. Quem assina recebe um aviso.',
      ],
      dica: 'Confira o texto antes: depois da emissão ele não muda mais. Para corrigir, só cancelando e fazendo outro com “Duplicar como rascunho”.',
    },
    {
      id: 'assinar-com-senha',
      titulo: 'Assinar um ofício com a senha',
      passos: [
        'Abra o ofício pelo aviso, ou pelo quadro “Esperando a sua assinatura” em “Ofícios”.',
        'Leia a folha inteira.',
        'Toque em “Assinar”.',
        'Marque “Li o ofício e concordo com o texto identificado pelo código acima.”',
        'Digite “Sua senha do Palácio Virtual” e toque em “Assinar”.',
      ],
      dica: 'A assinatura fica registrada com data, hora, o código do documento e o seu acesso.',
    },
    {
      id: 'assinar-no-govbr',
      titulo: 'Assinar um ofício pelo gov.br',
      passos: [
        'Abra o ofício. O cartão “Este ofício espera a sua assinatura gov.br.” mostra três passos.',
        'Toque em “Baixar PDF para assinar”.',
        'Toque em “Abrir o assinador gov.br” e assine o PDF com a sua conta gov.br (prata ou ouro). Não edite nem salve o PDF por outro programa.',
        'De volta ao ofício, escolha o arquivo assinado e toque em “Enviar PDF assinado”.',
      ],
      dica: 'O Palácio Virtual confere se o PDF é este ofício, se a assinatura está íntegra e se o certificado está no seu nome. Se outra pessoa assinou enquanto isso, baixe o PDF de novo e assine outra vez.',
    },
    {
      id: 'recusar-assinatura',
      titulo: 'Recusar a assinatura',
      passos: [
        'Abra o ofício e, no cartão da sua assinatura, toque em “Recusar”.',
        'Em “Motivo”, explique por que não vai assinar.',
        'Toque em “Recusar e cancelar”.',
      ],
      dica: 'Recusar cancela o ofício: o número fica registrado como cancelado, e quem criou recebe o aviso com o seu motivo. O botão “Recusar” só aparece nos ofícios assinados com a senha do Palácio Virtual; no gov.br, peça a quem criou o ofício que o cancele.',
    },
    {
      id: 'baixar-pdf',
      titulo: 'Baixar o PDF do ofício',
      passos: [
        'Abra o ofício emitido.',
        'No quadro “Integridade”, toque em “Baixar PDF do ofício” (no gov.br, com assinaturas, “Baixar PDF assinado”).',
        'Para imprimir, abra a “Página pública de conferência (e versão para imprimir)” e use “Imprimir ou salvar em PDF”.',
      ],
      dica: 'O rodapé do PDF traz o endereço onde quem recebe o ofício confere a autenticidade.',
    },
    {
      id: 'cancelar-oficio',
      titulo: 'Cancelar um ofício emitido',
      quem: 'Quem criou o ofício, ou um administrador',
      passos: [
        'Abra o ofício e toque em “Cancelar ofício”.',
        'Em “Motivo”, escreva por que está cancelando.',
        'Toque em “Cancelar ofício” na janela para confirmar.',
      ],
      dica: 'O ofício continua guardado, com o número, as assinaturas e o motivo. Quem assina recebe o aviso.',
    },
    {
      id: 'duplicar-oficio',
      titulo: 'Refazer um ofício a partir de outro',
      passos: [
        'Abra o ofício que vai servir de base (por exemplo, um cancelado).',
        'Toque em “Duplicar como rascunho”.',
        'Um rascunho novo abre com o mesmo texto. Corrija e emita de novo.',
      ],
      dica: 'O rascunho novo é seu e recebe outro número quando for emitido.',
    },
    {
      id: 'apagar-rascunho',
      titulo: 'Apagar um rascunho',
      quem: 'Quem criou o rascunho, ou um administrador',
      passos: [
        'Em “Ofícios”, use o filtro “Rascunho” e abra o rascunho.',
        'Toque em “Apagar”.',
        'Confirme em “Apagar rascunho”.',
      ],
      dica: 'Só rascunho se apaga: ele ainda não tem número e não deixa rastro no livro de ofícios.',
    },
  ],
  perguntas: [
    {
      id: 'quando-ganha-numero',
      pergunta: 'Quando o ofício ganha número?',
      resposta: 'Na emissão. O rascunho fica “sem número”; ao tocar em “Emitir e enviar para assinatura”, o ofício recebe o próximo número do ano (001/2026, 002/2026…) e o texto congela. A numeração recomeça a cada ano.',
      termos: ['numeração', 'número do ofício', 'sequência', 'sem número'],
    },
    {
      id: 'estados-do-oficio',
      pergunta: 'O que significa cada estado?',
      resposta: '“Rascunho”: ainda sem número, dá para editar. “Em assinatura”: emitido, com o texto congelado, esperando as assinaturas. “Assinado”: todas as pessoas assinaram. “Cancelado”: alguém cancelou ou recusou assinar; o número continua registrado, com o motivo.',
      termos: ['status', 'situação', 'em assinatura'],
    },
    {
      id: 'corrigir-emitido',
      pergunta: 'Dá para corrigir um ofício depois de emitido?',
      resposta: 'Não. Depois da emissão o texto fica congelado: é ele que as pessoas assinam, e qualquer mudança alteraria o código do documento. Para corrigir, cancele com o motivo e use “Duplicar como rascunho” para fazer um novo.',
      termos: ['editar', 'alterar', 'erro', 'mudar texto', 'Ofício emitido não pode ser alterado'],
    },
    {
      id: 'trocar-quem-assina',
      pergunta: 'Dá para trocar quem assina depois de emitir?',
      resposta: 'Não. Quem assina, a ordem e os cargos entram no texto congelado na emissão, e não há como mudar a lista depois. Para mudar, cancele o ofício com o motivo e use “Duplicar como rascunho” para emitir de novo com as pessoas certas.',
      termos: ['assinante', 'incluir pessoa', 'tirar pessoa', 'trocar assinante', 'cargo errado'],
    },
    {
      id: 'apagar-emitido',
      pergunta: 'Por que não consigo apagar um ofício?',
      resposta: 'Só rascunho se apaga. Ofício emitido fica guardado, com o número que usou; se ele não vale mais, cancele com um motivo. Cancelado continua na lista, e a página de conferência mostra que foi cancelado.',
      termos: ['excluir', 'deletar', 'remover', 'Ofício emitido não se apaga'],
    },
    {
      id: 'rascunho-travado',
      pergunta: 'Por que não consigo editar este rascunho?',
      resposta: 'Só quem criou o rascunho, ou um administrador, pode editá-lo, apagá-lo e emiti-lo. Os outros veem o rascunho com os campos travados.',
      termos: ['campos bloqueados', 'Só quem criou este rascunho'],
    },
    {
      id: 'emitir-desligado',
      pergunta: 'Por que o botão “Emitir e enviar para assinatura” não funciona?',
      resposta: 'Ele fica desligado até o ofício ter assunto, texto e destinatário (nome ou órgão) e até você escolher ao menos uma pessoa para assinar. O aviso na janela diz o que falta preencher.',
      termos: ['não emite', 'botão cinza', 'Antes de emitir, preencha'],
    },
    {
      id: 'senha-ou-govbr',
      pergunta: 'Qual a diferença entre “Senha do Palácio Virtual” e “Assinatura gov.br”?',
      resposta: 'Com a senha, cada pessoa confirma aqui mesmo, com a própria senha: é o mais rápido. Com o gov.br, cada pessoa baixa o PDF, assina no gov.br (conta prata ou ouro) e envia de volta; é a assinatura avançada do governo, que qualquer pessoa confere no validar.iti.gov.br.\n\nA escolha é feita na emissão e vale para todas as pessoas daquele ofício.',
      termos: ['assinatura eletrônica', 'certificado', 'icp-brasil', 'assinador'],
    },
    {
      id: 'qual-senha',
      pergunta: 'Qual senha eu uso para assinar?',
      resposta: 'A mesma com que você entra no Palácio Virtual. Se errar, aparece “Senha incorreta. A assinatura não foi registrada.” e nada muda.',
      termos: ['senha incorreta', 'senha errada'],
    },
    {
      id: 'ordem-de-assinatura',
      pergunta: 'As pessoas precisam assinar na ordem?',
      resposta: 'Não. A ordem escolhida na emissão é a ordem dos nomes na folha; cada pessoa assina quando puder. No gov.br, cada uma assina o PDF que já tem as assinaturas anteriores, por isso baixe o PDF na hora de assinar.',
      termos: ['sequência', 'quem assina primeiro'],
    },
    {
      id: 'aviso-de-assinatura',
      pergunta: 'Como fico sabendo que tenho um ofício para assinar?',
      resposta: 'Chega um aviso no sino (e por e-mail, conforme as suas preferências de notificação), e o ofício aparece em “Esperando a sua assinatura”, no alto de “Ofícios”.',
      termos: ['notificação', 'e-mail', 'pendente'],
    },
    {
      id: 'alguem-recusou',
      pergunta: 'Alguém recusou assinar. E agora?',
      resposta: 'A recusa cancela o ofício, com o motivo de quem recusou, e quem criou recebe o aviso. Para refazer, abra o ofício e use “Duplicar como rascunho”: o texto vem para um rascunho novo, que ganha outro número na emissão.',
      termos: ['recusa', 'recusado', 'refazer'],
    },
    {
      id: 'registro-no-bitcoin',
      pergunta: 'O que é o registro no Bitcoin?',
      resposta: 'Quando a última pessoa assina, o Palácio Virtual monta o manifesto (o código do documento, quem assinou e quando) e registra o código desse manifesto no Bitcoin, pelo OpenTimestamps. Nenhum texto ou nome vai para lá. A prova (“Prova .ots”) vale por si, mesmo sem o Palácio Virtual no ar.',
      termos: ['blockchain', 'carimbo', 'opentimestamps', 'ots', 'manifesto'],
    },
    {
      id: 'selo-do-bitcoin',
      pergunta: 'O que querem dizer “Na fila”, “Aguardando bloco” e “Confirmado”?',
      resposta: '“Na fila”: o registro ainda vai ser enviado aos calendários do OpenTimestamps. “Aguardando bloco”: já foi enviado e espera entrar num bloco do Bitcoin, o que leva algumas horas. “Confirmado”: está gravado num bloco.\n\nO Palácio Virtual confere sozinho; “Verificar agora” força uma conferência, no máximo a cada 2 minutos.',
      termos: ['verificar agora', 'Verificado há pouco', 'carimbo pendente'],
    },
    {
      id: 'conferir-autenticidade',
      pergunta: 'Como quem recebe o ofício confere se ele é verdadeiro?',
      resposta: 'O rodapé do PDF traz o endereço da página pública de conferência. Ela mostra o texto como foi assinado, quem assinou e quando, e se o ofício foi cancelado. Lá também dá para recalcular os códigos no próprio navegador e baixar o manifesto e a prova.',
      termos: ['autenticidade', 'validar', 'verificar', 'página pública', 'falsificação'],
    },
    {
      id: 'quem-ve-oficios',
      pergunta: 'Quem vê os ofícios?',
      resposta: 'Toda a equipe do Palácio Virtual vê o livro de ofícios, inclusive os rascunhos. Fora do Palácio Virtual, só quem tem o endereço de conferência de um ofício emitido vê aquele ofício.',
      termos: ['privacidade', 'acesso', 'visibilidade'],
    },
  ],
  relacionadas: ['/correio'],
}

// ---------------------------------------------------------------- Chamados

const CHAMADOS: GuiaDaArea = {
  href: '/chamados',
  paraQueServe: 'Pedidos entre setores da filial: TI, Manutenção e outras equipes. Você abre o chamado, conversa com quem atende e confirma a solução. Cada chamado tem prioridade e prazos de resposta e de solução, e tudo fica registrado na linha do tempo.',
  quemUsa: 'Todo mundo abre chamados e acompanha os seus. Quem faz parte da equipe de uma fila atende os chamados dela; administradores atendem todas as filas e configuram filas, equipes, assuntos e prazos.',
  tour: [
    {
      titulo: 'Chamados',
      texto: 'Pedidos para TI, Manutenção e outras equipes. Você abre, acompanha a conversa e avalia o atendimento, tudo por aqui.',
    },
    {
      alvo: 'chamados.abrir',
      titulo: 'Abrir um chamado',
      texto: 'O botão “Abrir chamado” leva ao formulário: você escolhe a equipe e o assunto, descreve o problema e diz quanto ele atrapalha.',
      lado: 'bottom',
    },
    {
      alvo: 'chamados.abas',
      titulo: 'As abas',
      texto: '“Meus chamados” mostra o que você abriu. Quem atende uma fila também vê “Atendimento” e “Indicadores”.',
      lado: 'bottom',
    },
    {
      alvo: 'chamados.filtros',
      titulo: 'Filtros do atendimento',
      texto: 'Filtre por fila, situação e responsável. Os atrasados vêm primeiro, depois a prioridade e o mais antigo.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'chamados.lista',
      titulo: 'Os chamados',
      texto: 'Cada linha traz o código (como TI-0042), o título, a prioridade, o prazo e o status. Tocar na linha abre o chamado.',
      seAusente: 'pular',
    },
    {
      alvo: 'chamados.configurar',
      titulo: 'Configurar',
      texto: 'O botão “Configurar” cuida das filas, de quem atende cada uma, do catálogo de assuntos e dos prazos. Só administradores veem.',
      lado: 'bottom',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/chamados/novo',
      rotulo: 'Abrir chamado',
      tour: [
        {
          titulo: 'Abrir um chamado',
          texto: 'Escolha a equipe e o assunto, descreva o problema e diga quanto ele atrapalha. A equipe da fila é avisada assim que você abre.',
        },
        {
          alvo: 'chamados.equipes',
          titulo: 'A equipe',
          texto: 'Primeiro, para quem é o pedido: TI, Manutenção ou outra fila. Cada cartão diz o que aquela equipe atende.',
          seAusente: 'pular',
        },
        {
          alvo: 'chamados.assunto',
          titulo: 'O assunto',
          texto: 'Depois da equipe vem “Qual é o assunto?”. Escolhido o assunto, aparecem “Resumo”, “Descreva com detalhes” e, quando o assunto pede, “Local”.',
        },
        {
          alvo: 'chamados.urgencia',
          titulo: 'Quanto isso atrapalha',
          texto: '“Consigo esperar”, “Atrapalha meu trabalho” ou “Parou tudo”. A equipe avalia o impacto, e os dois juntos dão a prioridade e os prazos.',
        },
        {
          alvo: 'chamados.anexos',
          titulo: 'Anexos',
          texto: '“Anexar foto, print ou arquivo” junta a foto do defeito, o print do erro ou um PDF: até 6 arquivos de 25 MB.',
        },
      ],
    },
    {
      caminho: '/chamados/[id]',
      rotulo: 'Chamado',
      tour: [
        {
          titulo: 'O chamado',
          texto: 'A conversa com a equipe e o quadro com status, prioridade, responsável e prazos. Cada mudança entra na linha do tempo, junto com as mensagens.',
        },
        {
          alvo: 'chamados.avaliacao',
          titulo: 'Confirmar ou reabrir',
          texto: 'A equipe marcou como resolvido: confirme com uma nota de 1 a 5, ou reabra se o problema continuar.',
          seAusente: 'pular',
        },
        {
          alvo: 'chamados.mensagem',
          titulo: 'Escrever',
          texto: 'Na caixa de mensagem você escreve e anexa arquivos. Quem atende escolhe entre “Responder a quem abriu” e “Nota interna”, que só a equipe vê.',
          lado: 'top',
          seAusente: 'pular',
        },
        {
          alvo: 'chamados.situacao',
          titulo: 'Status e prazos',
          texto: 'O status, a prioridade, o responsável e os prazos de 1ª resposta e de solução. Enquanto o chamado aguarda quem abriu ou um terceiro, o relógio fica pausado.',
        },
        {
          alvo: 'chamados.acoes',
          titulo: 'Mudar o status',
          texto: 'Os botões que valem agora para você. A equipe atende, pede informação e resolve; quem abriu pode cancelar enquanto o chamado está em aberto.',
          seAusente: 'pular',
        },
        {
          alvo: 'chamados.triagem',
          titulo: 'Triagem',
          texto: 'Para quem atende: defina o responsável, avalie o impacto (que recalcula a prioridade e os prazos) ou transfira para outra fila.',
          seAusente: 'pular',
        },
      ],
    },
    {
      caminho: '/chamados/configurar',
      rotulo: 'Configurar chamados',
      tour: [
        {
          titulo: 'Configurar chamados',
          texto: 'Cada fila é uma equipe que recebe chamados, com prefixo, quem atende, o catálogo de assuntos e os prazos por prioridade. Só administradores mudam.',
        },
        {
          alvo: 'chamados.filas',
          titulo: 'As filas',
          texto: 'Toque numa fila para abrir. Dentro dela ficam os dados da fila e os prazos, “Quem atende” e “Assuntos (catálogo)”.',
          seAusente: 'pular',
        },
        {
          alvo: 'chamados.sla',
          titulo: 'Os prazos',
          texto: 'Horas de 1ª resposta e de solução para cada prioridade. Contam em horário de atendimento, ou em horas corridas se a fila atende 24h.',
          seAusente: 'pular',
        },
        {
          alvo: 'chamados.equipe',
          titulo: 'Quem atende',
          texto: 'Quem está marcado recebe os chamados novos da fila e pode responder, atribuir, resolver e transferir. Administradores atendem todas as filas.',
          seAusente: 'pular',
        },
        {
          alvo: 'chamados.nova-fila',
          titulo: 'Nova fila',
          texto: 'O botão “Nova fila” cria outra equipe de atendimento, com nome, prefixo de 2 a 6 letras e os prazos.',
          seAusente: 'pular',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'abrir-chamado',
      titulo: 'Abrir um chamado',
      passos: [
        'Em “Chamados”, toque em “Abrir chamado”.',
        'Escolha a equipe (por exemplo, TI ou Manutenção).',
        'Em “Qual é o assunto?”, escolha o que mais combina.',
        'Preencha “Resumo” e “Descreva com detalhes”. Se o assunto pedir, informe o “Local” (sala, andar ou setor).',
        'Em “Quanto isso atrapalha?”, escolha “Consigo esperar”, “Atrapalha meu trabalho” ou “Parou tudo”.',
        'Se ajudar, use “Anexar foto, print ou arquivo”.',
        'Toque em “Abrir chamado”. A equipe da fila é avisada.',
      ],
      dica: 'Num problema, conte o que aconteceu, desde quando, o que já tentou e se aparece alguma mensagem de erro. Num pedido, diga o que precisa, para quem e até quando.',
    },
    {
      id: 'responder-chamado',
      titulo: 'Acompanhar e responder o seu chamado',
      passos: [
        'Em “Chamados”, na aba “Meus chamados”, toque no chamado.',
        'Leia as respostas da equipe na conversa.',
        'Escreva na caixa de mensagem e toque em “Enviar”.',
      ],
      dica: 'Se o status for “Aguardando você”, a equipe precisa de uma informação sua. Ao responder, o chamado volta sozinho para “Em atendimento”.',
    },
    {
      id: 'confirmar-e-avaliar',
      titulo: 'Confirmar a solução e avaliar',
      passos: [
        'Abra o chamado com o status “Resolvido”.',
        'Leia a “Solução” escrita pela equipe.',
        'No cartão “A equipe marcou este chamado como resolvido”, escolha uma nota de 1 a 5.',
        'Se quiser, deixe um comentário.',
        'Toque em “Confirmar e avaliar”: o chamado fecha.',
      ],
    },
    {
      id: 'reabrir-chamado',
      titulo: 'Reabrir um chamado que não foi resolvido',
      passos: [
        'Abra o chamado resolvido.',
        'No cartão da avaliação, toque em “O problema continua — reabrir”.',
        'Escreva o que ainda não foi resolvido.',
        'Toque em “Reabrir chamado”.',
      ],
      dica: 'Dá para reabrir até 5 dias depois da solução. Depois disso o chamado fecha sozinho; se o problema voltar, abra um novo e cite o código do antigo.',
    },
    {
      id: 'cancelar-chamado',
      titulo: 'Cancelar um chamado que você abriu',
      passos: [
        'Abra o chamado.',
        'Toque em “Cancelar chamado”.',
        'Em “Motivo do cancelamento”, diga por quê.',
        'Toque em “Cancelar chamado” de novo para confirmar.',
      ],
      dica: 'Quem abriu pode cancelar enquanto o chamado ainda não foi resolvido.',
    },
    {
      id: 'atender-chamado',
      titulo: 'Atender um chamado',
      quem: 'Quem atende a fila',
      passos: [
        'Em “Chamados”, abra a aba “Atendimento”.',
        'Se precisar, filtre por fila, situação ou responsável (“Comigo”, “Sem responsável”) e toque em “Filtrar”.',
        'Abra o chamado e toque em “Atender”. Se ele não tinha responsável, passa a ser você.',
        'Na caixa de mensagem, com “Responder a quem abriu” selecionado, escreva e toque em “Enviar”. Para combinar algo só com a equipe, escolha “Nota interna” e toque em “Salvar nota”.',
        'Se precisar de algo de quem abriu, toque em “Pedir informação”; se depende de fornecedor ou peça, em “Aguardar terceiro”. O prazo pausa.',
        'Terminou? Toque em “Resolver”, descreva em “Como foi resolvido?” e confirme.',
      ],
      dica: 'Atender, mudar o status ou responder a quem abriu conta como 1ª resposta; nota interna não conta. A solução é o que quem abriu vai ler para confirmar.',
    },
    {
      id: 'triagem-do-chamado',
      titulo: 'Definir responsável, impacto ou transferir',
      quem: 'Quem atende a fila',
      passos: [
        'Abra o chamado e vá ao quadro “Triagem”.',
        'Em “Responsável”, escolha quem vai cuidar. A pessoa recebe um aviso.',
        'Em “Impacto”, escolha “Uma pessoa”, “Um setor inteiro” ou “A filial toda”. A prioridade e os prazos são recalculados.',
        'Se o chamado é de outra equipe, toque em “Transferir para outra fila”, escolha a fila e o assunto, diga por quê e toque em “Transferir”.',
      ],
      dica: 'Ao transferir, o chamado ganha um código novo na outra fila (o antigo fica na linha do tempo) e fica sem responsável. A equipe de destino e quem abriu são avisados.',
    },
    {
      id: 'criar-fila',
      titulo: 'Criar ou ajustar uma fila',
      quem: 'Só administradores',
      passos: [
        'Em “Chamados”, toque em “Configurar”.',
        'Toque em “Nova fila”, ou abra uma fila existente.',
        'Preencha “Nome”, “Prefixo” (de 2 a 6 letras, como TI ou MAN) e “O que esta equipe atende”.',
        'Deixe marcado “Recebendo chamados” e, se for o caso, marque “Atende 24h (prazos em horas corridas)”.',
        'Ajuste as horas de “1ª resposta (horas)” e “Solução (horas)” de cada prioridade.',
        'Toque em “Criar fila” (ou “Salvar fila”).',
      ],
      dica: 'Mudar os prazos vale para os chamados novos.',
    },
    {
      id: 'equipe-e-assuntos',
      titulo: 'Definir quem atende e os assuntos de uma fila',
      quem: 'Só administradores',
      passos: [
        'Em “Configurar”, toque na fila para abrir.',
        'Em “Quem atende”, marque as pessoas e toque em “Salvar equipe”.',
        'Em “Assuntos (catálogo)”, toque em “Novo assunto” (ou num assunto, para editar).',
        'Dê um nome, escreva exemplos para quem abre e escolha “Incidente” (algo parou) ou “Solicitação” (algo novo que se pede).',
        'Marque “Pede local” se a equipe precisa saber a sala ou o andar, e toque em “Salvar”.',
      ],
      dica: 'Assunto desmarcado em “Ativo” some do formulário de abertura. Fila sem nenhum assunto ativo não aparece para quem abre chamado.',
    },
  ],
  perguntas: [
    {
      id: 'status-do-chamado',
      pergunta: 'O que significa cada status?',
      resposta: '“Novo”: ninguém atendeu ainda. “Em atendimento”: a equipe está cuidando. “Aguardando você” (para a equipe, “Aguardando solicitante”): a equipe precisa de uma resposta sua; “Aguardando terceiro”: depende de fornecedor ou peça.\n\n“Resolvido”: a equipe deu a solução e espera a sua confirmação. “Fechado” e “Cancelado” encerram o chamado.',
      termos: ['situação', 'aguardando solicitante', 'aguardando terceiro'],
    },
    {
      id: 'prioridade',
      pergunta: 'Como a prioridade é definida?',
      resposta: 'Você diz quanto o problema atrapalha, e a equipe avalia o impacto: uma pessoa, um setor inteiro ou a filial toda. A combinação dos dois dá a prioridade (“Baixa”, “Média”, “Alta” ou “Crítica”), e ela define os prazos. Ao abrir, o impacto começa em “Uma pessoa”.',
      termos: ['urgência', 'impacto', 'crítica', 'matriz'],
    },
    {
      id: 'mudar-urgencia',
      pergunta: 'Dá para mudar o “Quanto isso atrapalha?” depois de abrir?',
      resposta: 'Não: a urgência fica como você informou ao abrir. Se a situação piorou, conte na conversa do chamado; quem atende pode rever o “Impacto”, que recalcula a prioridade e os prazos.',
      termos: ['urgência', 'piorou', 'aumentar prioridade', 'mudar prioridade'],
    },
    {
      id: 'como-contam-os-prazos',
      pergunta: 'Como contam os prazos?',
      resposta: 'Cada prioridade tem dois prazos: 1ª resposta e solução. Eles contam em horário de atendimento, de segunda a sexta, das 8h às 18h (horário de Brasília), a não ser que a fila atenda 24h. Enquanto o chamado está “Aguardando você” ou “Aguardando terceiro”, o relógio para.',
      termos: ['sla', 'prazo', 'tempo de resposta', 'horário comercial'],
    },
    {
      id: 'selos-de-prazo',
      pergunta: 'O que querem dizer “Vence logo”, “Atrasado” e “Pausado”?',
      resposta: '“Vence logo” aparece quando resta menos de um quarto do tempo do prazo. “Atrasado”: o prazo passou. “Pausado”: o chamado aguarda quem abriu ou um terceiro, e o tempo não conta contra a equipe.',
      termos: ['em risco', 'estourado', 'no prazo'],
    },
    {
      id: 'quem-ve-o-chamado',
      pergunta: 'Quem vê o meu chamado?',
      resposta: 'Você e a equipe da fila, além dos administradores, que atendem todas as filas. A nota interna e os anexos dela só a equipe vê.',
      termos: ['privacidade', 'nota interna', 'visibilidade'],
    },
    {
      id: 'responder-por-email',
      pergunta: 'Posso responder pelo e-mail do aviso?',
      resposta: 'Não. Os avisos chegam no sino e por e-mail, mas a resposta tem de ser escrita no próprio chamado, no Palácio Virtual: respostas ao e-mail não entram no atendimento.',
      termos: ['responder e-mail', 'notificação', 'aviso'],
    },
    {
      id: 'quando-recebo-aviso',
      pergunta: 'Quando recebo aviso de um chamado?',
      resposta: 'Quem abriu é avisado das respostas da equipe, dos pedidos de informação, da solução, do cancelamento feito pela equipe e da mudança de fila. A equipe da fila é avisada de chamado novo e de chamado transferido para ela; quem é o responsável é avisado da atribuição, das mensagens de quem abriu, da reabertura, do cancelamento e da avaliação (sem responsável, mensagens e reaberturas vão para a equipe da fila). Ninguém é avisado do que ele mesmo fez.',
      termos: ['notificação', 'sino', 'e-mail'],
    },
    {
      id: 'fechou-sozinho',
      pergunta: 'Por que o meu chamado fechou sozinho?',
      resposta: 'Chamado “Resolvido” que quem abriu não confirma nem reabre fecha sozinho 5 dias depois da solução. Mensagem na conversa não segura o chamado aberto: para isso, use “O problema continua — reabrir”. Se o problema voltou depois, abra um novo chamado e cite o código do antigo.',
      termos: ['fechamento automático', 'fechado', 'Fechado automaticamente'],
    },
    {
      id: 'nao-consigo-reabrir',
      pergunta: 'Por que não consigo reabrir?',
      resposta: 'Reabrir vale até 5 dias depois da solução. Passado esse prazo, abra um novo chamado e cite o código do antigo.',
      termos: ['reabrir', 'O prazo para reabrir passou'],
    },
    {
      id: 'codigo-mudou',
      pergunta: 'Por que o código do chamado mudou?',
      resposta: 'O chamado foi transferido para outra fila, e cada fila tem a sua numeração (TI-0042, MAN-0007…). O código antigo fica registrado na linha do tempo.',
      termos: ['transferido', 'número mudou', 'mudou de equipe'],
    },
    {
      id: 'sem-aba-atendimento',
      pergunta: 'Por que não vejo a aba “Atendimento”?',
      resposta: '“Atendimento” e “Indicadores” só aparecem para quem faz parte da equipe de alguma fila e para administradores. Quem define as equipes é um administrador, em “Configurar”.',
      termos: ['indicadores', 'atender', 'equipe da fila'],
    },
    {
      id: 'indicadores',
      pergunta: 'O que mostram os “Indicadores”?',
      resposta: 'Os chamados abertos nos últimos 90 dias nas filas que você atende: em aberto, atrasados, tempo médio de 1ª resposta e de solução, resolvidos no prazo, satisfação, os números por fila e por prioridade e os assuntos mais pedidos. Os tempos médios contam em horário de atendimento (em horas corridas nas filas 24h), da abertura até a resposta ou a solução. A satisfação (CSAT) é a parte das avaliações com nota 4 ou 5.',
      termos: ['csat', 'métricas', 'relatório', 'média'],
    },
    {
      id: 'equipe-nao-aparece',
      pergunta: 'A equipe de que preciso não aparece. E agora?',
      resposta: 'Só aparecem as filas que estão recebendo chamados e têm ao menos um assunto ativo. Se faltar uma equipe, fale com um administrador.',
      termos: ['fila', 'Nenhuma equipe está recebendo chamados agora'],
    },
    {
      id: 'anexos-permitidos',
      pergunta: 'Que arquivos posso anexar?',
      resposta: 'Foto ou imagem (JPG, PNG, WebP, GIF ou HEIC), vídeo curto (MP4 ou MOV), PDF, Word, Excel, CSV ou texto: até 6 arquivos por envio, de até 25 MB cada. Outros formatos são recusados.',
      termos: ['anexo', 'foto', 'print', 'tamanho', 'maior que 25 MB'],
    },
  ],
  relacionadas: ['/patrimonio', '/financeiro/compras'],
}

// ---------------------------------------------------------------- Pedidos de compra

const COMPRAS: GuiaDaArea = {
  href: '/financeiro/compras',
  paraQueServe: 'O caminho de uma compra, do pedido do setor à conta a pagar: cotação com as propostas dos fornecedores lado a lado, aprovação, ordem de compra, recebimento e entrada no estoque ou no patrimônio. Tudo fica no histórico do pedido, para a prestação de contas.',
  quemUsa: 'Qualquer pessoa da equipe pede e acompanha os seus pedidos. No Financeiro, quem tem o nível “Lançar” (ou acima) cota, emite a ordem e lança a conta, e quem tem o nível “Aprovar” (ou acima) aprova; acima do limite, a Diretoria também aprova. Quem opera o Patrimônio dá entrada no que chegou.',
  tour: [
    {
      titulo: 'Pedidos de compra',
      texto: 'Qualquer pessoa da equipe pede o que o setor precisa. O Financeiro cota com os fornecedores, a compra é aprovada, e você acompanha cada passo.',
    },
    {
      alvo: 'compras.novo',
      titulo: 'Pedir uma compra',
      texto: 'O botão “Novo pedido” abre o formulário: o que comprar, para quê, até quando e os itens, com a especificação de cada um.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'compras.abas',
      titulo: 'As abas',
      texto: '“Meus pedidos” mostra o que você pediu. Conforme o seu acesso, aparecem também “Para aprovar”, “Para cotar”, “Em andamento”, “Dar entrada” e “Todos”.',
      lado: 'bottom',
    },
    {
      alvo: 'compras.lista',
      titulo: 'Os pedidos',
      texto: 'Cada pedido traz o número (como PC-2026-0007), quem pediu, o valor e a situação. Tocar abre tudo: itens, cotação, aprovação e histórico.',
      seAusente: 'pular',
    },
    {
      titulo: 'As regras de compra',
      texto: 'Até um limite, basta uma proposta; acima dele, são exigidas mais propostas; acima de outro limite, a Diretoria também aprova. Os valores atuais aparecem no alto de “Novo pedido”.',
    },
    {
      alvo: 'compras.relatorio',
      titulo: 'Relatório para a transparência',
      texto: 'Para o Financeiro: o PDF do mês com as compras aprovadas, todas as propostas e a justificativa, pronto para enviar em Transparência → Documentos.',
      seAusente: 'pular',
    },
  ],
  telas: [
    {
      caminho: '/financeiro/compras/novo',
      rotulo: 'Novo pedido',
      tour: [
        {
          titulo: 'Novo pedido de compra',
          texto: 'Diga o que precisa, para quê e até quando, e liste os itens. O Financeiro cota com os fornecedores e manda para aprovação.',
        },
        {
          alvo: 'compras.dados',
          titulo: 'O pedido',
          texto: '“O que você precisa comprar” e “Para quê” são obrigatórios; o motivo fica no processo e na prestação de contas. Informe também “Precisa até” e “Onde entregar”.',
        },
        {
          alvo: 'compras.itens',
          titulo: 'Os itens',
          texto: 'Cada item tem descrição, quantidade e unidade. A seta abre a especificação, que vai igual para todos os fornecedores. O valor estimado é opcional.',
        },
        {
          alvo: 'compras.enviar',
          titulo: 'Enviar',
          texto: '“Enviar pedido” grava o pedido e avisa quem cota no Financeiro. Depois, você acompanha tudo na página do pedido.',
          lado: 'top',
        },
      ],
    },
    {
      caminho: '/financeiro/compras/[id]/editar',
      rotulo: 'Alterar pedido',
      tour: [
        {
          titulo: 'Alterar o pedido',
          texto: 'Quem pediu altera enquanto ninguém começou a cotar; o Financeiro, até mandar para aprovação. Tirar um item apaga os preços dele nas propostas já registradas.',
        },
        {
          alvo: 'compras.itens',
          titulo: 'Os itens',
          texto: 'Ajuste descrição, quantidade, unidade e especificação. “Outro item” acrescenta uma linha; a lixeira tira o item.',
        },
        {
          alvo: 'compras.enviar',
          titulo: 'Salvar',
          texto: '“Salvar alterações” grava e volta para a página do pedido.',
          lado: 'top',
        },
      ],
    },
    {
      caminho: '/financeiro/compras/[id]',
      rotulo: 'Pedido de compra',
      tour: [
        {
          titulo: 'O pedido',
          texto: 'Uma compra de ponta a ponta numa página só: o que se pede, a cotação, a aprovação, a ordem de compra, o que chegou, a conta a pagar e o histórico.',
        },
        {
          alvo: 'compras.estado',
          titulo: 'Situação',
          texto: 'O número, o título e a situação do pedido. “Alterar” e “Cancelar pedido” aparecem só enquanto ainda dá, e para quem pode.',
          lado: 'bottom',
        },
        {
          alvo: 'compras.cotacao',
          titulo: 'O mapa comparativo',
          texto: 'As propostas lado a lado: o menor preço de cada item fica em verde, e o troféu marca a proposta completa mais barata.',
          seAusente: 'pular',
        },
        {
          alvo: 'compras.aprovacao',
          titulo: 'Aprovação',
          texto: 'Quem já aprovou e quem falta: o Financeiro e, acima do limite, a Diretoria. Quem pediu a compra não decide sobre ela.',
          seAusente: 'pular',
        },
        {
          alvo: 'compras.ordem',
          titulo: 'Ordem de compra',
          texto: 'Aprovada, a compra vira ordem de compra, com número próprio (OC-…) e PDF, que o Financeiro manda ao fornecedor.',
          seAusente: 'pular',
        },
        {
          alvo: 'compras.recebimento',
          titulo: 'Recebimento',
          texto: 'Quando o material chegar, quem pediu (ou o Financeiro) toca em “Registrar o que chegou”. Pode chegar em partes.',
          seAusente: 'pular',
        },
        {
          alvo: 'compras.historico',
          titulo: 'Histórico',
          texto: 'Quem fez o quê e quando, do pedido à conta a pagar: é a trilha para a prestação de contas.',
          lado: 'top',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'pedir-compra',
      titulo: 'Pedir uma compra',
      passos: [
        'Em “Pedidos de compra”, toque em “Novo pedido”.',
        'Preencha “O que você precisa comprar” e “Para quê”.',
        'Confira o “Setor que pede” e, se a compra for de um projeto, escolha em “Projeto (se for de um)”. Informe “Precisa até” e “Onde entregar”.',
        'Em “Itens”, descreva cada item, com “Qtde.” e “Unidade”. A seta ao lado abre a especificação (tamanho, marca de referência, norma técnica…).',
        'Se souber, preencha o “Valor unit. estimado”. Use “Outro item” para incluir mais linhas.',
        'Toque em “Enviar pedido”.',
      ],
      dica: 'Especifique bem: a mesma especificação vai para todos os fornecedores, e é ela que permite comparar as propostas.',
    },
    {
      id: 'alterar-ou-cancelar-pedido',
      titulo: 'Alterar ou cancelar o seu pedido',
      passos: [
        'Abra o pedido.',
        'Para mudar, toque em “Alterar”, ajuste e toque em “Salvar alterações”.',
        'Para desistir, toque em “Cancelar pedido”, escreva o motivo e toque em “Cancelar o pedido”.',
      ],
      dica: 'Quem pediu altera enquanto a situação é “Aguardando cotação” e cancela até a compra ser aprovada. Depois disso, fale com o Financeiro.',
    },
    {
      id: 'registrar-recebimento',
      titulo: 'Registrar o que chegou',
      quem: 'Quem pediu, ou o Financeiro',
      passos: [
        'Abra o pedido com a ordem de compra emitida.',
        'Em “Recebimento”, toque em “Registrar o que chegou”.',
        'Em “Chegou agora”, informe a quantidade de cada item (já vem com o que falta).',
        'Preencha “Chegou em” e a “Nota fiscal”. Se houver avaria ou falta, conte em “Observação”.',
        'Toque em “Registrar recebimento”.',
      ],
      dica: 'Dá para registrar em partes, conforme chega. Ninguém registra mais do que foi pedido.',
    },
    {
      id: 'cotar-pedido',
      titulo: 'Cotar um pedido',
      quem: 'Financeiro, a partir do nível “Lançar”',
      passos: [
        'Abra o pedido pela aba “Para cotar”.',
        'Se faltar, toque em “Alterar” e preencha “Categoria (Financeiro)” e “Fonte do dinheiro (Financeiro)”: sem elas o pedido não vai para aprovação.',
        'Em “Cotação — mapa comparativo”, toque em “Registrar proposta”.',
        'Escolha o “Fornecedor”, preencha “Recebida em”, “Válida até”, o “Prazo de entrega”, a “Condição de pagamento”, o “Frete (R$)” e o preço unitário de cada item. Toque em “Salvar proposta”.',
        'Na proposta, use “Anexar documento” para juntar o PDF ou a foto da proposta do fornecedor.',
        'Repita para cada fornecedor.',
      ],
      dica: 'Item sem preço conta como “não cotou”, e a proposta fica incompleta. Fornecedor que não está na lista se cadastra em Financeiro → Cadastros → Favorecidos.',
    },
    {
      id: 'mandar-para-aprovacao',
      titulo: 'Escolher a proposta e mandar para aprovação',
      quem: 'Financeiro, a partir do nível “Lançar”',
      passos: [
        'No mapa comparativo, na linha “Vencedora”, marque “Escolher” na proposta escolhida. Só proposta completa pode ser escolhida.',
        'Leia o resumo: ele diz quantas propostas a faixa exige e se a Diretoria também aprova.',
        'Se faltarem propostas, ou se a escolhida não for a mais barata, escreva a “Justificativa (obrigatória)”, com pelo menos 15 caracteres.',
        'Toque em “Mandar para aprovação”. Quem aprova e quem pediu recebem aviso.',
      ],
    },
    {
      id: 'aprovar-compra',
      titulo: 'Aprovar, devolver ou recusar uma compra',
      quem: 'Financeiro, a partir do nível “Aprovar”; acima do limite, também a Diretoria',
      passos: [
        'Abra o pedido pela aba “Para aprovar”.',
        'Confira o mapa comparativo, a justificativa e, se houver, o aviso de verba da categoria.',
        'Em “Aprovação”, escreva uma observação (opcional para aprovar).',
        'Toque em “Aprovar como Financeiro” (ou “Aprovar como Diretoria”), “Devolver para a cotação” ou “Recusar”. Devolver e recusar pedem o motivo.',
      ],
      dica: 'Quem pediu a compra não decide sobre ela, e a mesma pessoa não aprova pelo Financeiro e pela Diretoria.',
    },
    {
      id: 'emitir-ordem',
      titulo: 'Emitir e enviar a ordem de compra',
      quem: 'Financeiro, a partir do nível “Lançar”',
      passos: [
        'Abra o pedido aprovado (aba “Em andamento”).',
        'Em “Ordem de compra”, escreva uma observação para o fornecedor, se quiser, e toque em “Emitir a ordem de compra”.',
        'Toque em “Abrir o PDF” para conferir.',
        'Toque em “Enviar ao fornecedor”, escolha em “De” o e-mail do setor, confira “Para” e a “Mensagem” e toque em “Enviar com o PDF”.',
      ],
      dica: 'Sem uma caixa de e-mail de setor, baixe o PDF e mande pelo seu e-mail, ou peça a alguém do setor.',
    },
    {
      id: 'lancar-conta',
      titulo: 'Lançar a conta a pagar da compra',
      quem: 'Financeiro, a partir do nível “Lançar”',
      passos: [
        'Abra o pedido e, em “Conta a pagar”, toque em “Lançar a conta a pagar”.',
        'Escolha a conta em “Sai da conta”, a data em “Vence em” e o número de “Parcelas” (até 12).',
        'Confira o “Valor (R$)”: pode ser menor que o aprovado (desconto), nunca maior.',
        'Informe o “Documento” (nota fiscal ou boleto) e toque em “Lançar no Financeiro”.',
      ],
      dica: 'A conta entra no Financeiro já aprovada, com o fornecedor, a categoria, a fonte e o projeto do pedido. Com parcelas, as seguintes vencem mês a mês.',
    },
    {
      id: 'dar-entrada',
      titulo: 'Dar entrada no estoque ou no patrimônio',
      quem: 'Quem opera o Patrimônio',
      passos: [
        'Abra o pedido pela aba “Dar entrada”.',
        'Em “Entrada no estoque ou patrimônio”, toque em “Dar entrada” no item.',
        'Escolha o destino: “Estoque”, “Patrimônio” ou “Sem entrada” (serviço ou uso imediato).',
        'No estoque, escolha o “Item do estoque” e o “Local”; informe o “Lote”, se houver, e a “Validade” (obrigatória quando o item controla validade). Se a unidade for outra (5 caixas de 100 = 500 un), preencha a “Quantidade no estoque”.',
        'No patrimônio, preencha “Nome do bem” e “Categoria”: cada unidade vira um bem com plaqueta.',
        'Toque em “Registrar a entrada”.',
      ],
      dica: 'O custo já vem com a parte do frete. Não achou o item no estoque? Cadastre o item e recarregue a página.',
    },
    {
      id: 'relatorio-transparencia',
      titulo: 'Gerar o relatório de compras para a transparência',
      quem: 'Quem tem acesso ao Financeiro',
      passos: [
        'Em “Pedidos de compra”, desça até “Relatório de compras para a transparência”.',
        'Escolha o mês.',
        'Toque em “Gerar PDF”.',
        'Para publicar, envie o PDF em Transparência → Documentos.',
      ],
      dica: 'O relatório traz as compras aprovadas no mês, com todas as propostas recebidas e a justificativa quando houve. Fornecedor pessoa física sai sem identificação.',
    },
  ],
  perguntas: [
    {
      id: 'quantas-propostas',
      pergunta: 'Quantas propostas uma compra precisa?',
      resposta: 'Depende do valor. Até o limite da compra simples, basta uma; acima dele, o mínimo de propostas definido pela filial; acima do limite da Diretoria, também a aprovação dela. Os valores atuais aparecem no alto de “Novo pedido”.',
      termos: ['cotações', 'orçamentos', 'três propostas', 'limite', 'faixa'],
    },
    {
      id: 'quem-aprova',
      pergunta: 'Quem aprova uma compra?',
      resposta: 'Alguém do Financeiro com o nível “Aprovar” (ou acima). Acima do limite da Diretoria, também alguém da Diretoria, que precisa ser outra pessoa. Quem pediu a compra nunca decide sobre ela.',
      termos: ['aprovação', 'diretoria', 'Quem pediu a compra não decide sobre ela'],
    },
    {
      id: 'situacoes-do-pedido',
      pergunta: 'O que significa cada situação do pedido?',
      resposta: '“Aguardando cotação”: ninguém registrou proposta ainda. “Em cotação”: o Financeiro está juntando propostas. “Em aprovação”: espera o Financeiro e, se preciso, a Diretoria.\n\n“Aprovado”, “Ordem emitida”, “Recebido em parte” e “Recebido” acompanham a compra até a entrega. “Recusado” e “Cancelado” encerram o pedido.',
      termos: ['status', 'estado', 'em cotação', 'em aprovação'],
    },
    {
      id: 'devolvida-para-cotacao',
      pergunta: 'O que acontece quando a compra volta para a cotação?',
      resposta: 'Quem aprova usou “Devolver para a cotação”, com um motivo. O pedido volta para “Em cotação”, as aprovações já dadas são desfeitas, e quem pediu e quem mandou para aprovação recebem o aviso com o motivo. Quem cota ajusta as propostas ou a escolha e manda para aprovação de novo.',
      termos: ['devolvido', 'devolver', 'voltou para a cotação'],
    },
    {
      id: 'nao-consigo-alterar',
      pergunta: 'Por que não consigo alterar o meu pedido?',
      resposta: 'Quem pediu altera só enquanto a situação é “Aguardando cotação”. Depois, quem altera é o Financeiro, até mandar para aprovação. Se algo mudou, fale com quem está cotando.',
      termos: ['editar', 'mudar', 'Este pedido não pode mais ser alterado'],
    },
    {
      id: 'ate-quando-cancelar',
      pergunta: 'Até quando dá para cancelar um pedido?',
      resposta: 'Quem pediu cancela até a compra ser aprovada. Quem cota no Financeiro (a partir do nível “Lançar”) cancela também depois, enquanto nada chegou e a conta a pagar não foi lançada. Cancelar pede um motivo, que fica no pedido.',
      termos: ['cancelar', 'desistir', 'Já chegou material ou a conta foi lançada'],
    },
    {
      id: 'quando-justificar',
      pergunta: 'Quando a escolha da proposta precisa de justificativa?',
      resposta: 'Quando há menos propostas completas do que a faixa exige, ou quando a escolhida não é a mais barata. A justificativa (pelo menos 15 caracteres) fica no pedido, no histórico e no relatório da transparência.',
      termos: ['justificar', 'mais barata', 'menos propostas'],
    },
    {
      id: 'fracionamento',
      pergunta: 'O que é o aviso de “possível fracionamento”?',
      resposta: 'Aparece para quem cota e aprova quando esta compra, somada às parecidas (mesma categoria ou mesmo fornecedor) dos últimos 90 dias, cai numa faixa mais exigente. É só um alerta: necessidades independentes podem ser compradas em separado. Se for a mesma necessidade dividida, junte num pedido só.',
      termos: ['fracionar', 'dividir compra', 'alerta'],
    },
    {
      id: 'verba-da-categoria',
      pergunta: 'O que é a verba que aparece no pedido?',
      resposta: 'É a verba da categoria no mês, do Orçamento do Financeiro, menos o que já foi lançado e o que está em outras compras. Se esta compra passa do que sobra, o valor fica em vermelho. Ela aparece para quem tem acesso ao Financeiro, depois que o pedido tem categoria, e é só um aviso.',
      termos: ['orçamento', 'sobra', 'passa da verba'],
    },
    {
      id: 'quem-ve-o-pedido',
      pergunta: 'Quem vê o meu pedido?',
      resposta: 'Você, quem tem acesso ao Financeiro da empresa do pedido e, se a compra passa pela Diretoria, a Diretoria. Depois que a ordem de compra é emitida, quem opera o Patrimônio também vê, para dar entrada no que chegar.',
      termos: ['privacidade', 'visibilidade', 'acesso'],
    },
    {
      id: 'so-meus-pedidos',
      pergunta: 'Por que só vejo “Meus pedidos”?',
      resposta: 'As outras abas dependem do seu acesso: “Todos” é de quem tem acesso ao Financeiro; “Para cotar” e “Em andamento”, de quem tem o nível “Lançar” ou acima; “Para aprovar”, de quem aprova e da Diretoria; “Dar entrada”, de quem opera o Patrimônio. O acesso ao Financeiro é dado por um administrador.',
      termos: ['abas', 'para cotar', 'para aprovar', 'nível'],
    },
    {
      id: 'pedido-e-ordem',
      pergunta: 'Qual a diferença entre o pedido (PC) e a ordem de compra (OC)?',
      resposta: 'O pedido (PC-…) é o que o setor pede. A ordem de compra (OC-…) é o documento formal ao fornecedor, emitido só depois da aprovação, com numeração própria e o CNPJ para a nota fiscal.',
      termos: ['PC', 'OC', 'ordem de compra', 'numeração'],
    },
    {
      id: 'chegou-menos',
      pergunta: 'Chegou menos do que o pedido. E agora?',
      resposta: 'Registre só o que chegou, e conte a avaria ou a falta em “Observação”. O pedido fica “Recebido em parte”, e você registra o resto quando chegar.',
      termos: ['entrega parcial', 'faltou', 'avaria', 'recebido em parte'],
    },
    {
      id: 'fornecedor-nao-aparece',
      pergunta: 'Por que o fornecedor não aparece na lista da proposta?',
      resposta: 'A lista vem dos favorecidos do Financeiro: cadastre o fornecedor em Financeiro → Cadastros → Favorecidos e volte ao pedido. Cada fornecedor tem uma proposta só por pedido; para mudar preços, edite a que já existe.',
      termos: ['favorecido', 'cadastrar fornecedor', 'Este fornecedor já tem proposta neste pedido'],
    },
    {
      id: 'categoria-a-classificar',
      pergunta: 'O que quer dizer “a classificar” na categoria e na fonte?',
      resposta: 'Quem cota no Financeiro ainda não escolheu a categoria da despesa e a fonte do dinheiro. Sem as duas, o pedido não vai para aprovação.',
      termos: ['classificar', 'fonte do dinheiro', 'Classifique o pedido'],
    },
    {
      id: 'mudar-limites',
      pergunta: 'Quem muda os limites e o número de propostas?',
      resposta: 'A gestão do Financeiro, em Financeiro → Cadastros → “Regras de compra”. Lá também se escolhe o setor da Diretoria. As regras novas valem para os próximos envios para aprovação.',
      termos: ['regras de compra', 'limite simples', 'limite da diretoria', 'configurar'],
    },
  ],
  relacionadas: ['/financeiro', '/patrimonio'],
}

export const guias: GuiaDaArea[] = [OFICIOS, CHAMADOS, COMPRAS]
