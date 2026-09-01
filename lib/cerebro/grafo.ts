import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { urlDoCerebro } from './cliente'

/**
 * O grafo da aba Cérebro — o Cérebro entrega o que sabe, a Redação soma o
 * que fez com aquilo.
 *
 * O contrato de nós/arestas espelha /api/grafo do Cérebro. Por cima dele
 * entram duas camadas locais: os pacotes do hub nascidos de um sinal
 * (social_packages.cerebro_sinal_id) e os canais onde cada pacote foi de
 * fato publicado (package_destinations.estado = 'publicada'). Sinal que já
 * saiu do acervo do Cérebro mas virou pacote continua no mapa como memória —
 * o repertório do que foi agregado não roda com a janela de coleta.
 */

export type TipoDeNo =
  | 'eixo'
  | 'conta'
  | 'fonte'
  | 'sinal'
  | 'data'
  | 'proposta'
  | 'pacote'
  | 'canal'

export interface NoDoGrafo {
  id: string
  tipo: TipoDeNo
  rotulo: string
  categoria?: string
  vinculo?: string
  interna?: boolean
  nota?: number
  modo?: string
  modoRotulo?: string
  quando?: string
  url?: string
  agrupados?: number
  recusado?: string
  dias?: number
  /** Pacote: status do hub. Sinal: true quando só existe pela importação. */
  status?: string
  foraDoAcervo?: boolean
}

export type TipoDeAresta =
  | 'publicou'
  | 'encosta'
  | 'cobre'
  | 'marca'
  | 'sugere'
  | 'importou'
  | 'saiu'

export interface ArestaDoGrafo {
  de: string
  para: string
  tipo: TipoDeAresta
}

export interface Grafo {
  nos: NoDoGrafo[]
  arestas: ArestaDoGrafo[]
  origem: 'apify' | 'seed' | null
  geradoEm: string | null
  erro: string | null
}

const CANAIS: Record<string, string> = {
  site_web: 'Site',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  newsletter: 'Newsletter',
}

export async function lerGrafo(workspaceId: string): Promise<Grafo> {
  const vazio: Grafo = { nos: [], arestas: [], origem: null, geradoEm: null, erro: null }

  // 1. O que o Cérebro sabe. Sem ele não há mapa — as camadas locais são
  //    anotações sobre os sinais dele, não um grafo próprio.
  let base: { nos: NoDoGrafo[]; arestas: ArestaDoGrafo[]; origem: 'apify' | 'seed'; geradoEm: string }
  try {
    const cabecalhos: Record<string, string> = {}
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`
    const r = await fetch(`${urlDoCerebro()}/api/grafo`, {
      headers: cabecalhos,
      next: { revalidate: 300, tags: ['cerebro'] },
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) return { ...vazio, erro: `O Cérebro respondeu ${r.status}.` }
    base = (await r.json()) as typeof base
    if (!Array.isArray(base.nos) || !Array.isArray(base.arestas)) {
      return { ...vazio, erro: 'O Cérebro respondeu num formato que esta versão não conhece.' }
    }
  } catch (causa) {
    const motivo = causa instanceof Error && causa.name === 'TimeoutError'
      ? 'O Cérebro demorou para responder.'
      : 'Não foi possível falar com o Cérebro.'
    return { ...vazio, erro: motivo }
  }

  const nos = [...base.nos]
  const arestas = [...base.arestas]
  const ids = new Set(nos.map((n) => n.id))

  // 2. A camada da Redação. Falha aqui não derruba o mapa: o grafo do
  //    Cérebro aparece sem a camada local, e o erro fica registrado no log.
  try {
    const supabase = await createClient()
    const { data: pacotes } = await supabase
      .from('social_packages')
      .select('id,titulo_interno,status,cerebro_sinal_id')
      .eq('workspace_id', workspaceId)
      .not('cerebro_sinal_id', 'is', null)
      .neq('status', 'arquivado')
      .order('updated_at', { ascending: false })
      .limit(200)

    if (pacotes && pacotes.length > 0) {
      const { data: destinos } = await supabase
        .from('package_destinations')
        .select('package_id,canal,estado,external_url')
        .eq('workspace_id', workspaceId)
        .eq('estado', 'publicada')
        .in('package_id', pacotes.map((p) => p.id))

      for (const p of pacotes) {
        const idSinal = `sinal:${p.cerebro_sinal_id}`
        // O acervo do Cérebro roda com a coleta; o que a equipe importou não
        // pode sumir do mapa junto. O sinal volta como nó de memória.
        if (!ids.has(idSinal)) {
          ids.add(idSinal)
          nos.push({
            id: idSinal,
            tipo: 'sinal',
            rotulo: p.titulo_interno || 'Sinal importado',
            foraDoAcervo: true,
          })
        }
        const idPacote = `pacote:${p.id}`
        ids.add(idPacote)
        nos.push({
          id: idPacote,
          tipo: 'pacote',
          rotulo: p.titulo_interno || 'Pacote',
          status: p.status,
          url: `/redes/${p.id}`,
        })
        arestas.push({ de: idSinal, para: idPacote, tipo: 'importou' })

        // Feed e stories são o mesmo canal Instagram: uma aresta, não duas.
        const canaisDoPacote = new Set(
          (destinos ?? []).filter((d) => d.package_id === p.id).map((d) => d.canal),
        )
        for (const canal of canaisDoPacote) {
          const idCanal = `canal:${canal}`
          if (!ids.has(idCanal)) {
            ids.add(idCanal)
            nos.push({ id: idCanal, tipo: 'canal', rotulo: CANAIS[canal] ?? canal })
          }
          arestas.push({ de: idPacote, para: idCanal, tipo: 'saiu' })
        }
      }
    }
  } catch (causa) {
    console.error('[cerebro/grafo] camada local falhou:', causa)
  }

  return { nos, arestas, origem: base.origem ?? null, geradoEm: base.geradoEm ?? null, erro: null }
}
