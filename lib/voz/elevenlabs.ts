import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { MODELO_PADRAO, dividirEmTrechos, ehModeloDaVoz, type ConfigDaVoz, type ModeloDaVoz } from './regras'

/**
 * A ElevenLabs (texto em voz). As regras de sempre das integrações: nunca lança, a chave não sai daqui (nem no erro),
 * e quem chama já conferiu que a pessoa é do espaço.
 *
 * Contrato conferido em elevenlabs.io/docs (outubro de 2026):
 *  - POST /v1/text-to-speech/{voice_id}?output_format=… com o cabeçalho xi-api-key; corpo { text, model_id,
 *    previous_text, next_text }; a resposta é o arquivo de áudio;
 *  - output_format: mp3_44100_128 (a matéria), mp3_44100_64 e opus_48000_64 (o WhatsApp);
 *  - GET /v2/voices?page_size=100 lista as vozes da conta (voice_id, name, category, labels, preview_url);
 *  - eleven_v4 aceita até 10.000 caracteres por pedido; os trechos daqui têm até 4.500.
 */

type Admin = ReturnType<typeof createAdminClient>

const API = 'https://api.elevenlabs.io'
const TEMPO_DA_LISTA_MS = 15_000
/** Um trecho de 4.500 caracteres leva uns 10 a 20 s; com folga. */
const TEMPO_DO_TRECHO_MS = 60_000
/** Trechos de uma matéria ao mesmo tempo (o plano da ElevenLabs limita os pedidos simultâneos). */
const TRECHOS_EM_PARALELO = 2

export type FormatoDoAudio = 'mp3_44100_128' | 'mp3_44100_64' | 'opus_48000_64'

export type Fala = { ok: true; bytes: Buffer } | { ok: false; erro: string; motivo: 'chave' | 'credito' | 'voz' | 'tempo' | 'outro' }

/** A voz pronta para um uso: a chave do cofre, a voz e o modelo. */
export type VozPronta = { chave: string; vozId: string; modelo: ModeloDaVoz }

const limpar = (chave: string, t: string) => t.split(chave).join('[chave]').slice(0, 300)

/** O erro da ElevenLabs em português, pelo status (e pelo `detail.status` do corpo, quando vem). */
function erroDaResposta(status: number, corpo: string, chave: string): Extract<Fala, { ok: false }> {
  let detalhe = ''
  try {
    const d = JSON.parse(corpo) as { detail?: { status?: string; message?: string } | string }
    detalhe = typeof d.detail === 'string' ? d.detail : `${d.detail?.status ?? ''} ${d.detail?.message ?? ''}`
  } catch { detalhe = corpo }
  detalhe = limpar(chave, detalhe.trim())
  if (status === 401) return { ok: false, erro: 'A ElevenLabs recusou a chave. Confira a chave em Configurações › Integrações.', motivo: 'chave' }
  if (status === 402 || /quota|credit|insufficient/i.test(detalhe)) return { ok: false, erro: 'A conta da ElevenLabs está sem créditos para este áudio. Confira o saldo no painel da ElevenLabs.', motivo: 'credito' }
  if (status === 403) return { ok: false, erro: 'A chave da ElevenLabs não tem permissão para isso (ela pode ter sido criada com acesso restrito). Libere "Text to Speech" e "Voices" na chave.', motivo: 'chave' }
  if (status === 404 || /voice_not_found|model_not_found/i.test(detalhe)) return { ok: false, erro: 'A ElevenLabs não achou a voz ou o modelo escolhido. Escolha a voz de novo em Configurações › Voz.', motivo: 'voz' }
  if (status === 429) return { ok: false, erro: 'A ElevenLabs pediu para esperar (muitos pedidos ao mesmo tempo). Tente de novo em instantes.', motivo: 'tempo' }
  return { ok: false, erro: `A ElevenLabs respondeu ${status}${detalhe ? `: ${detalhe}` : ''}.`, motivo: 'outro' }
}

