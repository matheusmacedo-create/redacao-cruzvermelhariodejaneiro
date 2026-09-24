import 'server-only'

import { createHash } from 'node:crypto'
import type { Client } from 'basic-ftp'
import { createAdminClient } from '@/lib/supabase/admin'
import { apagarObjeto, copiarObjeto, infoDoObjeto, lerObjeto } from '@/lib/armazenamento/r2'
import { enviarArquivoDoAcervo, paginasDaColecaoNoSite, removerArquivoDoAcervo, removerPaginaDoAcervo, withFtp, type FtpConfig } from '@/lib/publicacao/ftp'
import { descobrirRaizDoSite, regerarMapaDoSite } from '@/lib/site/vitrine'
import { bucketDoAcervo, COLUNAS_DO_ITEM, itensPublicosDoAcervo, type LinhaDoItem } from './dados'
import { versoesDaImagem } from './imagens'
import {
  caminhoDoItem, htaccessDoAcervo, paginaDoItem, paginaInicialDoAcervo, paginasDaColecao, ORIGEM_DO_ACERVO, type ArquivosNoSite, type ItemPublico,
} from './paginas'
import { COLECOES, faltaParaPublicar, nomeSeguro, slugDoAcervoValido, slugDoItem, slugLivre, tipoDoArquivo, TAMANHO_MAXIMO_NO_SITE } from './regras'
import { dadosDoVideo } from './video'

/**
 * Publicação do acervo no site (docs/acervo.md). Três passos, nesta ordem:
 *
 *   1. o arquivo sai da caixa de entrada do bucket para a pasta da coleção (onde vale a trava);
 *   2. as versões para a web sobem para /acervo/arquivos/ e o banco registra a publicação;
 *   3. as páginas (a do item, as das coleções e o início), o .htaccess e o sitemap.xml são refeitos.
 *
 * Se o passo 3 falhar, o item já está marcado como público: "Atualizar as páginas do acervo"
 * (regerarAcervo) refaz tudo a partir do banco, e também limpa do site o que foi tirado do ar.
 */

type Admin = ReturnType<typeof createAdminClient>
type Preparado = { arquivos: ArquivosNoSite; enviar: { nome: string; bytes: Buffer }[]; sha256?: string; largura?: number; altura?: number }

const TEMPO_MAXIMO_MS = 45_000
const TAMANHO_MAXIMO_DA_IMAGEM = 120 * 1024 ** 2
const mensagem = (causa: unknown) => (causa instanceof Error ? causa.message : String(causa)).slice(0, 300)
const nomesDosArquivos = (a: ArquivosNoSite | null | undefined) => [...(a?.imagens ?? []).map((v) => v.arquivo), ...(a?.pdf ? [a.pdf] : [])]

async function raizDoSite(client: Client, config: FtpConfig): Promise<string> {
  const raiz = await descobrirRaizDoSite(client, config)
  if (!raiz) throw new Error('Não achei a pasta do site no FTP (confira em /api/admin/ftp-check).')
  return raiz
}

function r2(): NonNullable<ReturnType<typeof bucketDoAcervo>> {
  const b = bucketDoAcervo()
  if (!b) throw new Error('O acervo no R2 não está configurado (R2_BUCKET_ACERVO e as chaves do R2 na Vercel).')
  return b
}

export async function lerItemDoAcervo(admin: Admin, workspaceId: string, id: string): Promise<LinhaDoItem> {
  const { data, error } = await admin.from('acervo_itens').select(COLUNAS_DO_ITEM).eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw new Error('Não foi possível ler o item.')
  if (!data) throw new Error('Item não encontrado.')
  return data as unknown as LinhaDoItem
}

/**
 * Leva o arquivo da caixa de entrada para a pasta da coleção: <coleção>/<ano>/<8 do id>-<nome>.
 * Lá vale a trava do bucket (30 dias sem apagar nem trocar). Fora de entrada/, fica onde está.
 */
