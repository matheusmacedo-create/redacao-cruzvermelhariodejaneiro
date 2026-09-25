/**
 * O formato da ajuda do sistema — tour guiado, passo a passo e perguntas
 * frequentes de cada área. Benchmark e decisões em docs/AJUDA.md.
 *
 * O conteúdo mora em lib/ajuda/conteudo/<grupo>.ts (um arquivo por grupo do
 * menu, o mesmo corte de lib/navegacao.ts) e em lib/ajuda/membro.ts (a Área
 * do Voluntário). Tudo aqui é texto e dado puro: dá para conferir com script
 * (npx tsx) e o mesmo conteúdo serve ao painel "?", à Central de ajuda
 * (/ajuda) e à busca (⌘K).
 *
 * O tour destaca elementos marcados na tela com `data-ajuda="<alvo>"`. Os
 * alvos seguem `<área>.<coisa>` em minúsculas e com hífen
 * (`pautas.quadro`, `pautas.nova`, `shell.busca`); o script de conferência
 * (scripts/conferir-ajuda.ts) acusa alvo citado no conteúdo que não existe em
 * nenhum arquivo.
 */

/** Um balão do tour. */
export type PassoDoTour = {
  /**
   * O `data-ajuda` do elemento que o balão aponta. Sem alvo — ou com o alvo
   * fora da tela (menu fechado no celular, botão que só admin vê, lista
   * vazia) —, o balão aparece no meio da tela; por isso o texto tem de se
   * sustentar sozinho, sem "clique aqui".
   */
  alvo?: string
  titulo: string
  /** Uma ou duas frases. O que é e para que serve, não uma aula. */
  texto: string
  /** Lado preferido do balão em relação ao alvo (o motor inverte se não couber). */
  lado?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * 'pular': sem o alvo na tela, o passo some em vez de ir para o meio. Para
   * o que só existe às vezes (botão de admin, item de uma lista que pode
   * estar vazia).
   */
  seAusente?: 'pular'
}

/** "Como fazer X": uma tarefa do dia a dia em passos numerados. */
export type Tarefa = {
  /** Identificador estável, para link direto (/ajuda/pautas#criar-pauta). Minúsculas e hífen. */
  id: string
  /** No infinitivo: "Criar uma pauta", "Pedir aprovação de um conteúdo". */
  titulo: string
  /** Cada passo é uma ação, com o nome exato do botão ou campo como aparece na tela. */
  passos: string[]
  /** Um cuidado ou atalho que vale saber (opcional). */
  dica?: string
  /** Só quem tem esta condição vê a tarefa ("Só administradores"); texto livre, aparece como selo. */
  quem?: string
}

/** Uma pergunta frequente. */
export type Pergunta = {
  id: string
  pergunta: string
  /** Resposta direta, 1 a 4 frases. Parágrafos separados por "\n\n". */
  resposta: string
  /** Palavras que alguém usaria para procurar esta dúvida e que não estão no texto. */
  termos?: string[]
}

/** Uma tela com endereço próprio dentro da área (a página de uma pauta, de um chamado…). */
export type TelaDaArea = {
  /** O caminho no formato de rota do Next: '/pautas/[id]', '/financeiro/compras/novo'. */
  caminho: string
  rotulo: string
  tour: PassoDoTour[]
}

/** A ajuda de uma área do menu. */
export type GuiaDaArea = {
  /** O `href` da área em lib/navegacao.ts — é a chave que liga os dois. */
  href: string
  /** Para que serve, em 1 a 3 frases: mais do que o resumo do menu. */
  paraQueServe: string
  /** Quem usa e quem pode o quê, em palavras ("Todos veem; só admin apaga de outros"). */
  quemUsa?: string
  /** O tour da tela principal da área (3 a 7 passos). Vazio: a área não tem tour. */
  tour: PassoDoTour[]
  /** As telas internas com tour próprio. */
  telas?: TelaDaArea[]
  tarefas: Tarefa[]
  perguntas: Pergunta[]
  /** Outras áreas que costumam andar junto (hrefs de lib/navegacao.ts). */
  relacionadas?: string[]
}

/** Uma ajuda que não é de uma área (conta e acesso, atalhos, a própria Central). */
export type TopicoGeral = {
  id: string
  titulo: string
  resumo: string
  tarefas: Tarefa[]
  perguntas: Pergunta[]
}
