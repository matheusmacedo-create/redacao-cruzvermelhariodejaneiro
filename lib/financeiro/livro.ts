/**
 * Os livros do Financeiro: a filial e a Escola são empresas à parte (CNPJ,
 * contas, lançamentos, conciliação e fechamento próprios), e cada uma mora
 * no seu endereço:
 *
 *   /financeiro/...          → livros da filial
 *   /escola/financeiro/...   → livros da Escola
 *
 * O endereço é quem decide, nunca um cookie: antes, a empresa aberta ficava
 * num cookie, e duas abas (uma em cada empresa) trocavam os livros uma da
 * outra sem aviso. Agora o proxy (proxy.ts) reescreve /escola/financeiro/x
 * para as mesmas telas de /financeiro/x e diz qual é o livro num cabeçalho
 * da requisição, que o navegador não consegue forjar (o proxy sempre
 * sobrescreve). As telas, os links e as server actions leem daí.
 *
 * Módulo puro: conferido por scripts/conferir-livros-do-financeiro.ts.
 */

export type Livro = 'filial' | 'escola'

/** Cabeçalho da requisição com o livro do endereço. Só o proxy escreve. */
export const CABECALHO_DO_LIVRO = 'x-cvrj-livro-financeiro'
/** O endereço pedido (com a consulta), para mandar ao outro livro sem perder a tela. Também só o proxy escreve. */
export const CABECALHO_DO_ENDERECO = 'x-cvrj-endereco-financeiro'

const BASE: Record<Livro, string> = { filial: '/financeiro', escola: '/escola/financeiro' }

export const ehLivro = (v: unknown): v is Livro => v === 'filial' || v === 'escola'

/** O livro de um endereço do navegador, ou null se não é do Financeiro. */
export function livroDoCaminho(caminho: string): Livro | null {
  if (caminho === BASE.escola || caminho.startsWith(`${BASE.escola}/`)) return 'escola'
  if (caminho === BASE.filial || caminho.startsWith(`${BASE.filial}/`)) return 'filial'
  return null
}

/**
 * O endereço interno das telas (sempre /financeiro/...), para o proxy
 * reescrever o da Escola. O de /financeiro/... é ele mesmo.
 */
export function caminhoInterno(caminho: string): string {
  return livroDoCaminho(caminho) === 'escola' ? caminho.slice('/escola'.length) : caminho
}

/**
 * Leva um endereço do Financeiro para o livro certo. O código escreve sempre
 * `/financeiro/...` (o livro aberto) e passa por aqui: na Escola vira
 * `/escola/financeiro/...`. Endereço que não é do Financeiro passa igual.
 */
export function noLivro(livro: Livro, caminho: string): string {
  if (livro !== 'escola') return caminho
  if (caminho === BASE.filial || caminho.startsWith(`${BASE.filial}/`) || caminho.startsWith(`${BASE.filial}?`) || caminho.startsWith(`${BASE.filial}#`)) {
    return `/escola${caminho}`
  }
  return caminho
}

/** O livro de uma empresa do Financeiro pelo tipo dela ("outra" fica com a filial). */
export const livroDaEmpresa = (tipo: string | null | undefined): Livro => (tipo === 'escola' ? 'escola' : 'filial')

/** Como cada livro se apresenta na tela: nome, cor e o aviso de que os livros não se misturam. */
export const IDENTIDADE: Record<Livro, { titulo: string; outro: string }> = {
  filial: { titulo: 'Livros da filial', outro: 'Escola' },
  escola: { titulo: 'Livros da Escola', outro: 'filial' },
}
