import { redirect } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { TrocarSenhaForm } from '@/components/auth/trocar-senha-form'
import { obterWorkspace } from '@/lib/session'

/**
 * Troca obrigatória de senha.
 *
 * Fica FORA do grupo (app) de propósito: o layout de lá chama
 * requireWorkspace(), que manda quem tem `trocar_senha` para cá — dentro do
 * grupo seria um laço.
 */
export default async function TrocarSenhaPage() {
  const context = await obterWorkspace()
  if (!context) redirect('/')
  if (!context.profile?.trocar_senha) redirect('/dashboard')

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <BrandMark className="w-72 items-start" />
        <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-6" /></div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">Crie a sua senha</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Olá, {context.profile?.full_name?.split(' ')[0] || context.profile?.username}. A senha que você usou foi definida por um administrador e só vale para este primeiro acesso. Escolha uma senha só sua para continuar.
        </p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <TrocarSenhaForm origem="obrigatoria" usuario={context.profile?.username ?? ''} nome={context.profile?.full_name ?? ''} />
        </div>
        <form action="/auth/signout" method="post" className="mt-4 text-center"><button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Sair</button></form>
      </div>
    </main>
  )
}
