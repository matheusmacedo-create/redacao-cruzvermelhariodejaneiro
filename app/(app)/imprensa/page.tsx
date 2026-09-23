import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { obterChave } from '@/lib/integracoes/chaves'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { PainelDeImprensa, type CampanhaNaTela } from '@/components/app/imprensa/painel'
import type { ContatoDeImprensa } from '@/app/actions/imprensa'

export const dynamic = 'force-dynamic'
// O disparo de campanha roda como server action desta página: até 500
// destinatários em lotes de 100 precisam de mais que o tempo padrão.
export const maxDuration = 60

/**
 * Imprensa: o banco de contatos (jornalistas, veículos e qualquer contato
 * relevante), com busca e verificação pela Hunter.io, disparo de campanhas e
 * o histórico de tudo o que saiu — visível a toda a equipe.
 */
export default async function ImprensaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const [{ data }, { data: campanhas }, chaveHunter] = await Promise.all([
    supabase
      .from('press_contacts')
      .select('id,nome,veiculo,cargo,dominio,email,email_status,confianca,telefone,tags,notas,fonte,verificado_em,created_by,updated_at,descadastrado_em,ultimo_envio_em,ultima_abertura_em,envios_sem_abertura,total_envios,total_aberturas')
      .eq('workspace_id', context.workspace.id)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('press_campanhas')
      .select('id,assunto,corpo,link_url,estado,total_destinatarios,total_enviados,total_falhas,total_aberturas,created_at,enviada_por,profiles:enviada_por(full_name,username)')
      .eq('workspace_id', context.workspace.id)
      .order('created_at', { ascending: false })
      .limit(100),
    obterChave(context.workspace.id, 'hunter'),
  ])

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
    descadastradoEm: c.descadastrado_em,
    ultimoEnvioEm: c.ultimo_envio_em,
    ultimaAberturaEm: c.ultima_abertura_em,
    enviosSemAbertura: c.envios_sem_abertura ?? 0,
    totalEnvios: c.total_envios ?? 0,
    totalAberturas: c.total_aberturas ?? 0,
  }))

  const historico: CampanhaNaTela[] = (campanhas ?? []).map((c) => {
    const perfil = (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as { full_name?: string; username?: string } | null
    return {
      id: c.id,
      assunto: c.assunto,
      corpo: c.corpo,
      linkUrl: c.link_url,
      estado: c.estado,
      destinatarios: c.total_destinatarios,
      enviados: c.total_enviados,
      falhas: c.total_falhas,
      aberturas: c.total_aberturas,
      quando: c.created_at,
      quem: perfil?.full_name || perfil?.username || '—',
    }
  })

  return (
    <div>
      <PageHeader
        title="Imprensa"
        description="Banco de contatos — imprensa e todo contato relevante. Encontre e verifique pela Hunter.io, dispare campanhas e acompanhe quem lê."
      />
      <PainelDeImprensa
        contatos={contatos}
        campanhas={historico}
        hunterDisponivel={Boolean(chaveHunter)}
        envioDisponivel={emailConfigurado()}
        podeDisparar={context.role !== 'colaborador'}
        ehAdmin={context.role === 'admin'}
      />
    </div>
  )
}
