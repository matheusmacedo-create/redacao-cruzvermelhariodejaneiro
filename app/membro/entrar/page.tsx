import { redirect } from 'next/navigation'
import { sessaoDoMembro } from '@/lib/membro/sessao'
import { Marca } from '@/components/membro/marca'
import { Entrar } from '@/components/membro/entrar'

export const dynamic = 'force-dynamic'

export default async function EntrarNaAreaDoMembro({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (await sessaoDoMembro()) redirect('/membro')
  const { email } = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Marca />
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-xl font-bold tracking-tight">Entrar</h1>
          <p className="mb-5 text-sm text-neutral-600">Seus cursos, certificados, horas e oportunidades, num lugar só.</p>
          <Entrar emailInicial={(email ?? '').slice(0, 254)} />
        </section>
        <p className="text-center text-xs text-neutral-500">Ainda não é voluntário? <a href="/participe" className="font-medium text-[#e32219] hover:underline">Inscreva-se</a></p>
      </div>
    </main>
  )
}
