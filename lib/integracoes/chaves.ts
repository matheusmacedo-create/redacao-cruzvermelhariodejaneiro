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

type Campo = { id: string; rotulo: string; secreto: boolean }
type DefinicaoDeServico = {
  nome: string
  variavel: string
  painel: string
  /** Mais de um valor (ex.: id e segredo do cliente OAuth): guardado como JSON. */
  campos?: readonly Campo[]
  /** Gravado pelo próprio sistema (ex.: autorização do Google), fora da tela de chaves. */
  oculto?: boolean
}

export const SERVICOS = {
  hunter: { nome: 'Hunter.io', variavel: 'HUNTER_API_KEY', painel: 'https://hunter.io/api-keys' },
  google_oauth: {
    nome: 'Google (cliente OAuth do Gmail)',
    variavel: 'GOOGLE_OAUTH',
    painel: 'https://console.cloud.google.com/apis/credentials',
    campos: [
      { id: 'clientId', rotulo: 'ID do cliente', secreto: false },
      { id: 'clientSecret', rotulo: 'Chave secreta do cliente', secreto: true },
    ],
  },
  google_gmail: { nome: 'Autorização da conta Google', variavel: 'GOOGLE_GMAIL_REFRESH', painel: '', oculto: true },
} as const satisfies Record<string, DefinicaoDeServico>

export type Servico = keyof typeof SERVICOS

const definicao = (s: Servico): DefinicaoDeServico => SERVICOS[s]

/** Os campos de um serviço de vários valores; vazio nos de valor único. */
export const camposDo = (s: Servico): readonly Campo[] => definicao(s).campos ?? []

/** Serviços que aparecem na tela de Integrações. */
export const servicosNaTela = () => (Object.keys(SERVICOS) as Servico[]).filter((s) => !definicao(s).oculto)

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
  campos: readonly Campo[]
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

  return servicosNaTela().map((servico) => {
    const atualizadaEm = noCofre.get(servico) ?? null
    const noAmbiente = Boolean(process.env[SERVICOS[servico].variavel]?.trim())
    return {
      servico,
      nome: SERVICOS[servico].nome,
      campos: camposDo(servico),
      origem: atualizadaEm ? 'cofre' : noAmbiente ? 'ambiente' : null,
      atualizadaEm,
    }
  })
}

/** Serviço de vários campos: o JSON guardado, lido. null se faltar algum. */
export async function obterCampos(workspaceId: string, servico: Servico): Promise<Record<string, string> | null> {
  const bruto = await obterChave(workspaceId, servico)
  if (!bruto) return null
  try {
    const dados = JSON.parse(bruto) as Record<string, unknown>
    const campos = camposDo(servico)
    const saida: Record<string, string> = {}
    for (const c of campos) {
      const v = typeof dados[c.id] === 'string' ? (dados[c.id] as string).trim() : ''
      if (!v) return null
      saida[c.id] = v
    }
    return saida
  } catch {
    return null
  }
}
