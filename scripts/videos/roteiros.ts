import type { Roteiro } from './tipos'
import { textoExplicadoPeloVideo } from '../../lib/ajuda/seguranca'

/**
 * Os roteiros dos vídeos da ajuda (docs/AJUDA.md §14). Cada um conta, em voz, a tarefa da ajuda escrita
 * (lib/ajuda/conteudo): mesmos passos, mesmos nomes de botão. Mudou a tarefa, muda o roteiro e grava de novo
 * (scripts/conferir-videos.ts avisa quando o texto da tarefa mudou depois da gravação).
 *
 * Gravados sempre como a conta de gravação ("Ana Ribeiro"), no espaço de Demonstração, com os dados de
 * scripts/demonstracao/semear.sql. Os alvos usam os `data-ajuda` do tour sempre que existem. O mesmo roteiro grava a
 * versão de celular (--celular): o menu vira a gaveta (`r.menu`), e a fala que cita o caminho tem `falaNoCelular`.
 */

/** Uma data daqui a alguns dias, no fuso da filial (AAAA-MM-DD, o formato do campo de data). */
function daquiA(dias: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
}

const FECHAMENTO = 'Ficou alguma dúvida? Toque no ponto de interrogação, no alto de qualquer tela.'

export const ROTEIROS: Roteiro[] = [
  {
    id: 'inicio-o-que-e-meu',
    area: '/dashboard',
    tarefa: 'ver-o-que-e-meu',
    titulo: 'Ver o que precisa de você hoje',
    inicio: '/pautas',
    abertura: 'Como ver, no Início, o que precisa de você hoje.',
    passos: [
      {
        fala: 'O Início é a primeira tela do Palácio Virtual. De qualquer lugar, toque em Início, no alto do menu.',
        falaNoCelular: 'O Início é a primeira tela do Palácio Virtual. De qualquer lugar, abra o menu, no canto de cima, e toque em Início.',
        acao: async (r) => { await r.esperar(1500); await r.menu('/dashboard') },
      },
      {
        fala: 'Logo abaixo da saudação, uma frase resume o seu dia: as pautas atrasadas, as que vencem nos próximos sete dias e o que espera a sua aprovação.',
        acao: async (r) => { await r.destacar('[data-ajuda="inicio.resumo"] p:has-text("aprovação")') },
      },
      {
        fala: 'Os quatro números levam direto a cada lista: o que espera o seu voto, as pautas atrasadas e as que vencem nesta semana.',
        acao: async (r) => { await r.destacar('[data-ajuda="inicio.resumo"] ul') },
      },
      {
        fala: 'Em Minhas pautas ficam as pautas em que você é responsável, separadas por prazo. Comece pelas atrasadas e pelas que vencem hoje.',
        acao: async (r) => { await r.apagar(); await r.rolar('[data-ajuda="inicio.minhas-pautas"]'); await r.destacar('[data-ajuda="inicio.minhas-pautas"]') },
      },
      {
        fala: 'Toque numa pauta para abrir a sala dela, com tudo o que já foi feito.',
        acao: async (r) => { await r.apagar(); await r.clicar('[data-ajuda="inicio.minhas-pautas"] a:has-text("Balanço do curso")', { navega: true }) },
        pausa: 900,
      },
      {
        fala: 'Para voltar, toque de novo em Início.',
        falaNoCelular: 'Para voltar, abra o menu e toque de novo em Início.',
        acao: async (r) => { await r.menu('/dashboard') },
      },
      {
        fala: 'Em Esperando você ficam os conteúdos que pedem o seu voto. Um toque abre a tela de aprovação, onde você decide.',
        acao: async (r) => {
          await r.rolar('[data-ajuda="inicio.esperando-voce"]')
          await r.destacar('[data-ajuda="inicio.esperando-voce"]')
          await r.esperar(2200)
          await r.apagar()
          await r.clicar('[data-ajuda="inicio.esperando-voce"] a:has-text("Mutirão de saúde")', { navega: true })
        },
        pausa: 1200,
      },
    ],
    fechamento: FECHAMENTO,
  },
  {
    id: 'pautas-criar-pauta',
    area: '/pautas',
    tarefa: 'criar-pauta',
    titulo: 'Criar uma pauta completa',
    inicio: '/pautas',
    abertura: 'Como criar uma pauta completa no Palácio Virtual.',
    passos: [
      {
        fala: 'Em Pautas, toque em Nova pauta completa.',
        acao: async (r) => { await r.esperar(600); await r.clicar('[data-ajuda="pautas.nova"]', { navega: true }) },
      },
      {
        fala: 'Escolha o tipo do registro, aqui uma ação, e escreva o nome da atividade.',
        acao: async (r) => {
          await r.clicar('[data-ajuda="registrar.tipo"] button:has-text("Ação")')
          await r.digitar('input[name="title"]', 'Ação de prevenção de afogamentos na praia')
        },
      },
      {
        fala: 'A coordenação responsável já vem marcada com a sua. Se a atividade for de um projeto, escolha o projeto.',
        acao: async (r) => {
          await r.destacar('select[name="coordination"]')
          await r.esperar(1400)
          await r.apagar()
          await r.escolher('select:has(option:has-text("Nenhum projeto"))', 'Plano de verão: chuvas e enchentes')
        },
      },
      {
        fala: 'Em Planejamento, confira o responsável e defina a prioridade e a data da atividade, que vira o prazo do cartão.',
        acao: async (r) => {
          await r.rolar('[data-ajuda="registrar.planejamento"]')
          await r.apontar('select[name="responsavel"]')
          await r.clicar('[data-ajuda="registrar.planejamento"] button:has-text("Alta")')
          await r.data('input[name="dueDate"]', daquiA(7))
        },
      },
      {
        fala: 'Preencha os detalhes que o tipo pede, como o local e quantos voluntários vão, e uma descrição curta.',
        acao: async (r) => {
          await r.rolar('input[name="local"]')
          await r.digitar('input[name="local"]', 'Praia de Copacabana, posto 4')
          await r.digitar('input[name="volunteersCount"]', '12')
          await r.rolar('textarea[name="description"]')
          await r.digitar('textarea[name="description"]', 'Voluntários orientam banhistas sobre afogamento e primeiros socorros.')
        },
      },
      {
        fala: 'Toque em Enviar para Comunicação. A sala da pauta abre, e o cartão entra no quadro.',
        acao: async (r) => { await r.rolar('[data-ajuda="registrar.enviar"]'); await r.clicar('[data-ajuda="registrar.enviar"]', { navega: true }) },
        final: true,
        pausa: 1000,
      },
      {
        fala: 'No quadro de Pautas, o cartão novo aparece na primeira coluna, Entrada, pronto para a equipe.',
        acao: async (r) => {
          await r.menu('/pautas')
          await r.destacar('[data-ajuda="pautas.quadro"] [data-cartao]:has-text("Ação de prevenção de afogamentos")')
        },
        final: true,
        pausa: 900,
      },
    ],
    fechamento: FECHAMENTO,
  },
  {
    id: 'aprovacoes-aprovar-conteudo',
    area: '/aprovacoes',
    tarefa: 'aprovar-um-conteudo',
    titulo: 'Aprovar um conteúdo',
    inicio: '/dashboard',
    abertura: 'Como aprovar um conteúdo no Palácio Virtual.',
    passos: [
      {
        fala: 'Abra Aprovações, no menu. A tela já abre no que espera o seu voto.',
        falaNoCelular: 'Abra o menu e toque em Aprovações. A tela já abre no que espera o seu voto.',
        acao: async (r) => { await r.esperar(500); await r.menu('/aprovacoes'); await r.destacar('[data-ajuda="aprovacoes.abas"]') },
      },
      {
        fala: 'Cada cartão é uma rodada, com o setor da pauta, o prazo e quem já votou. No cartão, toque em Revisar agora.',
        acao: async (r) => { await r.apagar(); await r.esperar(2200); await r.clicar('a[data-ajuda="aprovacoes.abrir"]:has-text("Revisar agora")', { navega: true }) },
      },
      {
        fala: 'Leia o conteúdo. Ao lado, o quadro do setor diz o que ele observa numa revisão.',
        acao: async (r) => { await r.destacar('[data-ajuda="aprovacoes.conteudo"]'); await r.esperar(1800); await r.destacar('[data-ajuda="aprovacoes.setor"]') },
      },
      {
        fala: 'Em Sua decisão, toque em Aprovar.',
        acao: async (r) => { await r.apagar(); await r.clicar('[data-ajuda="aprovacoes.decisao"] button:has-text("Aprovar")') },
      },
      {
        fala: 'Em Antes de aprovar, confira, marque cada item que você conferiu. Se não puder garantir algum, não aprove: peça ajustes e diga o que falta.',
        acao: async (r) => {
          await r.rolar('[data-ajuda="aprovacoes.conferencia"]')
          for (let i = 0; i < 4; i++) await r.clicar(`[data-ajuda="aprovacoes.conferencia"] input[type="checkbox"] >> nth=${i}`, { depois: 350 })
        },
      },
      {
        fala: 'Se quiser, deixe um comentário. Depois, toque em Confirmar decisão.',
        acao: async (r) => {
          await r.digitar('[data-ajuda="aprovacoes.decisao"] textarea[name="note"]', 'Tudo certo, pode publicar.')
          await r.clicar('[data-ajuda="aprovacoes.decisao"] button:has-text("Confirmar decisão")', { navega: true })
        },
        final: true,
        pausa: 800,
      },
      {
        fala: 'Pronto. O seu voto fica registrado, e quem pediu a aprovação recebe o aviso.',
        acao: async (r) => { await r.destacar('[data-ajuda="aprovacoes.numeros"]') },
        final: true,
        pausa: 900,
      },
    ],
    fechamento: FECHAMENTO,
  },
  // ---------------------------------------------------------------- os vídeos de explicação (docs/AJUDA.md §18)
  // Gravados sobre a página "Segurança do Palácio" (/seguranca), com `explica`: o texto da página que cada um conta.
  {
    // Vídeo de cenas (inicio "cena:…"): números, gráficos, o mapa dos setores e fontes de fora (§18). Celular primeiro.
    id: 'seguranca-por-que-existe',
    area: '/seguranca',
    tarefa: 'por-que-existe',
    explica: textoExplicadoPeloVideo('seguranca-por-que-existe')!,
    titulo: 'Por que o Palácio existe',
    inicio: 'cena:seguranca-por-que-existe',
    abertura: 'Por que a filial criou o Palácio Virtual? Veja, com dados, o que está em jogo.',
    passos: [
      { fala: 'A Cruz Vermelha Brasileira nasceu aqui, no Rio de Janeiro, em 1908. Há mais de cem anos, ela se adapta para continuar servindo.', acao: async (r) => { await r.cena(0) } },
      { fala: 'E o mundo mudou de novo. Hoje, quase tudo passa pelo celular.', acao: async (r) => { await r.cena(1) } },
      { fala: 'Entre as pessoas com sessenta anos ou mais, três em cada quatro já usam a internet. Em 2019, eram menos da metade.', acao: async (r) => { await r.cena(2) } },
      { fala: 'As organizações sociais também foram. Oitenta por cento já estão nas redes sociais. Mas só quarenta e seis por cento têm site, e vinte e nove por cento recebem doações pela internet. Quem se organiza primeiro, se destaca.', acao: async (r) => { await r.cena(3) } },
      { fala: 'E é o próprio Movimento da Cruz Vermelha que pede. A Estratégia 2030 da Federação Internacional quer todas as filiais conectadas digitalmente.', acao: async (r) => { await r.cena(4) } },
      { fala: 'Existe uma porta aberta: o Google Ad Grants. São até dez mil dólares por mês em anúncios gratuitos no Google, para levar voluntários e doadores ao site. Mais de cento e quinze mil organizações no mundo já usam.', acao: async (r) => { await r.cena(5) } },
      { fala: 'Mas o Google exige organização: site próprio e seguro, conteúdo de verdade, resultados medidos todo mês e as regras seguidas. É exatamente isso que o Palácio faz.', acao: async (r) => { await r.cena(6) } },
      { fala: 'E confiança se conquista mostrando. Oitenta e três por cento buscam informações antes de doar, e só trinta por cento acham a maioria das ONGs confiável.', acao: async (r) => { await r.cena(7) } },
      { fala: 'No papel, a informação se perde, demora para circular, e ninguém confere depois. No Palácio, tudo fica registrado e chega na hora a quem precisa.', acao: async (r) => { await r.cena(8) } },
      { fala: 'O Palácio liga os doze setores da filial. Cada um faz a sua parte, e todo mundo sabe o que está acontecendo.', acao: async (r) => { await r.cena(9) } },
      { fala: 'E sabe quem mais faz trabalho voluntário no Brasil? As pessoas com cinquenta anos ou mais. A experiência de vocês é o coração da filial.', acao: async (r) => { await r.cena(10) } },
      { fala: 'O Palácio já está funcionando. Em menos de três meses: cento e cinquenta e três candidatos a voluntário, oitenta e oito publicações no ar e cento e setenta e sete arquivos organizados.', acao: async (r) => { await r.cena(11) } },
      { fala: 'Onze pessoas da equipe já estão no Palácio. Falta você. Vamos reconstruir a filial juntos.', acao: async (r) => { await r.cena(12) }, pausa: 1200 },
    ],
    fechamento: 'Quer ler com calma? A página Segurança do Palácio explica tudo, com o botão Ouvir.',
  },
  {
    id: 'seguranca-cada-setor',
    area: '/seguranca',
    tarefa: 'cada-setor',
    explica: textoExplicadoPeloVideo('seguranca-cada-setor')!,
    titulo: 'Por que cada setor é importante',
    inicio: '/seguranca',
    abertura: 'O Palácio é rápido e completo. Mas quem faz a Cruz Vermelha acontecer são as pessoas. Veja por que cada setor é importante.',
    passos: [
      {
        fala: 'Com o Claude, dá para construir muito rápido. Mas o Palácio não trabalha sozinho: quem faz a Cruz Vermelha acontecer são as pessoas, no dia a dia.',
        acao: async (r) => { await r.esperar(1000); await r.rolar('#cada-setor p:has-text("não trabalha sozinho")'); await r.destacar('#cada-setor p:has-text("não trabalha sozinho")') },
      },
      {
        fala: 'Cada setor sabe o que só ele sabe e faz o que só ele faz. Sem cada um deles, a filial para.',
        acao: async (r) => { await r.destacar('#cada-setor p:has-text("Cada setor sabe")') },
      },
      {
        fala: 'O Palácio existe para facilitar a conversa entre as pessoas e entre os setores. Quando a informação chega a quem precisa, a filial cresce.',
        acao: async (r) => { await r.rolar('#cada-setor p:has-text("facilitar a conversa")'); await r.destacar('#cada-setor p:has-text("facilitar a conversa")') },
      },
      {
        fala: 'Não dá mais para fazer tudo no papel, como antes: o papel se perde, demora para circular e não deixa ninguém conferir depois.',
        acao: async (r) => { await r.destacar('#cada-setor p:has-text("tudo no papel")') },
      },
      {
        fala: 'Por isso, tudo é registrado desde o início, com clareza: quem pediu, quem aprovou e o que foi feito. E o que é público fica à vista de todos.',
        acao: async (r) => { await r.rolar('#cada-setor p:has-text("registrado desde o início")'); await r.destacar('#cada-setor p:has-text("registrado desde o início")') },
      },
      {
        fala: 'É assim que a filial ganha força: cada setor fazendo a sua parte, e todo mundo sabendo o que está acontecendo.',
        acao: async (r) => { await r.destacar('#cada-setor p:has-text("ganha força")') },
        pausa: 900,
      },
    ],
    fechamento: 'O guia para começar mostra o que o seu setor faz no Palácio.',
  },
  {
    id: 'seguranca-as-trancas',
    area: '/seguranca',
    tarefa: 'trancas',
    explica: textoExplicadoPeloVideo('seguranca-as-trancas')!,
    titulo: 'Seus dados estão seguros?',
    inicio: '/seguranca',
    abertura: 'Seus dados estão seguros no Palácio? Veja, com calma, as trancas que protegem a filial.',
    passos: [
      {
        fala: 'O Palácio guarda dados de pessoas: nomes, telefones, documentos. Por isso, ele segue as regras de segurança que as empresas sérias seguem.',
        acao: async (r) => { await r.esperar(1200); await r.rolar('[data-seguranca-resumo]'); await r.destacar('[data-seguranca-resumo]') },
      },
      {
        fala: 'A primeira tranca é a sua senha. Ela fica guardada embaralhada, e nem a administração consegue ver. Se você esquecer, ela só pode criar uma senha nova.',
        acao: async (r) => { await r.apagar(); await r.rolar('[data-item="senha"]'); await r.destacar('[data-item="senha"]') },
      },
      {
        fala: 'Depois, um porteiro em cada sala: a cada informação aberta, o banco de dados confere quem está pedindo. Cada pessoa vê só o que o trabalho dela pede.',
        acao: async (r) => { await r.destacar('[data-item="porteiro"]') },
      },
      {
        fala: 'Cinco senhas erradas em quinze minutos, e a conta tranca por um tempo. Assim, ninguém fica tentando adivinhar.',
        acao: async (r) => { await r.rolar('[data-item="bloqueio"]'); await r.destacar('[data-item="bloqueio"]') },
      },
      {
        fala: 'Se alguém entrar na sua conta de um aparelho novo, você recebe um aviso no e-mail e no WhatsApp.',
        acao: async (r) => { await r.rolar('[data-item="aviso"]'); await r.destacar('[data-item="aviso"]') },
      },
      {
        fala: 'E o Palácio anota cada entrada num livro que só a administração lê. Até quem consulta esse livro fica anotado.',
        acao: async (r) => { await r.rolar('[data-item="livro"]'); await r.destacar('[data-item="livro"]') },
      },
      {
        fala: 'Todo dia, uma cópia de segurança vai para outro lugar, com uma trava que impede apagar.',
        acao: async (r) => { await r.rolar('[data-item="copia"]'); await r.destacar('[data-item="copia"]') },
      },
      {
        fala: 'E quem cuida do sistema? Tem a chave técnica, como o síndico tem a da casa de máquinas. Por isso existem as travas: a senha que ninguém vê e o livro que anota tudo.',
        acao: async (r) => { await r.apagar(); await r.rolar('[data-item="administracao"]'); await r.destacar('[data-item="administracao"]') },
        pausa: 900,
      },
    ],
    fechamento: 'A página Segurança do Palácio explica tudo isso com calma, com o botão Ouvir.',
  },
  {
    id: 'seguranca-como-construimos',
    area: '/seguranca',
    tarefa: 'nao-faz-tudo',
    explica: textoExplicadoPeloVideo('seguranca-como-construimos')!,
    titulo: 'Como o Palácio é construído, com o Claude',
    inicio: '/seguranca',
    abertura: 'Como o Palácio é construído, e por que o Claude, a inteligência artificial, não faz tudo o que pedem a ele.',
    passos: [
      {
        fala: 'O Palácio não foi comprado pronto. Ele é construído aqui, sob medida para a filial, por uma pequena equipe liderada pelo Matheus, com a ajuda do Claude.',
        acao: async (r) => { await r.esperar(1000); await r.rolar('#construido p:has-text("não foi comprado pronto")'); await r.destacar('#construido p:has-text("não foi comprado pronto")') },
      },
      {
        fala: 'Pense numa obra: o Matheus é o engenheiro responsável, e o Claude, um mestre de obras muito rápido. Nenhuma parte nova é inaugurada sem o engenheiro aprovar.',
        acao: async (r) => { await r.destacar('#construido p:has-text("Pense numa obra")') },
      },
      {
        fala: 'As chaves do Palácio ficam num cofre, e as regras proíbem o Claude de pedir, ler ou escrever essas chaves. Tudo o que ele faz fica registrado.',
        acao: async (r) => { await r.rolar('#construido p:has-text("As chaves do Palácio")'); await r.destacar('#construido p:has-text("As chaves do Palácio")') },
      },
      {
        fala: 'O Claude não faz tudo o que pedem. Ele segue as regras escritas do projeto, as boas práticas do mercado e as regras da empresa que o fez, que proíbem vigiar pessoas ou tirar dados delas.',
        acao: async (r) => { await r.apagar(); await r.rolar('[data-seguranca-regras]'); await r.destacar('[data-seguranca-regras]') },
      },
      {
        fala: 'Um exemplo de verdade: pediram um começo sem senha. O Claude deixou tudo simples, mas manteve duas travas: a coordenação aprova o e-mail, e a administração convida para o Palácio.',
        acao: async (r) => { await r.apagar(); await r.rolar('[data-seguranca-exemplo] >> nth=0'); await r.destacar('[data-seguranca-exemplo] >> nth=0') },
      },
      {
        fala: 'Toda mudança segue o mesmo caminho: é preparada à parte, conferida por verificações automáticas, testada numa versão de teste, e só entra no ar com a aprovação do responsável.',
        acao: async (r) => { await r.apagar(); await r.rolar('[data-seguranca-passos]'); await r.destacar('[data-seguranca-passos]') },
      },
      {
        fala: 'E o código do Palácio é aberto. Se existisse uma porta escondida para tirar dados, ela estaria à vista de todos.',
        acao: async (r) => { await r.apagar(); await r.rolar('[data-seguranca-codigo]'); await r.destacar('[data-seguranca-codigo]') },
        pausa: 900,
      },
    ],
    fechamento: 'Ficou alguma dúvida? A página Segurança do Palácio explica tudo, com calma.',
  },
  {
    id: 'seguranca-transparencia',
    area: '/seguranca',
    tarefa: 'transparencia',
    explica: textoExplicadoPeloVideo('seguranca-transparencia')!,
    titulo: 'O registro que ninguém apaga',
    inicio: '/seguranca',
    abertura: 'A trilha pública e o portal da transparência: por que existem, como funcionam e para que servem.',
    passos: [
      {
        fala: 'Uma instituição que cuida de pessoas e recebe recursos precisa prestar contas. E a lei das parcerias com o poder público pede que elas fiquem públicas.',
        acao: async (r) => { await r.esperar(1000); await r.rolar('#transparencia p:has-text("Por quê")'); await r.destacar('#transparencia p:has-text("Por quê")') },
      },
      {
        fala: 'Por isso, cada documento oficial da filial ganha um código de conferência. Com ele, qualquer pessoa confere se o documento é o original.',
        acao: async (r) => { await r.destacar('#transparencia p:has-text("O que é")') },
      },
      {
        fala: 'Todo dia, os registros do dia são lacrados juntos, como um envelope com lacre de cera. E uma prova do lacre vai para serviços de fora da filial.',
        acao: async (r) => { await r.rolar('#transparencia p:has-text("Como funciona")'); await r.destacar('#transparencia p:has-text("Como funciona")') },
      },
      {
        fala: 'Se alguém mudar um registro antigo escondido, o lacre não fecha mais. Isso vale para todo mundo, inclusive para a administração e para o Claude.',
        acao: async (r) => { await r.rolar('#transparencia p:has-text("Isso vale para todo mundo")'); await r.destacar('#transparencia p:has-text("Isso vale para todo mundo")') },
      },
      {
        fala: 'A trilha e o portal ainda não estão abertos ao público: a abertura é uma decisão da administração.',
        acao: async (r) => { await r.apagar(); await r.rolar('#transparencia p:has-text("ainda não estão abertos")'); await r.destacar('#transparencia p:has-text("ainda não estão abertos")') },
        pausa: 900,
      },
    ],
    fechamento: 'Ficou alguma dúvida? A página Segurança do Palácio explica tudo, com calma.',
  },
]
