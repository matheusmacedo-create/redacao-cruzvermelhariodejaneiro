import type { PautaDoCerebro, RespostaDoCerebro } from './contrato'

/**
 * Lê as pautas do Cérebro.
 *
 * Falha aqui nunca derruba a tela de Publicações: o hub é o trabalho da
 * equipe e não pode depender de outro serviço estar de pé. Sem Cérebro, a
 * seção some e o resto continua.
 */
const PADRAO = 'https://cerebrocruzvermelha.vercel.app'

function base(): string {
  return (process.env.CEREBRO_URL || PADRAO).replace(/\/$/, '')
}

export interface LeituraDoCerebro {
  pautas: PautaDoCerebro[]
  origem: RespostaDoCerebro['origem'] | null
  geradoEm: string | null
  erro: string | null
}

export async function lerPautas(limite = 12): Promise<LeituraDoCerebro> {
  const vazio: LeituraDoCerebro = { pautas: [], origem: null, geradoEm: null, erro: null }
  try {
    const cabecalhos: Record<string, string> = {}
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`

    const r = await fetch(`${base()}/api/pauta?limite=${limite}`, {
      headers: cabecalhos,
      // Cinco minutos: a coleta do Cérebro roda de 6 em 6 horas, então buscar
      // a cada render seria desperdício, e cache longo esconderia urgência.
      next: { revalidate: 300, tags: ['cerebro'] },
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return { ...vazio, erro: `O Cérebro respondeu ${r.status}.` }

    const d = (await r.json()) as RespostaDoCerebro
    return {
      pautas: Array.isArray(d.pautas) ? d.pautas : [],
      origem: d.origem ?? null,
      geradoEm: d.geradoEm ?? null,
      erro: null,
    }
  } catch (causa) {
    const motivo = causa instanceof Error && causa.name === 'TimeoutError'
      ? 'O Cérebro demorou para responder.'
      : 'Não foi possível falar com o Cérebro.'
    return { ...vazio, erro: motivo }
  }
}

export async function lerPauta(id: string): Promise<PautaDoCerebro | null> {
  try {
    const cabecalhos: Record<string, string> = {}
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`
    const r = await fetch(`${base()}/api/pauta?id=${encodeURIComponent(id)}`, {
      headers: cabecalhos,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return null
    const d = (await r.json()) as RespostaDoCerebro
    return d.pautas?.[0] ?? null
  } catch {
    return null
  }
}

export function urlDoCerebro(): string {
  return base()
}
