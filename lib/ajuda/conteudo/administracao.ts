import type { GuiaDaArea } from '../tipos'
import { ATIVAR_A_VERIFICACAO, CONFIRMAR_O_EMAIL, ESCOLHER_OS_EMAILS, PARA_QUE_SERVE_O_EMAIL, SAIR_DA_CONTA, TROCAR_A_SENHA } from './geral'
import { RESUMO_DIARIO } from './meu-dia'

/**
 * A ajuda do grupo “Conta e administração” (menu da conta): Acessos (/acessos), Usuários e
 * permissões (/usuarios), Configurações (/configuracoes) e Meu perfil
 * (/perfil). A Central de ajuda (/ajuda) é a própria ajuda e não tem guia.
 *
 * Acessos: app/(app)/acessos, lib/acessos/**, app/actions/entrada.ts, o
 * registro dos voluntários em app/actions/membro.ts, app/auth/signout e a
 * migração 20260928000000_cvrj_acessos (docs/registro-de-acessos.md traz
 * também o que ainda não foi feito: aqui só entra o que está no código).
 *
 * Cada frase tem apoio no código: app/(app)/usuarios, components/admin/
 * usuarios.tsx, app/actions/usuarios.ts e verificacao.ts; app/(app)/
 * configuracoes, components/admin/{integracoes,correio-setores,
 * analytics-do-site,danger-zone}.tsx, app/actions/{integracoes,correio,site,
 * admin}.ts, lib/integracoes/chaves.ts, lib/correio/sincronizar.ts e
 * app/api/google/retorno; app/(app)/perfil, components/auth/{contas,
 * trocar-senha-form,verificacao,verificacao-no-perfil}.tsx,
 * components/app/preferencias-de-notificacao.tsx, lib/notificacoes/regras.ts,
 * app/api/profile/avatar e app/actions/contas.ts. Regras de conta em
 * lib/usuarios/**, lib/contas/** e ARQUITETURA.md §5; permissões em
 * lib/permissoes.ts. Os alvos `acessos.*`, `usuarios.*`, `configuracoes.*` e
 * `perfil.*` são marcados com `data-ajuda` nessas telas. Mudou a tela ou a
 * regra, muda aqui no mesmo PR (docs/AJUDA.md).
 */

// ------------------------------------------------------------------- Acessos

const ACESSOS: GuiaDaArea = {
  href: '/acessos',
  paraQueServe: 'Acessos é o registro de quem entrou no Palácio Virtual e na Área do Voluntário: quando, de onde e com qual aparelho, inclusive as tentativas erradas, os bloqueios e as saídas. Serve para cuidar da segurança das contas.',
  quemUsa: 'Só quem foi escolhido para ler o registro e, além disso, tem o papel “Administrador”: o papel sozinho não basta. Para as outras pessoas, a área não aparece no menu e o endereço não abre. Cada consulta a esta tela também fica registrada.',
  naPratica: {
    titulo: 'Uma senha errada muitas vezes às 3h da manhã',
    passos: [
      'A administração recebe o alerta: muitas tentativas erradas na conta da Carla, de madrugada.',
      'Abre “Acessos” e vê as tentativas, o aparelho e a região.',
      'A conta foi bloqueada sozinha por um tempo; a Carla confirma que não era ela.',
      'Ela troca a senha e liga a verificação em duas etapas.',
    ],
    resultado: 'Um ataque é notado e contido antes de virar problema.',
  },
  tour: [
    {
      titulo: 'O registro de acessos',
      texto: 'Quem entrou no Palácio Virtual e na Área do Voluntário, quando, de onde e com qual aparelho, inclusive tentativas erradas e bloqueios. Cada consulta a esta tela também fica registrada.',
    },
    {
      alvo: 'acessos.numeros',
      titulo: 'O resumo',
      texto: 'Entradas, tentativas erradas e bloqueios das últimas 24 horas, e os aparelhos vistos pela primeira vez nos últimos 7 dias.',
      lado: 'bottom',
    },
    {
      alvo: 'acessos.filtros',
      titulo: 'Filtrar',
      texto: 'Escolha “Pessoa”, “O que aconteceu” e “Período”, ou marque “Só com alerta”, e toque em “Filtrar”. A tela abre nos “Últimos 7 dias”.',
      lado: 'bottom',
    },
    {
      alvo: 'acessos.lista',
      titulo: 'Cada acesso numa linha',
      texto: 'Quem, o que aconteceu, quando e de onde, com os selos amarelos de alerta. Toque na linha para ver o IP, o mapa, o aparelho, os idiomas e a impressão digital.',
      lado: 'top',
    },
    {
      alvo: 'acessos.aparelhos',
      titulo: 'Aparelhos da equipe',
      texto: 'Cada aparelho reconhecido de cada pessoa da equipe, com a primeira e a última vez. Tocar no nome do aparelho mostra só os acessos dele.',
      lado: 'top',
    },
    {
      alvo: 'acessos.nota',
      titulo: 'O local é aproximado',
      texto: 'O local vem do IP: na rede de celular, a cidade pode sair errada. Dos voluntários, o registro guarda só IP, local e navegador, sem impressão digital.',
      lado: 'top',
    },
  ],
  tarefas: [
    {
      id: 'ver-quem-entrou',
      titulo: 'Ver quem entrou nas últimas 24 horas',
      passos: [
        'Toque na sua foto, no alto à direita, e abra “Acessos” (no celular, fica no fim do menu, em “Conta e administração”).',
        'Em “O que aconteceu”, escolha “Entradas”.',
        'Em “Período”, escolha “Últimas 24 horas”.',
        'Toque em “Filtrar”.',
        'Toque numa linha para ver o IP, o local no mapa e os dados do aparelho.',
      ],
      dica: 'A lista mostra até 300 acessos. Quando o título diz “Os 300 acessos mais recentes do filtro”, pode haver mais: escolha uma pessoa ou um período menor.',
    },
    {
      id: 'investigar-tentativas-erradas',
      titulo: 'Investigar tentativas erradas e bloqueios',
      exemplo: 'Em “Acessos”, a conta da Carla mostra 14 tentativas erradas entre 3h02 e 3h09, de um aparelho desconhecido, e o bloqueio automático logo depois.',
      passos: [
        'Em “O que aconteceu”, escolha “Erros e bloqueios” e toque em “Filtrar”.',
        'Veja em cada linha quem tentou, quando e de onde.',
        'Toque na linha: “Motivo” diz o que deu errado, e “Aparelho” mostra o navegador usado.',
        'Toque no IP para ver tudo o que veio dele, desde o começo.',
      ],
      dica: '“Erros e bloqueios” junta “Tentativa errada”, “Bloqueado” e “Código errado (2 etapas)”.',
    },
    {
      id: 'ver-acessos-de-uma-pessoa',
      titulo: 'Ver os acessos de uma pessoa',
      passos: [
        'Em “Pessoa”, escolha o nome. “Voluntários” junta todos os voluntários.',
        'Em “Período”, escolha “Desde o começo” ou um período menor.',
        'Toque em “Filtrar”.',
        'Para ver os aparelhos que ela usa, procure o nome dela na tabela “Aparelhos da equipe”.',
      ],
      dica: 'A lista “Pessoa” traz toda a equipe; quem é da escola vem com “(escola)” depois do nome. Voluntário não se filtra um por um.',
    },
    {
      id: 'ver-um-aparelho-ou-ip',
      titulo: 'Ver tudo o que veio de um aparelho ou de um IP',
      passos: [
        'Toque na linha de um acesso para abrir os detalhes.',
        'Toque no IP ou, em “Aparelho”, no nome do aparelho, quando ele vier como link. Na tabela “Aparelhos da equipe”, o nome do aparelho também serve.',
        'A lista passa a mostrar só o que veio dali, desde o começo.',
        'Para voltar, toque em “Limpar aparelho ✕” ou “Limpar IP ✕”, ao lado de “Filtrar”.',
      ],
    },
    {
      id: 'conferir-alertas',
      titulo: 'Conferir os acessos com alerta',
      passos: [
        'Marque “Só com alerta” e toque em “Filtrar”.',
        'Leia o selo amarelo de cada linha: “Aparelho novo”, “País novo”, “Muitas tentativas” ou “Fuso diferente do IP”.',
        'Toque na linha para ver o local, o aparelho e, em “Fuso: IP / navegador”, os dois fusos.',
        'Toque no aparelho ou no IP para ver o que mais veio dali.',
      ],
      dica: 'A primeira entrada de cada pessoa no registro também aparece nesse filtro, sem selo: é só o começo do histórico dela.',
    },
  ],
  perguntas: [
    {
      id: 'quem-ve-o-registro',
      pergunta: 'Quem vê o registro de acessos?',
      resposta: 'Só quem foi escolhido para ler o registro e, além disso, tem o papel “Administrador”. A escolha é pessoa a pessoa: o papel sozinho não basta. Para as outras pessoas, “Acessos” não aparece no menu e o endereço não abre (aparece um erro 404).\n\nCada consulta a esta tela também fica registrada, com o filtro usado.',
      termos: ['permissão', 'privacidade', 'quem vigia', 'quem pode ver'],
    },
    {
      id: 'nao-vejo-acessos',
      pergunta: 'Tenho o papel “Administrador” e não vejo “Acessos”. Por quê?',
      resposta: 'Porque o registro não se abre pelo papel, só para quem foi escolhido para lê-lo. Essa escolha não fica em “Usuários e permissões”, e não há botão para ela no Palácio Virtual: fale com quem cuida da ferramenta.',
      termos: ['404', 'sumiu do menu', 'sem acesso', 'não aparece', 'admin'],
    },
    {
      id: 'o-que-entra-no-registro',
      pergunta: 'O que entra no registro?',
      resposta: 'Da equipe, inclusive a da escola: as entradas, as tentativas erradas, os bloqueios, o código da verificação em duas etapas (certo ou errado) e as saídas pelo botão de sair da conta. Da Área do Voluntário: os códigos pedidos por e-mail, as entradas, as tentativas erradas e as saídas.\n\nAs páginas que a pessoa abre e o que ela faz depois de entrar não entram aqui.',
      termos: ['eventos', 'login', 'saída', 'verificação em duas etapas', 'código'],
    },
    // Sem os números do bloqueio nem os critérios dos alertas: o texto da ajuda vai ao navegador de
    // qualquer pessoa logada (components/app/ajuda/carregar.ts), e não precisa ensinar a contorná-los.
    {
      id: 'bloqueio-por-tentativas',
      pergunta: 'Como funciona o bloqueio por tentativas erradas?',
      resposta: 'Na entrada da equipe, várias tentativas erradas seguidas com o mesmo usuário (ou e-mail) bloqueiam novas tentativas com ele por alguns minutos; muitas vindas do mesmo IP, somando todas as contas, bloqueiam o IP. O bloqueio acaba sozinho.\n\nEnquanto isso, a tela de entrada pede para esperar ou usar “Esqueci minha senha”, e quem lê o registro recebe um aviso no sino quando uma conta é bloqueada.',
      termos: ['Muitas tentativas erradas', 'bloqueado', 'senha errada', 'travou', 'Conta bloqueada por tentativas erradas'],
    },
    {
      id: 'selos-amarelos',
      pergunta: 'O que significam os selos amarelos?',
      resposta: '“Aparelho novo”: a pessoa entrou de um aparelho que o registro ainda não conhecia para ela. “País novo”: de um país diferente dos das entradas recentes dela. “Muitas tentativas”: houve várias tentativas erradas na conta pouco antes da entrada certa.\n\n“Fuso diferente do IP”: o fuso do navegador não combina com o lugar do IP. Esse e “Muitas tentativas” só marcam a linha, sem aviso a ninguém.',
      termos: ['alerta', 'sinal', 'risco', 'aparelho novo', 'país novo', 'fuso'],
    },
    {
      id: 'quem-e-avisado',
      pergunta: 'Quem é avisado quando aparece algo estranho?',
      resposta: 'Com aparelho novo ou país novo, a própria pessoa recebe um e-mail de segurança, mesmo que tenha desligado os e-mails de aviso, desde que tenha e-mail confirmado. Com país novo e com conta bloqueada, quem lê o registro recebe um aviso no sino.\n\nSe esse aviso do sino vai também por e-mail, quem lê escolhe em Meu perfil, no assunto “Trilha pública”.',
      termos: ['notificação', 'e-mail', 'Novo acesso à sua conta do Palácio Virtual', 'Acesso de um país novo', 'sino'],
    },
    {
      id: 'como-reconhece-o-aparelho',
      pergunta: 'Como o registro reconhece um aparelho?',
      resposta: 'Na primeira entrada de alguém da equipe num navegador, o Palácio Virtual deixa nele uma marca para reconhecê-lo depois. Se ela foi apagada (aba anônima, limpeza do navegador), o registro ainda tenta reconhecer o aparelho por características do próprio navegador (a “impressão digital” que a linha mostra).',
      termos: ['impressão digital', 'aparelho', 'navegador', 'reconhecer', 'fingerprint'],
    },
    {
      id: 'local-aproximado',
      pergunta: 'O local do acesso está certo?',
      resposta: 'É aproximado: vem do IP, e não do GPS. Na rede de celular, a cidade pode sair errada. O link “mapa”, nos detalhes do acesso, mostra o ponto aproximado.',
      termos: ['cidade errada', 'localização', 'IP', 'mapa'],
    },
    {
      id: 'voluntarios-no-registro',
      pergunta: 'O que aparece dos voluntários?',
      resposta: 'Só IP, local e navegador, sem impressão digital, e eles não entram em “Aparelhos da equipe”. A linha traz o selo “voluntário”; no filtro “Pessoa”, “Voluntários” junta todos.\n\nOs códigos pedidos e as tentativas erradas deles aparecem como “Usuário inexistente”: o registro não liga essas linhas a um cadastro.',
      termos: ['área do voluntário', 'membro', 'código por e-mail'],
    },
    {
      id: 'usuario-inexistente',
      pergunta: 'O que quer dizer “Usuário inexistente”?',
      resposta: 'Que a linha não está ligada a uma conta. Aparece quando alguém digitou um usuário que não existe, em toda linha “Bloqueado” e nos códigos pedidos e nas tentativas erradas da Área do Voluntário. Abra a linha: o “Motivo” ajuda a entender o caso.\n\n“Conta removida” é outra coisa: a conta da equipe daquela linha não existe mais.',
      termos: ['desconhecido', 'sem nome', 'Conta removida', 'quem tentou'],
    },
    {
      id: 'quanto-tempo-fica-guardado',
      pergunta: 'Por quanto tempo o registro fica guardado?',
      resposta: 'Por enquanto, tudo fica guardado: não há rotina que apague acessos antigos. E ninguém apaga nem muda uma linha do registro pelo Palácio Virtual.',
      termos: ['retenção', 'LGPD', 'apagar', 'histórico', 'prazo'],
    },
    {
      id: 'a-pessoa-sabe',
      pergunta: 'A pessoa sabe que o acesso dela é registrado?',
      resposta: 'A tela de entrada da equipe avisa: “Por segurança, registramos data, local aproximado e dados do aparelho de cada acesso.” A pessoa não vê o próprio registro: recebe só o e-mail de segurança quando entra de um aparelho novo ou de um país novo.\n\nA tela de entrada da Área do Voluntário não traz esse aviso, e os voluntários não recebem o e-mail de segurança.',
      termos: ['LGPD', 'privacidade', 'transparência', 'meus acessos', 'aviso'],
    },
  ],
  relacionadas: ['/usuarios', '/perfil'],
}

