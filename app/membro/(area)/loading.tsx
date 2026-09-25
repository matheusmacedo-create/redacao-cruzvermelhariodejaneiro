/**
 * O que aparece logo ao tocar numa aba, enquanto o servidor monta a página.
 * Sem isto o toque parecia não ter pegado: a tela anterior ficava parada até
 * tudo chegar. Cabeçalho, abas e sub-abas (o layout) continuam na tela; só o
 * miolo vira este esqueleto. Pulsa só para quem não pediu menos movimento.
 */
export default function Carregando() {
  return (
    <div className="motion-safe:animate-pulse" role="status" aria-live="polite" aria-busy="true" data-carregando>
      <span className="sr-only">Carregando…</span>
      <div className="mb-6 flex flex-col gap-2">
        <div className="h-7 w-48 max-w-full rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted/70" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 h-4 w-1/2 rounded bg-muted" />
            <div className="mb-2 h-3 w-full rounded bg-muted/70" />
            <div className="h-3 w-2/3 rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  )
}