export async function guardarNaColecao(admin: Admin, item: LinhaDoItem): Promise<string | null> {
  if (!item.chave_r2 || !item.chave_r2.startsWith('entrada/')) return item.chave_r2
  const { config, bucket } = r2()
  const ano = (item.data_item ?? item.created_at).slice(0, 4)
  const nome = nomeSeguro(item.nome_original ?? item.chave_r2.split('/').pop() ?? 'arquivo')
  const destino = `${item.colecao}/${ano}/${item.id.slice(0, 8)}-${nome}`
  await copiarObjeto(config, bucket, item.chave_r2, destino, { soSeNaoExistir: true })
  const copia = await infoDoObjeto(config, bucket, destino)
  if (!copia || (item.tamanho !== null && copia.tamanho !== Number(item.tamanho))) {
    throw new Error('A cópia para a pasta da coleção não conferiu; o arquivo continua na caixa de entrada.')
  }
  const { error } = await admin.from('acervo_itens').update({ chave_r2: destino }).eq('id', item.id)
  if (error) throw new Error('Não foi possível registrar a nova pasta do arquivo.')
  await apagarObjeto(config, bucket, item.chave_r2).catch(() => undefined)
  return destino
}

/** As versões para o site: WebP da imagem, o PDF como está, ou os dados do vídeo. */
async function prepararArquivos(item: LinhaDoItem, slug: string): Promise<Preparado> {
  const tipo = tipoDoArquivo(item.tipo_mime)
  if (item.colecao === 'videos' || tipo === 'video') {
    if (!item.url_video) throw new Error('Falta o link do vídeo no YouTube ou no Vimeo.')
    return { arquivos: { video: await dadosDoVideo(item.url_video) }, enviar: [] }
  }
  if (!item.chave_r2) throw new Error('O item não tem arquivo.')
  if (tipo === 'imagem' && (item.tamanho ?? 0) > TAMANHO_MAXIMO_DA_IMAGEM) throw new Error('Imagem grande demais para gerar as versões do site (até 120 MB).')
  if (tipo === 'pdf' && (item.tamanho ?? 0) > TAMANHO_MAXIMO_NO_SITE) throw new Error('PDF grande demais para o site (até 60 MB).')
  const { config, bucket } = r2()
  const original = await lerObjeto(config, bucket, item.chave_r2)
  if (!original) throw new Error('O arquivo não está no acervo.')
  const sha256 = createHash('sha256').update(original).digest('hex')
  const marca = sha256.slice(0, 12)
  if (tipo === 'imagem') {
    const { largura, altura, versoes } = await versoesDaImagem(original)
    if (largura < 200) throw new Error('Imagem pequena demais para o site (mínimo 200 px de largura).')
    const imagens = versoes.map((v) => ({ largura: v.largura, altura: v.altura, arquivo: `${slug}-${marca}-${v.largura}.webp` }))
    return { arquivos: { imagens }, enviar: versoes.map((v, n) => ({ nome: imagens[n].arquivo, bytes: v.bytes })), sha256, largura, altura }
  }
  if (tipo === 'pdf') {
    if (!original.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('O arquivo não é um PDF válido.')
    const nome = `${slug}-${marca}.pdf`
    return { arquivos: { pdf: nome }, enviar: [{ nome, bytes: original }], sha256 }
  }
  throw new Error('Só imagem, PDF ou vídeo com link vão para o site.')
}

/** As páginas de itens dados, as das coleções, o início, o .htaccess e o mapa, na sessão aberta. */
async function subirPaginas(client: Client, raiz: string, workspaceId: string, itens: ItemPublico[], paginasDeItem: ItemPublico[], inicio: number): Promise<number> {
  const agora = new Date()
  let feitas = 0
  for (const i of paginasDeItem) {
    if (Date.now() - inicio > TEMPO_MAXIMO_MS) break
    await enviarArquivoDoAcervo(client, raiz, `${i.colecao}/${i.slug}/index.html`, paginaDoItem({ item: i, agora }))
    feitas++
  }
  for (const c of COLECOES) {
    const paginas = paginasDaColecao({ colecao: c, itens, agora })
    for (const p of paginas) await enviarArquivoDoAcervo(client, raiz, p.relativo, p.html)
    // A coleção encolheu: as páginas que sobraram saem; vazia, a coleção perde a página.
    for (const n of await paginasDaColecaoNoSite(client, raiz, c)) if (n > paginas.length) await removerPaginaDoAcervo(client, raiz, `${c}/pagina/${n}`)
    if (!paginas.length) await removerArquivoDoAcervo(client, raiz, `${c}/index.html`)
  }
  await enviarArquivoDoAcervo(client, raiz, 'index.html', paginaInicialDoAcervo({ itens, agora }))
  await enviarArquivoDoAcervo(client, raiz, '.htaccess', htaccessDoAcervo({
    pdfs: itens.filter((i) => i.arquivos?.pdf).map((i) => ({ arquivo: i.arquivos!.pdf!, pagina: ORIGEM_DO_ACERVO + caminhoDoItem(i) })),
  }))
  await regerarMapaDoSite(client, raiz, workspaceId)
  return feitas
}

/** Põe o item no site (ou atualiza: arquivo e ficha novos). */
export async function publicarNoSite(workspaceId: string, itemId: string, ator: string): Promise<{ aviso?: string; url: string }> {
  const admin = createAdminClient()
  let item = await lerItemDoAcervo(admin, workspaceId, itemId)
  const falta = faltaParaPublicar({ ...item, palavras_chave: item.palavras_chave ?? [], tamanho: item.tamanho === null ? null : Number(item.tamanho) })
  if (falta.length) throw new Error(`Para ir ao site, falta ${falta.join('; ')}.`)

  let slug = item.slug
  if (!slug) {
    const { data: usados, error } = await admin.from('acervo_itens').select('slug').eq('workspace_id', workspaceId).eq('colecao', item.colecao).not('slug', 'is', null)
    if (error) throw new Error('Não foi possível conferir os endereços da coleção.')
    slug = slugLivre(slugDoItem(item.titulo), (usados ?? []).map((u) => u.slug as string))
  }
  // Antes de mexer no R2 e no FTP: um endereço que o banco recusaria deixaria arquivos soltos no site.
  if (!slugDoAcervoValido(slug)) throw new Error('Não foi possível montar o endereço do item. Mude o título e tente de novo.')
  if (item.chave_r2 && item.colecao !== 'videos') item = { ...item, chave_r2: await guardarNaColecao(admin, item) }
  const preparado = await prepararArquivos(item, slug)
  const novos = nomesDosArquivos(preparado.arquivos)
  const sobras = nomesDosArquivos(item.arquivos_no_site).filter((n) => !novos.includes(n))
  const inicio = Date.now()
  const url = `${ORIGEM_DO_ACERVO}/acervo/${item.colecao}/${slug}/`

  return withFtp(async (client, config) => {
    const raiz = await raizDoSite(client, config)
    for (const a of preparado.enviar) await enviarArquivoDoAcervo(client, raiz, `arquivos/${a.nome}`, a.bytes)
    const agora = new Date().toISOString()
    const { error } = await admin.from('acervo_itens').update({
      visibilidade: 'publico', slug, publicado_em: item.publicado_em ?? agora, atualizado_no_site_em: agora,
      arquivos_no_site: preparado.arquivos, atualizado_por: ator,
      ...(preparado.sha256 ? { sha256: preparado.sha256 } : {}),
      ...(preparado.largura ? { largura: preparado.largura, altura: preparado.altura } : {}),
    }).eq('id', item.id).eq('workspace_id', workspaceId)
    if (error) throw new Error('Os arquivos subiram, mas não foi possível registrar a publicação. Tente de novo.')
    try {
      const itens = await itensPublicosDoAcervo(workspaceId)
      await subirPaginas(client, raiz, workspaceId, itens, itens.filter((i) => i.id === item.id), inicio)
      for (const n of sobras) await removerArquivoDoAcervo(client, raiz, `arquivos/${n}`)
      return { url }
    } catch (causa) {
      return { url, aviso: `Publicado, mas as páginas do acervo não foram refeitas agora (${mensagem(causa)}). Use "Atualizar as páginas do acervo".` }
    }
  })
}

/** Só as páginas (a ficha mudou, o arquivo não): a do item, as das coleções, o início e o mapa. */
export async function refazerPaginasDoItem(workspaceId: string, itemId: string): Promise<void> {
  const itens = await itensPublicosDoAcervo(workspaceId)
  const item = itens.find((i) => i.id === itemId)
  if (!item) return
  const agora = new Date().toISOString()
  await createAdminClient().from('acervo_itens').update({ atualizado_no_site_em: agora }).eq('id', itemId).eq('workspace_id', workspaceId)
  item.atualizado_no_site_em = agora
  await withFtp(async (client, config) => {
    await subirPaginas(client, await raizDoSite(client, config), workspaceId, itens, [item], Date.now())
  })
}

/** Tira o item do site: a página e os arquivos saem; a ficha e o arquivo continuam no acervo. */
export async function tirarDoSite(workspaceId: string, itemId: string, ator: string): Promise<{ aviso?: string }> {
  const admin = createAdminClient()
  const item = await lerItemDoAcervo(admin, workspaceId, itemId)
  if (item.visibilidade !== 'publico') throw new Error('O item não está no site.')
  // O banco primeiro: a partir daqui o item não entra mais em página nenhuma. Os arquivos ficam
  // anotados até saírem do servidor — se o FTP falhar, "Atualizar as páginas" termina a limpeza.
  const { error } = await admin.from('acervo_itens').update({ visibilidade: 'privado', atualizado_por: ator }).eq('id', item.id).eq('workspace_id', workspaceId)
  if (error) throw new Error('Não foi possível tirar o item do site.')
  try {
    await withFtp(async (client, config) => {
      const raiz = await raizDoSite(client, config)
      await limparDoSite(client, raiz, admin, item)
      await subirPaginas(client, raiz, workspaceId, await itensPublicosDoAcervo(workspaceId), [], Date.now())
    })
    return {}
  } catch (causa) {
    return { aviso: `Fora do site no cadastro, mas o servidor não respondeu agora (${mensagem(causa)}): a página pode continuar no ar. Use "Atualizar as páginas do acervo".` }
  }
}

async function limparDoSite(client: Client, raiz: string, admin: Admin, item: Pick<LinhaDoItem, 'id' | 'colecao' | 'slug' | 'arquivos_no_site'>) {
  if (item.slug) await removerPaginaDoAcervo(client, raiz, `${item.colecao}/${item.slug}`)
  for (const n of nomesDosArquivos(item.arquivos_no_site)) await removerArquivoDoAcervo(client, raiz, `arquivos/${n}`)
  await admin.from('acervo_itens').update({ arquivos_no_site: null }).eq('id', item.id).eq('visibilidade', 'privado')
}

/**
 * Refaz tudo a partir do banco: as páginas dos itens públicos, as coleções, o início, o .htaccess e
 * o mapa; e tira do servidor o que ficou de itens que saíram do ar. Com muitos itens, para perto do
 * limite de tempo e devolve de onde continuar (`proximo`): a tela chama de novo até acabar.
 */
export async function regerarAcervo(workspaceId: string, aPartirDe = 0): Promise<{ itens: number; proximo?: number }> {
  const admin = createAdminClient()
  const inicio = Date.now()
  const itens = await itensPublicosDoAcervo(workspaceId)
  const { data: pendentes, error } = await admin.from('acervo_itens').select('id,colecao,slug,arquivos_no_site')
    .eq('workspace_id', workspaceId).eq('visibilidade', 'privado').not('arquivos_no_site', 'is', null)
  if (error) throw new Error('Não foi possível ler o acervo.')
  // Ordem fixa (pelo id), para cada rodada seguir de onde a anterior parou.
  const emOrdem = [...itens].sort((a, b) => a.id.localeCompare(b.id)).slice(Math.max(0, aPartirDe))
  return withFtp(async (client, config) => {
    const raiz = await raizDoSite(client, config)
    for (const p of (pendentes ?? []) as Pick<LinhaDoItem, 'id' | 'colecao' | 'slug' | 'arquivos_no_site'>[]) await limparDoSite(client, raiz, admin, p)
    const feitas = await subirPaginas(client, raiz, workspaceId, itens, emOrdem, inicio)
    return feitas < emOrdem.length ? { itens: itens.length, proximo: Math.max(0, aPartirDe) + feitas } : { itens: itens.length }
  })
}
