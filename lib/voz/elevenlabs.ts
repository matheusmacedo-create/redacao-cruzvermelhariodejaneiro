import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { MODELO_PADRAO, dividirEmTrechos, ehModeloDaVoz, type ConfigDaVoz, type ModeloDaVoz } from './regras'

/**
 * A ElevenLabs (texto em voz). As regras de sempre das integrações: nunca lança, a chave não sai daqui (nem no erro),
 * e quem chama já conferiu que a pessoa é do espaço.
 *
 * Contrato conferido em elevenlabs.io/docs (outubro de 2026):
 *  - POST /v1/text-to-speech/{voice_id}/stream?output_format=… com o cabeçalho xi-api-key; corpo { text, model_id,
 *    previous_text, next_text }; a resposta é o áudio, chegando aos pedaços enquanto é gerado;
 *  - output_format: mp3_44100_128 (a matéria), mp3_44100_64 e opus_48000_64 (o WhatsApp);
 *  - GET /v2/voices?page_size=100 lista as vozes da conta (voice_id, name, category, labels, preview_url);
 *  - eleven_v4 aceita até 10.000 caracteres por pedido; os trechos daqui têm até 2.000 (TAMANHO_DO_TRECHO).
 */

type Admin = ReturnType<typeof createAdminClient>

const API = 'https://api.elevenlabs.io'
const TEMPO_DA_LISTA_MS = 15_000
/**
 * Quanto se espera SEM chegar nenhum byte do áudio. O pedido vai pelo endpoint de streaming: o áudio chega aos
 * pedaços enquanto é gerado, então o que importa é a ElevenLabs continuar mandando, não o tempo total. Com o tempo
 * total fixo (60 s, na primeira versão), um trecho de 4.300 caracteres no eleven_v4 estourou no meio da geração.
 */
const SILENCIO_MAXIMO_MS = 30_000
/** Trechos de uma matéria ao mesmo tempo (o plano da ElevenLabs limita os pedidos simultâneos; 429 tenta de novo). */
const TRECHOS_EM_PARALELO = 3
/**
 * O prazo da narração inteira de uma matéria. A publicação roda numa função de até 300 s (maxDuration da página do
 * hub) e ainda precisa das fotos e do FTP depois: passou disso, a matéria sai sem o áudio, com o aviso.
 */
export const PRAZO_DA_NARRACAO_MS = 150_000

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

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms))

/**
 * Um pedido de voz, pelo streaming. `anterior`/`seguinte`: o texto em volta, para a entonação emendar entre trechos.
 * `prazo` (ms desde a época): a hora em que se desiste de qualquer jeito. Desiste também depois de SILENCIO_MAXIMO_MS
 * sem chegar nada.
 */
