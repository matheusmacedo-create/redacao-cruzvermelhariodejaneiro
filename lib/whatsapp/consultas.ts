import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerCamadas, type ItemDaAgenda } from '@/lib/agenda/camadas'
import { camadasDisponiveis, itensDaAgenda } from '@/lib/agenda/fontes'
import { ABERTOS } from '@/lib/chamados/regras'
import { ehPapel } from '@/lib/permissoes'
import type { Pessoa } from './acoes'

type Admin = ReturnType<typeof createAdminClient>

/**
 * As consultas do WhatsApp que devolvem DADOS (não texto): o bot formata com as funções de regras.ts, e o
 * assistente (lib/whatsapp/assistente) monta o contexto e as leituras com os mesmos dados. Ficar aqui, e não em
 * bot.ts, evita import circular entre o bot e o assistente.
 *
 * O cliente é o de serviço (não há sessão no WhatsApp), então cada consulta filtra pela pessoa e pelo espaço, e
 * a agenda passa pelo mesmo crivo de acesso do resumo semanal por e-mail (camadasDisponiveis com semSessao).
 */

/** A pessoa ativa, membro deste espaço; null para o resto (conta desativada vira "número desconhecido"). */
export async function pessoaDoEspaco(admin: Admin, workspaceId: string, userId: string): Promise<Pessoa | null> {
  const { data } = await admin.from('workspace_members').select('user_id, role, profiles(full_name, active)').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
  const perfil = (Array.isArray(data?.profiles) ? data?.profiles[0] : data?.profiles) as { full_name?: string | null; active?: boolean } | null | undefined
  if (!data || !perfil || perfil.active === false || !ehPapel(data.role)) return null
  return { id: userId, nome: perfil.full_name ?? null, papel: data.role }
}

/** Os itens da agenda da pessoa no intervalo, com as camadas que ela deixou ligadas na Agenda. `falhou`: alguma camada não carregou. */
export async function agendaDaPessoa(admin: Admin, workspaceId: string, pessoa: Pessoa, janela: { de: string; ate: string }): Promise<{ itens: ItemDaAgenda[]; falhou: boolean }> {
  const [disponiveis, { data: preferencias }] = await Promise.all([
    camadasDisponiveis(admin, workspaceId, pessoa.id, pessoa.papel, { semSessao: true }),
    admin.from('agenda_preferencias').select('camadas_ocultas').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle(),
  ])
  const ocultas = lerCamadas(preferencias?.camadas_ocultas)
  const { itens, falhas } = await itensDaAgenda(admin, workspaceId, pessoa.id, janela, [...disponiveis].filter((c) => !ocultas.includes(c)))
  return { itens, falhou: falhas.length > 0 }
}

export type AvisoDaPessoa = { id: string; titulo: string; mensagem: string; link: string | null; criadoEm: string; lido: boolean }

/** Os avisos do sino da pessoa, mais novos primeiro, e o total (dos não lidos, com `soNaoLidos`). */
export async function avisosDaPessoa(admin: Admin, workspaceId: string, userId: string, p: { soNaoLidos?: boolean; limite: number }): Promise<{ avisos: AvisoDaPessoa[]; total: number }> {
  const soNaoLidos = p.soNaoLidos ?? true
  let lista = admin.from('notifications').select('id, title, message, link, created_at, read_at').eq('user_id', userId).eq('workspace_id', workspaceId)
  let contagem = admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('workspace_id', workspaceId)
  if (soNaoLidos) {
    lista = lista.is('read_at', null)
    contagem = contagem.is('read_at', null)
  }
  const [{ data: avisos }, { count: total }] = await Promise.all([lista.order('created_at', { ascending: false }).limit(p.limite), contagem])
  return {
    avisos: (avisos ?? []).map((a) => ({
      id: a.id as string, titulo: a.title as string, mensagem: (a.message as string) ?? '', link: (a.link as string | null) ?? null,
      criadoEm: a.created_at as string, lido: Boolean(a.read_at),
    })),
    total: total ?? 0,
  }
}

export type AprovacaoDaPessoa = { id: string; contentId: string; titulo: string; pedidaPor: string | null; criadaEm: string }

/** Os títulos das matérias, pelos ids (sem título: "Matéria sem título", como as listas do bot). */
async function titulosDasMaterias(admin: Admin, pecas: string[]): Promise<Map<string, string>> {
  const { data: titulos } = pecas.length ? await admin.from('content_pieces').select('id, title').in('id', pecas) : { data: [] }
  return new Map((titulos ?? []).map((t) => [t.id as string, (t.title as string | null)?.trim() || 'Matéria sem título']))
}

