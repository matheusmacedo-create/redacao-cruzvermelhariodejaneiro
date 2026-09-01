import 'server-only'
import type { Client } from 'basic-ftp'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  baixarTexto, enviarArquivo, enviarNaRaizDoSite, type FtpConfig,
} from '@/lib/publicacao/ftp'
import { candidatosDeIndex } from '@/lib/site/formulario-newsletter'
import { temAnalytics } from '@/lib/site/analytics'
import { paginaDeNoticias, type NoticiaDoIndice } from '@/lib/site/indice-noticias'
import { fundirLinhaDoTempo, type ItemDaLinha } from '@/lib/site/linha-do-tempo'
import { gerarSitemap, gerarRobots, paginasFixas, ORIGEM_DO_SITE } from '@/lib/site/sitemap'

/**
 * A vitrine do site: o índice de notícias, o sitemap e o robots.
 *
 * "Vitrine" porque é o que se vê de fora — e o que tem de estar SEMPRE em dia
 * sem ninguém lembrar de nada. Esta função roda dentro da MESMA sessão de FTP
 * que acabou de publicar uma matéria: a notícia entra no ar e, no mesmo
 * fôlego, o índice a empilha e o sitemap a registra. Falha aqui não desfaz a
 * publicação — vira aviso, porque a matéria no ar vale mais do que o mapa.
 */

export type ResultadoDaVitrine = {
  indice: boolean
  sitemap: boolean
  robots: boolean
  noticias: number
  aviso?: string
}

/** As matérias publicadas deste espaço — é a matéria-prima do índice e do mapa. */
export async function noticiasPublicadas(workspaceId: string): Promise<(NoticiaDoIndice & { atualizadaEm: Date })[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('content_pieces')
    .select('title,subtitle,site_url,site_published_at,updated_at,created_at')
    .eq('workspace_id', workspaceId)
    .not('site_url', 'is', null)
    .order('site_published_at', { ascending: false, nullsFirst: false })
    .limit(500)
  return (data ?? [])
    .filter((p) => typeof p.site_url === 'string' && p.site_url.startsWith(ORIGEM_DO_SITE))
    .map((p) => {
      const publicada = new Date(p.site_published_at ?? p.updated_at ?? p.created_at ?? Date.now())
      return {
        titulo: String(p.title ?? 'Sem título'),
        descricao: (p.subtitle as string | null) ?? undefined,
        url: p.site_url as string,
        publicadaEm: publicada,
        atualizadaEm: new Date(p.updated_at ?? publicada),
      }
    })
}

/**
 * A vida nos outros canais, para a linha do tempo do jornal.
 *
 * Duas fontes: os destinos publicados pelo hub (têm canal, texto, link do
 * post e a data carimbada) e o registro de disparos, que cobre o tempo de
 * antes do hub. A fusão de-duplica — o hub grava nos dois lugares.
 */
export async function publicacoesDaLinhaDoTempo(workspaceId: string): Promise<ItemDaLinha[]> {
  const supabase = createAdminClient()

  const doHub: ItemDaLinha[] = []
  try {
    const { data } = await supabase
      .from('package_destinations')
      .select('canal,corpo,external_url,publicado_em,updated_at')
      .eq('workspace_id', workspaceId).eq('estado', 'publicada')
      .neq('canal', 'site_web')
      .order('publicado_em', { ascending: false, nullsFirst: false })
      .limit(120)
    for (const d of data ?? []) {
      doHub.push({
        canal: String(d.canal),
        texto: String(d.corpo ?? ''),
        url: (d.external_url as string | null) ?? undefined,
        quando: new Date(d.publicado_em ?? d.updated_at ?? Date.now()),
      })
    }
  } catch { /* fonte a menos, linha do tempo mais curta */ }

  const doRegistro: ItemDaLinha[] = []
  try {
    const { data } = await supabase
      .from('social_publications')
      .select('networks,body,results,created_at')
      .eq('workspace_id', workspaceId).eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(120)
    for (const linha of data ?? []) {
      const resultados = Array.isArray(linha.results) ? linha.results as Record<string, unknown>[] : []
      for (const rede of (linha.networks as string[] | null) ?? []) {
        const daRede = resultados.find((r) => String(r.platform ?? '') === rede)
        // Rede que falhou ou foi pulada não entra: a linha do tempo mostra o
        // que o público pôde ver, não o que tentamos.
        if (daRede && (daRede.success === false || daRede.skipped === true)) continue
        const url = typeof daRede?.post_url === 'string' && daRede.post_url ? daRede.post_url : undefined
        doRegistro.push({
          canal: rede,
          texto: String(linha.body ?? ''),
          url,
          quando: new Date(linha.created_at ?? Date.now()),
        })
      }
    }
  } catch { /* idem */ }

  // O hub vem primeiro: é a fonte com link e data carimbada por destino.
  return fundirLinhaDoTempo([doHub, doRegistro])
}

