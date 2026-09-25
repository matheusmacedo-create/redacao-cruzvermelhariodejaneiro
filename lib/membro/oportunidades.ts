import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { TIPOS, ehTipo, estado, horasDaAtividade, quando, selo, vagasRestantes, type EstadoDaOportunidade } from '@/lib/oportunidades/regras'
import { horasLegiveis } from './regras'
import type { Membro } from './sessao'

/**
 * As oportunidades vistas pelo voluntário: publicadas do espaço dele, das
 * próximas às de até 60 dias atrás, com as vagas ocupadas e a situação dele.
 * De outros voluntários, só a contagem — nunca quem são.
 */

export type OportunidadeDoMembro = {
  id: string; titulo: string; tipo: string; descricao: string | null; local: string | null; inicio: string; fim: string
  vagas: number | null; inscricoes_ate: string | null; horas: number | null; cancelada_em: string | null; motivo_cancelamento: string | null
  ocupadas: number; minha: string | null
}

const COLUNAS = 'id,titulo,tipo,descricao,local,inicio,fim,vagas,inscricoes_ate,horas,cancelada_em,motivo_cancelamento'

type Admin = ReturnType<typeof createAdminClient>

// O Supabase devolve no máximo 1000 linhas por consulta e corta o resto sem
// avisar: a contagem de vagas lia só as primeiras 1000 inscrições do lote e a
// situação da pessoa podia nem vir. Por isso a contagem é paginada.
const POR_PAGINA = 1000
// `.in()` vai na URL: 100 uuids dão uns 4 KB, longe do limite do servidor.
const IDS_POR_CONSULTA = 100
const OCUPAM_VAGA = ['inscrito', 'presente', 'ausente']

const emLotes = <T,>(l: T[], n: number) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n))

/** A situação da pessoa em cada oportunidade: uma linha por oportunidade (há `unique`), então cabe numa página. */
async function minhasInscricoes(admin: Admin, participanteId: string, ids: string[]): Promise<Map<string, string>> {
  const minhas = new Map<string, string>()
  await Promise.all(emLotes(ids, IDS_POR_CONSULTA).map(async (lote) => {
    const { data, error } = await admin.from('oportunidade_inscricoes').select('oportunidade_id,situacao').eq('participante_id', participanteId).in('oportunidade_id', lote)
    if (error) console.error('[membro] inscrições da pessoa:', error.message)
    for (const i of data ?? []) minhas.set(i.oportunidade_id as string, i.situacao as string)
  }))
  return minhas
}

/** Vagas ocupadas por oportunidade, página a página até bater com o total que o banco informa. */
async function vagasOcupadas(admin: Admin, ids: string[]): Promise<Map<string, number>> {
  const contagem = new Map<string, number>()
  await Promise.all(emLotes(ids, IDS_POR_CONSULTA).map(async (lote) => {
    let lidas = 0
    let total = Infinity
    while (lidas < total) {
      // `order('id')`: sem ordem fixa, duas páginas podem repetir ou pular linhas.
      const { data, count, error } = await admin.from('oportunidade_inscricoes').select('oportunidade_id', { count: 'exact' })
        .in('oportunidade_id', lote).in('situacao', OCUPAM_VAGA).order('id').range(lidas, lidas + POR_PAGINA - 1)
      if (error) console.error('[membro] vagas ocupadas:', error.message)
      if (error || !data?.length) break
      for (const i of data) contagem.set(i.oportunidade_id as string, (contagem.get(i.oportunidade_id as string) ?? 0) + 1)
      lidas += data.length
      total = count ?? lidas
    }
  }))
  return contagem
}

export async function oportunidadesDoMembro(m: Membro): Promise<OportunidadeDoMembro[]> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 60 * 86400_000).toISOString()
  const { data: lista, error } = await admin.from('oportunidades').select(COLUNAS).eq('workspace_id', m.workspaceId).eq('publicado', true)
    .gte('fim', desde).order('inicio').limit(300)
  if (error) console.error('[membro] oportunidades:', error.message)
  const ids = (lista ?? []).map((o) => o.id as string)
  if (!ids.length) return []
  const [minhas, ocupadas] = await Promise.all([minhasInscricoes(admin, m.participanteId, ids), vagasOcupadas(admin, ids)])
  return (lista ?? []).map((o) => ({
    ...(o as Omit<OportunidadeDoMembro, 'ocupadas' | 'minha'>),
    vagas: o.vagas as number | null, horas: o.horas === null ? null : Number(o.horas),
    ocupadas: ocupadas.get(o.id as string) ?? 0,
    minha: minhas.get(o.id as string) ?? null,
  }))
}