export async function falar(v: VozPronta, texto: string, formato: FormatoDoAudio, contexto: { anterior?: string; seguinte?: string; prazo?: number } = {}): Promise<Fala> {
  const controle = new AbortController()
  let motivoDoCorte: 'silencio' | 'prazo' | null = null
  let silencio: ReturnType<typeof setTimeout> | undefined
  let leitor: ReadableStreamDefaultReader<Uint8Array> | null = null
  // Corta o pedido E a leitura: o abort sozinho pode não soltar um read() que já está esperando.
  const cortar = (motivo: 'silencio' | 'prazo') => { motivoDoCorte = motivo; controle.abort(); leitor?.cancel().catch(() => undefined) }
  const rearmar = () => {
    clearTimeout(silencio)
    silencio = setTimeout(() => cortar('silencio'), SILENCIO_MAXIMO_MS)
  }
  const restante = contexto.prazo ? contexto.prazo - Date.now() : Number.POSITIVE_INFINITY
  if (restante <= 0) return { ok: false, erro: 'A narração passou do tempo da publicação.', motivo: 'tempo' }
  const teto = Number.isFinite(restante) ? setTimeout(() => cortar('prazo'), restante) : undefined
  try {
    rearmar()
    const resposta = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(v.vozId)}/stream?output_format=${formato}`, {
      method: 'POST',
      headers: { 'xi-api-key': v.chave, 'content-type': 'application/json', accept: formato.startsWith('mp3') ? 'audio/mpeg' : 'audio/ogg' },
      body: JSON.stringify({
        text: texto,
        model_id: v.modelo,
        ...(contexto.anterior ? { previous_text: contexto.anterior.slice(-1000) } : {}),
        ...(contexto.seguinte ? { next_text: contexto.seguinte.slice(0, 1000) } : {}),
      }),
      signal: controle.signal,
      cache: 'no-store',
    })
    if (!resposta.ok) return erroDaResposta(resposta.status, await resposta.text().catch(() => ''), v.chave)
    if (!resposta.body) return { ok: false, erro: 'A ElevenLabs devolveu um áudio vazio.', motivo: 'outro' }
    const pedacos: Uint8Array[] = []
    leitor = resposta.body.getReader()
    for (;;) {
      rearmar()
      const { done, value } = await leitor.read()
      if (done) break
      if (value?.length) pedacos.push(value)
    }
    // Leitura cancelada termina como "done": o que chegou até ali é meio áudio, e meio áudio é falha.
    if (motivoDoCorte) throw new DOMException('cortado', 'AbortError')
    const bytes = Buffer.concat(pedacos)
    if (!bytes.length) return { ok: false, erro: 'A ElevenLabs devolveu um áudio vazio.', motivo: 'outro' }
    return { ok: true, bytes }
  } catch (causa) {
    const nome = causa instanceof Error ? causa.name : ''
    if (motivoDoCorte === 'prazo') return { ok: false, erro: 'A narração passou do tempo da publicação.', motivo: 'tempo' }
    if (motivoDoCorte === 'silencio' || nome === 'TimeoutError' || nome === 'AbortError') {
      return { ok: false, erro: `A ElevenLabs parou de mandar o áudio por mais de ${SILENCIO_MAXIMO_MS / 1000} s.`, motivo: 'tempo' }
    }
    return { ok: false, erro: limpar(v.chave, `Não consegui falar com a ElevenLabs (${causa instanceof Error ? causa.message : 'erro de rede'}).`), motivo: 'outro' }
  } finally {
    clearTimeout(silencio)
    clearTimeout(teto)
  }
}

/**
 * Um texto longo (a matéria) em um MP3 só: dividido em trechos no fim de parágrafo, cada um com o vizinho como
 * contexto, três por vez, e os pedaços emendados na ordem. MP3 do mesmo formato emenda quadro a quadro: o navegador
 * toca como um arquivo só. O trecho recusado por excesso de pedidos (429) ou que parou no meio tenta mais uma vez,
 * se ainda houver prazo. Um trecho que falha derruba a narração inteira (meia matéria falada é pior que nenhuma).
 */
export async function narrar(v: VozPronta, texto: string, prazo = Date.now() + PRAZO_DA_NARRACAO_MS): Promise<Fala> {
  const trechos = dividirEmTrechos(texto)
  if (!trechos.length) return { ok: false, erro: 'Não há texto para narrar.', motivo: 'outro' }
  const partes: Buffer[] = new Array(trechos.length)
  const estado: { falha: Extract<Fala, { ok: false }> | null } = { falha: null }
  let proximo = 0
  const trabalhar = async () => {
    while (!estado.falha && proximo < trechos.length) {
      const i = proximo++
      const contexto = { anterior: trechos[i - 1], seguinte: trechos[i + 1], prazo }
      let r = await falar(v, trechos[i], 'mp3_44100_128', contexto)
      if (!r.ok && r.motivo === 'tempo' && !estado.falha && prazo - Date.now() > 20_000) {
        await esperar(1500)
        r = await falar(v, trechos[i], 'mp3_44100_128', contexto)
      }
      if (!r.ok) { estado.falha ??= r; return }
      partes[i] = r.bytes
    }
  }
  await Promise.all(Array.from({ length: Math.min(TRECHOS_EM_PARALELO, trechos.length) }, trabalhar))
  if (estado.falha) return estado.falha
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
