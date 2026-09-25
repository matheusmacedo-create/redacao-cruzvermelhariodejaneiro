/**
 * O que aparece na hora em que se clica no menu, enquanto o servidor monta a
 * página. Sem isto a navegação ficava parada na tela anterior até tudo
 * chegar, e parecia que o clique não tinha pegado. O menu e a barra de cima
 * (o layout) continuam na tela; só o miolo vira este esqueleto.
 */
export default function Carregando() {
  return (
    <div className="animate-pulse" role="status" aria-live="polite" aria-busy="true" data-carregando>
      <span className="sr-only">Carregando…</span>
      <div className="mb-6 flex flex-col gap-2">
        <div className="h-7 w-56 max-w-full rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/70" />
      </div>
      <div className="mb-5 flex gap-2">
        <div className="h-9 w-24 rounded-lg bg-muted/70" />
        <div className="h-9 w-24 rounded-lg bg-muted/70" />
        <div className="h-9 w-24 rounded-lg bg-muted/70" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 h-4 w-1/3 rounded bg-muted" />
            <div className="mb-2 h-3 w-full rounded bg-muted/70" />
            <div className="h-3 w-2/3 rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  )
}
