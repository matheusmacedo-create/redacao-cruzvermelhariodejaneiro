import { Logo } from '@/components/membro/marca'

/* Mesmo visual das páginas públicas (/enviar, /participe): logo numa faixa branca, conteúdo no fundo cinza. */
export function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-sidebar text-foreground [--destructive:oklch(0.5_0.19_27)] [--success-texto:oklch(0.45_0.12_150)]">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4 sm:px-6 lg:h-16">
          <Logo className="w-28 sm:w-32" />
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </div>
  )
}
