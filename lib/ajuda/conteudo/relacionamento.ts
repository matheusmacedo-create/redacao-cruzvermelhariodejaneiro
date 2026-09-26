import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda dos grupos Relacionamento e Análise do menu — quem fala com a Casa
 * e o que aconteceu depois de publicar: Newsletter (/newsletter), Imprensa e
 * contatos (/imprensa), Resultados (/impacto) e Histórico (/registro).
 *
 * Cada frase tem apoio no código: app/(app)/newsletter (page e central.tsx),
 * app/actions/newsletter.ts, lib/newsletter/** (inscrição, decisão, envio,
 * CSV), as rotas app/newsletter/confirmar e app/api/newsletter/exportar e o
 * destino Newsletter em lib/publicacao/canais/newsletter.ts e
 * app/actions/pacotes.ts; app/(app)/imprensa, components/app/imprensa/**,
 * app/actions/imprensa.ts, lib/imprensa/** e as políticas de press_contacts;
 * app/(app)/impacto/page.tsx; app/(app)/registro/page.tsx e
 * components/app/registro/tabela.tsx. Permissões em lib/permissoes.ts
 * (newsletter.apagar, site.configurar, diagnosticos.executar,
 * imprensa.campanhas). Os alvos `newsletter.*`, `imprensa.*`, `resultados.*`
 * e `historico.*` são marcados com `data-ajuda` nessas telas. Mudou a tela ou
 * a regra, muda aqui no mesmo PR (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Newsletter

const NEWSLETTER: GuiaDaArea = {
  href: '/newsletter',
  paraQueServe: 'A Newsletter guarda a lista de quem pediu para receber as notícias da Cruz Vermelha do Rio de Janeiro: quem confirmou, quem ainda não confirmou e quem saiu. Mostra também como a lista cresceu e as últimas edições enviadas. A edição em si é escrita e enviada em “Publicações”, como mais um destino do pacote.',
  quemUsa: 'Toda a equipe da Redação vê a lista, acrescenta endereços, reenvia convites e exporta. Apagar alguém da lista, ver a situação do formulário do site, ligá-lo e ver o diagnóstico completo do envio são só para administradores.',
  tour: [
    {
      titulo: 'A Newsletter',
      texto: 'Aqui fica a lista de quem pediu para receber as notícias da filial, como ela cresce e o que já foi enviado. A edição é escrita e enviada em “Publicações”.',
    },
    {
      alvo: 'newsletter.numeros',
      titulo: 'Os números da lista',
      texto: '“Na lista” são as pessoas que confirmaram e recebem as edições. “Aguardando” ainda não clicaram no convite; “Saíram” pediram para parar; “Inválidos” são endereços que devolveram a mensagem.',
      lado: 'bottom',
    },
    {
      alvo: 'newsletter.formulario',
      titulo: 'Formulário do site',
      texto: 'Confere sozinho se o formulário da página inicial do site manda as inscrições para cá (só administradores veem a situação). “Ligado” é o normal; “Não está ligado” quer dizer que quem se inscreve lá se perde.',
    },
    {
      alvo: 'newsletter.envio',
      titulo: 'Envio',
      texto: 'De qual endereço a newsletter sai e para onde vão as respostas. “Conferir envio” faz o diagnóstico; com gente aguardando, aparece o botão que reenvia o convite a todas de uma vez.',
    },
    {
      alvo: 'newsletter.lista',
      titulo: 'A lista',
      texto: 'Filtre por situação, busque por e-mail ou nome, acrescente um endereço com “Acrescentar” (um por vez, com a declaração de consentimento) e baixe tudo com “Exportar”.',
    },
    {
      alvo: 'newsletter.edicoes',
      titulo: 'Edições enviadas',
      texto: 'As últimas edições, com a data, para quantas pessoas foram e a situação: “Enviada”, “Agendada” ou “Falhou”. Quando falha, o motivo aparece em vermelho.',
    },
  ],
  tarefas: [
    {
      id: 'enviar-edicao',
      titulo: 'Enviar uma edição da newsletter',
      passos: [
        'Abra “Publicações” e o pacote da matéria (ou crie um).',
        'Toque em “Adicionar destino” e, em “Newsletter”, escolha “Edição”.',
        'Revise o texto da edição, que vem da notícia do pacote.',
        'Confira o “Assunto do e-mail” (até 90 caracteres; ele vem preenchido com o título), a “Chamada” e, se quiser, o “Texto do botão”.',
        'Confira a “Prévia do e-mail”: ela mostra a mensagem exatamente como vai sair.',
        'Toque em “Marcar como pronta”, depois em “Publicar prontos” (ou “Agendar prontos”, com horário marcado) e em “Confirmar”.',
        'Volte à Newsletter: a edição aparece em “Edições enviadas”.',
      ],
      dica: 'Quando o pacote publica no site junto, a newsletter sai depois da página, já com o botão para a matéria e a foto de capa. Pacote em aprovação só publica depois da decisão. E-mail enviado não se corrige: confira a prévia antes.',
    },
    {
      id: 'acrescentar-endereco',
      titulo: 'Acrescentar um endereço à mão',
      passos: [
        'Na caixa da lista, toque em “Acrescentar”.',
        'Digite o “e-mail” e, se quiser, o “nome (opcional)”.',
        'Marque a declaração de que a pessoa pediu para receber a newsletter. Sem ela, o botão não habilita.',
        'Toque em “Acrescentar”.',
        'Leia o recado no alto da tela. A pessoa fica como “Aguardando confirmação” até clicar no link do convite.',
      ],
      dica: 'Um endereço por vez, de propósito: não há como colar uma lista. Quem saiu da lista só volta pelo formulário do site, pela própria mão. Se o cartão “Envio” mostra “Sem chave do Resend” (o envio de e-mail não está configurado), o endereço fica guardado sem convite; depois de configurado o envio, use “Reenviar”.',
    },
    {
      id: 'reenviar-convite',
      titulo: 'Reenviar o convite a quem não confirmou',
      passos: [
        'Toque no filtro “Aguardando”.',
        'Na linha da pessoa, toque em “Reenviar”.',
        'Para todas de uma vez, use o botão do cartão “Envio” que mostra quantas são (por exemplo, “Reenviar 3 convites”).',
        'Leia o recado no alto da tela: ele diz se o convite saiu.',
      ],
      dica: 'Cada reenvio manda um link novo, que vale por 3 dias. O reenvio de uma vez aceita até 100 pessoas aguardando; acima disso, reenvie uma a uma.',
    },
    {
      id: 'procurar-na-lista',
      titulo: 'Procurar alguém na lista',
      passos: [
        'Digite no campo “Buscar por e-mail ou nome”.',
        'Para ver só uma situação, toque em “Confirmados”, “Aguardando”, “Saíram” ou “Inválidos”. “Todos” volta à lista inteira.',
        'Na linha, “Situação” mostra onde a pessoa está e “Origem” diz de onde ela veio.',
      ],
      dica: 'A tabela mostra as 500 inscrições mais recentes, e a busca procura só nelas. Para a lista inteira, use “Exportar”.',
    },
    {
      id: 'exportar-lista',
      titulo: 'Baixar a lista em planilha',
      passos: [
        'Toque em “Exportar”.',
        'O arquivo CSV baixa com e-mail, nome, situação, origem, as datas de inscrição, confirmação e saída, e o texto do consentimento aceito, com o IP de onde veio.',
        'Abra no Excel ou no Google Planilhas: o arquivo já vem com separador ponto e vírgula e com os acentos certos.',
      ],
      dica: 'O arquivo tem os dados pessoais de toda a lista, inclusive a prova do consentimento de cada pessoa. Guarde com o mesmo cuidado.',
    },
    {
      id: 'apagar-a-pedido',
      titulo: 'Apagar alguém da lista a pedido da pessoa',
      quem: 'Só administradores',
      passos: [
        'Procure a pessoa pelo campo de busca.',
        'Na linha dela, toque no ícone de lixeira.',
        'Toque em “Apagar mesmo” para confirmar, ou em “Não” para desistir.',
      ],
      dica: 'Apagar some com o registro de vez, como pede a LGPD quando a pessoa pede a eliminação dos dados. Se ela só quer parar de receber, basta o link “Sair da lista” de qualquer edição.',
    },
    {
      id: 'ligar-formulario',
      titulo: 'Ligar o formulário da página inicial do site',
      quem: 'Só administradores',
      passos: [
        'Abra a Newsletter e espere o cartão “Formulário do site” terminar de conferir (“Conferindo…”).',
        'Se aparecer “Não está ligado”, toque em “Ligar o formulário”.',
        'Leia o recado no alto da tela: ele diz se a página inicial do site já está com o formulário ligado.',
        'Para conferir de novo mais tarde, toque em “Ver situação”.',
      ],
      dica: 'Rodar de novo não duplica nada: se o formulário já estiver ligado, nada muda.',
    },
    {
      id: 'conferir-envio',
      titulo: 'Conferir se o envio de e-mail funciona',
      quem: 'Diagnóstico: só administradores',
      passos: [
        'No cartão “Envio”, veja o selo: “Configurado” ou “Sem chave do Resend”.',
        'Toque em “Conferir envio”.',
        'Leia o resultado: ele diz se o domínio de onde a newsletter sai está verificado e o que fazer em seguida.',
      ],
      dica: 'Para quem não é administrador, o botão responde que o diagnóstico completo é restrito a administradores.',
    },
  ],
  perguntas: [
    {
      id: 'situacoes',
      pergunta: 'O que quer dizer cada situação da lista?',
      resposta: '“Confirmado”: a pessoa clicou no link do convite, e só quem está assim recebe as edições. “Aguardando confirmação”: pediu para entrar, mas ainda não clicou.\n\n“Saiu da lista”: pediu para não receber mais. “Endereço inválido”: o endereço devolveu a mensagem.',
      termos: ['status', 'confirmado', 'pendente', 'descadastrado', 'inválido', 'aguardando'],
    },
    {
      id: 'por-que-confirmar',
      pergunta: 'Por que a pessoa precisa confirmar o e-mail?',
      resposta: 'Para ninguém entrar na lista por decisão de outra pessoa: a confirmação prova que o endereço é de quem pediu. Isso protege a filial de ser marcada como spam e filtra endereços digitados errado. Por isso até quem a equipe acrescenta à mão recebe o convite e só entra depois de clicar.',
      termos: ['dupla confirmação', 'double opt-in', 'consentimento', 'lgpd'],
    },
    {
      id: 'convite-nao-chegou',
      pergunta: 'A pessoa se inscreveu, mas o convite não chegou. E agora?',
      resposta: 'Peça que ela olhe o spam e, na linha dela (filtro “Aguardando”), toque em “Reenviar”, que manda um link novo. Quem se inscreve várias vezes seguidas pelo site só recebe um convite novo depois de 5 minutos.\n\nSe o cartão “Envio” mostra “Sem chave do Resend”, nenhum e-mail sai, e o convite não sai sozinho depois. Quando um administrador configurar o envio, o botão “Reenviar … convites” desse cartão manda o convite a quem ficou aguardando.',
      termos: ['não recebeu', 'convite', 'spam', 'confirmação', 'e-mail não chega'],
    },
    {
      id: 'link-expirou',
      pergunta: 'A pessoa diz que o link de confirmação expirou. O que fazer?',
      resposta: 'O link do convite vale por 3 dias. Depois disso, use “Reenviar” na linha dela, que manda um link novo, ou peça que ela se inscreva de novo pelo site. Se ela abrir um link que já foi usado, a página só avisa que ela já está na lista.',
      termos: ['Este link expirou', 'link expirado', 'link não funciona', 'prazo'],
    },
    {
      id: 'lista-nao-cresce',
      pergunta: 'Ninguém novo entra na lista. O que conferir?',
      resposta: 'Veja o cartão “Formulário do site” (só administradores veem a situação). “Não está ligado” quer dizer que a conferência não achou, na página inicial do site, o formulário mandando as inscrições para cá: quem se inscreve lá pode estar tendo o endereço descartado sem saber. Um administrador resolve com “Ligar o formulário”.\n\n“Sem resposta agora” quer dizer que a conferência não respondeu naquele momento; toque em “Ver situação” daqui a pouco.',
      termos: ['formulário', 'home', 'site', 'inscrições pararam', 'Não está ligado'],
    },
    {
      id: 'restrito-a-administrador',
      pergunta: 'Por que o formulário do site aparece como “Restrito a administrador”?',
      resposta: 'A conferência do formulário da página inicial do site é visível só para administradores. Para quem tem outro papel, o cartão mostra esse selo em vez de “Ligado” ou “Não está ligado”, e o mesmo vale para o diagnóstico de “Conferir envio”.',
      termos: ['restrito', 'não consigo ver', 'permissão'],
    },
    {
      id: 'nao-consigo-acrescentar',
      pergunta: 'Por que não consigo acrescentar um endereço?',
      resposta: 'O botão “Acrescentar” só habilita com a declaração de consentimento marcada. Se ele reclamar, veja a mensagem: “Este endereço já está na lista” (já confirmou) ou “Este endereço pediu para sair da lista”. Quem saiu só volta pelo formulário do site, pela própria mão.',
      termos: ['Este endereço já está na lista.', 'Este endereço pediu para sair da lista.', 'Endereço de e-mail inválido.', 'botão desabilitado'],
    },
    {
      id: 'apagar-ou-sair',
      pergunta: 'Qual a diferença entre apagar alguém e “Saiu da lista”?',
      resposta: '“Saiu da lista” é quem pediu para parar de receber: o endereço continua guardado, e a equipe não consegue inscrevê-lo de novo. Apagar (só administradores) some com o registro de vez, para atender a um pedido de eliminação dos dados; se a pessoa se inscrever depois, entra como nova.\n\nApagar não tem volta.',
      termos: ['descadastrar', 'excluir', 'remover', 'lgpd', 'eliminação', 'desfazer'],
    },
    {
      id: 'quem-recebe',
      pergunta: 'Quem recebe uma edição?',
      resposta: 'Só quem está “Confirmado”. Se ninguém confirmou, a edição falha em vez de sair para ninguém. Com mais de 1.000 pessoas confirmadas, nada é enviado: o envio de uma vez só não aguenta esse tamanho, e meia remessa seria pior.',
      termos: ['destinatários', 'para quem vai', 'Não há nenhum inscrito confirmado para receber esta edição.', 'limite'],
    },
    {
      id: 'situacao-da-edicao',
      pergunta: 'O que significam “Enviada”, “Agendada” e “Falhou” em “Edições enviadas”?',
      resposta: '“Enviada”: a edição saiu, e a linha mostra para quantas pessoas. “Agendada”: a remessa foi entregue ao serviço de envio para sair no horário do pacote, e a linha continua assim mesmo depois desse horário. “Falhou”: não saiu, ou saiu só em parte; o motivo aparece em vermelho, e dá para reprocessar no pacote, em “Publicações”.\n\nEdição ainda em preparo no pacote também aparece, com a situação de lá (como “gerada” ou “pronta”); a lista mostra as 20 mais recentes.',
      termos: ['edição', 'status', 'agendada', 'falhou', 'enviada', 'gerada', 'pronta'],
    },
    {
      id: 'reprocessar-edicao',
      pergunta: 'Reprocessar uma edição que falhou manda de novo para todo mundo?',
      resposta: 'Sim. “Reprocessar”, no pacote, envia a edição outra vez para toda a lista confirmada. Se o motivo em vermelho termina com “Saíram … antes da falha”, parte da lista já recebeu e vai receber de novo; leve isso em conta antes de reprocessar.',
      termos: ['reprocessar', 'reenviar edição', 'duplicado', 'saíram antes da falha', 'tentar de novo'],
    },
    {
      id: 'nao-vejo-todos',
      pergunta: 'Por que não vejo todo mundo na tabela?',
      resposta: 'A tabela carrega as 500 inscrições mais recentes, e os filtros e a busca valem sobre elas. Os números do alto contam a lista inteira. Para ver todas as pessoas, use “Exportar”.',
      termos: ['500', 'faltando', 'sumiu', 'lista incompleta'],
    },
    {
      id: 'grafico-inscricoes',
      pergunta: 'O que conta o gráfico “Inscrições por mês”?',
      resposta: 'Quantas inscrições entraram em cada um dos últimos seis meses, pela data da inscrição, em qualquer situação: inclui quem ainda não confirmou e quem já saiu. O gráfico só aparece quando há ao menos uma inscrição, em qualquer situação.',
      termos: ['crescimento', 'gráfico', 'mês'],
    },
    {
      id: 'origem',
      pergunta: 'O que quer dizer a coluna “Origem”?',
      resposta: '“Home” é quem se inscreveu pelo formulário da página inicial do site. “Manual” é quem alguém da equipe acrescentou com “Acrescentar”; nesse caso fica registrado quem acrescentou e que declarou ter o consentimento da pessoa.',
      termos: ['origem', 'home', 'manual', 'de onde veio'],
    },
  ],
  relacionadas: ['/redes', '/imprensa', '/registro'],
}

// ---------------------------------------------------------------- Imprensa e contatos

const IMPRENSA: GuiaDaArea = {
  href: '/imprensa',
  paraQueServe: 'O banco de contatos da filial: jornalistas, veículos e qualquer contato relevante, com a situação de cada e-mail. Daqui saem campanhas por e-mail, como um release, e a tela mostra quem abriu, quem clicou e quem saiu da lista. Com a Hunter.io ligada, dá para achar e verificar e-mails pelo site do veículo.',
  quemUsa: 'Toda a equipe vê o banco, cadastra, edita e importa contatos, usa a Hunter.io (quando ligada) e vê todas as campanhas. Criar e enviar campanhas é para administradores e editores. Remover um contato: administradores e quem o cadastrou.',
  tour: [
    {
      titulo: 'Imprensa e contatos',
      texto: 'O banco de contatos da filial: jornalistas, veículos e outros contatos relevantes. Daqui saem campanhas por e-mail, e a tela mostra quem abriu e quem clicou.',
    },
    {
      alvo: 'imprensa.abas',
      titulo: 'Contatos e Campanhas',
      texto: '“Contatos” é o banco, com a situação do e-mail e a leitura de cada pessoa. “Campanhas” mostra as taxas do período e tudo o que já saiu, visível para toda a equipe.',
      lado: 'bottom',
    },
    {
      alvo: 'imprensa.barra',
      titulo: 'Busca e filtros',
      texto: 'Busque por nome, veículo ou e-mail e filtre pela situação do e-mail, pela leitura (quem abre, quem não lê, quem saiu) e pela lista de origem. “Baixar CSV” leva o que o filtro mostra.',
    },
    {
      alvo: 'imprensa.novo-contato',
      titulo: 'Como um contato entra',
      texto: '“Novo contato” cadastra à mão e “Importar planilha” traz um CSV. Com a Hunter.io ligada, “Buscar por domínio” e “Encontrar e-mail” acham contatos pelo site do veículo.',
    },
    {
      alvo: 'imprensa.tabela',
      titulo: 'Marque e aja',
      texto: 'Marque contatos na primeira coluna para enviar uma campanha (administradores e editores) ou remover. A coluna “Leitura” mostra quantos envios cada pessoa abriu.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'cadastrar-contato',
      titulo: 'Cadastrar um contato à mão',
      passos: [
        'Na aba “Contatos”, toque em “Novo contato”.',
        'Preencha “Nome”, “Veículo / organização”, “Cargo”, “E-mail” e “Telefone”. Basta o nome ou o e-mail; o resto pode ficar em branco.',
        'Se quiser, preencha “Domínio”, “Tags” (separadas por vírgula) e “Notas”.',
        'Toque em “Salvar”.',
      ],
      dica: 'Cada e-mail só pode estar uma vez no banco. Se já existir, a tela avisa “Já existe um contato com este e-mail neste espaço.”',
    },
    {
      id: 'editar-contato',
      titulo: 'Corrigir os dados de um contato',
      passos: [
        'Ache o contato pela busca ou pelos filtros.',
        'Na coluna “Ações”, toque no lápis (“Editar”).',
        'Corrija o que precisar em “Editar contato”.',
        'Toque em “Salvar”.',
      ],
      dica: 'Trocou o e-mail? A situação ao lado continua a do endereço antigo: verifique de novo pelo escudo, com a Hunter.io ligada. Editar não tira ninguém de “Saiu da lista”.',
    },
    {
      id: 'importar-planilha',
      titulo: 'Importar uma planilha de contatos',
      passos: [
        'Salve a planilha como CSV (no Excel ou no Google Planilhas: Arquivo → Salvar como / Fazer download → CSV).',
        'Toque em “Importar planilha” e escolha o arquivo em “Arquivo .csv”.',
        'Confira o que foi entendido: quantos e-mails, quais colunas viraram e-mail, nome, organização, cargo e telefone, e as primeiras linhas.',
        'Dê um “Nome da lista”: ele vira etiqueta e serve para escolher esse grupo depois.',
        'Toque em “Importar” (o botão mostra quantos e-mails) e espere o resultado.',
      ],
      dica: 'Até 20.000 e-mails por arquivo; acima disso, divida. E-mail repetido não duplica: quem já existe ganha a lista nova e só tem preenchidos os campos que estavam vazios, e quem saiu da lista continua fora. Antes do primeiro envio para uma lista de origem incerta (comprada ou copiada da internet), vale verificar os e-mails.',
    },
    {
      id: 'buscar-por-dominio',
      titulo: 'Achar contatos de um veículo pelo domínio',
      quem: 'Com a Hunter.io ligada',
      passos: [
        'Toque em “Buscar por domínio”.',
        'Em “Domínio do veículo”, digite o endereço do site (por exemplo, oglobo.globo.com) e toque em “Buscar”.',
        'Confira quem vai entrar: quem ainda não está no banco já vem marcado; quem já está aparece como “já cadastrado” e não pode ser marcado.',
        'Confira o campo “Nome do veículo, para salvar junto com os contatos”.',
        'Toque em “Adicionar … selecionado(s)”.',
      ],
      dica: 'Cada busca traz até 20 e-mails e gasta uma consulta do plano da Hunter.io. Quando restam poucas buscas no mês, a tela avisa quantas sobram.',
    },
    {
      id: 'encontrar-email',
      titulo: 'Descobrir o e-mail de uma pessoa',
      quem: 'Com a Hunter.io ligada',
      passos: [
        'Toque em “Encontrar e-mail”.',
        'Preencha “Nome”, “Sobrenome” e “Domínio do veículo”. Veículo, cargo, telefone e notas são opcionais.',
        'Toque em “Encontrar e cadastrar”.',
        'Se a Hunter.io achar, o contato já entra no banco, com a situação do e-mail e a confiança ao lado. Se não vier “Válido”, confira o endereço antes de usar para algo importante.',
        'Se ela não achar, a tela diz isso em vermelho e nada é cadastrado; se você souber o e-mail por outra via, use “Novo contato”.',
      ],
      dica: 'A consulta gasta crédito do plano da Hunter.io mesmo quando não acha o e-mail.',
    },
    {
      id: 'verificar-email',
      titulo: 'Verificar se um e-mail existe',
      quem: 'Com a Hunter.io ligada',
      passos: [
        'Na linha do contato, na coluna “Ações”, toque no ícone de escudo (“Verificar e-mail com a Hunter.io”).',
        'Espere o ícone parar de girar. Se algo der errado, o motivo aparece em vermelho embaixo do nome do contato.',
        'Veja a nova situação embaixo do e-mail: “Válido”, “Arriscado” ou “Inválido”, com a confiança em porcentagem ao lado.',
      ],
      dica: 'Cada verificação gasta crédito do plano da Hunter.io. E-mail “Inválido” fica de fora de todas as campanhas.',
    },
    {
      id: 'enviar-campanha',
      titulo: 'Enviar uma campanha',
      quem: 'Administradores e editores',
      passos: [
        'Na aba “Campanhas”, toque em “Nova campanha”. (Ou, em “Contatos”, marque as pessoas e toque em “Enviar campanha”.)',
        'Em “Destinatários”, escolha a lista e o segmento, como “Engajados (abriram o último envio)”. O número ao lado diz quantas pessoas vão receber.',
        'Escreva o “Assunto” e a “Mensagem”. {nome} vira o primeiro nome de cada contato; linha em branco separa parágrafos.',
        'Para medir cliques, preencha “Link” e “Texto do link”.',
        'Toque em “Enviar para …” e confirme. O botão só habilita com assunto, mensagem e ao menos uma pessoa que pode receber.',
      ],
      dica: 'Quer revisar com calma? “Salvar rascunho” guarda a campanha em “Campanhas” → “Rascunhos”. Depois de enviada, não dá para desfazer.',
    },
    {
      id: 'continuar-rascunho',
      titulo: 'Continuar um rascunho de campanha',
      quem: 'Administradores e editores',
      passos: [
        'Na aba “Campanhas”, toque em “Rascunhos”.',
        'Toque no assunto do rascunho (ou no ícone “Editar e enviar”, no fim da linha).',
        'Em “Destinatários”, escolha de novo a lista e o segmento: o rascunho guarda o texto, não quem vai receber.',
        'Ajuste o texto e toque em “Enviar para …”, ou em “Salvar rascunho” para continuar depois.',
      ],
      dica: 'Para descartar, use a lixeira (“Apagar rascunho”) na linha dele. Rascunho enviado some de “Rascunhos” e passa a ser a própria campanha.',
    },
    {
      id: 'follow-up',
      titulo: 'Mandar um follow-up para quem não abriu',
      quem: 'Administradores e editores',
      passos: [
        'Na aba “Campanhas”, ache a campanha na lista.',
        'Na coluna “Follow-up”, toque em “Criar”.',
        'A nova campanha abre com o mesmo texto e só com quem recebeu e não abriu. Ajuste o assunto e a mensagem.',
        'Toque em “Enviar para …” e confirme.',
      ],
      dica: 'O “Criar” só aparece quando alguém que recebeu ainda não abriu. Quem saiu da lista ou tem e-mail “Inválido” fica de fora do follow-up também.',
    },
    {
      id: 'ver-quem-abriu',
      titulo: 'Ver quem abriu e clicou numa campanha',
      passos: [
        'Na aba “Campanhas”, toque no assunto da campanha (ou na seta do fim da linha).',
        'Em “Mensagem”, releia o que saiu.',
        'Em “Destinatários”, veja cada pessoa com “abriu”, “clicou”, “não abriu”, “falhou”, “saiu” ou “sem confirmação” (a mensagem foi preparada, mas a saída não foi confirmada).',
      ],
      dica: 'O seletor de período no alto muda as taxas do painel (“Taxa de abertura”, “Taxa de cliques” e as outras), não a lista de campanhas.',
    },
    {
      id: 'tirar-quem-nao-le',
      titulo: 'Tirar do banco quem não lê',
      quem: 'Administradores e quem cadastrou o contato',
      passos: [
        'Na aba “Contatos”, escolha no filtro de leitura “Não leem (3+ envios sem abrir)”.',
        'Marque a caixa do cabeçalho para selecionar todos do filtro.',
        'Toque em “Remover” e confirme.',
      ],
      dica: 'Remover não tem volta, e cada remoção leva no máximo 1.000 contatos. Para só deixar essas pessoas fora de um envio, escolha o segmento “Todos, menos quem não lê” na campanha.',
    },
    {
      id: 'baixar-contatos',
      titulo: 'Baixar os contatos em planilha',
      passos: [
        'Na aba “Contatos”, use a busca e os filtros para chegar ao grupo que você quer.',
        'Toque em “Baixar CSV”.',
        'Abra o arquivo no Excel ou no Google Planilhas: ele traz nome, veículo, cargo, e-mail, situação, confiança, telefone, tags, notas, envios, aberturas, envios seguidos sem abrir e a data de saída da lista.',
      ],
      dica: 'O arquivo leva todos os contatos do filtro, mesmo quando a tabela mostra só os 300 primeiros.',
    },
  ],
  perguntas: [
    {
      id: 'situacao-do-email',
      pergunta: 'O que querem dizer “Válido”, “Arriscado”, “Inválido” e “Não verificado”?',
      resposta: 'É o resultado da verificação pela Hunter.io: “Válido” foi confirmado; “Inválido” não existe e fica de fora de todas as campanhas; “Arriscado” não pôde ser confirmado (recebe campanhas, mas vale revisar); “Não verificado” ainda não passou pela verificação, como quem foi cadastrado à mão ou por planilha.\n\nA porcentagem ao lado é a confiança que a Hunter.io deu ao e-mail.',
      termos: ['status do e-mail', 'confiança', 'verificação', 'hunter'],
    },
    {
      id: 'quem-fica-de-fora',
      pergunta: 'Por que alguns contatos não entram na campanha?',
      resposta: 'Contato sem e-mail, com e-mail “Inválido” ou que saiu da lista fica de fora sempre, e isso é conferido de novo na hora de enviar. Quando você marca contatos, a barra de seleção mostra quantos “podem receber”.',
      termos: ['Nenhum dos contatos selecionados pode receber', 'podem receber', 'de fora', 'não recebeu'],
    },
    {
      id: 'saiu-da-lista',
      pergunta: 'Um contato saiu da lista. Dá para pôr de volta?',
      resposta: 'Não pela tela. A pessoa pediu para sair pelo link “Sair da lista”, que vai no rodapé de toda campanha, e nem editar o contato nem importar a planilha de novo mudam isso: ela continua no banco, marcada como “Saiu da lista” (o filtro “Saíram da lista” mostra quem está assim).\n\nPor isso, não remova quem saiu: o contato é o registro da saída. Removido, o mesmo e-mail volta como contato novo, apto a receber, se alguém importar a planilha de novo.',
      termos: ['descadastrou', 'descadastrado', 'reinscrever', 'voltar para a lista', 'remover quem saiu'],
    },
    {
      id: 'nao-leem',
      pergunta: 'O que é “Não leem” e “seguidos sem abrir”?',
      resposta: 'É a conta de campanhas seguidas que a pessoa recebeu sem abrir. A partir de 3, o contato ganha o selo “… seguidos sem abrir” e entra no filtro “Não leem (3+ envios sem abrir)”. Abrir qualquer campanha zera a conta.',
      termos: ['engajamento', 'não abre', 'inativos', 'limpar lista'],
    },
    {
      id: 'abertura-e-estimativa',
      pergunta: 'A taxa de abertura é exata?',
      resposta: 'Não, é uma estimativa. Alguns programas de e-mail abrem a mensagem sozinhos e outros bloqueiam imagens, o que conta aberturas a mais ou a menos. Cliques só são medidos quando a campanha tem “Link”.',
      termos: ['abertura', 'taxa', 'métricas', 'cliques', 'pixel'],
    },
    {
      id: 'nao-vejo-nova-campanha',
      pergunta: 'Por que não vejo “Nova campanha” nem “Enviar campanha”?',
      resposta: 'Criar e enviar campanhas é para administradores e editores. Com outro papel, você cadastra contatos, importa planilhas e acompanha as campanhas, mas não dispara. Se “Enviar campanha” aparece desabilitado, ou o envio de e-mail ainda não foi configurado, ou nenhum dos contatos marcados pode receber.',
      termos: ['Campanhas são para administradores e editores.', 'Disparar campanha é para administradores e editores.', 'permissão', 'disparar'],
    },
    {
      id: 'quem-remove',
      pergunta: 'Quem pode remover um contato?',
      resposta: 'Administradores e a pessoa que cadastrou o contato (numa planilha, quem importou). Na remoção de vários de uma vez, só saem os que você pode remover; os outros continuam no banco. Não dá para desfazer.',
      termos: ['Nenhum contato removido. Só administradores ou quem cadastrou podem remover.', 'apagar', 'excluir'],
    },
    {
      id: 'quem-ve-campanhas',
      pergunta: 'Quem vê as campanhas enviadas?',
      resposta: 'Toda a equipe. A aba “Campanhas” é o registro do que saiu, com quem enviou, a data, as taxas e a lista de destinatários. Os rascunhos também aparecem ali, mas só administradores e editores os editam, enviam ou apagam.',
      termos: ['histórico', 'rascunho', 'visibilidade'],
    },
    {
      id: 'situacao-da-campanha',
      pergunta: 'O que significam “Enviada”, “Parcial” e “Falhou” numa campanha?',
      resposta: '“Enviada”: todas as mensagens saíram; “Parcial”: parte saiu e parte não; “Falhou”: nenhuma saiu; “Rascunho”: ainda não foi enviada. A aba “Com falha” junta as parciais e as que falharam.\n\n“Enviando” aparece durante o envio. Se a campanha continuar assim depois de alguns minutos, o envio parou no meio: abra a campanha e veja quem ficou “sem confirmação”.',
      termos: ['status da campanha', 'parcial', 'falhou', 'erro no envio', 'enviando', 'travada'],
    },
    {
      id: 'busca-desligada',
      pergunta: 'O que é “Busca automática desligada”?',
      resposta: 'Sem a chave da Hunter.io, “Buscar por domínio”, “Encontrar e-mail” e a verificação de e-mail não aparecem. Um administrador cola a chave em Configurações → Integrações. O cadastro à mão e a importação de planilha continuam funcionando.',
      termos: ['hunter', 'chave', 'integração', 'buscar por domínio sumiu'],
    },
    {
      id: 'hunter-gasta',
      pergunta: 'Buscar e verificar pela Hunter.io gasta alguma coisa?',
      resposta: 'Sim: cada busca por domínio, cada “Encontrar e cadastrar” (ache ou não) e cada verificação gastam crédito do plano da Hunter.io. Cadastrar à mão e importar planilha não gastam.',
      termos: ['cota', 'créditos', 'plano', 'limite da hunter'],
    },
    {
      id: 'limite-por-campanha',
      pergunta: 'Tem limite de destinatários por campanha?',
      resposta: 'Sim, 1.000 contatos por campanha. Com mais do que isso, o botão de envio não habilita e a tela pede uma lista ou um segmento menor. Para alcançar mais gente, divida o envio em mais de uma campanha.',
      termos: ['No máximo 1000 por campanha', 'teto', 'limite'],
    },
    {
      id: 'enviados-no-mes',
      pergunta: 'O que é “Enviados este mês”?',
      resposta: 'A soma das mensagens que saíram nas campanhas enviadas no mês corrente, no horário de Brasília. Quando aparece um segundo número depois da barra, ele é o limite mensal configurado para a filial, mostrado como referência: a tela não trava o envio por causa dele.',
      termos: ['limite mensal', 'cota', 'mês', 'quantos enviamos'],
    },
    {
      id: 'listas',
      pergunta: 'O que são as listas?',
      resposta: 'São etiquetas (tags) nos contatos. A importação dá a todos da planilha o “Nome da lista”, e no cadastro você escreve as tags separadas por vírgula. Depois, o filtro “Todas as listas” e a escolha de destinatários da campanha usam essas etiquetas.',
      termos: ['tags', 'etiquetas', 'segmento', 'grupo'],
    },
    {
      id: 'desfazer-envio',
      pergunta: 'Dá para cancelar uma campanha depois de enviada?',
      resposta: 'Não. A tela pede confirmação antes de enviar justamente por isso. Para revisar com calma ou pedir a opinião de alguém, use “Salvar rascunho” e envie depois.',
      termos: ['cancelar', 'desfazer', 'voltar atrás'],
    },
  ],
  relacionadas: ['/newsletter', '/correio', '/configuracoes'],
}

// ---------------------------------------------------------------- Resultados

const RESULTADOS: GuiaDaArea = {
  href: '/impacto',
  paraQueServe: 'Resultados mostra o que aconteceu depois da publicação, nos últimos 30 dias: quantos pacotes e publicações saíram, em quais canais, e como andam os projetos ativos. Por enquanto, só com dados que a Redação registra; alcance, engajamento e dados do site entram quando as ferramentas de medição (analytics) forem conectadas, sem números estimados.',
  quemUsa: 'Toda a equipe vê os mesmos números, da filial inteira. É uma tela só de leitura: nada se edita aqui.',
  tour: [
    {
      alvo: 'resultados.aviso',
      titulo: 'O que esta tela mostra',
      texto: 'O efeito do que já saiu, nos últimos 30 dias. Por enquanto, só dados que a Redação registra; alcance e engajamento chegam quando as ferramentas de medição (analytics) forem conectadas.',
      lado: 'bottom',
    },
    {
      alvo: 'resultados.atividade',
      titulo: 'Atividade registrada',
      texto: '“Pacotes publicados”, “Publicações por canal”, “Canais ativos” e “Projetos ativos”. Os três primeiros contam só o que de fato foi publicado no período; o que falhou fica de fora.',
    },
    {
      alvo: 'resultados.canais',
      titulo: 'Distribuição por canal',
      texto: 'Quantas publicações cada canal teve nos últimos 30 dias, do que mais publicou ao que menos.',
    },
    {
      alvo: 'resultados.proximas',
      titulo: 'Próximas métricas',
      texto: 'O que ainda vai chegar: alcance, crescimento de seguidores, engajamento e os dados do site e do Google. Até lá, a tela não mostra nenhum número estimado.',
    },
    {
      alvo: 'resultados.projetos',
      titulo: 'Projetos em andamento',
      texto: 'Os projetos ativos, cada um com as pautas ligadas a ele (“Demandas”) e as que chegaram a “Pronto” (“Concluídas”). O cartão abre o projeto.',
    },
  ],
  tarefas: [
    {
      id: 'ver-o-que-saiu',
      titulo: 'Ver o que saiu nos últimos 30 dias',
      passos: [
        'Abra “Resultados”, no grupo Análise do menu.',
        'Em “Atividade registrada”, leia quantos pacotes e quantas publicações saíram e em quantos canais.',
        'Em “Distribuição por canal”, veja quanto cada canal publicou.',
        'Para ver cada publicação, com data e endereço, abra o “Histórico”. O botão “Ver publicações”, no alto, leva aos pacotes, em “Publicações”.',
      ],
    },
    {
      id: 'acompanhar-projetos',
      titulo: 'Acompanhar os projetos em andamento',
      passos: [
        'Desça até “Projetos em andamento”.',
        'Em cada cartão, compare “Demandas” (todas as pautas do projeto) com “Concluídas” (as que chegaram a “Pronto”).',
        'Toque no cartão para abrir o projeto, ou em “Abrir projetos” para ver todos.',
      ],
    },
    {
      id: 'ver-outro-periodo',
      titulo: 'Ver um período diferente de 30 dias',
      passos: [
        'Abra o “Histórico”.',
        'No seletor de período, escolha “Últimos 90 dias” ou “Tudo”.',
        'Se quiser, filtre por canal: a contagem de publicações e falhas acima da tabela acompanha o filtro.',
        'Para levar os números para uma planilha, toque em “Baixar CSV”.',
      ],
      dica: 'Resultados mostra sempre os últimos 30 dias; não há seletor de período nesta tela.',
    },
  ],
  perguntas: [
    {
      id: 'sem-alcance',
      pergunta: 'Por que não vejo alcance, curtidas nem visitas do site?',
      resposta: 'Porque essas fontes ainda não estão conectadas. Esta primeira versão usa só o que a Redação já registra com segurança. Alcance, visualizações, seguidores, engajamento e dados do site vão aparecer quando as ferramentas de medição (analytics) forem ligadas, sem números estimados ou inventados.',
      termos: ['analytics', 'alcance', 'curtidas', 'engajamento', 'seguidores', 'google', 'visualizações'],
    },
    {
      id: 'mudar-periodo',
      pergunta: 'Dá para mudar o período?',
      resposta: 'Não nesta tela: ela mostra sempre os últimos 30 dias. Para outros períodos, use o “Histórico”, que tem “Últimos 90 dias” e “Tudo”, e baixe o CSV se precisar.',
      termos: ['período', 'mês passado', 'ano', 'datas'],
    },
    {
      id: 'pacote-ou-publicacao',
      pergunta: 'Qual a diferença entre “Pacotes publicados” e “Publicações por canal”?',
      resposta: 'O pacote é o conteúdo; cada destino dele (site, Instagram, newsletter…) é uma publicação. Um pacote que saiu no site e no Instagram conta 1 em “Pacotes publicados” e 2 em “Publicações por canal”.',
      termos: ['pacote', 'destino', 'contagem'],
    },
    {
      id: 'o-que-conta-no-periodo',
      pergunta: 'Uma matéria publicada há meses e editada ontem entra na conta?',
      resposta: 'Não. O corte é pela data em que o destino foi publicado, não pela última edição. E só conta o que consta como publicado: o que falhou fica de fora (as falhas estão no “Histórico”), e o que ainda está agendado também.',
      termos: ['recorte', 'data', 'editada', 'falhas', 'agendada'],
    },
    {
      id: 'canais-ativos',
      pergunta: 'O que conta como “Canais ativos”?',
      resposta: 'Os canais com pelo menos uma publicação registrada nos últimos 30 dias. Canal conectado que não publicou nada no período não entra.',
      termos: ['canais', 'redes', 'ativos'],
    },
    {
      id: 'projetos-na-tela',
      pergunta: 'Quais projetos aparecem em “Projetos em andamento”, em Resultados?',
      resposta: 'Os projetos ativos (ainda não concluídos), dos atualizados mais recentemente para os mais antigos, até 8. O número em “Projetos ativos” vem da mesma lista, então também para em 8. Para ver todos, toque em “Abrir projetos”.',
      termos: ['projetos', 'demandas', 'concluídas', 'campanhas', 'eventos'],
    },
  ],
  relacionadas: ['/registro', '/redes', '/projetos', '/dashboard'],
}

// ---------------------------------------------------------------- Histórico

const HISTORICO: GuiaDaArea = {
  href: '/registro',
  paraQueServe: 'O Histórico é o registro de tudo o que a Redação colocou no ar: uma linha para cada destino de um pacote que foi publicado ou que falhou, com a data, o canal e o endereço. Serve para conferir o que saiu, achar o que ficou pelo caminho e prestar contas.',
  quemUsa: 'Toda a equipe vê o mesmo Histórico e pode filtrar, baixar o CSV e usar “Conferir situação”. Tentar de novo o que falhou é feito no pacote, em “Publicações”.',
  tour: [
    {
      titulo: 'O Histórico',
      texto: 'Uma linha para cada destino que foi ao ar ou falhou: quando, em qual canal e em qual endereço. É o lugar para conferir e prestar contas do que saiu.',
    },
    {
      alvo: 'historico.filtros',
      titulo: 'Busca e filtros',
      texto: 'Procure por título, canal ou endereço e filtre por canal e período (abre em “Últimos 30 dias”). “Baixar CSV” leva para a planilha exatamente o que o filtro mostra.',
      seAusente: 'pular',
    },
    {
      alvo: 'historico.conferir',
      titulo: 'Conferir situação',
      texto: 'Aparece quando há envio às redes cujo resultado ainda não voltou. O botão pergunta de novo ao serviço que publica nas redes (o Upload-Post) e atualiza o endereço e a situação.',
      seAusente: 'pular',
    },
    {
      alvo: 'historico.tabela',
      titulo: 'Cada linha',
      texto: '“Quando”, “Canal”, “O que saiu” (abre o pacote em “Publicações”), “Situação” e “Endereço”. Nas falhas, o motivo aparece em vermelho embaixo do título.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'achar-publicacao',
      titulo: 'Achar quando e onde algo foi publicado',
      passos: [
        'Abra “Histórico”, no grupo Análise do menu.',
        'Digite parte do título, do canal ou do endereço em “Buscar por título, canal ou endereço…”.',
        'Se precisar, troque “Todos os canais” por um canal e o período por “Últimos 90 dias” ou “Tudo”.',
        'Na linha, “Quando” diz a data e a hora, e “Abrir” leva ao endereço publicado.',
      ],
    },
    {
      id: 'tentar-de-novo',
      titulo: 'Ver o que falhou e tentar de novo',
      passos: [
        'Procure as linhas com “Falhou” na coluna “Situação”. O total de falhas aparece em vermelho acima da tabela.',
        'Leia o motivo, em vermelho embaixo do título.',
        'Toque no título para abrir o pacote em “Publicações”.',
        'No destino que falhou, toque em “Reprocessar”.',
      ],
      dica: 'Num envio às redes, “Reprocessar” confere antes se o post já saiu, para não publicar duas vezes. Numa edição da newsletter, não: ela sai de novo para toda a lista confirmada, e quem recebeu antes da falha recebe outra vez.',
    },
    {
      id: 'conferir-situacao',
      titulo: 'Atualizar envios que ainda não voltaram',
      passos: [
        'Quando há envio às redes sem resposta, o botão “Conferir situação” aparece ao lado dos filtros.',
        'Toque nele e espere.',
        'Leia o recado: “… atualizado(s).” quando algo mudou, ou “Nada mudou ainda.”',
      ],
    },
    {
      id: 'prestar-contas',
      titulo: 'Baixar o histórico para prestar contas',
      passos: [
        'Ajuste a busca, o canal e o período até a tabela mostrar o que você quer.',
        'Toque em “Baixar CSV”.',
        'Abra o arquivo no Excel ou no Google Planilhas: ele traz data, canal, formato, título, situação, endereço e erro.',
      ],
    },
  ],
  perguntas: [
    {
      id: 'o-que-aparece',
      pergunta: 'O que aparece no Histórico?',
      resposta: 'Cada destino de um pacote (site, cada rede, newsletter) que consta como publicado ou que falhou. O que ainda está em preparo ou agendado não aparece. A tela carrega os 300 registros mais recentes.',
      termos: ['registro', 'log', 'o que saiu', 'lista de publicações'],
    },
    {
      id: 'data-em-quando',
      pergunta: 'Qual data aparece em “Quando”?',
      resposta: 'No que foi publicado, a hora em que saiu. No que falhou, a hora da tentativa. As horas estão no horário de Brasília, e a lista vem do mais recente para o mais antigo.',
      termos: ['data', 'hora', 'ordem'],
    },
    {
      id: 'sem-link-do-canal',
      pergunta: 'O que quer dizer “sem link do canal”?',
      resposta: 'Que o canal não devolveu o endereço do post. Nem todo canal devolve. Numa rede, pode ser que o resultado do envio ainda não tenha voltado: nesse caso aparece o botão “Conferir situação”, que pergunta de novo.',
      termos: ['link', 'endereço', 'url', 'sem endereço'],
    },
    {
      id: 'agendado-nao-aparece',
      pergunta: 'Agendei uma publicação e ela não aparece. Por quê?',
      resposta: 'O Histórico só mostra o que consta como publicado ou que falhou. Enquanto espera o horário, a publicação está no pacote, em “Publicações”, e no “Calendário”. Nas redes, ela entra aqui quando a saída é confirmada.\n\nA edição da newsletter agendada é um caso à parte: continua como “Agendada” em “Edições enviadas”, na Newsletter, e não entra no Histórico.',
      termos: ['agendada', 'na fila', 'programada', 'sumiu'],
    },
    {
      id: 'historico-ou-publicacoes',
      pergunta: 'Qual a diferença entre o Histórico e “Publicações”?',
      resposta: '“Publicações” é onde se monta e se publica o pacote. O Histórico é só o registro do resultado: uma linha por destino que saiu ou falhou, de todos os pacotes juntos, para conferir e prestar contas.',
      termos: ['publicações', 'pacotes', 'hub', 'redes'],
    },
    {
      id: 'apagar-linha',
      pergunta: 'Dá para apagar uma linha do Histórico?',
      resposta: 'Não. O Histórico não tem botão de apagar: ele é o registro do que aconteceu, inclusive das falhas. Quando uma falha é resolvida com “Reprocessar”, a mesma linha passa a aparecer como “Publicado”.',
      termos: ['apagar', 'excluir', 'limpar', 'remover'],
    },
  ],
  relacionadas: ['/redes', '/impacto', '/calendario'],
}

export const guias: GuiaDaArea[] = [NEWSLETTER, IMPRENSA, RESULTADOS, HISTORICO]
