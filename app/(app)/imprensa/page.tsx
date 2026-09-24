import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { obterChave } from '@/lib/integracoes/chaves'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { PainelDeImprensa } from '@/components/app/imprensa/painel'
import type { CampanhaNaTela } from '@/components/app/imprensa/campanhas'
import type { ContatoDeImprensa } from '@/app/actions/imprensa'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/imprensa') }

export const dynamic = 'force-dynamic'
// O disparo de campanha roda como server action desta página: até 1000
// destinatários em lotes de 100 precisam de mais que o tempo padrão.
export const maxDuration = 60

const TETO_NA_TELA = 20000

/**
 * Imprensa: o banco de contatos (jornalistas, veículos e qualquer contato
 * relevante), com busca e verificação pela Hunter.io, disparo de campanhas e
 * o histórico de tudo o que saiu — visível a toda a equipe.
 */
export default async function ImprensaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const COLUNAS = 'id,nome,veiculo,cargo,dominio,email,email_status,confianca,telefone,tags,notas,fonte,verificado_em,created_by,updated_at,descadastrado_em,ultimo_envio_em,ultima_abertura_em,envios_sem_abertura,total_envios,total_aberturas'
  // A API do banco devolve no máximo 1000 linhas por pedido: com listas
  // importadas, o banco passa disso, e o resto sumiria da tela em silêncio.
  async function todosOsContatos() {
    const linhas = []
    for (let de = 0; de < TETO_NA_TELA; de += 1000) {
      const { data } = await supabase.from('press_contacts').select(COLUNAS)
        .eq('workspace_id', context.workspace.id)
        .order('created_at', { ascending: false }).order('id')
        .range(de, de + 999)
      linhas.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    return linhas
  }

  const [data, { data: campanhas }, chaveHunter] = await Promise.all([
    todosOsContatos(),
    supabase
      .from('press_campanhas')
      .select('id,assunto,corpo,link_url,link_rotulo,estado,total_destinatarios,total_enviados,total_falhas,total_aberturas,total_aberturas_brutas,total_cliques,total_cliques_brutos,total_descadastros,created_at,enviada_em,enviada_por,profiles:enviada_por(full_name,username)')
      .eq('workspace_id', context.workspace.id)
      .order('created_at', { ascending: false })
      .limit(500),
    obterChave(context.workspace.id, 'hunter'),
  ])

  const contatos: ContatoDeImprensa[] = data.map((c) => ({
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
      linkRotulo: c.link_rotulo,
      estado: c.estado,
      destinatarios: c.total_destinatarios,
      enviados: c.total_enviados,
      falhas: c.total_falhas,
      aberturas: c.total_aberturas,
      aberturasTotais: c.total_aberturas_brutas,
      cliques: c.total_cliques,
      cliquesTotais: c.total_cliques_brutos,
      descadastros: c.total_descadastros,
      criadaEm: c.created_at,
      enviadaEm: c.enviada_em,
      quem: perfil?.full_name || perfil?.username || '—',
    }
  })

  // O mês corrente no fuso de São Paulo: é o mês que a equipe enxerga.
  const mesAtual = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date())
  const enviadosNoMes = historico
    .filter((c) => c.enviadaEm && new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(c.enviadaEm)) === mesAtual)
    .reduce((soma, c) => soma + c.enviados, 0)
  const limiteMensal = Number(process.env.IMPRENSA_LIMITE_MENSAL) || null

  return (
    <div>
      <PageHeader
        title="Imprensa e contatos"
        description="Banco de contatos — imprensa e todo contato relevante. Encontre e verifique pela Hunter.io, dispare campanhas e acompanhe quem lê."
      />
      <PainelDeImprensa
        contatos={contatos}
        campanhas={historico}
        envioNoMes={{ enviados: enviadosNoMes, limite: limiteMensal }}
        hunterDisponivel={Boolean(chaveHunter)}
        envioDisponivel={emailConfigurado()}
        podeDisparar={pode(context.role, 'imprensa.campanhas')}
        ehAdmin={context.role === 'admin'}
      />
    </div>
  )
}
