import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarAudio, registrar, subirAudio, type ConfigDoWhatsapp } from '@/lib/whatsapp/servidor'
import { falar, vozPara } from './elevenlabs'
import { ehMp3, ehOgg, textoParaFalarNoWhatsapp } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A resposta do assistente também em áudio (ARQUITETURA §8.7), para quem falou com ele por áudio: quem escolhe falar
 * costuma preferir ouvir (está dirigindo, enxerga mal, lê com dificuldade).
 *
 * Sempre DEPOIS do texto, que já saiu e vale sozinho: o áudio é a mesma resposta, sem os links (textoParaFalarNoWhatsapp).
 * Só com a voz ligada para o WhatsApp em Configurações › Voz. Plano, pergunta, recibo, link de confirmação e texto fixo
 * nunca viram áudio — quem chama só passa a resposta comum do modelo. Nunca lança e nunca espera na fila: o áudio que
 * não sai agora não sai mais (a pessoa já tem o texto).
 *
 * Mensagem de voz (a bolinha com play) só com OGG Opus: a ElevenLabs manda Opus, e o arquivo é conferido pelos
 * primeiros bytes (OggS). Se não vier em Ogg, vai em MP3, como arquivo de áudio.
 */

/** O áudio leva uns 2 a 5 s para ficar pronto e mais 1 a 3 s para subir e sair: sem esse tempo no turno, não começa. */
export const TEMPO_MINIMO_DO_AUDIO_MS = 12_000

export async function responderEmAudio(p: {
  admin: Admin
  workspaceId: string
  config: ConfigDoWhatsapp | null
  numero: string
  userId: string | null
  /** A resposta, como saiu por escrito (já pós-processada). */
  texto: string
  /** A hora-limite do turno (ms). */
  prazo: number
}): Promise<boolean> {
  try {
    if (!p.config || p.prazo - Date.now() < TEMPO_MINIMO_DO_AUDIO_MS) return false
    const falavel = textoParaFalarNoWhatsapp(p.texto)
    if (!falavel) return false
    const voz = await vozPara(p.workspaceId, 'whatsapp')
    if (!voz) return false

    let fala = await falar(voz, falavel, 'opus_48000_64')
    let mime: 'audio/ogg' | 'audio/mpeg' = 'audio/ogg'
    if (fala.ok && !ehOgg(fala.bytes)) {
      fala = await falar(voz, falavel, 'mp3_44100_64')
      mime = 'audio/mpeg'
      if (fala.ok && !ehMp3(fala.bytes)) fala = { ok: false, erro: 'A ElevenLabs devolveu um formato de áudio desconhecido.', motivo: 'outro' }
    }
    if (!fala.ok) {
      console.warn('[voz] áudio do WhatsApp não gerado:', fala.motivo)
      return false
    }
    const midia = await subirAudio(p.config, fala.bytes, mime)
    const envio = midia.ok ? await enviarAudio(p.config, p.numero, midia.id, mime === 'audio/ogg') : { ok: false as const, erro: midia.erro }
    // O registro de sempre: o número e o resultado, nunca o texto. "voz" marca a saída em áudio.
    await registrar(p.admin, {
      workspaceId: p.workspaceId, direcao: 'saida', tipo: 'bot', situacao: envio.ok ? 'enviada' : 'falhou', numero: p.numero, userId: p.userId,
      mensagemId: envio.ok ? envio.id : null, comando: 'voz', erro: envio.ok ? null : envio.erro,
    })
    return envio.ok
  } catch (causa) {
    console.error('[voz] áudio do WhatsApp falhou:', causa instanceof Error ? causa.name : 'erro')
    return false
  }
}
