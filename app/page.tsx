import { redirect } from 'next/navigation'
import { Building2, GraduationCap, Megaphone, TriangleAlert, Users } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { LoginForm } from '@/components/auth/login-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { adminSupabaseEnv, publicSupabaseEnv, SupabaseConfigError, type InvalidKey } from '@/lib/supabase/env'
import { obterWorkspaceSemVerificacao } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { DOMINIO_DO_PALACIO } from '@/lib/dominio'

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

/** O tamanho do Palácio em quatro frentes (as mesmas do menu: lib/navegacao.ts). */
const PILARES = [
  { icone: Megaphone, titulo: 'Comunicação', texto: 'Pautas, aprovações, publicações e imprensa.' },
  { icone: Building2, titulo: 'Institucional', texto: 'Ofícios, chamados, compras e patrimônio.' },
  { icone: GraduationCap, titulo: 'Escola', texto: 'Educação e Saúde: vendas, finanças e marketing.' },
  { icone: Users, titulo: 'Pessoas', texto: 'Diretório, recursos humanos e voluntários.' },
]

const AVISOS: Record<string, string> = {
  definida: 'Senha criada. Entre com seu usuário e a senha nova.',
  redefinida: 'Senha redefinida. Entre com a senha nova.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  const { senha } = await searchParams
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
  // Logado mas sem espaço (conta desativada, vínculo removido): mandar para
  // o dashboard devolveria para cá, em laço. Explica e oferece sair.
  if (user) {
    if (await obterWorkspaceSemVerificacao()) redirect('/dashboard')
    return <SemAcesso />
  }

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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Acesso da equipe</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance">{needsBootstrap ? 'Configure o primeiro acesso' : 'Entre no Palácio Virtual'}</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">Planejamento, produção e aprovação de conteúdo em um ambiente protegido.</p>
          </div>
          <div className="mt-8"><LoginForm needsBootstrap={needsBootstrap} aviso={senha ? AVISOS[senha] : undefined} /></div>
        </div>
      </section>
      {/* Sem logo repetida nem ícone genérico: o lado direito diz o que é o Palácio.
          O vermelho entra como acento (filete e ícones); a cruz, só na logo, à esquerda. */}
      <section className="relative hidden overflow-hidden border-l border-border bg-muted/60 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-primary" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Cruz Vermelha Brasileira · Filial do Rio de Janeiro</p>
        <div className="max-w-xl">
          <h2 className="text-4xl font-bold leading-[1.1] tracking-tight text-balance xl:text-5xl">Comunicação humanitária com organização e responsabilidade.</h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">Do registro da ação à publicação, cada etapa fica documentada e ao alcance da equipe.</p>
          <ul className="mt-10 grid max-w-lg grid-cols-2 gap-3">
            {PILARES.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="rounded-xl border border-border bg-card p-4 shadow-xs">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/[0.08] text-primary"><Icone className="size-[18px]" aria-hidden="true" /></span>
                <p className="mt-3 text-sm font-semibold">{titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">{DOMINIO_DO_PALACIO}</p>
      </section>
    </main>
  )
}

function SemAcesso() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <BrandMark className="w-72 items-start" />
        <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><TriangleAlert className="size-6" /></div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">Sem acesso ao Palácio Virtual</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">Sua conta está desativada ou não está vinculada a nenhum espaço. Se isso não era esperado, fale com um administrador.</p>
        <form action="/auth/signout" method="post" className="mt-6"><Button type="submit" size="lg">Sair e entrar com outra conta</Button></form>
      </div>
    </main>
  )
}
