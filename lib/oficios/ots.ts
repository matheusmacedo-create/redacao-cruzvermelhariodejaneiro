/**
 * O formato de prova do OpenTimestamps (.ots), escrito aqui em vez de usar o
 * pacote npm oficial — parado desde 2020 e preso a dependências abandonadas.
 * O formato é pequeno e estável: uma árvore em que cada aresta é uma operação
 * (anexar bytes, SHA-256…) e cada folha é um atestado (pendente num
 * calendário, ou confirmado num bloco do Bitcoin).
 *
 * Só o hash do documento sai daqui. Antes de ir ao calendário ele ganha um
 * sal aleatório, para que o hash publicado não permita adivinhar o conteúdo.
 *
 * Referência: https://github.com/opentimestamps/python-opentimestamps
 */

import { createHash, randomBytes } from 'node:crypto'

export const MAGICA = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex')
const VERSAO = 1

export const TAG_PENDENTE = Buffer.from('83dfe30d2ef90c8e', 'hex')
export const TAG_BITCOIN = Buffer.from('0588960d73d71901', 'hex')

// Operações: as binárias levam argumento; as unárias, não.
const OP = { sha256: 0x08, sha1: 0x02, ripemd160: 0x03, keccak256: 0x67, anexar: 0xf0, prefixar: 0xf1, inverter: 0xf2, hex: 0xf3 } as const

export type Operacao =
  | { tipo: 'anexar' | 'prefixar'; arg: Buffer }
  | { tipo: 'sha256' | 'sha1' | 'ripemd160' | 'keccak256' | 'inverter' | 'hex' }

export type Atestado =
  | { tipo: 'pendente'; uri: string }
  | { tipo: 'bitcoin'; altura: number }
  | { tipo: 'desconhecido'; tag: Buffer; payload: Buffer }

export type Carimbo = {
  msg: Buffer
  atestados: Atestado[]
  ramos: { op: Operacao; filho: Carimbo }[]
}

export class ErroDeProva extends Error {}

const LIMITE_DE_BYTES = 4096
const PROFUNDIDADE_MAXIMA = 256

// ------------------------------------------------------------------ operações

export function aplicar(op: Operacao, msg: Buffer): Buffer {
  switch (op.tipo) {
    case 'anexar': return Buffer.concat([msg, op.arg])
    case 'prefixar': return Buffer.concat([op.arg, msg])
    case 'sha256': return createHash('sha256').update(msg).digest()
    case 'sha1': return createHash('sha1').update(msg).digest()
    case 'ripemd160': return createHash('ripemd160').update(msg).digest()
    case 'inverter': return Buffer.from(msg).reverse()
    case 'hex': return Buffer.from(msg.toString('hex'), 'utf8')
    case 'keccak256': throw new ErroDeProva('Operação keccak256 não suportada.')
  }
}

const chaveDaOp = (op: Operacao) => `${OP[op.tipo]}:${'arg' in op ? op.arg.toString('hex') : ''}`

// ------------------------------------------------------------------ leitura

class Leitor {
  private pos = 0
  constructor(private readonly buf: Buffer) {}
  byte(): number {
    if (this.pos >= this.buf.length) throw new ErroDeProva('Prova truncada.')
    return this.buf[this.pos++]
  }
  bytes(n: number): Buffer {
    if (n < 0 || this.pos + n > this.buf.length) throw new ErroDeProva('Prova truncada.')
    const b = this.buf.subarray(this.pos, this.pos + n)
    this.pos += n
    return Buffer.from(b)
  }
  varuint(): number {
    let valor = 0
    let deslocamento = 0
    for (;;) {
      const b = this.byte()
      valor += (b & 0x7f) * 2 ** deslocamento
      if (!(b & 0x80)) break
      deslocamento += 7
      if (deslocamento > 49) throw new ErroDeProva('Número grande demais na prova.')
    }
    return valor
  }
  varbytes(max = LIMITE_DE_BYTES): Buffer {
    const n = this.varuint()
    if (n > max) throw new ErroDeProva('Campo grande demais na prova.')
    return this.bytes(n)
  }
  get fim() { return this.pos >= this.buf.length }
}

function lerAtestado(l: Leitor): Atestado {
  const tag = l.bytes(8)
  const payload = l.varbytes()
  const p = new Leitor(payload)
  if (tag.equals(TAG_PENDENTE)) {
    const uri = p.varbytes(1000).toString('utf8')
    if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~\-/]*)?$/.test(uri)) throw new ErroDeProva('Calendário inválido na prova.')
    return { tipo: 'pendente', uri }
  }
  if (tag.equals(TAG_BITCOIN)) return { tipo: 'bitcoin', altura: p.varuint() }
  return { tipo: 'desconhecido', tag, payload }
}

