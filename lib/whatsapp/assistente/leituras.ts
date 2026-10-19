import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { conferenciaDaRodada } from '@/lib/aprovacoes/setores'
import { ABERTOS, ROTULO_DO_STATUS, ehStatus } from '@/lib/chamados/regras'
import { carregarChamado, filasQueAtendo, papeisNoChamado } from '@/lib/chamados/servidor'
import { linkDaVisita } from '@/lib/portaria/regras'
import { visitaEsperandoResposta } from '@/lib/portaria/servidor'
import { DIAS_CURTOS, diaDaSemana } from '@/lib/agenda/datas'
import { pode } from '@/lib/permissoes'
import { configDoWhatsapp } from '../servidor'
import { ehAdministracao, statusDoCanal } from '../admin'
import { agendaDaPessoa, aprovacoesPendentes, aprovacoesQuePedi, avisosDaPessoa, type AprovacaoDaPessoa } from '../consultas'
import { buscarDuvida } from '../duvidas'
import { decisoesDaPessoa, podeDecidirNoFinanceiro } from '../financeiro'
import { frotaAgora } from '../frota'
import { saldoNoEstoque } from '../estoque'
import { visitasDeHoje } from '../portaria'
import { documentoEsperando, quemGuarda } from '../drive'
import { tamanhoLegivel } from '@/lib/google/drive-regras'
import { alvoDoLink, normalizar, semInvisiveis, type AlvoDoAviso } from '../regras'
import type { Pessoa } from '../acoes'
import type { TabelaDeMarcadores, TipoDeItem } from './marcadores'
import type { ResultadoDaLeitura } from './laco'
import type { NivelDeLeitura } from './uso'
import type { Passo } from './regras'
import { diaCurto, diaEHora, haQuanto, type AvisoNoContexto, type DadosDoContexto, type ItemNoContexto } from './prompt'
import { LIMITES, TEXTOS_FIXOS, dadoDeTerceiro, rotuloDaPessoa, umaLinha, type ItemCitavel, type NomeDaFerramenta } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * As leituras do assistente do WhatsApp (as ferramentas ler_*, ver_* e buscar_*) e o contexto de cada turno. O
 * cliente é o de serviço — não há sessão no WhatsApp —, então CADA leitura refaz aqui as regras da tela, filtrando
 * pela pessoa e pelo espaço, no nível que uso.ts decidiu (ARQUITETURA §8.5):
 *
 *  - `pessoal` (quem usa a verificação em duas etapas, ou número sem confiança recente): só o que é da pessoa —
 *    os avisos dela, os chamados que abriu ou que estão com ela (sem nota interna), as aprovações dela sem o
 *    texto da matéria, a agenda e a ajuda; com a confirmação no Palácio disponível, a busca de colegas com até 3
 *    resultados (para o plano que termina lá). Filas, notas internas, corpo de matérias e as áreas
 *    (consultar_area): "Isso só pelo Palácio.";
 *  - `amplo`: as permissões da tela (as filas que atende, a nota interna para a equipe, um trecho do texto da
 *    matéria para quem vota, pediu ou gerencia, a busca de colegas, as áreas que a pessoa abre).
 *
 * O que vai ao modelo: JSON compacto, até LIMITES.itensNoResultado itens e LIMITES.caracteresNoResultado
 * caracteres; todo texto escrito por alguém passa por dadoDeTerceiro; itens só por marcador (o código emite e
 * resolve; marcadores.ts); nunca telefone, e-mail, valor, token nem URL. Os links entram na resposta final pelo
 * código (posProcessarResposta), a partir de `itens`.
 *
 * As leituras de detalhe (ver_aprovacao, ver_chamado, buscar_pessoa) contam no teto diário da pessoa
 * (whatsapp_ia_config.leituras_detalhe_dia).
 */

/** O estado de leitura de um turno: quem, em que nível, os marcadores e os rótulos que o código já escreveu. */
export type TurnoDeLeitura = {
  admin: Admin
  workspaceId: string
  pessoa: Pessoa
  nivel: NivelDeLeitura
  tabela: TabelaDeMarcadores
  /** marcador → rótulo e link (o que a resposta final cita). */
  itens: Record<string, ItemCitavel>
  /** Os achados da Central de ajuda desta vez (os links vão na resposta). */
  ajuda: { titulo: string; href: string }[]
  /** Leituras de detalhe: as de hoje antes deste turno, o teto do dia e as deste turno. */
  detalhe: { hoje: number; teto: number; noTurno: number }
  /** Uma leitura de detalhe foi feita (o registro do uso soma). */
  aoDetalhe?: () => void
  agora: number
  /** O quadro de pessoas do espaço, lido uma vez por turno. */
  quadro?: Promise<Map<string, PessoaDoQuadro>>
  /** A confirmação do plano no Palácio disponível: no nível pessoal, abre a busca de colegas (até 3). */
  noPalacio: boolean
}

export type PessoaDoQuadro = { nome: string; username: string; setor: string | null; ativo: boolean; papel: string }

export function novoTurnoDeLeitura(p: Omit<TurnoDeLeitura, 'itens' | 'ajuda' | 'agora' | 'detalhe'> & { detalhe: { hoje: number; teto: number } }): TurnoDeLeitura {
  return { ...p, itens: {}, ajuda: [], agora: Date.now(), detalhe: { ...p.detalhe, noTurno: 0 } }
}

// ------------------------------------------------------------------ marcadores e rótulos

const ok = (conteudo: unknown): ResultadoDaLeitura => ({ ok: true, conteudo: typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo) })
const erro = (texto: string): ResultadoDaLeitura => ({ ok: false, erro: texto })

/** Emite o marcador de um item e guarda o rótulo e o link (escritos aqui) para a resposta final. */
function emitir(t: TurnoDeLeitura, tipo: TipoDeItem, id: string | null | undefined, rotulo: string, link: string | null): string | null {
  if (!id) return null
  const m = t.tabela.emitir(tipo, id)
  if (m) t.itens[m] = { rotulo: umaLinha(rotulo, 140), link }
  return m
}

const tituloEntreAspas = (titulo: string | null | undefined) => `“${umaLinha(dadoDeTerceiro(titulo ?? '', 140), 140) || 'Sem título'}”`

/** O quadro de pessoas do espaço (nome, @usuário, setor, ativa), lido de uma vez: rótulos e homônimos. Vazio se não deu para ler. */
export async function lerQuadroDePessoas(admin: Admin, workspaceId: string): Promise<Map<string, PessoaDoQuadro>> {
  try {
    const { data } = await admin.from('workspace_members').select('user_id, role, coordination, profiles(full_name, username, active)').eq('workspace_id', workspaceId).limit(3000)
    const mapa = new Map<string, PessoaDoQuadro>()
    for (const m of data ?? []) {
      const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string | null; username?: string | null; active?: boolean } | null
      if (!perfil) continue
      mapa.set(m.user_id as string, {
        nome: perfil.full_name?.trim() || perfil.username || 'Sem nome', username: perfil.username ?? '', setor: (m.coordination as string | null) ?? null,
        ativo: perfil.active !== false, papel: String(m.role ?? ''),
      })
    }
    return mapa
  } catch {
    return new Map()
  }
}

