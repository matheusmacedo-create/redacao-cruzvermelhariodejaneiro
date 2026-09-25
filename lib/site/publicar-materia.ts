import 'server-only'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { caminhoDoBlobPrivado, parseContentBlocks } from '@/lib/content-blocks'
import { gerarSlug, slugDigitado, slugDisponivel, slugValido } from '@/lib/site/slug'
import { nomeSeoDaMidia } from '@/lib/site/nome-da-midia'
import { altUtil, montarPaginaDoArtigo, type ArquivoLocal, type NoticiaRelacionada } from '@/lib/site/artigo-html'
import { problemasDaPagina } from '@/lib/site/guarda-da-pagina'
import { medidasDaImagem, processarFotoDaMateria, TIPOS_PROCESSADOS, TIPOS_QUE_O_NAVEGADOR_MOSTRA } from '@/lib/site/imagens-da-materia'
import { prepararChatDoSite } from '@/lib/site/chat-do-site'
import { conteudoCanonicoDaMateria } from '@/lib/site/trilha-da-materia'
import { withFtp, enviarArquivo, removerPastaDeMateria, FtpConfigError } from '@/lib/publicacao/ftp'
import { atualizarVitrine, noticiasPublicadas } from '@/lib/site/vitrine'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { linkDoBotao, linkDoPixel } from '@/lib/escola/advertoriais'

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
   * públicas, e é daqui que a remessa pega a primeira. É o arquivo canônico
   * de cada foto (o JPEG), nunca as versões WebP.
   *
   * Só imagens: vídeo não se exibe em e-mail.
   */
  imagens?: string[]
}

/** Endereço público da pasta que guarda as matérias. Sem ele não há canônica,
 * e sem canônica a publicação não serve ao propósito de SEO que a motivou. */
export function baseDoSite(): string {
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
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg',
}

