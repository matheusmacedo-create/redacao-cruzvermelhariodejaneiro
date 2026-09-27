import 'server-only'

import { del, put } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { caminhoDaFotoDoVisitante, ehTokenDaEntrada } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/** O espaço da filial e o segredo do QR: o autocadastro só vale com o segredo do cartaz em vigor. */
export async function espacoDaEntrada(token: unknown, admin: Admin = createAdminClient()): Promise<string | null> {
  if (!ehTokenDaEntrada(token)) return null
  const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
  if (!ws) return null
  const { data: c } = await admin.from('portaria_config').select('token').eq('workspace_id', ws.id).maybeSingle()
  return c?.token === token ? (ws.id as string) : null
}

/** Quem pode ser visitado: as pessoas ativas do Palácio (a equipe da Escola também recebe visita). */
export async function pessoasParaVisitar(workspaceId: string, admin: Admin = createAdminClient()): Promise<{ id: string; nome: string; setor: string | null }[]> {
  const { data } = await admin.from('workspace_members').select('user_id,coordination,profiles(full_name,active)').eq('workspace_id', workspaceId)
  return ((data ?? []) as unknown as { user_id: string; coordination: string | null; profiles: { full_name: string | null; active: boolean | null } | null }[])
    .filter((m) => m.profiles && m.profiles.active !== false && m.profiles.full_name?.trim())
    .map((m) => ({ id: m.user_id, nome: m.profiles!.full_name!.trim(), setor: m.coordination }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Avisa quem é visitado (sino e, conforme a preferência, e-mail). Nunca lança. */
export async function avisarVisitado(v: { workspaceId: string; visitadoId: string | null; nome: string; empresa: string | null; motivo: string | null }, atorId: string | null) {
  if (!v.visitadoId) return
  await notificar(createAdminClient(), {
    workspaceId: v.workspaceId, para: [v.visitadoId], atorId, categoria: 'portaria',
    titulo: `${v.nome} chegou para falar com você`,
    mensagem: [v.empresa ? `De ${v.empresa}.` : '', v.motivo ?? ''].filter(Boolean).join(' ').slice(0, 280) || 'O visitante está na portaria.',
    link: '/portaria', botao: 'Ver na Portaria',
  })
}

/** Grava a foto no Blob privado e devolve o caminho; quem chama registra no banco. */
export async function guardarFotoDoVisitante(workspaceId: string, visitaId: string, bytes: Uint8Array): Promise<string> {
  const blob = await put(caminhoDaFotoDoVisitante(workspaceId, visitaId, crypto.randomUUID()), Buffer.from(bytes), { access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' })
  return blob.pathname
}

/** Apagar o arquivo é melhor esforço: o banco já não aponta para ele. */
export async function apagarFotoDoVisitante(caminho: string | null | undefined) {
  if (!caminho || !caminho.startsWith('portaria/')) return
  try {
    await del(caminho)
  } catch (causa) {
    console.error('[portaria] não foi possível apagar a foto do Blob:', causa instanceof Error ? causa.message : causa)
  }
}
