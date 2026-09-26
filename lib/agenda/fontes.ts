import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { adapter } from '@/lib/publicacao/canais'
import { feriadosDoAno } from '@/lib/apis-publicas/servidor'
import { TIPOS as TIPOS_DE_OPORTUNIDADE, type Tipo as TipoDeOportunidade } from '@/lib/oportunidades/regras'
import { TIPOS_DE_DOCUMENTO, type TipoDeDocumento } from '@/lib/patrimonio/frota'
import { pode, type Papel } from '@/lib/permissoes'
import { CAMADAS_DO_ICS, TODAS_AS_CAMADAS, type Camada, type EstadoDoItem, type ItemDaAgenda } from './camadas'
import {
  agoraEmBrasilia, feriadosEntre, instanteParaDiaHora, montarDia, ocorrenciasEntre, ultimoDiaDoMes, type DataComemorativa,
} from './datas'

/**
 * De onde vem cada camada da Agenda. Nada é copiado: cada área continua dona
 * das suas datas e a agenda só lê a janela visível.
 *
 * Na tela, o cliente é o da própria pessoa e o RLS decide o que ela vê. No
 * link de assinatura (ICS) não há sessão: o cliente é o de serviço, e por isso
 * `camadasDisponiveis` confere o acesso de cada área antes — e o ICS só leva
 * as camadas marcadas como seguras em camadas.ts.
 */

type Cliente = Pick<SupabaseClient, 'from'>
type Linha = Record<string, any>

const inicioDoDia = (dia: string) => `${dia}T00:00:00-03:00`
const fimDoDia = (dia: string) => `${dia}T23:59:59-03:00`
const nomeDoCanal = (canal: string) => adapter(canal)?.nome ?? canal
const moeda = (v: unknown) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * As camadas que a pessoa pode ver, pelo papel e pelos acessos concedidos em cada área.
 *
 * `semSessao` é para o cliente de serviço (link de assinatura, resumo por
 * e-mail), que não passa pelo RLS: aí o Financeiro só entra para quem tem
 * acesso aos livros de todas as empresas — quem só vê a Escola ficaria vendo
 * os da Filial também.
 */
export async function camadasDisponiveis(cliente: Cliente, workspaceId: string, userId: string, papel: Papel, { semSessao = false } = {}): Promise<Set<Camada>> {
  if (papel === 'escola') return new Set<Camada>(['escola', 'datas', 'feriados'])
  if (papel === 'admin') return new Set(TODAS_AS_CAMADAS)
  const disponiveis = new Set<Camada>(['publicacoes', 'pautas', 'chamados', 'datas', 'feriados'])
  const acesso = (tabela: string, colunas = 'nivel') => cliente.from(tabela).select(colunas).eq('workspace_id', workspaceId).eq('user_id', userId)
  const [participantes, patrimonio, financeiro, equipe] = await Promise.all([
    acesso('participantes_acesso'), acesso('pat_acesso'), acesso('fin_acesso', 'nivel,entidade_id'), acesso('equipe_acesso'),
  ])
  if (participantes.data?.length) disponiveis.add('voluntariado')
  if (patrimonio.data?.length) { disponiveis.add('doacoes'); disponiveis.add('frota') }
  if ((financeiro.data as Linha[] | null)?.some((a) => !semSessao || a.entidade_id === null)) disponiveis.add('financeiro')
  if ((equipe.data as Linha[] | null)?.some((a) => a.nivel && a.nivel !== 'ver')) disponiveis.add('aniversarios')
  if (papel === 'editor') disponiveis.add('escola')
  if (pode(papel, 'transparencia.gerenciar')) disponiveis.add('institucional')
  return disponiveis
}

/** As camadas que podem ir para o link de assinatura desta pessoa. */
export async function camadasPermitidasNoIcs(cliente: Cliente, workspaceId: string, userId: string, papel: Papel): Promise<Camada[]> {
  const disponiveis = await camadasDisponiveis(cliente, workspaceId, userId, papel, { semSessao: true })
  return CAMADAS_DO_ICS.filter((c) => disponiveis.has(c))
}

const ESTADO_DA_PECA: Record<string, EstadoDoItem> = { draft: 'rascunho', production: 'rascunho', review: 'em_aprovacao', approved: 'aprovado' }
const ESTADO_DO_PACOTE: Record<string, EstadoDoItem> = { rascunho: 'rascunho', em_aprovacao: 'em_aprovacao', aprovado: 'aprovado', parcial: 'aprovado' }
/** Destinos que ainda não foram para a fila: depois disso, o calendar_events já tem a publicação. */
const ANTES_DA_FILA = ['gerada', 'em_ajuste', 'pronta', 'bloqueada']
const CHAMADO_ABERTO = ['novo', 'em_atendimento', 'aguardando_solicitante', 'aguardando_terceiro']

