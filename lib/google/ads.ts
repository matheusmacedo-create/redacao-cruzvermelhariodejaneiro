import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { alertarIntegracao } from '@/lib/integracoes/alertas'
import { apiDoGoogle } from './api'
import { CLIENTE_RECUSADO, chamarToken, clienteOAuth, GmailError } from './gmail'
import {
  API_DO_ADS, CONSULTA_DA_CONTA, CONSULTA_DAS_CAMPANHAS, PLANO_DO_GRANTS, consultaDoIdioma, consultaDoLocal, idDaCampanha, idDaConta, lerCampanhaCriada,
  lerContasAcessiveis, motivoDaFalhaDoAds, operacoesDaCampanha, pedidoDeConsulta, pedidoDeMutacao, problemasDoPlano, type AlvosResolvidos, type Plano,
} from './ads-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O Google Ads da filial: a conta do Google Ad Grants onde rodam as campanhas de pesquisa que levam ao site. As regras,
 * sem rede, estão em ./ads-regras.ts (o plano da campanha, a conferência e a montagem do pedido).
 *
 * Uma conexão própria, no padrão da do Drive (lib/google/drive.ts): o mesmo cliente OAuth e a mesma volta
 * (/api/google/retorno, com o state "ads.…"), o refresh token no cofre como `google_ads` e quem, quando e qual conta
 * em google_ads_conexao. Desde 9/9/2026 a API não tem mais developer token: o acesso (Test, Explorer, Basic) é do
 * projeto do Google Cloud dono do cliente OAuth, e é nele que se pede o nível Explorer para falar com contas reais.
 *
 * As mesmas três regras das outras integrações: nunca lança (cada função devolve { ok: true, … } ou { ok: false, erro });
 * a autorização que expira vira "expirada" na conexão, e só a troca de "ativa" para "expirada" avisa a administração;
 * e a criação da campanha é um pedido só, conferido antes com validateOnly e gravado PAUSADO.
 */

export type FalhaDoAds = { ok: false; erro: string; reconectar?: boolean }
const SEM_CONEXAO = 'O Google Ads ainda não foi conectado. Um administrador conecta em Configurações → E-mail dos setores → Google Ads.'

class ErroDoAds extends Error {
  constructor(message: string, public reconectar = false) {
    super(message)
    this.name = 'ErroDoAds'
  }
}
const falha = (erro: string, reconectar = false): FalhaDoAds => ({ ok: false, erro, ...(reconectar ? { reconectar } : {}) })

// ------------------------------------------------------------------ o token

const cache = new Map<string, { token: string; expira: number }>()

async function marcarExpirada(workspaceId: string): Promise<void> {
  try {
    const { data: virou } = await createAdminClient().from('google_ads_conexao').update({ estado: 'expirada' })
      .eq('workspace_id', workspaceId).eq('estado', 'ativa').select('email_conta').maybeSingle()
    if (virou) await alertarIntegracao({ integracao: 'google_ads', workspaceId, conta: (virou.email_conta as string | null) ?? null })
  } catch (causa) {
    console.error('[ads] conexão não marcada como expirada:', causa instanceof Error ? causa.message : causa)
  }
}

async function tokenDoAds(workspaceId: string): Promise<string> {
  const guardado = cache.get(workspaceId)
  if (guardado && guardado.expira > Date.now() + 60_000) return guardado.token
  const refresh = await obterChave(workspaceId, 'google_ads')
  if (!refresh) throw new ErroDoAds(SEM_CONEXAO, true)
  let cliente: { clientId: string; clientSecret: string }
  try { cliente = await clienteOAuth(workspaceId) } catch (causa) { throw new ErroDoAds(causa instanceof Error ? causa.message : SEM_CONEXAO) }
  try {
    const dados = await chamarToken({ refresh_token: refresh, client_id: cliente.clientId, client_secret: cliente.clientSecret, grant_type: 'refresh_token' })
    const token = String(dados.access_token ?? '')
    cache.set(workspaceId, { token, expira: Date.now() + Number(dados.expires_in ?? 3000) * 1000 })
    return token
  } catch (causa) {
    if (causa instanceof GmailError && causa.reconectar) {
      await marcarExpirada(workspaceId)
      throw new ErroDoAds('A autorização do Google Ads expirou ou foi revogada. Reconecte em Configurações → E-mail dos setores.', true)
    }
    if (causa instanceof GmailError && causa.message === CLIENTE_RECUSADO) await alertarIntegracao({ integracao: 'google_oauth', workspaceId, motivo: 'chave' })
    throw new ErroDoAds(causa instanceof Error ? causa.message : 'Não foi possível renovar a autorização do Google Ads.')
  }
}

