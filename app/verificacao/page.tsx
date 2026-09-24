import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { obterWorkspaceSemVerificacao } from '@/lib/session'
import { EtapaDeVerificacao } from './etapa'
import { PedirAjudaBotao } from '@/components/auth/contas'

/**
 * Segunda etapa do login: digitar o código do app autenticador, ou
 * cadastrá-lo quando o papel da pessoa exige e ela ainda não tem.
 *
 * Fora do grupo (app) pelo mesmo motivo de /trocar-senha: o layout de lá
 * manda para cá quem ainda deve o código, e dentro dele seria um laço.
 */
export default async function VerificacaoPage() {
  const context = await obterWorkspaceSemVerificacao()
  if (!context) redirect('/')
  if (context.profile?.trocar_senha) redirect('/trocar-senha')
  if (context.verificacao === 'em_dia') redirect('/dashboard')

  const primeiroNome = context.profile?.full_name?.split(' ')[0] || context.profile?.username
  const cadastrar = context.verificacao === 'cadastrar'

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <BrandMark className="w-72 items-start" />
        <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">{cadastrar ? 'Ative a verificação em duas etapas' : 'Digite o código do app'}</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {cadastrar
            ? `Olá, ${primeiroNome}. Para o seu papel, a Redação exige, além da senha, um código gerado por um app no seu celular. Leva um minuto.`
            : 'Abra o app autenticador no seu celular e digite o número de 6 dígitos da Redação CVB-RJ.'}
        </p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <EtapaDeVerificacao
            modo={cadastrar ? 'cadastrar' : 'codigo'}
            fatores={context.fatores.map((f) => ({ id: f.id, nome: f.friendly_name || 'Aparelho' }))}
          />
        </div>
        {!cadastrar && <div className="mt-4"><PedirAjudaBotao /></div>}
        <form action="/auth/signout" method="post" className="mt-2 text-center"><button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Sair</button></form>
      </div>
    </main>
  )
}