/** O quadro de pessoas do espaço, uma vez por turno (os preparos usam o mesmo). */
export function quadroDePessoas(t: TurnoDeLeitura): Promise<Map<string, PessoaDoQuadro>> {
  t.quadro ??= lerQuadroDePessoas(t.admin, t.workspaceId)
  return t.quadro
}

/** Há outra pessoa ativa com o mesmo nome no espaço? (o ⚠ do rótulo) */
export function temHomonimo(quadro: Map<string, PessoaDoQuadro>, id: string): boolean {
  const eu = quadro.get(id)
  if (!eu) return false
  const nome = normalizar(semInvisiveis(eu.nome))
  for (const [outro, p] of quadro) if (outro !== id && p.ativo && normalizar(semInvisiveis(p.nome)) === nome) return true
  return false
}

/** O marcador de uma pessoa do espaço, com o rótulo "Nome (@usuário · Setor)" e o ⚠ de homônimo. */
async function marcadorDaPessoa(t: TurnoDeLeitura, id: string | null | undefined): Promise<string | null> {
  if (!id) return null
  const quadro = await quadroDePessoas(t)
  const p = quadro.get(id)
  if (!p) return null
  return emitir(t, 'pessoa', id, rotuloDaPessoa({ nome: p.nome, username: p.username, setor: p.setor, homonimo: temHomonimo(quadro, id) }), null)
}

/** As pessoas citadas nesta leitura: marcador → rótulo (o modelo precisa do nome junto do marcador). */
function pessoasCitadas(t: TurnoDeLeitura, marcadores: (string | null)[]): Record<string, string> {
  return Object.fromEntries([...new Set(marcadores.filter((m): m is string => Boolean(m)))].map((m) => [m, t.itens[m]?.rotulo ?? '']))
}

/** JSON compacto e dentro do teto: com lista, corta itens do fim até caber (e diz quantos ficaram de fora). */
function resultado(base: Record<string, unknown>, lista?: { chave: string; itens: unknown[]; total?: number }): ResultadoDaLeitura {
  if (!lista) return ok(JSON.stringify(base).slice(0, LIMITES.caracteresNoResultado))
  let itens = lista.itens.slice(0, LIMITES.itensNoResultado)
  const total = Math.max(lista.total ?? lista.itens.length, lista.itens.length)
  for (;;) {
    const texto = JSON.stringify({ ...base, [lista.chave]: itens, ...(total > itens.length ? { mais: total - itens.length } : {}) })
    if (texto.length <= LIMITES.caracteresNoResultado || !itens.length) return ok(texto.slice(0, LIMITES.caracteresNoResultado))
    itens = itens.slice(0, -1)
  }
}

/** O teto de detalhe do dia: null se ainda pode; o texto do erro se bateu. */
function semDetalhe(t: TurnoDeLeitura): ResultadoDaLeitura | null {
  return t.detalhe.hoje + t.detalhe.noTurno >= t.detalhe.teto ? erro(TEXTOS_FIXOS.limite_de_detalhe) : null
}

function contarDetalhe(t: TurnoDeLeitura) {
  t.detalhe.noTurno++
  t.aoDetalhe?.()
}

const desconhecido = (prefixo: string, onde: string) => erro(`Marcador desconhecido: use um marcador ${prefixo}_ que apareceu no contexto ou em ${onde}.`)