const extensaoDoCaminho = (caminho: string) => {
  const m = /\.[a-z0-9]{1,5}$/i.exec(caminho)
  return m ? m[0].toLowerCase() : ''
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** O que a publicação lê de uma peça. */
export const COLUNAS_DA_PECA = 'id,title,subtitle,body,slug,site_url,site_published_at,site_cover_url,updated_at'
export type PecaNoSite = {
  id: string
  title: string
  subtitle: string | null
  body: string | null
  slug: string | null
  site_url: string | null
  site_published_at: string | null
  site_cover_url: string | null
  updated_at: string | null
}

type ArquivoParaSubir = { nome: string; bytes: Buffer }

/** Uma página de matéria pronta para subir: o HTML, os arquivos e o que ficou de fora. */
export type PaginaDaMateria = {
  html: string
  paraSubir: ArquivoParaSubir[]
  /** A primeira foto (a do og:image e do índice), com as medidas. */
  capa: { url: string; largura?: number; altura?: number } | null
  /** Os arquivos de imagem da página, na ordem (o JPEG de cada foto). */
  imagens: string[]
  /** Mídias e links que não puderam ir para a página, em português. */
  registro: string[]
}

/** A publicação parou antes de subir: a página teria algo que não pode ir ao ar. */
export class PaginaRecusada extends Error {
  constructor(public problemas: string[]) {
    super(`A página não foi publicada, porque sairia com ${problemas.join('; ')}. Corrija o texto da matéria e publique de novo.`)
    this.name = 'PaginaRecusada'
  }
}

/** Lê um arquivo da Biblioteca pelo caminho no armazenamento; `falta` diz por que não veio. */
export type LeitorDaBiblioteca = (pathname: string) => Promise<{ tipo: string; bytes: Buffer } | { falta: string }>

/** O leitor de verdade: a ficha em `files` (do espaço, não apagada) e os bytes no armazenamento privado. */
export function leitorDaBiblioteca(supabase: Supabase, workspaceId: string): LeitorDaBiblioteca {
  return async (pathname) => {
    const { data: arquivo } = await supabase
      .from('files').select('content_type,status')
      .eq('workspace_id', workspaceId).eq('storage_path', pathname).maybeSingle()
    if (!arquivo || arquivo.status === 'deleted') return { falta: 'não está mais na Biblioteca' }
    const blob = await get(pathname, { access: 'private' })
    if (!blob) return { falta: 'não foi encontrada no armazenamento' }
    return {
      tipo: String(arquivo.content_type || blob.blob.contentType || '').toLowerCase(),
      bytes: Buffer.from(await new Response(blob.stream).arrayBuffer()),
    }
  }
}

/**
 * Busca as mídias privadas do corpo e prepara o que sobe com a página.
 *
 * Foto passa pelas versões para a web (lib/site/imagens-da-materia.ts): o
 * JPEG canônico e os WebP do srcset. GIF, SVG, vídeo e áudio vão como estão.
 * O nome no servidor nasce da legenda — o mesmo texto do alt —, e a legenda
 * que não descreve nada (nome de arquivo, "aaa") dá lugar ao título da
 * matéria: era assim que saíam arquivos chamados "img-1234-jpg.jpg".
 */
async function prepararMidias(ler: LeitorDaBiblioteca, peca: PecaNoSite, registro: string[]) {
  const blocos = parseContentBlocks(peca.body)
  const arquivos = new Map<string, ArquivoLocal>()
  const porCaminho = new Map<string, ArquivoLocal>()
  const paraSubir: ArquivoParaSubir[] = []
  const imagens: string[] = []
  const usados = new Set<string>()
  let n = 0

  for (const bloco of blocos) {
    if (bloco.type !== 'image' && bloco.type !== 'video' && bloco.type !== 'audio') continue
    if (arquivos.has(bloco.url)) continue
    const rotulo = altUtil(bloco.alt) ? `"${altUtil(bloco.alt)}"` : (bloco.type === 'image' ? 'uma foto' : bloco.type === 'video' ? 'um vídeo' : 'um áudio')
    const pathname = caminhoDoBlobPrivado(bloco.url)
    if (!pathname) {
      registro.push(`${rotulo}, com endereço de fora da Biblioteca, não foi para a página`)
      continue
    }
    const repetido = porCaminho.get(pathname)
    if (repetido) { arquivos.set(bloco.url, repetido); continue }

    const lido = await ler(pathname)
    if ('falta' in lido) {
      registro.push(`${rotulo} ${lido.falta} e saiu da página`)
      continue
    }
    const { tipo, bytes } = lido
    const legenda = altUtil(bloco.alt)
    const indice = ++n

    let local: ArquivoLocal | null = null
    if (bloco.type === 'image' && TIPOS_PROCESSADOS.has(tipo)) {
      try {
        const foto = await processarFotoDaMateria(bytes)
        const nome = nomeSeoDaMidia({ legenda, tituloDaMateria: peca.title, indice, extensao: '.jpg', usados })
        const raiz = nome.slice(0, -'.jpg'.length)
        const webp = foto.webp.map((v) => ({ largura: v.largura, nome: `${raiz}-${v.largura}.webp`, bytes: v.bytes }))
        for (const v of webp) usados.add(v.nome)
        local = { nome, alt: bloco.alt, largura: foto.jpeg.largura, altura: foto.jpeg.altura, webp: webp.map(({ largura, nome: n2 }) => ({ largura, nome: n2 })) }
        paraSubir.push({ nome, bytes: foto.jpeg.bytes }, ...webp.map((v) => ({ nome: v.nome, bytes: v.bytes })))
        imagens.push(nome)
      } catch (causa) {
        console.warn('[site] versões da foto falharam:', causa instanceof Error ? causa.message : causa)
        if (!TIPOS_QUE_O_NAVEGADOR_MOSTRA.has(tipo)) {
          registro.push(`${rotulo} está num formato que o navegador não mostra (${tipo || 'desconhecido'}) e saiu da página`)
          continue
        }
        // Formato que o navegador mostra: vai como veio, sem as versões.
      }
    }
    if (!local) {
      const nome = nomeSeoDaMidia({ legenda, tituloDaMateria: peca.title, indice, extensao: EXTENSAO[tipo] || extensaoDoCaminho(pathname), usados })
      const medidas = bloco.type === 'image' ? await medidasDaImagem(bytes) : null
      local = { nome, alt: bloco.alt, ...(medidas ? { largura: medidas.largura, altura: medidas.altura } : {}) }
      paraSubir.push({ nome, bytes })
      if (tipo.startsWith('image/')) imagens.push(nome)
    }
    arquivos.set(bloco.url, local)
    porCaminho.set(pathname, local)
  }
  return { arquivos, paraSubir, imagens }
}

/**
 * Gera a página de uma matéria — com as mídias já preparadas — e confere se
 * ela pode ir ao ar. Usada pela publicação e pela regeração de todas as
 * páginas: o mesmo caminho, para as duas nunca divergirem.
 */
export async function gerarPaginaDaMateria(a: {
  /** De onde vêm as mídias: `leitorDaBiblioteca(supabase, workspaceId)`. */
  lerArquivo: LeitorDaBiblioteca
  peca: PecaNoSite
  slug: string
  base: string
  publicadoEm: Date
  modificadoEm: Date
  relacionadas: NoticiaRelacionada[]
  rastreio?: { pixel: string; botao: string }
  /** As tags do chat do site (prepararChatDoSite). */
  chat?: string
}): Promise<PaginaDaMateria> {
  const registro: string[] = []
  const { arquivos, paraSubir, imagens } = await prepararMidias(a.lerArquivo, a.peca, registro)
  const html = montarPaginaDoArtigo({
    titulo: a.peca.title,
    subtitulo: a.peca.subtitle,
    corpo: a.peca.body,
    slug: a.slug,
    baseUrl: a.base,
    publicadoEm: a.publicadoEm,
    atualizadoEm: a.modificadoEm,
    arquivos,
    relacionadas: a.relacionadas,
    rastreio: a.rastreio,
    registro,
    chat: a.chat,
  })
  const problemas = problemasDaPagina(html)
  if (problemas.length) throw new PaginaRecusada(problemas)

  // A capa do índice é a mesma foto do og:image: a primeira do corpo que não
  // seja vetor.
  let capa: PaginaDaMateria['capa'] = null
  for (const b of parseContentBlocks(a.peca.body)) {
    if (b.type !== 'image') continue
    const local = arquivos.get(b.url)
    if (!local || /\.svg$/i.test(local.nome)) continue
    capa = { url: `${a.base}/${a.slug}/${local.nome}`, largura: local.largura, altura: local.altura }
    break
  }
  if (registro.length) console.warn(`[site] ${a.slug}: ${registro.join(' | ')}`)
  return { html, paraSubir, capa, imagens, registro: [...new Set(registro)] }
}

/** As outras matérias no ar, para o rail "Leia também" e a faixa final. */
export async function relacionadasDaMateria(workspaceId: string, url: string): Promise<NoticiaRelacionada[]> {
  try {
    return (await noticiasPublicadas(workspaceId))
      .filter((n) => n.url !== url)
      .slice(0, 8)
      .map((n) => ({ titulo: n.titulo, url: n.url, publicadaEm: n.publicadaEm }))
  } catch {
    return []
  }
}

/**
 * Advertorial da escola: a página ganha o pixel de visita e o botão de
 * matrícula rastreado. Lido com a service role porque quem publica pode não
 * ter acesso ao marketing da escola — e a página sairia sem contagem.
 */
export async function rastreioDaMateria(workspaceId: string, contentId: string): Promise<{ pixel: string; botao: string } | undefined> {
  try {
    const { data: adv } = await createAdminClient().from('escola_pecas').select('id')
      .eq('content_id', contentId).eq('workspace_id', workspaceId).eq('tipo', 'advertorial').maybeSingle()
    return adv ? { pixel: linkDoPixel(urlBase(), adv.id as string), botao: linkDoBotao(urlBase(), adv.id as string) } : undefined
  } catch {
    return undefined
  }
}

/** Resumo, para o aviso da tela, do que ficou de fora da página. */
export function resumoDoRegistro(registro: string[]): string | undefined {
  if (!registro.length) return undefined
  const primeiros = registro.slice(0, 3).join('; ')
  return registro.length > 3 ? `${primeiros}; e mais ${registro.length - 3}` : primeiros
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
 *
 * As datas: `site_published_at` é a PRIMEIRA publicação e não muda mais —
 * republicar zerava a data da matéria, no índice, no sitemap e no Google. A
 * data de alteração (dateModified) é a última mudança do texto (`updated_at`),
 * e gravar as colunas do site não mexe nela.
 */
export async function publicarMateria(pedido: PedidoDePublicacao): Promise<ResultadoDoSite> {
  try {
    const supabase = await createClient()
    const base = baseDoSite()

    const { data } = await supabase
      .from('content_pieces')
      .select(COLUNAS_DA_PECA)
      .eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId).maybeSingle()
    const peca = data as PecaNoSite | null
    if (!peca) throw new Error('Conteúdo não encontrado neste espaço.')

    // Publica o que está na tela, não a última versão salva: o clique antes
    // do salvamento já produziu "a matéria precisa de texto" com o texto na
    // frente dos olhos. Só grava (e só conta como edição) se o texto mudou.
    if (pedido.titulo || pedido.corpo) {
      const novo = { title: pedido.titulo || peca.title, subtitle: pedido.subtitulo || null, body: pedido.corpo || peca.body }
      const mudou = novo.title !== peca.title || novo.subtitle !== (peca.subtitle ?? null) || (novo.body ?? '') !== (peca.body ?? '')
      if (mudou) {
        const editadoEm = new Date().toISOString()
        const { error: erroSalvar } = await supabase.from('content_pieces')
          .update({ ...novo, updated_at: editadoEm })
          .eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId)
        if (erroSalvar) throw new Error('Não foi possível salvar a matéria antes de publicar.')
        Object.assign(peca, novo, { updated_at: editadoEm })
      }
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

    const agora = new Date()
    const url = `${base}/${slug}/`
    const primeiraPublicacao = !peca.site_published_at
    const publicadoEm = primeiraPublicacao ? agora : new Date(peca.site_published_at!)
    const editadoEm = peca.updated_at ? new Date(peca.updated_at) : publicadoEm
    const modificadoEm = primeiraPublicacao || editadoEm.getTime() < publicadoEm.getTime() ? publicadoEm : editadoEm

    const chat = await prepararChatDoSite()
    const [relacionadas, rastreio] = await Promise.all([
      relacionadasDaMateria(pedido.workspaceId, url),
      rastreioDaMateria(pedido.workspaceId, pedido.contentId),
    ])

    const pagina = await gerarPaginaDaMateria({
      lerArquivo: leitorDaBiblioteca(supabase, pedido.workspaceId), peca, slug, base, publicadoEm, modificadoEm, relacionadas, rastreio, chat,
    })

    let vitrine: Awaited<ReturnType<typeof atualizarVitrine>> | undefined
    await withFtp(async (client, config) => {
      for (const arquivo of pagina.paraSubir) {
        await enviarArquivo(client, config, `${slug}/${arquivo.nome}`, arquivo.bytes)
      }
      await enviarArquivo(client, config, `${slug}/index.html`, pagina.html)

      // A vitrine sobe no mesmo fôlego: a notícia entra no ar e o índice já a
      // empilha, o sitemap já a registra. Falha aqui não desfaz a publicação —
      // vira aviso, porque a matéria no ar vale mais do que o mapa.
      try {
        vitrine = await atualizarVitrine(client, config, pedido.workspaceId, agora, {
          id: pedido.contentId,
          titulo: peca.title,
          descricao: peca.subtitle,
          url,
          capa: pagina.capa?.url ?? null,
          capaLargura: pagina.capa?.largura,
          capaAltura: pagina.capa?.altura,
          publicadaEm: publicadoEm,
          atualizadaEm: modificadoEm,
        })
      } catch { vitrine = undefined }
    })

    const avisos: string[] = []
    let paginaNoAr: boolean | undefined
    try {
      const resposta = await fetch(url, { cache: 'no-store', redirect: 'follow' })
      paginaNoAr = resposta.ok
      if (!resposta.ok) {
        avisos.push(`Os arquivos subiram, mas ${url} respondeu ${resposta.status}. A pasta da conta de FTP não corresponde a public_html/noticias — confira em /api/admin/ftp-check.`)
      }
    } catch {
      avisos.push(`Os arquivos subiram, mas não consegui abrir ${url} daqui para conferir. Abra no navegador.`)
    }
    const avisoDaVitrine = vitrine?.aviso ?? (vitrine ? undefined : 'o índice de notícias e o sitemap não foram atualizados desta vez')
    if (avisoDaVitrine) avisos.push(avisos.length ? `Além disso: ${avisoDaVitrine}.` : `A matéria está no ar; ${avisoDaVitrine}.`)
    const foraDaPagina = resumoDoRegistro(pagina.registro)
    if (foraDaPagina) avisos.push(`Ficou fora da página: ${foraDaPagina}.`)

    // Primeira publicação: nasce a data (e a de alteração é a mesma). Depois
    // disso, as colunas do site mudam só o endereço e a capa — nem a data da
    // publicação nem a da última edição do texto.
    const { error } = await supabase.from('content_pieces').update({
      slug,
      site_url: url,
      site_cover_url: pagina.capa?.url ?? null,
      ...(primeiraPublicacao ? { site_published_at: agora.toISOString(), updated_at: agora.toISOString() } : {}),
    }).eq('id', pedido.contentId).eq('workspace_id', pedido.workspaceId)
    if (error) throw new Error('A página subiu, mas não consegui registrar o endereço aqui.')

    // A trilha pública registra cada versão publicada. O gancho do banco
    // dispara quando o endereço ou a data da primeira publicação mudam; numa
    // republicação no mesmo endereço nenhum dos dois muda, então a versão nova
    // entra pela porta da aplicação. Mesmo texto = mesma versão (o registro
    // não abre outra).
    if (!primeiraPublicacao && peca.site_url === url) {
      try {
        const { error: erroDaTrilha } = await createAdminClient().rpc('auditoria_registrar_item', {
          p_workspace_id: pedido.workspaceId,
          p_tipo: 'materia',
          p_referencia_id: pedido.contentId,
          p_titulo: peca.title,
          p_url: url,
          p_conteudo: conteudoCanonicoDaMateria({ titulo: peca.title, subtitulo: peca.subtitle, corpo: peca.body, url }),
          p_ator_id: pedido.userId,
        })
        // Banco ainda sem a migração da trilha (a RPC não existe): não há onde
        // registrar, e um aviso de falha a cada republicação só assustaria quem publica.
        if (erroDaTrilha && (erroDaTrilha.code === 'PGRST202' || erroDaTrilha.code === '42883')) {
          console.info('[site] trilha de auditoria ausente neste banco; a versão republicada não foi registrada.')
        } else if (erroDaTrilha) {
          throw new Error(erroDaTrilha.message)
        }
      } catch (causa) {
        console.error('[site] registro da versão na trilha falhou:', causa instanceof Error ? causa.message : causa)
        avisos.push('A nova versão não entrou na trilha de auditoria agora; a conferência diária não a pega sozinha — avise a administração.')
      }
    }

    // O advertorial entra no ar no marketing da escola junto com a página.
    if (rastreio) {
      await Promise.resolve(createAdminClient().from('escola_pecas').update({ status: 'no_ar', url, publicada_em: agora.toISOString().slice(0, 10), updated_at: agora.toISOString() })
        .eq('content_id', pedido.contentId).eq('workspace_id', pedido.workspaceId).eq('status', 'rascunho')).catch(() => undefined)
    }

    await supabase.from('activity_log').insert({
      workspace_id: pedido.workspaceId,
      actor_id: pedido.userId,
      action: 'site_published',
      entity_type: 'content',
      entity_id: pedido.contentId,
      metadata: { url, midias: pagina.paraSubir.length, primeira: primeiraPublicacao, fora_da_pagina: pagina.registro.slice(0, 10) },
    })

    return {
      url,
      aviso: avisos.length ? avisos.join(' ') : undefined,
      paginaNoAr,
      imagens: pagina.imagens.map((nome) => `${base}/${slug}/${nome}`),
    }
  } catch (causa) {
    return { erro: mensagemDaPublicacao(causa) }
  }
}

/** O erro da publicação em português, sem a senha do FTP e com a ação que ele pede. */
export function mensagemDaPublicacao(causa: unknown): string {
  if (causa instanceof FtpConfigError) {
    return `${causa.message} Cadastre-as em Vercel → Environment Variables.`
  }
  const bruto = causa instanceof Error ? causa.message : String(causa)
  // O erro cru do Node ("Hostname/IP does not match certificate's altnames")
  // é correto e inútil para quem está na tela. Traduzimos para a ação.
  if (/does not match certificate|ERR_TLS_CERT_ALTNAME/i.test(bruto)) {
    return 'O servidor de FTP recusou a conexão segura: FTP_HOST está com o IP do servidor,'
      + ' e o certificado dele só vale para o nome. Abra /api/admin/ftp-check — a etapa'
      + ' "certificado do servidor" mostra o nome certo — e troque FTP_HOST para esse nome'
      + ' em Vercel → Environment Variables.'
  }
  const limpo = process.env.FTP_PASSWORD
    ? bruto.split(process.env.FTP_PASSWORD).join('«senha»')
    : bruto
  return limpo.slice(0, causa instanceof PaginaRecusada ? 1500 : 500)
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
        .update({ site_url: null, site_cover_url: null, site_published_at: null, updated_at: new Date().toISOString() })
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
