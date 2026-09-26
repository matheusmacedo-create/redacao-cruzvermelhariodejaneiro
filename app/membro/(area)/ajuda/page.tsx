import type { Metadata } from 'next'
import { exigirMembro } from '@/lib/membro/sessao'
import { CentralDeAjuda } from '@/components/membro/central-de-ajuda'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Ajuda · Área do Voluntário".
export const metadata: Metadata = { title: 'Ajuda' }

/**
 * A Ajuda da Área do Voluntário: passo a passo e perguntas frequentes de cada
 * destino, os tours e a busca. O conteúdo é o mesmo para todo mundo
 * (lib/ajuda/membro.ts); a sessão é conferida como em toda página da área.
 * Não é um sexto destino: chega-se aqui pelo menu da conta e pelo fim do Início.
 */
export default async function AjudaDaAreaDoMembro() {
  await exigirMembro()
  return <CentralDeAjuda />
}
