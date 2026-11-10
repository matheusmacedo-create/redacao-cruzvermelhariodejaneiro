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
import { todasAsLinhas } from '@/lib/supabase/paginar'
import { COLUNAS_DA_LISTA, COLUNAS_DO_CONTATO, COLUNAS_DO_VEICULO, comoContato, comoLista, comoVeiculo } from '@/lib/imprensa/leitura'

export const metadata = { title: tituloDaArea('/imprensa') }

export const dynamic = 'force-dynamic'
// O disparo de campanha roda como server action desta página: a campanha
// pequena sai antes da resposta e a grande segue com after() (lib/imprensa/
// fila.ts). Os dois precisam de mais que o tempo padrão.
export const maxDuration = 60

const TETO_NA_TELA = 20000

/** As colunas vêm de uma lista montada em lib/imprensa/leitura.ts: a API não sabe o tipo da linha, e a conversão confere campo a campo. */
type Linha = Record<string, unknown>

/**
 * Imprensa: o banco de contatos (jornalistas e qualquer contato relevante), o
 * cadastro dos veículos, as listas salvas, a busca e verificação pela
 * Hunter.io, o disparo de campanhas e o histórico de tudo o que saiu, visível
 * a toda a equipe.
 */
export default async function ImprensaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const workspaceId = context.workspace.id
  // A API do banco devolve no máximo 1000 linhas por pedido: com listas
  // importadas, o banco passa disso, e o resto sumiria da tela em silêncio.
  const [{ data }, { data: linhasDeVeiculos }, { data: linhasDeListas }, { data: linhasDeMembros }, { data: campanhas }, chaveHunter] = await Promise.all([
    todasAsLinhas<Linha>((de, ate) => supabase.from('press_contacts').select(COLUNAS_DO_CONTATO)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }).order('id')
      .range(de, ate).overrideTypes<Linha[], { merge: false }>(), TETO_NA_TELA),
    todasAsLinhas<Linha>((de, ate) => supabase.from('press_veiculos').select(COLUNAS_DO_VEICULO)
      .eq('workspace_id', workspaceId).order('nome').order('id')
      .range(de, ate).overrideTypes<Linha[], { merge: false }>(), TETO_NA_TELA),
    supabase.from('press_listas').select(COLUNAS_DA_LISTA).eq('workspace_id', workspaceId).order('nome').limit(500).overrideTypes<Linha[], { merge: false }>(),
    todasAsLinhas<{ lista_id: string; contato_id: string }>((de, ate) => supabase.from('press_lista_contatos').select('lista_id,contato_id')
      .eq('workspace_id', workspaceId).order('lista_id').order('contato_id')
      .range(de, ate)),
    supabase
      .from('press_campanhas')
      .select('id,assunto,corpo,link_url,link_rotulo,estado,total_destinatarios,total_enviados,total_falhas,total_aberturas,total_aberturas_brutas,total_cliques,total_cliques_brutos,total_descadastros,total_devolucoes,total_denuncias,agendada_para,created_at,enviada_em,enviada_por,lista_id,profiles:enviada_por(full_name,username)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(500),
    obterChave(workspaceId, 'hunter'),
  ])

  const contatos: ContatoDeImprensa[] = data.map(comoContato)
  const veiculos = linhasDeVeiculos.map(comoVeiculo)
  const listas = (linhasDeListas ?? []).map(comoLista)
  // Quem está em cada lista fixa: { idDaLista: [idDoContato, …] }.
  const membros: Record<string, string[]> = {}
  for (const m of linhasDeMembros) (membros[m.lista_id] ??= []).push(m.contato_id)
  const nomeDaLista = new Map(listas.map((l) => [l.id, l.nome]))

  // A campanha em envio ainda não tem os totais (eles fecham no fim): o
  // andamento vem da contagem das linhas já enviadas. São raras ao mesmo tempo.
  const jaSairam = new Map<string, number>()
  await Promise.all((campanhas ?? []).filter((c) => c.estado === 'enviando').slice(0, 5).map(async (c) => {
    const { count } = await supabase.from('press_campanha_destinatarios')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id).eq('campanha_id', c.id).eq('estado', 'enviado')
    jaSairam.set(c.id, count ?? 0)
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
      devolucoes: c.total_devolucoes ?? 0,
      denuncias: c.total_denuncias ?? 0,
      agendadaPara: c.agendada_para,
      lista: (c.lista_id && nomeDaLista.get(c.lista_id)) || '',
      jaSairam: jaSairam.get(c.id) ?? null,
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
        description="Contatos, veículos e listas da imprensa e de todo contato relevante. Encontre e verifique pela Hunter.io, envie ou agende campanhas e acompanhe quem lê."
      />
      <PainelDeImprensa
        contatos={contatos}
        veiculos={veiculos}
        listas={listas}
        membros={membros}
        campanhas={historico}
        envioNoMes={{ enviados: enviadosNoMes, limite: limiteMensal }}
        hunterDisponivel={Boolean(chaveHunter)}
        envioDisponivel={emailConfigurado()}
        podeDisparar={pode(context.role, 'imprensa.campanhas')}
        podeOrganizar={pode(context.role, 'imprensa.organizar')}
        usuarioId={context.user.id}
        ehAdmin={context.role === 'admin'}
      />
    </div>
  )
}
