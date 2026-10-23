import 'server-only'
import { narrar, type VozPronta } from './elevenlabs'
import { TETO_DA_MATERIA, textoParaNarrar } from './regras'
import { nomeDoAudio } from './nome-do-audio'

/**
 * A narração de uma matéria no site (ARQUITETURA §8.7): o MP3 que vai para a pasta dela e o nome que a página toca.
 *
 * O nome do arquivo nasce do texto, da voz e do modelo (nomeDoAudio): se o arquivo com esse nome já responde no site,
 * a narração é a mesma e não se gasta crédito de novo. Senão, com `gerar`, a ElevenLabs narra; sem `gerar` (a
 * regeração de todas as páginas, que não pode sair gastando crédito em lote nem estourar o tempo da rodada), a
 * página sai sem o áudio até a matéria ser republicada.
 */

export type PedidoDeNarracao = { voz: VozPronta; gerar: boolean }

export type Narracao = {
  /** O que a página toca. */
  audio?: { nome: string }
  /** O arquivo novo para subir (só quando foi gerado agora). */
  arquivo?: { nome: string; bytes: Buffer }
  /** Por que a página ficou sem a narração, para o aviso de quem publicou. */
  aviso?: string
}

const TEMPO_DA_CONFERENCIA_MS = 8_000

/** O MP3 já está no ar? Pergunta ao site (HEAD); na dúvida, não. */
async function jaNoAr(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TEMPO_DA_CONFERENCIA_MS) })
    return r.ok && /audio\/|octet-stream/i.test(r.headers.get('content-type') ?? 'audio/mpeg')
  } catch {
    return false
  }
}

export async function narracaoDaMateria(p: PedidoDeNarracao & {
  peca: { title: string; subtitle: string | null; body: string | null }
  base: string
  slug: string
}): Promise<Narracao> {
  try {
    const texto = textoParaNarrar({ titulo: p.peca.title, subtitulo: p.peca.subtitle, corpo: p.peca.body })
    if (!texto.trim()) return {}
    const nome = nomeDoAudio(texto, p.voz.vozId, p.voz.modelo)
    if (await jaNoAr(`${p.base}/${p.slug}/${nome}`)) return { audio: { nome } }
    if (!p.gerar) return {}
    if (texto.length > TETO_DA_MATERIA) {
      return { aviso: `a narração em áudio (a matéria tem ${texto.length.toLocaleString('pt-BR')} caracteres; o limite da narração é ${TETO_DA_MATERIA.toLocaleString('pt-BR')})` }
    }
    const fala = await narrar(p.voz, texto)
    if (!fala.ok) return { aviso: `a narração em áudio (${fala.erro.replace(/\.$/, '')})` }
    return { audio: { nome }, arquivo: { nome, bytes: fala.bytes } }
  } catch (causa) {
    console.warn('[voz] narração da matéria falhou:', causa instanceof Error ? causa.message : causa)
    return { aviso: 'a narração em áudio (erro inesperado)' }
  }
}
