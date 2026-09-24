import 'server-only'

import { cache } from 'react'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * A sessão do voluntário na área do membro. Não é o login da equipe: o
 * navegador guarda só um token aleatório (cookie httpOnly) e o banco, o
 * sha-256 dele (membro_sessoes). Toda leitura da área do membro passa por
 * aqui e usa só o participante da sessão — nunca um id vindo do navegador.
 */

export const COOKIE_DO_MEMBRO = 'cvrj_membro'
export const DIAS_DE_SESSAO = 30

export const hashDoToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
export const novoToken = () => randomBytes(32).toString('base64url')
const tokenNoFormato = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t)

export type Membro = { participanteId: string; workspaceId: string; nome: string; email: string | null; tokenHash: string }

/** A sessão atual, ou null. Uma consulta por requisição. */
export const sessaoDoMembro = cache(async (): Promise<Membro | null> => {
  const token = (await cookies()).get(COOKIE_DO_MEMBRO)?.value
  if (!token || !tokenNoFormato(token)) return null
  const tokenHash = hashDoToken(token)
  let linha: { participante_id: string; workspace_id: string; nome: string; email: string | null } | undefined
  try {
    const { data, error } = await createAdminClient().rpc('membro_sessao', { p_token_hash: tokenHash })
    if (error) throw new Error(error.message)
    linha = (Array.isArray(data) ? data[0] : data) ?? undefined
  } catch (causa) {
    // Banco fora do ar ou sem configuração: trata como sem sessão (vai para a
    // entrada), em vez de derrubar a página.
    console.error('[membro] falha ao ler a sessão:', causa instanceof Error ? causa.message : causa)
    return null
  }
  if (!linha) return null
  return { participanteId: linha.participante_id, workspaceId: linha.workspace_id, nome: linha.nome, email: linha.email, tokenHash }
})

export async function exigirMembro(): Promise<Membro> {
  const m = await sessaoDoMembro()
  if (!m) redirect('/membro/entrar')
  return m
}
