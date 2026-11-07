import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MODELO_PADRAO } from '../../lib/voz/regras'

/**
 * A voz dos vídeos: a ElevenLabs, com a voz da filial ("Sarah", a mesma das matérias e da ajuda) e o modelo de
 * narração. Pede o áudio com o tempo de cada letra (/with-timestamps), que dá a legenda no ponto certo. Cada fala
 * fica guardada em .videos/voz: regravar um vídeo sem mudar o texto não gasta crédito de novo.
 *
 * A chave: ELEVENLABS_API_KEY. No ambiente de nuvem do Claude Code, o proxy põe a chave no cabeçalho sozinho.
 */

const API = 'https://api.elevenlabs.io'
/** "Sarah": a voz escolhida em Configurações › Voz da Produção. VOZ_ID troca. */
export const VOZ_PADRAO = 'EXAVITQu4vr4xnSDxMaL'

type Alinhamento = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }

export type Fala = {
  texto: string
  /** O MP3 da fala. */
  arquivo: string
  /** Em segundos. */
  duracao: number
  /** Início e fim de cada letra do texto, em segundos (null se a ElevenLabs não mandou o alinhamento). */
  letras: { inicio: number[]; fim: number[] } | null
}

export function duracaoDoAudio(arquivo: string): number {
  const saida = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo]).toString().trim()
  const segundos = Number(saida)
  if (!Number.isFinite(segundos) || segundos <= 0) throw new Error(`Não consegui medir o áudio ${arquivo}.`)
  return segundos
}

export async function falar(texto: string, pasta: string, contexto: { anterior?: string; seguinte?: string } = {}): Promise<Fala> {
  const voz = process.env.VOZ_ID || VOZ_PADRAO
  const chave = createHash('sha256').update([voz, MODELO_PADRAO, texto, contexto.anterior ?? '', contexto.seguinte ?? ''].join('\u0000')).digest('hex').slice(0, 20)
  mkdirSync(pasta, { recursive: true })
  const mp3 = path.join(pasta, `${chave}.mp3`)
  const json = path.join(pasta, `${chave}.json`)
  if (!existsSync(mp3) || !existsSync(json)) {
    const resposta = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voz)}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || 'posta-pelo-proxy', 'content-type': 'application/json' },
      body: JSON.stringify({
        text: texto,
        model_id: MODELO_PADRAO,
        ...(contexto.anterior ? { previous_text: contexto.anterior.slice(-1000) } : {}),
        ...(contexto.seguinte ? { next_text: contexto.seguinte.slice(0, 1000) } : {}),
      }),
    })
    if (!resposta.ok) throw new Error(`A ElevenLabs respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
    const dados = (await resposta.json()) as { audio_base64?: string; alignment?: Alinhamento | null }
    if (!dados.audio_base64) throw new Error('A ElevenLabs não devolveu o áudio.')
    writeFileSync(mp3, Buffer.from(dados.audio_base64, 'base64'))
    writeFileSync(json, JSON.stringify({ texto, alinhamento: dados.alignment ?? null }))
  }
  const guardado = JSON.parse(readFileSync(json, 'utf8')) as { alinhamento: Alinhamento | null }
  const a = guardado.alinhamento
  // O alinhamento vale letra a letra só se cobre o texto inteiro; senão, a legenda reparte o tempo pelo tamanho.
  const letras = a && a.characters.length === texto.length
    ? { inicio: a.character_start_times_seconds, fim: a.character_end_times_seconds }
    : null
  return { texto, arquivo: mp3, duracao: duracaoDoAudio(mp3), letras }
}
