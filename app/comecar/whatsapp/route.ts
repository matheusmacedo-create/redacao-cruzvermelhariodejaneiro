import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { espacoPrincipal } from '@/lib/envios/servidor'
import { configDoWhatsapp, perfilConectado } from '@/lib/whatsapp/servidor'
import { linkDoBot } from '@/lib/whatsapp/autocadastro-regras'

/**
 * "Pedir pelo WhatsApp", no guia para começar (/comecar, docs/AJUDA.md §16): leva à conversa com o WhatsApp do
 * Palácio, com a frase do autocadastro pronta ("quero me cadastrar"). É o mesmo link do cartaz e do grupo
 * (linkDoBot), feito para circular; o número é lido da conexão na hora do toque, e não a cada visita ao guia, e fica
 * guardado alguns minutos nesta instância. Endereço fixo de propósito: é ele que vai no QR da versão impressa.
 *
 * Sem o WhatsApp ligado, volta ao guia, que mostra o que fazer (falar com a coordenação).
 */

const GUARDA_MS = 10 * 60_000
let guardado: { link: string; ate: number } | null = null

export async function GET(request: Request) {
  if (guardado && guardado.ate > Date.now()) return NextResponse.redirect(guardado.link, 307)
  try {
    const admin = createAdminClient()
    const espaco = await espacoPrincipal(admin)
    const config = espaco ? await configDoWhatsapp(espaco) : null
    const numero = config ? (await perfilConectado(config)).numero : null
    if (numero) {
      guardado = { link: linkDoBot(numero), ate: Date.now() + GUARDA_MS }
      return NextResponse.redirect(guardado.link, 307)
    }
  } catch (causa) {
    console.error('[comecar] link do WhatsApp:', causa instanceof Error ? causa.message : 'erro desconhecido')
  }
  return NextResponse.redirect(new URL('/comecar?whatsapp=fora#email', request.url), 307)
}
