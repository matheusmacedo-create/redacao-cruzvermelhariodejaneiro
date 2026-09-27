import Link from 'next/link'
import { CheckCircle2, CircleDashed, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Integracoes } from '@/components/admin/integracoes'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'
import { createClient } from '@/lib/supabase/server'
import { SERVICOS, situacaoDasChaves } from '@/lib/integracoes/chaves'
import { emailConfigurado } from '@/lib/newsletter/resend'

export const metadata = { title: 'Integrações — Configurações' }

export default async function IntegracoesPage() {
  const context = await exigirAdministracao()
  const supabase = await createClient()
  const chaves = await situacaoDasChaves(supabase, context.workspace.id)
  // Só se existe ou não: o valor nunca sai do servidor.
  const redes = Boolean(process.env.UPLOAD_POST_API_KEY?.trim())
  const naHospedagem = [
    { nome: 'Envio de e-mails (Resend)', texto: 'Avisos, recuperação de senha, newsletter e e-mails aos voluntários.', ligado: emailConfigurado() },
    { nome: 'Publicação nas redes (Upload-Post)', texto: 'Facebook, Instagram, LinkedIn, X e Threads pelo Palácio Virtual.', ligado: redes },
  ]

  return (
    <div className="flex flex-col gap-8">
      <Integracoes chaves={chaves.map((c) => ({ ...c, painel: SERVICOS[c.servico].painel }))} />

      <section className="flex flex-col gap-4" data-ajuda="configuracoes.redes">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Redes sociais</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            As contas oficiais que o Palácio Virtual usa para publicar. A autorização é feita no Upload-Post, com o login de quem administra cada página.
          </p>
        </div>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-start gap-3">
            <Share2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Contas conectadas</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {redes ? 'Abre a página do Upload-Post para conectar, reconectar ou tirar uma conta. O link vale só para você e volta para cá no fim.' : 'Falta a chave do Upload-Post na hospedagem (variável UPLOAD_POST_API_KEY, na Vercel).'}
              </p>
            </div>
          </div>
          {redes && <Button variant="outline" render={<a href="/api/admin/redes-conectar" />}>Conectar ou revisar as contas</Button>}
        </Card>
      </section>

      <section className="flex flex-col gap-4" data-ajuda="configuracoes.hospedagem">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Configuradas na hospedagem</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estas chaves ficam na Vercel, não no cofre: aqui só aparece se estão ligadas. Para trocar, fale com quem administra a hospedagem.
          </p>
        </div>
        <Card className="divide-y divide-border p-0">
          {naHospedagem.map((h) => (
            <div key={h.nome} className="flex items-start gap-3 p-4">
              {h.ligado
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{h.nome}</p>
                <p className="text-sm text-muted-foreground">{h.texto}</p>
              </div>
              <span className={`shrink-0 text-xs font-medium ${h.ligado ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{h.ligado ? 'Ligada' : 'Desligada'}</span>
            </div>
          ))}
        </Card>
      </section>

      <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground" data-ajuda="configuracoes.outras-integracoes">
        Outras ligações ficam na área que as usa: as contas da Únicopag e a conta de anúncios do Meta da escola em{' '}
        <Link href="/escola/configuracoes" className="text-primary hover:underline">Escola › Contas e integrações</Link>;
        a conta Google dos endereços dos setores em <Link href="/configuracoes/email" className="text-primary hover:underline">E-mail dos setores</Link>.
      </p>
    </div>
  )
}
