/**
 * O marketing da escola: campanhas (como no HubSpot), peças com números
 * (como na biblioteca de criativos do Motion) e referências (como o swipe
 * file do Foreplay). Puro: rótulos, leitura dos formulários, métricas e a
 * linha do tempo. Dá para conferir com tsx.
 */

export const TIPOS_DE_PECA = {
  pagina: 'Página de venda', advertorial: 'Advertorial', anuncio: 'Anúncio', post: 'Post', video: 'Vídeo / Reels', email: 'E-mail', whatsapp: 'WhatsApp', impresso: 'Impresso', outro: 'Outro',
} as const
export type TipoDePeca = keyof typeof TIPOS_DE_PECA

export const CANAIS = {
  meta_ads: 'Meta Ads', google_ads: 'Google Ads', tiktok_ads: 'TikTok Ads', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube',
  whatsapp: 'WhatsApp', email: 'E-mail', site: 'Site / página', impresso: 'Impresso', outro: 'Outro',
} as const
export type Canal = keyof typeof CANAIS
/** Canais pagos: é neles que investimento, CPL e custo por matrícula fazem sentido. */
export const CANAIS_PAGOS: readonly Canal[] = ['meta_ads', 'google_ads', 'tiktok_ads']

export const OBJETIVOS = {
  matriculas: 'Matrículas', leads: 'Contatos (leads)', marca: 'Marca / alcance', reativacao: 'Reativar ex-alunos', evento: 'Evento / aula aberta', outro: 'Outro',
} as const
export type Objetivo = keyof typeof OBJETIVOS

export const SITUACOES_DA_CAMPANHA = {
  planejada: { rotulo: 'Planejada', classe: 'bg-muted text-muted-foreground' },
  no_ar: { rotulo: 'No ar', classe: 'bg-success/15 text-success' },
  encerrada: { rotulo: 'Encerrada', classe: 'bg-muted text-muted-foreground' },
} as const
export type SituacaoDaCampanha = keyof typeof SITUACOES_DA_CAMPANHA

export const SITUACOES_DA_PECA = {
  rascunho: { rotulo: 'Rascunho', classe: 'bg-muted text-muted-foreground' },
  no_ar: { rotulo: 'No ar', classe: 'bg-success/15 text-success' },
  pausada: { rotulo: 'Pausada', classe: 'bg-warning/20 text-warning-foreground' },
  encerrada: { rotulo: 'Encerrada', classe: 'bg-muted text-muted-foreground' },
} as const
export type SituacaoDaPeca = keyof typeof SITUACOES_DA_PECA

const tem = <T extends object>(o: T) => (v: unknown): v is keyof T => typeof v === 'string' && Object.hasOwn(o, v)
export const ehTipoDePeca = tem(TIPOS_DE_PECA)
export const ehCanal = tem(CANAIS)
export const ehObjetivo = tem(OBJETIVOS)
export const ehSituacaoDaCampanha = tem(SITUACOES_DA_CAMPANHA)
export const ehSituacaoDaPeca = tem(SITUACOES_DA_PECA)

export type Campanha = {
  id: string; nome: string; conta_id: string | null; curso: string | null; objetivo: Objetivo; status: SituacaoDaCampanha
  inicio: string | null; fim: string | null; orcamento: number | null; utm_campaign: string | null; resumo: string | null; aprendizados: string | null
  criado_por: string | null; created_at: string; meta_campaign_id: string | null
}
export type Peca = {
  id: string; campanha_id: string | null; referencia: boolean; fonte: string | null; tipo: TipoDePeca; canal: Canal; titulo: string; url: string | null; texto: string | null
  angulo: string | null; formato: string | null; status: SituacaoDaPeca; publicada_em: string | null; encerrada_em: string | null; imagem_path: string | null
  investimento: number | null; impressoes: number | null; cliques: number | null; leads: number | null; matriculas: number | null; resultado_em: string | null
  vencedora: boolean; nota: string | null; criado_por: string | null; created_at: string
  /** 'meta': lida da Marketing API (os números vêm de lá); 'manual': cadastrada pela equipe. */
  origem: 'manual' | 'meta'; meta_status: string | null
  /** Advertorial: a matéria da Redação (publicada como notícia) e o destino do botão de matrícula. */
  content_id: string | null; destino_url: string | null
}
export type ReceitaDaCampanha = { campanha: string; recebido: number; pagamentos: number; primeira: string | null; ultima: string | null }

