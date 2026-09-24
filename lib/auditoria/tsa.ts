/**
 * Carimbo de tempo RFC 3161 (por padrão na FreeTSA, gratuita). Complementa o
 * OpenTimestamps: sai na hora, com o relógio de uma autoridade de carimbo,
 * enquanto o Bitcoin leva horas. O pedido leva só o SHA-256 do manifesto do
 * lote; a resposta inteira vai ao site como manifesto.json.tsr e se confere com
 *
 *   openssl ts -verify -data manifesto.json -in manifesto.json.tsr \
 *     -CAfile cacert.pem -untrusted tsa.crt
 *
 * (certificados em https://freetsa.org). AUDITORIA_TSA_URL troca a autoridade.
 */

import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import { randomBytes } from 'node:crypto'

export const TSA_PADRAO = 'https://freetsa.org/tsr'
const OID_SHA256 = '2.16.840.1.101.3.4.2.1'

const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const semZerosAEsquerda = (b: Buffer) => {
  let i = 0
  while (i < b.length - 1 && b[i] === 0) i++
  return b.subarray(i)
}

export function pedidoDeCarimbo(hash: Buffer, nonce: Buffer = randomBytes(8)): { der: Buffer; nonce: Buffer } {
  if (hash.length !== 32) throw new Error('O carimbo de tempo pede um SHA-256 de 32 bytes.')
  const n = Buffer.from(nonce)
  n[0] = (n[0] & 0x7f) || 1 // inteiro positivo, sem zero à esquerda
  const pedido = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256, algorithmParams: new asn1js.Null() }),
      hashedMessage: new asn1js.OctetString({ valueHex: ab(hash) }),
    }),
    nonce: new asn1js.Integer({ valueHex: ab(n) }),
    certReq: true,
  })
  return { der: Buffer.from(pedido.toSchema().toBER(false)), nonce: n }
}

export type CarimboDeTempo = { tsr: Buffer; horario: Date; serie: string }

/** Lê a resposta e confere que ela é do hash (e do nonce) pedidos. */
export function lerResposta(tsr: Buffer, hash: Buffer, nonce?: Buffer): CarimboDeTempo {
  const asn = asn1js.fromBER(ab(tsr))
  if (asn.offset === -1) throw new Error('A resposta da autoridade de carimbo não é DER válido.')
  const resposta = new pkijs.TimeStampResp({ schema: asn.result })
  const situacao = resposta.status.status
  if (situacao !== 0 && situacao !== 1) throw new Error(`A autoridade de carimbo recusou o pedido (situação ${situacao}).`)
  if (!resposta.timeStampToken) throw new Error('A autoridade de carimbo não devolveu o carimbo.')
  const assinado = new pkijs.SignedData({ schema: resposta.timeStampToken.content })
  const conteudo = assinado.encapContentInfo.eContent
  if (!conteudo) throw new Error('O carimbo veio sem conteúdo.')
  const info = new pkijs.TSTInfo({ schema: asn1js.fromBER(conteudo.getValue()).result })
  if (info.messageImprint.hashAlgorithm.algorithmId !== OID_SHA256) throw new Error('O carimbo não é de um SHA-256.')
  if (!Buffer.from(info.messageImprint.hashedMessage.valueBlock.valueHexView).equals(hash)) throw new Error('O carimbo de tempo é de outro hash.')
  if (nonce) {
    const recebido = info.nonce ? semZerosAEsquerda(Buffer.from(info.nonce.valueBlock.valueHexView)) : null
    if (!recebido || !recebido.equals(semZerosAEsquerda(nonce))) throw new Error('O nonce do carimbo de tempo não confere.')
  }
  return { tsr, horario: info.genTime, serie: Buffer.from(info.serialNumber.valueBlock.valueHexView).toString('hex') }
}

export async function carimbarTempo(hash: Buffer, url: string = process.env.AUDITORIA_TSA_URL?.trim() || TSA_PADRAO): Promise<CarimboDeTempo> {
  const { der, nonce } = pedidoDeCarimbo(hash)
  const r = await fetch(url, {
    method: 'POST',
    body: new Uint8Array(der),
    headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply', 'User-Agent': 'Redacao-CVB-RJ' },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`A autoridade de carimbo respondeu ${r.status}.`)
  return lerResposta(Buffer.from(await r.arrayBuffer()), hash, nonce)
}