/** HTML do editor vira texto corrido (o trecho da matéria). */
const semHtml = (t: string | null | undefined) => String(t ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')

// ------------------------------------------------------------------ as aprovações (classificadas pelo estado, nunca pelo aviso)

type DadosDaAprovacao = { id: string; titulo: string; status: string; pedidaPor: string | null; criadaEm: string; meuVoto: string | null; contentId: string }

/** As aprovações pelos ids, com o título da matéria e o voto da pessoa (approvals e approval_voters). */
async function dadosDasAprovacoes(t: TurnoDeLeitura, ids: string[]): Promise<Map<string, DadosDaAprovacao>> {
  const unicos = [...new Set(ids)].slice(0, 20)
  if (!unicos.length) return new Map()
  const [{ data: rodadas }, { data: votos }] = await Promise.all([
    t.admin.from('approvals').select('id, status, content_id, requested_by, created_at').eq('workspace_id', t.workspaceId).in('id', unicos),
    t.admin.from('approval_voters').select('approval_id, decision').eq('user_id', t.pessoa.id).in('approval_id', unicos),
  ])
  const conteudos = [...new Set((rodadas ?? []).map((r) => r.content_id as string))]
  const { data: pecas } = conteudos.length ? await t.admin.from('content_pieces').select('id, title').in('id', conteudos) : { data: [] }
  const titulo = new Map((pecas ?? []).map((p) => [p.id as string, (p.title as string | null)?.trim() || 'Matéria sem título']))
  const voto = new Map((votos ?? []).map((v) => [v.approval_id as string, v.decision as string]))
  return new Map((rodadas ?? []).map((r) => [r.id as string, {
    id: r.id as string, titulo: titulo.get(r.content_id as string) ?? 'Matéria sem título', status: r.status as string,
    pedidaPor: (r.requested_by as string | null) ?? null, criadaEm: r.created_at as string, meuVoto: voto.get(r.id as string) ?? null, contentId: r.content_id as string,
  }]))
}

const ROTULO_DA_RODADA: Record<string, string> = { pending: 'aberta', approved: 'aprovada', changes_requested: 'com pedido de ajustes' }
const ROTULO_DO_VOTO: Record<string, string> = { pending: 'ainda não votou', approved: 'aprovou', changes_requested: 'pediu ajustes' }

// ------------------------------------------------------------------ as leituras (uma por ferramenta)

/** A leitura de uma ferramenta, no nível da pessoa. A entrada já veio validada (laco.ts). Nunca lança: erro vira is_error. */
export function criarLeitor(t: TurnoDeLeitura): (nome: NomeDaFerramenta, e: Record<string, unknown>) => Promise<ResultadoDaLeitura> {
  return async (nome, e) => {
    try {
      switch (nome) {
        case 'ler_avisos': return await lerAvisos(t, e.so_nao_lidos === true)
        case 'ler_aprovacoes': return await lerAprovacoes(t, e.situacao === 'que_eu_pedi' ? 'que_eu_pedi' : 'esperando_meu_voto')
        case 'ver_aprovacao': return await verAprovacao(t, String(e.aprovacao))
        case 'ler_chamados': return await lerChamados(t, String(e.escopo), String(e.situacao), String(e.busca ?? ''))
        case 'ver_chamado': return await verChamado(t, String(e.chamado))
        case 'ler_agenda': return await lerAgenda(t, String(e.de), String(e.ate))
        case 'buscar_pessoa': return await buscarPessoa(t, String(e.nome))
        case 'buscar_ajuda': return buscarAjuda(t, String(e.pergunta))
        case 'consultar_area': return await consultarArea(t, String(e.area), String(e.busca ?? ''))
        default: return erro('Ferramenta desconhecida.')
      }
    } catch (causa) {
      console.error('[whatsapp] assistente: leitura falhou:', nome, causa instanceof Error ? causa.message : causa)
      return erro('Não deu para consultar agora; tente de outro jeito ou siga sem isso.')
    }
  }
}

async function lerAvisos(t: TurnoDeLeitura, soNaoLidos: boolean): Promise<ResultadoDaLeitura> {
  const { avisos, total } = await avisosDaPessoa(t.admin, t.workspaceId, t.pessoa.id, { soNaoLidos, limite: 8 })
  const aprovacoes = await dadosDasAprovacoes(t, avisos.map((a) => alvoDoLink(a.link)).flatMap((x) => (x?.tipo === 'aprovacao' ? [x.id] : [])))
  const itens = await Promise.all(avisos.map(async (a) => {
    const alvo = alvoDoLink(a.link)
    const aviso = emitir(t, 'aviso', a.id, `aviso ${tituloEntreAspas(a.titulo)}`, a.link ?? '/notificacoes')
    let item: string | null = null
    let situacao: string | undefined
    if (alvo?.tipo === 'aprovacao') {
      const d = aprovacoes.get(alvo.id)
      if (d) {
        item = emitir(t, 'aprovacao', d.id, tituloEntreAspas(d.titulo), `/aprovacoes/${d.id}`)
        situacao = d.pedidaPor === t.pessoa.id ? 'sua aprovação' : d.status === 'pending' && d.meuVoto === 'pending' ? 'esperando seu voto' : d.meuVoto && d.meuVoto !== 'pending' ? 'você já votou' : 'encerrada'
      }
    } else if (alvo?.tipo === 'chamado') item = emitir(t, 'chamado', alvo.id, `chamado ${tituloEntreAspas(a.titulo)}`, `/chamados/${alvo.id}`)
    else if (alvo?.tipo === 'mensagem') item = await marcadorDaPessoa(t, alvo.pessoaId)
    else if (alvo?.tipo === 'visita') item = emitir(t, 'visita', alvo.id, `visita ${tituloEntreAspas(a.titulo)}`, linkDaVisita(alvo.id))
    return {
      aviso, ...(item ? { item } : {}), tipo: alvo?.tipo ?? 'aviso', titulo: dadoDeTerceiro(a.titulo, 140), quando: diaEHora(a.criadoEm), lido: a.lido,
      previa: dadoDeTerceiro(a.mensagem, 140), ...(situacao ? { situacao } : {}),
    }
  }))
  return resultado({ pessoas: pessoasCitadas(t, itens.map((i) => (i.tipo === 'mensagem' ? i.item ?? null : null))) }, { chave: 'avisos', itens, total })
}

async function lerAprovacoes(t: TurnoDeLeitura, situacao: 'esperando_meu_voto' | 'que_eu_pedi'): Promise<ResultadoDaLeitura> {
  const lidas = situacao === 'que_eu_pedi'
    ? await aprovacoesQuePedi(t.admin, t.workspaceId, t.pessoa.id, { limite: LIMITES.itensNoResultado })
    : await aprovacoesPendentes(t.admin, t.workspaceId, t.pessoa.id, { limite: LIMITES.itensNoResultado })
  if (!lidas) return erro('Não deu para ler as aprovações agora.')
  const lista: (AprovacaoDaPessoa & { votos?: { dados: number; total: number } })[] = lidas.aprovacoes
  const itens = await Promise.all(lista.map(async (a) => ({
    aprovacao: emitir(t, 'aprovacao', a.id, tituloEntreAspas(a.titulo), `/aprovacoes/${a.id}`),
    titulo: dadoDeTerceiro(a.titulo, 140),
    pedida_por: await marcadorDaPessoa(t, a.pedidaPor),
    desde: diaCurto(a.criadaEm),
    ...(a.votos ? { votos: `${a.votos.dados} de ${a.votos.total}` } : {}),
  })))
  return resultado({ situacao, pessoas: pessoasCitadas(t, itens.map((i) => i.pedida_por)) }, { chave: 'aprovacoes', itens, total: lidas.total })
}

async function verAprovacao(t: TurnoDeLeitura, marcador: string): Promise<ResultadoDaLeitura> {
  const teto = semDetalhe(t)
  if (teto) return teto
  const id = t.tabela.resolver(marcador, 'aprovacao')
  if (!id) return desconhecido('apr', 'ler_aprovacoes')
  const { data: rodada } = await t.admin.from('approvals').select('id, status, content_id, requested_by, created_at').eq('id', id).eq('workspace_id', t.workspaceId).maybeSingle()
  if (!rodada) return erro('Essa aprovação não existe mais.')
  const { data: votantes } = await t.admin.from('approval_voters').select('user_id, decision').eq('approval_id', id).limit(30)
  const meuVoto = (votantes ?? []).find((v) => v.user_id === t.pessoa.id)?.decision as string | undefined
  const pedi = rodada.requested_by === t.pessoa.id
  const gerencia = t.nivel === 'amplo' && pode(t.pessoa.papel, 'aprovacoes.gerenciar')
  if (!meuVoto && !pedi && !gerencia) return erro('Essa aprovação não é sua (nem você vota nela); veja no Palácio.')
  contarDetalhe(t)
  // O trecho do texto só no nível amplo; no pessoal, nunca (só pelo Palácio).
  const { data: peca } = await t.admin.from('content_pieces').select(t.nivel === 'amplo' ? 'title, pauta_id, body' : 'title, pauta_id').eq('id', rodada.content_id).eq('workspace_id', t.workspaceId).maybeSingle()
  const p = (peca ?? {}) as { title?: string | null; pauta_id?: string | null; body?: string | null }
  let conferencia: { setor: string; itens: string[] }[] = []
  if (meuVoto) {
    const [{ data: pauta }, { data: vinculo }] = await Promise.all([
      p.pauta_id ? t.admin.from('pautas').select('coordination').eq('id', p.pauta_id).maybeSingle() : Promise.resolve({ data: null }),
      t.admin.from('workspace_members').select('coordination').eq('workspace_id', t.workspaceId).eq('user_id', t.pessoa.id).maybeSingle(),
    ])
    conferencia = conferenciaDaRodada((pauta?.coordination as string | null) ?? null, (vinculo?.coordination as string | null) ?? null)
      .map((b) => ({ setor: b.setor.nome, itens: b.itens.slice(0, 6).map((i) => dadoDeTerceiro(i, 160)) }))
  }
  const aprovacao = emitir(t, 'aprovacao', id, tituloEntreAspas(p.title), `/aprovacoes/${id}`)
  const pedidaPor = await marcadorDaPessoa(t, rodada.requested_by as string | null)
  const votos = await Promise.all((votantes ?? []).slice(0, LIMITES.itensNoResultado).map(async (v) => ({
    pessoa: await marcadorDaPessoa(t, v.user_id as string), voto: ROTULO_DO_VOTO[v.decision as string] ?? String(v.decision),
  })))
  return resultado({
    aprovacao, titulo: dadoDeTerceiro(p.title, 140), pedida_por: pedidaPor, desde: diaCurto(rodada.created_at as string),
    situacao: ROTULO_DA_RODADA[rodada.status as string] ?? rodada.status, seu_voto: meuVoto ? ROTULO_DO_VOTO[meuVoto] : 'você não vota nesta rodada',
    ...(conferencia.length ? { conferencia } : {}),
    ...(t.nivel === 'amplo' && p.body ? { trecho: dadoDeTerceiro(semHtml(p.body), 500) } : {}),
    pessoas: pessoasCitadas(t, [pedidaPor, ...votos.map((v) => v.pessoa)]),
    votos,
  })
}

/** Escapa % e _ (e a barra) para o ilike: o que a pessoa digitou é texto, não padrão. */
const paraIlike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`)

async function lerChamados(t: TurnoDeLeitura, escopo: string, situacao: string, busca: string): Promise<ResultadoDaLeitura> {
  if (escopo === 'minhas_filas' && t.nivel !== 'amplo') return erro(TEXTOS_FIXOS.so_no_palacio)
  let q = t.admin.from('chamados').select('id, codigo, titulo, status, atualizado_em', { count: 'exact' }).eq('workspace_id', t.workspaceId)
  if (escopo === 'abri') q = q.eq('solicitante_id', t.pessoa.id)
  else if (escopo === 'comigo') q = q.eq('responsavel_id', t.pessoa.id)
  else {
    const filas = [...await filasQueAtendo(t.admin, t.workspaceId, t.pessoa.id, t.pessoa.papel)]
    if (!filas.length) return ok({ chamados: [], aviso: 'Você não atende nenhuma fila de chamados.' })
    q = q.in('fila_id', filas)
  }
  if (situacao === 'encerrados_7_dias') q = q.in('status', ['resolvido', 'fechado', 'cancelado']).gte('atualizado_em', new Date(t.agora - 7 * 86_400_000).toISOString())
  else q = q.in('status', [...ABERTOS])
  const termo = busca.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (termo) q = q.ilike('titulo', `%${paraIlike(termo)}%`)
  const { data, count, error } = await q.order('atualizado_em', { ascending: false }).limit(LIMITES.itensNoResultado)
  if (error) return erro('Não deu para ler os chamados agora.')
  const itens = (data ?? []).map((c) => ({
    chamado: emitir(t, 'chamado', c.id as string, `${umaLinha(String(c.codigo ?? ''), 20)} ${tituloEntreAspas(c.titulo as string)}`, `/chamados/${c.id as string}`),
    codigo: dadoDeTerceiro(c.codigo as string, 20), titulo: dadoDeTerceiro(c.titulo as string, 140),
    situacao: ehStatus(c.status) ? ROTULO_DO_STATUS[c.status] : String(c.status), atualizado: diaEHora(c.atualizado_em as string),
  }))
  return resultado({ escopo, situacao }, { chave: 'chamados', itens, total: count ?? itens.length })
}

const ROTULO_DA_INTERACAO: Record<string, string> = { comentario: 'comentário', evento: 'mudança', nota_interna: 'nota interna (só a equipe vê)' }

async function verChamado(t: TurnoDeLeitura, marcador: string): Promise<ResultadoDaLeitura> {
  const teto = semDetalhe(t)
  if (teto) return teto
  const id = t.tabela.resolver(marcador, 'chamado')
  if (!id) return desconhecido('cha', 'ler_chamados')
  const c = await carregarChamado(t.admin, t.workspaceId, id)
  if (!c) return erro('Chamado não encontrado.')
  const dele = c.solicitante_id === t.pessoa.id || c.responsavel_id === t.pessoa.id
  const papeis = t.nivel === 'amplo' ? papeisNoChamado(c, t.pessoa.id, await filasQueAtendo(t.admin, t.workspaceId, t.pessoa.id, t.pessoa.papel)) : []
  if (!dele && !papeis.length) return erro('Esse chamado não é seu; veja no Palácio.')
  contarDetalhe(t)
  // A nota interna é da equipe da fila, e só no nível amplo; no pessoal, nunca.
  const comNotas = t.nivel === 'amplo' && papeis.includes('equipe')
  let q = t.admin.from('chamado_interacoes').select('tipo, autor_id, texto, criado_em').eq('chamado_id', c.id).eq('workspace_id', t.workspaceId)
  if (!comNotas) q = q.in('tipo', ['comentario', 'evento'])
  const { data: interacoes } = await q.order('criado_em', { ascending: false }).limit(3)
  const chamado = emitir(t, 'chamado', c.id, `${umaLinha(c.codigo, 20)} ${tituloEntreAspas(c.titulo)}`, `/chamados/${c.id}`)
  const abertoPor = await marcadorDaPessoa(t, c.solicitante_id)
  const responsavel = await marcadorDaPessoa(t, c.responsavel_id)
  const ultimas = await Promise.all((interacoes ?? []).map(async (i) => ({
    tipo: ROTULO_DA_INTERACAO[i.tipo as string] ?? String(i.tipo), autor: await marcadorDaPessoa(t, i.autor_id as string | null),
    quando: diaEHora(i.criado_em as string), texto: i.texto ? dadoDeTerceiro(i.texto as string, 280) : '(mudança registrada pelo sistema)',
  })))
  return resultado({
    chamado, codigo: dadoDeTerceiro(c.codigo, 20), titulo: dadoDeTerceiro(c.titulo, 140), situacao: ROTULO_DO_STATUS[c.status] ?? c.status,
    fila: dadoDeTerceiro(c.fila.nome, 60), aberto_em: diaEHora(c.criado_em), aberto_por: abertoPor, responsavel,
    prazo_resposta: diaEHora(c.prazo_resposta), prazo_solucao: diaEHora(c.prazo_solucao), ...(c.local ? { local: dadoDeTerceiro(c.local, 140) } : {}),
    relato: dadoDeTerceiro(c.descricao, 280), ...(c.solucao ? { solucao: dadoDeTerceiro(c.solucao, 280) } : {}),
    pessoas: pessoasCitadas(t, [abertoPor, responsavel, ...ultimas.map((u) => u.autor)]),
    ultimas_interacoes: ultimas,
  })
}

async function lerFilas(t: TurnoDeLeitura): Promise<ResultadoDaLeitura> {
  const { data: filas } = await t.admin.from('chamado_filas').select('id, nome, descricao').eq('workspace_id', t.workspaceId).eq('ativa', true).order('ordem').limit(9)
  const ids = (filas ?? []).map((f) => f.id as string)
  const { data: assuntos } = ids.length
    ? await t.admin.from('chamado_categorias').select('id, nome, pede_local, fila_id').eq('workspace_id', t.workspaceId).in('fila_id', ids).eq('ativa', true).order('ordem').limit(60)
    : { data: [] }
  const itens = (filas ?? []).map((f) => ({
    fila: emitir(t, 'fila', f.id as string, umaLinha(String(f.nome ?? ''), 60), null), nome: dadoDeTerceiro(f.nome as string, 60),
    ...(f.descricao ? { descricao: dadoDeTerceiro(f.descricao as string, 120) } : {}),
    assuntos: (assuntos ?? []).filter((a) => a.fila_id === f.id).slice(0, 9).map((a) => ({
      assunto: emitir(t, 'assunto', a.id as string, umaLinha(String(a.nome ?? ''), 60), null), nome: dadoDeTerceiro(a.nome as string, 60), pede_local: Boolean(a.pede_local),
    })),
  }))
  return resultado({}, { chave: 'filas', itens })
}

async function lerAgenda(t: TurnoDeLeitura, de: string, ate: string): Promise<ResultadoDaLeitura> {
  const { itens, falhou } = await agendaDaPessoa(t.admin, t.workspaceId, t.pessoa, { de, ate })
  const ordenados = [...itens].sort((a, b) => a.dia.localeCompare(b.dia) || String(a.hora ?? '').localeCompare(String(b.hora ?? '')))
  const lista = ordenados.map((i) => {
    const [, mes, dia] = i.dia.split('-')
    return {
      dia: `${DIAS_CURTOS[diaDaSemana(i.dia)].toLowerCase()}, ${dia}/${mes}`, ...(i.hora ? { hora: i.hora } : {}), titulo: dadoDeTerceiro(i.titulo, 120),
      ...(i.detalhe ? { detalhe: dadoDeTerceiro(i.detalhe, 120) } : {}),
    }
  })
  return resultado({ de, ate, ...(falhou ? { aviso: 'Alguma camada da agenda não carregou agora.' } : {}) }, { chave: 'itens', itens: lista })
}

/** A busca de colegas: até 8 no nível amplo; no pessoal, só com a confirmação no Palácio (o plano termina lá), até 3. */
const BUSCA_DE_PESSOAS = { amplo: 8, pessoal: 3 } as const

async function buscarPessoa(t: TurnoDeLeitura, nome: string): Promise<ResultadoDaLeitura> {
  if (t.nivel !== 'amplo' && !t.noPalacio) return erro(TEXTOS_FIXOS.so_no_palacio)
  const teto = semDetalhe(t)
  if (teto) return teto
  contarDetalhe(t)
  const quadro = await quadroDePessoas(t)
  const busca = normalizar(semInvisiveis(nome))
  const achados = [...quadro.entries()]
    .filter(([id, p]) => id !== t.pessoa.id && p.ativo && (normalizar(semInvisiveis(p.nome)).includes(busca) || normalizar(p.username).replace(/ /g, '').includes(busca.replace(/ /g, ''))))
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const itens = achados.slice(0, BUSCA_DE_PESSOAS[t.nivel]).map(([id, p]) => {
    const homonimo = temHomonimo(quadro, id)
    const rotulo = rotuloDaPessoa({ nome: p.nome, username: p.username, setor: p.setor, homonimo })
    return { pessoa: emitir(t, 'pessoa', id, rotulo, null), rotulo, homonimo }
  })
  return resultado({ busca: dadoDeTerceiro(nome, 60) }, { chave: 'pessoas', itens, total: achados.length })
}

function buscarAjuda(t: TurnoDeLeitura, pergunta: string): ResultadoDaLeitura {
  const achados = buscarDuvida(pergunta, t.pessoa.papel, 3)
  for (const a of achados) if (!t.ajuda.some((x) => x.href === a.href)) t.ajuda.push({ titulo: a.titulo, href: a.href })
  if (!achados.length) return ok({ trechos: [], aviso: 'Nada na Central de ajuda com essas palavras.' })
  return resultado({}, { chave: 'trechos', itens: achados.map((a) => ({ titulo: dadoDeTerceiro(a.titulo, 120), trecho: dadoDeTerceiro(a.trecho, 280) })) })
}

/**
 * O texto de um comando fixo de área (o "status", a frota, o estoque, a portaria) como vai ao modelo: sem nenhum
 * endereço (os links vêm do código, na resposta final), cada linha como dado de terceiro (nomes de visitantes,
 * materiais e veículos foram escritos por alguém).
 */
function textoDeArea(texto: string): string {
  return semInvisiveis(texto).replace(/https?:\/\/\S+/gi, '').replace(/(^|\s)\/[a-z0-9/_?=&#.-]+/gi, '$1')
    .split('\n').map((l) => dadoDeTerceiro(l, 240)).filter(Boolean).join('\n').slice(0, LIMITES.caracteresNoResultado - 60)
}

const FORA_DO_ACESSO = 'Isso fica fora do acesso desta pessoa; só pelo Palácio.'

/**
 * Uma área do Palácio que a pessoa abre (cada uma com a permissão da tela dela, pelas mesmas funções dos comandos do
 * bot): as filas que recebem chamados e os assuntos (a antiga ler_filas_de_chamado: em qualquer nível, sem contar
 * como detalhe — abrir chamado vale até com a verificação em duas etapas), o que espera a decisão dela no Financeiro
 * (com os marcadores des_ e com_, sem valores), a frota, o saldo de um material, as visitas de hoje e, para quem
 * administra, a saúde do canal. Essas, só no nível amplo, e contam como leitura de detalhe.
 */
async function consultarArea(t: TurnoDeLeitura, area: string, busca: string): Promise<ResultadoDaLeitura> {
  if (area === 'filas_de_chamado') return lerFilas(t)
  if (t.nivel !== 'amplo') return erro(TEXTOS_FIXOS.so_no_palacio)
  const teto = semDetalhe(t)
  if (teto) return teto
  if (area === 'estoque' && busca.trim().length < 2) return erro('Diga o material em busca (2 a 80 caracteres).')
  contarDetalhe(t)
  if (area === 'whatsapp') {
    if (!ehAdministracao(t.pessoa)) return erro('Só para quem administra o espaço.')
    const config = await configDoWhatsapp(t.workspaceId)
    if (!config) return erro('O WhatsApp do Palácio não está configurado.')
    return ok({ area, status: textoDeArea(await statusDoCanal(t.admin, t.workspaceId, config, '')) })
  }
  if (area === 'financeiro') {
    if (!await podeDecidirNoFinanceiro(t.admin, t.workspaceId, t.pessoa)) return erro('Esta pessoa não decide despesas nem compras; só pelo Palácio.')
    const itens = await decisoesDaPessoa(t.admin, t.workspaceId, t.pessoa)
    if (!itens) return erro('Não deu para ler o Financeiro agora.')
    const lista = itens.slice(0, LIMITES.itensNoResultado).map((i) => ({
      item: emitir(t, i.tipo, i.id, i.tipo === 'despesa' ? `despesa ${tituloEntreAspas(i.titulo)}` : `compra ${umaLinha(i.codigo ?? '', 20)} ${tituloEntreAspas(i.titulo)}`, i.link),
      tipo: i.tipo, titulo: dadoDeTerceiro(i.titulo, 140), ...(i.codigo ? { codigo: dadoDeTerceiro(i.codigo, 20) } : {}),
      ...(i.fornecedor ? { fornecedor: dadoDeTerceiro(i.fornecedor, 80) } : {}), ...(i.quem ? { quem_pediu: dadoDeTerceiro(i.quem, 80) } : {}),
      ...(i.papel ? { etapa: i.papel === 'diretoria' ? 'Diretoria' : 'Financeiro' } : {}),
    }))
    return resultado({ area, aviso: 'Valores só no plano e no Palácio. A decisão termina sempre no Palácio.' }, { chave: 'esperando_sua_decisao', itens: lista, total: itens.length })
  }
  const texto = area === 'frota' ? await frotaAgora(t.admin, t.workspaceId, t.pessoa, '')
    : area === 'estoque' ? await saldoNoEstoque(t.admin, t.workspaceId, t.pessoa, busca, '')
      : area === 'portaria' ? await visitasDeHoje(t.admin, t.workspaceId, t.pessoa, '')
        : null
  return texto === null ? erro(FORA_DO_ACESSO) : ok({ area, texto: textoDeArea(texto) })
}

/**
 * A despesa ou a compra que espera a decisão desta pessoa agora (o preparo e a revalidação da decisão do
 * Financeiro): relida pela mesma função do comando "financeiro". null se não espera mais (ou não deu para ler).
 */
export async function decisaoDaPessoa(admin: Admin, workspaceId: string, pessoa: Pessoa, tipo: 'despesa' | 'compra', id: string) {
  const itens = await decisoesDaPessoa(admin, workspaceId, pessoa)
  const item = itens?.find((i) => i.tipo === tipo && i.id === id)
  return item ? { titulo: item.titulo, codigo: item.codigo ?? null, valor: item.valor, fornecedor: item.fornecedor, papel: item.papel ?? null } : null
}

// ------------------------------------------------------------------ o contexto do turno

/** O que os avisos do contexto apontam, lido de uma vez (aprovações, chamados e visitas), antes de classificar. */
type AlvosDosAvisos = {
  aprovacoes: Map<string, DadosDaAprovacao>
  chamados: Map<string, { id: string; codigo: string; titulo: string; status: string }>
  visitas: Map<string, { id: string; nome: string }>
  /** A visita que espera a resposta desta pessoa agora (a única). */
  esperando: string | null
}

async function alvosDosAvisos(t: TurnoDeLeitura, notificacoes: Notificacao[]): Promise<AlvosDosAvisos> {
  const alvos = notificacoes.map((n) => alvoDoLink(n.link)).filter((a): a is AlvoDoAviso => a !== null)
  const ids = (tipo: AlvoDoAviso['tipo']) => [...new Set(alvos.flatMap((a) => (a.tipo === tipo && 'id' in a ? [a.id] : [])))]
  const [aprovacoes, { data: chamados }, { data: visitas }, esperando] = await Promise.all([
    dadosDasAprovacoes(t, ids('aprovacao')),
    ids('chamado').length ? t.admin.from('chamados').select('id, codigo, titulo, status').eq('workspace_id', t.workspaceId).in('id', ids('chamado')) : Promise.resolve({ data: [] }),
    ids('visita').length
      ? t.admin.from('portaria_visitas').select('id, nome').eq('workspace_id', t.workspaceId).eq('visitado_id', t.pessoa.id).in('id', ids('visita'))
      : Promise.resolve({ data: [] }),
    ids('visita').length ? visitaEsperandoResposta(t.admin, t.workspaceId, t.pessoa.id) : Promise.resolve(null),
  ])
  return {
    aprovacoes,
    chamados: new Map((chamados ?? []).map((c) => [c.id as string, { id: c.id as string, codigo: String(c.codigo ?? ''), titulo: String(c.titulo ?? ''), status: String(c.status ?? '') }])),
    visitas: new Map((visitas ?? []).map((v) => [v.id as string, { id: v.id as string, nome: String(v.nome ?? '') }])),
    esperando: esperando?.id ?? null,
  }
}

/** O aviso de uma notificação, classificado pelo código (a aprovação pelo estado; "pedida por" de requested_by, nunca do ator). */
async function avisoNoContexto(t: TurnoDeLeitura, n: Notificacao, a: AlvosDosAvisos): Promise<AvisoNoContexto> {
  const alvo: AlvoDoAviso | null = alvoDoLink(n.link)
  const ha = haQuanto(n.created_at, t.agora)
  if (alvo?.tipo === 'aprovacao') {
    const d = a.aprovacoes.get(alvo.id)
    if (d) {
      const marcador = emitir(t, 'aprovacao', d.id, tituloEntreAspas(d.titulo), `/aprovacoes/${d.id}`) as string
      // O aviso a quem pediu é o voto de alguém (o ator do aviso, aqui, é mesmo quem votou).
      if (d.pedidaPor === t.pessoa.id) return { tipo: 'voto_na_sua', marcador, titulo: d.titulo, votante: await marcadorDaPessoa(t, n.ator_id), ha }
      const classe = d.status === 'pending' && d.meuVoto === 'pending' ? 'esperando' : d.meuVoto && d.meuVoto !== 'pending' ? 'votou' : 'encerrada'
      return { tipo: 'aprovacao', marcador, titulo: d.titulo, pedidaPor: await marcadorDaPessoa(t, d.pedidaPor), pedidaEm: diaCurto(d.criadaEm), classe, ha }
    }
  }
  if (alvo?.tipo === 'chamado') {
    const c = a.chamados.get(alvo.id)
    if (c) {
      const marcador = emitir(t, 'chamado', c.id, `${umaLinha(c.codigo, 20)} ${tituloEntreAspas(c.titulo)}`, `/chamados/${c.id}`) as string
      return { tipo: 'chamado', marcador, codigo: c.codigo, titulo: c.titulo, situacao: ehStatus(c.status) ? ROTULO_DO_STATUS[c.status] : c.status, ha }
    }
  }
  if (alvo?.tipo === 'visita') {
    const v = a.visitas.get(alvo.id)
    if (v) {
      const marcador = emitir(t, 'visita', v.id, `visita de ${umaLinha(dadoDeTerceiro(v.nome, 80), 80)}`, linkDaVisita(v.id)) as string
      return { tipo: 'visita', marcador, visitante: v.nome, esperando: a.esperando === v.id, ha }
    }
  }
  const aviso = emitir(t, 'aviso', n.id, `aviso ${tituloEntreAspas(n.title)}`, n.link ?? '/notificacoes') as string
  if (alvo?.tipo === 'mensagem') return { tipo: 'mensagem', marcador: aviso, de: await marcadorDaPessoa(t, alvo.pessoaId), previa: n.message ?? '', ha }
  return { tipo: 'outro', marcador: aviso, titulo: n.title, previa: n.message ?? '', ha }
}

type Notificacao = { id: string; title: string; message: string | null; link: string | null; created_at: string; ator_id: string | null }

/** Os avisos que saíram por estas mensagens do WhatsApp, só da pessoa. */
async function notificacoesDasSaidas(t: TurnoDeLeitura, ids: string[]): Promise<Notificacao[]> {
  if (!ids.length) return []
  const { data } = await t.admin.from('notifications').select('id, title, message, link, created_at, ator_id').eq('user_id', t.pessoa.id).in('id', ids)
  return (data ?? []) as Notificacao[]
}

/**
 * Os rótulos de marcadores que vêm da memória (a última lista, as opções da pergunta), relidos no banco a cada
 * turno — a memória guarda só o tipo e o uuid. O que não dá para reler (apagado, de outra pessoa) some da lista.
 */
async function rotulosDosMarcadores(t: TurnoDeLeitura, marcadores: string[]): Promise<ItemNoContexto[]> {
  const porTipo = new Map<TipoDeItem, string[]>()
  for (const m of marcadores) {
    const tipo = t.tabela.tipoDe(m)
    const id = tipo ? t.tabela.resolver(m, tipo) : null
    if (tipo && id) porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), id])
  }
  const ws = t.workspaceId
  const ids = (tipo: TipoDeItem) => porTipo.get(tipo) ?? []
  await Promise.all([
    (async () => {
      const d = await dadosDasAprovacoes(t, ids('aprovacao'))
      for (const a of d.values()) emitir(t, 'aprovacao', a.id, tituloEntreAspas(a.titulo), `/aprovacoes/${a.id}`)
    })(),
    (async () => {
      if (!ids('chamado').length) return
      const { data } = await t.admin.from('chamados').select('id, codigo, titulo').eq('workspace_id', ws).in('id', ids('chamado'))
      for (const c of data ?? []) emitir(t, 'chamado', c.id as string, `${umaLinha(String(c.codigo ?? ''), 20)} ${tituloEntreAspas(c.titulo as string)}`, `/chamados/${c.id as string}`)
    })(),
    Promise.all(ids('pessoa').map((id) => marcadorDaPessoa(t, id))),
    (async () => {
      if (!ids('aviso').length) return
      const { data } = await t.admin.from('notifications').select('id, title, link').eq('user_id', t.pessoa.id).in('id', ids('aviso'))
      for (const n of data ?? []) emitir(t, 'aviso', n.id as string, `aviso ${tituloEntreAspas(n.title as string)}`, (n.link as string | null) ?? '/notificacoes')
    })(),
    (async () => {
      if (!ids('visita').length) return
      const { data } = await t.admin.from('portaria_visitas').select('id, nome').eq('workspace_id', ws).eq('visitado_id', t.pessoa.id).in('id', ids('visita'))
      for (const v of data ?? []) emitir(t, 'visita', v.id as string, `visita de ${umaLinha(dadoDeTerceiro(v.nome as string, 80), 80)}`, linkDaVisita(v.id as string))
    })(),
    (async () => {
      if (!ids('fila').length) return
      const { data } = await t.admin.from('chamado_filas').select('id, nome').eq('workspace_id', ws).in('id', ids('fila'))
      for (const f of data ?? []) emitir(t, 'fila', f.id as string, umaLinha(String(f.nome ?? ''), 60), null)
    })(),
    (async () => {
      if (!ids('assunto').length) return
      const { data } = await t.admin.from('chamado_categorias').select('id, nome').eq('workspace_id', ws).in('id', ids('assunto'))
      for (const a of data ?? []) emitir(t, 'assunto', a.id as string, umaLinha(String(a.nome ?? ''), 60), null)
    })(),
  ])
  return marcadores.filter((m) => t.itens[m]).map((m) => ({ marcador: m, rotulo: t.itens[m].rotulo }))
}

/** Os rótulos das opções de uma pergunta (escritos pelo código, a partir do banco); a opção que não dá para reler fica de fora. */
export const rotulosDasOpcoes = (t: TurnoDeLeitura, marcadores: string[]) => rotulosDosMarcadores(t, marcadores)

/** As linhas do plano em revisão, com marcadores (o texto que vai sair entra curto e saneado). */
async function linhasDoPlanoEmRevisao(t: TurnoDeLeitura, passos: Passo[]): Promise<string[]> {
  return Promise.all(passos.map(async (p) => {
    if (p.acao === 'votar') return `votar ${p.decisao === 'approved' ? 'aprovado' : 'pedir ajustes'} [${emitir(t, 'aprovacao', p.aprovacaoId, tituloEntreAspas(p.titulo), `/aprovacoes/${p.aprovacaoId}`)}]`
    if (p.acao === 'mensagem_direta') return `mensagem para [${await marcadorDaPessoa(t, p.paraId) ?? 'alguém'}]: “${dadoDeTerceiro(p.texto, 200)}”`
    if (p.acao === 'comentar_chamado') return `comentar no chamado [${emitir(t, 'chamado', p.chamadoId, `${umaLinha(p.codigo, 20)} ${tituloEntreAspas(p.titulo)}`, `/chamados/${p.chamadoId}`)}]: “${dadoDeTerceiro(p.texto, 200)}”`
    if (p.acao === 'abrir_chamado') return `abrir chamado em [${emitir(t, 'fila', p.filaId, p.filaNome, null)}] · [${emitir(t, 'assunto', p.categoriaId, p.categoriaNome, null)}], urgência ${p.urgencia}: “${dadoDeTerceiro(p.relato, 200)}”`
    if (p.acao === 'responder_visita') return `responder à portaria [${emitir(t, 'visita', p.visitaId, `visita de ${p.visitante}`, linkDaVisita(p.visitaId))}]: ${p.resposta}`
    if (p.acao === 'responder_chat') return `responder no canal #${dadoDeTerceiro(p.canalNome, 60)}: “${dadoDeTerceiro(p.texto, 200)}”`
    if (p.acao === 'atender_chamado') {
      const chamado = `[${emitir(t, 'chamado', p.chamadoId, `${umaLinha(p.codigo, 20)} ${tituloEntreAspas(p.titulo)}`, `/chamados/${p.chamadoId}`)}]`
      if (p.tipo === 'assumir') return `assumir o chamado ${chamado}`
      if (p.tipo === 'resolver') return `resolver o chamado ${chamado}: “${dadoDeTerceiro(p.nota, 200)}”`
      return `transferir o chamado ${chamado} para [${p.filaId ? emitir(t, 'fila', p.filaId, p.filaNome ?? '', null) : '?'}] · [${p.categoriaId ? emitir(t, 'assunto', p.categoriaId, p.categoriaNome ?? '', null) : '?'}]: “${dadoDeTerceiro(p.nota, 200)}”`
    }
    if (p.acao === 'registrar_visita') return `registrar a visita de “${dadoDeTerceiro(p.visitante, 80)}” para [${await marcadorDaPessoa(t, p.visitadoId) ?? 'alguém'}]${p.motivo ? `: “${dadoDeTerceiro(p.motivo, 200)}”` : ''}`
    if (p.acao === 'decidir_financeiro') {
      const item = emitir(t, p.tipo, p.itemId, `${p.tipo} ${tituloEntreAspas(p.titulo)}`, p.tipo === 'despesa' ? `/financeiro/${p.itemId}` : `/financeiro/compras/${p.itemId}`)
      return `${p.decisao} [${item}]${p.decisao === 'recusar' ? `: “${dadoDeTerceiro(p.motivo, 200)}”` : ''}`
    }
    if (p.acao === 'guardar_no_drive') return `guardar no Drive o documento “${dadoDeTerceiro(p.nome, 120)}” em ${dadoDeTerceiro(p.partes.join('/'), 200)}`
    return `marcar como lidos ${p.avisoIds === 'todos' ? 'todos os avisos' : `${p.quantos} aviso(s)`}`
  }))
}