export const COLUNAS_DA_CAMPANHA = 'id,nome,conta_id,curso,objetivo,status,inicio,fim,orcamento,utm_campaign,resumo,aprendizados,criado_por,created_at,meta_campaign_id'
export const COLUNAS_DA_PECA = 'id,campanha_id,referencia,fonte,tipo,canal,titulo,url,texto,angulo,formato,status,publicada_em,encerrada_em,imagem_path,investimento,impressoes,cliques,leads,matriculas,resultado_em,vencedora,nota,criado_por,created_at,origem,meta_status,content_id,destino_url'

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
export const lerCampanhaDoBanco = (c: Record<string, unknown>) => ({ ...c, orcamento: num(c.orcamento) }) as Campanha
export const lerPecaDoBanco = (p: Record<string, unknown>) =>
  ({ ...p, investimento: num(p.investimento), impressoes: num(p.impressoes), cliques: num(p.cliques), leads: num(p.leads), matriculas: num(p.matriculas) }) as Peca

// ---------------------------------------------------------------- formulários

/** "1.500,50" → "1500.50"; "" → ""; lixo → null (erro). */
export function lerValor(v: string): string | null {
  const s = v.trim().replace(/^R\$\s*/, '')
  if (!s) return ''
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  return /^\d{1,10}(\.\d{1,2})?$/.test(n) ? n : null
}
/** "42.000" → "42000"; "" → ""; lixo → null. */
export function lerInteiro(v: string): string | null {
  const s = v.trim().replace(/[.\s]/g, '')
  if (!s) return ''
  return /^\d{1,12}$/.test(s) ? String(Number(s)) : null
}
const lerDia = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : '')

/** "Punção Venosa — Outubro 2026" → "puncao-venosa-outubro-2026" (o utm_campaign sugerido). */
export function slugDeUtm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function lerFormularioDaCampanha(f: FormData): { dados: Record<string, unknown> | null; erro?: string } {
  const t = (k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max)
  const nome = t('nome', 120)
  if (nome.length < 2) return { dados: null, erro: 'Dê um nome à campanha.' }
  const orcamento = lerValor(t('orcamento', 20))
  if (orcamento === null) return { dados: null, erro: 'Orçamento: use só números (ex.: 1.500,00).' }
  const utm = t('utm_campaign', 100).toLowerCase()
  if (utm && !/^[a-z0-9][a-z0-9._-]{1,99}$/.test(utm)) return { dados: null, erro: 'O utm_campaign aceita só letras minúsculas, números, ponto, hífen e sublinhado (ex.: puncao-out26).' }
  const inicio = lerDia(t('inicio', 10)), fim = lerDia(t('fim', 10))
  if (inicio && fim && fim < inicio) return { dados: null, erro: 'O fim vem antes do início.' }
  const objetivo = t('objetivo', 20), status = t('status', 20), conta = t('conta_id', 40)
  return {
    dados: {
      nome, curso: t('curso', 120), objetivo: ehObjetivo(objetivo) ? objetivo : 'matriculas', status: ehSituacaoDaCampanha(status) ? status : 'planejada',
      inicio, fim, orcamento, utm_campaign: utm, resumo: t('resumo', 1000), aprendizados: t('aprendizados', 4000), conta_id: /^[0-9a-f-]{36}$/.test(conta) ? conta : '',
    },
  }
}