/** Uma oportunidade publicada do espaço do voluntário (para o .ics). */
export async function oportunidadeDoMembro(m: Membro, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const { data } = await createAdminClient().from('oportunidades').select(COLUNAS).eq('id', id).eq('workspace_id', m.workspaceId).eq('publicado', true).maybeSingle()
  return data as Omit<OportunidadeDoMembro, 'ocupadas' | 'minha'> | null
}

// ---------------------------------------------------------------- a tela (puro)
//
// Daqui para baixo não há banco: são as regras da tela de Oportunidades,
// conferidas com um script `npx tsx`. Ficam aqui, e não no cartão, porque o
// cartão é componente do cliente e este módulo é só do servidor: a página
// calcula e entrega o cartão pronto, com o mesmo `agora` para todos.

type Resumo = Pick<OportunidadeDoMembro, 'inicio' | 'fim' | 'inscricoes_ate' | 'cancelada_em' | 'vagas' | 'ocupadas' | 'minha'>

/** Tem vaga ou lugar na fila, e ainda pode desistir. */
const NA_LISTA = new Set(['inscrito', 'espera'])
/** É dela: inclusive a presença já lançada enquanto a atividade acontece. */
const MINHAS = new Set(['inscrito', 'espera', 'presente', 'ausente'])
/** Chegou a ter vaga. A lista de espera não entra no histórico: a pessoa não foi. */
const TEVE_VAGA = new Set(['inscrito', 'presente', 'ausente'])

const porInicio = (a: { inicio: string }, b: { inicio: string }) => Date.parse(a.inicio) - Date.parse(b.inicio)

/**
 * As três seções da tela.
 * - Minhas inscrições: as que ainda não terminaram e em que a pessoa está,
 *   inclusive as canceladas pela coordenação (com o selo e o motivo).
 * - Abertas para inscrição: as que aceitam inscrição ou lista de espera e em
 *   que ela não está. Cancelada em que ela não estava some. Quem desistiu
 *   pode voltar, então a desistência aparece aqui.
 * - Onde você já esteve: as que terminaram e em que ela teve vaga, da mais
 *   recente para a mais antiga.
 */
export function agruparOportunidades<O extends Resumo>(lista: O[], agora: Date): { minhas: O[]; abertas: O[]; passadas: O[] } {
  const t = agora.getTime()
  const proximas = lista.filter((o) => Date.parse(o.fim) > t).sort(porInicio)
  const minhas = proximas.filter((o) => MINHAS.has(o.minha ?? ''))
  const abertas = proximas.filter((o) => !MINHAS.has(o.minha ?? '') && ['aberta', 'lotada'].includes(estado(o, o.ocupadas, agora)))
  const passadas = lista.filter((o) => Date.parse(o.fim) <= t && !o.cancelada_em && TEVE_VAGA.has(o.minha ?? '')).sort((a, b) => porInicio(b, a))
  return { minhas, abertas, passadas }
}

export type SeloDoCartao = 'confirmada' | 'espera' | 'andamento' | 'cancelada' | 'presente' | 'ausente' | 'aguardando'

export type AcoesDoCartao = {
  /** "Quero participar" (vaga) ou "Entrar na lista de espera" (espera). */
  participar: 'vaga' | 'espera' | null
  agenda: boolean
  /** "Cancelar inscrição" ou "Sair da lista de espera", sempre com confirmação. */
  sair: 'inscricao' | 'espera' | null
  /** As inscrições encerraram: quem sair não consegue voltar. A confirmação avisa. */
  semVolta: boolean
}

/** O cartão pronto para mostrar: textos já montados, sem data para o cliente recalcular. */
export type CartaoDaOportunidade = {
  id: string; titulo: string; descricao: string | null; local: string | null
  /** "Plantão", "Formação presencial". */
  tipo: string
  /** Bloco da data: { dia: '27', mes: 'SET' }. */
  dia: string; mes: string
  /** "sáb., 27 de set. · 8h às 14h". */
  quando: string
  /** "3 vagas livres", só enquanto aceita inscrição. */
  vagas: string | null
  /** "Inscrições até 28/09 às 18h", só quando o prazo vem antes do início. */
  prazo: string | null
  /** "Vale 6 h": as horas que entram no cadastro com a presença. */
  horas: string | null
  cancelada: boolean
  motivo: string | null
  selos: { tipo: SeloDoCartao; texto: string }[]
  acoes: AcoesDoCartao
}

const noFuso = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...o }).format(new Date(iso))

