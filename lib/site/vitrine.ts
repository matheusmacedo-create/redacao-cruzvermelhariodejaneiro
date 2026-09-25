import 'server-only'
import type { Client } from 'basic-ftp'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  baixarTexto, enviarArquivo, enviarNaRaizDoSite, enviarPastaFixaNaRaiz, type FtpConfig,
} from '@/lib/publicacao/ftp'
import { candidatosDeIndex } from '@/lib/site/formulario-newsletter'
import { temAnalytics } from '@/lib/site/analytics'
import { paginaDeNoticias, type NoticiaDoIndice } from '@/lib/site/indice-noticias'
import { fundirLinhaDoTempo, type ItemDaLinha } from '@/lib/site/linha-do-tempo'
import { gerarSitemap, gerarRobots, paginasFixas, ORIGEM_DO_SITE, type EntradaDoMapa } from '@/lib/site/sitemap'
import { HTACCESS_DAS_NOTICIAS } from '@/lib/site/cache-do-site'
import { paginaDePrivacidade, paginaDeTermos } from '@/lib/site/juridico'
import { prepararChatDoSite } from '@/lib/site/chat-do-site'
import { medidasDoCabecalho } from '@/lib/site/medidas-da-imagem'
import { itensPublicosDoAcervo } from '@/lib/acervo/dados'
import { entradasDoAcervoNoMapa } from '@/lib/acervo/paginas'

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

/** Uma matéria no ar: o que o índice mostra, mais o que o sitemap precisa. */
export type NoticiaPublicada = NoticiaDoIndice & {
  id?: string
  /** A última mudança de conteúdo (dateModified): o <lastmod> do sitemap. */
  atualizadaEm: Date
}

const POR_LEITURA = 1000
const TETO_DE_LEITURAS = 20

/** O endereço da matéria no domínio do site, sem www (o www responde 301 para ele). Nulo se for de outro lugar. */
function enderecoNoSite(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const m = /^https?:\/\/(?:www\.)?cruzvermelhariodejaneiro\.org(\/.*)$/i.exec(url.trim())
  return m ? `${ORIGEM_DO_SITE}${m[1]}` : null
}

/**
 * As matérias publicadas deste espaço — a matéria-prima do índice e do mapa.
 * Todas: a leitura vem em páginas (o Supabase devolve no máximo mil linhas por
 * pedido). Se a leitura falhar, LANÇA — lista vazia por erro de banco
 * publicaria um índice sem notícia nenhuma.
 */
