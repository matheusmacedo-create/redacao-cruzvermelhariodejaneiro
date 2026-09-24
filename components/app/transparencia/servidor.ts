import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { createClient } from '@/lib/supabase/server'

/**
 * Leituras das páginas /transparencia e /canais-oficiais que não são da
 * própria tabela. Moraria em lib/transparencia; fica aqui, ao lado das telas
 * que o usam, até alguém mudar de lugar.
 */

export type CodigoDaTrilha = {
  referencia_id: string
  versao: number
  codigo: string
  /** SHA-256 do conteúdo canônico registrado (para documento, a ficha e o arquivo juntos). */
  hash: string
  /** SHA-256 do PDF, só nos documentos. */
  hash_arquivo: string | null
  registrado_em: string
  /** Só nos canais: de que versão da lista é o registro. */
  versao_origem?: number | null
}

/**
 * Os códigos da trilha pública das origens dadas. A função do banco só aceita
 * a chave de serviço: chame DEPOIS de conferir a permissão da pessoa. Devolve
 * null quando a trilha não pôde ser lida (a tela avisa em vez de dizer que
 * nada foi registrado).
 */
export async function codigosDaTrilha(tipo: 'documento' | 'parceria' | 'canais', referencias: string[]): Promise<CodigoDaTrilha[] | null> {
  if (!referencias.length) return []
  try {
    const { data, error } = await createAdminClient().rpc('auditoria_codigos_das_origens', { p_tipo: tipo, p_referencias: referencias })
    if (error) {
      console.error('[transparencia] códigos da trilha:', error.message)
      return null
    }
    return (Array.isArray(data) ? data : []) as CodigoDaTrilha[]
  } catch (causa) {
    console.error('[transparencia] códigos da trilha:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/** O registro mais novo (maior versão) entre os que passam no filtro. */
export function maisNovo(codigos: CodigoDaTrilha[] | null, filtro: (c: CodigoDaTrilha) => boolean): CodigoDaTrilha | null {
  let achado: CodigoDaTrilha | null = null
  for (const c of codigos ?? []) if (filtro(c) && (!achado || c.versao > achado.versao)) achado = c
  return achado
}

/** Nome de quem enviou, publicou ou retirou, pelo cliente da pessoa (o RLS de profiles mostra quem divide o espaço). */
export async function nomesDasPessoas(supabase: Awaited<ReturnType<typeof createClient>>, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unicos.length) return new Map()
  const { data } = await supabase.from('profiles').select('id,full_name').in('id', unicos)
  return new Map(((data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name?.trim() || 'Conta sem nome']))
}

/** Hoje em São Paulo, AAAA-MM-DD — calculado no servidor para a tela não depender do relógio do navegador. */
export function hojeEmSaoPaulo(): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * De que versão da lista de canais é cada registro da trilha (a origem é o
 * espaço, a mesma para todas as versões). O banco diz a versão de cada registro
 * (versao_origem, lida do conteúdo registrado); sem ela, vale a versão mais
 * nova publicada até o instante do registro — o gancho registra na transação
 * da publicação, e a sincronização diária registra sempre a mais nova.
 */
export function registrosPorVersao(versoes: { id: string; versao?: number; publicado_em: string }[], codigos: CodigoDaTrilha[] | null): Map<string, CodigoDaTrilha> {
  const emOrdem = [...versoes].sort((a, b) => Date.parse(a.publicado_em) - Date.parse(b.publicado_em))
  const porVersao = new Map<string, CodigoDaTrilha>()
  for (const c of codigos ?? []) {
    const instante = Date.parse(c.registrado_em)
    let dona: string | null = null
    if (typeof c.versao_origem === 'number') dona = versoes.find((v) => v.versao === c.versao_origem)?.id ?? null
    else for (const v of emOrdem) if (Date.parse(v.publicado_em) <= instante) dona = v.id
    const anterior = dona ? porVersao.get(dona) : undefined
    if (dona && (!anterior || c.versao > anterior.versao)) porVersao.set(dona, c)
  }
  return porVersao
}
