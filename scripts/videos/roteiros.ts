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
  // Vídeos de cenas (inicio "cena:<id>"): números, gráficos, o mapa dos setores e fontes de fora, cada um com uns
  // 90 segundos. Celular primeiro. As cenas ficam em scripts/videos/cenas/<id>.js, na ordem destas falas.
  {
    id: 'seguranca-por-que-existe',
    area: '/seguranca',
    tarefa: 'por-que-existe',
    explica: textoExplicadoPeloVideo('seguranca-por-que-existe')!,
    titulo: 'Por que o Palácio existe',
    inicio: 'cena:seguranca-por-que-existe',
    abertura: 'Por que a filial criou o Palácio Virtual.',
    passos: [
      { fala: 'A Cruz Vermelha Brasileira nasceu aqui, no Rio, em 1908. Desde então, ela se adapta para servir.', acao: async (r) => { await r.cena(0) } },
      { fala: 'E o mundo mudou: hoje, três em cada quatro pessoas com mais de sessenta anos já usam a internet.', acao: async (r) => { await r.cena(1) } },
      { fala: 'As organizações sociais também: oitenta por cento estão nas redes sociais, mas menos da metade tem site.', acao: async (r) => { await r.cena(2) } },
      { fala: 'E a Federação Internacional da Cruz Vermelha quer todas as filiais conectadas digitalmente.', acao: async (r) => { await r.cena(3) } },
      { fala: 'O Google oferece até dez mil dólares por mês em anúncios gratuitos para organizações sem fins lucrativos.', acao: async (r) => { await r.cena(4) } },
      { fala: 'Mas exige organização: site seguro, resultados medidos e regras seguidas. É isso que o Palácio faz.', acao: async (r) => { await r.cena(5) } },
      { fala: 'E confiança se conquista mostrando: oitenta e três por cento buscam informações antes de doar.', acao: async (r) => { await r.cena(6) } },
      { fala: 'O Palácio já está funcionando: em menos de três meses, cento e cinquenta e três candidatos a voluntário e oitenta e oito publicações no ar.', acao: async (r) => { await r.cena(7) } },
      { fala: 'Onze pessoas da equipe já estão no Palácio. Falta você.', acao: async (r) => { await r.cena(8) }, pausa: 1200 },
    ],
    fechamento: 'Saiba mais na página Segurança do Palácio.',
  },
  {
    id: 'seguranca-cada-setor',
    area: '/seguranca',
    tarefa: 'cada-setor',
    explica: textoExplicadoPeloVideo('seguranca-cada-setor')!,
    titulo: 'Por que cada setor é importante',
    inicio: 'cena:seguranca-cada-setor',
    abertura: 'Por que cada setor é importante.',
    passos: [
      { fala: 'O Palácio é construído rápido. Mas quem faz a Cruz Vermelha acontecer são as pessoas, no dia a dia.', acao: async (r) => { await r.cena(0) } },
      { fala: 'E quem mais faz trabalho voluntário no Brasil são as pessoas com cinquenta anos ou mais. A experiência de vocês é o coração da filial.', acao: async (r) => { await r.cena(1) } },
      { fala: 'Cada um dos doze setores sabe o que só ele sabe. O Palácio liga todos eles.', acao: async (r) => { await r.cena(2) } },
      { fala: 'No papel, a informação se perde e demora. No Palácio, ela chega na hora a quem precisa.', acao: async (r) => { await r.cena(3) } },
      { fala: 'E tudo fica registrado desde o início: quem pediu, quem aprovou e o que foi feito.', acao: async (r) => { await r.cena(4) } },
      { fala: 'Entre quem tem mais de sessenta anos e não usa a internet, o principal motivo é não saber usar. Por isso o Palácio tem guia passo a passo, letra grande e áudio.', acao: async (r) => { await r.cena(5) } },
      { fala: 'Cada setor fazendo a sua parte, e todo mundo sabendo o que acontece. É assim que a filial ganha força.', acao: async (r) => { await r.cena(6) }, pausa: 1200 },
    ],
    fechamento: 'O guia para começar mostra o que o seu setor faz no Palácio.',
  },
  {
    id: 'seguranca-as-trancas',
    area: '/seguranca',
    tarefa: 'trancas',
    explica: textoExplicadoPeloVideo('seguranca-as-trancas')!,
    titulo: 'Seus dados estão seguros?',
    inicio: 'cena:seguranca-as-trancas',
    abertura: 'Seus dados estão seguros no Palácio?',
    passos: [
      { fala: 'Desde 2021, a lei de proteção de dados pode multar em até cinquenta milhões de reais quem não protege dados de pessoas.', acao: async (r) => { await r.cena(0) } },
      { fala: 'E as organizações sociais estão se preparando: as que têm alguém cuidando disso passaram de vinte e nove para cinquenta e dois por cento.', acao: async (r) => { await r.cena(1) } },
      { fala: 'No Palácio, são várias trancas: a senha que ninguém vê, nem a administração; a conta que tranca depois de cinco senhas erradas; o aviso quando alguém entra de um aparelho novo; e uma cópia de segurança todo dia.', acao: async (r) => { await r.cena(2) } },
      { fala: 'E cem por cento das tabelas do banco conferem quem está pedindo. Cada pessoa vê só o que o trabalho dela pede.', acao: async (r) => { await r.cena(3) } },
      { fala: 'E quem cuida do sistema? Tem a chave técnica, como o síndico. Por isso existem as travas: a senha que ninguém vê, e o livro de entradas que anota até quem o consulta.', acao: async (r) => { await r.cena(4) } },
      { fala: 'E lembre: ninguém da filial precisa da sua senha. Se pedirem, não passe.', acao: async (r) => { await r.cena(5) }, pausa: 1200 },
    ],
    fechamento: 'A página Segurança do Palácio explica cada tranca, com calma.',
  },
  {
    id: 'seguranca-como-construimos',
    area: '/seguranca',
    tarefa: 'nao-faz-tudo',
    explica: textoExplicadoPeloVideo('seguranca-como-construimos')!,
    titulo: 'Como o Palácio é construído, com o Claude',
    inicio: 'cena:seguranca-como-construimos',
    abertura: 'Como o Palácio é construído, com o Claude.',
    passos: [
      { fala: 'O Palácio não foi comprado pronto. Ele é construído aqui, sob medida, com a ajuda do Claude, uma inteligência artificial.', acao: async (r) => { await r.cena(0) } },
      { fala: 'Pense numa obra: o Matheus é o engenheiro responsável, que diz o que a filial precisa e aprova tudo. O Claude é o mestre de obras: rápido, e seguindo as normas.', acao: async (r) => { await r.cena(1) } },
      { fala: 'E ele não faz tudo o que pedem. Segue as regras do projeto, as boas práticas do mercado e as regras da empresa que o fez, que proíbem vigiar pessoas ou tirar dados delas.', acao: async (r) => { await r.cena(2) } },
      { fala: 'Um exemplo de verdade: pediram um começo sem senha. O Claude simplificou, mas manteve duas travas: a coordenação aprova o e-mail, e a administração convida para o Palácio.', acao: async (r) => { await r.cena(3) } },
      { fala: 'Toda mudança segue o mesmo caminho: preparada à parte, conferida, testada, e só entra no ar com a aprovação do responsável.', acao: async (r) => { await r.cena(4) } },
      { fala: 'Desde agosto, foram trezentas e oitenta e seis mudanças, todas registradas: quem fez, quando e por quê.', acao: async (r) => { await r.cena(5) } },
      { fala: 'E o código é aberto: qualquer pessoa pode conferir.', acao: async (r) => { await r.cena(6) }, pausa: 1200 },
    ],
    fechamento: 'A página Segurança do Palácio conta tudo isso, com calma.',
  },
  {
    id: 'seguranca-transparencia',
    area: '/seguranca',
    tarefa: 'transparencia',
    explica: textoExplicadoPeloVideo('seguranca-transparencia')!,
    titulo: 'O registro que ninguém apaga',
    inicio: 'cena:seguranca-transparencia',
    abertura: 'O registro que ninguém apaga.',
    passos: [
      { fala: 'Só trinta por cento acham a maioria das ONGs confiável. E quase metade já deixou de doar depois de uma notícia negativa.', acao: async (r) => { await r.cena(0) } },
      { fala: 'A Federação Internacional da Cruz Vermelha é clara: precisamos ser transparentes e prestar contas em tudo o que fazemos.', acao: async (r) => { await r.cena(1) } },
      { fala: 'E a lei manda: quando há parceria com o poder público, ela fica na internet, com o valor e a prestação de contas.', acao: async (r) => { await r.cena(2) } },
      { fala: 'Por isso, cada documento oficial ganha um código. Todo dia, os registros são lacrados juntos, como um envelope com lacre de cera, e uma prova vai para fora da filial. Se alguém mudar algo escondido, o lacre não fecha mais.', acao: async (r) => { await r.cena(3) } },
      { fala: 'Isso vale para todo mundo, inclusive para a administração e para o Claude.', acao: async (r) => { await r.cena(4) } },
      { fala: 'A trilha pública e o portal da transparência ainda não estão abertos ao público. A abertura é uma decisão da administração.', acao: async (r) => { await r.cena(5) }, pausa: 1200 },
    ],
    fechamento: 'A página Segurança do Palácio explica a trilha, com calma.',
  },
]
