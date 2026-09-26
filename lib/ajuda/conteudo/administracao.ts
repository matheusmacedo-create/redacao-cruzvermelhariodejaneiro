import type { GuiaDaArea } from '../tipos'
import { ATIVAR_A_VERIFICACAO, CONFIRMAR_O_EMAIL, ESCOLHER_OS_EMAILS, PARA_QUE_SERVE_O_EMAIL, SAIR_DA_CONTA, TROCAR_A_SENHA } from './geral'
import { RESUMO_DIARIO } from './meu-dia'

/**
 * A ajuda do grupo Administração do menu: Usuários e permissões (/usuarios),
 * Configurações (/configuracoes) e Meu perfil (/perfil). A Central de ajuda
 * (/ajuda) é a própria ajuda e não tem guia.
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
 * lib/permissoes.ts. Os alvos `usuarios.*`, `configuracoes.*` e `perfil.*`
 * são marcados com `data-ajuda` nessas telas. Mudou a tela ou a regra, muda
 * aqui no mesmo PR (docs/AJUDA.md).
 */

// ------------------------------------------------------ Usuários e permissões

const USUARIOS: GuiaDaArea = {
  href: '/usuarios',
  paraQueServe: 'Aqui a administração decide quem entra na Redação e o que cada pessoa pode fazer. Você cria acessos (de preferência por convite por e-mail), muda papel, coordenação e e-mail, redefine senhas, desativa e reativa contas e escolhe quem é obrigado a usar a verificação em duas etapas. Tudo o que muda fica no “Registro de acessos”.',
  quemUsa: 'Só administradores veem esta área. Ninguém muda o próprio papel nem desativa a própria conta (quem faz é outra pessoa da administração), e a Redação nunca fica sem pelo menos um administrador ativo.',
  tour: [
    {
      titulo: 'Usuários e permissões',
      texto: 'Aqui você decide quem entra na Redação e com qual papel: cria acessos, redefine senhas, desativa contas e escolhe quem é obrigado a usar a verificação em duas etapas.',
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
      texto: '“Novo usuário” cria um acesso por vez; “Convidar várias pessoas” manda vários convites de uma vez. Pelo convite por e-mail, a pessoa cria a própria senha e ninguém mais a conhece.',
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
      passos: [
        'Toque em “Novo usuário”.',
        'Preencha “Nome completo”. O “Usuário (para o login)” vem sugerido a partir do nome, no formato nome.sobrenome; ajuste se precisar.',
        'Digite o “E-mail” da pessoa e, se quiser, “Cargo ou função” e “Coordenação”.',
        'Escolha o papel: “Administrador”, “Editor”, “Colaborador” ou “Equipe da escola”. Na dúvida, “Colaborador”: dá para mudar depois.',
        'Deixe marcado “Enviar convite por e-mail (recomendado)” e toque em “Criar acesso”.',
        'O recado no alto confirma para onde o convite foi. A pessoa recebe o usuário e um link para criar a própria senha.',
      ],
      dica: 'O link do convite vale por 72 horas e, quando usado, já confirma o e-mail da pessoa. Quem ainda não entrou aparece em “Convites pendentes”, na tela de “Convidar várias pessoas”, onde dá para reenviar ou cancelar o convite.',
    },
    {
      id: 'dar-acesso-sem-email',
      titulo: 'Dar acesso a quem não tem e-mail',
      passos: [
        'Toque em “Novo usuário” e preencha nome, usuário, coordenação e papel. Deixe o “E-mail” em branco.',
        'Marque “Gerar senha temporária” e toque em “Criar acesso”.',
        'A senha aparece uma única vez, no quadro “Senha temporária de @…”. Toque em “Copiar usuário e senha”.',
        'Repasse pessoalmente ou por um canal privado, nunca num grupo.',
        'No primeiro login, a Redação pede que a pessoa crie uma senha só dela.',
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
        'Se alguém desse papel ainda não tem o app, a Redação diz quantas pessoas serão levadas a cadastrar e pede confirmação.',
        'Quem ainda não tem o app cadastra no próximo acesso, antes de conseguir usar a Redação.',
      ],
      dica: 'Peça que cada pessoa cadastre também um segundo aparelho: não há códigos de recuperação, e quem perde o celular depende da administração para voltar.',
    },
  ],
  perguntas: [
    {
      id: 'diferenca-entre-papeis',
      pergunta: 'Qual a diferença entre os papéis?',
      resposta: '“Administrador” controla a Redação inteira: pessoas, acessos, integrações, site e dados; “Editor” toca a produção: publica, dispara campanhas e cuida da Biblioteca. “Colaborador” registra, escreve, comenta e vota nas aprovações para as quais recebe convite; “Equipe da escola” vê só a Escola de Educação e Saúde.\n\nO detalhe está na tabela “O que cada papel pode fazer”, mais abaixo nesta página.',
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
      pergunta: 'Convite por e-mail, senha temporária ou definir uma senha: qual usar?',
      resposta: 'Prefira o convite: a pessoa cria a própria senha pelo link, ninguém mais a conhece e o e-mail dela já fica confirmado.\n\nA senha temporária é para quem não tem e-mail: aparece uma vez na tela, você repassa pessoalmente e a pessoa troca no primeiro login. “Definir uma senha” funciona igual, mas quem escolhe a senha é você.',
      termos: ['senha provisória', 'primeiro acesso', 'como dar acesso'],
    },
    {
      id: 'convite-nao-aparece',
      pergunta: 'Por que a opção de convite por e-mail não aparece?',
      resposta: 'Ela só aparece com um e-mail válido no campo “E-mail” e com o envio de e-mail da Redação configurado. Sem o envio configurado, a tela mostra um aviso amarelo no alto, e só a senha temporária (ou uma senha definida por você) funciona.',
      termos: ['Convite por e-mail indisponível', 'Informe o e-mail para poder enviar o convite', 'envio de e-mail não está configurado', 'RESEND_API_KEY'],
    },
    {
      id: 'convite-nao-chegou',
      pergunta: 'O convite não chegou. E agora?',
      resposta: 'Peça para a pessoa olhar o spam. Para mandar um link novo, abra “Convidar várias pessoas”: em “Convites pendentes”, “Reenviar” gera outro link, e o anterior deixa de valer.\n\nSe o e-mail não sair de jeito nenhum, abra a pessoa aqui, toque em “Redefinir senha” e gere uma senha temporária.',
      termos: ['reenviar convite', 'convite expirou', 'link expirou', 'o convite NÃO saiu'],
    },
    {
      id: 'aguardando-troca-de-senha',
      pergunta: 'O que significa “Aguardando troca de senha”?',
      resposta: 'A pessoa está com uma senha provisória (gerada ou definida pela administração) e ainda não criou a dela. No próximo login, a Redação pede a troca antes de qualquer outra coisa. O número “Aguardando 1º acesso”, no alto, conta essas pessoas.\n\nQuem recebeu convite por e-mail e ainda não entrou aparece como “Nunca entrou”.',
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
      resposta: 'Fica, se tiver e-mail confirmado: a Redação manda um aviso de segurança quando o papel muda, quando a senha é redefinida, quando a conta é desativada ou reativada e quando a verificação em duas etapas é removida.',
      termos: ['aviso de segurança', 'e-mail de aviso', 'notificação'],
    },
    {
      id: 'convidar-varias-pessoas',
      pergunta: 'Dá para dar acesso a várias pessoas de uma vez?',
      resposta: 'Dá, por convite: toque em “Convidar várias pessoas”. Na tela “Adicionar pessoas à Redação”, você marca quem vai receber acesso, confere e-mail, setor e papel e envia os convites, até 30 de uma vez. Quem não tem e-mail entra por aqui, com senha temporária.',
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
  paraQueServe: 'Configurações é onde a administração liga a Redação às ferramentas de fora e cuida do site: as chaves de integração, o E-mail do setor (a conta Google, os setores e os endereços), o Google Analytics, as páginas do site, o que está no ar em /noticias/ e a zona de risco.',
  quemUsa: 'Editores e colaboradores também abrem esta área, mas veem só um aviso: as seções são de administradores. Criar logins e mudar papéis fica em “Usuários e permissões”.',
  tour: [
    {
      titulo: 'Configurações da Redação',
      texto: 'Aqui a administração liga a Redação às ferramentas de fora e cuida do site. Quem não é administrador vê só um aviso: estas seções são restritas.',
    },
    {
      alvo: 'configuracoes.restrito',
      titulo: 'Área da administração',
      texto: 'Para mudar algo daqui, fale com alguém da administração. O que é seu (senha, foto, e-mails de aviso) fica em “Meu perfil”.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.integracoes',
      titulo: 'Integrações',
      texto: 'As chaves das ferramentas externas. Ficam guardadas no cofre e valem na hora; depois de salva, a chave não aparece mais para ninguém. Para trocar, cole a nova por cima.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.correio',
      titulo: 'E-mail do setor',
      texto: 'Três passos: conectar a conta Google dona dos endereços, criar os setores com quem é de cada um e ligar cada endereço ao seu setor. Endereço novo chega inativo.',
      seAusente: 'pular',
    },
    {
      alvo: 'configuracoes.site',
      titulo: 'O site',
      texto: 'O Google Analytics, as páginas de base (privacidade, termos, central de notícias) e “Regerar as páginas das matérias”, que refaz o que está no ar com o molde atual.',
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
      texto: '“Reiniciar dados” apaga de vez pautas, matérias, aprovações, mensagens e arquivos da Redação. Não tem volta: é só para começar do zero.',
      seAusente: 'pular',
    },
  ],
  tarefas: [
    {
      id: 'guardar-chave',
      titulo: 'Guardar ou trocar a chave de uma integração',
      quem: 'Só administradores',
      passos: [
        'Em “Integrações”, ache o cartão da ferramenta: “Hunter.io”, “Google (cliente OAuth do Gmail)” ou “Meta Ads (token do usuário do sistema)”.',
        'Pegue a chave no painel da ferramenta. O endereço dele está no pé do cartão, em “A chave fica em …”.',
        'Cole no campo. No cartão do Google, preencha “ID do cliente” e “Chave secreta do cliente”.',
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
        'Em “1. Conta do Google”, siga uma vez o passo a passo do Google Cloud que aparece ali. O endereço de retorno que ele pede está na tela, com o botão “Copiar”.',
        'Cole o ID e a chave secreta no cartão “Google (cliente OAuth do Gmail)”, em Integrações, e toque em “Salvar no cofre”.',
        'Toque em “Conectar conta Google” e entre com a conta dona dos endereços dos setores, a que tem a lista “Enviar e-mail como” no Gmail.',
        'De volta à Redação, o cartão mostra “Conectada:” com a conta, e os endereços do Gmail já aparecem em “3. Endereços (aliases do Gmail)”.',
      ],
      dica: 'Se a autorização vencer ou for revogada, o cartão avisa, e nenhum setor envia até alguém tocar em “Reconectar”.',
    },
    {
      id: 'criar-setor',
      titulo: 'Criar um setor e dizer quem é dele',
      quem: 'Só administradores',
      passos: [
        'Em “2. Setores e quem é de cada um”, digite o nome no campo “Nome do setor” e toque em “Criar setor”.',
        'Na linha do setor, toque em “Membros”.',
        'Marque quem é do setor e toque em “Salvar membros”.',
      ],
      dica: 'Só envia pelo endereço de um setor quem é membro dele (quem tem o papel “Administrador” envia por qualquer um). O setor criado aqui entra na lista de setores da filial, a mesma de “Setores”, no Diretório. Mudar a coordenação de alguém em “Usuários e permissões” também muda o setor de mesmo nome.',
    },
    {
      id: 'ativar-endereco',
      titulo: 'Ligar um endereço a um setor e ativar',
      quem: 'Só administradores',
      passos: [
        'Endereço criado (e confirmado) no Gmail depois da conexão só aparece depois de “Sincronizar endereços”. Ele chega inativo.',
        'Em “3. Endereços (aliases do Gmail)”, escolha na lista ao lado de cada endereço o setor dele.',
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
        'De volta à Redação, toque em “Sincronizar endereços”.',
        'Na linha do endereço, toque em “Assinatura” para conferir como ficou.',
      ],
      dica: 'Ninguém edita a assinatura na hora de enviar: vale sempre a que está no Gmail.',
    },
    {
      id: 'tirar-do-ar',
      titulo: 'Tirar uma matéria do site',
      quem: 'Só administradores',
      passos: [
        'Em “No ar em /noticias/”, ache a matéria na lista.',
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
        'Em “Regerar as páginas das matérias”, toque no botão de mesmo nome.',
        'Na pergunta “Regravar todas as matérias no site?”, toque em “Regerar agora”.',
        'Deixe a página aberta: o trabalho é feito aos poucos enquanto a tela está aberta, e o botão mostra quantas já foram (“Regerando… 12 de 40”, por exemplo).',
        'No fim, veja o balanço: quantas foram regeradas, puladas e com falha, com o motivo de cada uma.',
      ],
      dica: 'Endereços e datas não mudam. Se a conexão cair no meio, o que já foi feito continua no ar: rode de novo para terminar.',
    },
    {
      id: 'publicar-paginas-de-base',
      titulo: 'Publicar a privacidade, os termos e a central de notícias',
      quem: 'Só administradores',
      passos: [
        'Desça até “Google Analytics no site” e, dentro dele, “Páginas de base e vitrine”.',
        'Toque em “Publicar páginas do site” (ou em “Publicar de novo (regrava tudo)”, se já foi feito).',
        'Espere o “Publicando…” terminar e leia o recado, com a lista do que foi publicado.',
      ],
      dica: 'Depois disso, a central de notícias e o mapa do site para os buscadores (sitemap) se atualizam sozinhos a cada matéria publicada.',
    },
  ],
  perguntas: [
    {
      id: 'tela-quase-vazia',
      pergunta: 'Por que a tela de Configurações está quase vazia para mim?',
      resposta: 'As seções daqui são só de administradores; para os outros papéis aparece apenas o aviso “A gestão de usuários é restrita aos administradores”. O que é seu (senha, foto, e-mails de aviso) fica em “Meu perfil”.',
      termos: ['sem acesso', 'Preferências do espaço', 'restrito'],
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
      resposta: 'A chave foi configurada por fora, direto na hospedagem da Redação, e está valendo. Se você salvar uma chave aqui, a daqui passa a valer no lugar dela.',
      termos: ['vercel', 'variável de ambiente', 'chave configurada'],
    },
    {
      id: 'remover-chave',
      pergunta: 'O que acontece se eu remover uma chave?',
      resposta: '“Remover” (só aparece quando a chave está no cofre) tira a chave de lá. Se houver uma chave configurada direto na hospedagem, ela volta a valer; se não, a ferramenta para de funcionar na Redação até alguém colar uma chave nova.',
      termos: ['apagar chave', 'desligar integração'],
    },
    {
      id: 'setores-do-diretorio',
      pergunta: 'Os setores daqui são os mesmos da tela “Setores”, no Diretório?',
      resposta: 'São: a lista de setores da filial é uma só, usada também em Usuários e permissões, Recursos humanos, Voluntários e “Registrar atividade”. Aqui, em “Membros”, você decide quem envia pelo endereço de cada setor.',
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
      pergunta: 'O que acontece se eu apagar um setor aqui?',
      resposta: 'O botão da lixeira, ao lado de “Membros”, apaga o setor da lista de setores da filial, a mesma de “Setores”, no Diretório, e da “Coordenação” em Usuários. Os endereços dele ficam sem setor e desativados, e a lista de membros se perde.\n\nPara só tirar um setor de uso, prefira marcá-lo como “Desativado” em “Setores”, no Diretório.',
      termos: ['excluir setor', 'remover setor', 'Apagar o setor', 'lixeira'],
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
      resposta: 'O nome que sai no e-mail está vazio ou é igual ao começo do endereço (por exemplo, “comunicacao”). É o que quem recebe vê como remetente, então vale dar um nome de verdade em “Nome do remetente”.\n\nEsse nome vale para o que sai pela Redação. Para o que a equipe envia direto pelo Gmail, use o mesmo nome no Gmail, em Configurações → Contas → Enviar e-mail como.',
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
      resposta: 'Apaga a página do servidor do site e a tira da central de notícias e do mapa do site para os buscadores (sitemap), mas o texto continua guardado na Redação. Ela vai para “Arquivadas — fora do ar”, e “Republicar” a põe de volta no mesmo endereço.',
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
      resposta: 'Não. Toda página que a Redação cria já nasce com o Analytics. “Ligar o Analytics nas páginas do site” só serve para páginas antigas ou colocadas no servidor por fora, e pula as que já têm.',
      termos: ['google analytics', 'estatísticas do site', 'varredura'],
    },
    {
      id: 'reiniciar-dados',
      pergunta: 'O que faz “Reiniciar dados”?',
      resposta: 'Apaga de vez projetos, pautas, matérias, aprovações, agendamentos, mensagens e arquivos; as contas das pessoas continuam funcionando. Não dá para desfazer: para confirmar, é preciso digitar o nome que a tela pede e tocar em “Apagar tudo definitivamente”.\n\nAs páginas que já estão no site não saem do ar com isso: se alguma precisa sair, use antes “Tirar do ar”, em “No ar em /noticias/”, porque depois de reiniciar ela some dessa lista.',
      termos: ['zona de risco', 'apagar tudo', 'começar do zero', 'resetar'],
    },
  ],
  relacionadas: ['/usuarios', '/correio', '/redes'],
}

// ----------------------------------------------------------------- Meu perfil

const PERFIL: GuiaDaArea = {
  href: '/perfil',
  paraQueServe: 'Meu perfil reúne a sua conta: foto e dados, o e-mail de recuperação, o que chega por e-mail, a senha e a verificação em duas etapas. Quase tudo o que é da sua conta você resolve aqui, sem depender de um administrador.',
  quemUsa: 'Cada pessoa vê e muda só o próprio perfil. Usuário e coordenação não se mudam aqui: a coordenação é definida pela administração.',
  tour: [
    {
      alvo: 'perfil.identidade',
      titulo: 'A sua conta num lugar só',
      texto: 'Aqui ficam sua foto e seus dados, o e-mail de recuperação, os e-mails de aviso, a senha e a verificação em duas etapas. “Trocar foto” aceita JPEG, PNG ou WebP, e você ajusta o corte antes de salvar.',
      lado: 'bottom',
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
      passos: [
        'No alto, toque em “Trocar foto” e escolha uma imagem JPEG, PNG ou WebP.',
        'Em “Ajustar foto”, arraste a imagem para posicionar e use o controle para aproximar. O que fica dentro do círculo é o que aparece.',
        'Toque em “Usar esta foto”.',
      ],
      dica: 'Para voltar às iniciais, toque em “Remover”, ao lado de “Trocar foto”.',
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
    { id: 'trocar-senha', ...TROCAR_A_SENHA },
    { id: 'ativar-verificacao', ...ATIVAR_A_VERIFICACAO },
    {
      id: 'segundo-aparelho',
      titulo: 'Cadastrar um segundo aparelho',
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
      resposta: '“Na hora”, em todos os assuntos. Mas o e-mail só sai se o seu e-mail de recuperação estiver confirmado, e, se você estiver com a Redação aberta, o aviso que você não abrir vai para o resumo do dia em vez de sair na hora.',
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
      id: 'perfil-publico',
      pergunta: 'Qual a diferença entre “Meu perfil” e o perfil público?',
      resposta: '“Meu perfil” cuida da conta: foto, nome, cargo, e-mails, senha e segurança. “Ver meu perfil público →” abre a sua página no Diretório, a que a equipe vê, com apresentação e contatos; essa página só você edita.',
      termos: ['perfil público', 'diretório', 'apresentação', 'contatos'],
    },
  ],
  relacionadas: ['/notificacoes', '/pessoas'],
}

export const guias: GuiaDaArea[] = [USUARIOS, CONFIGURACOES, PERFIL]
