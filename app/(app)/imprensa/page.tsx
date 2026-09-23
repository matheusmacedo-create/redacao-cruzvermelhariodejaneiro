import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { hunterConfigurado } from '@/lib/imprensa/hunter'
import { PainelDeImprensa } from '@/components/app/imprensa/painel'
import type { ContatoDeImprensa } from '@/app/actions/imprensa'

export const dynamic = 'force-dynamic'

/**
 * Imprensa: o banco de contatos de jornalistas e veículos, com busca e
 * verificação pela Hunter.io — a parte de Relações Públicas que hoje vive
 * espalhada em planilha e em ferramentas separadas.
 */
export default async function ImprensaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data } = await supabase
    .from('press_contacts')
    .select('id,nome,veiculo,cargo,dominio,email,email_status,confianca,telefone,tags,notas,fonte,verificado_em,created_by,updated_at')
    .eq('workspace_id', context.workspace.id)
    .order('created_at', { ascending: false })
    .limit(500)

  const contatos: ContatoDeImprensa[] = (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    veiculo: c.veiculo,
    cargo: c.cargo,
    dominio: c.dominio,
    email: c.email,
    emailStatus: c.email_status,
    confianca: c.confianca,
    telefone: c.telefone,
    tags: c.tags ?? [],
    notas: c.notas,
    fonte: c.fonte,
    verificadoEm: c.verificado_em,
    criadoPor: c.created_by,
    atualizadoEm: c.updated_at,
  }))

  return (
    <div>
      <PageHeader
        title="Imprensa"
        description="Contatos de jornalistas e veículos, encontrados e verificados pela Hunter.io — tudo num lugar só."
      />
      <PainelDeImprensa contatos={contatos} hunterDisponivel={hunterConfigurado()} />
    </div>
  )
}
