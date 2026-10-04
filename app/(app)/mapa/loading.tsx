/** O esqueleto do mapa enquanto o servidor lê as tabelas (o layout fica na tela). */
export default function Carregando() {
  return (
    <div className="animate-pulse" role="status" aria-live="polite" aria-busy="true" data-carregando>
      <span className="sr-only">Carregando o mapa…</span>
      <div className="mb-6 flex flex-col gap-2">
        <div className="h-7 w-64 max-w-full rounded-md bg-muted" />
        <div className="h-4 w-[28rem] max-w-full rounded bg-muted/70" />
      </div>
      <div className="flex min-h-[560px] flex-col gap-4 rounded-xl border border-border p-4">
        <div className="flex gap-2">
          <div className="h-9 w-72 max-w-full rounded-lg bg-muted/70" />
          <div className="h-9 w-32 rounded-lg bg-muted/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-20 rounded-full bg-muted/60" />
          <div className="h-7 w-20 rounded-full bg-muted/60" />
          <div className="h-7 w-20 rounded-full bg-muted/60" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="h-48 rounded-xl bg-muted/60" />
          <div className="h-48 rounded-xl bg-muted/60" />
          <div className="h-48 rounded-xl bg-muted/60" />
        </div>
        <div className="h-32 rounded-xl bg-muted/50" />
      </div>
    </div>
  )
}