function lerOperacao(l: Leitor, tag: number): Operacao {
  switch (tag) {
    case OP.anexar: return { tipo: 'anexar', arg: l.varbytes() }
    case OP.prefixar: return { tipo: 'prefixar', arg: l.varbytes() }
    case OP.sha256: return { tipo: 'sha256' }
    case OP.sha1: return { tipo: 'sha1' }
    case OP.ripemd160: return { tipo: 'ripemd160' }
    case OP.keccak256: return { tipo: 'keccak256' }
    case OP.inverter: return { tipo: 'inverter' }
    case OP.hex: return { tipo: 'hex' }
    default: throw new ErroDeProva(`Operação desconhecida na prova (0x${tag.toString(16)}).`)
  }
}

function lerCarimbo(l: Leitor, msg: Buffer, profundidade = 0): Carimbo {
  if (profundidade > PROFUNDIDADE_MAXIMA) throw new ErroDeProva('Prova profunda demais.')
  const c: Carimbo = { msg, atestados: [], ramos: [] }
  const item = (tag: number) => {
    if (tag === 0x00) { c.atestados.push(lerAtestado(l)); return }
    const op = lerOperacao(l, tag)
    c.ramos.push({ op, filho: lerCarimbo(l, aplicar(op, msg), profundidade + 1) })
  }
  let tag = l.byte()
  while (tag === 0xff) {
    item(l.byte())
    tag = l.byte()
  }
  item(tag)
  return c
}

/** A resposta de um calendário: um carimbo para a mensagem enviada. */
export function lerCarimboDeCalendario(bytes: Buffer, msg: Buffer): Carimbo {
  const l = new Leitor(bytes)
  const c = lerCarimbo(l, msg)
  if (!l.fim) throw new ErroDeProva('Sobraram bytes na resposta do calendário.')
  return c
}

/** Um arquivo .ots inteiro: cabeçalho, o hash do documento e a árvore. */
export function lerProva(bytes: Buffer): { hash: Buffer; carimbo: Carimbo } {
  const l = new Leitor(bytes)
  if (!l.bytes(MAGICA.length).equals(MAGICA)) throw new ErroDeProva('Não é uma prova OpenTimestamps.')
  if (l.varuint() !== VERSAO) throw new ErroDeProva('Versão de prova não suportada.')
  if (l.byte() !== OP.sha256) throw new ErroDeProva('A prova precisa ser de um hash SHA-256.')
  const hash = l.bytes(32)
  const carimbo = lerCarimbo(l, hash)
  if (!l.fim) throw new ErroDeProva('Sobraram bytes na prova.')
  return { hash, carimbo }
}

// ------------------------------------------------------------------ escrita

function varuint(n: number): Buffer {
  const out: number[] = []
  let v = n
  do {
    let b = v % 128
    v = Math.floor(v / 128)
    if (v) b |= 0x80
    out.push(b)
  } while (v)
  return Buffer.from(out)
}
const varbytes = (b: Buffer) => Buffer.concat([varuint(b.length), b])

function escreverAtestado(a: Atestado): Buffer {
  if (a.tipo === 'pendente') return Buffer.concat([Buffer.from([0]), TAG_PENDENTE, varbytes(varbytes(Buffer.from(a.uri, 'utf8')))])
  if (a.tipo === 'bitcoin') return Buffer.concat([Buffer.from([0]), TAG_BITCOIN, varbytes(varuint(a.altura))])
  return Buffer.concat([Buffer.from([0]), a.tag, varbytes(a.payload)])
}

function escreverOperacao(op: Operacao): Buffer {
  return 'arg' in op ? Buffer.concat([Buffer.from([OP[op.tipo]]), varbytes(op.arg)]) : Buffer.from([OP[op.tipo]])
}

function escreverCarimbo(c: Carimbo): Buffer {
  // Mesma ordem do cliente de referência: atestados, depois operações.
  const itens: Buffer[] = [
    ...c.atestados.map(escreverAtestado),
    ...[...c.ramos].sort((a, b) => chaveDaOp(a.op).localeCompare(chaveDaOp(b.op))).map((r) => Buffer.concat([escreverOperacao(r.op), escreverCarimbo(r.filho)])),
  ]
  if (!itens.length) throw new ErroDeProva('Carimbo vazio.')
  return Buffer.concat(itens.map((b, i) => (i < itens.length - 1 ? Buffer.concat([Buffer.from([0xff]), b]) : b)))
}