export function lerFormularioDaPeca(f: FormData): { dados: Record<string, unknown> | null; erro?: string } {
  const t = (k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max)
  const titulo = t('titulo', 160)
  if (titulo.length < 2) return { dados: null, erro: 'Dê um título à peça.' }
  const tipo = t('tipo', 20), canal = t('canal', 20), status = t('status', 20)
  if (!ehTipoDePeca(tipo) || !ehCanal(canal)) return { dados: null, erro: 'Escolha o tipo e o canal da peça.' }
  const url = t('url', 500)
  if (url && !/^https?:\/\/\S+$/.test(url)) return { dados: null, erro: 'O link precisa começar com http:// ou https://.' }
  const referencia = f.get('referencia') === 'sim'
  const investimento = lerValor(t('investimento', 20))
  const inteiros = Object.fromEntries(['impressoes', 'cliques', 'leads', 'matriculas'].map((k) => [k, lerInteiro(t(k, 20))]))
  if (investimento === null || Object.values(inteiros).some((v) => v === null)) return { dados: null, erro: 'Nos resultados, use só números (investimento em reais; impressões, cliques, contatos e matrículas inteiros).' }
  const publicada = lerDia(t('publicada_em', 10)), encerrada = lerDia(t('encerrada_em', 10))
  if (publicada && encerrada && encerrada < publicada) return { dados: null, erro: 'O fim vem antes da publicação.' }
  const campanha = t('campanha_id', 40)
  return {
    dados: {
      referencia, fonte: referencia ? t('fonte', 120) : '', tipo, canal, titulo, url, texto: t('texto', 5000), angulo: t('angulo', 60), formato: t('formato', 60),
      status: ehSituacaoDaPeca(status) ? status : '', publicada_em: publicada, encerrada_em: encerrada,
      investimento: referencia ? '' : investimento, ...(referencia ? { impressoes: inteiros.impressoes, cliques: inteiros.cliques, leads: '', matriculas: '' } : inteiros),
      resultado_em: lerDia(t('resultado_em', 10)), vencedora: !referencia && f.get('vencedora') === 'sim', nota: t('nota', 2000),
      campanha_id: !referencia && /^[0-9a-f-]{36}$/.test(campanha) ? campanha : '',
    },
  }
}

// ---------------------------------------------------------------- métricas

export type Metricas = { ctr: number | null; cpc: number | null; cpl: number | null; cpa: number | null; conversao: number | null }

const div = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null)

/** CTR (cliques/impressões), CPC, custo por contato, custo por matrícula e contato→matrícula. */
export function metricas(p: Pick<Peca, 'investimento' | 'impressoes' | 'cliques' | 'leads' | 'matriculas'>): Metricas {
  return { ctr: div(p.cliques, p.impressoes), cpc: div(p.investimento, p.cliques), cpl: div(p.investimento, p.leads), cpa: div(p.investimento, p.matriculas), conversao: div(p.matriculas, p.leads) }
}

export type TotaisDaCampanha = Metricas & {
  pecas: number; investimento: number; impressoes: number; cliques: number; leads: number; matriculas: number
  /** Receita que a Únicopag atribuiu ao utm_campaign (reais), null sem UTM. */
  receita: number | null; roas: number | null
  /** Quanto do orçamento já foi usado (0–1+), null sem orçamento. */
  usoDoOrcamento: number | null
}

/** Soma as peças NOSSAS da campanha (referência não entra) e cruza com a receita da Únicopag. */
export function totaisDaCampanha(c: Pick<Campanha, 'orcamento' | 'utm_campaign'>, pecas: Peca[], receitas: ReceitaDaCampanha[]): TotaisDaCampanha {
  const nossas = pecas.filter((p) => !p.referencia)
  const soma = (k: 'investimento' | 'impressoes' | 'cliques' | 'leads' | 'matriculas') => nossas.reduce((s, p) => s + (p[k] ?? 0), 0)
  const t = { investimento: soma('investimento'), impressoes: soma('impressoes'), cliques: soma('cliques'), leads: soma('leads'), matriculas: soma('matriculas') }
  const r = c.utm_campaign ? receitas.find((x) => x.campanha === c.utm_campaign) : undefined
  const receita = c.utm_campaign ? (r ? r.recebido / 100 : 0) : null
  const nz = (n: number) => (n > 0 ? n : null)
  return {
    pecas: nossas.length, ...t,
    ...metricas({ investimento: nz(t.investimento), impressoes: nz(t.impressoes), cliques: nz(t.cliques), leads: nz(t.leads), matriculas: nz(t.matriculas) }),
    receita, roas: receita !== null && t.investimento > 0 ? receita / t.investimento : null,
    usoDoOrcamento: c.orcamento && c.orcamento > 0 ? t.investimento / c.orcamento : null,
  }
}

