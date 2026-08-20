import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { metaEnv } from './config'

/**
 * URL pública temporária para a mídia da Biblioteca.
 *
 * A Biblioteca é privada: os arquivos sobem no Vercel Blob com access:'private'
 * e só são servidos por rotas autenticadas. Os servidores da Meta, porém,
 * precisam BAIXAR o arquivo — eles não têm sessão nem cookie.
 *
 * Solução: um token assinado (HMAC) que carrega o id do arquivo e um prazo de
 * validade. A rota /api/social/media/[token] valida a assinatura e devolve o
 * arquivo. Sem a chave, ninguém forja um token; passado o prazo, o token morre.
 *
 * Assim o arquivo fica exposto pelo tempo da publicação e não mais que isso.
 */

const VALIDADE_PADRAO_MS = 6 * 60 * 60 * 1000 // 6h — cobre o processamento de vídeo

function chaveAssinatura(): string {
  const chave = process.env.SOCIAL_MEDIA_SIGNING_KEY
  if (!chave) throw new Error('Variável de ambiente ausente: SOCIAL_MEDIA_SIGNING_KEY')
  return chave
}

function base64url(valor: Buffer | string): string {
  return Buffer.from(valor)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function deBase64url(valor: string): Buffer {
  return Buffer.from(valor.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export type PayloadMidia = {
  /** id em public.files */
  f: string
  /** expiração em epoch ms */
  e: number
}

export function assinarMidia(fileId: string, validadeMs = VALIDADE_PADRAO_MS): string {
  const payload: PayloadMidia = { f: fileId, e: Date.now() + validadeMs }
  const corpo = base64url(JSON.stringify(payload))
  const assinatura = base64url(createHmac('sha256', chaveAssinatura()).update(corpo).digest())
  return `${corpo}.${assinatura}`
}

export function verificarMidia(token: string): PayloadMidia | null {
  const [corpo, assinatura] = token.split('.')
  if (!corpo || !assinatura) return null

  const esperada = base64url(createHmac('sha256', chaveAssinatura()).update(corpo).digest())
  const a = Buffer.from(assinatura)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(deBase64url(corpo).toString('utf8')) as PayloadMidia
    if (!payload?.f || typeof payload.e !== 'number') return null
    if (Date.now() > payload.e) return null
    return payload
  } catch {
    return null
  }
}

/** URL absoluta que vai dentro do payload enviado para a Meta. */
export function urlPublicaMidia(fileId: string, validadeMs?: number): string {
  return `${metaEnv.siteUrl}/api/social/media/${assinarMidia(fileId, validadeMs)}`
}
