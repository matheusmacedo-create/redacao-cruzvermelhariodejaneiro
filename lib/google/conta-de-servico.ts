import 'server-only'
import { createSign } from 'node:crypto'
import { obterChave } from '@/lib/integracoes/chaves'
import { apiDoGoogle } from './api'
import { lerContaDeServico } from './conta-de-servico-regras'

/**
 * Acesso do servidor às APIs do Google por uma conta de serviço (o Google
 * Analytics do site). A chave JSON da conta mora no cofre
 * (integracoes_chaves, serviço google_analytics); daqui só sai um token de
 * leitura de curta duração, assinado aqui mesmo (JWT RS256, sem biblioteca).
 * Nenhuma pessoa entra com a própria conta Google.
 */

export class ErroDoGoogle extends Error {
  constructor(message: string, public status = 0) {
    super(message)
    this.name = 'ErroDoGoogle'
  }
}

const b64url = (dado: string | Buffer) => Buffer.from(dado).toString('base64url')
const cache = new Map<string, { token: string; expira: number }>()
const pedindo = new Map<string, Promise<string>>()

/** Token de acesso da conta de serviço para um escopo (renovado quando falta 1 minuto). */
export async function tokenDaContaDeServico(workspaceId: string, escopo: string): Promise<string> {
  const chaveDoCache = `${workspaceId}:${escopo}`
  const guardado = cache.get(chaveDoCache)
  if (guardado && guardado.expira > Date.now() + 60_000) return guardado.token
  // Duas consultas ao mesmo tempo esperam o mesmo pedido de token, em vez de pedir dois.
  const emCurso = pedindo.get(chaveDoCache)
  if (emCurso) return emCurso
  const pedido = pedirToken(workspaceId, escopo, chaveDoCache).finally(() => pedindo.delete(chaveDoCache))
  pedindo.set(chaveDoCache, pedido)
  return pedido
}

async function pedirToken(workspaceId: string, escopo: string, chaveDoCache: string): Promise<string> {
  const bruto = await obterChave(workspaceId, 'google_analytics')
  if (!bruto) throw new ErroDoGoogle('O Google Analytics ainda não foi ligado: um administrador cola a chave da conta de serviço em Configurações → Integrações.')
  const conta = lerContaDeServico(bruto)
  if ('erro' in conta) throw new ErroDoGoogle(conta.erro)

  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = b64url(JSON.stringify({ iss: conta.email, scope: escopo, aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }))
  let assinatura: string
  try {
    assinatura = createSign('RSA-SHA256').update(`${cabecalho}.${corpo}`).sign(conta.chavePrivada, 'base64url')
  } catch {
    throw new ErroDoGoogle('A chave da conta de serviço não é válida. Gere uma chave JSON nova no Google Cloud e cole de novo em Configurações → Integrações.')
  }
  const res = await fetch(apiDoGoogle('https://oauth2.googleapis.com/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecalho}.${corpo}.${assinatura}` }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const dados = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !dados.access_token) {
    throw new ErroDoGoogle(dados.error === 'invalid_grant'
      ? 'O Google recusou a conta de serviço (chave apagada ou desativada). Gere uma chave nova e cole em Configurações → Integrações.'
      : `O Google recusou a conta de serviço (${dados.error || res.status}).`, res.status)
  }
  cache.set(chaveDoCache, { token: dados.access_token, expira: Date.now() + Number(dados.expires_in ?? 3600) * 1000 })
  return dados.access_token
}

/** O e-mail da conta de serviço (para a tela dizer quem precisa de acesso no Analytics). Null se não há chave. */
export async function emailDaContaDeServico(workspaceId: string): Promise<string | null> {
  const bruto = await obterChave(workspaceId, 'google_analytics')
  if (!bruto) return null
  const conta = lerContaDeServico(bruto)
  return 'erro' in conta ? null : conta.email
}