/** As rodadas de aprovação em aberto em que o voto da pessoa ainda falta, mais novas primeiro; null se não deu para ler. */
export async function aprovacoesPendentes(admin: Admin, workspaceId: string, userId: string, p: { limite: number }): Promise<{ aprovacoes: AprovacaoDaPessoa[]; total: number } | null> {
  const { data: votos, error } = await admin.from('approval_voters').select('approval_id').eq('workspace_id', workspaceId).eq('user_id', userId).eq('decision', 'pending').limit(200)
  if (error) return null
  const ids = [...new Set((votos ?? []).map((v) => v.approval_id as string))]
  if (!ids.length) return { aprovacoes: [], total: 0 }
  const { data: abertas } = await admin.from('approvals').select('id, content_id, requested_by, created_at').eq('workspace_id', workspaceId).eq('status', 'pending').in('id', ids)
    .order('created_at', { ascending: false })
  const lista = abertas ?? []
  const mostrar = lista.slice(0, p.limite)
  const tituloDe = await titulosDasMaterias(admin, [...new Set(mostrar.map((a) => a.content_id as string))])
  return {
    aprovacoes: mostrar.map((a) => ({
      id: a.id as string, contentId: a.content_id as string, titulo: tituloDe.get(a.content_id as string) ?? 'Matéria sem título',
      pedidaPor: (a.requested_by as string | null) ?? null, criadaEm: a.created_at as string,
    })),
    total: lista.length,
  }
}

/** As rodadas em aberto que a pessoa pediu, com quantos votos já vieram de quantos; null se não deu para ler. */
export async function aprovacoesQuePedi(admin: Admin, workspaceId: string, userId: string, p: { limite: number }): Promise<{ aprovacoes: (AprovacaoDaPessoa & { votos: { dados: number; total: number } })[]; total: number } | null> {
  const { data: abertas, error } = await admin.from('approvals').select('id, content_id, requested_by, created_at').eq('workspace_id', workspaceId).eq('requested_by', userId)
    .eq('status', 'pending').order('created_at', { ascending: false }).limit(200)
  if (error) return null
  const lista = abertas ?? []
  const mostrar = lista.slice(0, p.limite)
  const ids = mostrar.map((a) => a.id as string)
  const [tituloDe, { data: votantes }] = await Promise.all([
    titulosDasMaterias(admin, [...new Set(mostrar.map((a) => a.content_id as string))]),
    ids.length ? admin.from('approval_voters').select('approval_id, decision').in('approval_id', ids) : Promise.resolve({ data: [] as { approval_id: string; decision: string }[] }),
  ])
  const contagem = new Map<string, { dados: number; total: number }>()
  for (const v of votantes ?? []) {
    const c = contagem.get(v.approval_id as string) ?? { dados: 0, total: 0 }
    c.total++
    if (v.decision !== 'pending') c.dados++
    contagem.set(v.approval_id as string, c)
  }
  return {
    aprovacoes: mostrar.map((a) => ({
      id: a.id as string, contentId: a.content_id as string, titulo: tituloDe.get(a.content_id as string) ?? 'Matéria sem título',
      pedidaPor: (a.requested_by as string | null) ?? null, criadaEm: a.created_at as string, votos: contagem.get(a.id as string) ?? { dados: 0, total: 0 },
    })),
    total: lista.length,
  }
}

export type ChamadoDaPessoa = { id: string; codigo: string; titulo: string; status: string; solicitanteId: string | null; responsavelId: string | null; atualizadoEm: string }

/** Os chamados abertos que a pessoa abriu ou que estão com ela, mais recentes primeiro, e o total; null se não deu para ler. */
export async function chamadosDaPessoa(admin: Admin, workspaceId: string, userId: string, p: { limite: number }): Promise<{ chamados: ChamadoDaPessoa[]; total: number } | null> {
  const deQuem = `solicitante_id.eq.${userId},responsavel_id.eq.${userId}`
  const [{ data, error }, { count }] = await Promise.all([
    admin.from('chamados').select('id, codigo, titulo, status, solicitante_id, responsavel_id, atualizado_em').eq('workspace_id', workspaceId).or(deQuem).in('status', [...ABERTOS])
      .order('atualizado_em', { ascending: false }).limit(p.limite),
    admin.from('chamados').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).or(deQuem).in('status', [...ABERTOS]),
  ])
  if (error) return null
  return {
    chamados: (data ?? []).map((c) => ({
      id: c.id as string, codigo: (c.codigo as string) || 'Chamado', titulo: (c.titulo as string) ?? '', status: c.status as string,
      solicitanteId: (c.solicitante_id as string | null) ?? null, responsavelId: (c.responsavel_id as string | null) ?? null, atualizadoEm: c.atualizado_em as string,
    })),
    total: count ?? data?.length ?? 0,
  }
}
