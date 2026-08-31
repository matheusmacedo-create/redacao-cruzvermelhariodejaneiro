import Link from 'next/link'
import { CheckCircle2, MailCheck, TriangleAlert, LogOut } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'

/**
 * A moldura das páginas públicas da newsletter.
 *
 * Elas são vistas por quem NÃO é da equipe — a pessoa que clicou num link do
 * e-mail. Por isso levam a marca e uma volta para o site institucional, e não
 * para a Redação: mandar um leitor para a tela de login de um sistema interno
 * é dizer a ele que se perdeu.
 */

const SITE = 'https://cruzvermelhariodejaneiro.org'

const ICONES = {
  confirmado: CheckCircle2,
  aguardando: MailCheck,
  saiu: LogOut,
  erro: TriangleAlert,
} as const

const CORES = {
  confirmado: 'bg-emerald-50 text-emerald-700',
  aguardando: 'bg-sky-50 text-sky-700',
  saiu: 'bg-slate-100 text-slate-600',
  erro: 'bg-destructive/10 text-destructive',
} as const

export function Recado({
  tom,
  titulo,
  children,
  acao,
}: {
  tom: keyof typeof ICONES
  titulo: string
  children: React.ReactNode
  acao?: React.ReactNode
}) {
  const Icone = ICONES[tom]

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <BrandMark className="w-64 items-start" />

        <div className={`mt-10 flex size-12 items-center justify-center rounded-xl ${CORES[tom]}`}>
          <Icone className="size-6" />
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">{titulo}</h1>
        <div className="mt-4 space-y-3 text-muted-foreground leading-relaxed">{children}</div>

        {acao && <div className="mt-8">{acao}</div>}

        <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href={SITE} className="font-semibold text-primary hover:underline">
            Voltar para cruzvermelhariodejaneiro.org
          </Link>
        </p>
      </div>
    </main>
  )
}
