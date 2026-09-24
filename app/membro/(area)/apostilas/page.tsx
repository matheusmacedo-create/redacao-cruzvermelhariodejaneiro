import { FileText } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { apostilasDoMembro } from '@/lib/membro/cursos'

export const dynamic = 'force-dynamic'

const tamanho = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`)

export default async function Apostilas() {
  const m = await exigirMembro()
  const lista = await apostilasDoMembro(m)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Apostilas</h1>
        <p className="text-sm text-muted-foreground">Materiais de estudo e consulta da Cruz Vermelha RJ.</p>
      </div>
      {lista.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lista.map((a) => (
            <li key={a.id}>
              <a href={`/membro/apostilas/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10"><FileText className="size-5 text-primary" /></span>
                <span className="min-w-0">
                  <span className="block font-medium">{a.titulo}</span>
                  {a.descricao && <span className="block text-sm text-muted-foreground">{a.descricao}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground">{[a.curso ? `Curso: ${a.curso}` : null, `PDF · ${tamanho(a.tamanho)}`].filter(Boolean).join(' · ')}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-xl border border-dashed border-input bg-card p-10 text-center text-sm text-muted-foreground">Nenhuma apostila publicada ainda.</p>}
    </div>
  )
}
