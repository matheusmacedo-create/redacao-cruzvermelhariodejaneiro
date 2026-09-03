import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { urlDoCerebro } from './cliente'

/**
 * "Explorar o assunto": mais sinais, imagens e o que a Casa já fez.
 *
 * Duas metades, pedidas SÓ quando o humano clica — nunca junto do mural:
 *
 * 1. O Cérebro devolve outros sinais do acervo que encostam no mesmo
 *    assunto (mesmo eixo, mesma conta, palavras do título), com a capa
 *    servida pelo cache dele.
 * 2. O banco da Redação devolve os pacotes da Casa cujo título divide
 *    palavras com a pauta — o "já falamos disso" com link para a peça.
 */

export interface RelacionadoDoCerebro {
  id: string
  titulo: string
  fonte: string
  conta: string | null
  quando: string
  url: string
  modo: string
  modoRotulo: string
  nota: number
  midia: string | null
}

export interface MateriaDaCasa {
  titulo: string
  url: string
  quando: string
  status: string
}

export interface Relacionados {
  doCerebro: RelacionadoDoCerebro[]
  daCasa: MateriaDaCasa[]
  erro: string | null
}

export async function lerRelacionados(workspaceId: string, sinalId: string): Promise<Relacionados> {
  let tituloAlvo = ''
  let doCerebro: RelacionadoDoCerebro[] = []
  try {
    const cabecalhos: Record<string, string> = {}
    if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`
    const r = await fetch(`${urlDoCerebro()}/api/relacionados?id=${encodeURIComponent(sinalId)}`, {
      headers: cabecalhos,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return { doCerebro: [], daCasa: [], erro: `O Cérebro respondeu ${r.status}.` }
    const d = (await r.json()) as { alvo?: { titulo?: string }; relacionados?: RelacionadoDoCerebro[] }
    tituloAlvo = d.alvo?.titulo ?? ''
    doCerebro = Array.isArray(d.relacionados) ? d.relacionados : []
  } catch (causa) {
    const motivo = causa instanceof Error && causa.name === 'TimeoutError'
      ? 'O Cérebro demorou para responder.'
      : 'Não foi possível falar com o Cérebro.'
    return { doCerebro: [], daCasa: [], erro: motivo }
  }

  // A metade da Casa nunca derruba a do Cérebro: sem banco, volta vazia.
  let daCasa: MateriaDaCasa[] = []
  try {
    const supabase = await createClient()
    const { data: pacotes, error } = await supabase
      .from('social_packages')
      .select('id,titulo_interno,status,updated_at')
      .eq('workspace_id', workspaceId)
      .neq('status', 'arquivado')
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) console.error('[cerebro/relacionados] pacotes:', error)

    const chaves = palavras(tituloAlvo)
    daCasa = (pacotes ?? [])
      .map((p) => ({ p, comuns: [...palavras(p.titulo_interno ?? '')].filter((w) => chaves.has(w)).length }))
      .filter((x) => x.comuns >= 2)
      .sort((a, b) => b.comuns - a.comuns)
      .slice(0, 6)
      .map(({ p }) => ({
        titulo: p.titulo_interno || 'Pacote sem título',
        url: `/redes/${p.id}`,
        quando: p.updated_at,
        status: p.status,
      }))
  } catch (causa) {
    console.error('[cerebro/relacionados] camada local falhou:', causa)
  }

  return { doCerebro, daCasa, erro: null }
}

function palavras(titulo: string): Set<string> {
  return new Set(
    titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4),
  )
}
