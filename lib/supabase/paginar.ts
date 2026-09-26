/**
 * Todas as linhas de uma consulta, de 1000 em 1000.
 *
 * A API do Supabase devolve no máximo 1000 linhas por pedido, e `.limit(50000)`
 * não muda isso: o resto some calado. Foi o que fez um curso com prova parecer
 * sem prova (lib/membro/cursos.ts) — e, no Financeiro, faria o saldo e o
 * fechamento do mês somarem só os primeiros mil lançamentos.
 *
 * `pagina` monta a consulta para um intervalo; ela precisa de uma ordem
 * estável (termine com `.order('id')`), senão as páginas se sobrepõem.
 *
 *   const { data } = await todasAsLinhas((de, ate) =>
 *     supabase.from('fin_lancamentos').select('…').eq(…).order('id').range(de, ate))
 */
export const LINHAS_POR_PEDIDO = 1000

export async function todasAsLinhas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  teto = 100_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const linhas: T[] = []
  for (let de = 0; de < teto; de += LINHAS_POR_PEDIDO) {
    const { data, error } = await pagina(de, de + LINHAS_POR_PEDIDO - 1)
    if (error) return { data: linhas, error }
    linhas.push(...(data ?? []))
    if (!data || data.length < LINHAS_POR_PEDIDO) break
  }
  return { data: linhas, error: null }
}
