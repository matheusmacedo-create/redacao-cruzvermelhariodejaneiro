import 'server-only'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { parseContentBlocks } from '@/lib/content-blocks'
import { gerarSlug, slugDigitado, slugDisponivel, slugValido } from '@/lib/site/slug'
import { nomeSeoDaMidia } from '@/lib/site/nome-da-midia'
import { montarPaginaDoArtigo, type ArquivoLocal, type NoticiaRelacionada } from '@/lib/site/artigo-html'
import { withFtp, enviarArquivo, removerPastaDeMateria, FtpConfigError } from '@/lib/publicacao/ftp'
import { atualizarVitrine, noticiasPublicadas } from '@/lib/site/vitrine'

export type ResultadoDoSite = {
  erro?: string
  url?: string
  aviso?: string
  /** O que a conferência pós-publicação viu: true = página no ar, false = o
   *  endereço público respondeu erro, undefined = não deu para conferir. */
  paginaNoAr?: boolean
  /**
   * As imagens que subiram junto com a página, já no endereço público.
   *
   * Existe para a newsletter: cliente de e-mail não autentica, então a capa da
   * edição não pode sair da Biblioteca (que é privada) — tem de ser uma URL
   * que qualquer um abre. Publicar no site é o que torna essas imagens
   * públicas, e é daqui que a remessa pega a primeira.
   *
   * Só imagens: vídeo não se exibe em e-mail.
   */
  imagens?: string[]
}

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
  /**
   * Endereço pedido à mão. Só vale na primeira publicação: depois de a página
   * existir, trocar o endereço quebra todo link já compartilhado e deixa a
   * versão antiga órfã no servidor.
   */
  slug?: string
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
      // O endereço pedido à mão ganha do título; sem ele, o título manda.
      const pedidoLimpo = pedido.slug ? slugDigitado(pedido.slug) : ''
      if (pedido.slug?.trim() && !pedidoLimpo) {
        throw new Error(`O endereço "${pedido.slug.trim()}" não vira um caminho válido. Use letras, números e hífens.`)
      }
      const desejado = pedidoLimpo || gerarSlug(peca.title)
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
    const nomesUsados = new Set<string>()
    const imagensPublicadas: string[] = []

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
      // O nome no servidor nasce da legenda (o mesmo texto do alt): era
      // midia-1.jpg, que não diz nada a buscador nenhum.
      const nome = nomeSeoDaMidia({
        legenda: bloco.alt ?? '',
        tituloDaMateria: peca.title ?? '',
        indice: ++n,
        extensao,
        usados: nomesUsados,
      })
      const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer())

      arquivos.set(bloco.url, { nome, alt: bloco.alt })
      paraSubir.push({ nome, bytes })
      if (tipo.startsWith('image/')) imagensPublicadas.push(nome)
    }

    const agora = new Date()
    const url = `${base}/${slug}/`

    // As outras matérias publicadas alimentam o rail "Leia também" e a faixa
    // "Mais notícias" — no fim da leitura o leitor cai em outra notícia, não
    // num footer de campanha. Sem a lista, a página sai sem rail e ponto.
    let relacionadas: NoticiaRelacionada[] = []
    try {
      relacionadas = (await noticiasPublicadas(pedido.workspaceId))
        .filter((n) => n.url !== url)
        .slice(0, 8)
        .map((n) => ({ titulo: n.titulo, url: n.url, publicadaEm: n.publicadaEm }))
    } catch { relacionadas = [] }

    const html = montarPaginaDoArtigo({
      titulo: peca.title,
      subtitulo: peca.subtitle,
      corpo: peca.body,
      slug,
      baseUrl: base,
      publicadoEm: agora,
      arquivos,
      relacionadas,
    })

    let vitrine: Awaited<ReturnType<typeof atualizarVitrine>> | undefined
    await withFtp(async (client, config) => {
      for (const arquivo of paraSubir) {
        await enviarArquivo(client, config, `${slug}/${arquivo.nome}`, arquivo.bytes)
      }
      await enviarArquivo(client, config, `${slug}/index.html`, html)

      // A vitrine sobe no mesmo fôlego: a notícia entra no ar e o índice já a
      // empilha, o sitemap já a registra. Falha aqui não desfaz a publicação —
      // vira aviso, porque a matéria no ar vale mais do que o mapa.
      try {
        vitrine = await atualizarVitrine(client, config, pedido.workspaceId, agora, {
          titulo: peca.title,
          descricao: peca.subtitle,
          url,
          publicadaEm: agora,
        })
      } catch { vitrine = undefined }
    })

    let aviso: string | undefined
    let paginaNoAr: boolean | undefined
    try {
      const resposta = await fetch(url, { cache: 'no-store', redirect: 'follow' })
      paginaNoAr = resposta.ok
      if (!resposta.ok) {
        aviso = `Os arquivos subiram, mas ${url} respondeu ${resposta.status}. A pasta da conta de FTP não corresponde a public_html/noticias — confira em /api/admin/ftp-check.`
      }
    } catch {
      aviso = `Os arquivos subiram, mas não consegui abrir ${url} daqui para conferir. Abra no navegador.`
    }
    const avisoDaVitrine = vitrine?.aviso ?? (vitrine ? undefined : 'o índice de notícias e o sitemap não foram atualizados desta vez')
    if (avisoDaVitrine) aviso = aviso ? `${aviso} Além disso: ${avisoDaVitrine}.` : `A matéria está no ar; ${avisoDaVitrine}.`

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

    return { url, aviso, paginaNoAr, imagens: imagensPublicadas.map((nome) => `${base}/${slug}/${nome}`) }
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

