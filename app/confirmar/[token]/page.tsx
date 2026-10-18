import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageCircleWarning, ShieldCheck } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { obterWorkspaceSemVerificacao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONFIRMACAO_VALE_MIN } from '@/lib/whatsapp/regras'
import { caminhoDaConfirmacao, lerConfirmacao, situacaoDaConfirmacao, tokenNoFormato } from '@/lib/whatsapp/confirmacoes'
import { descrever, foraDoAcessoDaEscola, linkDaConfirmacao } from '@/lib/whatsapp/confirmar-no-palacio'
import { Confirmar } from './confirmar'

export const metadata = { title: 'Confirmar no Palácio', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Confirmar no Palácio o que foi pedido pelo WhatsApp (lib/whatsapp/confirmacoes.ts):
 * decidir uma despesa ou uma compra, o voto de quem usa a verificação em duas
 * etapas, desativar uma conta.
 *
 * Fora do grupo (app), como /verificacao: sem sessão, passa pela entrada e
 * volta para cá (?voltar=); com a verificação em duas etapas pendente, passa
 * pelo código e volta. É o mesmo portão de requireWorkspace — a mesma
 * verificação das telas de cada área. O link só abre na conta de quem pediu
 * (a policy só deixa o dono ler), vale 15 minutos e uma vez só.
 */
export default async function ConfirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!tokenNoFormato(token)) return <Aviso titulo="Link inválido" texto="Este endereço não é um link de confirmação do Palácio. Confira se ele veio inteiro do WhatsApp." />
  const aqui = caminhoDaConfirmacao(token)
  const context = await obterWorkspaceSemVerificacao()
  if (!context) redirect(`/?voltar=${encodeURIComponent(aqui)}`)
  if (context.profile?.trocar_senha) redirect('/trocar-senha')
  if (context.verificacao !== 'em_dia') redirect(`/verificacao?voltar=${encodeURIComponent(aqui)}`)

  const supabase = await createClient()
  const c = await lerConfirmacao(supabase, token)
  if (!c || c.workspaceId !== context.workspace.id) {
    return <Aviso titulo="Este link não vale para a sua conta" texto="O link de confirmação só abre na conta de quem pediu pelo WhatsApp. Se o pedido foi seu, saia e entre com a sua conta; se não, ignore o link." />
  }
  const situacao = situacaoDaConfirmacao(c)
  const link = linkDaConfirmacao(c)
  if (situacao === 'usada') return <Aviso titulo="Este link já foi usado" texto={c.resultado ?? 'A confirmação já foi feita.'} link={link} />
  if (situacao === 'vencida') {
    return <Aviso titulo="Este link venceu" texto={`O link vale por ${CONFIRMACAO_VALE_MIN} minutos. Peça de novo pelo WhatsApp do Palácio, ou faça pela tela de sempre.`} link={link} />
  }
  if (foraDoAcessoDaEscola(c, context.role)) return <Aviso titulo="Fora do seu acesso" texto="Isto fica fora do que a sua conta abre no Palácio." />

  const quem = { userId: context.user.id, workspaceId: context.workspace.id, papel: context.role, nome: (context.profile?.full_name as string | null) ?? null }
  const descricao = await descrever(supabase, createAdminClient(), c, quem)
  if ('erro' in descricao) return <Aviso titulo="Não dá para confirmar" texto={descricao.erro} link={descricao.link} />

  return (
    <Moldura>
      <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">{descricao.titulo}</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">Você pediu isto pelo WhatsApp do Palácio. Só acontece depois de confirmar aqui.</p>
      <div className="mt-8 flex flex-col gap-5 rounded-xl border border-border bg-card p-6" data-confirmacao>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[9rem_1fr]">
          {descricao.linhas.map((l) => (
            <div key={l.rotulo} className="contents">
              <dt className="text-xs text-muted-foreground sm:pt-0.5">{l.rotulo}</dt>
              <dd className="whitespace-pre-line break-words text-sm">{l.valor || '—'}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">{descricao.efeito}</p>
        <Confirmar token={token} botao={descricao.botao} destrutivo={descricao.destrutivo} conferencia={descricao.conferencia ?? []} link={descricao.link} />
      </div>
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6">
      <div className="w-full max-w-lg">
        <BrandMark selo className="w-72 items-start" />
        {children}
      </div>
    </main>
  )
}

function Aviso({ titulo, texto, link }: { titulo: string; texto: string; link?: string }) {
  return (
    <Moldura>
      <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><MessageCircleWarning className="size-6" /></div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">{titulo}</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">{texto}</p>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        {link && <Link href={link} className="text-primary underline-offset-4 hover:underline">Abrir no Palácio</Link>}
        <Link href="/dashboard" className="text-muted-foreground underline-offset-4 hover:underline">Ir para o início</Link>
      </div>
    </Moldura>
  )
}