/** "28/09 às 18h", "hoje às 18h30" ou "amanhã às 9h" (hora de São Paulo). */
export function prazoLegivel(iso: string, agora: Date): string {
  const dia = (d: Date) => noFuso(d.toISOString(), { day: '2-digit', month: '2-digit', year: 'numeric' })
  // `hourCycle: 'h23'`: com `hour12: false`, alguns motores escrevem meia-noite como "24".
  const [h, m] = noFuso(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':')
  const hora = m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
  const fecha = dia(new Date(iso))
  // São Paulo não tem horário de verão desde 2019: somar 24 h dá o dia seguinte.
  if (fecha === dia(agora)) return `hoje às ${hora}`
  if (fecha === dia(new Date(agora.getTime() + 86400_000))) return `amanhã às ${hora}`
  return `${noFuso(iso, { day: '2-digit', month: '2-digit' })} às ${hora}`
}

/** "Sem limite de vagas", "Vagas preenchidas", "1 vaga livre", "3 vagas livres". */
export function vagasLegiveis(vagas: number | null, ocupadas: number): string {
  const restantes = vagasRestantes(vagas, ocupadas)
  if (restantes === null) return 'Sem limite de vagas'
  if (restantes === 0) return 'Vagas preenchidas'
  return restantes === 1 ? '1 vaga livre' : `${restantes} vagas livres`
}

/**
 * O que o cartão mostra e deixa fazer. As ações seguem o que o banco aceita
 * (`membro_cancelar_inscricao` recusa depois do início):
 * - aberta: participar; lotada: entrar na lista de espera;
 * - inscrito ou na espera, com a ação aberta, lotada ou encerrada: agenda e
 *   sair (a inscrição encerrada não tira mais o botão de cancelar);
 * - em andamento: só a agenda, para quem tem vaga;
 * - passada ou cancelada: nada.
 */
export function cartaoDaOportunidade(o: OportunidadeDoMembro, agora: Date): CartaoDaOportunidade {
  const e: EstadoDaOportunidade = estado(o, o.ocupadas, agora)
  const { dia, mes } = selo(o.inicio)
  const aceita = e === 'aberta' || e === 'lotada'
  const antesDoInicio = aceita || e === 'encerrada'
  const naLista = NA_LISTA.has(o.minha ?? '')

  const selos: CartaoDaOportunidade['selos'] = []
  if (e === 'cancelada') selos.push({ tipo: 'cancelada', texto: 'Cancelada' })
  else {
    if (e === 'andamento') selos.push({ tipo: 'andamento', texto: 'Acontecendo agora' })
    if (o.minha === 'inscrito') selos.push(e === 'passada' ? { tipo: 'aguardando', texto: 'Aguardando registro de presença' } : { tipo: 'confirmada', texto: 'Inscrição confirmada' })
    else if (o.minha === 'espera' && e !== 'passada') selos.push({ tipo: 'espera', texto: 'Na lista de espera' })
    else if (o.minha === 'presente') selos.push({ tipo: 'presente', texto: 'Presença confirmada' })
    else if (o.minha === 'ausente') selos.push({ tipo: 'ausente', texto: 'Ausência registrada' })
  }

  const prazo = aceita && o.inscricoes_ate && Date.parse(o.inscricoes_ate) < Date.parse(o.inicio) ? `Inscrições até ${prazoLegivel(o.inscricoes_ate, agora)}` : null
  // Sem horas informadas, vale a duração; mas a presença lança no máximo 24 h
  // (`registrar_presenca`), então numa atividade de vários dias o número some.
  const horas = horasDaAtividade(o)
  return {
    id: o.id, titulo: o.titulo, descricao: o.descricao, local: o.local,
    tipo: ehTipo(o.tipo) ? TIPOS[o.tipo].rotulo : o.tipo,
    dia, mes, quando: quando(o.inicio, o.fim),
    vagas: aceita ? vagasLegiveis(o.vagas, o.ocupadas) : null,
    prazo,
    horas: e === 'cancelada' || e === 'passada' || !(horas > 0 && horas <= 24) ? null : `Vale ${horasLegiveis(horas)}`,
    cancelada: e === 'cancelada',
    motivo: e === 'cancelada' ? o.motivo_cancelamento : null,
    selos,
    acoes: {
      participar: naLista ? null : e === 'aberta' ? 'vaga' : e === 'lotada' ? 'espera' : null,
      agenda: (naLista && antesDoInicio) || (o.minha === 'inscrito' && e === 'andamento'),
      sair: naLista && antesDoInicio ? (o.minha === 'inscrito' ? 'inscricao' : 'espera') : null,
      semVolta: e === 'encerrada',
    },
  }
}
