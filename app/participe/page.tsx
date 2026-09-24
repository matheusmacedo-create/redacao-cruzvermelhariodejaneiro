import type { Metadata } from 'next'
import { FormularioPublico } from '@/components/participe/formulario-publico'

export const metadata: Metadata = { title: 'Seja voluntário — Cruz Vermelha RJ', description: 'Inscrição de voluntários da Cruz Vermelha Brasileira – Filial do Rio de Janeiro.' }

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export default function Participe() {
  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-10 text-neutral-900">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-4">
          <span aria-hidden="true" className="relative inline-block size-11 shrink-0">
            <span className="absolute left-1/2 top-0 h-full w-[34%] -translate-x-1/2 bg-[#e32219]" />
            <span className="absolute left-0 top-1/2 h-[34%] w-full -translate-y-1/2 bg-[#e32219]" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cruz Vermelha Brasileira – Rio de Janeiro</p>
            <h1 className="text-2xl font-bold tracking-tight">Seja voluntário</h1>
          </div>
        </header>
        <p className="text-sm text-neutral-700">Preencha a inscrição. A coordenação do Voluntariado analisa e entra em contato para a formação inicial.</p>
        <section className="relative rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
          <FormularioPublico hoje={hoje()} />
        </section>
      </div>
    </main>
  )
}
