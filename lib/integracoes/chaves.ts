import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * As chaves das ferramentas externas, num lugar só.
 *
 * A fonte principal é o Vault do Supabase (tela Configurações → Integrações),
 * gravado e lido só por funções restritas a admin. A variável de ambiente da
 * Vercel continua valendo como reserva: quem já tinha configurado por lá não
 * precisa fazer nada.
 *
 * O valor decifrado nunca sai deste módulo para o navegador — só é usado em
 * código de servidor, na chamada à ferramenta.
 */

export const SERVICOS = {
  hunter: { nome: 'Hunter.io', variavel: 'HUNTER_API_KEY', painel: 'https://hunter.io/api-keys' },
} as const

export type Servico = keyof typeof SERVICOS

export function ehServico(valor: string): valor is Servico {
  return Object.prototype.hasOwnProperty.call(SERVICOS, valor)
}

/**
 * A chave do serviço: Vault primeiro, ambiente depois; null se não houver.
 *
 * Lê com a service role — a função do banco só aceita ela. Quem chama TEM de
 * ter conferido antes que a pessoa é membro de `workspaceId`
 * (requireWorkspace): aqui não há mais sessão para o banco conferir.
 */
export async function obterChave(workspaceId: string, servico: Servico): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc('chave_de_integracao', { p_workspace_id: workspaceId, p_servico: servico })
  const doCofre = !error && typeof data === 'string' ? data.trim() : ''
  if (doCofre) return doCofre
  return process.env[SERVICOS[servico].variavel]?.trim() || null
}

export type SituacaoDaChave = {
  servico: Servico
  nome: string
  origem: 'cofre' | 'ambiente' | null
  atualizadaEm: string | null
}

/** O que está configurado, sem nunca tocar no valor. */
export async function situacaoDasChaves(supabase: SupabaseClient, workspaceId: string): Promise<SituacaoDaChave[]> {
  const { data } = await supabase
    .from('integracoes_chaves')
    .select('servico, updated_at')
    .eq('workspace_id', workspaceId)
  const noCofre = new Map((data ?? []).map((l) => [l.servico as string, l.updated_at as string]))

  return (Object.keys(SERVICOS) as Servico[]).map((servico) => {
    const atualizadaEm = noCofre.get(servico) ?? null
    const noAmbiente = Boolean(process.env[SERVICOS[servico].variavel]?.trim())
    return {
      servico,
      nome: SERVICOS[servico].nome,
      origem: atualizadaEm ? 'cofre' : noAmbiente ? 'ambiente' : null,
      atualizadaEm,
    }
  })
}
