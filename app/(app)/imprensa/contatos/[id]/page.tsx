import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app/page-header'
import { FichaDoContato } from '@/components/app/imprensa/ficha'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { obterChave } from '@/lib/integracoes/chaves'
import { todasAsLinhas } from '@/lib/supabase/paginar'
import type { EnvioNaFicha } from '@/lib/imprensa/ficha'
import { COLUNAS_DA_LISTA, COLUNAS_DO_CONTATO, COLUNAS_DO_VEICULO, comoContato, comoLista, comoVeiculo } from '@/lib/imprensa/leitura'
import { atendeAoCriterio, criterioEstaVazio, ordenarListas } from '@/lib/imprensa/listas'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Contato de imprensa' }

/** As colunas vêm de lib/imprensa/leitura.ts: a API não sabe o tipo da linha, e a conversão confere campo a campo. */
type Linha = Record<string, unknown>

const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const textoOuNulo = (v: unknown) => (typeof v === 'string' ? v : null)

/** Quantos envios a ficha mostra. O total fica na frase do topo da seção. */
const ENVIOS_NA_FICHA = 50

/**
 * A ficha de um contato de imprensa: como falar com ele, o que cobre, as
 * listas em que está e o que já recebeu. O histórico não tem tabela própria:
 * vem de press_campanha_destinatarios, pela ligação com o contato.
 */
export default async function FichaDoContatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()

  const supabase = await createClient()
  const workspaceId = context.workspace.id
  const { data: linha } = await supabase.from('press_contacts').select(COLUNAS_DO_CONTATO)
    .eq('workspace_id', workspaceId).eq('id', id).maybeSingle().overrideTypes<Linha, { merge: false }>()
  if (!linha) notFound()
  const contato = comoContato(linha)

  const [{ data: linhasDeVeiculos }, { data: linhasDeListas }, { data: linhasDeMembro }, { data: linhasDeEnvios }, autor, chaveHunter] = await Promise.all([
    todasAsLinhas<Linha>((de, ate) => supabase.from('press_veiculos').select(COLUNAS_DO_VEICULO)
      .eq('workspace_id', workspaceId).order('nome').order('id')
      .range(de, ate).overrideTypes<Linha[], { merge: false }>(), 20000),
    supabase.from('press_listas').select(COLUNAS_DA_LISTA).eq('workspace_id', workspaceId).limit(500).overrideTypes<Linha[], { merge: false }>(),
    supabase.from('press_lista_contatos').select('lista_id').eq('workspace_id', workspaceId).eq('contato_id', id).limit(500),
    supabase.from('press_campanha_destinatarios')
      .select('id,estado,enviado_em,entregue_em,aberto_em,aberturas,clicado_em,devolvido_em,denunciou_em,descadastrou_em,created_at,press_campanhas:campanha_id(assunto,estado,agendada_para)')
      .eq('workspace_id', workspaceId).eq('contato_id', id)
      .order('created_at', { ascending: false }).limit(ENVIOS_NA_FICHA),
    contato.criadoPor
      ? supabase.from('profiles').select('full_name,username').eq('id', contato.criadoPor).maybeSingle()
      : Promise.resolve({ data: null }),
    obterChave(workspaceId, 'hunter'),
  ])

  const veiculos = linhasDeVeiculos.map(comoVeiculo)
  const veiculo = veiculos.find((v) => v.id === contato.veiculoId) ?? null

  // As listas em que o contato está hoje: as fixas em que foi posto e as por filtro a que atende.
  const emListaFixa = new Set((linhasDeMembro ?? []).map((m) => m.lista_id as string))
  const listas = ordenarListas((linhasDeListas ?? []).map(comoLista)
    .filter((l) => (l.tipo === 'fixa'
      ? emListaFixa.has(l.id)
      : !criterioEstaVazio(l.criterio) && atendeAoCriterio(contato, veiculo ?? undefined, l.criterio))))
    .map((l) => ({ id: l.id, nome: l.nome, plantao: l.plantao }))

  const envios: EnvioNaFicha[] = (linhasDeEnvios ?? []).map((e) => {
    const campanha = (Array.isArray(e.press_campanhas) ? e.press_campanhas[0] : e.press_campanhas) as { assunto?: string; estado?: string; agendada_para?: string | null } | null
    return {
      id: texto(e.id),
      assunto: texto(campanha?.assunto),
      estado: texto(e.estado),
      quando: textoOuNulo(e.enviado_em) ?? texto(e.created_at),
      // A hora marcada continua na campanha depois que ela começa a sair: só vale enquanto ela espera.
      agendadaPara: campanha?.estado === 'agendada' ? textoOuNulo(campanha.agendada_para) : null,
      entregueEm: textoOuNulo(e.entregue_em),
      abertoEm: textoOuNulo(e.aberto_em),
      aberturas: typeof e.aberturas === 'number' ? e.aberturas : 0,
      clicadoEm: textoOuNulo(e.clicado_em),
      devolvidoEm: textoOuNulo(e.devolvido_em),
      denunciouEm: textoOuNulo(e.denunciou_em),
      descadastrouEm: textoOuNulo(e.descadastrou_em),
    }
  })

  const perfil = autor.data as { full_name?: string | null; username?: string | null } | null
  const pracasEmUso = [...new Set(veiculos.map((v) => v.praca).filter(Boolean))]

  return (
    <div>
      <PageHeader
        title={contato.nome || contato.email || 'Contato sem nome'}
        description={[contato.cargo, contato.veiculo].filter(Boolean).join(' · ') || undefined}
        breadcrumbs={[{ label: 'Imprensa e contatos', href: '/imprensa' }, { label: 'Ficha do contato' }]}
      />
      <FichaDoContato
        contato={contato}
        veiculo={veiculo}
        veiculos={veiculos}
        pracasEmUso={pracasEmUso}
        envios={envios}
        listas={listas}
        cadastradoPor={perfil?.full_name || perfil?.username || ''}
        hunterDisponivel={Boolean(chaveHunter)}
        podeRemover={context.role === 'admin' || contato.criadoPor === context.user.id}
      />
    </div>
  )
}