// ------------------------------------------------------ Usuários e permissões

const USUARIOS: GuiaDaArea = {
  href: '/usuarios',
  paraQueServe: 'Aqui a administração decide quem entra no Palácio Virtual e o que cada pessoa pode fazer. Você cria acessos (de preferência por convite, pelo WhatsApp e/ou por e-mail), muda papel, coordenação e e-mail, redefine senhas, desativa e reativa contas e escolhe quem é obrigado a usar a verificação em duas etapas. Tudo o que muda fica no “Registro de acessos”.',
  quemUsa: 'Só administradores veem esta área. Ninguém muda o próprio papel nem desativa a própria conta (quem faz é outra pessoa da administração), e o Palácio Virtual nunca fica sem pelo menos um administrador ativo.',
  naPratica: {
    titulo: 'A chegada de uma nova pessoa na Comunicação',
    passos: [
      'A administração cria o acesso do Rafael por convite no e-mail dele, com o papel de Editor e a coordenação da Comunicação.',
      'O Rafael abre o convite, cria a senha e já entra vendo só o que o papel dele permite.',
      'Como a Comunicação publica nas redes, a administração exige a verificação em duas etapas para Editores.',
      'Quando alguém sai da filial, o acesso é desativado no mesmo dia.',
    ],
    resultado: 'Cada pessoa entra com o acesso certo, e ninguém fica com acesso depois de sair.',
  },
  tour: [
    {
      titulo: 'Usuários e permissões',
      texto: 'Aqui você decide quem entra no Palácio Virtual e com qual papel: cria acessos, redefine senhas, desativa contas e escolhe quem é obrigado a usar a verificação em duas etapas.',
    },
    {
      alvo: 'usuarios.numeros',
      titulo: 'O retrato dos acessos',
      texto: '“Aguardando 1º acesso” conta quem ainda está com senha provisória; “Sem e-mail confirmado”, quem não recebe link de senha nem aviso de segurança.',
      lado: 'bottom',
    },
    {
      alvo: 'usuarios.criar',
      titulo: 'Dar acesso',
      texto: '“Novo usuário” cria um acesso por vez; “Convidar várias pessoas” manda vários convites de uma vez e já cria as fichas no RH. Pelo convite, a pessoa cria a própria senha e ninguém mais a conhece.',
      lado: 'bottom',
    },
    {
      alvo: 'usuarios.lista',
      titulo: 'Quem tem acesso',
      texto: 'Busque por nome, usuário ou setor e filtre por papel ou “Desativados”. Toque numa pessoa para mudar dados, papel e e-mail, redefinir a senha ou desativar o acesso.',
    },
    {
      alvo: 'usuarios.verificacao',
      titulo: 'Verificação obrigatória',
      texto: 'Marque os papéis que precisam usar a verificação em duas etapas e toque em “Salvar exigência”. Quem ainda não tem o app é levado a cadastrar no próximo acesso.',
    },
    {
      alvo: 'usuarios.matriz',
      titulo: 'O que cada papel pode',
      texto: 'A tabela mostra só o que muda de um papel para outro, e é a mesma regra que o sistema aplica. O que todo mundo faz, como registrar, escrever e comentar, não aparece nela.',
    },
    {
      alvo: 'usuarios.registro',
      titulo: 'Registro de acessos',
      texto: 'Cada acesso criado, papel mudado, senha redefinida e conta desativada, com quem fez e quando. Ninguém edita este registro, nem administradores.',
    },
  ],
  tarefas: [
    {
      id: 'dar-acesso-por-convite',
      titulo: 'Dar acesso a uma pessoa por convite',
      exemplo: 'O convite vai para rafael@…, papel Editor, coordenação Comunicação; o Rafael cria a senha pelo link e entra no mesmo dia.',
      passos: [
        'Toque em “Novo usuário”.',
        'Preencha “Nome completo”. O “Usuário (para o login)” vem sugerido a partir do nome, no formato nome.sobrenome; ajuste se precisar.',
        'Digite o “WhatsApp” e/ou o “E-mail” da pessoa e, se quiser, “Cargo ou função” e “Coordenação”.',
        'Escolha o papel: “Administrador”, “Editor”, “Colaborador” ou “Equipe da escola”. Na dúvida, “Colaborador”: dá para mudar depois.',
        'Deixe marcado “Enviar convite (recomendado)” e toque em “Criar acesso”.',
        'O recado no alto confirma para onde o convite foi. A pessoa recebe o usuário e um link para criar a própria senha.',
      ],
      dica: 'O convite sai por todos os canais preenchidos. O link vale por 72 horas e, quando usado, confirma o canal que o recebeu: o e-mail, se foi só por e-mail; o WhatsApp, se foi só pelo WhatsApp. Quem ainda não entrou aparece em “Convites pendentes”, na tela de “Convidar várias pessoas”, onde dá para reenviar ou cancelar o convite. Para já criar a ficha no RH junto, prefira “Convidar várias pessoas”, mesmo para uma pessoa só.',
    },
    {
      id: 'convite-de-primeiro-acesso',
      titulo: 'Mandar o convite de primeiro acesso a quem já tem conta',
      exemplo: 'O acesso do Matheus foi criado com senha temporária e ele nunca entrou: a administração abre a conta dele e manda o convite pelo WhatsApp; ele cria a senha pelo link.',
      passos: [
        'Na lista, toque na pessoa que aparece como “Nunca entrou”.',
        'Toque em “Enviar convite de primeiro acesso”.',
        'Confira o “WhatsApp” (vem do último convite ou do celular pessoal da ficha do RH) e, se quiser, marque “Também por e-mail”.',
        'Toque em “Enviar convite”. O recado confirma por onde saiu.',
      ],
      dica: 'O botão só aparece para quem nunca entrou. O link vale 72 horas, e um convite novo invalida o anterior e qualquer link de senha pendente. Por e-mail, o convite vai para o e-mail salvo no perfil: se ele estiver errado, corrija e salve antes.',
    },
    {
      id: 'dar-acesso-sem-email',
      titulo: 'Dar acesso a quem não tem e-mail',
      passos: [
        'Toque em “Novo usuário” e preencha nome, usuário, coordenação e papel. Deixe o “E-mail” em branco.',
        'Marque “Gerar senha temporária” e toque em “Criar acesso”.',
        'A senha aparece uma única vez, no quadro “Senha temporária de @…”. Toque em “Copiar usuário e senha”.',
        'Repasse pessoalmente ou por um canal privado, nunca num grupo.',
        'No primeiro login, o Palácio Virtual pede que a pessoa crie uma senha só dela.',
      ],
      dica: 'A senha temporária não fica guardada em lugar nenhum. Se o quadro fechar antes de você anotar, abra a pessoa na lista e gere outra em “Redefinir senha”.',
    },
    {
      id: 'criar-acesso-da-lista',
      titulo: 'Criar o acesso de alguém da lista da equipe',
      passos: [
        'Desça até “Da equipe, ainda sem acesso”. A seção só aparece quando falta alguém.',
        'Na linha da pessoa, toque em “Criar acesso”.',
        'A página volta ao alto e o formulário abre já com nome, usuário, cargo, coordenação e o papel sugerido pelo setor.',
        'Confira o papel, digite o “E-mail” e escolha como a pessoa recebe a senha.',
        'Toque em “Criar acesso”.',
      ],
    },
    {
      id: 'mudar-papel',
      titulo: 'Mudar o papel, a coordenação ou os dados de alguém',
      passos: [
        'Na lista, toque na linha da pessoa para abrir os dados dela.',
        'Toque no cartão do novo papel e, se for o caso, escolha outra “Coordenação”.',
        'Se precisar, corrija também “Nome completo” ou “Cargo ou função”.',
        'Toque em “Salvar alterações”.',
        'Se a pessoa tem e-mail confirmado, ela recebe um aviso da mudança de papel.',
      ],
      dica: 'Mudar a coordenação também acerta o E-mail do setor: a pessoa sai do setor com o nome da coordenação antiga e entra no setor com o nome da nova, quando eles existem. A tabela “O que cada papel pode fazer”, mais abaixo nesta página, mostra o que muda com cada papel.',
    },
    {
      id: 'cadastrar-email-de-alguem',
      titulo: 'Cadastrar ou trocar o e-mail de alguém',
      passos: [
        'Abra a pessoa na lista.',
        'Digite o endereço em “E-mail” e toque em “Salvar alterações”.',
        'Vai um link de confirmação para o endereço novo. O e-mail só passa a valer quando alguém abre esse link e toca em “Confirmar este e-mail”.',
        'Se o e-mail aparece como “(não confirmado)”, tocar em “Salvar alterações” sem mudar nada reenvia a confirmação.',
      ],
      dica: 'Assim, um erro de digitação não desvia os links de senha de ninguém. O link de confirmação vale por 48 horas.',
    },
    {
      id: 'redefinir-senha',
      titulo: 'Redefinir a senha de alguém',
      passos: [
        'Abra a pessoa na lista e toque em “Redefinir senha”.',
        'Escolha “Enviar link por e-mail (recomendado)”, “Gerar senha temporária” ou “Definir uma senha”.',
        'Toque em “Redefinir”.',
        'Com o link, a senha atual continua valendo até a pessoa escolher a nova; o link vale por 24 horas.',
        'Com a senha temporária ou definida por você, as sessões abertas da pessoa são encerradas e ela troca a senha no próximo login.',
      ],
      dica: 'O link por e-mail só aparece para quem tem e-mail confirmado. A sua própria senha você troca em “Meu perfil”.',
    },
    {
      id: 'desativar-acesso',
      titulo: 'Desativar o acesso de quem saiu',
      passos: [
        'Abra a pessoa na lista.',
        'Toque em “Desativar acesso” e confirme.',
        'A pessoa perde o acesso na hora e sai de todas as sessões.',
        'Ela passa a aparecer como “Desativado” e no filtro “Desativados”.',
      ],
      dica: 'Desativar não apaga nada: o nome da pessoa continua nas pautas, nos votos e no histórico, e dá para reativar depois.',
    },
    {
      id: 'reativar-conta',
      titulo: 'Reativar uma conta',
      passos: [
        'Toque no filtro “Desativados” e abra a pessoa.',
        'Toque em “Reativar e enviar link de senha” (aparece para quem tem e-mail confirmado) ou em “Reativar com senha temporária”, e confirme.',
        'Com o link, a pessoa escolhe a senha nova pelo e-mail, que vale por 24 horas. Com a temporária, a senha aparece na tela para você repassar.',
      ],
      dica: 'A senha antiga não volta a valer: quem ficou fora pode ter perdido o controle dela.',
    },
    {
      id: 'remover-verificacao',
      titulo: 'Tirar a verificação em duas etapas de quem perdeu o celular',
      passos: [
        'Confirme com a própria pessoa, por outro canal, que ela perdeu ou trocou de celular. Quando ela usa “Perdi ou troquei de celular — avisar os administradores”, na tela do código, quem é da administração e tem e-mail confirmado recebe um e-mail.',
        'Abra a pessoa na lista e toque em “Remover verificação em 2 etapas”.',
        'Confirme. Os aparelhos dela são removidos e as sessões abertas, encerradas.',
        'Se o papel dela é obrigado a usar a verificação, o cadastro do app novo é pedido no próximo acesso. Se não, ela cadastra de novo em “Meu perfil”, quando quiser.',
      ],
      dica: 'O pedido por e-mail não remove nada sozinho, de propósito: se bastasse pedir, a segunda etapa valeria o mesmo que a senha.',
    },
    {
      id: 'exigir-verificacao',
      titulo: 'Tornar a verificação em duas etapas obrigatória para um papel',
      passos: [
        'Em “Verificação em duas etapas”, veja em cada papel quantas pessoas já usam o app.',
        'Marque o papel que deve ser obrigado, como “Exigir de administradores”.',
        'Toque em “Salvar exigência”.',
        'Se alguém desse papel ainda não tem o app, o Palácio Virtual diz quantas pessoas serão levadas a cadastrar e pede confirmação.',
        'Quem ainda não tem o app cadastra no próximo acesso, antes de conseguir usar o Palácio Virtual.',
      ],
      dica: 'Peça que cada pessoa cadastre também um segundo aparelho: não há códigos de recuperação, e quem perde o celular depende da administração para voltar.',
    },
  ],
  perguntas: [
    {
      id: 'diferenca-entre-papeis',
      pergunta: 'Qual a diferença entre os papéis?',
      resposta: '“Administrador” controla o Palácio Virtual inteiro: pessoas, acessos, integrações, site e dados; “Editor” toca a produção: publica, dispara campanhas e cuida da Biblioteca. “Colaborador” registra, escreve, comenta e vota nas aprovações para as quais recebe convite; “Equipe da escola” vê só a Escola de Educação e Saúde.\n\nO detalhe está na tabela “O que cada papel pode fazer”, mais abaixo nesta página.',
      termos: ['admin', 'editor', 'colaborador', 'escola', 'permissão', 'nível de acesso'],
    },
    {
      id: 'mudar-o-proprio-papel',
      pergunta: 'Por que não consigo mudar o meu próprio papel nem desativar a minha conta?',
      resposta: 'Para ninguém se trancar fora desta tela por engano, num clique. Peça a outra pessoa da administração.',
      termos: ['Você não pode mudar o seu próprio papel', 'Você não pode desativar a sua própria conta', 'papel bloqueado'],
    },
    {
      id: 'convite-ou-senha-temporaria',
      pergunta: 'Convite, senha temporária ou definir uma senha: qual usar?',
      resposta: 'Prefira o convite, pelo WhatsApp e/ou por e-mail: a pessoa cria a própria senha pelo link e ninguém mais a conhece.\n\nA senha temporária é para quem não tem nem WhatsApp nem e-mail: aparece uma vez na tela, você repassa pessoalmente e a pessoa troca no primeiro login. “Definir uma senha” funciona igual, mas quem escolhe a senha é você.',
      termos: ['senha provisória', 'primeiro acesso', 'como dar acesso'],
    },
    {
      id: 'convite-nao-aparece',
      pergunta: 'Por que a opção “Enviar convite” não aparece?',
      resposta: 'Ela só aparece com um canal que funcione: um e-mail válido no campo “E-mail”, com o envio de e-mail do Palácio Virtual configurado, ou um celular com DDD no campo “WhatsApp”, com o WhatsApp do Palácio ligado (sem ele, o campo nem aparece). Sem o envio de e-mail, a tela mostra um aviso amarelo no alto.',
      termos: ['Convite por e-mail indisponível', 'Convite indisponível', 'Informe o e-mail para poder enviar o convite', 'Informe o WhatsApp', 'envio de e-mail não está configurado', 'RESEND_API_KEY'],
    },
    {
      id: 'convite-nao-chegou',
      pergunta: 'O convite não chegou. E agora?',
      resposta: 'Pelo e-mail, peça para a pessoa olhar o spam; pelo WhatsApp, convite criado entre 22h e 7h sai de manhã. Para mandar um link novo, toque na pessoa aqui e em “Enviar convite de primeiro acesso” (dá para trocar o WhatsApp), ou use “Reenviar” em “Convites pendentes”, na tela de “Convidar várias pessoas”. O link anterior deixa de valer.\n\nSe o convite não sair de jeito nenhum, abra a pessoa aqui, toque em “Redefinir senha” e gere uma senha temporária.',
      termos: ['reenviar convite', 'convite expirou', 'link expirou', 'o convite NÃO saiu'],
    },
    {
      id: 'aguardando-troca-de-senha',
      pergunta: 'O que significa “Aguardando troca de senha”?',
      resposta: 'A pessoa está com uma senha provisória (gerada ou definida pela administração) e ainda não criou a dela. No próximo login, o Palácio Virtual pede a troca antes de qualquer outra coisa. O número “Aguardando 1º acesso”, no alto, conta essas pessoas.\n\nQuem recebeu convite e ainda não entrou aparece como “Nunca entrou”; para mandar o link de novo, toque na pessoa e em “Enviar convite de primeiro acesso”.',
      termos: ['senha provisória', 'aguardando 1º acesso', 'primeiro acesso', 'nunca entrou'],
    },
    {
      id: 'escudo',
      pergunta: 'O que é o escudo ao lado do papel?',
      resposta: 'Escudo verde: a pessoa usa a verificação em duas etapas. Escudo cinza e cortado: não usa. Ao abrir a pessoa, aparece quantos aparelhos ela tem cadastrados.',
      termos: ['2fa', 'ícone', 'verificação em duas etapas ativada', 'sem verificação em duas etapas'],
    },
    {
      id: 'sem-email-confirmado',
      pergunta: 'Por que importa a pessoa ter e-mail confirmado?',
      resposta: 'Sem e-mail confirmado não há para onde mandar o link de “Esqueci minha senha”, o link de nova senha que você envia, os avisos de segurança nem os e-mails de notificação. Nesse caso, para redefinir a senha só restam a senha temporária ou uma senha definida por você.',
      termos: ['não confirmado', 'sem e-mail', 'Link por e-mail indisponível'],
    },
    {
      id: 'desativar-apaga',
      pergunta: 'Desativar apaga a pessoa?',
      resposta: 'Não. Desativar tira o acesso na hora, encerra as sessões e bloqueia o login, mas o nome dela continua nas pautas, nos votos e no histórico. Esta tela não apaga contas; para devolver o acesso, reative.',
      termos: ['excluir usuário', 'apagar conta', 'remover acesso', 'bloquear'],
    },
    {
      id: 'senha-temporaria-perdida',
      pergunta: 'Fechei o quadro da senha temporária sem anotar. Dá para ver de novo?',
      resposta: 'Não: ela não fica guardada em lugar nenhum, nem para administradores. Abra a pessoa na lista, toque em “Redefinir senha”, escolha “Gerar senha temporária” e repasse a nova.',
      termos: ['perdi a senha temporária', 'copiar usuário e senha'],
    },
    {
      id: 'registro-de-acessos',
      pergunta: 'O que aparece no “Registro de acessos”?',
      resposta: 'O que muda nos acessos, com quem fez e quando: contas criadas, papéis e coordenações alterados, senhas redefinidas ou trocadas, contas desativadas e reativadas, convites, e-mails confirmados e mudanças na verificação em duas etapas. A tela mostra os 60 mais recentes, e ninguém edita o registro, nem administradores.',
      termos: ['auditoria', 'log', 'histórico de acessos', 'quem mudou'],
    },
    {
      id: 'da-equipe-sem-acesso',
      pergunta: 'De onde vem a lista “Da equipe, ainda sem acesso”?',
      resposta: 'São as pessoas da lista oficial de setores da filial que ainda não têm login. O papel vem sugerido pelo setor, e você confirma na criação. Estar na lista não cria conta: o acesso só existe depois de “Criar acesso”.',
      termos: ['sem login', 'lista da equipe', 'sugestão de papel'],
    },
    {
      id: 'a-pessoa-e-avisada',
      pergunta: 'A pessoa fica sabendo quando mudo o papel ou a senha dela?',
      resposta: 'Fica, se tiver e-mail confirmado: o Palácio Virtual manda um aviso de segurança quando o papel muda, quando a senha é redefinida, quando a conta é desativada ou reativada e quando a verificação em duas etapas é removida.',
      termos: ['aviso de segurança', 'e-mail de aviso', 'notificação'],
    },
    {
      id: 'convidar-varias-pessoas',
      pergunta: 'Dá para dar acesso a várias pessoas de uma vez?',
      resposta: 'Dá, por convite: toque em “Convidar várias pessoas”. Na tela “Adicionar pessoas ao Palácio Virtual”, você marca quem vai receber acesso, confere WhatsApp e/ou e-mail, setor e papel e envia os convites, até 30 de uma vez; as fichas no RH são criadas junto. Quem não tem nem WhatsApp nem e-mail entra por aqui, com senha temporária.',
      termos: ['em lote', 'vários convites', 'adicionar pessoas'],
    },
    {
      id: 'onde-estao-os-desativados',
      pergunta: 'Onde estão as contas desativadas?',
      resposta: 'Em “Todos”, no fim da lista, e no filtro “Desativados”. Os filtros de papel (“Administrador”, “Editor”…) mostram só quem está ativo.',
      termos: ['sumiu da lista', 'não acho a pessoa', 'conta desativada', 'ex-funcionário'],
    },
    {
      id: 'salvar-apagado',
      pergunta: 'Por que o botão “Salvar alterações” está apagado?',
      resposta: 'Ele só acende quando algo mudou nos dados, no papel, na coordenação ou no e-mail. A exceção é o e-mail “(não confirmado)”: aí dá para salvar sem mudar nada, e a confirmação é reenviada. Com um e-mail em formato inválido no campo, ele também fica apagado.',
      termos: ['não consigo salvar', 'botão desabilitado', 'botão cinza'],
    },
  ],
  relacionadas: ['/pessoas', '/configuracoes', '/perfil'],
}

