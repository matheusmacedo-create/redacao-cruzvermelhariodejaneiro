import { redirect } from 'next/navigation'
import { Award, CalendarHeart, GraduationCap, MessageCircle } from 'lucide-react'
import { sessaoDoMembro } from '@/lib/membro/sessao'
import { Marca } from '@/components/membro/marca'
import { Entrar } from '@/components/membro/entrar'

export const dynamic = 'force-dynamic'

/** A entrada, no mesmo desenho da tela de acesso do Redação. */
export default async function EntrarNaAreaDoMembro({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (await sessaoDoMembro()) redirect('/membro')
  const { email } = await searchParams
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(380px,0.9fr)_1.1fr]">
      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          <Marca className="w-60 items-start" />
          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Área do Voluntário</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance">Entre no seu espaço de voluntário</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">Cursos, certificados, horas e oportunidades da Cruz Vermelha RJ, num lugar só.</p>
          </div>
          <div className="mt-8 rounded-xl border border-border bg-card p-6"><Entrar emailInicial={(email ?? '').slice(0, 254)} /></div>
          <p className="mt-4 text-center text-sm text-muted-foreground">Ainda não é voluntário? <a href="/participe" className="font-medium text-primary hover:underline">Inscreva-se</a></p>
        </div>
      </section>
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Marca inverted className="w-72 items-start" />
        <div className="max-w-xl">
          <h2 className="text-4xl font-bold leading-tight text-balance">Quem ajuda também aprende, cresce e é reconhecido.</h2>
          <ul className="mt-8 grid gap-4 text-lg text-primary-foreground/90">
            {[[GraduationCap, 'Cursos e apostilas da Cruz Vermelha'], [Award, 'Certificados com verificação pública'], [CalendarHeart, 'Ações, plantões e eventos para se inscrever'], [MessageCircle, 'Canal direto com a coordenação']].map(([Icone, texto]) => {
              const I = Icone as typeof Award
              return <li key={texto as string} className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border border-primary-foreground/30"><I className="size-5" /></span>{texto as string}</li>
            })}
          </ul>
        </div>
        <p className="text-sm text-primary-foreground/70">Cruz Vermelha Brasileira · Rio de Janeiro</p>
      </section>
    </main>
  )
}