export function escreverProva(hash: Buffer, carimbo: Carimbo): Buffer {
  if (hash.length !== 32) throw new ErroDeProva('Hash SHA-256 precisa ter 32 bytes.')
  return Buffer.concat([MAGICA, varuint(VERSAO), Buffer.from([OP.sha256]), hash, escreverCarimbo(carimbo)])
}

// ------------------------------------------------------------------ montagem

/**
 * O começo da prova: o hash do documento ganha 16 bytes de sal e passa por
 * SHA-256. É essa mensagem salgada que vai aos calendários.
 */
export function prepararEnvio(hash: Buffer, sal: Buffer = randomBytes(16)): { raiz: Carimbo; enviar: Buffer; no: Carimbo } {
  const anexar: Operacao = { tipo: 'anexar', arg: sal }
  const comSal = aplicar(anexar, hash)
  const sha: Operacao = { tipo: 'sha256' }
  const enviar = aplicar(sha, comSal)
  const no: Carimbo = { msg: enviar, atestados: [], ramos: [] }
  const raiz: Carimbo = { msg: hash, atestados: [], ramos: [{ op: anexar, filho: { msg: comSal, atestados: [], ramos: [{ op: sha, filho: no }] } }] }
  return { raiz, enviar, no }
}

/** Junta a resposta de um calendário ao nó que foi enviado. */
export function juntar(destino: Carimbo, origem: Carimbo) {
  if (!destino.msg.equals(origem.msg)) throw new ErroDeProva('A resposta do calendário é de outra mensagem.')
  for (const a of origem.atestados) {
    const igual = destino.atestados.some((b) => JSON.stringify(serial(b)) === JSON.stringify(serial(a)))
    if (!igual) destino.atestados.push(a)
  }
  for (const r of origem.ramos) {
    const existente = destino.ramos.find((x) => chaveDaOp(x.op) === chaveDaOp(r.op))
    if (existente) juntar(existente.filho, r.filho)
    else destino.ramos.push(r)
  }
}

const serial = (a: Atestado) => (a.tipo === 'desconhecido' ? { t: a.tag.toString('hex'), p: a.payload.toString('hex') } : a)

/** Cada atestado com a mensagem em que ele se apoia. */
export function atestados(c: Carimbo): { msg: Buffer; atestado: Atestado; no: Carimbo }[] {
  return [
    ...c.atestados.map((atestado) => ({ msg: c.msg, atestado, no: c })),
    ...c.ramos.flatMap((r) => atestados(r.filho)),
  ]
}

/**
 * Troca um atestado pendente pela resposta que o calendário deu para ele.
 * O pendente sai quando a resposta traz algo além de outro pendente — sinal
 * de que o calendário já tem o caminho até o Bitcoin.
 */
export function atualizarPendente(no: Carimbo, uri: string, resposta: Carimbo): boolean {
  juntar(no, resposta)
  const chegouAoBitcoin = atestados(resposta).some((a) => a.atestado.tipo === 'bitcoin')
  if (chegouAoBitcoin) no.atestados = no.atestados.filter((a) => !(a.tipo === 'pendente' && a.uri === uri))
  return chegouAoBitcoin
}

export type SituacaoDaProva = { confirmada: boolean; alturas: number[]; pendentes: string[] }

export function situacaoDaProva(c: Carimbo): SituacaoDaProva {
  const todos = atestados(c)
  const alturas = [...new Set(todos.flatMap((a) => (a.atestado.tipo === 'bitcoin' ? [a.atestado.altura] : [])))].sort((a, b) => a - b)
  const pendentes = [...new Set(todos.flatMap((a) => (a.atestado.tipo === 'pendente' ? [a.atestado.uri] : [])))]
  return { confirmada: alturas.length > 0, alturas, pendentes }
}

/**
 * Para conferir no Bitcoin: a mensagem no atestado é a raiz de Merkle do
 * bloco, em bytes na ordem interna — os exploradores mostram invertida.
 */
export function raizEsperada(c: Carimbo, altura: number): string | null {
  const a = atestados(c).find((x) => x.atestado.tipo === 'bitcoin' && x.atestado.altura === altura)
  return a ? Buffer.from(a.msg).reverse().toString('hex') : null
}

export const sha256 = (dados: Buffer | string) => createHash('sha256').update(dados).digest()
