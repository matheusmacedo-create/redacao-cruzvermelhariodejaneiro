import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, remetente } from '@/lib/newsletter/resend'
import { TETO_DE_DESTINATARIOS } from '@/lib/newsletter/envio'
import { Compositor } from './compositor'

export const metadata = { title: 'Nova edição · Newsletter' }

export const dynamic = 'force-dynamic'

/**
 * "Nova edição": escrever e enviar uma edição sem sair da Newsletter (19/11/2026).
 *
 * A página só reúne o que a tela precisa saber antes de a pessoa começar a escrever: para quantas pessoas a edição
 * vai, de qual endereço sai, e se quem abriu pode enviar. O resto é o compositor.
 */
export default async function NovaEdicaoPage() {
  const context = await requireWorkspace()
  const { count } = await createAdminClient()
    .from('newsletter_inscritos').select('id', { count: 'exact', head: true })
    .eq('workspace_id', context.workspace.id).eq('estado', 'confirmado')

  return (
    <div>
      <PageHeader
        title="Nova edição"
        description="Escreva, veja como fica, mande um teste para você e envie para a lista."
        breadcrumbs={[{ label: 'Newsletter', href: '/newsletter' }, { label: 'Nova edição' }]}
      />
      <Compositor
        destinatarios={count ?? 0}
        teto={TETO_DE_DESTINATARIOS}
        remetente={remetente()}
        envioConfigurado={emailConfigurado()}
        podeEnviar={pode(context.role, 'newsletter.enviar')}
        emailDeQuemEscreve={context.user.email ?? ''}
      />
    </div>
  )
}