// -------------------------------------------------------------- Configurações

const CONFIGURACOES: GuiaDaArea = {
  href: '/configuracoes',
  paraQueServe: 'Configurações é o mapa de tudo o que se ajusta no Palácio Virtual. A visão geral mostra a sua conta, onde fica o ajuste de cada área e, para a administração, a situação de cada seção do espaço. Cada seção tem a sua tela no submenu: E-mail dos setores (a conta Google, quem envia por cada setor e os endereços), Integrações (as chaves, as redes sociais e o que está ligado na hospedagem), Site (Google Analytics, páginas e matérias no ar), WhatsApp (o número do Palácio, pelo QR code) e Zona de risco.',
  quemUsa: 'Todo mundo abre a visão geral, com os atalhos da própria conta. O submenu e as seções do espaço são de administradores. Criar logins e mudar papéis fica em “Usuários e permissões”; a lista de setores, em Diretório › Setores.',
  naPratica: {
    titulo: 'Ligar o e-mail do setor de Compras',
    passos: [
      'A administração conecta a conta Google da filial em “E-mail do setor”.',
      'Cria o setor Compras e ativa o endereço compras@… para ele.',
      'Define a assinatura do setor, que sai em todo e-mail.',
      'A partir daí, o Financeiro manda os pedidos de proposta e as ordens de compra por esse endereço.',
    ],
    resultado: 'O Palácio conversa com as ferramentas de fora pelos endereços oficiais.',
  },
  tour: [
    {
      titulo: 'Configurações do Palácio Virtual',
      texto: 'A visão geral aponta onde fica cada ajuste. Para quem administra, o submenu separa cada assunto numa tela.',
    },
    {
      alvo: 'configuracoes.restrito',
      titulo: 'O resto é da administração',
      texto: 'Pessoas, e-mail dos setores, integrações e site são ajustados por administradores. O que é seu fica em “Sua conta”.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.submenu',
      titulo: 'Uma tela por assunto',
      texto: 'Visão geral, E-mail dos setores, Integrações, WhatsApp, Site e Zona de risco. Cada uma cuida só do seu assunto.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.espaco',
      titulo: 'A situação do espaço',
      texto: 'Cada cartão mostra como está a seção: se a conta Google está conectada, quantos endereços estão ativos e quais chaves faltam. Amarelo pede atenção.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.pessoas',
      titulo: 'Pessoas e acessos',
      texto: 'Os logins e papéis (Usuários e permissões), a lista de setores da filial e, para quem foi liberado, o registro de acessos.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.areas',
      titulo: 'Ajustes de cada área',
      texto: 'Filas dos chamados, contas e categorias do financeiro, locais do patrimônio, contas da escola e o QR da portaria ficam dentro da própria área. Aqui estão os atalhos.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.conta',
      titulo: 'Sua conta',
      texto: 'Perfil, crachá, avisos por e-mail e e-mail de recuperação. Cada pessoa resolve os seus, sem depender da administração.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.correio',
      titulo: 'E-mail dos setores',
      texto: 'Três passos: conectar a conta Google dona dos endereços, dizer quem envia por cada setor e ligar cada endereço ao seu setor. Endereço novo chega inativo.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.quem-envia',
      titulo: 'Quem envia por cada setor',
      texto: 'Em “Membros”, marque quem envia pelo endereço do setor. Criar, renomear ou desativar setores é em Diretório › Setores.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.integracoes',
      titulo: 'Integrações',
      texto: 'As chaves das ferramentas externas. Ficam guardadas no cofre e valem na hora; depois de salva, a chave não aparece mais para ninguém. Para trocar, cole a nova por cima.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.redes',
      titulo: 'Redes sociais',
      texto: '“Conectar ou revisar as contas” abre o Upload-Post, onde quem administra cada página autoriza o Palácio Virtual a publicar.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.hospedagem',
      titulo: 'Configuradas na hospedagem',
      texto: 'Chaves que ficam na Vercel, como a do envio de e-mails. Aqui só aparece se estão ligadas.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.site',
      titulo: 'O site',
      texto: 'O Google Analytics, a central de notícias com o mapa do site e “Regerar as páginas das matérias”, que refaz o que está no ar com o molde atual.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.no-ar',
      titulo: 'No ar em /noticias/',
      texto: 'O que o público vê agora na central de notícias. “Tirar do ar” apaga a página do servidor; “Republicar” a traz de volta no mesmo endereço.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.zona-de-risco',
      titulo: 'Zona de risco',
      texto: '“Reiniciar dados” apaga de vez pautas, matérias, aprovações, mensagens e arquivos do Palácio Virtual. Não tem volta: é só para começar do zero.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'guardar-chave',
      titulo: 'Guardar ou trocar a chave de uma integração',
      quem: 'Só administradores',
      passos: [
        'Em Configurações, abra “Integrações” no submenu e ache o cartão da ferramenta: “Hunter.io”, “Google (cliente OAuth do Gmail)”, “Meta Ads (token do usuário do sistema)”, “Google Analytics (conta de serviço)” ou “WhatsApp (Evolution API)”.',
        'Pegue a chave no painel da ferramenta. O endereço dele está no pé do cartão, em “A chave fica em …”.',
        'Cole no campo. No cartão do Google, preencha “ID do cliente” e “Chave secreta do cliente”. No do WhatsApp, o endereço do servidor, o nome da instância e a chave da API. No do Google Analytics, o conteúdo inteiro do arquivo JSON da conta de serviço.',
        'Toque em “Salvar no cofre”.',
        'O cartão passa a mostrar “Configurada no cofre em …”, com a data.',
      ],
      dica: 'Nunca cole chave no chat, em e-mail ou em documento, só aqui. Depois de salva, ela não aparece mais para ninguém: para trocar, cole a nova por cima.',
    },
    {
      id: 'conectar-conta-google',
      titulo: 'Conectar a conta Google do E-mail do setor',
      quem: 'Só administradores',
      passos: [
        'Em Configurações, abra “E-mail dos setores” no submenu. Em “1. Conta do Google”, siga uma vez o passo a passo do Google Cloud que aparece ali. O endereço de retorno que ele pede está na tela, com o botão “Copiar”.',
        'Cole o ID e a chave secreta no cartão “Google (cliente OAuth do Gmail)”, em “Integrações” (o passo a passo tem o link), e toque em “Salvar no cofre”.',
        'Toque em “Conectar conta Google” e entre com a conta dona dos endereços dos setores, a que tem a lista “Enviar e-mail como” no Gmail. Aceite as permissões: enviar, ler e organizar os e-mails (a caixa de entrada de cada setor) e ler as assinaturas. Nada é apagado de vez.',
        'De volta ao Palácio Virtual, o cartão mostra “Conectada:” com a conta, e os endereços do Gmail já aparecem em “3. Endereços (aliases do Gmail)”.',
      ],
      dica: 'Se a autorização vencer ou for revogada, o cartão avisa, e nenhum setor envia até alguém tocar em “Reconectar”. Conta conectada antes da caixa de entrada existir: toque em “Reconectar” uma vez para liberar a leitura.',
    },
    {
      id: 'criar-setor',
      titulo: 'Dizer quem envia pelo endereço de um setor',
      quem: 'Só administradores',
      passos: [
        'Se o setor ainda não existe, crie em Diretório › Setores (o link está no cartão “2. Quem envia por cada setor”).',
        'Em Configurações › E-mail dos setores, no cartão “2. Quem envia por cada setor”, toque em “Membros” na linha do setor.',
        'Marque quem é do setor e toque em “Salvar membros”.',
      ],
      dica: 'Só envia pelo endereço de um setor quem é membro dele (quem tem o papel “Administrador” envia por qualquer um). A lista de setores é uma só, a de Diretório › Setores; mudar a coordenação de alguém em “Usuários e permissões” também muda o setor de mesmo nome.',
    },
    {
      id: 'ativar-endereco',
      titulo: 'Ligar um endereço a um setor e ativar',
      exemplo: 'O endereço compras@cruzvermelhariodejaneiro.org é ativado para o setor Compras; quem é do setor já vê a caixa em “E-mail do setor”.',
      quem: 'Só administradores',
      passos: [
        'Endereço criado (e confirmado) no Gmail depois da conexão só aparece depois de “Sincronizar endereços”. Ele chega inativo.',
        'Em Configurações › E-mail dos setores, no cartão “3. Endereços (aliases do Gmail)”, escolha na lista ao lado de cada endereço o setor dele.',
        'Marque “Ativa”. Só dá para ativar endereço com setor e que ainda está no Gmail.',
        'Para ativar de uma vez todos os que já têm setor, use o botão “Ativar … com setor”, que aparece quando há algum pronto.',
        'Confira o “Nome do remetente”, que é o nome que quem recebe vê. Digite e aperte Enter, ou use o botão que começa com “Dar nome de remetente” para os que estão sem nome.',
      ],
      dica: 'A sincronização sugere o setor pelo endereço, mas não ativa nada sozinha: ativar é sempre decisão de um administrador.',
    },
    {
      id: 'mudar-assinatura',
      titulo: 'Mudar a assinatura de um setor',
      quem: 'Só administradores',
      passos: [
        'No Gmail da conta dona dos endereços, abra Configurações → Geral → Assinatura e crie ou edite a assinatura do setor.',
        'Em “Padrões de assinatura”, escolha essa assinatura para o endereço do setor e salve no Gmail.',
        'De volta ao Palácio Virtual, toque em “Sincronizar endereços”.',
        'Na linha do endereço, toque em “Assinatura” para conferir como ficou.',
      ],
      dica: 'Ninguém edita a assinatura na hora de enviar: vale sempre a que está no Gmail.',
    },
    {
      id: 'tirar-do-ar',
      titulo: 'Tirar uma matéria do site',
      quem: 'Só administradores',
      passos: [
        'Em Configurações › Site, desça até “No ar em /noticias/” e ache a matéria na lista.',
        'Toque em “Tirar do ar”. Na pergunta “Apagar do servidor?”, toque em “Tirar do ar” de novo.',
        'A página sai do servidor, da central de notícias e do mapa do site para os buscadores (sitemap) na mesma hora.',
        'A matéria passa para “Arquivadas — fora do ar”. Para trazê-la de volta, toque em “Republicar”: ela volta no mesmo endereço.',
      ],
    },
    {
      id: 'regerar-materias',
      titulo: 'Refazer as páginas das matérias com o molde atual',
      quem: 'Só administradores',
      passos: [
        'Em Configurações › Site, ache “Regerar as páginas das matérias” e toque no botão de mesmo nome.',
        'Na pergunta “Regravar todas as matérias no site?”, toque em “Regerar agora”.',
        'Deixe a página aberta: o trabalho é feito aos poucos enquanto a tela está aberta, e o botão mostra quantas já foram (“Regerando… 12 de 40”, por exemplo).',
        'No fim, veja o balanço: quantas foram regeradas, puladas e com falha, com o motivo de cada uma.',
      ],
      dica: 'Endereços e datas não mudam. Se a conexão cair no meio, o que já foi feito continua no ar: rode de novo para terminar.',
    },
    {
      id: 'publicar-paginas-de-base',
      titulo: 'Publicar a central de notícias e o mapa do site',
      quem: 'Só administradores',
      passos: [
        'Em Configurações › Site, dentro de “Google Analytics no site”, ache “Páginas de base e vitrine”.',
        'Toque em “Publicar páginas do site” (ou em “Publicar de novo (regrava tudo)”, se já foi feito).',
        'Espere o “Publicando…” terminar e leia o recado, com a lista do que foi publicado.',
      ],
      dica: 'Depois disso, a central de notícias e o mapa do site para os buscadores (sitemap) se atualizam sozinhos a cada matéria publicada. A Política de Privacidade e os Termos de Uso não saem daqui: são publicados com o resto do site.',
    },
  ],
  perguntas: [
    {
      id: 'tela-quase-vazia',
      pergunta: 'Por que eu não vejo o submenu das Configurações?',
      resposta: 'As seções do espaço (e-mail dos setores, integrações, site e zona de risco) são só de administradores. Para os outros papéis, a tela mostra os atalhos da sua conta e o aviso “O resto é da administração”. Os ajustes de cada área ficam dentro da própria área, para quem cuida dela.',
      termos: ['sem acesso', 'Preferências do espaço', 'restrito', 'tela vazia'],
    },
    {
      id: 'chave-sumiu',
      pergunta: 'Salvei a chave e ela sumiu do campo. Deu certo?',
      resposta: 'Deu, se o cartão mostra “Configurada no cofre em …”. Depois de salva, a chave não volta para a tela de ninguém, nem mascarada. Para trocar, cole a nova por cima e toque em “Salvar no cofre”.',
      termos: ['ver a chave', 'chave escondida', 'cofre'],
    },
    {
      id: 'variavel-de-ambiente',
      pergunta: 'O que quer dizer “Usando a variável de ambiente da Vercel”?',
      resposta: 'A chave foi configurada por fora, direto na hospedagem do Palácio Virtual, e está valendo. Se você salvar uma chave aqui, a daqui passa a valer no lugar dela.',
      termos: ['vercel', 'variável de ambiente', 'chave configurada'],
    },
    {
      id: 'remover-chave',
      pergunta: 'O que acontece se eu remover uma chave?',
      resposta: '“Remover” (só aparece quando a chave está no cofre) tira a chave de lá. Se houver uma chave configurada direto na hospedagem, ela volta a valer; se não, a ferramenta para de funcionar no Palácio Virtual até alguém colar uma chave nova.',
      termos: ['apagar chave', 'desligar integração'],
    },
    {
      id: 'setores-do-diretorio',
      pergunta: 'Onde crio um setor novo?',
      resposta: 'Em Diretório › Setores. A lista de setores da filial é uma só, usada também em Usuários e permissões, Recursos humanos, Voluntários, “Registrar atividade” e no e-mail. Em E-mail dos setores, “Membros” só decide quem envia pelo endereço de cada setor.',
      termos: ['coordenação', 'lista de setores', 'setor'],
    },
    {
      id: 'setor-sem-membros',
      pergunta: 'O que significa “o setor não tem membros: ninguém envia por aqui”?',
      resposta: 'O endereço está ativo, mas o setor dele não tem ninguém. Fora quem tem o papel “Administrador”, só envia por um endereço quem é membro do setor dono dele: toque em “Membros” no setor e marque as pessoas.',
      termos: ['Sem membros — ninguém envia por este setor', 'ninguém consegue enviar'],
    },
    {
      id: 'apagar-setor',
      pergunta: 'Como tiro um setor de uso?',
      resposta: 'Em Diretório › Setores, edite o setor e marque a situação “Desativado”. Ele some das listas de escolha, e quem já está nele continua. Os endereços de e-mail dele, se houver, você desativa em E-mail dos setores.',
      termos: ['excluir setor', 'remover setor', 'Apagar o setor', 'desativar setor'],
    },
    {
      id: 'onde-foi-parar',
      pergunta: 'Onde foi parar o que ficava na página de Configurações?',
      resposta: 'Nada saiu, só mudou de tela. A equipe e os papéis estão em “Pessoas e acessos”, na visão geral. As chaves estão em Integrações; a conta Google, os setores e os endereços, em E-mail dos setores; o Google Analytics e as matérias no ar, em Site; “Reiniciar dados”, em Zona de risco.',
      termos: ['mudou', 'sumiu', 'não acho', 'antes ficava'],
    },
    {
      id: 'conectar-redes',
      pergunta: 'Como conecto as contas das redes sociais?',
      resposta: 'Em Configurações › Integrações, no cartão “Redes sociais”, toque em “Conectar ou revisar as contas”. Abre o Upload-Post, onde quem administra cada página autoriza a publicação; no fim, você volta para cá.',
      termos: ['instagram', 'facebook', 'upload-post', 'publicar nas redes', 'conta desconectada'],
    },
    {
      id: 'nao-esta-no-gmail',
      pergunta: 'O que significa “não está mais no Gmail — não envia”?',
      resposta: 'O endereço sumiu da lista “Enviar e-mail como” da conta Google, ou perdeu a confirmação lá. Ele continua na lista, para não perder o histórico, mas não envia. Se foi engano, confirme o endereço no Gmail e toque em “Sincronizar endereços”.',
      termos: ['alias', 'endereço sumiu', 'Ainda sem confirmação no Gmail'],
    },
    {
      id: 'nome-de-remetente-generico',
      pergunta: 'O que é “nome de remetente genérico”?',
      resposta: 'O nome que sai no e-mail está vazio ou é igual ao começo do endereço (por exemplo, “comunicacao”). É o que quem recebe vê como remetente, então vale dar um nome de verdade em “Nome do remetente”.\n\nEsse nome vale para o que sai pelo Palácio Virtual. Para o que a equipe envia direto pelo Gmail, use o mesmo nome no Gmail, em Configurações → Contas → Enviar e-mail como.',
      termos: ['nome do remetente', 'de quem vem o e-mail'],
    },
    {
      id: 'autorizacao-expirou',
      pergunta: 'Apareceu que a autorização da conta Google “expirou ou foi revogada”. O que faço?',
      resposta: 'Toque em “Reconectar” e entre de novo com a conta dona dos endereços. Até lá, nenhum setor consegue enviar.\n\n“Desconectar” tem o mesmo efeito: ninguém envia até reconectar.',
      termos: ['Reconecte para voltar a enviar', 'desconectar', 'e-mail do setor parou'],
    },
    {
      id: 'tirar-do-ar-apaga',
      pergunta: '“Tirar do ar” apaga a matéria?',
      resposta: 'Apaga a página do servidor do site e a tira da central de notícias e do mapa do site para os buscadores (sitemap), mas o texto continua guardado no Palácio Virtual. Ela vai para “Arquivadas — fora do ar”, e “Republicar” a põe de volta no mesmo endereço.',
      termos: ['despublicar', 'remover do site', 'matéria de teste'],
    },
    {
      id: 'regerar-ou-republicar',
      pergunta: 'Qual a diferença entre regerar e republicar?',
      resposta: 'Regerar refaz as páginas que já estão no ar com o molde atual do site (cabeçalho, rodapé, dados para o Google, fotos otimizadas), sem mudar endereço nem data. Republicar põe de volta no ar uma matéria que tinha saído.',
      termos: ['atualizar páginas', 'molde', 'layout do site'],
    },
    {
      id: 'materia-pulada',
      pergunta: 'Por que uma matéria foi pulada na regeração?',
      resposta: 'O motivo aparece ao lado de cada uma. Um deles: o texto foi editado depois da última publicação. Ela fica de fora para não ir ao ar uma versão que ninguém revisou; revise e republique pela tela da própria matéria.',
      termos: ['pulada', 'regeração', 'o texto foi editado depois da última publicação'],
    },
    {
      id: 'analytics-em-cada-materia',
      pergunta: 'Preciso ligar o Analytics a cada matéria nova?',
      resposta: 'Não. Toda página que o Palácio Virtual cria já nasce com o Analytics. “Ligar o Analytics nas páginas do site” só serve para páginas antigas ou colocadas no servidor por fora, e pula as que já têm.',
      termos: ['google analytics', 'estatísticas do site', 'varredura'],
    },
    {
      id: 'reiniciar-dados',
      pergunta: 'O que faz “Reiniciar dados”?',
      resposta: 'Apaga de vez projetos, pautas, matérias, aprovações, agendamentos, mensagens e arquivos; as contas das pessoas continuam funcionando. Não dá para desfazer: para confirmar, é preciso digitar o nome que a tela pede e tocar em “Apagar tudo definitivamente”.\n\nAs páginas que já estão no site não saem do ar com isso: se alguma precisa sair, use antes “Tirar do ar”, em “No ar em /noticias/”, porque depois de reiniciar ela some dessa lista.',
      termos: ['zona de risco', 'apagar tudo', 'começar do zero', 'resetar'],
    },
  ],
  relacionadas: ['/usuarios', '/correio', '/redes', '/configuracoes/whatsapp'],
}

