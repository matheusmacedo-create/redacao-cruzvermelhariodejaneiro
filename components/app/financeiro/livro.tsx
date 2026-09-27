'use client'

import { createContext, useCallback, useContext } from 'react'
import { noLivro, type Livro } from '@/lib/financeiro/livro'

const ContextoDoLivro = createContext<Livro>('filial')

/** Diz às telas do cliente em qual livro estão (o layout do Financeiro põe, pelo endereço). */
export function ProvedorDoLivro({ livro, children }: { livro: Livro; children: React.ReactNode }) {
  return <ContextoDoLivro.Provider value={livro}>{children}</ContextoDoLivro.Provider>
}

export const useLivro = () => useContext(ContextoDoLivro)

/** Leva um endereço `/financeiro/...` para o livro aberto (na Escola, `/escola/financeiro/...`). */
export function useNoLivro() {
  const livro = useLivro()
  return useCallback((caminho: string) => noLivro(livro, caminho), [livro])
}