/** Um pedido de voz. `anterior`/`seguinte`: o texto em volta, para a entonação emendar entre trechos. */
export async function falar(v: VozPronta, texto: string, formato: FormatoDoAudio, contexto: { anterior?: string; seguinte?: string } = {}): Promise<Fala> {
  try {
    const resposta = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(v.vozId)}?output_format=${formato}`, {
      method: 'POST',
      headers: { 'xi-api-key': v.chave, 'content-type': 'application/json', accept: formato.startsWith('mp3') ? 'audio/mpeg' : 'audio/ogg' },
      body: JSON.stringify({
        text: texto,
        model_id: v.modelo,
        ...(contexto.anterior ? { previous_text: contexto.anterior.slice(-1000) } : {}),
        ...(contexto.seguinte ? { next_text: contexto.seguinte.slice(0, 1000) } : {}),
      }),
      signal: AbortSignal.timeout(TEMPO_DO_TRECHO_MS),
      cache: 'no-store',
    })
    if (!resposta.ok) return erroDaResposta(resposta.status, await resposta.text().catch(() => ''), v.chave)
    const bytes = Buffer.from(await resposta.arrayBuffer())
    if (!bytes.length) return { ok: false, erro: 'A ElevenLabs devolveu um áudio vazio.', motivo: 'outro' }
    return { ok: true, bytes }
  } catch (causa) {
    const nome = causa instanceof Error ? causa.name : ''
    if (nome === 'TimeoutError' || nome === 'AbortError') return { ok: false, erro: 'A ElevenLabs não respondeu a tempo.', motivo: 'tempo' }
    return { ok: false, erro: limpar(v.chave, `Não consegui falar com a ElevenLabs (${causa instanceof Error ? causa.message : 'erro de rede'}).`), motivo: 'outro' }
  }
}

/**
 * Um texto longo (a matéria) em um MP3 só: dividido em trechos no fim de parágrafo, cada um com o vizinho como
 * contexto, e os pedaços emendados na ordem. MP3 do mesmo formato emenda quadro a quadro: o navegador toca como um
 * arquivo só. Um trecho que falha derruba a narração inteira (meia matéria falada é pior que nenhuma).
 */
export async function narrar(v: VozPronta, texto: string): Promise<Fala> {
  const trechos = dividirEmTrechos(texto)
  if (!trechos.length) return { ok: false, erro: 'Não há texto para narrar.', motivo: 'outro' }
  const partes: Buffer[] = new Array(trechos.length)
  let falha: Extract<Fala, { ok: false }> | null = null
  let proximo = 0
  const trabalhar = async () => {
    while (!falha && proximo < trechos.length) {
      const i = proximo++
      const r = await falar(v, trechos[i], 'mp3_44100_128', { anterior: trechos[i - 1], seguinte: trechos[i + 1] })
      if (!r.ok) { falha ??= r; return }
      partes[i] = r.bytes
    }
  }
  await Promise.all(Array.from({ length: Math.min(TRECHOS_EM_PARALELO, trechos.length) }, trabalhar))
  if (falha) return falha
  return { ok: true, bytes: Buffer.concat(partes) }
}

export type VozDaConta = { id: string; nome: string; categoria: string; descricao: string | null; amostra: string | null; sotaque: string | null; genero: string | null }

/** As vozes da conta (as prontas da ElevenLabs e as criadas ou salvas por vocês), até 300. */
export async function listarVozes(chave: string): Promise<{ ok: true; vozes: VozDaConta[] } | { ok: false; erro: string }> {
  try {
    const vozes: VozDaConta[] = []
    let pagina: string | null = null
    for (let i = 0; i < 3; i++) {
      const url = new URL(`${API}/v2/voices`)
      url.searchParams.set('page_size', '100')
      if (pagina) url.searchParams.set('next_page_token', pagina)
      const resposta = await fetch(url, { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(TEMPO_DA_LISTA_MS), cache: 'no-store' })
      if (!resposta.ok) return { ok: false, erro: erroDaResposta(resposta.status, await resposta.text().catch(() => ''), chave).erro }
      const dados = await resposta.json() as { voices?: unknown[]; has_more?: boolean; next_page_token?: string | null }
      for (const bruto of dados.voices ?? []) {
        const v = bruto as { voice_id?: unknown; name?: unknown; category?: unknown; description?: unknown; preview_url?: unknown; labels?: Record<string, unknown> | null }
        if (typeof v.voice_id !== 'string' || !/^[A-Za-z0-9]{8,40}$/.test(v.voice_id)) continue
        const rotulo = (k: string) => (typeof v.labels?.[k] === 'string' ? String(v.labels[k]) : null)
        vozes.push({
          id: v.voice_id,
          nome: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 120) : v.voice_id,
          categoria: typeof v.category === 'string' ? v.category : '',
          descricao: typeof v.description === 'string' && v.description.trim() ? v.description.trim().slice(0, 200) : null,
          // A amostra pronta da ElevenLabs: tocar não custa crédito. Só endereço https.
          amostra: typeof v.preview_url === 'string' && /^https:\/\//.test(v.preview_url) ? v.preview_url : null,
          sotaque: rotulo('accent'),
          genero: rotulo('gender'),
        })
      }
      if (!dados.has_more || !dados.next_page_token) break
      pagina = dados.next_page_token
    }
    return { ok: true, vozes }
  } catch (causa) {
    const nome = causa instanceof Error ? causa.name : ''
    return { ok: false, erro: nome === 'TimeoutError' ? 'A ElevenLabs não respondeu a tempo.' : limpar(chave, `Não consegui falar com a ElevenLabs (${causa instanceof Error ? causa.message : 'erro de rede'}).`) }
  }
}

/** Testa a chave antes de ir ao cofre: `definitivo` só quando a ElevenLabs recusou a chave (401). */
export async function testarChaveDaElevenlabs(chave: string): Promise<{ ok: true; vozes: number } | { erro: string; definitivo: boolean }> {
  try {
    const resposta = await fetch(`${API}/v2/voices?page_size=1`, { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(TEMPO_DA_LISTA_MS), cache: 'no-store' })
    if (resposta.status === 401) return { erro: 'A ElevenLabs recusou a chave. Copie de novo em elevenlabs.io → Developers → API keys.', definitivo: true }
    if (!resposta.ok) return { erro: erroDaResposta(resposta.status, await resposta.text().catch(() => ''), chave).erro, definitivo: false }
    const dados = await resposta.json().catch(() => ({})) as { total_count?: number }
    return { ok: true, vozes: typeof dados.total_count === 'number' ? dados.total_count : 0 }
  } catch {
    return { erro: 'Não consegui falar com a ElevenLabs para testar a chave agora.', definitivo: false }
  }
}

/** A tabela ainda não existe (a migração da voz não foi aplicada). */
export const semTabelaDaVoz = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205'

/** A configuração do espaço. null: sem linha ainda; `indisponivel`: sem a tabela (falta a migração). */
export async function configDaVoz(admin: Admin, workspaceId: string): Promise<ConfigDaVoz | null | 'indisponivel'> {
  const { data, error } = await admin.from('voz_config').select('voz_id, voz_nome, modelo, materias, whatsapp').eq('workspace_id', workspaceId).maybeSingle()
  if (error) return semTabelaDaVoz(error) ? 'indisponivel' : null
  if (!data) return null
  return {
    vozId: (data.voz_id as string | null) ?? null,
    vozNome: (data.voz_nome as string | null) ?? null,
    modelo: ehModeloDaVoz(data.modelo) ? data.modelo : MODELO_PADRAO,
    materias: data.materias === true,
    whatsapp: data.whatsapp === true,
  }
}

/** A chave da ElevenLabs (cofre, depois a variável ELEVENLABS_API_KEY). Quem chama conferiu que a pessoa é do espaço. */
export const chaveDaElevenlabs = (workspaceId: string) => obterChave(workspaceId, 'elevenlabs')

/** A voz ligada para um uso: a chave, a voz e o modelo; null se o uso está desligado ou falta algo. Nunca lança. */
export async function vozPara(workspaceId: string, uso: 'materias' | 'whatsapp'): Promise<VozPronta | null> {
  try {
    const config = await configDaVoz(createAdminClient(), workspaceId)
    if (!config || config === 'indisponivel' || !config[uso] || !config.vozId) return null
    const chave = await chaveDaElevenlabs(workspaceId)
    return chave ? { chave, vozId: config.vozId, modelo: config.modelo } : null
  } catch {
    return null
  }
}
