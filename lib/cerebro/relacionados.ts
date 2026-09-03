import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { claudeConfigurado, modeloDoClaude, semChaveDoClaude } from '@/lib/ia/anthropic'
import { urlDoCerebro } from './cliente'

/**
 * "Explorar o assunto": o mergulho inteligente numa história.
 *
 * O caminho é o de um repórter: primeiro extrair as palavras que DEFINEM o
 * assunto — com o Claude quando a chave existe, senão por estatística — e
 * então buscar por elas em três lugares, com os MESMOS termos:
 *
 * 1. Na imprensa (Google Notícias): outras matérias publicadas sobre isso.
 * 2. No acervo do Cérebro: outros sinais das contas oficiais, com imagem.
 * 3. Na Casa: pacotes da Redação que tocaram o assunto.
 *
 * A primeira versão media afinidade por eixo — e "saúde mental na Maré"
 * trazia congelamento de leite materno para o painel, porque tudo era
 * "saúde". Palavra do assunto agora é obrigatória em todas as metades.
 *
 * Tudo roda SÓ quando o humano clica: são chamadas caras (IA + duas buscas)
 * e o mural nunca paga esse custo.
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

export interface MateriaNaImprensa {
  titulo: string
  fonte: string
  url: string
  quando: string
}

export interface MateriaDaCasa {
  titulo: string
  url: string
  quando: string
  status: string
}

export interface Relacionados {
  /** Os termos que definiram a busca — a UI os mostra para prestar contas. */
  palavras: string[]
  naImprensa: MateriaNaImprensa[]
  doCerebro: RelacionadoDoCerebro[]
  daCasa: MateriaDaCasa[]
  erro: string | null
}

const TIMEOUT_MS = 12_000

export async function lerRelacionados(
  workspaceId: string,
  alvo: { id: string; titulo: string; resumo: string },
): Promise<Relacionados> {
  const palavras = await extrairPalavras(alvo.titulo, alvo.resumo)

  // As três buscas usam os mesmos termos e falham cada uma sozinha: um
  // painel com duas metades vale mais que nenhum painel.
  const [naImprensa, doCerebro, daCasa] = await Promise.all([
    buscarNaImprensa(palavras).catch((e) => {
      console.error('[relacionados] imprensa:', e)
      return [] as MateriaNaImprensa[]
    }),
    buscarNoCerebro(alvo.id, palavras).catch((e) => {
      console.error('[relacionados] cérebro:', e)
      return [] as RelacionadoDoCerebro[]
    }),
    buscarNaCasa(workspaceId, palavras).catch((e) => {
      console.error('[relacionados] casa:', e)
      return [] as MateriaDaCasa[]
    }),
  ])

  return { palavras, naImprensa, doCerebro, daCasa, erro: null }
}

/* ------------------------------------------------------------------ */
/* 1. As palavras que definem o assunto                                */
/* ------------------------------------------------------------------ */

async function extrairPalavras(titulo: string, resumo: string): Promise<string[]> {
  const texto = `${titulo}\n${resumo}`.slice(0, 1200)

  if (claudeConfigurado()) {
    try {
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API?.trim(),
      })
      const inicio = Date.now()
      const r = await client.messages.create(
        {
          model: modeloDoClaude(),
          max_tokens: 200,
          output_config: { effort: 'low' },
          system:
            'Você extrai termos de busca de notícias para uma redação no Rio de Janeiro. ' +
            'Dado o texto de um post ou notícia, devolva os 2 a 4 termos que definem O ASSUNTO ' +
            '(tema central, nomes próprios, lugar quando importar). Nada genérico ("novidade", ' +
            '"atenção", "hoje"), nada de hashtag ou emoji. Responda APENAS com JSON no formato ' +
            '{"termos": ["...", "..."]} — cada termo com 1 a 3 palavras, em português.',
          messages: [{ role: 'user', content: texto }],
        },
        { timeout: 15_000 },
      )
      const bruto = r.content.find((b) => b.type === 'text')?.text ?? ''
      const json = bruto.match(/\{[\s\S]*\}/)?.[0]
      const termos = json ? ((JSON.parse(json) as { termos?: unknown }).termos ?? []) : []
      const validos = (Array.isArray(termos) ? termos : [])
        .filter((t): t is string => typeof t === 'string' && t.trim().length >= 3)
        .map((t) => t.trim())
        .slice(0, 4)
      console.log(`[relacionados] termos via ${r.model} em ${((Date.now() - inicio) / 1000).toFixed(1)}s:`, validos.join(' · '))
      if (validos.length >= 2) return validos
    } catch (causa) {
      // Sem IA a busca continua — só menos afiada. O erro vai ao log sem a chave.
      console.error('[relacionados] extração com Claude falhou:', semChaveDoClaude(String(causa)))
    }
  }
  return palavrasEstatisticas(titulo, resumo)
}

/** Sem chave de IA: as palavras raras do título mandam, resumo completa. */
function palavrasEstatisticas(titulo: string, resumo: string): string[] {
  const doTitulo = significativas(titulo)
  const doResumo = significativas(resumo.slice(0, 300)).filter((w) => !doTitulo.includes(w))
  return [...doTitulo.slice(0, 3), ...doResumo.slice(0, 1)]
}

