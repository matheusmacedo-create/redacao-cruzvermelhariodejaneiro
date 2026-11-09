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
    id: 'seguranca-por-que-existe',
    area: '/seguranca',
    tarefa: 'por-que-existe',
    explica: textoExplicadoPeloVideo('seguranca-por-que-existe')!,
    titulo: 'Por que o Palácio existe',
    inicio: '/seguranca',
    abertura: 'Por que a filial criou o Palácio Virtual, e qual é o objetivo.',
    passos: [
      {
        fala: 'O Palácio nasceu para levar a Cruz Vermelha do Rio de Janeiro para o digital: um lugar só para o trabalho da filial, ligado ao site, ao WhatsApp e às redes sociais.',
        acao: async (r) => { await r.esperar(1000); await r.rolar('#por-que-existe p:has-text("nasceu para levar")'); await r.destacar('#por-que-existe p:has-text("nasceu para levar")') },
      },
      {
        fala: 'Um objetivo importante é o Google Ad Grants: o Google doa anúncios gratuitos na pesquisa a organizações sem fins lucrativos, de até dez mil dólares por mês.',
        acao: async (r) => { await r.destacar('#por-que-existe p:has-text("Google Ad Grants")') },
      },
      {
        fala: 'Os anúncios levam as pessoas ao site da filial, para virar voluntário, doar e conhecer o trabalho da Cruz Vermelha.',
        pausa: 700,
      },
      {
        fala: 'Mas o Google exige uma organização séria: um site seguro, os resultados medidos e as regras do programa seguidas. O Palácio ajuda em tudo isso.',
        acao: async (r) => { await r.rolar('#por-que-existe p:has-text("o Google exige")'); await r.destacar('#por-que-existe p:has-text("o Google exige")') },
      },
      {
        fala: 'É também uma aposta: quando os caminhos de sempre ficam difíceis, o digital pode ajudar a reconstruir e fortalecer a filial.',
        acao: async (r) => { await r.destacar('#por-que-existe p:has-text("uma aposta")') },
      },
      {
        fala: 'Por isso a segurança é tão importante: para receber apoio, a filial precisa mostrar que cuida bem dos dados e presta contas.',
        acao: async (r) => { await r.rolar('#por-que-existe p:has-text("Por isso a segurança")'); await r.destacar('#por-que-existe p:has-text("Por isso a segurança")') },
        pausa: 900,
      },
    ],
    fechamento: 'Na página Segurança do Palácio, você vê como os seus dados são protegidos.',
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
