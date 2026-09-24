import 'server-only'
import { head } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { pode, type Papel } from '@/lib/permissoes'
import { urlBase } from '@/lib/newsletter/contexto'
import { notificar } from '@/lib/notificacoes/servidor'
import { slaDaFila, type Quem, type Sla, type Status } from './regras'

type Admin = ReturnType<typeof createAdminClient>

// ------------------------------------------------------------------ anexos

/** Foto do defeito, print do erro, PDF, planilha, vídeo curto. */
export const ANEXO_LIMITE = 25 * 1024 * 1024
export const ANEXO_TIPOS = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4', 'video/quicktime',
])
export const MAX_ANEXOS_POR_ENVIO = 6
export const prefixoDeAnexos = (workspaceId: string) => `workspaces/${workspaceId}/chamados/`

export type AnexoPedido = { pathname: string; nome: string }

/**
 * Confere e registra anexos já enviados ao Blob pelo navegador. O caminho
 * vem do cliente: só vale dentro da pasta de chamados do espaço, e o tamanho
 * e o tipo são os que o Blob diz ter gravado, não os que a tela declarou.
 */
export async function registrarAnexos(admin: Admin, p: { workspaceId: string; chamadoId: string; interacaoId: string | null; autorId: string; interno: boolean; anexos: AnexoPedido[] }) {
  const prefixo = prefixoDeAnexos(p.workspaceId)
  const linhas = []
  for (const a of p.anexos.slice(0, MAX_ANEXOS_POR_ENVIO)) {
    if (!a.pathname.startsWith(prefixo) || a.pathname.includes('..')) throw new Error('Anexo inválido.')
    const meta = await head(a.pathname).catch(() => null)
    if (!meta) throw new Error('Um dos anexos não chegou ao armazenamento. Envie de novo.')
    if (meta.size > ANEXO_LIMITE || !ANEXO_TIPOS.has(meta.contentType)) throw new Error('Tipo ou tamanho de anexo não permitido.')
    linhas.push({
      workspace_id: p.workspaceId, chamado_id: p.chamadoId, interacao_id: p.interacaoId,
      nome: (a.nome || a.pathname.split('/').pop() || 'anexo').slice(0, 200), content_type: meta.contentType,
      tamanho: meta.size, storage_path: a.pathname, interno: p.interno, enviado_por: p.autorId,
    })
  }
  if (!linhas.length) return
  const { error } = await admin.from('chamado_anexos').insert(linhas)
  if (error) throw new Error('Não foi possível registrar os anexos.')
}

export function lerAnexos(formData: FormData): AnexoPedido[] {
  try {
    const bruto = JSON.parse(String(formData.get('anexos') ?? '[]'))
    if (!Array.isArray(bruto)) return []
    return bruto.filter((a) => a && typeof a.pathname === 'string').map((a) => ({ pathname: String(a.pathname), nome: String(a.nome ?? '') }))
  } catch {
    return []
  }
}

// ------------------------------------------------------------------ quem atende

/** As filas que esta pessoa atende. Admin atende todas. */
export async function filasQueAtendo(admin: Admin, workspaceId: string, userId: string, papel: Papel): Promise<Set<string>> {
  if (pode(papel, 'chamados.ver_todos')) {
    const { data } = await admin.from('chamado_filas').select('id').eq('workspace_id', workspaceId)
    return new Set((data ?? []).map((f) => f.id as string))
  }
  const { data } = await admin.from('chamado_fila_membros').select('fila_id').eq('workspace_id', workspaceId).eq('user_id', userId)
  return new Set((data ?? []).map((f) => f.fila_id as string))
}

/** Quem atende a fila (para avisar de chamado novo). Sem equipe, os admins. */
export async function equipeDaFila(admin: Admin, workspaceId: string, filaId: string): Promise<string[]> {
  const { data } = await admin.from('chamado_fila_membros').select('user_id, profiles(active)').eq('fila_id', filaId)
  const ativos = (data ?? []).filter((m) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles as { active?: boolean } | null)?.active !== false).map((m) => m.user_id as string)
  if (ativos.length) return ativos
  const { data: admins } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin')
  return (admins ?? []).map((a) => a.user_id as string)
}

// ------------------------------------------------------------------ o chamado

export type ChamadoCarregado = {
  id: string; workspace_id: string; fila_id: string; categoria_id: string | null; numero: number; codigo: string
  tipo: 'incidente' | 'solicitacao'; titulo: string; descricao: string; local: string | null
  urgencia: 1 | 2 | 3; impacto: 1 | 2 | 3; prioridade: 'baixa' | 'media' | 'alta' | 'critica'; status: Status
  solicitante_id: string | null; responsavel_id: string | null
  prazo_resposta: string | null; prazo_solucao: string | null; respondido_em: string | null; pausado_desde: string | null
  minutos_pausados: number; resolvido_em: string | null; fechado_em: string | null; solucao: string | null
  avaliacao: number | null; reaberturas: number; criado_em: string
  fila: { id: string; nome: string; prefixo: string; slug: string; sla: Sla; atendimento24h: boolean }
}

export async function carregarChamado(admin: Admin, workspaceId: string, id: string): Promise<ChamadoCarregado | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await admin.from('chamados')
    .select('*, chamado_filas(id, nome, prefixo, slug, sla, atendimento_24h)')
    .eq('workspace_id', workspaceId).eq('id', id).maybeSingle()
  if (!data) return null
  const f = (Array.isArray(data.chamado_filas) ? data.chamado_filas[0] : data.chamado_filas) as { id: string; nome: string; prefixo: string; slug: string; sla: unknown; atendimento_24h: boolean }
  const { chamado_filas: _, ...resto } = data
  return { ...(resto as Omit<ChamadoCarregado, 'fila'>), fila: { id: f.id, nome: f.nome, prefixo: f.prefixo, slug: f.slug, sla: slaDaFila(f.sla), atendimento24h: f.atendimento_24h } }
}

export function papeisNoChamado(c: { solicitante_id: string | null; fila_id: string }, userId: string, atendo: Set<string>): Quem[] {
  const papeis: Quem[] = []
  if (atendo.has(c.fila_id)) papeis.push('equipe')
  if (c.solicitante_id === userId) papeis.push('solicitante')
  return papeis
}

// ------------------------------------------------------------------ avisos

export const urlDoChamado = (id: string) => `${urlBase()}/chamados/${id}`

/**
 * Avisa pelo sino da Redação e por e-mail (só e-mail de recuperação
 * confirmado). Nunca avisa quem fez a ação, e nunca lança: aviso que falha
 * não desfaz o que já foi feito.
 */
export async function avisarSobreChamado(admin: Admin, p: {
  workspaceId: string; chamado: { id: string; codigo: string; titulo: string }; para: (string | null | undefined)[]; atorId: string
  titulo: string; mensagem: string; citacao?: string | null; botao?: string
}) {
  await notificar(admin, {
    workspaceId: p.workspaceId,
    para: p.para,
    atorId: p.atorId,
    categoria: 'chamados',
    titulo: `${p.chamado.codigo} · ${p.titulo}`,
    mensagem: p.mensagem,
    textoDoEmail: `${p.mensagem} (${p.chamado.codigo} — ${p.chamado.titulo})`,
    citacao: p.citacao,
    link: `/chamados/${p.chamado.id}`,
    botao: p.botao ?? 'Abrir o chamado',
    nota: 'Responda pela Redação, no próprio chamado: respostas a este e-mail não entram no atendimento.',
  })
}
