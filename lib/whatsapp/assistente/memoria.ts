import 'server-only'
import { createHash, createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizar } from '../regras'
import { TabelaDeMarcadores, type TipoDeItem } from './marcadores'
import { LIMITES, marcadorValido } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A memória curta do assistente do WhatsApp (whatsapp_ia_memoria), uma linha por pessoa, 30 minutos renovados:
 * só marcadores (apr_1 → aprovação + uuid), a ordem da última lista, as listas por mensagem (as 5 últimas), a
 * vez da pessoa e o HMAC do último texto. Nenhum texto da conversa: o CHECK do banco recusa (decisão 4 do dono).
 *
 * Cada mensagem é uma conversa nova com a API; é esta memória que faz "a 2", "essa" (citando a lista) e "e o
 * outro?" funcionarem entre uma mensagem e outra.
 *
 * Nunca lança: sem a tabela (migração do assistente ainda não aplicada), a memória vem vazia e a gravação some.
 */

export type ListaGuardada = { m: string; r: string[] }

export type Memoria = {
  tabela: TabelaDeMarcadores
  /** Os marcadores da última lista mostrada, na ordem (até 10). */
  ordem: string[]
  /** As listas por id da mensagem que as mostrou (citar a lista = esta ordem). */
  listas: ListaGuardada[]
  ultimoTexto: string | null
  ultimoTextoEm: number | null
}

const ID_DE_MENSAGEM = /^[A-Za-z0-9._:=+/-]{1,128}$/
const LISTAS_GUARDADAS = 5

const vazia = (): Memoria => ({ tabela: TabelaDeMarcadores.de(null), ordem: [], listas: [], ultimoTexto: null, ultimoTextoEm: null })

/** A memória da pessoa; vencida (mais de 30 min sem uso), vazia. */
export async function lerMemoria(admin: Admin, userId: string): Promise<Memoria> {
  try {
    const { data, error } = await admin.from('whatsapp_ia_memoria').select('refs, ordem, listas, proximo, ultimo_texto, ultimo_texto_em, expira_em').eq('user_id', userId).maybeSingle()
    if (error || !data || Date.parse(data.expira_em as string) < Date.now()) return vazia()
    const listas = Array.isArray(data.listas) ? (data.listas as unknown[]).flatMap((l) => {
      const x = l && typeof l === 'object' ? l as Record<string, unknown> : null
      return x && typeof x.m === 'string' && Array.isArray(x.r) ? [{ m: x.m, r: (x.r as unknown[]).filter(marcadorValido) }] : []
    }) : []
    return {
      tabela: TabelaDeMarcadores.de({ refs: data.refs, proximo: data.proximo }),
      ordem: Array.isArray(data.ordem) ? (data.ordem as unknown[]).filter(marcadorValido) : [],
      listas,
      ultimoTexto: (data.ultimo_texto as string | null) ?? null,
      ultimoTextoEm: data.ultimo_texto_em ? Date.parse(data.ultimo_texto_em as string) : null,
    }
  } catch {
    return vazia()
  }
}

/**
 * Grava a memória (renova os 30 minutos). `lista`: a lista que esta saída mostrou (vira a última ordem e entra nas
 * listas por mensagem); `ultimoTexto`: o HMAC da mensagem desta vez. Não mexe na vez (ocupado_ate).
 */
export async function gravarMemoria(admin: Admin, workspaceId: string, userId: string, m: Memoria, extra: { lista?: ListaGuardada | null; ultimoTexto?: string | null } = {}): Promise<void> {
  try {
    const { refs, proximo } = m.tabela.paraGravar()
    const conhecidos = new Set(Object.keys(refs))
    const lista = extra.lista && ID_DE_MENSAGEM.test(extra.lista.m) ? { m: extra.lista.m, r: extra.lista.r.filter((x) => conhecidos.has(x)).slice(0, 10) } : null
    const ordem = (lista?.r.length ? lista.r : m.ordem).filter((x) => conhecidos.has(x)).slice(0, 10)
    const listas = [...m.listas.filter((l) => l.m !== lista?.m), ...(lista?.r.length ? [lista] : [])]
      .map((l) => ({ m: l.m, r: l.r.filter((x) => conhecidos.has(x)).slice(0, 10) })).filter((l) => l.r.length).slice(-LISTAS_GUARDADAS)
    const agora = new Date()
    const linha: Record<string, unknown> = {
      user_id: userId, workspace_id: workspaceId, refs, proximo, ordem, listas,
      expira_em: new Date(agora.getTime() + LIMITES.memoriaMin * 60_000).toISOString(), atualizado_em: agora.toISOString(),
    }
    if (extra.ultimoTexto !== undefined) {
      linha.ultimo_texto = extra.ultimoTexto
      linha.ultimo_texto_em = extra.ultimoTexto ? agora.toISOString() : null
    }
    const { error } = await admin.from('whatsapp_ia_memoria').upsert(linha, { onConflict: 'user_id' })
    if (error) console.error('[whatsapp] assistente: memória não gravada:', error.code)
  } catch (causa) {
    console.error('[whatsapp] assistente: memória não gravada:', causa instanceof Error ? causa.message : causa)
  }
}

