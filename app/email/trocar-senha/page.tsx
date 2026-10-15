import { redirect } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { TrocarSenhaForm } from '@/components/auth/trocar-senha-form'
import { trocarSenhaDoEmail } from '@/app/actions/email-provisorio'
import { contaQueDeveATroca } from '@/lib/email-provisorio/sessao'

export const metadata = { title: 'Crie a sua senha — E-mail dos setores' }
export const dynamic = 'force-dynamic'

/** Troca obrigatória do primeiro acesso (ou depois de uma senha provisória nova) para quem é só do e-mail. */
export default async function TrocarSenhaDoEmailPage() {
  const conta = await contaQueDeveATroca()
  if (!conta) redirect('/email')
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <BrandMark rotulo="E-mail dos setores" className="w-72" />
        <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-6" /></div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">Crie a sua senha</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Olá, {conta.nome.split(' ')[0] || conta.usuario}. A senha que você usou é provisória e só vale para este acesso. Escolha uma senha só sua para continuar.
        </p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <TrocarSenhaForm origem="obrigatoria" usuario={conta.usuario} nome={conta.nome} acao={trocarSenhaDoEmail} />
        </div>
        <form action="/auth/signout" method="post" className="mt-4 text-center"><button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Sair</button></form>
      </div>
    </main>
  )
}
