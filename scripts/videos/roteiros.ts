import type { Roteiro } from './tipos'

/**
 * Os roteiros dos vídeos da ajuda (docs/AJUDA.md §14). Cada um conta, em voz, a tarefa da ajuda escrita
 * (lib/ajuda/conteudo): mesmos passos, mesmos nomes de botão. Mudou a tarefa, muda o roteiro e grava de novo
 * (scripts/conferir-videos.ts avisa quando o texto da tarefa mudou depois da gravação).
 *
 * Gravados sempre como a conta de gravação ("Ana Ribeiro"), no espaço de Demonstração, com os dados de
 * scripts/demonstracao/semear.sql. Os alvos usam os `data-ajuda` do tour sempre que existem.
 */

const MENU_INICIO = 'aside a[href="/dashboard"]:has-text("Início")'
const MENU_PAUTAS = 'aside a[href="/pautas"]'
const MENU_APROVACOES = 'aside a[href="/aprovacoes"]'

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
        acao: async (r) => { await r.esperar(1500); await r.clicar(MENU_INICIO, { navega: true }) },
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
        acao: async (r) => { await r.clicar(MENU_INICIO, { navega: true }) },
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
          await r.clicar(MENU_PAUTAS, { navega: true })
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
        acao: async (r) => { await r.esperar(500); await r.clicar(MENU_APROVACOES, { navega: true }); await r.destacar('[data-ajuda="aprovacoes.abas"]') },
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
]
