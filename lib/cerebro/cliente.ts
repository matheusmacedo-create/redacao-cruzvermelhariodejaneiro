import type { MotivoRecusa, PautaDoCerebro, RespostaDoCerebro } from './contrato'

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

export async function lerPautas(limite = 12, modo?: string): Promise<LeituraDoCerebro> {
  const vazio: LeituraDoCerebro = { pautas: [], origem: null, geradoEm: null, erro: null }
  try {
    const cabecalhos: Record<string, string> = {}
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`

    // Sem modo, o Cérebro devolve o que pede ação: agir agora, produzir, agendar.
    const filtro = modo ? `&modo=${encodeURIComponent(modo)}` : ''
    const r = await fetch(`${base()}/api/pauta?limite=${limite}${filtro}`, {
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

/**
 * Devolve a decisão humana ao Cérebro.
 *
 * Recusar aqui não esconde um cartão: grava o motivo lá, e o motivo é o que
 * ensina — o sinal sai de todas as leituras seguintes e a fonte perde força
 * quando o motivo é repetição. Sem este laço a Redação diria "não" para a
 * mesma sugestão todos os dias.
 */
export async function enviarRecusa(id: string, motivo: MotivoRecusa): Promise<{ erro?: string }> {
  try {
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' }
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`
    const r = await fetch(`${base()}/api/feedback`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({ id, motivo }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      return { erro: d.erro ?? `O Cérebro respondeu ${r.status}.` }
    }
    return {}
  } catch (causa) {
    const motivoErro = causa instanceof Error && causa.name === 'TimeoutError'
      ? 'O Cérebro demorou para responder.'
      : 'Não foi possível falar com o Cérebro.'
    return { erro: motivoErro }
  }
}

/**
 * Devolve o "sim" ao Cérebro: o sinal virou pacote (`pautado`) ou a peça foi
 * ao ar (`publicado`).
 *
 * Sem este evento o Cérebro só ouvia "não" — e seguia sugerindo o que a Casa
 * acabara de publicar. Falha aqui não pode travar a importação nem a
 * publicação: o laço é melhoria, não pré-requisito.
 */
export async function enviarAceite(
  id: string,
  evento: 'pautado' | 'publicado',
  extra: { pacoteId?: string; url?: string | null; canais?: string[] } = {},
): Promise<{ erro?: string }> {
  try {
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' }
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`
    const r = await fetch(`${base()}/api/feedback`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        id,
        evento,
        ...(extra.pacoteId ? { pacoteId: extra.pacoteId } : {}),
        ...(extra.url?.startsWith('http') ? { url: extra.url } : {}),
        ...(extra.canais?.length ? { canais: extra.canais } : {}),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) return { erro: `O Cérebro respondeu ${r.status}.` }
    return {}
  } catch {
    return { erro: 'Não foi possível falar com o Cérebro.' }
  }
}

/** Desfaz uma recusa. Errar o clique não pode custar a pauta. */
export async function desfazerRecusa(id: string): Promise<{ erro?: string }> {
  try {
    const cabecalhos: Record<string, string> = {}
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`
    const r = await fetch(`${base()}/api/feedback?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: cabecalhos,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return { erro: `O Cérebro respondeu ${r.status}.` }
    return {}
  } catch {
    return { erro: 'Não foi possível falar com o Cérebro.' }
  }
}
