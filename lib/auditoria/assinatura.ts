/**
 * A assinatura dos manifestos dos lotes: Ed25519 com a chave de
 * AUDITORIA_CHAVE_PRIVADA (PKCS#8 em PEM). A chave pública vai ao site em
 * /verificar/chave-publica.pem e a sua impressão digital (chave_id) em cada
 * lote, para qualquer pessoa conferir com openssl:
 *
 *   openssl pkeyutl -verify -pubin -inkey chave-publica.pem -rawin \
 *     -in manifesto.json -sigfile manifesto.json.sig
 *
 * Gerar a chave (uma vez, fora de qualquer repositório):
 *   openssl genpkey -algorithm ed25519 -out chave-da-trilha.pem
 *
 * Sem a variável, o lote fecha sem assinatura e é assinado quando ela chegar.
 */

import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'

export type ChaveDaTrilha = { privada: KeyObject; publica: KeyObject; publicaPem: string; id: string }

/** 16 primeiros hex do SHA-256 da chave pública bruta (32 bytes). */
export function idDaChave(publica: KeyObject): string {
  const der = publica.export({ format: 'der', type: 'spki' })
  return createHash('sha256').update(der.subarray(der.length - 32)).digest('hex').slice(0, 16)
}

/** Lê a chave de um PEM (aceita \n escrito, como algumas telas de variável gravam). */
export function lerChave(pem: string): ChaveDaTrilha {
  const texto = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
  const privada = createPrivateKey(texto.trim())
  if (privada.asymmetricKeyType !== 'ed25519') throw new Error('A chave da trilha precisa ser Ed25519.')
  const publica = createPublicKey(privada)
  return { privada, publica, publicaPem: publica.export({ format: 'pem', type: 'spki' }).toString(), id: idDaChave(publica) }
}

export function chaveDaTrilha(): ChaveDaTrilha | null {
  const pem = process.env.AUDITORIA_CHAVE_PRIVADA?.trim()
  return pem ? lerChave(pem) : null
}

/** Assinatura de 64 bytes, em base64. */
export function assinarManifesto(manifesto: string, chave: ChaveDaTrilha): string {
  return sign(null, Buffer.from(manifesto, 'utf8'), chave.privada).toString('base64')
}

export function conferirAssinatura(manifesto: string, assinaturaBase64: string, publicaPem: string): boolean {
  try {
    return verify(null, Buffer.from(manifesto, 'utf8'), createPublicKey(publicaPem), Buffer.from(assinaturaBase64, 'base64'))
  } catch {
    return false
  }
}
