/**
 * As classes dos campos de formulário da Imprensa, também usadas nos filtros
 * das telas da Escola. Moram num módulo sem 'use client': uma página do
 * servidor que as importava de comum.tsx (módulo do cliente) recebia uma
 * referência de cliente — uma função, não o texto —, e o
 * `inputClass.replace(...)` derrubava /escola/vendas/transacoes e
 * /escola/marketing/biblioteca. comum.tsx as reexporta para os componentes do
 * cliente; página do servidor importa daqui.
 */

export const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/** O mesmo campo, com a largura do conteúdo — para selects numa linha de filtros. */
export const selectClass = inputClass.replace('w-full ', 'w-auto ')

/**
 * O campo das telas pensadas primeiro para o celular: 44 px de altura e letra
 * de 16 px (com letra menor, o iPhone amplia a página ao tocar no campo).
 */
export const campoClass = `min-h-11 ${inputClass.replace('text-sm', 'text-base sm:text-sm')}`
