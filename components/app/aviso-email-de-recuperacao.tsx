'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MailWarning } from 'lucide-react'

/**
 * Faixa no topo de todas as telas para quem ainda não tem e-mail de
 * recuperação confirmado.
 *
 * Sem ele, "Esqueci minha senha" não tem para onde mandar o link — e a tela
 * pública não pode dizer isso (revelaria quais contas existem). Então quem
 * avisa é o próprio app, enquanto a pessoa ainda consegue entrar. Some no
 * perfil, onde o campo já está em destaque.
 */
export function AvisoEmailDeRecuperacao({ email }: { email: string | null }) {
  const pathname = usePathname()
  if (pathname.startsWith('/perfil')) return null
  return (
    <div role="status" className="flex flex-col gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="flex items-start gap-2">
        <MailWarning className="mt-0.5 size-4 shrink-0" />
        <span>
          {email
            ? <>Confirme o seu <strong>e-mail de recuperação</strong>: abra o link que enviamos para {email}. Sem a confirmação, se você esquecer a senha, o link de recuperação não tem para onde ir.</>
            : <>Você ainda não tem um <strong>e-mail de recuperação</strong>. Se esquecer a senha, não teremos para onde mandar o link.</>}
        </span>
      </p>
      <Link href="/perfil#email-de-recuperacao" className="shrink-0 self-start rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 sm:self-auto">
        {email ? 'Reenviar ou trocar' : 'Cadastrar agora'}
      </Link>
    </div>
  )
}
