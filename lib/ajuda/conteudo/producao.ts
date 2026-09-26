import type { GuiaDaArea } from '../tipos'

/**
 * A ajuda do grupo Produção do menu: Publicações (/redes, com o pacote em
 * /redes/[id]), Biblioteca de mídia (/biblioteca) e Acervo (/acervo).
 *
 * Cada frase tem apoio no código:
 * - Publicações: app/(app)/redes, components/app/hub/** (hub.tsx e
 *   novo-pacote.tsx), app/actions/pacotes.ts, app/actions/arquivos.ts,
 *   lib/publicacao/** (canais, status-do-pacote), lib/newsletter/envio.ts
 *   e app/api/redes/imagens;
 * - Biblioteca: app/(app)/biblioteca, lib/storage.ts, app/api/files/** e
 *   autorizarUsoDeImagem em app/actions/arquivos.ts;
 * - Acervo: app/(app)/acervo, components/app/acervo/**, app/actions/acervo.ts,
 *   lib/acervo/regras.ts e docs/acervo.md.
 * Quem pode o quê: lib/permissoes.ts (biblioteca.apagar_de_outros,
 * biblioteca.liberar_terceiros, acervo.ver, acervo.gerenciar).
 *
 * Os alvos `publicacoes.*`, `biblioteca.*` e `acervo.*` são marcados com
 * `data-ajuda` nessas telas. Mudou a tela ou a regra, muda aqui no mesmo PR
 * (docs/AJUDA.md).
 */

// ---------------------------------------------------------------- Publicações

