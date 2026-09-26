import Link from 'next/link'
import { CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { adapter } from '@/lib/publicacao/canais'
import { STATUS_EM_ABERTO } from '@/lib/editorial/status'
import { hojeEmSaoPaulo, type PessoaDoProjeto } from '@/components/app/projetos/comum'
import { passouDoPrazo, progresso, situacaoDoProjeto, somarDias } from '@/lib/projetos/cronograma'
import {
  agruparPorUrgencia, comparar, dentro, diaEmSaoPaulo, diasDaSemana, duracaoLegivel, entregas, fraseDaAtividade,
  janelasSemanais, mediaEmDias, montarSemana, pctNoPrazo, periodos, rotuloDaSemana, saudeDoCanal, segundaDaSemana,
  semanaPedida, taxaDeAbertura, type DestinoNaSemana, type EventoDoCalendario, type Janela,
} from '@/lib/dashboard/painel'
import {
  Camada, CartaoDoIndicador, Contador, EquipeAgora, EsperandoVoce, GradeDaSemana, MinhasPautas, NavegacaoDaSemana,
  ProjetosNoPainel, SaudeDosCanais, Secao,
  type CanalNoPainel, type Indicador, type ItemDoFeed, type MinhaPauta, type PedidoDeAprovacao, type ProjetoNoPainel,
} from '@/components/app/dashboard/camadas'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/dashboard') }

export const dynamic = 'force-dynamic'

/** A saudação tem de bater com o relógio de quem lê — em Brasília, não em UTC. */
function saudacao() {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()))
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

const DATA_LONGA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' })
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const umOuVarios = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const primeiro = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/** Início do dia em Brasília, como instante, para filtrar colunas de data e hora. */
const inicioDoDia = (dia: string) => `${dia}T00:00:00-03:00`
const fimDoDia = (dia: string) => `${dia}T23:59:59.999-03:00`