/**
 * O contexto do turno, lido no banco a cada mensagem (nada da conversa fica guardado): os avisos que chegaram à
 * pessoa pelo WhatsApp nas últimas 24 h (classificados), a mensagem citada, a última lista (ou a lista citada),
 * o plano em revisão ou a pergunta aberta (com a escolha), as pessoas citadas com o rótulo e o documento que espera
 * a pasta do Drive (com os setores onde ela guarda).
 */
export async function dadosDoContexto(t: TurnoDeLeitura, p: {
  texto: string; citada: string | null
  memoria: { ordem: string[]; listas: { m: string; r: string[] }[] }
  plano: { situacao: string; passos: Passo[]; opcoes: string[]; pedidoEmAberto: string | null } | null
  escolha: string | null
}): Promise<DadosDoContexto> {
  const desde = new Date(t.agora - 24 * 3_600_000).toISOString()
  const [{ data: saidas }, citadaSaida] = await Promise.all([
    t.admin.from('whatsapp_mensagens').select('notificacao_id').eq('workspace_id', t.workspaceId).eq('user_id', t.pessoa.id).eq('direcao', 'saida')
      .not('notificacao_id', 'is', null).gte('criado_em', desde).order('criado_em', { ascending: false }).limit(16),
    p.citada
      ? t.admin.from('whatsapp_mensagens').select('notificacao_id').eq('workspace_id', t.workspaceId).eq('direcao', 'saida').eq('mensagem_id', p.citada).eq('user_id', t.pessoa.id)
        .not('notificacao_id', 'is', null).limit(1).maybeSingle().then((r) => (r.data?.notificacao_id as string | undefined) ?? null)
      : Promise.resolve(null),
    quadroDePessoas(t),
  ])
  const ids = [...new Set((saidas ?? []).map((s) => s.notificacao_id as string))].slice(0, 8)
  const notificacoes = await notificacoesDasSaidas(t, [...new Set([...ids, ...(citadaSaida ? [citadaSaida] : [])])])
  const alvos = await alvosDosAvisos(t, notificacoes)
  // Em ordem (o mais recente primeiro): os marcadores saem sempre na mesma numeração.
  const recentes = notificacoes.filter((n) => ids.includes(n.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const avisos: AvisoNoContexto[] = []
  for (const n of recentes) avisos.push(await avisoNoContexto(t, n, alvos))
  const citadaNotificacao = citadaSaida ? notificacoes.find((n) => n.id === citadaSaida) : null
  const citada = citadaNotificacao ? await avisoNoContexto(t, citadaNotificacao, alvos) : null

  // A lista citada (a mensagem de uma lista) vale mais que a última.
  const listaCitada = p.citada ? p.memoria.listas.find((l) => l.m === p.citada)?.r ?? null : null
  const ultimaLista = await rotulosDosMarcadores(t, listaCitada ?? p.memoria.ordem)

  let pergunta: DadosDoContexto['pergunta'] = null
  let planoEmRevisao: string[] | null = null
  if (p.plano?.situacao === 'pergunta') {
    pergunta = { opcoes: await rotulosDosMarcadores(t, p.plano.opcoes), pedidoEmAberto: p.plano.pedidoEmAberto, escolheu: p.escolha }
  } else if (p.plano?.situacao === 'em_revisao' && p.plano.passos.length) {
    planoEmRevisao = await linhasDoPlanoEmRevisao(t, p.plano.passos)
  }

  // O documento que espera a pasta do Drive (a pergunta do bot, ou o documento que veio com a legenda para cá).
  const doc = await documentoEsperando(t.admin, t.workspaceId, t.pessoa.id)
  const ondeGuarda = doc ? await quemGuarda(t.admin, t.workspaceId, t.pessoa) : null
  const documento = doc && ondeGuarda
    ? { nome: doc.nome, tipo: doc.tipo, tamanho: tamanhoLegivel(doc.tamanho), setores: [...ondeGuarda.setores], administra: ondeGuarda.administra }
    : null

  const pessoas = Object.entries(t.itens).filter(([m]) => m.startsWith('pes_')).map(([marcador, i]) => ({ marcador, rotulo: i.rotulo }))
  return { avisos, pessoas, ultimaLista, planoEmRevisao, pergunta, citada, documento, mensagem: p.texto }
}