const PUBLICACOES: GuiaDaArea = {
  href: '/redes',
  paraQueServe: 'Publicações é onde a notícia sai do Palácio Virtual. Cada pacote é uma notícia com vários destinos: a página no site, a newsletter e as redes (Instagram, Facebook, LinkedIn e outras). Você escreve a notícia uma vez, e cada destino recebe uma versão adaptada ao limite dele.',
  quemUsa: 'Toda a equipe do Palácio Virtual vê os pacotes, monta, pede aprovação e publica. Liberar para publicação uma mídia marcada como “uso interno” (material de terceiro) é só de administradores.',
  tour: [
    {
      titulo: 'Publicações',
      texto: 'Aqui ficam os pacotes. Cada pacote é uma notícia com os seus destinos: o site, a newsletter e as redes. O trabalho acontece dentro do pacote.',
    },
    {
      alvo: 'publicacoes.novo',
      titulo: 'Começar um pacote',
      texto: 'O botão “Novo pacote” cria um pacote em branco e abre na hora. Para partir de uma matéria pronta, use “Criar pacote de publicação” na tela da matéria.',
      lado: 'bottom',
    },
    {
      alvo: 'publicacoes.lista',
      titulo: 'Os pacotes',
      texto: 'Cada linha é um pacote, com os destinos e a situação (“Rascunho”, “Em aprovação”, “Publicado”…). Um destino que já saiu vira link para ver como ficou.',
    },
    {
      alvo: 'publicacoes.cerebro',
      titulo: 'Sugestões do Cérebro',
      texto: '“Sugestões do Cérebro” fica recolhido abaixo da lista. Abra para ver pautas sugeridas; “Trazer para o hub” cria um pacote em rascunho, sem publicar nada.',
    },
  ],
  telas: [
    {
      caminho: '/redes/[id]',
      rotulo: 'Pacote',
      tour: [
        {
          titulo: 'O pacote',
          texto: 'Um pacote é uma notícia com vários destinos. Você escreve a notícia como ela vai sair no site, e cada rede recebe uma versão adaptada, atualizada enquanto você digita.',
        },
        {
          alvo: 'publicacoes.trilho',
          titulo: 'Os destinos',
          texto: 'No trilho ficam os destinos. “A notícia” é a base e vem primeiro; as redes vêm depois. A bolinha colorida mostra a situação de cada um.',
          lado: 'bottom',
        },
        {
          alvo: 'publicacoes.adicionar-destino',
          titulo: 'Adicionar uma rede',
          texto: 'O botão “Adicionar destino” abre a lista de canais e formatos (Feed, Stories, Reels…), com a newsletter junto. Rede com a conta não conectada aparece apagada.',
          lado: 'bottom',
          seAusente: 'pular',
        },
        {
          alvo: 'publicacoes.editor',
          titulo: 'Onde se escreve',
          texto: 'Com “A notícia” aberta, escreva “Título”, “Linha fina” e “Texto da matéria”. Com uma rede aberta, você revê a legenda e as mídias daquele destino.',
        },
        {
          alvo: 'publicacoes.midias',
          titulo: 'Mídias do pacote',
          texto: 'Toque nas fotos e vídeos que vão junto, ou use “Enviar foto ou vídeo”. Cada rede escolhe entre essas mídias; o número na foto é a ordem.',
          seAusente: 'pular',
        },
        {
          alvo: 'publicacoes.previa',
          titulo: 'Prévia e validação',
          texto: 'A prévia mostra como o destino aberto vai sair, e a “Validação” lista o que falta corrigir. Com erro, o destino não pode ser marcado como pronto.',
        },
        {
          alvo: 'publicacoes.acoes',
          titulo: 'Aprovar e publicar',
          texto: 'A barra de baixo mostra se está “Salvo” e traz “Pedir aprovação” e “Publicar prontos”. Antes de sair, uma janela confirma o que vai e quanto gasta do plano.',
          lado: 'top',
        },
      ],
    },
  ],
  tarefas: [
    {
      id: 'criar-pacote',
      titulo: 'Criar um pacote do zero',
      passos: [
        'Em “Publicações”, toque em “Novo pacote”. (Também dá pelo botão “Criar” do topo, em “Nova publicação”.)',
        'O pacote abre com “A notícia” escolhida no trilho. No alto, dê um nome interno ao pacote: ele não é publicado.',
        'Preencha “Título”, “Linha fina” (opcional) e “Texto da matéria”, do jeito que a notícia vai sair no site.',
        'Em “Mídias do pacote”, toque nas fotos e vídeos que vão junto. Para subir uma nova, use “Enviar foto ou vídeo”, marque a confirmação de autorização de uso de imagem e toque em “Enviar”.',
        'Em “Rodapé das fotos na página”, escreva a legenda e o crédito de cada foto e escolha em “Onde entra”.',
        'Espere a barra de baixo mostrar “Salvo”: o pacote salva sozinho.',
      ],
      dica: 'O pacote salva uns 4 segundos depois da última tecla. Enquanto a barra mostrar “Alterações pendentes”, não feche a aba.',
    },
    {
      id: 'pacote-de-materia',
      titulo: 'Transformar uma matéria em pacote',
      passos: [
        'Abra a matéria já salva.',
        'Desça até “Publicar esta matéria”.',
        'Toque em “Criar pacote de publicação”.',
        'O pacote abre com o título, a linha fina e o texto da matéria. Confira e siga para os destinos.',
      ],
    },
    {
      id: 'adicionar-rede',
      titulo: 'Mandar a notícia para uma rede',
      passos: [
        'No trilho, toque em “Adicionar destino”.',
        'Digite a rede ou o formato em “Buscar canal ou formato…” (por exemplo, Instagram ou Reels).',
        'Toque no formato. O destino entra no trilho, já aberto, com uma versão adaptada da notícia.',
        'Confira a “Legenda”, as “Mídias deste destino”, a prévia e a “Validação”.',
        'Se precisar, ajuste. Qualquer ajuste no destino (legenda, mídias, enquadramento) deixa ele “escrita à mão”: ele para de acompanhar a notícia.',
      ],
      dica: 'Rede que aparece como “conta não conectada” não pode ser escolhida: fale com um administrador. Com a IA configurada, “Adaptar com IA” propõe a legenda no limite da rede; ela só entra se você tocar em “Usar esta”.',
    },
    {
      id: 'escolher-fotos-da-rede',
      titulo: 'Escolher as fotos de uma rede e o enquadramento',
      passos: [
        'Abra o destino da rede no trilho.',
        'Em “Mídias deste destino”, toque nas mídias do pacote que vão nessa rede. O número em cada uma é a ordem; a primeira é a capa.',
        'Em “Enquadramento” (aparece com foto num formato de proporção fixa, como 4:5), arraste a janela sobre a foto ou toque no ponto que importa até o corte ficar bom.',
        'Confira em “Como vai sair” e na prévia do destino.',
      ],
      dica: 'Cada formato tem o seu limite de mídias, e alguns aceitam só foto ou só vídeo: o limite aparece ao lado de “Mídias deste destino”. Mexer nas mídias ou no enquadramento também deixa o destino “escrita à mão”.',
    },
    {
      id: 'pedir-aprovacao',
      titulo: 'Pedir aprovação de um pacote',
      passos: [
        'Se quiser deixar um recado, abra “Endereço, agendamento e notas” e escreva em “Notas para quem aprova” (não é publicado).',
        'Na barra de baixo, toque em “Pedir aprovação”.',
        'Em “Quem precisa aprovar”, marque as pessoas e toque em “Enviar”.',
        'Quem você marcou recebe um aviso e vê o pacote inteiro, site e cada rede, em “Aprovações”.',
        'O botão passa a “Em aprovação”. Publique depois que a aprovação sair.',
      ],
    },
    {
      id: 'publicar-pacote',
      titulo: 'Publicar o pacote',
      passos: [
        'Abra cada destino e confira a prévia e a “Validação”. “Nada a corrigir neste destino.” quer dizer que ele pode sair.',
        'Se quiser, toque em “Marcar como pronta” em cada destino.',
        'Na barra de baixo, toque em “Publicar prontos”.',
        'Na janela “Confirmar publicação”, veja o que vai sair. Os destinos com “— sem pendências, vai junto” podem ser desmarcados.',
        'Confira quantas publicações do plano o envio consome e toque em “Confirmar”.',
        'O resultado aparece na barra de baixo e em cada destino do trilho.',
      ],
      dica: 'Destino sem erro vai junto mesmo sem “Marcar como pronta”. Destino com erro fica de fora e aparece em “Ficam de fora, com pendência”. Com horário em “Agendar o pacote”, o botão vira “Agendar prontos”.',
    },
    {
      id: 'agendar-pacote',
      titulo: 'Agendar a publicação',
      passos: [
        'Com “A notícia” aberta, toque em “Endereço, agendamento e notas”.',
        'Em “Agendar o pacote”, escolha o dia e a hora (horário de Brasília).',
        'Para uma rede sair em outra hora, abra o destino dela e preencha “Horário deste destino”. Vazio, vale o horário do pacote.',
        'Toque em “Agendar prontos” e confirme.',
        'Os destinos agendados ficam com a bolinha azul e aparecem no Calendário.',
      ],
      dica: 'O horário vale para as redes e a newsletter. A página do site sobe na hora em que você confirma.',
    },
    {
      id: 'corrigir-noticia-no-site',
      titulo: 'Corrigir uma notícia que já está no site',
      passos: [
        'Em “Publicações”, abra o pacote.',
        'Com “A notícia” aberta, corrija o texto, as fotos, as legendas ou a posição delas.',
        'Toque em “Atualizar a página no site”.',
        'Espere o aviso “Página atualizada no site.” na barra de baixo.',
      ],
      dica: 'O endereço e a data de publicação continuam os mesmos, e o que já saiu nas redes não muda.',
    },
    {
      id: 'reprocessar-destino',
      titulo: 'Tentar de novo um destino que falhou',
      passos: [
        'No trilho, abra o destino que falhou (bolinha vermelha).',
        'Leia o motivo no aviso vermelho, logo abaixo do nome do destino.',
        'Se nada precisa mudar no destino (a conta já foi conectada, a rede voltou), toque em “Reprocessar”: só esse destino sai de novo.',
        'Se precisa corrigir a legenda ou a mídia, corrija: o destino deixa de contar como falho e sai pelo “Publicar prontos”, como os outros.',
      ],
      dica: 'Antes de tentar de novo, o Palácio Virtual confere se o post não saiu mesmo, para não publicar duas vezes.',
    },
    {
      id: 'melhorar-texto-com-ia',
      titulo: 'Melhorar o texto da matéria com IA',
      passos: [
        'Escreva a matéria primeiro: a IA melhora texto, não inventa um.',
        'Na barra de botões do “Texto da matéria”, toque em “Melhorar com IA”.',
        'Escolha o formato (por exemplo, “Jornalístico” ou “Institucional”) e toque em “Gerar sugestão”.',
        'Leia a sugestão (e a lista “Para conferir”, quando houver). Toque em “Usar este texto” ou em “Descartar”.',
        'Se mudar de ideia depois de usar, toque em “Desfazer”.',
      ],
      dica: 'Os botões de IA só aparecem quando a IA está configurada. A sugestão nunca entra no texto sozinha.',
    },
    {
      id: 'criar-imagem-com-ia',
      titulo: 'Criar uma imagem com IA',
      passos: [
        'Escreva a matéria primeiro: as sugestões de imagem saem do texto.',
        'Com “A notícia” aberta, em “Mídias do pacote”, toque em “Criar imagem com IA”.',
        'Toque num dos cartões de “Comece por um destes” (ou em “Pedir ideias à IA”) e ajuste o texto em “O pedido”.',
        'Em “Formatos”, deixe marcados só os que servem (“Site”, “Feed”, “Stories”) e escolha a “Qualidade”.',
        'Toque em “Gerar 3 imagens” (o número acompanha os formatos marcados) e espere.',
        'As imagens entram nas “Mídias do pacote” com o selo “IA”. A que não servir, toque em “Descartar”: o arquivo é apagado.',
      ],
      dica: 'Cada imagem conta no teto mensal de imagens. Os pedidos prontos evitam pessoas e o emblema da cruz vermelha; se escrever o pedido à mão, mantenha isso. Num destino de rede, “Gerar imagem” cria uma só, na proporção daquela rede.',
    },
    {
      id: 'mandar-newsletter',
      titulo: 'Mandar a notícia na newsletter',
      passos: [
        'No trilho, toque em “Adicionar destino” e, em “Newsletter”, toque em “Edição”.',
        'Confira o “Assunto do e-mail” (ele vem do título), a “Chamada” e, se quiser, o “Texto do botão”.',
        'Revise o texto do e-mail (o campo “Legenda”) e veja a “Prévia do e-mail”.',
        'Publique com “Publicar prontos”, junto com o resto do pacote, ou agende.',
      ],
      dica: 'O e-mail vai para quem confirmou a inscrição na newsletter. O botão para a matéria e a foto de capa só vão se o pacote também publicar no site. E-mail enviado não volta: confira antes.',
    },
  ],
  perguntas: [
    {
      id: 'o-que-e-pacote',
      pergunta: 'O que é um pacote?',
      resposta: 'É uma notícia com todos os lugares para onde ela vai: a página no site, a newsletter e cada rede, cada um num formato (Feed, Stories, Reels…). Você escreve a notícia uma vez, em “A notícia”, e cada destino recebe uma versão adaptada ao limite dele.',
      termos: ['hub', 'post', 'publicação', 'multicanal', 'destino'],
    },
    {
      id: 'a-noticia-nao-sai',
      pergunta: 'Por que não consigo tirar “A notícia” do trilho?',
      resposta: '“A notícia” é a base do pacote: é onde o texto é escrito, e as redes nascem dela. Se não quiser criar a página no site desta vez, abra “Endereço, agendamento e notas” e marque “Não publicar no site desta vez”. O texto continua ali e as redes continuam saindo dele.',
      termos: ['remover site', 'sem site', 'só redes', 'página no site'],
    },
    {
      id: 'bolinhas-do-trilho',
      pergunta: 'O que significam as bolinhas coloridas no trilho?',
      resposta: 'Cinza: gerada, revise antes de publicar; amarela: em ajuste, há erro na variante; verde: pronta ou publicada; vermelha: bloqueada (falta algo essencial) ou falhou; azul: agendada ou publicando; bem clara: ignorada neste pacote.\n\nNo computador, pare o mouse sobre uma rede no trilho para ler a situação dela.',
      termos: ['semáforo', 'cor', 'status do destino', 'estado'],
    },
    {
      id: 'situacao-do-pacote',
      pergunta: 'O que quer dizer a situação de cada pacote na lista?',
      resposta: '“Rascunho”: nada saiu ainda; “Em aprovação”: foi enviado para aprovação e ainda não publicou; “Parcialmente publicado”: algum destino saiu e outro ficou para trás ou falhou; “Publicado”: tudo o que ia sair saiu ou está agendado; “Falhou”: nada saiu e houve falha.\n\nA situação é refeita a cada publicação, a partir dos destinos.',
      termos: ['status', 'parcial', 'rascunho', 'em aprovação'],
    },
    {
      id: 'pacote-antigo',
      pergunta: 'Não acho um pacote antigo na lista. Onde ele está?',
      resposta: 'A lista de Publicações mostra os 40 pacotes mexidos por último, sem os arquivados. O que já saiu ou falhou aparece também no “Histórico”, com link para o pacote.',
      termos: ['sumiu', 'pacote antigo', 'histórico', 'lista'],
    },
    {
      id: 'escrita-a-mao',
      pergunta: 'Editei a legenda de uma rede e ela parou de acompanhar a notícia. E agora?',
      resposta: 'Qualquer ajuste num destino (legenda, mídias, enquadramento, horário) deixa ele marcado como “escrita à mão — não acompanha mais a notícia”, para a sua edição não ser apagada. Para voltar a seguir a notícia, abra o destino e toque em “Voltar a seguir a notícia”: a edição é descartada e a versão é gerada de novo.',
      termos: ['descolada', 'legenda não atualiza', 'variante', 'editada à mão'],
    },
    {
      id: 'instagram-sem-texto',
      pergunta: 'Por que o Instagram não tem post só de texto?',
      resposta: 'O Instagram não aceita post sem foto ou vídeo. Por isso os formatos dele (Feed, Stories e Reels) pedem pelo menos uma mídia. Reels aceita só vídeo.',
      termos: ['instagram', 'texto', 'sem foto', 'reels'],
    },
    {
      id: 'conta-nao-conectada',
      pergunta: 'Uma rede aparece como “conta não conectada”. O que faço?',
      resposta: 'A conta dessa rede ainda não está ligada ao Palácio Virtual, então ela não pode ser escolhida. Fale com um administrador.',
      termos: ['conectar rede', 'rede apagada', 'não conectada', 'upload-post'],
    },
    {
      id: 'cota-do-plano',
      pergunta: 'O que é o número de publicações do plano, na hora de publicar?',
      resposta: 'As redes saem pelo Upload-Post, que tem um limite de publicações no plano. A janela “Confirmar publicação” mostra quanto o envio consome. Site e newsletter não contam, e destinos com o mesmo texto e a mesma mídia saem numa chamada só.',
      termos: ['cota', 'limite', 'upload-post', 'plano'],
    },
    {
      id: 'nao-consigo-publicar',
      pergunta: 'Por que não consigo publicar o pacote?',
      resposta: 'Os motivos mais comuns: todo destino tem erro na “Validação”, e aí o botão “Publicar prontos” fica apagado; o pacote espera a aprovação (“Este pacote está em aprovação. Aguarde a decisão antes de publicar.”); ou quem aprovou pediu ajustes. Pacote arquivado também não publica.',
      termos: ['Nenhum destino pronto para publicar', 'Este pacote está em aprovação', 'A aprovação deste pacote pediu ajustes', 'botão desabilitado', 'erro ao publicar'],
    },
    {
      id: 'aprovacao-obrigatoria',
      pergunta: 'Preciso pedir aprovação antes de publicar?',
      resposta: 'A tela não obriga: pacote sem pedido de aprovação publica direto. Depois que você pede, ele só publica quando a aprovação for concluída.',
      termos: ['aprovar', 'revisão', 'sem aprovação'],
    },
    {
      id: 'link-da-materia-no-post',
      pergunta: 'Como ponho o link da matéria no post das redes?',
      resposta: 'Escreva {{URL_DA_MATERIA}} no texto, onde o endereço deve entrar. Na hora da publicação, ele vira o endereço da página no site ou, se você preencheu, o “Link já existente” (em “Endereço, agendamento e notas”). Sem endereço nenhum, os posts que usam o link não saem, para não publicar link quebrado.',
      termos: ['URL_DA_MATERIA', 'link', 'endereço da matéria', 'Reprocesse o site primeiro'],
    },
    {
      id: 'editar-post-publicado',
      pergunta: 'Dá para editar um post que já saiu numa rede?',
      resposta: 'Não. Destino publicado fica congelado como registro, e o post na rede não muda pelo Palácio Virtual. A página do site é a exceção: corrija em “A notícia” e toque em “Atualizar a página no site”. Newsletter enviada também não volta.',
      termos: ['corrigir post', 'editar publicação', 'congelado'],
    },
    {
      id: 'rede-depois',
      pergunta: 'Posso acrescentar uma rede a um pacote que já foi publicado?',
      resposta: 'Pode. Pacote publicado continua aberto: abra ele em “Publicações”, use “Adicionar destino”, confira e toque em “Publicar prontos”. O que já saiu não é publicado de novo.',
      termos: ['nova rede', 'republicar', 'acrescentar destino'],
    },
    {
      id: 'tirar-rede-do-pacote',
      pergunta: 'Como tiro uma rede do pacote?',
      resposta: 'No trilho, toque no X do cartão da rede e confirme (no computador, o X aparece quando o mouse passa sobre o cartão). Destino que já saiu não tem X: fica como registro. “A notícia” também não sai; para não criar a página no site, marque “Não publicar no site desta vez”.',
      termos: ['remover destino', 'apagar rede', 'excluir destino', 'tirar destino'],
    },
    {
      id: 'arquivar-pacote',
      pergunta: 'O que acontece quando arquivo um pacote?',
      resposta: 'Ele sai da lista de Publicações e fica congelado: não dá mais para editar, pedir aprovação nem publicar. O botão “Arquivar” não pede confirmação, e a tela não tem como desarquivar. O que já saiu continua no ar.',
      termos: ['arquivar', 'apagar pacote', 'desarquivar', 'Este pacote foi arquivado'],
    },
    {
      id: 'foto-nao-aparece',
      pergunta: 'Não acho uma foto da Biblioteca dentro do pacote. Por quê?',
      resposta: 'O pacote mostra as 60 fotos e vídeos mais recentes da Biblioteca; PDF e áudio não aparecem. Mídia de “uso interno” aparece apagada: é material de terceiro e só entra se um administrador tocar em “Liberar uso”.',
      termos: ['foto sumiu', 'mídia', 'biblioteca', 'uso interno'],
    },
    {
      id: 'falta-autorizar',
      pergunta: 'O que quer dizer “falta autorizar” numa foto?',
      resposta: 'Ninguém confirmou ainda a autorização de uso de imagem de quem aparece nela, e a peça não sai assim. Se a autorização existe, escolha a foto no pacote e toque em “Autorizar uso” e em “Confirmo” (na Biblioteca, o botão fica no cartão do arquivo). Isso fica registrado na Biblioteca e vale para todos os usos do arquivo.',
      termos: ['autorização de imagem', 'direito de imagem', 'pendente', 'LGPD'],
    },
  ],
  relacionadas: ['/biblioteca', '/aprovacoes', '/calendario', '/registro', '/newsletter'],
}

