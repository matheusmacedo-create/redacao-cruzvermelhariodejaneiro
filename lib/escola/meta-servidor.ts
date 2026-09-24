import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { BUCKET_DO_MARKETING } from './marketing-servidor'
import { mensagemDoErroDoMeta, montarLote } from './meta'

/** v25.0 vale até jul/2028; META_GRAPH_VERSION troca sem deploy de código. */
const versao = () => (process.env.META_GRAPH_VERSION?.trim().match(/^v\d{2}\.0$/)?.[0] ?? 'v25.0')
const GRAPH = 'https://graph.facebook.com'

class ErroDoMeta extends Error {}

/**
 * Uma chamada ao Graph. O token vai no cabeçalho Authorization (nunca na
 * URL, para não aparecer em log nem no paging.next), e nenhum erro repete o
 * token.
 */
async function graph(token: string, caminho: string, busca: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const url = caminho.startsWith('https://') ? new URL(caminho) : new URL(`/${versao()}/${caminho.replace(/^\//, '')}`, GRAPH)
  if (url.origin !== GRAPH) throw new ErroDoMeta('Endereço inesperado na paginação do Meta.')
  url.searchParams.delete('access_token')
  for (const [k, v] of Object.entries(busca)) url.searchParams.set(k, v)
  let r: Response
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(25_000) })
  } catch {
    throw new ErroDoMeta('Não foi possível falar com o Meta (sem resposta).')
  }
  const corpo = await r.json().catch(() => null)
  if (!r.ok || !corpo || (corpo as { error?: unknown }).error) throw new ErroDoMeta(mensagemDoErroDoMeta(r.status, corpo, token))
  return corpo as Record<string, unknown>
}

/** Todas as páginas de uma lista (data + paging.next), até `maxPaginas`. */
async function lista(token: string, caminho: string, busca: Record<string, string>, maxPaginas = 20): Promise<unknown[]> {
  const r: unknown[] = []
  let proxima: string | null = null
  for (let i = 0; i < maxPaginas; i++) {
    const corpo: Record<string, unknown> = proxima ? await graph(token, proxima) : await graph(token, caminho, busca)
    r.push(...(Array.isArray(corpo.data) ? corpo.data : []))
    const next: string | undefined = (corpo.paging as { next?: string } | undefined)?.next
    if (!next) break
    proxima = next
  }
  return r
}

/** Confere token e conta antes de guardar: devolve o nome da conta ou o erro. */
export async function testarMeta(token: string, act: string): Promise<{ nome: string } | { erro: string }> {
  try {
    const c = await graph(token, act, { fields: 'name,account_status,currency' })
    return { nome: typeof c.name === 'string' ? c.name.slice(0, 120) : act }
  } catch (e) {
    return { erro: e instanceof ErroDoMeta ? e.message : 'Não foi possível testar a conexão com o Meta.' }
  }
}

export type ResultadoDoMeta = { conta: string; ok: boolean; mensagem: string }

const CAMPOS_DO_ANUNCIO = 'id,name,status,effective_status,campaign_id,created_time,updated_time,creative{id,title,body,image_url,thumbnail_url,object_type,object_story_spec,asset_feed_spec,url_tags}'

/**
 * Lê uma conta de anúncios e grava (service role). Quem chama TEM de ter
 * conferido o nível (marketing 2+) ou ser o cron.
 */
