import Link from 'next/link'
import { BrandMark } from '@/components/app/brand-mark'

/**
 * Layout das páginas públicas exigidas pelo App Review da Meta.
 *
 * Ficam fora do grupo (app) de propósito: precisam abrir sem login, porque a
 * equipe de análise da Meta acessa esses links sem ter conta na plataforma.
 */

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="shrink-0">
            <BrandMark className="w-40" />
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos de Uso</Link>
            <Link href="/exclusao-de-dados" className="hover:text-foreground">Exclusão de dados</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <article
          className="
            [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-balance
            [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight
            [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold
            [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-pretty
            [&_ul]:mt-3 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:leading-relaxed
            [&_ol]:mt-3 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol]:pl-5 [&_ol]:text-sm [&_ol]:leading-relaxed
            [&_table]:mt-4 [&_table]:w-full [&_table]:text-left [&_table]:text-sm
            [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:align-top [&_th]:font-semibold
            [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top
            [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline
            [&_strong]:font-semibold
          "
        >
          {children}
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-muted-foreground">
          Cruz Vermelha Brasileira · Filial do Estado do Rio de Janeiro
        </div>
      </footer>
    </div>
  )
}
