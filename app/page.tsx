import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { CrossMark } from '@/components/app/brand-mark'
import { LoginForm } from '@/components/auth/login-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/espacos')

  const admin = createAdminClient()
  const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true })
  const needsBootstrap = (count ?? 0) === 0

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(380px,0.9fr)_1.1fr]">
      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3"><CrossMark className="size-11 border border-border"/><div><p className="font-bold">CVRJ Redação</p><p className="text-xs text-muted-foreground">Central de Comunicação</p></div></div>
          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Redação institucional</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance">{needsBootstrap ? 'Configure o primeiro acesso' : 'Acesse a Redação CVRJ'}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">Planejamento, produção e aprovação de conteúdo em um ambiente protegido.</p>
          </div>
          <div className="mt-8"><LoginForm needsBootstrap={needsBootstrap} /></div>
        </div>
      </section>
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><CrossMark className="size-11"/><div><p className="font-bold">CVRJ Redação</p><p className="text-xs text-primary-foreground/70">Central de Comunicação</p></div></div>
        <div className="max-w-xl">
          <div className="mb-8 flex size-14 items-center justify-center rounded-xl border border-primary-foreground/30"><ShieldCheck className="size-7" /></div>
          <h2 className="text-4xl font-bold leading-tight text-balance">Comunicação humanitária com organização e responsabilidade.</h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-primary-foreground/80">Do registro da ação à publicação, cada etapa permanece documentada e acessível à equipe.</p>
        </div>
        <p className="text-sm text-primary-foreground/70">Cruz Vermelha Brasileira · Rio de Janeiro</p>
      </section>
    </main>
  )
}
