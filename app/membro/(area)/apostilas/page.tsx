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
        <p className="text-sm text-neutral-600">Materiais de estudo e consulta da Cruz Vermelha RJ.</p>
      </div>
      {lista.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lista.map((a) => (
            <li key={a.id}>
              <a href={`/membro/apostilas/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex h-full items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 hover:border-neutral-300">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50"><FileText className="size-5 text-[#e32219]" /></span>
                <span className="min-w-0">
                  <span className="block font-medium">{a.titulo}</span>
                  {a.descricao && <span className="block text-sm text-neutral-600">{a.descricao}</span>}
                  <span className="mt-1 block text-xs text-neutral-500">{[a.curso ? `Curso: ${a.curso}` : null, `PDF · ${tamanho(a.tamanho)}`].filter(Boolean).join(' · ')}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">Nenhuma apostila publicada ainda.</p>}
    </div>
  )
}
