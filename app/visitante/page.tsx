import type { Metadata } from 'next'
import { TriangleAlert } from 'lucide-react'
import { Logo } from '@/components/membro/marca'
import { CabecalhoDaPagina } from '@/components/membro/pecas'
import { Autocadastro } from '@/components/portaria/autocadastro'
import { espacoDaEntrada } from '@/lib/portaria/servidor'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Visitante — Cruz Vermelha RJ', robots: { index: false, follow: false } }

/**
 * O QR da portaria abre aqui (/visitante?t=<segredo>): o visitante se
 * cadastra no celular e a portaria confirma a entrada. O segredo do cartaz em
 * vigor é conferido aqui e de novo no envio (portaria_autocadastro).
 */
export default async function Visitante({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  let valido = false
  try { valido = Boolean(await espacoDaEntrada(t)) } catch { valido = false }
  return (
    <div className="min-h-dvh bg-sidebar text-foreground [--destructive:oklch(0.5_0.19_27)] [--success-texto:oklch(0.45_0.12_150)] dark:[--destructive:rgb(239_83_80)] dark:[--success-texto:oklch(0.76_0.14_150)]">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4">
          <Logo className="w-28" />
          <span className="text-sm text-muted-foreground">Portaria</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-12 pt-6">
        <CabecalhoDaPagina titulo="Bem-vindo à Cruz Vermelha" descricao="Faça o seu registro de visitante. Leva menos de um minuto." />
        <div className="relative rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          {valido && t
            ? <Autocadastro token={t} />
            : (
              <p role="alert" className="flex items-start gap-2 text-sm" data-autocadastro="invalido">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                <span>Este QR não vale mais. Peça ajuda na portaria: a equipe registra a sua entrada.</span>
              </p>
            )}
        </div>
      </main>
    </div>
  )
}
