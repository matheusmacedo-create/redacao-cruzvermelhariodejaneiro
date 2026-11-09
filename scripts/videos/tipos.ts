/**
 * O formato dos roteiros dos vídeos da ajuda (docs/AJUDA.md §14). Um roteiro é a tarefa da ajuda contada em voz,
 * com as ações que o robô faz na tela enquanto a voz fala. Gravado sempre no espaço de Demonstração (§13).
 */

/** O que o robô sabe fazer na tela. Os alvos são seletores do Playwright (`[data-ajuda="inicio.resumo"]`, `text=…`). */
export interface Robo {
  /** Gravando a versão de celular (tela em pé, toque no lugar do cursor, menu na gaveta). */
  readonly celular: boolean
  /** Abre uma área pelo menu: no computador, o menu da esquerda; no celular, a gaveta do botão ☰. */
  menu(href: string): Promise<void>
  /** Abre uma rota do Palácio e espera a tela assentar. */
  ir(rota: string): Promise<void>
  /** Leva o cursor até o alvo (rolando a tela se precisar). */
  apontar(alvo: string): Promise<void>
  /** Leva o cursor até o alvo e clica. `navega`: o clique abre outra tela. */
  clicar(alvo: string, opcoes?: { navega?: boolean; depois?: number }): Promise<void>
  /** Clica no campo e digita, letra a letra. */
  digitar(alvo: string, texto: string): Promise<void>
  /** Escolhe uma opção de uma lista (<select>) pelo texto da opção. */
  escolher(alvo: string, opcao: string): Promise<void>
  /** Preenche um campo de data (AAAA-MM-DD). */
  data(alvo: string, valor: string): Promise<void>
  /** Rola a tela até o alvo ficar no meio. */
  rolar(alvo: string): Promise<void>
  /** Contorna o alvo com o destaque vermelho (some no próximo destaque ou em `apagar`). */
  destacar(alvo: string): Promise<void>
  apagar(): Promise<void>
  /** No palco dos vídeos de explicação (scripts/videos/cenas): mostra a cena n, a partir de 0. */
  cena(n: number): Promise<void>
  esperar(ms: number): Promise<void>
}

export type Passo = {
  /** O que a voz diz neste passo: uma ou duas frases curtas, com o nome dos botões como aparece na tela. */
  fala: string
  /** A fala na versão de celular, quando a tela muda o caminho (o menu fica na gaveta, por exemplo). */
  falaNoCelular?: string
  /** O que o robô faz enquanto a voz fala. */
  acao?: (robo: Robo) => Promise<void>
  /** Silêncio depois da fala, em ms (padrão 500). */
  pausa?: number
  /**
   * A ação muda dado no espaço de Demonstração (votar, criar): no ensaio (`--ensaio`) ela não acontece, e a fala
   * segue com a tela parada. Recomeçar o espaço depois: scripts/demonstracao/semear.sql.
   */
  final?: boolean
}

export type Roteiro = {
  /** O id do vídeo: o nome dos arquivos e a chave em lib/ajuda/videos.json. */
  id: string
  /** A área da ajuda (o href do guia, como '/aprovacoes') e o id da tarefa que o vídeo mostra. */
  area: string
  tarefa: string
  /**
   * Vídeo de explicação de uma página (docs/AJUDA.md §18), e não de uma tarefa: o texto da página que ele explica.
   * Com ele, `area` é a rota da página ('/seguranca'), `tarefa` é o id da parte, e a impressão do vídeo vem deste texto.
   */
  explica?: string
  /** O título do cartão de abertura (o da tarefa, de preferência). */
  titulo: string
  /**
   * A rota em que a gravação começa. Com "cena:<id>", o vídeo é de cenas animadas (números, gráficos, o mapa dos
   * setores, citações com fonte): o gravador serve scripts/videos/cenas e abre palco.html?v=<id> (docs/AJUDA.md §18).
   */
  inicio: string
  /** A fala do cartão de abertura. */
  abertura: string
  passos: Passo[]
  /** A fala do cartão de fechamento. */
  fechamento: string
}