/**
 * Tira uma matéria do ar — o desfazer da publicação.
 *
 * Nasceu no dia em que a central de notícias entrou no ar e expôs, na
 * primeira página e no sitemap, as matérias de teste publicadas meses antes:
 * "Teste1", "UASNASKADK…". Publicar sempre teve botão; despublicar não tinha
 * verbo nenhum — o que entrava no ar era para sempre.
 *
 * A pasta sai do servidor, o registro perde site_url (o slug FICA: se a
 * matéria voltar ao ar, volta no mesmo endereço, e links antigos revivem em
 * vez de quebrar para sempre), e a vitrine é regerada na mesma sessão — o
 * índice e o sitemap param de listar a página no mesmo instante em que ela
 * deixa de existir.
 */
export async function tirarMateriaDoAr(pedido: {
  workspaceId: string
  userId: string
  contentId: string
}): Promise<{ erro?: string; url?: string; aviso?: string }> {
  try {
    const supabase = await createClient()
    const { data: peca } = await supabase
      .from('content_pieces').select('id,title,slug,site_url')
      .eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId).maybeSingle()
    if (!peca) return { erro: 'Matéria não encontrada neste espaço.' }
    if (!peca.site_url) return { erro: 'Esta matéria não está no ar.' }

    const daUrl = String(peca.site_url).replace(/\/+$/, '').split('/').pop() ?? ''
    const slug = (peca.slug as string | null) || daUrl
    if (!slugValido(slug)) return { erro: 'Não reconheci o endereço desta matéria no site.' }

    let vitrine: Awaited<ReturnType<typeof atualizarVitrine>> | undefined
    await withFtp(async (client, config) => {
      try {
        await removerPastaDeMateria(client, config, slug)
      } catch (causa) {
        // Pasta que já não existe não é falha: o objetivo é ela não estar lá.
        const texto = causa instanceof Error ? causa.message : String(causa)
        if (!/550|not found|no such/i.test(texto)) throw causa
      }

      // O registro perde o endereço ANTES da vitrine ser regerada: é dele que
      // a vitrine lê a lista, e na ordem inversa a página apagada continuaria
      // no índice até a próxima publicação.
      const { error } = await supabase.from('content_pieces')
        .update({ site_url: null, site_published_at: null, updated_at: new Date().toISOString() })
        .eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId)
      if (error) throw new Error('A pasta saiu do servidor, mas não consegui limpar o registro aqui.')

      try { vitrine = await atualizarVitrine(client, config, pedido.workspaceId) } catch { vitrine = undefined }
    })

    await supabase.from('activity_log').insert({
      workspace_id: pedido.workspaceId,
      actor_id: pedido.userId,
      action: 'site_unpublished',
      entity_type: 'content',
      entity_id: pedido.contentId,
      metadata: { titulo: peca.title, slug },
    })

    return {
      url: String(peca.site_url),
      aviso: vitrine?.aviso ?? (vitrine ? undefined : 'a página saiu, mas o índice e o sitemap não foram regerados — publique ou tire outra matéria para atualizá-los'),
    }
  } catch (causa) {
    if (causa instanceof FtpConfigError) return { erro: causa.message }
    return { erro: causa instanceof Error ? causa.message.slice(0, 300) : 'Não foi possível tirar a matéria do ar.' }
  }
}
