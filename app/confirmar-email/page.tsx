import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck, TriangleAlert } from 'lucide-react'
import { ConfirmarEmailBotao } from '@/components/auth/contas'
import { TelaDeConta } from '@/components/auth/tela-de-conta'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerToken } from '@/lib/contas/servidor'

export const metadata: Metadata = { title: 'Confirmar e-mail — Redação', referrer: 'no-referrer', robots: { index: false, follow: false } }

export default async function ConfirmarEmailPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams
  const lido = t ? await lerToken(createAdminClient(), t, ['confirmar_email']) : null

  if (!lido || !lido.email || !lido.pessoa.ativo) {
    return (
      <TelaDeConta icone={<TriangleAlert className="size-6" />} titulo="Link inválido ou expirado" descricao="Este link de confirmação já foi usado, expirou ou foi substituído por um mais novo. Peça outro em Meu perfil." rodape={<Link href="/" className="underline-offset-4 hover:underline">Ir para a Redação</Link>}>
        <Link href="/perfil" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Abrir Meu perfil</Link>
      </TelaDeConta>
    )
  }

  return (
    <TelaDeConta icone={<MailCheck className="size-6" />} titulo="Confirme seu e-mail" descricao={<>Este endereço vai receber os links de senha e os avisos de segurança da conta <strong className="text-foreground">{lido.pessoa.usuario}</strong> na Redação.</>}>
      <ConfirmarEmailBotao token={t} email={lido.email} />
    </TelaDeConta>
  )
}
