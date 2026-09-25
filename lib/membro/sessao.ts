import 'server-only'

import { cache } from 'react'
import { createHash, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { CABECALHO_DO_CAMINHO, COOKIE_DO_MEMBRO, tokenNoFormato } from './entrada'
import { urlDaEntrada } from './regras'

/**
 * A sessão do voluntário na área do membro. Não é o login da equipe: o
 * navegador guarda só um token aleatório (cookie httpOnly) e o banco, o
 * sha-256 dele (membro_sessoes). Toda leitura da área do membro passa por
 * aqui e usa só o participante da sessão — nunca um id vindo do navegador.
 */

// O nome e o prazo do cookie moram em ./entrada, que o proxy também usa (sem 'server-only').
export { COOKIE_DO_MEMBRO, DIAS_DE_SESSAO } from './entrada'

export const hashDoToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
export const novoToken = () => randomBytes(32).toString('base64url')

export const COOKIE_DA_PREVIA = 'cvrj_membro_previa'
/** Participante que não existe: a prévia geral vê o conteúdo publicado e nenhum dado pessoal. */
export const NINGUEM = '00000000-0000-0000-0000-000000000000'

export type Previa = { como: 'geral' | 'voluntario'; quem: string; voltar: string }
export type Membro = { participanteId: string; workspaceId: string; nome: string; email: string | null; tokenHash: string; previa?: Previa }

/**
 * Modo de visualização: alguém da equipe vendo a área como um voluntário.
 * O cookie só diz o que se quer ver; a permissão é conferida a cada
 * requisição na sessão da equipe (nível do Voluntariado: 1 para a prévia
 * geral, 2 para ver como um voluntário específico).
 */
async function sessaoDePrevia(valor: string): Promise<Membro | null> {
  const { nivelDeParticipantesSemRedirecionar } = await import('@/lib/participantes/acesso')
  const equipe = await nivelDeParticipantesSemRedirecionar().catch(() => null)
  if (!equipe || equipe.nivel < 1) return null
  if (valor === 'geral') {
    return { participanteId: NINGUEM, workspaceId: equipe.workspaceId, nome: 'Voluntário', email: null, tokenHash: '', previa: { como: 'geral', quem: equipe.nome, voltar: '/voluntariado' } }
  }
  if (!/^[0-9a-f-]{36}$/.test(valor) || equipe.nivel < 2) return null
  const { data } = await createAdminClient().from('participantes').select('id,nome,nome_social,email,workspace_id,anonimizado_em')
    .eq('id', valor).eq('workspace_id', equipe.workspaceId).maybeSingle()
  if (!data || data.anonimizado_em) return null
  return {
    participanteId: data.id as string, workspaceId: data.workspace_id as string, nome: (data.nome_social || data.nome) as string, email: data.email as string | null,
    tokenHash: '', previa: { como: 'voluntario', quem: equipe.nome, voltar: `/voluntariado/${data.id}` },
  }
}

/** A sessão atual, ou null. Uma consulta por requisição. */
export const sessaoDoMembro = cache(async (): Promise<Membro | null> => {
  const jar = await cookies()
  const previa = jar.get(COOKIE_DA_PREVIA)?.value
  if (previa) {
    const m = await sessaoDePrevia(previa)
    if (m) return m
  }
  const token = jar.get(COOKIE_DO_MEMBRO)?.value
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

/**
 * Sem sessão, vai para a entrada levando o caminho pedido (`?voltar=`), para
 * a pessoa cair de volta onde estava depois do código. O caminho vem do
 * cabeçalho que o proxy põe em /membro; `urlDaEntrada` confere de novo que
 * é da própria área. Sem o cabeçalho, é a entrada simples de antes.
 */
export async function exigirMembro(): Promise<Membro> {
  const m = await sessaoDoMembro()
  if (!m) redirect(urlDaEntrada((await headers()).get(CABECALHO_DO_CAMINHO)))
  return m
}

/** Para as ações que gravam: no modo de visualização, nada é gravado. */
export async function exigirMembroQueEscreve(): Promise<Membro> {
  const m = await exigirMembro()
  if (m.previa) throw new Error('Você está no modo de visualização: nada é gravado em nome do voluntário.')
  return m
}