/**
 * A lista de um comando fixo ("avisos", "aprovações") entra na memória: "a 2" logo depois aponta para o segundo
 * item, e citar a lista também. `mensagemId`: a mensagem que mostrou a lista.
 */
export async function lembrarLista(admin: Admin, workspaceId: string, userId: string, itens: { tipo: TipoDeItem; id: string }[], mensagemId: string | null): Promise<void> {
  if (!itens.length) return
  const m = await lerMemoria(admin, userId)
  const r = itens.slice(0, 10).map((i) => m.tabela.emitir(i.tipo, i.id)).filter((x): x is string => x !== null)
  if (!r.length) return
  await gravarMemoria(admin, workspaceId, userId, { ...m, ordem: r }, { lista: mensagemId ? { m: mensagemId, r } : null })
}

/** "esquece", "nova conversa": a memória volta ao zero (a vez fica como está). */
export async function esquecer(admin: Admin, userId: string): Promise<void> {
  try {
    await admin.from('whatsapp_ia_memoria').update({ refs: {}, ordem: [], listas: [], proximo: 1, ultimo_texto: null, ultimo_texto_em: null, atualizado_em: new Date().toISOString() })
      .eq('user_id', userId)
  } catch (causa) {
    console.error('[whatsapp] assistente: memória não apagada:', causa instanceof Error ? causa.message : causa)
  }
}

// ------------------------------------------------------------------ a vez (um turno por pessoa)

/** Toma a vez da pessoa por `segundos` (whatsapp_ia_tomar_vez, atômica). false: ocupada, ou sem a função. */
export async function tomarVez(admin: Admin, workspaceId: string, userId: string, segundos: number = LIMITES.vezSegundos): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('whatsapp_ia_tomar_vez', { p_user_id: userId, p_workspace_id: workspaceId, p_segundos: segundos })
    return !error && data === true
  } catch {
    return false
  }
}

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms))

/** Espera a vez de 1 em 1 s, até LIMITES.esperaDaVezMs (ou até o prazo do turno, o que vier antes). */
export async function esperarAVez(admin: Admin, workspaceId: string, userId: string, prazo: number): Promise<boolean> {
  const ate = Math.min(Date.now() + LIMITES.esperaDaVezMs, prazo)
  for (;;) {
    if (await tomarVez(admin, workspaceId, userId)) return true
    if (Date.now() + 1_000 > ate) return false
    await dormir(1_000)
  }
}

export async function soltarVez(admin: Admin, userId: string): Promise<void> {
  try {
    await admin.from('whatsapp_ia_memoria').update({ ocupado_ate: null }).eq('user_id', userId)
  } catch {
    // A vez vence sozinha em LIMITES.vezSegundos.
  }
}

// ------------------------------------------------------------------ texto repetido (sem modelo)

/**
 * O HMAC-SHA256 do texto normalizado, cortado em 16 hex: dá para saber se a mensagem é a mesma de antes, não
 * para ler o que ela dizia. A chave é a do service role, que nunca vai ao banco.
 */
export function hashDoTexto(texto: string): string {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const base = normalizar(String(texto ?? ''))
  return (chave ? createHmac('sha256', chave).update(base, 'utf8') : createHash('sha256').update(`assistente:${base}`, 'utf8')).digest('hex').slice(0, 16)
}

/** A mesma mensagem da última vez, há menos de LIMITES.repetidaMin: responde o texto fixo, sem modelo. */
export function textoRepetido(m: Memoria, texto: string, agora: number = Date.now()): boolean {
  return Boolean(m.ultimoTexto) && m.ultimoTexto === hashDoTexto(texto) && m.ultimoTextoEm !== null && agora - m.ultimoTextoEm < LIMITES.repetidaMin * 60_000
}
