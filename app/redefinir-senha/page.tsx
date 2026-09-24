import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound, TriangleAlert } from 'lucide-react'
import { SenhaPeloLinkForm } from '@/components/auth/contas'
import { TelaDeConta } from '@/components/auth/tela-de-conta'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerToken } from '@/lib/contas/servidor'

// O código do link está na URL: nenhum recurso externo da página pode
// recebê-lo no cabeçalho Referer.
export const metadata: Metadata = { title: 'Senha — Redação', referrer: 'no-referrer', robots: { index: false, follow: false } }

/**
 * Definir (convite) ou redefinir a senha pelo link do e-mail.
 *
 * Abrir a página só LÊ o link; quem consome é o envio do formulário. Assim o
 * robô de segurança que abre todo link de e-mail não queima o link da pessoa.
 */
export default async function RedefinirSenhaPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams
  const lido = t ? await lerToken(createAdminClient(), t, ['definir_senha', 'redefinir_senha']) : null

  if (!lido || !lido.pessoa.ativo) {
    return (
      <TelaDeConta icone={<TriangleAlert className="size-6" />} titulo="Link inválido ou expirado" descricao="Este link já foi usado, expirou ou foi substituído por um mais novo. Por segurança, cada link funciona uma vez só e por tempo limitado." rodape={<Link href="/" className="underline-offset-4 hover:underline">Voltar ao login</Link>}>
        <Link href="/esqueci-senha" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Pedir um link novo</Link>
      </TelaDeConta>
    )
  }

  const convite = lido.finalidade === 'definir_senha'
  const primeiroNome = lido.pessoa.nome.split(' ')[0]
  return (
    <TelaDeConta
      icone={<KeyRound className="size-6" />}
      titulo={convite ? `Olá, ${primeiroNome}. Crie a sua senha` : 'Escolha uma senha nova'}
      descricao={<>Usuário: <strong className="text-foreground">{lido.pessoa.usuario}</strong>. {convite ? 'Depois de criar a senha, você entra com este usuário.' : 'Ao salvar, as sessões abertas em outros aparelhos são encerradas. Se você usa verificação em duas etapas, ela continua valendo.'}</>}
    >
      <SenhaPeloLinkForm token={t} usuario={lido.pessoa.usuario} nome={lido.pessoa.nome} convite={convite} />
    </TelaDeConta>
  )
}
