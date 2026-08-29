import 'server-only'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { parseContentBlocks } from '@/lib/content-blocks'
import { gerarSlug, slugDisponivel, slugValido } from '@/lib/site/slug'
import { montarPaginaDoArtigo, type ArquivoLocal } from '@/lib/site/artigo-html'
import { withFtp, enviarArquivo, FtpConfigError } from '@/lib/publicacao/ftp'

export type ResultadoDoSite = { erro?: string; url?: string; aviso?: string }

/** Endereço público da pasta que guarda as matérias. Sem ele não há canônica,
 * e sem canônica a publicação não serve ao propósito de SEO que a motivou. */
function baseDoSite(): string {
  const bruto = process.env.SITE_PUBLIC_BASE_URL?.trim()
  if (!bruto) {
    throw new Error('Falta a variável SITE_PUBLIC_BASE_URL — é o endereço público da pasta de matérias, e sem ele a página não teria endereço canônico.')
  }
  let url: URL
  try { url = new URL(bruto) } catch { throw new Error('SITE_PUBLIC_BASE_URL não é um endereço válido.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('SITE_PUBLIC_BASE_URL precisa começar com https://.')
  return bruto.replace(/\/+$/, '')
}

const EXTENSAO: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg',
}

/** Extrai o caminho de armazenamento de uma URL interna de mídia. */
function caminhoDaMidia(url: string): string | null {
  if (!url.startsWith('/api/private-blob?')) return null
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  const pathname = params.get('pathname')
  return pathname || null
}

export type PedidoDePublicacao = {
  workspaceId: string
  userId: string
  contentId: string
  /** Texto vindo da tela; presente, é salvo na peça antes de gerar a página. */
  titulo?: string
  subtitulo?: string
  corpo?: string
}

/**
 * Núcleo da publicação de uma matéria no site institucional.
 *
 * Vivia dentro da server action; saiu para cá porque o hub multicanal publica
 * a mesma página como job do destino site_web. A action e o job chamam o
 * mesmo caminho — dois geradores divergindo era questão de tempo.
 *
 * A página sobe como slug/index.html (endereço com barra no fim, uma canônica
 * só) e as mídias privadas do corpo sobem junto, com nome local.
 */
export async function publicarMateria(pedido: PedidoDePublicacao): Promise<ResultadoDoSite> {
  try {
    const supabase = await createClient()
    const base = baseDoSite()

    const { data: peca } = await supabase
      .from('content_pieces')
      .select('id,title,subtitle,body,slug,site_url')
      .eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId).maybeSingle()
    if (!peca) throw new Error('Conteúdo não encontrado neste espaço.')

    // Publica o que está na tela, não a última versão salva: o clique antes
    // do salvamento já produziu "a matéria precisa de texto" com o texto na
    // frente dos olhos.
    if (pedido.titulo || pedido.corpo) {
      peca.title = pedido.titulo || peca.title
      peca.subtitle = pedido.subtitulo || null
      peca.body = pedido.corpo || peca.body
      const { error: erroSalvar } = await supabase.from('content_pieces')
        .update({ title: peca.title, subtitle: peca.subtitle, body: peca.body, updated_at: new Date().toISOString() })
        .eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId)
      if (erroSalvar) throw new Error('Não foi possível salvar a matéria antes de publicar.')
    }

    if (!peca.title?.trim()) throw new Error('A matéria precisa de um título antes de virar página.')
    if (!peca.body?.trim()) throw new Error('A matéria precisa de texto antes de virar página. Escreva o texto e publique de novo.')

    let slug = peca.slug ?? ''
    if (!slug) {
      const desejado = gerarSlug(peca.title)
      if (!desejado) throw new Error('O título não gera um endereço válido. Use ao menos uma letra ou número.')
      const { data: usados } = await supabase
        .from('content_pieces').select('slug')
        .eq('workspace_id', pedido.workspaceId).not('slug', 'is', null)
      slug = slugDisponivel(desejado, (usados ?? []).map((u) => u.slug as string))
    }
    if (!slugValido(slug)) throw new Error(`O endereço "${slug}" não é válido para uma pasta do site.`)

    const blocos = parseContentBlocks(peca.body)
    const arquivos = new Map<string, ArquivoLocal>()
    const paraSubir: { nome: string; bytes: Buffer }[] = []
    let n = 0

    for (const bloco of blocos) {
      if (bloco.type !== 'image' && bloco.type !== 'video' && bloco.type !== 'audio') continue
      if (arquivos.has(bloco.url)) continue
      const pathname = caminhoDaMidia(bloco.url)
      if (!pathname) continue

      const { data: arquivo } = await supabase
        .from('files').select('content_type,status')
        .eq('workspace_id', pedido.workspaceId).eq('storage_path', pathname).maybeSingle()
      if (!arquivo || arquivo.status === 'deleted') continue

      const blob = await get(pathname, { access: 'private' })
      if (!blob) continue

      const tipo = arquivo.content_type || blob.blob.contentType || ''
      const extensao = EXTENSAO[tipo] || pathname.slice(pathname.lastIndexOf('.')) || ''
      const nome = `midia-${++n}${extensao}`
      const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer())

      arquivos.set(bloco.url, { nome, alt: bloco.alt })
      paraSubir.push({ nome, bytes })
    }

    const agora = new Date()
    const html = montarPaginaDoArtigo({
      titulo: peca.title,
      subtitulo: peca.subtitle,
      corpo: peca.body,
      slug,
      baseUrl: base,
      publicadoEm: agora,
      arquivos,
    })

    await withFtp(async (client, config) => {
      for (const arquivo of paraSubir) {
        await enviarArquivo(client, config, `${slug}/${arquivo.nome}`, arquivo.bytes)
      }
      await enviarArquivo(client, config, `${slug}/index.html`, html)
    })

    const url = `${base}/${slug}/`

    let aviso: string | undefined
    try {
      const resposta = await fetch(url, { cache: 'no-store', redirect: 'follow' })
      if (!resposta.ok) {
        aviso = `Os arquivos subiram, mas ${url} respondeu ${resposta.status}. A pasta do FTP provavelmente está fora de public_html — confira FTP_BASE_DIR em /api/admin/ftp-check.`
      }
    } catch {
      aviso = `Os arquivos subiram, mas não consegui abrir ${url} daqui para conferir. Abra no navegador.`
    }

    const { error } = await supabase.from('content_pieces').update({
      slug,
      site_url: url,
      site_published_at: agora.toISOString(),
      updated_at: agora.toISOString(),
    }).eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId)
    if (error) throw new Error('A página subiu, mas não consegui registrar o endereço aqui.')

    await supabase.from('activity_log').insert({
      workspace_id: pedido.workspaceId,
      actor_id: pedido.userId,
      action: 'site_published',
      entity_type: 'content',
      entity_id: pedido.contentId,
      metadata: { url, midias: paraSubir.length },
    })

    return { url, aviso }
  } catch (causa) {
    if (causa instanceof FtpConfigError) {
      return { erro: `${causa.message} Cadastre-as em Vercel → Environment Variables.` }
    }
    const bruto = causa instanceof Error ? causa.message : String(causa)
    // O erro cru do Node ("Hostname/IP does not match certificate's altnames")
    // é correto e inútil para quem está na tela. Traduzimos para a ação.
    if (/does not match certificate|ERR_TLS_CERT_ALTNAME/i.test(bruto)) {
      return {
        erro: 'O servidor de FTP recusou a conexão segura: FTP_HOST está com o IP do servidor,'
          + ' e o certificado dele só vale para o nome. Abra /api/admin/ftp-check — a etapa'
          + ' "certificado do servidor" mostra o nome certo — e troque FTP_HOST para esse nome'
          + ' em Vercel → Environment Variables.',
      }
    }
    const limpo = process.env.FTP_PASSWORD
      ? bruto.split(process.env.FTP_PASSWORD).join('«senha»')
      : bruto
    return { erro: limpo.slice(0, 500) }
  }
}