// ---------------------------------------------------------------- Biblioteca de mídia

const BIBLIOTECA: GuiaDaArea = {
  href: '/biblioteca',
  paraQueServe: 'A Biblioteca guarda as fotos, os vídeos, os áudios e os documentos de trabalho da equipe, com a autorização de uso de imagem de cada um. É dela que saem as mídias dos pacotes de Publicações. Os arquivos são privados: só quem entra no Palácio Virtual vê.',
  quemUsa: 'Toda a equipe envia, baixa e usa os arquivos. Cada pessoa exclui o que enviou; administradores e editores excluem de qualquer pessoa.',
  tour: [
    {
      titulo: 'Biblioteca de mídia',
      texto: 'Aqui ficam os arquivos da equipe: fotos, vídeos, áudios e documentos. São privados e servem de fonte para os pacotes de Publicações.',
    },
    {
      alvo: 'biblioteca.envio',
      titulo: 'Enviar um arquivo',
      texto: 'Escolha o arquivo, dê uma pasta e tags se quiser, e toque em “Enviar”. Vale PDF, Office, imagem, áudio ou vídeo, até 300 MB.',
    },
    {
      alvo: 'biblioteca.uso-de-imagem',
      titulo: 'Uso de imagem',
      texto: 'Diga se há autorização de quem aparece: “Tem autorização”, “Não informado” ou “Uso interno apenas”. Só arquivo com autorização vai para as redes ou para o site.',
    },
    {
      alvo: 'biblioteca.busca',
      titulo: 'Buscar e filtrar',
      texto: 'A busca procura no nome e nas tags. Os botões de tipo filtram a lista: “Fotos”, “Vídeos”, “Áudios” e “Documentos”; “Todos” volta a mostrar tudo.',
    },
    {
      alvo: 'biblioteca.pastas',
      titulo: 'Pastas',
      texto: 'Cada botão mostra os arquivos de uma pasta dada no envio. “Sem pasta” mostra o resto, e “Todas” volta a mostrar tudo.',
      seAusente: 'pular',
    },
    {
      alvo: 'biblioteca.arquivos',
      titulo: 'Os arquivos',
      texto: 'Cada cartão mostra quem enviou e o selo de uso: “Uso autorizado”, “Falta autorizar” ou “Uso interno”. Dele você baixa e, quando cabe, autoriza o uso ou exclui.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'enviar-arquivo',
      titulo: 'Enviar um arquivo',
      passos: [
        'Em “Enviar arquivo”, escolha o arquivo no seu computador ou celular.',
        'Em “Pasta”, escolha uma pasta que já existe ou escreva o nome de uma nova (opcional).',
        'Em “Tags”, escreva palavras separadas por vírgula (opcional).',
        'Em “Uso de imagem”, escolha “Tem autorização”, “Não informado” ou “Uso interno apenas”.',
        'Toque em “Enviar” e espere a porcentagem chegar ao fim.',
      ],
      dica: 'Pasta e tags só são escolhidas no envio: a tela não muda isso depois. Vale caprichar para achar o arquivo mais tarde.',
    },
    {
      id: 'autorizar-uso',
      titulo: 'Registrar a autorização de uso de imagem',
      passos: [
        'Ache o arquivo com o selo “Falta autorizar”.',
        'Toque em “Autorizar uso”.',
        'Leia a declaração e toque em “Confirmo”.',
        'O selo passa a “Uso autorizado”, e o arquivo pode ir para as redes e para o site.',
      ],
      dica: 'Só confirme se a autorização de quem aparece existe de verdade. A confirmação vale para todos os usos do arquivo.',
    },
    {
      id: 'achar-arquivo',
      titulo: 'Achar um arquivo',
      passos: [
        'Digite parte do nome ou uma tag em “Buscar arquivos e tags”.',
        'Se quiser, toque num tipo: “Fotos”, “Vídeos”, “Áudios” ou “Documentos”.',
        'Se houver pastas, toque numa delas em “Pastas:”.',
        'Para voltar a ver tudo, apague a busca e toque em “Todos” e em “Todas”.',
      ],
    },
    {
      id: 'baixar-arquivo',
      titulo: 'Baixar um arquivo',
      passos: [
        'Ache o arquivo na lista (a busca e os filtros ajudam).',
        'Toque em “Baixar”, no cartão dele.',
        'O arquivo desce com o nome com que foi enviado.',
      ],
    },
    {
      id: 'excluir-arquivo',
      titulo: 'Excluir um arquivo',
      passos: [
        'Ache o arquivo na lista.',
        'Toque na lixeira, no cartão dele.',
        'Confirme. A exclusão não pode ser desfeita.',
      ],
      dica: 'Antes, confira se o arquivo não está num pacote que ainda vai sair.',
      quem: 'Quem enviou o arquivo, editores e administradores',
    },
    {
      id: 'usar-em-publicacao',
      titulo: 'Usar um arquivo numa publicação',
      passos: [
        'Em “Publicações”, abra o pacote.',
        'Com “A notícia” aberta, vá até “Mídias do pacote”.',
        'Toque na foto ou no vídeo. O número que aparece é a ordem.',
        'Se a mídia estiver com “falta autorizar”, toque em “Autorizar uso” e em “Confirmo”.',
      ],
      dica: 'O pacote mostra as 60 fotos e vídeos mais recentes. PDF e áudio não entram em pacote.',
    },
  ],
  perguntas: [
    {
      id: 'quem-ve-biblioteca',
      pergunta: 'Quem vê os arquivos da Biblioteca?',
      resposta: 'Toda a equipe que entra no Palácio Virtual. Os arquivos são privados: não têm link público, e baixar exige estar dentro do Palácio Virtual. A exceção é a cópia de uma foto que sai numa página do site: essa fica pública. Para mandar um arquivo a alguém de fora, baixe e envie o arquivo.',
      termos: ['privado', 'link público', 'compartilhar', 'quem acessa'],
    },
    {
      id: 'que-arquivos',
      pergunta: 'Que arquivos posso enviar?',
      resposta: 'Imagem (JPG, PNG, WebP e GIF), vídeo (MP4, WebM e MOV), áudio (MP3, WAV e OGG), PDF, texto, CSV e arquivos do Word, do Excel e do PowerPoint, até 300 MB cada. Outro formato é recusado; foto do iPhone em HEIC, por exemplo, precisa ser exportada como JPEG.',
      termos: ['formato', 'tamanho máximo', '300 MB', 'Este tipo de arquivo não é permitido', 'HEIC', 'extensão'],
    },
    {
      id: 'espaco-atingido',
      pergunta: 'O envio foi recusado porque o espaço acabou. E agora?',
      resposta: 'A equipe tem um espaço total, e a barra “Espaço usado” mostra quanto já foi. Quando ele enche, o envio é recusado. Exclua o que não serve mais ou fale com um administrador.',
      termos: ['O espaço de armazenamento do espaço foi atingido', 'O espaço de armazenamento foi atingido', 'cheio', 'cota', 'armazenamento'],
    },
    {
      id: 'selos-de-uso',
      pergunta: 'O que querem dizer “Uso autorizado”, “Falta autorizar” e “Uso interno”?',
      resposta: '“Uso autorizado”: há autorização de uso de imagem, e o arquivo pode ir para as redes e para o site. “Falta autorizar”: ninguém confirmou ainda; a publicação não sai assim. “Uso interno”: material de terceiro, que serve de referência e não sai em nome da Cruz Vermelha.',
      termos: ['autorização', 'direito de imagem', 'selo', 'pendente'],
    },
    {
      id: 'publicar-uso-interno',
      pergunta: 'Dá para publicar um arquivo marcado como “Uso interno”?',
      resposta: 'Só se um administrador liberar, de dentro de um pacote em Publicações: em “Mídias do pacote”, toque na mídia marcada “uso interno” e em “Liberar uso”. Ao liberar, a pessoa declara que a filial tem permissão da fonte e que o crédito vai na peça. A liberação fica registrada com o nome de quem liberou, e o selo passa a “Uso autorizado”.',
      termos: ['terceiro', 'liberar', 'outra instituição', 'crédito'],
    },
    {
      id: 'mudar-autorizacao',
      pergunta: 'Marquei errado o “Uso de imagem”. Dá para mudar?',
      resposta: 'Pela Biblioteca, só dá para passar de “Falta autorizar” para “Uso autorizado”, com “Autorizar uso”. Um “Uso interno” só muda quando um administrador libera, de dentro de um pacote. Para desfazer outra escolha, exclua o arquivo e envie de novo com a opção certa.',
      termos: ['corrigir autorização', 'trocar uso de imagem'],
    },
    {
      id: 'mudar-pasta',
      pergunta: 'Dá para mudar a pasta, as tags ou o nome depois do envio?',
      resposta: 'Não pela tela: pasta e tags são escolhidas no envio, e o nome é o do arquivo enviado. Se precisar muito, exclua e envie de novo.',
      termos: ['renomear', 'mover', 'editar tags', 'pasta errada'],
    },
    {
      id: 'recuperar-excluido',
      pergunta: 'Excluí um arquivo por engano. Dá para recuperar?',
      resposta: 'Não. A exclusão apaga o arquivo de vez, para toda a equipe. Se alguém tiver uma cópia, envie de novo.',
      termos: ['desfazer', 'lixeira', 'restaurar', 'apagado'],
    },
    {
      id: 'sem-lixeira',
      pergunta: 'Por que não aparece a lixeira num arquivo?',
      resposta: 'Cada pessoa exclui só o que enviou. Arquivos de outras pessoas, só editores e administradores excluem.',
      termos: ['não consigo excluir', 'Sem permissão para excluir', 'apagar'],
    },
    {
      id: 'arquivo-que-ninguem-enviou',
      pergunta: 'Apareceu um arquivo que ninguém enviou pela Biblioteca. De onde veio?',
      resposta: 'O que sobe por outras telas também entra na Biblioteca: o enviado de dentro de um pacote (“Enviar foto ou vídeo” ou o botão “Foto” do texto), as mídias postas numa matéria, as imagens criadas com IA e as fotos trazidas do Cérebro. O que entra pelo texto (o botão “Foto” ou a matéria) chega com “Falta autorizar”; a foto do Cérebro que veio de outra conta chega como “Uso interno”.',
      termos: ['origem', 'foto nova', 'IA', 'Cérebro'],
    },
    {
      id: 'biblioteca-ou-acervo',
      pergunta: 'Qual a diferença entre a Biblioteca e o Acervo?',
      resposta: 'A Biblioteca é o material de trabalho da equipe, de onde saem as mídias das publicações. O Acervo é a memória da filial: cada item ganha ficha, e o que for publicado vai para cruzvermelhariodejaneiro.org/acervo.',
      termos: ['acervo', 'memória', 'onde guardar'],
    },
  ],
  relacionadas: ['/redes', '/acervo'],
}

