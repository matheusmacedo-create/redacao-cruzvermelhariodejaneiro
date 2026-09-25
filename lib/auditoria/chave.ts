import 'server-only'
import { generateKeyPairSync } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { chaveDaTrilha, lerChave, type ChaveDaTrilha } from './assinatura'

/**
 * Onde mora a chave de assinatura da trilha. Duas origens:
 *   * a variável AUDITORIA_CHAVE_PRIVADA na Vercel (quem configurou por lá);
 *   * o cofre do Supabase (Vault), gerada pela própria Redação no botão da tela
 *     Trilha pública — ninguém vê o valor, nem quem clicou: a chave nasce no
 *     servidor, vai direto ao cofre e só a impressão digital volta para a tela.
 * A variável vale mais: se alguém a definir, ela manda.
 */

export const SERVICO_DA_CHAVE = 'auditoria_trilha'
export type OrigemDaChave = 'ambiente' | 'cofre'

/** O PEM guardado no cofre (o espaço é um só; a trilha também). Lido só com a service role. */
async function doCofre(): Promise<string | null> {
  const admin = createAdminClient()
  const { data: linha } = await admin.from('integracoes_chaves').select('workspace_id').eq('servico', SERVICO_DA_CHAVE).limit(1).maybeSingle()
  if (!linha) return null
  const { data, error } = await admin.rpc('chave_de_integracao', { p_workspace_id: linha.workspace_id, p_servico: SERVICO_DA_CHAVE })
  return !error && typeof data === 'string' && data.trim() ? data.trim() : null
}

/** A chave e de onde veio; null se não houver. Lança se a que existe for inválida. */
export async function obterChaveDaTrilha(): Promise<{ chave: ChaveDaTrilha; origem: OrigemDaChave } | null> {
  const doAmbiente = chaveDaTrilha()
  if (doAmbiente) return { chave: doAmbiente, origem: 'ambiente' }
  const pem = await doCofre()
  return pem ? { chave: lerChave(pem), origem: 'cofre' } : null
}

/** Uma chave Ed25519 nova, em PEM (PKCS#8). Só para ir direto ao cofre. */
export function novaChaveEmPem(): string {
  const { privateKey } = generateKeyPairSync('ed25519')
  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
}
