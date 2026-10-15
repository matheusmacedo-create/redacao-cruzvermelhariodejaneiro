import { redirect } from 'next/navigation'
import { BrandMark } from '@/components/app/brand-mark'
import { LoginForm } from '@/components/auth/login-form'
import { getSessionContext } from '@/lib/session'

export const metadata = { title: 'Entrar — E-mail dos setores' }
export const dynamic = 'force-dynamic'

/**
 * A entrada do app de e-mail. O mesmo login do Palácio
 * (app/actions/entrada.ts: bloqueio por tentativas e registro de acessos),
 * com outra volta: /email. Quem já está logado vai direto para a caixa.
 * A tela é a mais simples possível: usuário, senha, entrar. Quem ainda deve
 * a troca da senha provisória é levado a ela depois de entrar.
 */
export default async function EntrarNoEmailPage() {
  if (await getSessionContext()) redirect('/email')
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <BrandMark rotulo="E-mail dos setores" className="w-72" />
        <h1 className="mt-10 text-2xl font-bold tracking-tight text-balance">E-mail</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">Entre com o usuário e a senha do seu acesso.</p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <LoginForm needsBootstrap={false} voltar="/email" usuario={{ rotulo: 'Usuário', placeholder: 'nome.sobrenome' }} rodape={
            <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
              <p className="text-sm">Esqueceu a senha? Peça uma nova ao responsável do seu setor.</p>
              <p className="max-w-xs text-[11px] leading-snug">Por segurança, registramos data, local aproximado e dados do aparelho de cada acesso.</p>
            </div>
          } />
        </div>
      </div>
    </main>
  )
}