type Janela = { de: string; ate: string }
type Contexto = { cliente: Cliente; workspaceId: string; userId: string } & Janela

async function publicacoesEPrazos({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const { data, error } = await cliente.from('calendar_events')
    .select('id,title,event_date,event_time,type,pauta_id,content_id,channel')
    .eq('workspace_id', workspaceId).gte('event_date', de).lte('event_date', ate).order('event_date').limit(1500)
  if (error) throw error
  const eventos = (data ?? []) as Linha[]
  const pecas = [...new Set(eventos.map((e) => e.content_id).filter(Boolean))]
  const status = new Map<string, string>()
  if (pecas.length) {
    const { data: linhas } = await cliente.from('content_pieces').select('id,status').in('id', pecas)
    for (const p of (linhas ?? []) as Linha[]) status.set(p.id, p.status)
  }
  const hoje = agoraEmBrasilia().dia
  const itens: ItemDaAgenda[] = []
  for (const e of eventos) {
    const publicacao = e.type === 'publicacao'
    // O prazo de uma pauta vem da própria pauta (pode ter mudado depois do evento criado).
    if (!publicacao && e.pauta_id) continue
    const estadoDaPeca = e.content_id ? ESTADO_DA_PECA[status.get(e.content_id) ?? ''] : undefined
    itens.push({
      id: `ev:${e.id}`,
      camada: publicacao ? 'publicacoes' : 'pautas',
      titulo: e.title,
      dia: e.event_date,
      hora: e.event_time ? String(e.event_time).slice(0, 5) : null,
      href: e.content_id ? `/conteudos/${e.content_id}` : e.pauta_id ? `/pautas/${e.pauta_id}` : null,
      canal: e.channel ?? null,
      estado: publicacao ? (estadoDaPeca ?? (!e.content_id && e.event_date >= hoje ? 'agendado' : null)) : null,
      detalhe: publicacao ? null : e.type === 'prazo' ? 'Prazo' : 'Atividade',
    })
  }
  return itens
}

async function pacotes({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const [doPacote, doDestino] = await Promise.all([
    cliente.from('social_packages')
      .select('id,titulo_interno,titulo:mestre->>titulo,status,agendar_para,package_destinations(canal,estado,agendar_para)')
      .eq('workspace_id', workspaceId).in('status', Object.keys(ESTADO_DO_PACOTE))
      .gte('agendar_para', inicioDoDia(de)).lte('agendar_para', fimDoDia(ate)).limit(500),
    cliente.from('package_destinations')
      .select('canal,estado,agendar_para,package_id,social_packages!inner(id,titulo_interno,titulo:mestre->>titulo,status,agendar_para)')
      .eq('workspace_id', workspaceId).in('estado', ANTES_DA_FILA)
      .gte('agendar_para', inicioDoDia(de)).lte('agendar_para', fimDoDia(ate)).limit(1000),
  ])
  if (doPacote.error) throw doPacote.error
  if (doDestino.error) throw doDestino.error

  // Um item por pacote e horário, com os canais daquele horário.
  const grupos = new Map<string, { pacote: Linha; instante: string; canais: Set<string> }>()
  const juntar = (pacote: Linha, instante: string, canal: string) => {
    const chave = `${pacote.id}|${instante}`
    const g = grupos.get(chave) ?? { pacote, instante, canais: new Set<string>() }
    g.canais.add(canal)
    grupos.set(chave, g)
  }
  for (const p of (doPacote.data ?? []) as Linha[]) {
    for (const d of (p.package_destinations ?? []) as Linha[]) {
      if (!d.agendar_para && ANTES_DA_FILA.includes(d.estado)) juntar(p, p.agendar_para, d.canal)
    }
  }
  for (const d of (doDestino.data ?? []) as Linha[]) {
    const p = Array.isArray(d.social_packages) ? d.social_packages[0] : d.social_packages
    if (p && ESTADO_DO_PACOTE[p.status]) juntar(p, d.agendar_para, d.canal)
  }
  return [...grupos.values()].map(({ pacote, instante, canais }) => {
    const { dia, hora } = instanteParaDiaHora(instante)
    const nomes = [...canais].map(nomeDoCanal)
    return {
      id: `pacote:${pacote.id}:${instante}`,
      camada: 'publicacoes' as const,
      titulo: pacote.titulo_interno || pacote.titulo || 'Pacote sem título',
      dia, hora,
      href: `/redes/${pacote.id}`,
      canal: nomes.length === 1 ? nomes[0] : null,
      detalhe: nomes.length > 1 ? nomes.join(', ') : null,
      estado: ESTADO_DO_PACOTE[pacote.status] ?? null,
    }
  })
}

async function pautas({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const [p, m] = await Promise.all([
    cliente.from('pautas').select('id,title,due_date,status').eq('workspace_id', workspaceId)
      .neq('status', 'archived').gte('due_date', de).lte('due_date', ate).limit(800),
    cliente.from('project_marcos').select('id,titulo,data,project_id').eq('workspace_id', workspaceId)
      .eq('feito', false).gte('data', de).lte('data', ate).limit(300),
  ])
  if (p.error) throw p.error
  if (m.error) throw m.error
  return [
    ...((p.data ?? []) as Linha[]).map((x) => ({
      id: `pauta:${x.id}`, camada: 'pautas' as const, titulo: x.title, dia: x.due_date, href: `/pautas/${x.id}`,
      detalhe: 'Prazo da pauta', estado: x.status === 'approved' ? 'aprovado' as const : null,
    })),
    ...((m.data ?? []) as Linha[]).map((x) => ({
      id: `marco:${x.id}`, camada: 'pautas' as const, titulo: `Marco: ${x.titulo}`, dia: x.data, href: `/projetos/${x.project_id}`, detalhe: 'Marco de projeto',
    })),
  ]
}

async function voluntariado({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const { data, error } = await cliente.from('oportunidades').select('id,titulo,tipo,local,inicio,fim,publicado')
    .eq('workspace_id', workspaceId).is('cancelada_em', null)
    .lte('inicio', fimDoDia(ate)).gte('fim', inicioDoDia(de)).order('inicio').limit(500)
  if (error) throw error
  return ((data ?? []) as Linha[]).map((o) => {
    const inicio = instanteParaDiaHora(o.inicio)
    const fim = instanteParaDiaHora(o.fim)
    const tipo = TIPOS_DE_OPORTUNIDADE[o.tipo as TipoDeOportunidade]?.rotulo ?? 'Oportunidade'
    return {
      id: `op:${o.id}`, camada: 'voluntariado' as const, titulo: o.titulo, dia: inicio.dia, hora: inicio.hora,
      ate: fim.dia !== inicio.dia ? fim.dia : null, href: `/voluntariado/oportunidades/${o.id}`,
      detalhe: [tipo, o.local, o.publicado ? null : 'ainda não publicada'].filter(Boolean).join(' · '),
    }
  })
}

async function campanhas({ cliente, workspaceId, de, ate }: Contexto, camada: 'escola' | 'doacoes'): Promise<ItemDaAgenda[]> {
  const escola = camada === 'escola'
  let consulta = cliente.from(escola ? 'escola_campanhas' : 'doa_campanhas').select(escola ? 'id,nome,inicio,fim,status,curso' : 'id,nome,inicio,fim,ativa')
    .eq('workspace_id', workspaceId).not('inicio', 'is', null).lte('inicio', ate).or(`fim.is.null,fim.gte.${de}`).limit(300)
  if (!escola) consulta = consulta.eq('ativa', true)
  const { data, error } = await consulta
  if (error) throw error
  return ((data ?? []) as Linha[]).map((c) => ({
    id: `${camada}:${c.id}`, camada, titulo: escola ? `Campanha: ${c.nome}` : `Arrecadação: ${c.nome}`,
    dia: c.inicio, ate: c.fim ?? null,
    href: escola ? `/escola/marketing/${c.id}` : `/patrimonio/doacoes/campanhas/${c.id}`,
    detalhe: escola ? [c.curso, c.status === 'no_ar' ? 'no ar' : c.status === 'encerrada' ? 'encerrada' : 'planejada'].filter(Boolean).join(' · ') : null,
  }))
}

async function financeiro({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const { data, error } = await cliente.from('fin_lancamentos').select('id,tipo,descricao,valor,vencimento,aprovacao')
    .eq('workspace_id', workspaceId).is('pago_em', null).neq('tipo', 'transferencia').neq('aprovacao', 'recusada')
    .gte('vencimento', de).lte('vencimento', ate).order('vencimento').limit(500)
  if (error) throw error
  return ((data ?? []) as Linha[]).map((l) => ({
    id: `fin:${l.id}`, camada: 'financeiro' as const, titulo: `${l.tipo === 'receita' ? 'A receber' : 'A pagar'}: ${l.descricao}`,
    dia: l.vencimento, href: `/financeiro/${l.id}`,
    detalhe: [moeda(l.valor), l.aprovacao === 'pendente' ? 'aguardando aprovação' : null].filter(Boolean).join(' · '),
  }))
}

async function frota({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const { data, error } = await cliente.from('frota_documentos').select('id,tipo,descricao,vencimento,veiculo_id,frota_veiculos(placa,apelido)')
    .eq('workspace_id', workspaceId).gte('vencimento', de).lte('vencimento', ate).limit(300)
  if (error) throw error
  return ((data ?? []) as Linha[]).map((d) => {
    const v = Array.isArray(d.frota_veiculos) ? d.frota_veiculos[0] : d.frota_veiculos
    const tipo = TIPOS_DE_DOCUMENTO[d.tipo as TipoDeDocumento] ?? 'Documento'
    return {
      id: `frota:${d.id}`, camada: 'frota' as const, titulo: `${tipo} vence: ${v?.apelido || v?.placa || 'veículo'}`,
      dia: d.vencimento, href: `/patrimonio/frota/${d.veiculo_id}`, detalhe: d.descricao ?? null,
    }
  })
}

async function chamados({ cliente, workspaceId, userId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const { data, error } = await cliente.from('chamados').select('id,codigo,titulo,prazo_solucao')
    .eq('workspace_id', workspaceId).eq('responsavel_id', userId).in('status', CHAMADO_ABERTO)
    .gte('prazo_solucao', inicioDoDia(de)).lte('prazo_solucao', fimDoDia(ate)).limit(300)
  if (error) throw error
  return ((data ?? []) as Linha[]).map((c) => {
    const { dia, hora } = instanteParaDiaHora(c.prazo_solucao)
    return { id: `chamado:${c.id}`, camada: 'chamados' as const, titulo: `${c.codigo} · ${c.titulo}`, dia, hora, href: `/chamados/${c.id}`, detalhe: 'Prazo de solução' }
  })
}

async function parcerias({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const { data, error } = await cliente.from('transparencia_parcerias').select('id,orgao,numero,vigencia_fim,prestacao_final_em')
    .eq('workspace_id', workspaceId).is('retirado_em', null)
    .or(`and(vigencia_fim.gte.${de},vigencia_fim.lte.${ate}),and(prestacao_final_em.gte.${de},prestacao_final_em.lte.${ate})`).limit(200)
  if (error) throw error
  const itens: ItemDaAgenda[] = []
  for (const p of (data ?? []) as Linha[]) {
    const nome = p.numero ? `${p.orgao} (${p.numero})` : p.orgao
    if (p.vigencia_fim >= de && p.vigencia_fim <= ate) itens.push({ id: `parceria:${p.id}:fim`, camada: 'institucional', titulo: `Fim da vigência: ${nome}`, dia: p.vigencia_fim, href: '/transparencia' })
    if (p.prestacao_final_em >= de && p.prestacao_final_em <= ate) itens.push({ id: `parceria:${p.id}:prestacao`, camada: 'institucional', titulo: `Prestação de contas final: ${nome}`, dia: p.prestacao_final_em, href: '/transparencia' })
  }
  return itens
}

async function aniversarios({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const { data, error } = await cliente.from('equipe_pessoais').select('membro_id,data_nascimento,equipe_membros!inner(nome,nome_social,situacao)')
    .eq('workspace_id', workspaceId).not('data_nascimento', 'is', null).limit(1000)
  if (error) throw error
  const itens: ItemDaAgenda[] = []
  for (const p of (data ?? []) as Linha[]) {
    const m = Array.isArray(p.equipe_membros) ? p.equipe_membros[0] : p.equipe_membros
    if (!m || m.situacao === 'desligado') continue
    const [, mes, dia] = String(p.data_nascimento).split('-').map(Number)
    for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
      const quando = montarDia(ano, mes, Math.min(dia, ultimoDiaDoMes(ano, mes)))
      if (quando < de || quando > ate) continue
      // Sem idade: a agenda é vista por mais gente do que a ficha.
      itens.push({ id: `aniversario:${p.membro_id}:${ano}`, camada: 'aniversarios', titulo: `Aniversário: ${m.nome_social || m.nome}`, dia: quando, href: `/equipe/${p.membro_id}` })
    }
  }
  return itens
}

async function datasComemorativas({ cliente, workspaceId, de, ate }: Contexto): Promise<ItemDaAgenda[]> {
  const [d, p] = await Promise.all([
    cliente.from('datas_comemorativas').select('id,nome,descricao,categoria,regra,mes,dia,semana,dia_da_semana,antecedencia_dias,ativa')
      .eq('workspace_id', workspaceId).eq('ativa', true).limit(500),
    cliente.from('pautas').select('id,dc:details->>data_comemorativa,ano:details->>ano').eq('workspace_id', workspaceId)
      .not('details->>data_comemorativa', 'is', null).neq('status', 'archived').limit(1000),
  ])
  if (d.error) throw d.error
  const comPauta = new Map<string, string>()
  for (const x of (p.data ?? []) as Linha[]) comPauta.set(`${x.dc}:${x.ano}`, x.id)
  return ocorrenciasEntre((d.data ?? []) as DataComemorativa[], de, ate).map((o) => {
    const pauta = comPauta.get(`${o.data.id}:${o.ano}`)
    return {
      id: `data:${o.data.id}:${o.ano}`, camada: 'datas' as const, titulo: o.data.nome, dia: o.dia, ate: o.ate,
      detalhe: o.data.descricao, href: pauta ? `/pautas/${pauta}` : null,
      dataComemorativaId: o.data.id, antecedencia: o.data.antecedencia_dias, temPauta: Boolean(pauta),
    }
  })
}

const ROTULO_DO_FERIADO = { nacional: 'Feriado nacional', estadual: 'Feriado estadual', municipal: 'Feriado municipal', facultativo: 'Ponto facultativo' }

/**
 * Os feriados calculados aqui (funcionam sem rede e trazem os pontos
 * facultativos) mais o que a BrasilAPI trouxer a mais — um feriado nacional
 * novo, por decreto, chega por lá. É a mesma fonte dos prazos dos chamados.
 */
async function feriados({ de, ate }: Janela): Promise<ItemDaAgenda[]> {
  const calculados = feriadosEntre(de, ate)
  const anos = [...new Set([de.slice(0, 4), ate.slice(0, 4)].map(Number))]
  const daApi = (await Promise.all(anos.map((a) => feriadosDoAno(a).catch(() => [])))).flat()
  const dias = new Set(calculados.map((f) => f.dia))
  const extras = daApi.filter((f) => f.data >= de && f.data <= ate && !dias.has(f.data))
  return [
    ...calculados.map((f) => ({ id: `feriado:${f.dia}:${f.tipo}`, camada: 'feriados' as const, titulo: f.nome, dia: f.dia, detalhe: ROTULO_DO_FERIADO[f.tipo] })),
    ...extras.map((f) => ({ id: `feriado:${f.data}:${f.abrangencia}`, camada: 'feriados' as const, titulo: f.nome, dia: f.data, detalhe: ROTULO_DO_FERIADO[f.abrangencia] })),
  ]
}

const FONTES: Record<Camada, (c: Contexto) => Promise<ItemDaAgenda[]> | ItemDaAgenda[]> = {
  publicacoes: pacotes,
  pautas,
  voluntariado,
  escola: (c) => campanhas(c, 'escola'),
  doacoes: (c) => campanhas(c, 'doacoes'),
  financeiro,
  frota,
  chamados,
  institucional: parcerias,
  aniversarios,
  datas: datasComemorativas,
  feriados,
}

/**
 * Os itens das camadas pedidas na janela [de, ate]. Uma fonte que falha (tabela
 * ainda não criada, permissão) não derruba a agenda: vira um aviso em `falhas`.
 *
 * calendar_events alimenta `publicacoes` e `pautas` ao mesmo tempo: é lido uma
 * vez só quando qualquer das duas é pedida, e o filtro final corta a outra.
 */
export async function itensDaAgenda(
  cliente: Cliente, workspaceId: string, userId: string, janela: Janela, camadas: Iterable<Camada>,
): Promise<{ itens: ItemDaAgenda[]; falhas: Camada[] }> {
  const pedidas = new Set(camadas)
  const contexto: Contexto = { cliente, workspaceId, userId, ...janela }
  const falhas: Camada[] = []
  const tarefas: [Camada, () => Promise<ItemDaAgenda[]> | ItemDaAgenda[]][] = [...pedidas].map((c) => [c, () => FONTES[c](contexto)])
  if (pedidas.has('publicacoes') || pedidas.has('pautas')) tarefas.push([pedidas.has('publicacoes') ? 'publicacoes' : 'pautas', () => publicacoesEPrazos(contexto)])
  const resultados = await Promise.all(tarefas.map(async ([camada, ler]) => {
    try {
      return await ler()
    } catch (erro) {
      console.error(`[agenda] camada ${camada} falhou:`, erro instanceof Error ? erro.message : (erro as { message?: string })?.message ?? erro)
      if (!falhas.includes(camada)) falhas.push(camada)
      return []
    }
  }))
  const itens = resultados.flat().filter((i) => pedidas.has(i.camada))
  itens.sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo))
  return { itens, falhas }
}
