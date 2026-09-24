import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  atestados, atualizarPendente, escreverProva, juntar, lerCarimboDeCalendario, lerProva, prepararEnvio, raizEsperada,
  situacaoDaProva, type Carimbo,
} from './ots'

/**
 * O carimbo no Bitcoin via OpenTimestamps. Vai aos calendários só o hash do
 * manifesto de assinaturas, com sal: nenhum texto, nome ou dado pessoal sai
 * do Redação. Os calendários agregam milhares de hashes numa árvore e gravam
 * a raiz numa transação do Bitcoin; algumas horas depois a prova pode ser
 * "atualizada" até um bloco, e a partir daí se sustenta sozinha.
 */

export const CALENDARIOS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
]

// Só estes endereços são chamados na atualização. A prova diz a qual
// calendário perguntar; sem esta lista, uma prova adulterada faria o servidor
// buscar qualquer endereço.
const CALENDARIOS_CONHECIDOS = new Set([
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
  'https://btc.calendar.catallaxy.com',
  ...CALENDARIOS,
])

const ACEITA = { Accept: 'application/vnd.opentimestamps.v1', 'User-Agent': 'Redacao-CVB-RJ' }
const TEMPO = 12_000

async function buscar(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TEMPO), cache: 'no-store' })
}

/** Envia o hash aos calendários. Basta um responder; os outros são redundância. */
export async function carimbar(hashHex: string): Promise<{ prova: string; calendarios: string[] }> {
  const hash = Buffer.from(hashHex, 'hex')
  if (hash.length !== 32) throw new Error('Hash inválido.')
  const { raiz, enviar, no } = prepararEnvio(hash)
  const respostas = await Promise.allSettled(CALENDARIOS.map(async (cal) => {
    const r = await buscar(`${cal}/digest`, { method: 'POST', body: new Uint8Array(enviar), headers: { ...ACEITA, 'Content-Type': 'application/x-www-form-urlencoded' } })
    if (!r.ok) throw new Error(`${cal} respondeu ${r.status}`)
    return lerCarimboDeCalendario(Buffer.from(await r.arrayBuffer()), enviar)
  }))
  const aceitas = respostas.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (!aceitas.length) {
    const motivo = respostas.map((r) => (r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : '')).filter(Boolean).join('; ')
    throw new Error(`Nenhum calendário aceitou o carimbo (${motivo.slice(0, 300)}).`)
  }
  for (const c of aceitas) juntar(no, c)
  const prova = escreverProva(hash, raiz)
  return { prova: prova.toString('base64'), calendarios: situacaoDaProva(raiz).pendentes }
}

/** Confere no próprio Bitcoin que a raiz de Merkle do bloco é a da prova. */
async function raizDoBloco(altura: number): Promise<string | null> {
  for (const base of ['https://blockstream.info/api', 'https://mempool.space/api']) {
    try {
      const hash = (await (await buscar(`${base}/block-height/${altura}`)).text()).trim()
      if (!/^[0-9a-f]{64}$/.test(hash)) continue
      const bloco = await (await buscar(`${base}/block/${hash}`)).json() as { merkle_root?: string }
      if (bloco.merkle_root && /^[0-9a-f]{64}$/.test(bloco.merkle_root)) return bloco.merkle_root
    } catch {
      // Tenta o próximo explorador.
    }
  }
  return null
}

export type Atualizacao = { prova: string; confirmada: boolean; bloco: number | null; raiz: string | null; pendentes: string[] }

/**
 * Pergunta aos calendários se o hash já entrou num bloco. Só dá a prova por
 * confirmada depois de conferir a raiz de Merkle do bloco num explorador do
 * Bitcoin — a palavra do calendário sozinha não basta.
 */