export async function sincronizarContaMeta(admin: SupabaseClient, workspaceId: string, conta: { id: string; act_id: string; filtro: string | null; nome: string | null }): Promise<ResultadoDoMeta> {
  const rotulo = conta.nome ?? conta.act_id
  const token = await obterChave(workspaceId, 'meta_ads')
  if (!token) {
    await admin.rpc('escola_meta_gravar', { p_conta_id: conta.id, p_campanhas: null, p_anuncios: null, p_erro: 'Sem token do Meta guardado no cofre.' })
    return { conta: rotulo, ok: false, mensagem: 'Sem token do Meta guardado.' }
  }
  try {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const [campanhas, anuncios, insights] = await Promise.all([
      lista(token, `${conta.act_id}/campaigns`, { fields: 'id,name,status,effective_status,objective,start_time,stop_time,lifetime_budget,daily_budget', limit: '200' }),
      lista(token, `${conta.act_id}/ads`, { fields: CAMPOS_DO_ANUNCIO, limit: '100', thumbnail_width: '600', thumbnail_height: '600' }),
      lista(token, `${conta.act_id}/insights`, { level: 'ad', fields: 'ad_id,spend,impressions,clicks,inline_link_clicks,actions', date_preset: 'maximum', limit: '500' }),
    ])
    const lote = montarLote(campanhas, anuncios, insights, conta.filtro, hoje)
    const { data, error } = await admin.rpc('escola_meta_gravar', { p_conta_id: conta.id, p_campanhas: lote.campanhas, p_anuncios: lote.anuncios, p_erro: null })
    if (error) throw new ErroDoMeta(error.code === 'P0001' && error.message ? error.message : 'Não foi possível gravar o que o Meta trouxe.')
    const imagens = await baixarImagens(admin, workspaceId, lote.imagens)
    const r = (data ?? {}) as { campanhas_novas?: number; anuncios?: number; anuncios_novos?: number }
    return { conta: rotulo, ok: true, mensagem: `${lote.campanhas.length} campanhas e ${r.anuncios ?? 0} anúncios lidos (${r.anuncios_novos ?? 0} novos, ${r.campanhas_novas ?? 0} campanhas novas${imagens ? `, ${imagens} imagens` : ''}).` }
  } catch (e) {
    const mensagem = e instanceof ErroDoMeta ? e.message : 'Falha inesperada ao ler o Meta.'
    await admin.rpc('escola_meta_gravar', { p_conta_id: conta.id, p_campanhas: null, p_anuncios: null, p_erro: mensagem })
    return { conta: rotulo, ok: false, mensagem }
  }
}

/** Os primeiros bytes dizem o tipo; o que não for JPG, PNG ou WEBP fica sem imagem. */
function tipoDaImagem(b: Uint8Array): { ext: string; mime: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', mime: 'image/png' }
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  return null
}

/**
 * O link da imagem do Meta expira: a imagem é copiada para o Storage da
 * escola, uma vez por anúncio (até 15 por leitura, as próximas na seguinte).
 */
async function baixarImagens(admin: SupabaseClient, workspaceId: string, imagens: Record<string, string>): Promise<number> {
  const ids = Object.keys(imagens)
  if (!ids.length) return 0
  const { data } = await admin.from('escola_pecas').select('id,meta_ad_id').eq('workspace_id', workspaceId).in('meta_ad_id', ids.slice(0, 1000)).is('imagem_path', null).limit(15)
  let n = 0
  for (const p of data ?? []) {
    try {
      const url = new URL(imagens[p.meta_ad_id as string])
      if (url.protocol !== 'https:') continue
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      const tamanho = Number(r.headers.get('content-length') ?? 0)
      if (!r.ok || tamanho > 8 * 1024 * 1024) continue
      const bytes = new Uint8Array(await r.arrayBuffer())
      const tipo = bytes.length <= 8 * 1024 * 1024 ? tipoDaImagem(bytes) : null
      if (!tipo) continue
      const caminho = `${workspaceId}/${p.id}/${randomUUID()}.${tipo.ext}`
      const { error } = await admin.storage.from(BUCKET_DO_MARKETING).upload(caminho, bytes, { contentType: tipo.mime, upsert: false })
      if (error) continue
      await admin.rpc('escola_meta_imagem', { p_peca_id: p.id, p_caminho: caminho })
      n++
    } catch {
      // Imagem é enfeite: a falha de uma não para a leitura.
    }
  }
  return n
}

/** Lê todas as contas de anúncios ativas de um espaço. */
export async function sincronizarMetaDoEspaco(workspaceId: string, soContaId?: string): Promise<ResultadoDoMeta[]> {
  const admin = createAdminClient()
  let q = admin.from('escola_meta_contas').select('id,act_id,filtro,nome').eq('workspace_id', workspaceId).eq('ativa', true)
  if (soContaId) q = q.eq('id', soContaId)
  const { data } = await q
  const r: ResultadoDoMeta[] = []
  for (const c of data ?? []) r.push(await sincronizarContaMeta(admin, workspaceId, c as { id: string; act_id: string; filtro: string | null; nome: string | null }))
  return r
}