/** Esquece o token guardado nesta instância (a reconexão e a desconexão chamam). */
export const esquecerTokenDoAds = (workspaceId: string) => { cache.delete(workspaceId) }

// ------------------------------------------------------------------ os pedidos

type Resposta = { ok: boolean; status: number; dados: unknown }

/** Só fora de produção, o servidor de mentira dos testes (GOOGLE_API_TESTE). */
const noServidor = (url: string) => { const u = new URL(url); return `${apiDoGoogle(`${u.origin}${u.pathname}`)}${u.search}` }

async function pedir(token: string, url: string, corpo?: Record<string, unknown>, ms = 30_000): Promise<Resposta> {
  try {
    const res = await fetch(noServidor(url), {
      method: corpo ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(ms),
    })
    const dados = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, dados }
  } catch {
    return { ok: false, status: 0, dados: {} }
  }
}

/** Um pedido já autenticado; a falha de autorização de novo (401) marca a conexão como expirada. */
async function pedirComoAds(workspaceId: string, url: string, corpo?: Record<string, unknown>): Promise<Resposta> {
  const token = await tokenDoAds(workspaceId)
  const r = await pedir(token, url, corpo)
  if (r.status === 401) {
    cache.delete(workspaceId)
    await marcarExpirada(workspaceId)
    throw new ErroDoAds('A autorização do Google Ads expirou ou foi revogada. Reconecte em Configurações → E-mail dos setores.', true)
  }
  return r
}

const recusa = (r: Resposta) => { const { texto, motivo } = motivoDaFalhaDoAds(r.status, r.dados); return new ErroDoAds(texto, motivo === 'reconectar') }

// ------------------------------------------------------------------ a conexão

/** As contas que uma autorização alcança, com o token da volta do consentimento (antes de existir conexão). */
export async function contasAcessiveis(accessToken: string): Promise<string[]> {
  const r = await pedir(accessToken, `${API_DO_ADS}/customers:listAccessibleCustomers`)
  return r.ok ? lerContasAcessiveis(r.dados) : []
}

type Conexao = { customer_id: string | null; estado: 'ativa' | 'expirada'; email_conta: string; contas_acessiveis: string[] | null; campanha_recurso: string | null }

async function conexaoDoAds(admin: Admin, workspaceId: string): Promise<Conexao | null> {
  const { data } = await admin.from('google_ads_conexao').select('customer_id,estado,email_conta,contas_acessiveis,campanha_recurso').eq('workspace_id', workspaceId).maybeSingle()
  return (data as Conexao | null) ?? null
}

async function contaDaConexao(workspaceId: string): Promise<string> {
  const c = await conexaoDoAds(createAdminClient(), workspaceId)
  if (!c) throw new ErroDoAds(SEM_CONEXAO, true)
  const id = idDaConta(c.customer_id)
  if (!id) throw new ErroDoAds('A conexão não tem conta de anúncios escolhida. Escolha uma no cartão do Google Ads.')
  return id
}

export type ContaDoAds = { ok: true; id: string; nome: string; moeda: string; fuso: string; administradora: boolean; teste: boolean }

type Linha = Record<string, Record<string, unknown>>
const linhas = (dados: unknown): Linha[] => { const r = (dados as { results?: unknown })?.results; return Array.isArray(r) ? (r as Linha[]) : [] }

/** A conta de anúncios como o Google a vê: é por aqui que se confirma que a API alcança a conta (o acesso Explorer). */
export async function lerConta(workspaceId: string): Promise<ContaDoAds | FalhaDoAds> {
  try {
    const id = await contaDaConexao(workspaceId)
    const { url, corpo } = pedidoDeConsulta(id, CONSULTA_DA_CONTA)
    const r = await pedirComoAds(workspaceId, url, corpo)
    if (!r.ok) throw recusa(r)
    const c = linhas(r.dados)[0]?.customer ?? {}
    return { ok: true, id, nome: String(c.descriptiveName ?? ''), moeda: String(c.currencyCode ?? ''), fuso: String(c.timeZone ?? ''), administradora: Boolean(c.manager), teste: Boolean(c.testAccount) }
  } catch (causa) {
    return causa instanceof ErroDoAds ? falha(causa.message, causa.reconectar) : falha(causa instanceof Error ? causa.message : 'Não foi possível ler a conta.')
  }
}

export type CampanhaExistente = { id: string; nome: string; status: string; recurso: string }

