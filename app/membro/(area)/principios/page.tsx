import type { Metadata } from 'next'
import { exigirMembro } from '@/lib/membro/sessao'
import { PaginaDosPrincipios } from '@/components/membro/principios'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Princípios · Área do Voluntário".
export const metadata: Metadata = { title: 'Princípios' }

/**
 * Os sete Princípios Fundamentais e a regra do emblema no perfil pessoal. O
 * conteúdo é o mesmo para todo mundo (lib/membro/principios.ts); a sessão é
 * conferida como em toda página da área. Chega-se aqui pelo Início e pelo
 * menu da conta.
 */
export default async function PrincipiosDaAreaDoMembro() {
  await exigirMembro()
  return <PaginaDosPrincipios />
}
