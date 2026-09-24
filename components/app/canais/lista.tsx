import { ROTULO_DO_CANAL, type Canal } from '@/lib/transparencia/regras'

/** Uma versão publicada da lista, com o registro dela na trilha pública. */
export type VersaoDosCanais = {
  id: string
  versao: number
  canais: Canal[]
  observacao: string | null
  publicadoEm: string
  publicadoPor: string | null
  codigo: string | null
  /** SHA-256 do registro na trilha (a lista, a observação e o número da versão). */
  hash: string | null
}

/** A lista como a página pública mostra: rótulo à esquerda, endereço (com link, quando há) à direita. */
export function ListaDeCanais({ canais }: { canais: Canal[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {canais.map((c, i) => (
        <li key={i} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <span className="font-medium">
            {c.rotulo}
            {c.rotulo !== ROTULO_DO_CANAL[c.tipo] && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({ROTULO_DO_CANAL[c.tipo]})</span>}
          </span>
          <span className="min-w-0 break-words text-muted-foreground sm:text-right">
            {c.url
              ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{c.valor}<span className="sr-only"> (abre em outra aba)</span></a>
              : c.valor}
          </span>
        </li>
      ))}
    </ul>
  )
}
