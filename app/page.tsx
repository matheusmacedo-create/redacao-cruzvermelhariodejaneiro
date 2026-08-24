import { redirect } from 'next/navigation'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { LoginForm } from '@/components/auth/login-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { adminSupabaseEnv, publicSupabaseEnv, SupabaseConfigError, type InvalidKey } from '@/lib/supabase/env'

// Só nomes de variáveis, nunca valores: a página é pública.
function ConfigurationNotice({ missing, invalid }: { missing: string[]; invalid: InvalidKey[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <BrandMark className="w-72 items-start" />
        <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">Configuração incompleta</h1>
        {missing.length > 0 && (
          <>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Estas variáveis de ambiente não chegaram até a aplicação:
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {missing.map((name) => (
                <li key={name} className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm">{name}</li>
              ))}
            </ul>
          </>
        )}
        {invalid.length > 0 && (
          <>
            <p className="mt-6 leading-relaxed text-muted-foreground">
              Estas estão preenchidas com o tipo errado de chave. Confira em Supabase → Project
              Settings → API Keys qual chave pertence a cada campo:
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {invalid.map((item) => (
                <li key={item.name} className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                  <span className="font-mono text-sm">{item.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{item.reason}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
              Se você já corrigiu esse valor, então a versão publicada ainda é anterior à
              alteração: variável de ambiente só passa a valer a partir de um novo deploy.
            </p>
          </>
        )}
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Cadastre-as no ambiente de <strong>Production</strong> e publique novamente. Variáveis com
          o prefixo <code className="font-mono">NEXT_PUBLIC_</code> são embutidas durante a
          compilação, então alterá-las exige um novo build — salvar sem publicar não muda nada.
        </p>
      </div>
    </main>
  )
}

export default async function LoginPage() {
  const publicEnv = publicSupabaseEnv()
  const adminEnv = adminSupabaseEnv()
  const missingConfig = [...new Set([...publicEnv.missing, ...adminEnv.missing])]
  const invalidConfig = [...publicEnv.invalid, ...adminEnv.invalid]
  if (missingConfig.length || invalidConfig.length) {
    console.error('[login]', new SupabaseConfigError(missingConfig, invalidConfig).message)
    return <ConfigurationNotice missing={missingConfig} invalid={invalidConfig} />
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/espacos')

  const admin = createAdminClient()
  const { count, error } = await admin.from('profiles').select('*', { count: 'exact', head: true })
  // Sem distinguir erro de zero, uma falha de credencial faria a tela de
  // configuração inicial reaparecer num sistema que já tem usuários.
  if (error) console.error('[login] não foi possível contar os perfis:', error.message)
  const needsBootstrap = !error && (count ?? 0) === 0

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(380px,0.9fr)_1.1fr]">
      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          <BrandMark className="w-72 items-start" />
          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Redação institucional</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance">{needsBootstrap ? 'Configure o primeiro acesso' : 'Acesse a Redação Cruz Vermelha Brasileira Rio de Janeiro'}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">Planejamento, produção e aprovação de conteúdo em um ambiente protegido.</p>
          </div>
          <div className="mt-8"><LoginForm needsBootstrap={needsBootstrap} /></div>
        </div>
      </section>
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <BrandMark inverted className="w-72 items-start" />
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
