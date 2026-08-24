import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Cifragem dos tokens de acesso da Meta.
 *
 * Um token de Página dá poder de publicar em nome da Cruz Vermelha. Ele nunca
 * fica em texto puro no banco: se o Postgres vazar, o token continua inútil sem
 * a SOCIAL_ENCRYPTION_KEY, que vive só nas variáveis de ambiente da Vercel.
 *
 * AES-256-GCM: cifra e autentica ao mesmo tempo — um cipher adulterado falha
 * na decifragem em vez de devolver lixo silenciosamente.
 *
 * Gere a chave com:  openssl rand -base64 32
 */

const FORMATO = 'v1'

function chave(): Buffer {
  const raw = process.env.SOCIAL_ENCRYPTION_KEY
  if (!raw) throw new Error('Variável de ambiente ausente: SOCIAL_ENCRYPTION_KEY')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('SOCIAL_ENCRYPTION_KEY deve ter 32 bytes em base64 (openssl rand -base64 32).')
  }
  return key
}

export function cifrarToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', chave(), iv)
  const payload = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [FORMATO, iv.toString('base64'), tag.toString('base64'), payload.toString('base64')].join('.')
}

export function decifrarToken(cipherText: string): string {
  const [formato, iv, tag, payload] = cipherText.split('.')
  if (formato !== FORMATO || !iv || !tag || !payload) {
    throw new Error('Token armazenado em formato inválido.')
  }
  const decipher = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * appsecret_proof — assinatura HMAC que a Meta recomenda enviar junto de toda
 * chamada. Se o token for roubado, sem o app secret ele não serve para nada.
 */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(accessToken).digest('hex')
}

/** Comparação de segredos resistente a ataque de tempo. */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