// ---------------------------------------------------------------- Acervo

const ACERVO: GuiaDaArea = {
  href: '/acervo',
  paraQueServe: 'O Acervo guarda a memória da filial: documentos, fotos, vídeos, recortes de imprensa e registros da história. Cada arquivo ganha uma ficha (o que é, de quando, de quem). Tudo entra privado; só vai para cruzvermelhariodejaneiro.org/acervo o que alguém publica, com a ficha completa.',
  quemUsa: 'Administradores, editores e colaboradores veem e baixam tudo. Enviar, catalogar, publicar, tirar do site e excluir é de editores e administradores.',
  tour: [
    {
      titulo: 'O acervo da filial',
      texto: 'Aqui fica a memória da filial: documentos, fotos, vídeos, imprensa e história. Tudo é privado até alguém publicar no site, com a ficha completa.',
    },
    {
      alvo: 'acervo.abas',
      titulo: 'Catálogo e pastas',
      texto: '“Catálogo” mostra as fichas dos itens. “Pastas do acervo” mostra os arquivos como estão guardados, para baixar qualquer um ou dar ficha ao que chegou por fora.',
      lado: 'bottom',
      seAusente: 'pular',
    },
    {
      alvo: 'acervo.resumo',
      titulo: 'Quantos itens e onde',
      texto: 'Quantos itens há, quantos estão no site e quantos são privados. “Na caixa de entrada” são os que ainda não foram guardados na pasta da coleção.',
    },
    {
      alvo: 'acervo.acoes',
      titulo: 'Enviar e ver no site',
      texto: '“Enviar arquivos” sobe vários de uma vez (só para editores e administradores). “Ver o acervo no site” abre a parte pública numa aba nova.',
    },
    {
      alvo: 'acervo.filtros',
      titulo: 'Buscar e filtrar',
      texto: 'Busque por título, descrição ou palavra-chave, e filtre por coleção ou pela situação: no site, privados ou na caixa de entrada.',
      seAusente: 'pular',
    },
    {
      alvo: 'acervo.lista',
      titulo: 'A ficha de cada item',
      texto: 'Cada cartão abre a ficha completa do item, com “Baixar original” e, para editores e administradores, “Editar ficha” e “Publicar no site”.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'enviar-ao-acervo',
      titulo: 'Enviar arquivos ao acervo',
      passos: [
        'No “Catálogo”, toque em “Enviar arquivos”.',
        'Em “1. A coleção”, escolha Documentos, Fotos, Vídeos, Imprensa ou História. Todos os arquivos da rodada entram nela.',
        'Em “2. Os arquivos”, toque em “Escolher arquivos” ou arraste os arquivos para a área tracejada.',
        'Toque em “Enviar” (com vários, “Enviar 3 arquivos”, por exemplo) e espere cada arquivo chegar a “no acervo”.',
        'No fim, toque em “Completar a ficha” para descrever o primeiro item.',
      ],
      dica: 'Até 50 arquivos por vez, até 2 GB cada. Não feche a aba no meio do envio: o que ainda não subiu se perde.',
      quem: 'Editores e administradores',
    },
    {
      id: 'completar-ficha',
      titulo: 'Completar a ficha de um item',
      passos: [
        'No “Catálogo”, toque no cartão do item e depois em “Editar ficha”.',
        'Preencha “Título” e “Descrição”: o que é, quem aparece, onde, quando e por que importa.',
        'Em “Data”, escreva a data do que o item registra (12/05/1998, 05/1998 ou só 1998), não a do envio.',
        'Preencha “Autoria” ou “Crédito” e escolha os “Direitos de uso”.',
        'Se for imagem, descreva-a em “Texto alternativo”. Se for vídeo, cole o “Link do vídeo” do YouTube ou do Vimeo.',
        'Acrescente “Palavras-chave” separadas por vírgula, confira o quadro “Para ir ao site” e toque em “Salvar ficha”.',
      ],
      quem: 'Editores e administradores',
    },
    {
      id: 'publicar-item',
      titulo: 'Publicar um item no site',
      passos: [
        'Abra o cartão do item e toque em “Publicar no site”.',
        'Leia o que muda: o item fica público, aparece no Google e o endereço é para sempre.',
        'Se aparecer “Para ir ao site, falta:”, toque em “Corrigir na ficha”, complete e salve.',
        'Toque em “Publicar no site” e espere: pode levar um minuto.',
        'No fim, “Ver a página do item” abre a página publicada.',
      ],
      dica: 'Foto com pessoas só vai com a autorização de uso de imagem de quem aparece; criança ou adolescente, só com a autorização dos responsáveis.',
      quem: 'Editores e administradores',
    },
    {
      id: 'guardar-na-colecao',
      titulo: 'Guardar um arquivo na pasta da coleção',
      passos: [
        'Abra o cartão de um item com o selo “Na caixa de entrada”.',
        'Confira a coleção e a data na ficha: a pasta usa o ano da data do item (ou o do envio, se a data estiver em branco).',
        'Toque em “Guardar na coleção” e confirme.',
      ],
      dica: 'Na pasta da coleção vale a trava de 30 dias: ninguém apaga nem troca o arquivo nesse prazo. Depois, mudar a coleção na ficha não move o arquivo. Publicar no site também guarda o arquivo na coleção, menos na coleção Vídeos.',
      quem: 'Editores e administradores',
    },
    {
      id: 'tirar-do-site',
      titulo: 'Tirar um item do site',
      passos: [
        'Abra o cartão do item com o selo “No site”.',
        'Toque em “Tirar do site”.',
        'Leia o aviso e toque em “Tirar do site” de novo para confirmar.',
      ],
      dica: 'A ficha e o arquivo continuam no acervo, como privados. Se o item voltar ao site, volta no mesmo endereço. O Google pode levar alguns dias para tirar o item da busca.',
      quem: 'Editores e administradores',
    },
    {
      id: 'catalogar-arquivo-das-pastas',
      titulo: 'Dar ficha a um arquivo que chegou por fora',
      passos: [
        'Abra a aba “Pastas do acervo”.',
        'Abra as pastas até achar o arquivo.',
        'Toque em “Catalogar” ao lado dele.',
        'Escolha a coleção e toque em “Catalogar”.',
        'Toque em “Ver ficha”, ao lado do arquivo, e depois em “Editar ficha” para completar.',
      ],
      quem: 'Editores e administradores',
    },
    {
      id: 'baixar-original',
      titulo: 'Baixar o arquivo original',
      passos: [
        'No “Catálogo”, toque no cartão do item.',
        'Toque em “Baixar original”.',
        'Ou, na aba “Pastas do acervo”, abra a pasta e toque em “Baixar” ao lado do arquivo.',
      ],
    },
    {
      id: 'excluir-item',
      titulo: 'Excluir um item do catálogo',
      passos: [
        'Se o item estiver no site, tire-o do site antes.',
        'Abra o cartão do item e toque em “Excluir”.',
        'Leia o aviso e toque em “Excluir” para confirmar. Não dá para desfazer.',
      ],
      dica: 'Se o arquivo ainda está na caixa de entrada, ele sai junto. Se já está na pasta da coleção, continua lá e pode ganhar ficha de novo pela aba “Pastas do acervo”.',
      quem: 'Editores e administradores',
    },
    {
      id: 'atualizar-paginas',
      titulo: 'Refazer as páginas do acervo no site',
      passos: [
        'No “Catálogo”, toque em “Atualizar as páginas do acervo”.',
        'Espere a contagem terminar.',
        'No fim, “Ver o acervo no site” abre a parte pública.',
      ],
      dica: 'Use quando uma publicação avisar que as páginas não foram refeitas.',
      quem: 'Editores e administradores',
    },
  ],
  perguntas: [
    {
      id: 'quem-ve-acervo',
      pergunta: 'Quem vê o que está no acervo?',
      resposta: 'Item com o selo “Privado”: só a equipe do Palácio Virtual (administradores, editores e colaboradores). Item com o selo “No site”: qualquer pessoa, em cruzvermelhariodejaneiro.org/acervo, e o Google também encontra.',
      termos: ['privado', 'público', 'site', 'quem acessa'],
    },
    {
      id: 'sem-botao-enviar',
      pergunta: 'Por que não aparece “Enviar arquivos” para mim?',
      resposta: 'Enviar, catalogar e publicar é de editores e administradores. Quem é colaborador vê e baixa tudo; para pôr algo no acervo, fale com um editor ou um administrador. Se o topo da tela avisa que o acervo não está configurado, o envio e o download ficam desligados para todo mundo.',
      termos: ['não consigo enviar', 'permissão', 'colaborador'],
    },
    {
      id: 'caixa-de-entrada',
      pergunta: 'O que é “Na caixa de entrada”?',
      resposta: 'O arquivo já chegou ao acervo, mas ainda não foi guardado na pasta da coleção, e lá ainda não vale a trava. Quando a ficha estiver certa, use “Guardar na coleção”. Publicar no site faz isso sozinho, menos na coleção Vídeos.',
      termos: ['entrada', 'sem trava', 'guardar'],
    },
    {
      id: 'trava-de-30-dias',
      pergunta: 'O que é a trava de 30 dias?',
      resposta: 'Na pasta da coleção, por 30 dias ninguém apaga nem troca o arquivo, nem por engano, nem com um acesso indevido. A caixa de entrada não tem essa trava. É o que protege a memória da filial.',
      termos: ['trava', 'proteção', 'não apaga', 'bloqueio'],
    },
    {
      id: 'publicar-parado',
      pergunta: 'Por que o botão “Publicar no site” fica parado?',
      resposta: 'Falta algo na ficha, e a lista “Para ir ao site, falta:” diz o quê. Entre o que o site pede: descrição com pelo menos 40 caracteres; texto alternativo, se for imagem; autoria ou crédito (menos em domínio público); e, para vídeo, o link do YouTube ou do Vimeo.',
      termos: ['não publica', 'ficha incompleta', 'falta', 'descrição', 'texto alternativo'],
    },
    {
      id: 'o-que-vai-ao-site',
      pergunta: 'Que tipo de arquivo vai para o site?',
      resposta: 'Imagem, PDF (até 60 MB) e vídeo, este pelo link do YouTube ou do Vimeo: o arquivo de vídeo fica só no acervo. Áudio, planilha e outros formatos ficam só no acervo interno.',
      termos: ['formato', 'áudio', 'planilha', 'vídeo', 'PDF'],
    },
    {
      id: 'foto-do-iphone',
      pergunta: 'Minha foto do iPhone não vai para o site. Por quê?',
      resposta: 'A foto está em HEIC, o formato do iPhone, que o Palácio Virtual não consegue converter para o site. Exporte a foto como JPEG e envie de novo; o HEIC continua guardado no acervo.',
      termos: ['HEIC', 'iPhone', 'JPEG', 'foto não publica'],
    },
    {
      id: 'endereco-permanente',
      pergunta: 'Depois de publicado, dá para mudar a coleção ou o endereço do item?',
      resposta: 'Não. Na primeira publicação, a coleção e o endereço ficam fixos, mesmo que o item saia do site e volte. O título pode mudar: só a página muda, e os links que outros sites fizeram continuam funcionando.',
      termos: ['mudar coleção', 'endereço', 'link', 'URL'],
    },
    {
      id: 'localizacao-da-foto',
      pergunta: 'A foto publicada leva a localização gravada pela câmera?',
      resposta: 'Não. O site recebe versões da imagem para a web, sem os dados da câmera (como o lugar onde a foto foi tirada). O original, com esses dados, fica só no acervo.',
      termos: ['metadados', 'EXIF', 'GPS', 'privacidade'],
    },
    {
      id: 'mudar-ficha-no-site',
      pergunta: 'Mudei a ficha de um item que está no site. Preciso publicar de novo?',
      resposta: 'Não. Salvar a ficha de um item que está no site já refaz a página dele. “Atualizar no site” também refaz a página e os arquivos com a ficha e o arquivo de agora.',
      termos: ['atualizar', 'republicar', 'corrigir ficha'],
    },
    {
      id: 'nao-consigo-excluir',
      pergunta: 'Por que não consigo excluir um item?',
      resposta: 'Item no site não se apaga: tire do site antes. Se a retirada ainda não terminou, use “Atualizar as páginas do acervo” e depois exclua.',
      termos: ['Item no site não se apaga', 'A retirada do site ainda não terminou', 'apagar', 'excluir'],
    },
    {
      id: 'qual-direito-de-uso',
      pergunta: 'Qual opção de “Direitos de uso” escolher?',
      resposta: '“Todos os direitos reservados” quando ninguém pode reproduzir sem pedir à filial. As licenças Creative Commons, só se a filial tiver os direitos e quiser liberar o uso. “Domínio público” para o que não tem mais direitos autorais, como uma obra muito antiga.',
      termos: ['licença', 'creative commons', 'CC BY', 'domínio público', 'direitos autorais'],
    },
    {
      id: 'dado-pessoal',
      pergunta: 'Posso guardar documentos com dados pessoais no acervo?',
      resposta: 'Dado pessoal (CPF, laudo, documento de aluno ou voluntário) só entra no acervo com motivo, e nunca vai ao site. Antes de publicar um PDF, confira se não há dado pessoal nele.',
      termos: ['LGPD', 'CPF', 'privacidade', 'documento pessoal'],
    },
  ],
  relacionadas: ['/biblioteca', '/redes'],
}

export const guias: GuiaDaArea[] = [PUBLICACOES, BIBLIOTECA, ACERVO]
