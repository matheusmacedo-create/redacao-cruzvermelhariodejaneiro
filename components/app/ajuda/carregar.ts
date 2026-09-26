/**
 * O texto da ajuda (lib/ajuda, com o conteúdo das 40 áreas: ~145 KB
 * comprimidos) fica fora do pacote de toda página e só é baixado quando
 * alguém abre o painel "?", começa um tour ou busca uma dúvida no ⌘K. Uma
 * vez baixado, vale para o resto da visita (e o navegador guarda o arquivo).
 *
 * O que toda página precisa saber — que tela tem tour, o nome dela — vem do
 * índice leve (lib/ajuda/indice.ts), que o layout manda pronto.
 */

export type ModuloDaAjuda = typeof import('@/lib/ajuda')

let promessa: Promise<ModuloDaAjuda> | null = null

export function carregarAjuda(): Promise<ModuloDaAjuda> {
  // Falhou (conexão caiu no meio)? Esquece a promessa, para a próxima tentativa baixar de novo.
  promessa ??= import('@/lib/ajuda').catch((erro: unknown) => { promessa = null; throw erro })
  return promessa
}

/** Baixa de antemão, sem esperar nem reclamar: quando a pessoa clicar, já está aqui. */
export function adiantarAjuda(): void {
  carregarAjuda().catch(() => {})
}