export async function listarCampanhas(workspaceId: string): Promise<{ ok: true; campanhas: CampanhaExistente[] } | FalhaDoAds> {
  try {
    const id = await contaDaConexao(workspaceId)
    const { url, corpo } = pedidoDeConsulta(id, CONSULTA_DAS_CAMPANHAS)
    const r = await pedirComoAds(workspaceId, url, corpo)
    if (!r.ok) throw recusa(r)
    return { ok: true, campanhas: linhas(r.dados).map((l) => ({ id: String(l.campaign?.id ?? ''), nome: String(l.campaign?.name ?? ''), status: String(l.campaign?.status ?? ''), recurso: String(l.campaign?.resourceName ?? '') })) }
  } catch (causa) {
    return causa instanceof ErroDoAds ? falha(causa.message, causa.reconectar) : falha(causa instanceof Error ? causa.message : 'Não foi possível listar as campanhas.')
  }
}

// ------------------------------------------------------------------ a campanha

async function resolverAlvos(workspaceId: string, customerId: string, plano: Plano): Promise<AlvosResolvidos> {
  const local = await pedirComoAds(workspaceId, pedidoDeConsulta(customerId, consultaDoLocal(plano.local)).url, pedidoDeConsulta(customerId, consultaDoLocal(plano.local)).corpo)
  if (!local.ok) throw recusa(local)
  const geo = linhas(local.dados).map((l) => l.geoTargetConstant ?? {})
  // "Rio de Janeiro" é cidade e estado; com o tipo na consulta sobra a cidade, mas o nome canônico desempata se vier mais de uma.
  const cidade = geo.find((g) => String(g.canonicalName ?? '').includes(`${plano.local.nome},`)) ?? geo[0]
  const localRecurso = String(cidade?.resourceName ?? '')
  if (!localRecurso) throw new ErroDoAds(`O Google não achou "${plano.local.nome}" como ${plano.local.tipo === 'City' ? 'cidade' : 'estado'} do Brasil para segmentar.`)
  const idioma = await pedirComoAds(workspaceId, pedidoDeConsulta(customerId, consultaDoIdioma(plano.idioma)).url, pedidoDeConsulta(customerId, consultaDoIdioma(plano.idioma)).corpo)
  if (!idioma.ok) throw recusa(idioma)
  const idiomaRecurso = String(linhas(idioma.dados)[0]?.languageConstant?.resourceName ?? '')
  if (!idiomaRecurso) throw new ErroDoAds(`O Google não achou o idioma "${plano.idioma}".`)
  return { local: localRecurso, idioma: idiomaRecurso }
}

export type ResultadoDaCampanha = { ok: true; validada: true } | { ok: true; validada: false; campanhaId: string; recurso: string } | FalhaDoAds

/**
 * Cria a campanha do plano na conta conectada — ou só a confere (`validar`: o mesmo pedido com validateOnly, nada é
 * gravado). Recusa se já existe campanha com o mesmo nome. O que entra, entra PAUSADO; quem liga é uma pessoa, no painel.
 */
export async function criarCampanha(workspaceId: string, p: { validar: boolean; plano?: Plano }): Promise<ResultadoDaCampanha> {
  const plano = p.plano ?? PLANO_DO_GRANTS
  try {
    const problemas = problemasDoPlano(plano)
    if (problemas.length) return falha(`O plano não passa na conferência: ${problemas.slice(0, 3).join(' ')}${problemas.length > 3 ? ` (e mais ${problemas.length - 3})` : ''}`)
    const customerId = await contaDaConexao(workspaceId)
    const existentes = await listarCampanhas(workspaceId)
    if (!existentes.ok) return existentes
    if (existentes.campanhas.some((c) => c.nome === plano.nome)) return falha(`Já existe uma campanha chamada "${plano.nome}" nesta conta. Para criar outra, renomeie ou remova a atual no painel do Google Ads.`)
    const alvos = await resolverAlvos(workspaceId, customerId, plano)
    const { url, corpo } = pedidoDeMutacao(customerId, operacoesDaCampanha({ customerId, plano, alvos }), p.validar)
    const r = await pedirComoAds(workspaceId, url, corpo)
    if (!r.ok) throw recusa(r)
    if (p.validar) return { ok: true, validada: true }
    const recurso = lerCampanhaCriada(r.dados)
    const campanhaId = recurso ? idDaCampanha(recurso) : null
    if (!recurso || !campanhaId) return falha('O Google criou, mas não devolveu o id da campanha. Confira no painel do Google Ads antes de tentar de novo.')
    await createAdminClient().from('google_ads_conexao').update({ campanha_recurso: recurso, campanha_criada_em: new Date().toISOString() }).eq('workspace_id', workspaceId)
    return { ok: true, validada: false, campanhaId, recurso }
  } catch (causa) {
    return causa instanceof ErroDoAds ? falha(causa.message, causa.reconectar) : falha(causa instanceof Error ? causa.message : 'Não foi possível criar a campanha.')
  }
}