export async function noticiasPublicadas(workspaceId: string): Promise<NoticiaPublicada[]> {
  const supabase = createAdminClient()
  const linhas: Record<string, unknown>[] = []
  for (let n = 0; n < TETO_DE_LEITURAS; n++) {
    const { data, error } = await supabase
      .from('content_pieces')
      .select('id,title,subtitle,site_url,site_cover_url,site_published_at,updated_at,created_at')
      .eq('workspace_id', workspaceId)
      .not('site_url', 'is', null)
      .order('site_published_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(n * POR_LEITURA, (n + 1) * POR_LEITURA - 1)
    if (error) throw new Error('Não foi possível ler as matérias publicadas.')
    linhas.push(...(data ?? []))
    if ((data ?? []).length < POR_LEITURA) break
  }
  const saida: NoticiaPublicada[] = []
  for (const p of linhas) {
    const url = enderecoNoSite(p.site_url)
    if (!url) continue
    const publicada = new Date((p.site_published_at ?? p.updated_at ?? p.created_at ?? Date.now()) as string)
    const editada = p.updated_at ? new Date(p.updated_at as string) : publicada
    saida.push({
      id: p.id as string,
      titulo: String(p.title ?? 'Sem título'),
      descricao: (p.subtitle as string | null) ?? undefined,
      url,
      capa: (p.site_cover_url as string | null) ?? undefined,
      publicadaEm: publicada,
      atualizadaEm: editada.getTime() > publicada.getTime() ? editada : publicada,
    })
  }
  return saida
}

/**
 * As medidas de uma imagem publicada, lidas dos primeiros 64 KB dela.
 * Nulo quando o site não responde a tempo ou o formato não é reconhecido.
 */
export async function medidasDaImagemRemota(url: string, tempoLimiteMs = 3000): Promise<{ largura: number; altura: number } | null> {
  try {
    const resposta = await fetch(url, { headers: { Range: 'bytes=0-65535' }, cache: 'no-store', signal: AbortSignal.timeout(tempoLimiteMs) })
    if (!resposta.ok || !resposta.body) return null
    const leitor = resposta.body.getReader()
    const pedacos: Uint8Array[] = []
    let total = 0
    while (total < 65536) {
      const { done, value } = await leitor.read()
      if (done || !value) break
      pedacos.push(value)
      total += value.length
    }
    await leitor.cancel().catch(() => undefined)
    const bytes = new Uint8Array(total)
    let i = 0
    for (const p of pedacos) { bytes.set(p, i); i += p.length }
    return medidasDoCabecalho(bytes)
  } catch {
    return null
  }
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
      // E-mail não tem página para linkar: a newsletter entrava na linha do
      // tempo pública com um "link" que apontava para lugar nenhum.
      .neq('canal', 'newsletter')
      .order('publicado_em', { ascending: false, nullsFirst: false })
      .limit(120)
    for (const d of data ?? []) {
      // external_url nem sempre é endereço: a newsletter grava ali "12
      // destinatários", e o hub lê isso como texto. Na página pública só vale
      // o que abre no navegador.
      const url = typeof d.external_url === 'string' && d.external_url.startsWith('http')
        ? d.external_url
        : undefined
      doHub.push({
        canal: String(d.canal),
        texto: String(d.corpo ?? ''),
        url,
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

/** /privacidade/ e /termos/, na raiz do site, na sessão dada. */
export async function publicarPaginasJuridicas(client: Client, raiz: string, agora: Date = new Date()): Promise<void> {
  const chat = await prepararChatDoSite()
  await enviarPastaFixaNaRaiz(client, raiz, 'privacidade', paginaDePrivacidade(agora, chat))
  await enviarPastaFixaNaRaiz(client, raiz, 'termos', paginaDeTermos(agora, chat))
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
  recemPublicada?: NoticiaPublicada,
): Promise<ResultadoDaVitrine> {
  const resultado: ResultadoDaVitrine = { indice: false, sitemap: false, robots: false, noticias: 0 }
  const problemas: string[] = []
  const chat = await prepararChatDoSite()

  // Sem a lista, o índice e o sitemap ficam como estão: regerar com a lista
  // vazia tiraria do ar a vitrine inteira por causa de uma leitura que falhou.
  let noticias: NoticiaPublicada[] | null = null
  try {
    noticias = await noticiasPublicadas(workspaceId)
  } catch {
    problemas.push('não consegui ler a lista de matérias publicadas — o índice e o sitemap ficaram como estavam')
  }
  if (noticias && recemPublicada) {
    noticias = [recemPublicada, ...noticias.filter((n) => n.url !== recemPublicada.url)]
  }
  resultado.noticias = noticias?.length ?? 0

  if (noticias) {
    // A linha do tempo dos outros canais entra no mesmo jornal.
    let linhaDoTempo: ItemDaLinha[] = []
    try { linhaDoTempo = await publicacoesDaLinhaDoTempo(workspaceId) } catch { /* jornal sai sem a linha */ }

    // O og:image do índice é a capa da matéria mais nova, com as medidas: as
    // da publicação que acabou de acontecer ou, na falta, lidas do arquivo.
    const mancheteAtual = [...noticias].sort((a, b) => b.publicadaEm.getTime() - a.publicadaEm.getTime())[0]
    if (mancheteAtual?.capa && !(mancheteAtual.capaLargura && mancheteAtual.capaAltura)) {
      const medidas = await medidasDaImagemRemota(mancheteAtual.capa)
      if (medidas) noticias = noticias.map((n) => (n === mancheteAtual ? { ...n, capaLargura: medidas.largura, capaAltura: medidas.altura } : n))
    }

    // O índice mora na própria pasta de notícias (FTP_BASE_DIR).
    try {
      await enviarArquivo(client, config, 'index.html', Buffer.from(paginaDeNoticias(noticias, agora, linhaDoTempo, chat), 'utf8'))
      resultado.indice = true
    } catch {
      problemas.push('o índice de notícias não subiu')
    }
  }

  // As regras de cache da pasta: sem elas o navegador guarda a página velha
  // por tempo indeterminado — e o jornal novo fica invisível para quem já
  // visitou. Sobe em toda regeneração; é idempotente e pesa nada.
  try {
    await enviarArquivo(client, config, '.htaccess', Buffer.from(HTACCESS_DAS_NOTICIAS, 'utf8'))
  } catch {
    problemas.push('as regras de cache (.htaccess) não subiram')
  }

  // Sitemap e robots moram na raiz do site.
  if (noticias) {
    try {
      const raiz = await descobrirRaizDoSite(client, config)
      if (!raiz) throw new Error('raiz não encontrada')
      await regerarMapaDoSite(client, raiz, workspaceId, noticias)
      resultado.sitemap = true
      resultado.robots = true
    } catch {
      problemas.push('sitemap/robots não subiram (a pasta do site não respondeu)')
    }
  }

  if (problemas.length) resultado.aviso = problemas.join('; ')
  return resultado
}

/**
 * O sitemap.xml e o robots.txt da raiz do site: as páginas fixas, as notícias e o acervo público
 * (coleções e itens, com a imagem de cada um). Chamada pela vitrine, a cada matéria, e pela
 * publicação do acervo — assim uma nunca apaga do mapa o que a outra pôs.
 *
 * O <lastmod> de cada notícia é a última mudança de CONTEÚDO dela (dateModified), não a hora em
 * que a página foi regravada: regerar todas as páginas com um molde novo não é notícia nova, e o
 * Google para de confiar no lastmod de quem o muda sem motivo.
 */
export async function regerarMapaDoSite(
  client: Client,
  raiz: string,
  workspaceId: string,
  noticias?: NoticiaPublicada[],
): Promise<void> {
  // Sem a lista de matérias, o mapa sairia sem as notícias: melhor não mexer nele.
  const lista = noticias ?? await noticiasPublicadas(workspaceId)
  let acervo: EntradaDoMapa[] = []
  try { acervo = entradasDoAcervoNoMapa(await itensPublicosDoAcervo(workspaceId)) } catch { /* o /acervo/ fixo continua no mapa */ }
  const entradas: EntradaDoMapa[] = [
    ...paginasFixas(),
    ...lista.map((n) => ({ url: n.url, modificadaEm: n.atualizadaEm })),
    ...acervo,
  ]
  await enviarNaRaizDoSite(client, raiz, 'sitemap.xml', gerarSitemap(entradas))
  await enviarNaRaizDoSite(client, raiz, 'robots.txt', gerarRobots())
}