// -------------------------------------------------------------------- WhatsApp

const WHATSAPP: GuiaDaArea = {
  href: '/configuracoes/whatsapp',
  paraQueServe: 'WhatsApp liga um número de WhatsApp ao Palácio Virtual, pela Evolution API. Com ele conectado, os avisos do sino chegam também no WhatsApp de quem confirmou o número em “Meu perfil”, e um bot responde a quem escreve: mostra os avisos sem abrir, marca como lidos e pausa os avisos.',
  quemUsa: 'Só administradores abrem esta aba. Cada pessoa liga o próprio WhatsApp em “Meu perfil”, sem depender da administração.',
  naPratica: {
    titulo: 'O WhatsApp do Palácio no ar',
    passos: [
      'A administração guarda o endereço do servidor, a instância e a chave no cartão “WhatsApp (Evolution API)”, em Integrações.',
      'Nesta aba, toca em “Conectar pelo QR code” e lê o QR com o celular do chip do Palácio.',
      'Toca em “Ligar o recebimento de mensagens”, para o bot passar a responder.',
      'A Ana confirma o WhatsApp dela em “Meu perfil” com o código de 6 números que chega por lá.',
      'Quando alguém pede a aprovação dela, o aviso chega no sino e no WhatsApp; ela responde “1” e vê o que falta abrir.',
    ],
    resultado: 'Os avisos chegam onde a equipe já está, sem trocar o sino.',
  },
  tour: [
    {
      titulo: 'O WhatsApp do Palácio Virtual',
      texto: 'Aqui a administração conecta o número do Palácio e confere se ele está mandando e recebendo. Cada pessoa liga o próprio WhatsApp em “Meu perfil”.',
    },
    {
      alvo: 'whatsapp.conexao',
      titulo: 'Conexão',
      texto: 'Mostra se o número está conectado. Desconectado, “Conectar pelo QR code” mostra o QR para ler em Dispositivos conectados, no celular do chip do Palácio.',
      seAusente: 'pular',
    },
    {
      alvo: 'whatsapp.recebimento',
      titulo: 'Receber mensagens (bot)',
      texto: 'Sem isto ligado, o número só manda. “Ligar o recebimento de mensagens” faz o servidor entregar ao Palácio o que chega, e o bot responde.',
      seAusente: 'pular',
    },
    {
      alvo: 'whatsapp.fila',
      titulo: 'Fila e horário de silêncio',
      texto: 'De 22h às 7h os avisos comuns esperam e saem às 7h. O que falhou porque o servidor estava fora volta a ser tentado sozinho; “Enviar a fila agora” adianta o que já pode sair.',
      seAusente: 'pular',
    },
    {
      alvo: 'whatsapp.teste',
      titulo: 'Testar',
      texto: '“Mandar mensagem de teste” manda uma mensagem para o seu WhatsApp confirmado. Responda “menu” por lá para ver o bot.',
      seAusente: 'pular',
    },
    {
      alvo: 'whatsapp.registro',
      titulo: 'Últimas mensagens',
      texto: 'O que saiu e o que chegou, com o motivo de cada falha. Do que chega, fica só o comando que o bot entendeu, nunca o texto.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'conectar-whatsapp',
      titulo: 'Conectar o número do Palácio',
      exemplo: 'A administração conecta o chip do Palácio numa segunda de manhã; na mesma hora, quem já confirmou o WhatsApp em “Meu perfil” começa a receber os pedidos de aprovação por lá.',
      quem: 'Só administradores',
      passos: [
        'Em Configurações, no cartão “WhatsApp (Evolution API)”, preencha “Endereço do servidor (https://…)”, “Nome da instância” e “Chave da API (apikey)” e toque em “Salvar no cofre”.',
        'Abra a aba “WhatsApp”. Se aparecer “Instância não encontrada no servidor”, toque em “Criar a instância” ou crie pelo painel da Evolution.',
        'Toque em “Conectar pelo QR code”.',
        'No celular do chip do Palácio, abra o WhatsApp em Configurações → Dispositivos conectados → Conectar um dispositivo e leia o QR. O QR se renova sozinho a cada 30 segundos.',
        'Quando a tela mostrar “Conectado”, toque em “Ligar o recebimento de mensagens”.',
      ],
      dica: 'Use um chip só do Palácio, não um número pessoal. Se a câmera não ler o QR, abra “Não consegue ler o QR code?”, digite o número do chip e toque em “Gerar código”.',
    },
    {
      id: 'testar-whatsapp',
      titulo: 'Testar se está funcionando',
      quem: 'Só administradores',
      passos: [
        'Confirme antes o seu WhatsApp em “Meu perfil”.',
        'Aqui, em “Testar”, toque em “Mandar mensagem de teste”.',
        'No seu WhatsApp, responda “menu”. O bot responde com as opções.',
        'Em “Últimas mensagens”, toque em “Atualizar” e confira o envio e a resposta.',
      ],
    },
  ],
  perguntas: [
    {
      id: 'url-do-webhook',
      pergunta: 'Preciso colar a URL do webhook no painel da Evolution?',
      resposta: 'Não. “Ligar o recebimento de mensagens” configura o endereço, a senha e os eventos no servidor. Uma URL colada à mão no painel da Evolution vai sem a senha, e o Palácio recusa as entregas.\n\nSe a chave mudar em Integrações, toque em “Ligar de novo”.',
      termos: ['webhook', 'url', 'eventos', 'manager', 'painel da evolution'],
    },
    {
      id: 'aviso-nao-chegou',
      pergunta: 'Por que um aviso não chegou no WhatsApp de alguém?',
      resposta: 'O aviso só vai para quem confirmou o número em “Meu perfil”, não pausou e deixou o assunto ligado. Não sai para quem está com o Palácio aberto naquela hora (já está vendo o sino), numa conversa movimentada sai no máximo uma mensagem a cada 15 minutos, e cada pessoa recebe no máximo 40 avisos por dia pelo WhatsApp. As exceções são o desfecho do chamado para quem abriu (resolvido, pedido de informação, cancelado) e a portaria (a chegada do visitante e a resposta de quem é visitado): esses saem mesmo com o Palácio aberto.\n\nNinguém é avisado do que ele mesmo fez: quem resolve o próprio chamado não recebe a réplica. Só a visita registrada na portaria para quem registrou avisa a própria pessoa.\n\nDe 22h às 7h os avisos comuns esperam na fila e saem às 7h; os da portaria saem na hora. Se o servidor estava fora, o aviso fica na fila e sai quando a conexão voltar. Falhas aparecem em “Últimas mensagens”.',
      termos: ['não chegou', 'não recebi', 'mensagem não chega'],
    },
    {
      id: 'quem-escreve-para-o-numero',
      pergunta: 'E quem não é da equipe e escreve para o número?',
      resposta: 'Recebe, no máximo uma vez por dia, uma resposta automática dizendo que o número é de avisos do sistema interno e indicando o site para falar com a Cruz Vermelha. Ninguém lê essas mensagens.',
      termos: ['público', 'atendimento', 'desconhecido'],
    },
    {
      id: 'aviso-caiu-no-sino',
      pergunta: 'Como fico sabendo que o WhatsApp do Palácio caiu?',
      resposta: 'Os administradores recebem no sino e no e-mail o aviso “O WhatsApp do Palácio caiu”, uma vez, e “O WhatsApp do Palácio voltou” quando a conexão volta. Nunca pelo WhatsApp, que é justamente o que caiu. O Palácio percebe pela própria Evolution, por um envio que falhou ou pela conferência de todo dia às 7h05.',
      termos: ['caiu', 'fora do ar', 'alerta', 'computador desligado', 'ngrok'],
    },
    {
      id: 'desconectou-sozinho',
      pergunta: 'O número desconectou sozinho. O que faço?',
      resposta: 'Toque em “Conectar pelo QR code” e leia o QR de novo com o celular do chip do Palácio. Enquanto estiver desconectado, nada sai pelo WhatsApp; os avisos continuam no sino e no e-mail.',
      termos: ['desconectado', 'caiu', 'parou'],
    },
  ],
  relacionadas: ['/configuracoes', '/perfil', '/notificacoes'],
}