/**
 * O dashboard em três camadas: em cima, o meu dia (o que é meu e o que espera
 * por mim); no meio, a semana da operação (o que vai ao ar, o que saiu, o que
 * falhou); embaixo, quatro indicadores com tendência. O detalhe de cada coisa
 * continua na tela dela — aqui é o resumo que diz onde olhar.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const { semana: semanaParam } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  const ws = context.workspace.id
  const eu = context.user.id
  const hoje = hojeEmSaoPaulo()

  const segunda = semanaPedida(semanaParam, hoje)
  const dias = diasDaSemana(segunda)
  const domingo = dias[6]
  const { atual, anterior } = periodos(hoje)
  const janelas = janelasSemanais(hoje)
  // Os dados dos indicadores cobrem o período anterior inteiro e as 8 semanas da tendência.
  const desdeDia = [anterior.de, janelas[0].de].sort()[0]
  const desde = inicioDoDia(desdeDia)

  // A API do banco devolve até 1000 linhas por pedido.
  async function publicacoesDesde() {
    const linhas: { canal: string; publicado_em: string }[] = []
    for (let de = 0; de < 10_000; de += 1000) {
      const { data } = await supabase.from('package_destinations').select('canal,publicado_em')
        .eq('workspace_id', ws).eq('estado', 'publicada').gte('publicado_em', desde)
        .order('publicado_em', { ascending: false }).order('id').range(de, de + 999)
      linhas.push(...((data ?? []) as typeof linhas))
      if (!data || data.length < 1000) break
    }
    return linhas
  }

  const [
    { data: membros },
    { data: minhas },
    { data: votos },
    { data: atividade },
    { data: atualizacoes },
    { data: projetos },
    { data: eventos },
    { data: publicadasNaSemana },
    { data: falhasNaSemana },
    { count: aprovacoesPendentes },
    { data: ultimasPorCanal },
    { data: falhasRecentes },
    publicacoes,
    { data: campanhas },
    { data: chegadasPeloQuadro },
    { data: aprovadas },
    { data: decisoes },
  ] = await Promise.all([
    supabase.from('workspace_members').select('user_id,profiles(full_name,initials,color,avatar_path)').eq('workspace_id', ws),
    supabase.from('pautas').select('id,title,status,due_date,created_at,pauta_etiquetas(etiquetas(id,nome,cor))')
      .eq('workspace_id', ws).eq('owner_id', eu).in('status', STATUS_EM_ABERTO)
      .order('due_date', { ascending: true, nullsFirst: false }).limit(300),
    supabase.from('approval_voters').select('approval_id,approvals!inner(id,status,created_at,requested_by,content_pieces(title))')
      .eq('workspace_id', ws).eq('user_id', eu).eq('decision', 'pending').eq('approvals.status', 'pending').limit(30),
    supabase.from('activity_log').select('id,actor_id,action,entity_type,entity_id,metadata,created_at')
      .eq('workspace_id', ws).order('created_at', { ascending: false }).limit(40),
    supabase.from('project_updates').select('id,project_id,situacao,autor_id,created_at,projects(name)')
      .eq('workspace_id', ws).order('created_at', { ascending: false }).limit(6),
    supabase.from('projects').select('id,name,situacao,fim,responsavel_id,status,pautas(status)')
      .eq('workspace_id', ws).eq('status', 'active').limit(100),
    supabase.from('calendar_events').select('id,title,event_date,event_time,type,channel,pauta_id,content_id')
      .eq('workspace_id', ws).gte('event_date', segunda).lte('event_date', domingo).order('event_date').limit(300),
    supabase.from('package_destinations').select('id,package_id,canal,corpo,extras,publicado_em,social_packages(titulo_interno)')
      .eq('workspace_id', ws).eq('estado', 'publicada').gte('publicado_em', inicioDoDia(segunda)).lte('publicado_em', fimDoDia(domingo)).limit(300),
    supabase.from('package_destinations').select('id,package_id,canal,corpo,extras,updated_at,social_packages(titulo_interno)')
      .eq('workspace_id', ws).eq('estado', 'falhou').gte('updated_at', inicioDoDia(segunda)).lte('updated_at', fimDoDia(domingo)).limit(300),
    supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('status', 'pending'),
    // Já vem em ordem decrescente: a primeira linha de cada canal é a mais nova.
    supabase.from('package_destinations').select('canal,publicado_em')
      .eq('workspace_id', ws).eq('estado', 'publicada').not('publicado_em', 'is', null)
      .order('publicado_em', { ascending: false }).limit(300),
    supabase.from('package_destinations').select('canal,updated_at')
      .eq('workspace_id', ws).eq('estado', 'falhou').gte('updated_at', inicioDoDia(somarDias(hoje, -14)))
      .order('updated_at', { ascending: false }).limit(100),
    publicacoesDesde(),
    supabase.from('press_campanhas').select('enviada_em,total_enviados,total_aberturas')
      .eq('workspace_id', ws).in('estado', ['enviada', 'parcial']).not('enviada_em', 'is', null)
      .order('enviada_em', { ascending: false }).limit(300),
    // Pauta entregue = chegou a "Pronto": pelo quadro (registrado no histórico)
    // ou pela aprovação do conteúdo (que move a pauta junto).
    supabase.from('activity_log').select('entity_id,created_at')
      .eq('workspace_id', ws).eq('entity_type', 'pauta').eq('action', 'status_changed').eq('metadata->>status', 'approved')
      .gte('created_at', desde).limit(2000),
    supabase.from('approvals').select('updated_at,content_pieces(pauta_id)')
      .eq('workspace_id', ws).eq('status', 'approved').gte('updated_at', desde).limit(2000),
    supabase.from('approvals').select('created_at,updated_at')
      .eq('workspace_id', ws).in('status', ['approved', 'changes_requested']).gte('updated_at', desde).limit(2000),
  ])

  // ---------------------------------------------------------------- pessoas
  const pessoas = new Map<string, PessoaDoProjeto>()
  for (const m of membros ?? []) {
    const p = primeiro(m.profiles as { full_name?: string; initials?: string; color?: string; avatar_path?: string | null } | null)
    if (p) pessoas.set(m.user_id as string, { id: m.user_id as string, nome: p.full_name || 'Colaborador', iniciais: p.initials || '?', cor: p.color || null, avatar: p.avatar_path ?? null })
  }
  const pessoa = (id: string | null | undefined) => (id ? pessoas.get(id) : undefined)
  const nome = pessoa(eu)?.nome.split(' ')[0] || context.profile?.full_name?.split(' ')[0] || context.profile?.username || 'colaborador'

  // ---------------------------------------------------------------- camada 1
  const minhasPautas: MinhaPauta[] = (minhas ?? []).map((p) => ({
    id: p.id,
    titulo: p.title,
    status: p.status,
    prazo: p.due_date,
    criadaEm: p.created_at,
    etiquetas: ((p.pauta_etiquetas ?? []) as { etiquetas: unknown }[])
      .map((x) => primeiro(x.etiquetas as { id: string; nome: string; cor: string } | null))
      .filter((e): e is { id: string; nome: string; cor: string } => Boolean(e)),
  }))
  const grupos = agruparPorUrgencia(minhasPautas, hoje)
  const contagem = (g: string) => grupos.find((x) => x.grupo === g)?.pautas.length ?? 0

  const pedidos: PedidoDeAprovacao[] = (votos ?? []).flatMap((v) => {
    const a = primeiro(v.approvals as unknown as { id: string; created_at: string; requested_by: string | null; content_pieces: unknown } | null)
    if (!a) return []
    const conteudo = primeiro(a.content_pieces as { title?: string } | null)
    return [{ id: a.id, titulo: conteudo?.title || 'Conteúdo sem título', pedidoEm: a.created_at, quem: pessoa(a.requested_by) }]
  }).sort((a, b) => a.pedidoEm.localeCompare(b.pedidoEm))

  // Títulos das pautas citadas no histórico sem o título junto.
  const semTitulo = [...new Set((atividade ?? [])
    .filter((l) => l.entity_type === 'pauta' && l.entity_id && !(l.metadata as Record<string, unknown> | null)?.title)
    .map((l) => l.entity_id as string))]
  const { data: pautasCitadas } = semTitulo.length
    ? await supabase.from('pautas').select('id,title').eq('workspace_id', ws).in('id', semTitulo.slice(0, 200))
    : { data: [] as { id: string; title: string }[] }
  const tituloPorId = new Map((pautasCitadas ?? []).map((p) => [p.id, p.title]))

  const SITUACAO_NO_FEED: Record<string, string> = { no_prazo: 'No prazo', em_risco: 'Em risco', atrasado: 'Atrasado' }
  const feed: (ItemDoFeed & { dia: string })[] = [
    ...(atividade ?? []).flatMap((l) => {
      const frase = fraseDaAtividade(
        { action: l.action, entity_type: l.entity_type, entity_id: l.entity_id, metadata: l.metadata as Record<string, unknown> | null },
        (id) => tituloPorId.get(id) ?? null,
      )
      if (!frase) return []
      const href = l.entity_type === 'pauta' && l.entity_id && l.action !== 'archived'
        ? `/pautas/${l.entity_id}`
        : l.entity_type === 'project' && l.entity_id && l.action !== 'deleted' ? `/projetos/${l.entity_id}`
          : l.entity_type === 'oficio' && l.entity_id ? `/oficios/${l.entity_id}`
            : l.action === 'campanha_enviada' || l.action === 'contatos_importados' ? '/imprensa' : null
      return [{ id: `a:${l.id}`, quem: pessoa(l.actor_id), frase, quando: l.created_at as string, dia: diaEmSaoPaulo(l.created_at as string), href }]
    }),
    ...(atualizacoes ?? []).flatMap((u) => {
      const projeto = primeiro(u.projects as { name?: string } | null)
      if (!projeto?.name) return []
      return [{
        id: `u:${u.id}`, quem: pessoa(u.autor_id), quando: u.created_at as string, dia: diaEmSaoPaulo(u.created_at as string),
        frase: `marcou o projeto "${projeto.name}" como ${SITUACAO_NO_FEED[u.situacao] ?? u.situacao}`, href: `/projetos/${u.project_id}`,
      }]
    }),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 7)

  const PESO: Record<string, number> = { atrasado: 0, em_risco: 1, sem_atualizacao: 2, no_prazo: 3, concluido: 4 }
  const projetosNoPainel: ProjetoNoPainel[] = (projetos ?? []).map((p) => {
    const situacao = situacaoDoProjeto({ situacao: p.situacao, concluido: false })
    return {
      id: p.id, nome: p.name, situacao, fim: p.fim, meu: p.responsavel_id === eu,
      pct: progresso(((p.pautas ?? []) as { status: string }[]).map((x) => x.status)).pct,
      vencido: passouDoPrazo(p.fim, hoje, false),
    }
  })
    // Os meus primeiros; depois o que está pior; depois o prazo mais perto.
    .sort((a, b) => Number(b.meu) - Number(a.meu) || PESO[a.situacao] - PESO[b.situacao] || (a.fim ?? '9999').localeCompare(b.fim ?? '9999'))
    .slice(0, 4)

  // ---------------------------------------------------------------- camada 2
  const nomeDoCanal = (id: string) => adapter(id)?.nome ?? id
  type Destino = { id: string; package_id: string; canal: string; corpo: string | null; extras: Record<string, unknown> | null; social_packages: unknown }
  const titulosDoDestino = (d: Destino) => {
    const pacote = primeiro(d.social_packages as { titulo_interno?: string | null } | null)
    const corpo = (d.corpo ?? '').replace(/\s+/g, ' ').trim()
    return [typeof d.extras?.titulo === 'string' ? d.extras.titulo : '', pacote?.titulo_interno ?? '', corpo.slice(0, 60), corpo.slice(0, 70)]
  }
  const destinos: DestinoNaSemana[] = [
    ...((publicadasNaSemana ?? []) as (Destino & { publicado_em: string })[]).map((d): DestinoNaSemana => ({
      id: d.id, packageId: d.package_id, canalNome: nomeDoCanal(d.canal), estado: 'publicado', quando: d.publicado_em, titulos: titulosDoDestino(d),
    })),
    ...((falhasNaSemana ?? []) as (Destino & { updated_at: string })[]).map((d): DestinoNaSemana => ({
      id: d.id, packageId: d.package_id, canalNome: nomeDoCanal(d.canal), estado: 'falhou', quando: d.updated_at, titulos: titulosDoDestino(d),
    })),
  ]
  const semana = montarSemana(dias, (eventos ?? []) as EventoDoCalendario[], destinos)
  const itensDaSemana = [...semana.values()].flat()

  const ultimaPorCanal = new Map<string, string>()
  for (const l of ultimasPorCanal ?? []) if (!ultimaPorCanal.has(l.canal)) ultimaPorCanal.set(l.canal, l.publicado_em as string)
  const ultimaFalhaPorCanal = new Map<string, string>()
  for (const l of falhasRecentes ?? []) if (!ultimaFalhaPorCanal.has(l.canal)) ultimaFalhaPorCanal.set(l.canal, l.updated_at as string)
  // O site sempre aparece — é o canal da casa, e um site parado é notícia.
  // Os outros entram por uso: canal nunca usado não vira cobrança na tela.
  const idsDosCanais = ['site_web', ...[...new Set([...ultimaPorCanal.keys(), ...ultimaFalhaPorCanal.keys()])].filter((id) => id !== 'site_web')]
  const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const canais: CanalNoPainel[] = idsDosCanais.map((id) => {
    const ultima = ultimaPorCanal.get(id) ?? null
    const falha = ultimaFalhaPorCanal.get(id) ?? null
    const saude = saudeDoCanal(ultima, falha, hoje)
    const detalhe = saude === 'com_falha' && falha
      ? `falhou em ${QUANDO.format(new Date(falha))}`
      : ultima ? `última em ${QUANDO.format(new Date(ultima))}` : 'nada publicado ainda'
    return { id, nome: nomeDoCanal(id), saude, detalhe }
  }).sort((a, b) => {
    const ordem = { com_falha: 0, parado: 1, ativo: 2, sem_registro: 3 }
    return ordem[a.saude] - ordem[b.saude] || a.nome.localeCompare(b.nome, 'pt-BR')
  })

  // ---------------------------------------------------------------- camada 3
  const rotulosDasJanelas = janelas.map((j) => `Semana até ${j.ate.slice(8, 10)}/${j.ate.slice(5, 7)}`)
  const porJanela = <T,>(itens: T[], dia: (i: T) => string, valor: (lista: T[]) => number | null) =>
    janelas.map((j: Janela) => valor(itens.filter((i) => dentro(dia(i), j))))

  // 1. Publicações no ar
  const diasPublicados = publicacoes.map((p) => diaEmSaoPaulo(p.publicado_em))
  const pubAtual = diasPublicados.filter((d) => dentro(d, atual)).length
  const pubAnterior = diasPublicados.filter((d) => dentro(d, anterior)).length
  const temHistoricoDePublicacao = publicacoes.length > 0

  // 2. Abertura das campanhas de imprensa
  const listaDeCampanhas = (campanhas ?? []).map((c) => ({ dia: diaEmSaoPaulo(c.enviada_em as string), enviados: c.total_enviados ?? 0, aberturas: c.total_aberturas ?? 0 }))
  const aberturaAtual = taxaDeAbertura(listaDeCampanhas.filter((c) => dentro(c.dia, atual)))
  const aberturaAnterior = taxaDeAbertura(listaDeCampanhas.filter((c) => dentro(c.dia, anterior)))

  // 3. Pautas entregues no prazo
  const chegadas = [
    ...(chegadasPeloQuadro ?? []).filter((c) => c.entity_id).map((c) => ({ pautaId: c.entity_id as string, quando: c.created_at as string })),
    ...(aprovadas ?? []).flatMap((a) => {
      const pautaId = primeiro(a.content_pieces as { pauta_id?: string | null } | null)?.pauta_id
      return pautaId ? [{ pautaId, quando: a.updated_at as string }] : []
    }),
  ]
  const idsEntregues = [...new Set(chegadas.map((c) => c.pautaId))]
  const prazos = new Map<string, string | null>()
  for (let i = 0; i < idsEntregues.length; i += 200) {
    const { data } = await supabase.from('pautas').select('id,due_date').eq('workspace_id', ws).in('id', idsEntregues.slice(i, i + 200))
    for (const p of data ?? []) prazos.set(p.id, p.due_date)
  }
  const listaDeEntregas = entregas(chegadas, prazos)
  const prazoAtual = pctNoPrazo(listaDeEntregas.filter((e) => dentro(e.dia, atual)))
  const prazoAnterior = pctNoPrazo(listaDeEntregas.filter((e) => dentro(e.dia, anterior)))
  const entreguesNoPeriodo = listaDeEntregas.filter((e) => dentro(e.dia, atual)).length

  // 4. Tempo até a decisão
  const listaDeDecisoes = (decisoes ?? []).map((d) => ({ dia: diaEmSaoPaulo(d.updated_at as string), pedido: d.created_at as string, decidido: d.updated_at as string }))
  const decisaoAtual = mediaEmDias(listaDeDecisoes.filter((d) => dentro(d.dia, atual)))
  const decisaoAnterior = mediaEmDias(listaDeDecisoes.filter((d) => dentro(d.dia, anterior)))

  const pontos = (v: number) => `${Math.round(v)}%`
  const difPontos = (a: number | null, b: number | null) => (a === null || b === null ? '' : `${Math.abs(Math.round(a) - Math.round(b))} p.p.`)
  const variacao = (a: number, b: number) => (b ? `${Math.abs(Math.round(((a - b) / b) * 100))}%` : `${Math.abs(a - b)}`)

  const indicadores: Indicador[] = [
    {
      nome: 'Publicações no ar',
      valor: String(pubAtual),
      comparacao: comparar(pubAtual, temHistoricoDePublicacao ? pubAnterior : null, 'maior'),
      delta: variacao(pubAtual, pubAnterior),
      anterior: String(pubAnterior),
      ajuda: 'Cada canal conta uma vez: um post no Instagram e no Facebook são duas.',
      tendencia: {
        valores: porJanela(diasPublicados, (d) => d, (l) => l.length),
        rotulos: rotulosDasJanelas, formatar: (v) => umOuVarios(v, 'publicação', 'publicações'), zeroNaBase: true,
        descricao: 'Publicações por semana nas últimas 8 semanas',
      },
    },
    {
      nome: 'Abertura da imprensa',
      valor: aberturaAtual === null ? '—' : String(Math.round(aberturaAtual)),
      unidade: aberturaAtual === null ? undefined : '%',
      comparacao: comparar(aberturaAtual === null ? null : Math.round(aberturaAtual), aberturaAnterior === null ? null : Math.round(aberturaAnterior), 'maior'),
      delta: difPontos(aberturaAtual, aberturaAnterior),
      anterior: aberturaAnterior === null ? '—' : pontos(aberturaAnterior),
      ajuda: aberturaAtual === null ? 'Nenhuma campanha enviada nos últimos 30 dias.' : 'Contatos que abriram sobre os que receberam, nas campanhas do período.',
      tendencia: {
        valores: porJanela(listaDeCampanhas, (c) => c.dia, taxaDeAbertura),
        rotulos: rotulosDasJanelas, formatar: pontos,
        descricao: 'Taxa de abertura das campanhas por semana, nas últimas 8 semanas',
      },
    },
    {
      nome: 'Pautas entregues no prazo',
      valor: prazoAtual === null ? '—' : String(Math.round(prazoAtual)),
      unidade: prazoAtual === null ? undefined : '%',
      comparacao: comparar(prazoAtual === null ? null : Math.round(prazoAtual), prazoAnterior === null ? null : Math.round(prazoAnterior), 'maior'),
      delta: difPontos(prazoAtual, prazoAnterior),
      anterior: prazoAnterior === null ? '—' : pontos(prazoAnterior),
      ajuda: prazoAtual === null
        ? 'Nenhuma pauta com prazo chegou a "Pronto" nos últimos 30 dias.'
        : `${umOuVarios(entreguesNoPeriodo, 'pauta com prazo chegou', 'pautas com prazo chegaram')} a "Pronto" no período.`,
      tendencia: {
        valores: porJanela(listaDeEntregas, (e) => e.dia, pctNoPrazo),
        rotulos: rotulosDasJanelas, formatar: pontos,
        descricao: 'Percentual de pautas entregues no prazo por semana, nas últimas 8 semanas',
      },
    },
    {
      nome: 'Tempo até a decisão',
      valor: decisaoAtual === null ? '—' : duracaoLegivel(decisaoAtual),
      comparacao: comparar(decisaoAtual === null ? null : Math.round(decisaoAtual * 10) / 10, decisaoAnterior === null ? null : Math.round(decisaoAnterior * 10) / 10, 'menor'),
      delta: decisaoAtual === null || decisaoAnterior === null ? '' : duracaoLegivel(Math.abs(decisaoAtual - decisaoAnterior)),
      anterior: decisaoAnterior === null ? '—' : duracaoLegivel(decisaoAnterior),
      ajuda: decisaoAtual === null ? 'Nenhuma aprovação decidida nos últimos 30 dias.' : 'Média entre o pedido de aprovação e a decisão (aprovar ou pedir ajuste).',
      tendencia: {
        valores: porJanela(listaDeDecisoes, (d) => d.dia, mediaEmDias),
        rotulos: rotulosDasJanelas, formatar: duracaoLegivel,
        descricao: 'Tempo médio até a decisão por semana, nas últimas 8 semanas',
      },
    },
  ]

  // ---------------------------------------------------------------- resumo
  const vencendo = contagem('hoje') + contagem('semana')
  const partes = [
    contagem('atrasadas') ? umOuVarios(contagem('atrasadas'), 'pauta sua está atrasada', 'pautas suas estão atrasadas') : '',
    vencendo ? umOuVarios(vencendo, 'pauta sua vence nos próximos 7 dias', 'pautas suas vencem nos próximos 7 dias') : '',
    pedidos.length ? umOuVarios(pedidos.length, 'conteúdo espera a sua aprovação', 'conteúdos esperam a sua aprovação') : '',
  ].filter(Boolean)
  const resumo = partes.length
    ? `${partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0]}.`
    : 'Nada seu atrasado ou esperando decisão. Bom momento para adiantar a semana.'

  const ehSemanaAtual = segunda === segundaDaSemana(hoje)

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div data-ajuda="inicio.resumo">
          <p className="text-sm font-medium text-primary">{maiuscula(DATA_LONGA.format(new Date()))}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{saudacao()}, {nome}.</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{maiuscula(resumo)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/calendario" />}><CalendarDays className="size-4" />Ver calendário</Button>
          <Button render={<Link href="/registrar" />}><Plus className="size-4" />Criar</Button>
        </div>
      </div>

      <Camada nome="Meu dia" pergunta="O que é seu e o que espera por você.">
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <MinhasPautas grupos={grupos} total={minhasPautas.length} hoje={hoje} />
          <div className="flex min-w-0 flex-col gap-6">
            <EsperandoVoce pedidos={pedidos} hoje={hoje} />
            <EquipeAgora itens={feed} hoje={hoje} />
          </div>
        </div>
        <ProjetosNoPainel projetos={projetosNoPainel} hoje={hoje} />
      </Camada>

      <div id="semana" className="scroll-mt-6">
        <Camada
          nome={ehSemanaAtual ? 'Esta semana' : `Semana de ${rotuloDaSemana(segunda)}`}
          pergunta={ehSemanaAtual ? `${rotuloDaSemana(segunda)} · o que vai ao ar, o que saiu e o que falhou.` : 'O que estava no calendário, o que saiu e o que falhou.'}
          lado={<NavegacaoDaSemana anterior={somarDias(segunda, -7)} proxima={somarDias(segunda, 7)} ehAtual={ehSemanaAtual} />}
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Contador valor={itensDaSemana.length} rotulo="no calendário da semana" href="/calendario" />
            <Contador valor={destinos.filter((d) => d.estado === 'publicado').length} rotulo="publicações no ar" href="/registro" />
            <Contador valor={destinos.filter((d) => d.estado === 'falhou').length} rotulo="falharam ao publicar" href="/registro" alerta={destinos.some((d) => d.estado === 'falhou')} />
            <Contador valor={aprovacoesPendentes ?? 0} rotulo="esperando aprovação" href="/aprovacoes" />
          </div>
          <GradeDaSemana dias={dias} semana={semana} hoje={hoje} />
          <SaudeDosCanais canais={canais} />
        </Camada>
      </div>

      <Camada nome="Indicadores" pergunta="Últimos 30 dias comparados aos 30 anteriores, com a tendência de 8 semanas.">
        <Secao titulo="Resultados da operação" id="indicadores" acao={{ href: '/impacto', rotulo: 'Ver resultados' }}>
          <div data-ajuda="inicio.indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {indicadores.map((i) => <CartaoDoIndicador key={i.nome} i={i} />)}
          </div>
        </Secao>
      </Camada>
    </div>
  )
}