export async function atualizar(provaBase64: string): Promise<Atualizacao> {
  const { hash, carimbo } = lerProva(Buffer.from(provaBase64, 'base64'))
  for (const a of atestados(carimbo)) {
    if (a.atestado.tipo !== 'pendente' || !CALENDARIOS_CONHECIDOS.has(a.atestado.uri)) continue
    try {
      const r = await buscar(`${a.atestado.uri}/timestamp/${a.msg.toString('hex')}`, { headers: ACEITA })
      if (r.status !== 200) continue // 404: ainda não está num bloco
      const resposta: Carimbo = lerCarimboDeCalendario(Buffer.from(await r.arrayBuffer()), a.msg)
      atualizarPendente(a.no, a.atestado.uri, resposta)
    } catch {
      // Calendário fora do ar: fica para a próxima rodada.
    }
  }
  const prova = escreverProva(hash, carimbo).toString('base64')
  const sit = situacaoDaProva(carimbo)
  for (const altura of sit.alturas) {
    const esperada = raizEsperada(carimbo, altura)
    const real = await raizDoBloco(altura)
    if (esperada && real && esperada === real) return { prova, confirmada: true, bloco: altura, raiz: real, pendentes: sit.pendentes }
  }
  return { prova, confirmada: false, bloco: null, raiz: null, pendentes: sit.pendentes }
}

type LinhaDoCarimbo = { id: string; hash: string; estado: string; prova: string | null; tentativas: number }

const minutos = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

/** Uma rodada num carimbo: envia se ainda não foi, atualiza se já foi. */
export async function processarCarimbo(c: LinhaDoCarimbo): Promise<string> {
  const admin = createAdminClient()
  try {
    if (c.estado === 'pendente' || !c.prova) {
      const { prova, calendarios } = await carimbar(c.hash)
      await admin.from('oficio_carimbos').update({
        estado: 'enviado', prova, calendarios, enviado_em: new Date().toISOString(), tentativas: c.tentativas + 1,
        ultimo_erro: null, proxima_tentativa_em: minutos(90), updated_at: new Date().toISOString(),
      }).eq('id', c.id).neq('estado', 'confirmado')
      return 'enviado'
    }
    const r = await atualizar(c.prova)
    await admin.from('oficio_carimbos').update(r.confirmada
      ? { estado: 'confirmado', prova: r.prova, bloco: r.bloco, raiz_merkle: r.raiz, confirmado_em: new Date().toISOString(), ultimo_erro: null, updated_at: new Date().toISOString() }
      // O Bitcoin fecha um bloco a cada ~10 min, mas os calendários juntam
      // hashes por algumas horas antes de gravar: perguntar de 2 em 2 h basta.
      : { prova: r.prova, tentativas: c.tentativas + 1, proxima_tentativa_em: minutos(120), updated_at: new Date().toISOString() },
    ).eq('id', c.id).neq('estado', 'confirmado')
    return r.confirmada ? 'confirmado' : 'aguardando'
  } catch (causa) {
    const erro = causa instanceof Error ? causa.message : String(causa)
    const espera = Math.min(12 * 60, 5 * 2 ** Math.min(c.tentativas, 8))
    await admin.from('oficio_carimbos').update({
      tentativas: c.tentativas + 1, ultimo_erro: erro.slice(0, 500), proxima_tentativa_em: minutos(espera), updated_at: new Date().toISOString(),
    }).eq('id', c.id).neq('estado', 'confirmado')
    return 'erro'
  }
}

/** A fila: tudo que não está confirmado e cuja vez chegou. */
export async function processarFila(limite = 20, oficioId?: string) {
  const admin = createAdminClient()
  let q = admin.from('oficio_carimbos').select('id,hash,estado,prova,tentativas')
    .neq('estado', 'confirmado').lte('proxima_tentativa_em', new Date().toISOString())
    .order('proxima_tentativa_em').limit(limite)
  if (oficioId) q = q.eq('oficio_id', oficioId)
  const { data, error } = await q
  if (error) throw new Error('Não foi possível ler a fila de carimbos.')
  const resultados: Record<string, number> = {}
  for (const c of (data ?? []) as LinhaDoCarimbo[]) {
    const r = await processarCarimbo(c)
    resultados[r] = (resultados[r] ?? 0) + 1
  }
  return resultados
}
