/**
 * A leitura da Marketing API do Meta para o marketing da escola. Puro: sem
 * rede nem banco (a chamada mora em lib/escola/meta-servidor.ts).
 *
 * Campos usados (Graph API): campanhas (id, name, effective_status,
 * start_time, stop_time, lifetime_budget/daily_budget — em centavos da
 * moeda da conta), anúncios (id, name, effective_status, campaign_id,
 * created_time, creative{title, body, image_url, thumbnail_url,
 * object_type, object_story_spec, asset_feed_spec, url_tags}) e insights
 * por anúncio no período todo (spend, impressions, clicks,
 * inline_link_clicks, actions).
 */

import type { SituacaoDaCampanha, SituacaoDaPeca, TipoDePeca } from './marketing'

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/[ \t]+/g, ' ').slice(0, max) : null)
const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}
const idMeta = (v: unknown) => (typeof v === 'string' && /^\d{5,30}$/.test(v) ? v : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : null)

/** "2026-10-01T10:00:00-0300" → "2026-10-01" (o dia em Brasília). */
export function diaDoMeta(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** A campanha passa no filtro da conta (nome contém o texto, sem acento nem caixa)? */
export const passaNoFiltro = (nome: string, filtro: string | null) => !filtro || sem(nome).includes(sem(filtro))

export function situacaoDaCampanhaMeta(status: unknown, fim: string | null, hoje: string): SituacaoDaCampanha {
  const s = String(status ?? '').toUpperCase()
  if (s === 'ACTIVE') return fim && fim < hoje ? 'encerrada' : 'no_ar'
  if (['IN_PROCESS', 'PENDING_REVIEW', 'PREAPPROVED', 'PENDING_BILLING_INFO'].includes(s)) return 'planejada'
  return 'encerrada'
}

export function situacaoDoAnuncioMeta(status: unknown): SituacaoDaPeca {
  const s = String(status ?? '').toUpperCase()
  if (s === 'ACTIVE') return 'no_ar'
  if (['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(s)) return 'pausada'
  if (['ARCHIVED', 'DELETED', 'DISAPPROVED'].includes(s)) return 'encerrada'
  return 'rascunho'
}

/** O utm_campaign de um link ou de url_tags ("utm_source=fb&utm_campaign=x"). */
export function utmCampaignDe(...fontes: (string | null | undefined)[]): string | null {
  for (const f of fontes) {
    if (!f) continue
    const q = f.includes('?') ? f.slice(f.indexOf('?') + 1) : f
    const m = new URLSearchParams(q.split('#')[0]).get('utm_campaign')
    // {{campaign.name}} e afins são macros do Meta, não um valor.
    if (m && !m.includes('{{')) {
      const v = m.trim().toLowerCase()
      if (/^[a-z0-9][a-z0-9._-]{1,99}$/.test(v)) return v
    }
  }
  return null
}

export type CampanhaDoMeta = { meta_id: string; nome: string; status: SituacaoDaCampanha; inicio: string | null; fim: string | null; orcamento: number | null; utm: string | null }
export type AnuncioDoMeta = {
  meta_id: string; campanha_meta_id: string; titulo: string; texto: string | null; url: string | null; tipo: TipoDePeca; formato: string | null
  status: SituacaoDaPeca; meta_status: string | null; publicada_em: string | null; encerrada_em: string | null
  investimento: number; impressoes: number; cliques: number; leads: number; matriculas: number
}

/** Os números de um anúncio a partir da linha de insights. Contato = lead; matrícula = compra (o Purchase que o sistema da escola manda pela API de Conversões). */
export function lerInsight(linha: unknown): { ad_id: string; investimento: number; impressoes: number; cliques: number; leads: number; matriculas: number } | null {
  const l = obj(linha)
  const ad = idMeta(l.ad_id)
  if (!ad) return null
  const acoes = new Map(arr(l.actions).map((a) => [String(obj(a).action_type ?? ''), numero(obj(a).value) ?? 0]))
  // Tipos agregados primeiro: somar "lead" com "offsite_conversion.fb_pixel_lead" contaria duas vezes.
  const primeiro = (tipos: string[]) => { for (const t of tipos) if (acoes.has(t)) return acoes.get(t)!; return 0 }
  return {
    ad_id: ad,
    investimento: Math.round((numero(l.spend) ?? 0) * 100) / 100,
    impressoes: Math.round(numero(l.impressions) ?? 0),
    cliques: Math.round(numero(l.inline_link_clicks) ?? numero(l.clicks) ?? 0),
    leads: Math.round(primeiro(['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_web_lead'])),
    matriculas: Math.round(primeiro(['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'])),
  }
}

/** Link, texto, título, imagem e tipo do criativo (anúncio de imagem, vídeo, carrossel ou dinâmico). */
export function lerCriativo(c: unknown): { titulo: string | null; texto: string | null; url: string | null; imagem: string | null; tipo: TipoDePeca; formato: string | null; urlTags: string | null } {
  const k = obj(c)
  const oss = obj(k.object_story_spec)
  const link = obj(oss.link_data), video = obj(oss.video_data), feed = obj(k.asset_feed_spec)
  const primeiroDe = (lista: unknown, campo: string) => txt(obj(arr(lista)[0])[campo], 5000)
  const carrossel = arr(link.child_attachments).length > 1
  const ehVideo = String(k.object_type ?? '').toUpperCase() === 'VIDEO' || Object.keys(video).length > 0 || arr(feed.videos).length > 0
  const url = txt(link.link, 500) ?? txt(obj(obj(video.call_to_action).value).link, 500) ?? primeiroDe(feed.link_urls, 'website_url') ?? txt(obj(obj(link.call_to_action).value).link, 500)
  return {
    titulo: txt(k.title, 160) ?? txt(link.name, 160) ?? txt(video.title, 160) ?? primeiroDe(feed.titles, 'text'),
    texto: txt(k.body, 5000) ?? txt(link.message, 5000) ?? txt(video.message, 5000) ?? primeiroDe(feed.bodies, 'text'),
    url: url && /^https?:\/\/\S+$/.test(url) ? url : null,
    imagem: txt(k.image_url, 2000) ?? txt(link.picture, 2000) ?? txt(video.image_url, 2000) ?? txt(k.thumbnail_url, 2000),
    tipo: ehVideo ? 'video' : 'anuncio',
    formato: carrossel ? 'Carrossel' : ehVideo ? 'Vídeo' : arr(feed.images).length > 1 ? 'Dinâmico (várias imagens)' : 'Imagem',
    urlTags: txt(k.url_tags, 1000),
  }
}

export type LoteDoMeta = { campanhas: CampanhaDoMeta[]; anuncios: AnuncioDoMeta[]; imagens: Record<string, string> }

/**
 * Junta campanhas, anúncios e insights num lote para escola_meta_gravar:
 * só as campanhas que passam no filtro (e os anúncios delas); o utm da
 * campanha é o que aparece nos links dos anúncios dela.
 */
export function montarLote(campanhasBrutas: unknown[], anunciosBrutos: unknown[], insightsBrutos: unknown[], filtro: string | null, hoje: string): LoteDoMeta {
  const insights = new Map(insightsBrutos.map(lerInsight).filter(Boolean).map((i) => [i!.ad_id, i!]))
  const campanhas = new Map<string, CampanhaDoMeta>()
  for (const b of campanhasBrutas) {
    const c = obj(b)
    const id = idMeta(c.id), nome = txt(c.name, 120)
    if (!id || !nome || !passaNoFiltro(nome, filtro)) continue
    const fim = diaDoMeta(c.stop_time)
    const centavos = numero(c.lifetime_budget)
    campanhas.set(id, {
      meta_id: id, nome: nome.length >= 2 ? nome : `Campanha ${id}`, status: situacaoDaCampanhaMeta(c.effective_status ?? c.status, fim, hoje),
      inicio: diaDoMeta(c.start_time), fim, orcamento: centavos !== null && centavos > 0 ? centavos / 100 : null, utm: null,
    })
  }
  const anuncios: AnuncioDoMeta[] = []
  const imagens: Record<string, string> = {}
  const utms = new Map<string, Map<string, number>>()
  for (const b of anunciosBrutos) {
    const a = obj(b)
    const id = idMeta(a.id), camp = idMeta(a.campaign_id)
    if (!id || !camp || !campanhas.has(camp)) continue
    const cr = lerCriativo(a.creative)
    const n = insights.get(id)
    const status = situacaoDoAnuncioMeta(a.effective_status ?? a.status)
    const nome = txt(a.name, 160) ?? cr.titulo ?? `Anúncio ${id}`
    const utm = utmCampaignDe(cr.url, cr.urlTags)
    if (utm) utms.set(camp, new Map(utms.get(camp) ?? []).set(utm, (utms.get(camp)?.get(utm) ?? 0) + 1))
    if (cr.imagem && /^https:\/\//.test(cr.imagem)) imagens[id] = cr.imagem
    anuncios.push({
      meta_id: id, campanha_meta_id: camp, titulo: nome.length >= 2 ? nome : `Anúncio ${id}`, texto: cr.texto, url: cr.url, tipo: cr.tipo, formato: cr.formato,
      status, meta_status: txt(a.effective_status ?? a.status, 40), publicada_em: diaDoMeta(a.created_time),
      encerrada_em: status === 'encerrada' ? diaDoMeta(a.updated_time) : null,
      investimento: n?.investimento ?? 0, impressoes: n?.impressoes ?? 0, cliques: n?.cliques ?? 0, leads: n?.leads ?? 0, matriculas: n?.matriculas ?? 0,
    })
  }
  for (const [id, contagem] of utms) {
    const c = campanhas.get(id)
    if (c) c.utm = [...contagem].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0]
  }
  return { campanhas: [...campanhas.values()], anuncios, imagens }
}

/** "act_123" / "123" → "act_123"; outra coisa → null. */
export function lerActId(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/\s/g, '')
  const d = s.startsWith('act_') ? s.slice(4) : s
  return /^\d{5,25}$/.test(d) ? `act_${d}` : null
}

/** Erro do Graph em português, sem nunca repetir o token. */
export function mensagemDoErroDoMeta(status: number | null, corpo: unknown, token?: string): string {
  const e = obj(obj(corpo).error)
  const codigo = numero(e.code)
  const sem = (s: string) => (token ? s.split(token).join('•••') : s)
  if (codigo === 190) return 'O token do Meta expirou ou foi revogado (190). Gere um novo token do usuário do sistema e guarde de novo.'
  if (codigo === 10 || codigo === 200 || codigo === 294) return `O token não tem permissão para ler esta conta de anúncios (${codigo}). Dê ads_read e acesso à conta ao usuário do sistema.`
  if (codigo === 100) return sem(`O Meta não reconheceu a conta de anúncios ou um campo (100): ${txt(e.message, 200) ?? 'pedido inválido'}.`)
  if (codigo === 17 || codigo === 4 || codigo === 613 || codigo === 80004) return 'Limite de consultas do Meta atingido. A próxima leitura tenta de novo.'
  if (status && status >= 500) return 'O Meta está com problema agora. Tente de novo mais tarde.'
  const m = txt(e.message, 200)
  return sem(m ? `O Meta respondeu: ${m}` : status ? `O Meta respondeu ${status}.` : 'Não foi possível falar com o Meta.')
}
