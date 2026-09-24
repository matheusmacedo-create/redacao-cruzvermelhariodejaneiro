import { BrandMark } from '@/components/app/brand-mark'

/** A moldura das telas de conta fora do app (login, senha, e-mail, código). */
export function TelaDeConta({ icone, titulo, descricao, children, rodape }: { icone: React.ReactNode; titulo: string; descricao?: React.ReactNode; children: React.ReactNode; rodape?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <BrandMark className="w-72 items-start" />
        <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">{icone}</div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">{titulo}</h1>
        {descricao && <p className="mt-3 leading-relaxed text-muted-foreground">{descricao}</p>}
        <div className="mt-8 rounded-xl border border-border bg-card p-6">{children}</div>
        {rodape && <div className="mt-4 text-center text-sm text-muted-foreground">{rodape}</div>}
      </div>
    </main>
  )
}
