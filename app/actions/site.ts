'use server'

import { revalidatePath } from 'next/cache'
import { get } from '@vercel/blob'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { parseContentBlocks } from '@/lib/content-blocks'
import { gerarSlug, slugDisponivel, slugValido } from '@/lib/site/slug'
import { montarPaginaDoArtigo, type ArquivoLocal } from '@/lib/site/artigo-html'
import { withFtp, enviarArquivo, FtpConfigError } from '@/lib/publicacao/ftp'

const texto = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

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

/**
 * Publica uma peça de conteúdo como página no site institucional.
 *
 * A página sobe como `slug/index.html`, e não `slug.html`, porque é assim que
 * o endereço termina em barra — que foi o pedido, e é o que evita o mesmo
 * texto responder em três endereços diferentes.
 *
 * As mídias do corpo sobem junto, ao lado do index.html. Elas moram no
 * armazenamento privado do sistema, atrás de autenticação: referenciadas como
 * estão, dariam 404 para todo visitante do site.
 */
export async function publicarArtigoNoSite(formData: FormData): Promise<ResultadoDoSite> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const contentId = texto(formData, 'contentId')
    if (!contentId) throw new Error('Conteúdo não informado.')

    const base = baseDoSite()

    const { data: peca } = await supabase
      .from('content_pieces')
      .select('id,title,subtitle,body,slug,site_url')
      .eq('id', contentId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!peca) throw new Error('Conteúdo não encontrado neste espaço.')

    // O formulário manda o que está na tela agora. Publicar o que a pessoa
    // está vendo — e não a última versão salva — mata a armadilha de digitar,
    // clicar em publicar e receber "a matéria precisa de texto" porque o
    // salvamento ainda não tinha acontecido.
    const tituloDaTela = texto(formData, 'title')
    const subtituloDaTela = texto(formData, 'subtitle')
    const corpoDaTela = texto(formData, 'body')
    if (tituloDaTela || corpoDaTela) {
      peca.title = tituloDaTela || peca.title
      peca.subtitle = subtituloDaTela || null
      peca.body = corpoDaTela || peca.body
      const { error: erroSalvar } = await supabase.from('content_pieces')
        .update({ title: peca.title, subtitle: peca.subtitle, body: peca.body, updated_at: new Date().toISOString() })
        .eq('id', contentId).eq('workspace_id', context.workspace.id)
      if (erroSalvar) throw new Error('Não foi possível salvar a matéria antes de publicar.')
    }

    if (!peca.title?.trim()) throw new Error('A matéria precisa de um título antes de virar página.')
    if (!peca.body?.trim()) throw new Error('A matéria precisa de texto antes de virar página. Escreva o texto e publique de novo.')

    // Endereço definido uma vez e mantido: trocar o slug de uma página já
    // publicada quebraria todo link que já saiu nas redes.
    let slug = peca.slug ?? ''
    if (!slug) {
      const desejado = gerarSlug(peca.title)
      if (!desejado) throw new Error('O título não gera um endereço válido. Use ao menos uma letra ou número.')
      const { data: usados } = await supabase
        .from('content_pieces').select('slug')
        .eq('workspace_id', context.workspace.id).not('slug', 'is', null)
      slug = slugDisponivel(desejado, (usados ?? []).map((u) => u.slug as string))
    }
    if (!slugValido(slug)) throw new Error(`O endereço "${slug}" não é válido para uma pasta do site.`)

    // ---- mídias do corpo ----
    const blocos = parseContentBlocks(peca.body)
    const arquivos = new Map<string, ArquivoLocal>()
    const paraSubir: { nome: string; bytes: Buffer }[] = []
    let n = 0

    for (const bloco of blocos) {
      if (bloco.type !== 'image' && bloco.type !== 'video' && bloco.type !== 'audio') continue
      if (arquivos.has(bloco.url)) continue
      const pathname = caminhoDaMidia(bloco.url)
      if (!pathname) continue

      // Confere que o arquivo é deste espaço antes de baixar: a URL vem do
      // corpo do texto, que é editável.
      const { data: arquivo } = await supabase
        .from('files').select('content_type,status')
        .eq('workspace_id', context.workspace.id).eq('storage_path', pathname).maybeSingle()
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

    // ---- envio ----
    await withFtp(async (client, config) => {
      for (const arquivo of paraSubir) {
        await enviarArquivo(client, config, `${slug}/${arquivo.nome}`, arquivo.bytes)
      }
      // O index vai por último: enquanto ele não existe, a pasta não responde,
      // e ninguém pega a página com as imagens ainda faltando.
      await enviarArquivo(client, config, `${slug}/index.html`, html)
    })

    const url = `${base}/${slug}/`

    // ---- confere pela web ----
    // Subir sem erro não prova que a pasta é publicada: a conta de FTP já
    // esteve fora de public_html, gravando tudo num lugar que a web não serve.
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
    }).eq('id', contentId).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('A página subiu, mas não consegui registrar o endereço aqui.')

    await supabase.from('activity_log').insert({
      workspace_id: context.workspace.id,
      actor_id: context.user.id,
      action: 'site_published',
      entity_type: 'content',
      entity_id: contentId,
      metadata: { url, midias: paraSubir.length },
    })

    revalidatePath(`/conteudos/${contentId}`)
    return { url, aviso }
  } catch (causa) {
    if (causa instanceof FtpConfigError) {
      return { erro: `${causa.message} Cadastre-as em Vercel → Environment Variables.` }
    }
    const bruto = causa instanceof Error ? causa.message : String(causa)
    // A senha do FTP pode aparecer no texto de erro da biblioteca.
    const limpo = process.env.FTP_PASSWORD
      ? bruto.split(process.env.FTP_PASSWORD).join('«senha»')
      : bruto
    return { erro: limpo.slice(0, 500) }
  }
}