const VAZIAS = new Set([
  'sobre', 'quando', 'porque', 'ainda', 'tambem', 'muito', 'muita', 'todos', 'todas', 'outro',
  'outra', 'outros', 'outras', 'entre', 'desde', 'depois', 'antes', 'durante', 'contra', 'gente',
  'coisa', 'coisas', 'fazer', 'feito', 'feita', 'temos', 'estao', 'sendo', 'foram', 'seria',
  'vamos', 'poder', 'podem', 'confira', 'saiba', 'veja', 'acesse', 'clique', 'hoje', 'amanha',
  'semana', 'sexta', 'sabado', 'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'feira',
  'nesta', 'neste', 'dessa', 'desse', 'pelas', 'pelos', 'junto', 'conta', 'contam', 'vizinhos',
])

function significativas(texto: string): string[] {
  const vistas = new Set<string>()
  const saida: string[] = []
  for (const palavra of texto.split(/\s+/)) {
    const limpa = palavra.replace(/[^\p{L}0-9-]/gu, '')
    const chave = limpa.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (limpa.length > 4 && !VAZIAS.has(chave) && !vistas.has(chave)) {
      vistas.add(chave)
      saida.push(limpa)
    }
  }
  return saida
}

/* ------------------------------------------------------------------ */
/* 2. Na imprensa — Google Notícias                                    */
/* ------------------------------------------------------------------ */

/**
 * Busca as matérias publicadas sobre o assunto no Google Notícias (RSS,
 * pt-BR). Uso interno de triagem, volume de um clique por vez, e cada link
 * leva a pessoa à matéria original — nada é copiado nem republicado.
 * Quando a busca com todos os termos seca, tenta só com os dois primeiros.
 */
async function buscarNaImprensa(palavras: string[]): Promise<MateriaNaImprensa[]> {
  if (palavras.length === 0) return []
  const tentativas = [palavras, palavras.slice(0, 2)]
  for (const termos of tentativas) {
    const q = encodeURIComponent(termos.join(' '))
    const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; redacao-cvrj)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!r.ok) throw new Error(`Google Notícias respondeu ${r.status}`)
    const materias = lerRSSDeNoticias(await r.text())
    if (materias.length > 0) return materias.slice(0, 6)
  }
  return []
}

function lerRSSDeNoticias(xml: string): MateriaNaImprensa[] {
  const itens: MateriaNaImprensa[] = []
  for (const bloco of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const cru = campo(bloco, 'title')
    const url = campo(bloco, 'link')
    const fonte = campo(bloco, 'source') || ''
    if (!cru || !url) continue
    // O título do Google vem "Manchete - Fonte"; a fonte já tem coluna própria.
    const titulo = fonte && cru.endsWith(` - ${fonte}`) ? cru.slice(0, -(fonte.length + 3)) : cru
    itens.push({ titulo, fonte: fonte || 'imprensa', url, quando: campo(bloco, 'pubDate') ?? '' })
  }
  return itens
}

function campo(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i'))
  if (!m) return null
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim() || null
}

/* ------------------------------------------------------------------ */
/* 3. No acervo do Cérebro — com os mesmos termos                      */
/* ------------------------------------------------------------------ */

async function buscarNoCerebro(sinalId: string, palavras: string[]): Promise<RelacionadoDoCerebro[]> {
  const cabecalhos: Record<string, string> = {}
  if (process.env.CEREBRO_TOKEN) cabecalhos.Authorization = `Bearer ${process.env.CEREBRO_TOKEN}`
  const q = palavras.length ? `&q=${encodeURIComponent(palavras.join(' '))}` : ''
  const r = await fetch(`${urlDoCerebro()}/api/relacionados?id=${encodeURIComponent(sinalId)}${q}`, {
    headers: cabecalhos,
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`O Cérebro respondeu ${r.status}`)
  const d = (await r.json()) as { relacionados?: RelacionadoDoCerebro[] }
  return Array.isArray(d.relacionados) ? d.relacionados : []
}

/* ------------------------------------------------------------------ */
/* 4. Na Casa — pacotes que tocaram o assunto                          */
/* ------------------------------------------------------------------ */

async function buscarNaCasa(workspaceId: string, palavras: string[]): Promise<MateriaDaCasa[]> {
  if (palavras.length === 0) return []
  const supabase = await createClient()
  const { data: pacotes, error } = await supabase
    .from('social_packages')
    .select('id,titulo_interno,status,updated_at')
    .eq('workspace_id', workspaceId)
    .neq('status', 'arquivado')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) throw error

  const chaves = palavras.flatMap((t) => t.split(/\s+/)).map(normaliza).filter((w) => w.length > 3)
  return (pacotes ?? [])
    .map((p) => {
      const titulo = normaliza(p.titulo_interno ?? '')
      return { p, comuns: chaves.filter((w) => titulo.includes(w)).length }
    })
    .filter((x) => x.comuns >= 1)
    .sort((a, b) => b.comuns - a.comuns)
    .slice(0, 6)
    .map(({ p }) => ({
      titulo: p.titulo_interno || 'Pacote sem título',
      url: `/redes/${p.id}`,
      quando: p.updated_at,
      status: p.status,
    }))
}

function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