/**
 * Encontra a pasta do site no servidor.
 *
 * Primeiro a vizinha da pasta de notícias — é o arranjo real da Hostinger —,
 * depois os candidatos clássicos. Sempre confirmando pelo CONTEÚDO da home:
 * com acesso ao servidor inteiro, há mais index.html por aí do que se imagina.
 */
export async function descobrirRaizDoSite(client: Client, config: FtpConfig): Promise<string | null> {
  const doLado = config.baseDir.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
  const candidatos = [`${doLado === '/' ? '' : doLado}/index.html`]
  try {
    await client.cd('/')
    const naRaiz = (await client.list()).filter((i) => i.isDirectory).map((i) => i.name)
    let pastasDeDomains: string[] = []
    if (naRaiz.includes('domains')) {
      try {
        await client.cd('/domains')
        pastasDeDomains = (await client.list()).filter((i) => i.isDirectory).map((i) => i.name)
        await client.cd('/')
      } catch { /* segue com os demais */ }
    }
    candidatos.push(...candidatosDeIndex({ baseDir: config.baseDir, pastasDaRaiz: naRaiz, pastasDeDomains }))
  } catch { /* a lista de cima ainda vale */ }

  for (const caminho of [...new Set(candidatos)]) {
    try {
      const html = await baixarTexto(client, caminho)
      if (html.includes('newsletter-section') || temAnalytics(html)) {
        return caminho.slice(0, caminho.lastIndexOf('/')) || '/'
      }
    } catch { /* candidato sem home */ }
  }
  return null
}

/**
 * Regera e sobe o índice de notícias, o sitemap e o robots — na sessão dada.
 * Chamada ao fim de toda publicação de matéria e pelo botão de Configurações.
 */
export async function atualizarVitrine(
  client: Client,
  config: FtpConfig,
  workspaceId: string,
  agora: Date = new Date(),
  /**
   * A matéria que ACABOU de subir, quando a vitrine roda na mesma sessão da
   * publicação: o registro dela no banco só acontece depois, então sem isto a
   * primeira edição de cada matéria ficaria de fora do próprio índice.
   */
  recemPublicada?: NoticiaDoIndice,
): Promise<ResultadoDaVitrine> {
  const resultado: ResultadoDaVitrine = { indice: false, sitemap: false, robots: false, noticias: 0 }
  const problemas: string[] = []

  let noticias: (NoticiaDoIndice & { atualizadaEm: Date })[] = []
  try {
    noticias = await noticiasPublicadas(workspaceId)
  } catch {
    problemas.push('não consegui ler a lista de matérias publicadas')
  }
  if (recemPublicada) {
    noticias = [
      { ...recemPublicada, atualizadaEm: recemPublicada.publicadaEm },
      ...noticias.filter((n) => n.url !== recemPublicada.url),
    ]
  }
  resultado.noticias = noticias.length

  // A linha do tempo dos outros canais entra no mesmo jornal.
  let linhaDoTempo: ItemDaLinha[] = []
  try { linhaDoTempo = await publicacoesDaLinhaDoTempo(workspaceId) } catch { /* jornal sai sem a linha */ }

  // O índice mora na própria pasta de notícias (FTP_BASE_DIR).
  try {
    await enviarArquivo(client, config, 'index.html', Buffer.from(paginaDeNoticias(noticias, agora, linhaDoTempo), 'utf8'))
    resultado.indice = true
  } catch {
    problemas.push('o índice de notícias não subiu')
  }

  // Sitemap e robots moram na raiz do site.
  try {
    const raiz = await descobrirRaizDoSite(client, config)
    if (!raiz) throw new Error('raiz não encontrada')
    const entradas = [
      ...paginasFixas(),
      ...noticias.map((n) => ({ url: n.url, modificadaEm: n.atualizadaEm })),
    ]
    await enviarNaRaizDoSite(client, raiz, 'sitemap.xml', gerarSitemap(entradas))
    resultado.sitemap = true
    await enviarNaRaizDoSite(client, raiz, 'robots.txt', gerarRobots())
    resultado.robots = true
  } catch {
    problemas.push('sitemap/robots não subiram (a pasta do site não respondeu)')
  }

  if (problemas.length) resultado.aviso = problemas.join('; ')
  return resultado
}
