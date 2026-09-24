import { redirect } from 'next/navigation'

/** Endereço antigo: as transações moram em Vendas. */
export default async function TransacoesAntigas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).filter(([, v]) => typeof v === 'string') as [string, string][]).toString()
  redirect(`/escola/vendas/transacoes${q ? `?${q}` : ''}`)
}