// ----------------------------------------------------------------- Meu perfil

const PERFIL: GuiaDaArea = {
  href: '/perfil',
  paraQueServe: 'Meu perfil reúne a sua conta: foto e dados, o crachá virtual, o e-mail de recuperação, o que chega por e-mail e pelo WhatsApp, a senha e a verificação em duas etapas. Quase tudo o que é da sua conta você resolve aqui, sem depender de um administrador.',
  quemUsa: 'Cada pessoa vê e muda só o próprio perfil. Usuário e coordenação não se mudam aqui: a coordenação é definida pela administração.',
  naPratica: {
    titulo: 'Deixar a conta segura e com a sua cara',
    passos: [
      'No primeiro acesso, a Ana põe uma foto e confere o cargo.',
      'Confirma o e-mail de recuperação, para o “Esqueci minha senha” funcionar.',
      'Liga a verificação em duas etapas com o app de autenticação do celular.',
      'Escolhe o que chega por e-mail e o que fica só no sino.',
    ],
    resultado: 'Você resolve a sua conta sozinho e fica protegido.',
  },
  tour: [
    {
      alvo: 'perfil.identidade',
      titulo: 'A sua conta num lugar só',
      texto: 'Aqui ficam sua foto e seus dados, o e-mail de recuperação, os e-mails de aviso, a senha e a verificação em duas etapas. “Trocar foto” aceita JPEG, PNG ou WebP, e você ajusta o corte antes de salvar.',
      lado: 'bottom',
    },
    {
      alvo: 'perfil.cracha',
      titulo: 'O seu crachá virtual',
      texto: 'O crachá funcional no modelo do Manual de Identidade da Cruz Vermelha Brasileira: frente com foto e nome, verso com os dados e um QR. Quem lê o QR vê se você está ativo na filial. “Baixar para imprimir (PDF)” entrega frente e verso no tamanho de crachá.',
    },
    {
      alvo: 'perfil.email',
      titulo: 'E-mail de recuperação',
      texto: 'Recebe o link de “Esqueci minha senha” e os avisos de segurança da conta. Ele só vale depois de confirmado, pelo link que chega nele.',
    },
    {
      alvo: 'perfil.notificacoes',
      titulo: 'O que chega por e-mail',
      texto: 'Tudo aparece no sino. Aqui você escolhe, por assunto, se também chega por e-mail: “Na hora”, “Resumo diário” ou “Só no sino”. A escolha vale na hora.',
    },
    {
      alvo: 'perfil.whatsapp',
      titulo: 'Avisos no WhatsApp',
      texto: 'Os mesmos avisos do sino, no seu WhatsApp. O número passa a valer depois do código de 6 números que chega nele; dá para pausar e escolher os assuntos.',
    },
    {
      alvo: 'perfil.dados',
      titulo: 'Dados pessoais',
      texto: '“Nome completo” e “Cargo” você corrige aqui, em “Salvar alterações”. “Usuário” e “Coordenação” ficam travados: a coordenação quem muda é a administração.',
    },
    {
      alvo: 'perfil.senha',
      titulo: 'Trocar a senha',
      texto: 'Digite a senha atual e a nova duas vezes. A nova precisa de 10 caracteres ou mais, com letras e números. Ao trocar, as outras sessões abertas são encerradas.',
    },
    {
      alvo: 'perfil.verificacao',
      titulo: 'Verificação em duas etapas',
      texto: 'Com ela, o login pede também o código de 6 dígitos de um app no celular. Cadastre um segundo aparelho para não ficar de fora se perder o celular.',
    },
  ],
  tarefas: [
    {
      id: 'trocar-foto',
      titulo: 'Trocar a sua foto',
      exemplo: 'A Ana escolhe uma foto do celular e ajusta o enquadramento; a foto aparece no Chat, nas pautas e no Diretório.',
      passos: [
        'No alto, toque em “Trocar foto” e escolha uma imagem JPEG, PNG ou WebP.',
        'Em “Ajustar foto”, arraste a imagem para posicionar e use o controle para aproximar. O que fica dentro do círculo é o que aparece.',
        'Toque em “Usar esta foto”.',
      ],
      dica: 'Para voltar às iniciais, toque em “Remover”, ao lado de “Trocar foto”.',
    },
    {
      id: 'usar-o-cracha',
      titulo: 'Mostrar ou imprimir o crachá virtual',
      exemplo: 'Na portaria do evento na Central do Brasil, a Ana mostra o crachá no celular; o segurança lê o QR e vê “Crachá válido: pessoa ativa na filial”, com a foto dela.',
      passos: [
        'Em “Crachá virtual”, confira a frente (foto, nome e cargo) e o verso (dados e QR).',
        'Para mostrar, abra esta tela no celular: quem precisar confere lendo o QR do verso com a câmera.',
        'Para imprimir, toque em “Baixar para imprimir (PDF)”. Saem duas páginas no tamanho de crachá (54 × 86 mm): frente e verso.',
        'Para ver o que aparece para quem lê o QR, toque em “Ver a verificação do QR”.',
      ],
      dica: 'A verificação mostra só nome, função, vínculo e foto — nunca CPF, tipo sanguíneo ou contato. Se você sair da filial, o mesmo QR passa a dizer “Crachá inativo”.',
    },
    {
      id: 'mudar-nome-ou-cargo',
      titulo: 'Mudar o seu nome ou cargo',
      passos: [
        'Em “Dados pessoais”, corrija o “Nome completo” ou o “Cargo”.',
        'Toque em “Salvar alterações”.',
        'As iniciais que aparecem no lugar da foto acompanham o novo nome.',
      ],
      dica: '“Usuário” e “Coordenação” aparecem travados. Para mudar a coordenação, peça à administração.',
    },
    { id: 'confirmar-email', ...CONFIRMAR_O_EMAIL },
    { id: 'escolher-emails-de-aviso', ...ESCOLHER_OS_EMAILS },
    {
      id: 'ligar-whatsapp',
      titulo: 'Receber os avisos no WhatsApp',
      exemplo: 'A Ana confirma o celular dela e desliga “Chat” em “O que chega pelo WhatsApp”: recebe por lá só aprovações, chamados e o resto.',
      passos: [
        'Em “WhatsApp”, digite o seu número com DDD e toque em “Mandar código”.',
        'Chega pelo WhatsApp um código de 6 números. Digite no campo e toque em “Confirmar”. O código vale por 10 minutos.',
        'Em “O que chega pelo WhatsApp”, desmarque os assuntos que você não quer receber por lá.',
      ],
      dica: 'Por lá, responda “menu” para ver as opções (veja “O que dá para fazer pelo WhatsApp do Palácio?”). De 22h às 7h os avisos esperam e chegam de manhã, menos os da portaria e os de segurança da conta. “Pausar”, “Trocar número” e “Remover” também ficam aqui.',
    },
    { id: 'trocar-senha', ...TROCAR_A_SENHA },
    { id: 'ativar-verificacao', ...ATIVAR_A_VERIFICACAO },
    {
      id: 'segundo-aparelho',
      titulo: 'Cadastrar um segundo aparelho',
      exemplo: 'O Bruno troca de celular e cadastra o novo aparelho na verificação em duas etapas antes de apagar o antigo.',
      passos: [
        'Com a verificação ativada, toque em “Adicionar outro aparelho”.',
        'Dê ao aparelho um nome diferente dos que já existem (a tela sugere “Celular 2”) e toque em “Gerar QR Code”.',
        'Leia o QR Code no app do outro aparelho, digite o número de 6 dígitos e toque em “Ativar”.',
      ],
      dica: 'Não há códigos de recuperação. Com um segundo aparelho, se você perder o celular, continua entrando sem depender de um administrador.',
    },
    {
      id: 'remover-aparelho',
      titulo: 'Remover um aparelho ou desligar a verificação',
      passos: [
        'Na lista de aparelhos, toque em “Remover” ao lado do que você quer tirar.',
        'Confirme. O aparelho deixa de gerar códigos válidos.',
        'Se era o último, a verificação é desligada e você passa a entrar só com a senha.',
      ],
      dica: 'Se o seu papel é obrigado a usar a verificação, cadastre outro aparelho antes de remover o último.',
    },
    { id: 'sair-da-conta', ...SAIR_DA_CONTA },
  ],
  perguntas: [
    { id: 'para-que-serve-o-email', ...PARA_QUE_SERVE_O_EMAIL },
    {
      id: 'borda-amarela',
      pergunta: 'Por que o quadro do e-mail está com a borda amarela?',
      resposta: 'Porque a sua conta ainda não tem um e-mail de recuperação confirmado. Enquanto for assim, “Esqueci minha senha” não tem para onde mandar o link. Cadastre o endereço e abra o link de confirmação que chega nele.',
      termos: ['faixa amarela', 'não confirmado', 'aviso amarelo'],
    },
    {
      id: 'email-antigo-continua',
      pergunta: 'Troquei o e-mail, mas o antigo continua aparecendo. Por quê?',
      resposta: 'O endereço novo só passa a valer quando você abre o link que chegou nele e toca em “Confirmar este e-mail” (o link vale por 48 horas). Até lá aparece “Aguardando confirmação de …”, e o anterior continua valendo. Depois da troca, o endereço antigo, se estava confirmado, recebe um aviso.',
      termos: ['trocar e-mail', 'Aguardando confirmação', 'e-mail novo'],
    },
    {
      id: 'cracha-dados',
      pergunta: 'De onde vêm os dados do meu crachá? Algo está errado.',
      resposta: 'Da sua ficha em Recursos humanos, se você é da equipe contratada (cargo, setor, admissão e CPF); senão, do seu cadastro de voluntário, se a sua conta estiver ligada a ele; senão, do seu perfil (nome, cargo e coordenação). A foto é a do perfil. Nome e cargo do perfil você corrige aqui mesmo; o que vem do RH ou do cadastro de voluntário, peça a quem cuida dele.',
      termos: ['crachá', 'cracha', 'identificação', 'dados errados', 'admissão', 'cpf no crachá'],
    },
    {
      id: 'cracha-fator-rh',
      pergunta: 'Por que o “Fator RH” do meu crachá diz “Não informado”?',
      resposta: 'O tipo sanguíneo é dado de saúde e só aparece no seu próprio crachá quando está no seu cadastro de voluntário. A ficha do RH não guarda tipo sanguíneo. Ele nunca aparece para quem lê o QR.',
      termos: ['tipo sanguíneo', 'sangue', 'fator rh', 'crachá'],
    },
    {
      id: 'usuario-travado',
      pergunta: 'Por que não consigo mudar o meu usuário nem a coordenação?',
      resposta: 'O usuário é o seu nome de login: ele é definido quando o acesso é criado e não muda depois, nem pela administração. A coordenação é definida pela administração, em “Usuários e permissões”.',
      termos: ['campo bloqueado', 'setor', 'login', 'nome de usuário'],
    },
    {
      id: 'senha-atual-nao-confere',
      pergunta: 'Aparece “A senha atual não confere”. O que faço?',
      resposta: 'Confira a senha com que você entra hoje; o ícone de olho, no campo “Senha atual”, mostra o que foi digitado. Se esqueceu, saia e use “Esqueci minha senha” na tela de entrada, ou peça à administração uma senha nova.',
      termos: ['A senha atual não confere', 'senha errada'],
    },
    {
      id: 'senha-recusada',
      pergunta: 'Por que a minha senha nova foi recusada?',
      resposta: 'A senha nova precisa de pelo menos 10 caracteres (e no máximo 72), com letras e números. Não pode conter o seu usuário nem o seu nome, não pode ser um caractere repetido nem uma senha comum demais, e precisa ser diferente da atual.\n\nO aviso embaixo dos campos diz o que falta enquanto você digita.',
      termos: ['A senha precisa de pelo menos 10 caracteres', 'Use letras e números na senha', 'Essa senha é comum demais', 'A senha não pode conter o nome de usuário', 'A senha não pode conter o seu nome', 'A nova senha precisa ser diferente da atual', 'A confirmação não confere'],
    },
    {
      id: 'desconectado-apos-trocar',
      pergunta: 'Troquei a senha e fui desconectado no celular. É normal?',
      resposta: 'É. Ao trocar a senha, todas as outras sessões abertas são encerradas, para que quem tivesse a senha antiga saia também. Entre de novo com a senha nova.',
      termos: ['sessão encerrada', 'deslogado', 'saiu sozinho'],
    },
    { id: 'resumo-diario', ...RESUMO_DIARIO },
    {
      id: 'so-no-sino',
      pergunta: 'Com “Só no sino” eu deixo de receber algum aviso?',
      resposta: 'Não. Tudo continua aparecendo no sino e em “Notificações”; só deixa de chegar por e-mail. Os avisos de segurança da conta (senha, verificação em duas etapas) chegam sempre no seu e-mail confirmado.',
      termos: ['desligar e-mails', 'parar de receber e-mail', 'sino'],
    },
    {
      id: 'preferencia-padrao',
      pergunta: 'Nunca mexi nas preferências. O que está valendo?',
      resposta: '“Na hora”, em todos os assuntos. Mas o e-mail só sai se o seu e-mail de recuperação estiver confirmado, e, se você estiver com o Palácio Virtual aberto, o aviso que você não abrir vai para o resumo do dia em vez de sair na hora.',
      termos: ['padrão', 'e-mail não chegou', 'na hora'],
    },
    {
      id: 'ultimo-aparelho',
      pergunta: 'Por que não consigo remover o meu último aparelho?',
      resposta: 'Para o seu papel, a verificação em duas etapas é obrigatória. Cadastre outro aparelho com “Adicionar outro aparelho” e depois remova o antigo.',
      termos: ['Para o seu papel a verificação é obrigatória', 'desligar verificação', '2fa obrigatória'],
    },
    {
      id: 'perdi-o-celular',
      pergunta: 'Perdi o celular com o app autenticador. Como entro?',
      resposta: 'Se você cadastrou um segundo aparelho, use o código dele. Se não, na tela do código toque em “Perdi ou troquei de celular — avisar os administradores”: alguém da administração confirma com você e tira a verificação da sua conta. Depois, cadastre o app no celular novo aqui.',
      termos: ['celular novo', 'troquei de celular', 'código do app', '2fa'],
    },
    {
      id: 'o-que-faz-o-whatsapp',
      pergunta: 'O que dá para fazer pelo WhatsApp do Palácio?',
      resposta: 'Depois de confirmar o número aqui, mande “menu” para o número do Palácio e responda com o número da opção: “1” mostra os avisos que você não abriu, “2” marca todos como lidos, “3” pausa ou retoma os avisos, “4” traz a sua agenda de hoje e amanhã, “5” os seus chamados abertos e “6” o que espera o seu voto nas aprovações.\n\nPara responder um aviso de chamado, do Chat ou de mensagem, responda a própria mensagem do aviso no WhatsApp (segure a mensagem e toque em “Responder”): o texto entra no chamado ou na conversa com o seu nome. No aviso de aprovação, responda “aprovar” (o Palácio manda a conferência do setor e você confirma com “confirmo”) ou “ajustes:” e o que precisa mudar. Para abrir um chamado, escreva “chamado:” e o problema; o Palácio pergunta a equipe, o assunto e o quanto atrapalha.\n\nNo aviso de visitante na portaria, responda a mensagem com “1” (pode subir), “2” (aguarde na recepção) ou “3” (não posso receber agora), com um recado depois do número se quiser. Se só uma visita espera por você, vale mandar o número sem responder a mensagem.\n\nFotos e vídeos de uma ação mandados para o número do Palácio viram um envio para a comunicação: mande todos, escreva “pronto” e responda o título e se as pessoas autorizaram o uso da imagem (arquivos de até 64 MB; maiores, pelo link de envio).\n\nPara uma dúvida, escreva “ajuda” e a pergunta, como “ajuda como troco a senha”: a resposta vem da Central de ajuda, só das áreas que você abre, com o link para ler inteira. A agenda segue as camadas que você deixou ligadas na Agenda.',
      termos: ['bot', 'menu do whatsapp', 'agenda pelo whatsapp', 'chamados pelo whatsapp', 'aprovação pelo whatsapp', 'dúvida pelo whatsapp', 'responder pelo whatsapp', 'abrir chamado pelo whatsapp', 'votar pelo whatsapp', 'fotos pelo whatsapp', 'envio pelo whatsapp'],
    },
    {
      id: 'whatsapp-com-verificacao',
      pergunta: 'Por que o WhatsApp não me deixa responder nem votar?',
      resposta: 'Porque a sua conta usa a verificação em duas etapas (ou o seu papel é obrigado a usar), e o WhatsApp não pede o código do app autenticador. Para quem é assim, o WhatsApp consulta (avisos, agenda, chamados, aprovações e dúvidas), abre chamado e responde à portaria (1, 2 ou 3). Responder os outros avisos, votar e mandar fotos de uma ação ficam no Palácio (as fotos, pelo link de envio).',
      termos: ['verificação em duas etapas', 'não deixa responder', 'não consigo votar pelo whatsapp', '2fa whatsapp'],
    },
    {
      id: 'perfil-publico',
      pergunta: 'Qual a diferença entre “Meu perfil” e o perfil público?',
      resposta: '“Meu perfil” cuida da conta: foto, nome, cargo, e-mails, senha e segurança. “Ver meu perfil público →” abre a sua página no Diretório, a que a equipe vê, com apresentação e contatos; essa página só você edita.',
      termos: ['perfil público', 'diretório', 'apresentação', 'contatos'],
    },
  ],
  relacionadas: ['/notificacoes', '/pessoas'],
}

export const guias: GuiaDaArea[] = [ACESSOS, USUARIOS, CONFIGURACOES, WHATSAPP, PERFIL]