// ---------------------------------------------------------------- linha do tempo

export type ItemDaLinha = { tipo: 'campanha'; data: string; campanha: Campanha } | { tipo: 'peca'; data: string; peca: Peca }

/** A data que conta na linha do tempo: início da campanha / publicação da peça; sem ela, quando foi cadastrada (Brasília). */
const diaDoCadastro = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
export const dataDaCampanha = (c: Pick<Campanha, 'inicio' | 'created_at'>) => c.inicio ?? diaDoCadastro(c.created_at)
export const dataDaPeca = (p: Pick<Peca, 'publicada_em' | 'created_at'>) => p.publicada_em ?? diaDoCadastro(p.created_at)

/** Tudo o que já foi feito, do mais novo ao mais antigo, agrupado por mês ("2026-10"). */
export function linhaDoTempo(campanhas: Campanha[], pecas: Peca[]): { mes: string; itens: ItemDaLinha[] }[] {
  const itens: ItemDaLinha[] = [
    ...campanhas.map((c) => ({ tipo: 'campanha' as const, data: dataDaCampanha(c), campanha: c })),
    ...pecas.map((p) => ({ tipo: 'peca' as const, data: dataDaPeca(p), peca: p })),
  ].sort((a, b) => b.data.localeCompare(a.data) || (a.tipo === b.tipo ? 0 : a.tipo === 'campanha' ? -1 : 1))
  const grupos = new Map<string, ItemDaLinha[]>()
  for (const i of itens) grupos.set(i.data.slice(0, 7), [...(grupos.get(i.data.slice(0, 7)) ?? []), i])
  return [...grupos].map(([mes, itens]) => ({ mes, itens }))
}

// ---------------------------------------------------------------- UTM

/**
 * O link com as UTMs da campanha, do jeito que o sistema da escola lê
 * (utm_source/utm_medium/utm_campaign/utm_content) e repassa à Únicopag.
 * Mantém o que o link já tinha; troca só as UTMs. Link inválido → null.
 */
export function linkComUtm(base: string, u: { source: string; medium: string; campaign: string; content?: string }): string | null {
  let url: URL
  try { url = new URL(base.trim()) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const limpo = (s: string) => slugDeUtm(s).replace(/-+/g, '-')
  for (const [k, v] of [['utm_source', u.source], ['utm_medium', u.medium], ['utm_campaign', u.campaign], ['utm_content', u.content ?? '']] as const) {
    const valor = k === 'utm_campaign' ? v.trim().toLowerCase() : limpo(v)
    if (valor) url.searchParams.set(k, valor)
    else url.searchParams.delete(k)
  }
  return url.toString()
}

/** A origem (utm_source/medium) padrão de cada canal. */
export const UTM_DO_CANAL: Record<Canal, { source: string; medium: string }> = {
  meta_ads: { source: 'facebook', medium: 'paid' }, google_ads: { source: 'google', medium: 'cpc' }, tiktok_ads: { source: 'tiktok', medium: 'paid' },
  instagram: { source: 'instagram', medium: 'social' }, facebook: { source: 'facebook', medium: 'social' }, tiktok: { source: 'tiktok', medium: 'social' },
  youtube: { source: 'youtube', medium: 'social' }, whatsapp: { source: 'whatsapp', medium: 'mensagem' }, email: { source: 'email', medium: 'email' },
  site: { source: 'site', medium: 'referral' }, impresso: { source: 'impresso', medium: 'qrcode' }, outro: { source: 'outro', medium: 'outro' },
}

export const reais = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
export const pct = (n: number | null, casas = 1) => (n === null ? '—' : `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`)
export const milhar = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR'))
