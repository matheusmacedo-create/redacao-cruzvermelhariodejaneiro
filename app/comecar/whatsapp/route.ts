import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { espacoPrincipal } from '@/lib/envios/servidor'
import { configDoWhatsapp, perfilConectado } from '@/lib/whatsapp/servidor'
import { linkDoBot } from '@/lib/whatsapp/autocadastro-regras'
import { setorPeloSlug } from '@/lib/ajuda/comecar'

/**
 * "Pedir pelo WhatsApp", no guia para começar (/comecar, docs/AJUDA.md §16): leva à conversa com o WhatsApp do
 * Palácio, com a frase do autocadastro pronta ("quero me cadastrar"). É o mesmo link do cartaz e do grupo
 * (linkDoBot), feito para circular; o número é lido da conexão na hora do toque, e não a cada visita ao guia, e fica
 * guardado alguns minutos nesta instância. Endereço fixo de propósito: é ele que vai no QR da versão impressa.
 *
 * Com `?setor=juridico`, a frase leva o setor ("quero me cadastrar em Jurídico"): o robô já começa o cadastro nele
 * (setorDaEntrada). Setor que o robô não conhece só faz a pergunta do setor aparecer, como sem ele.
 *
 * Sem o WhatsApp ligado, volta ao guia, que mostra o que fazer (falar com a coordenação).
 */

const GUARDA_MS = 10 * 60_000
let guardado: { numero: string; ate: number } | null = null

async function numeroDoRobo(): Promise<string | null> {
  if (guardado && guardado.ate > Date.now()) return guardado.numero
  const admin = createAdminClient()
  const espaco = await espacoPrincipal(admin)
  const config = espaco ? await configDoWhatsapp(espaco) : null
  const numero = config ? (await perfilConectado(config)).numero : null
  if (numero) guardado = { numero, ate: Date.now() + GUARDA_MS }
  return numero
}

export async function GET(request: Request) {
  const setor = setorPeloSlug(new URL(request.url).searchParams.get('setor'))
  try {
    const numero = await numeroDoRobo()
    if (numero) return NextResponse.redirect(linkDoBot(numero, setor?.nome), 307)
  } catch (causa) {
    console.error('[comecar] link do WhatsApp:', causa instanceof Error ? causa.message : 'erro desconhecido')
  }
  return NextResponse.redirect(new URL(`/comecar?whatsapp=fora${setor ? `&setor=${setor.slug}` : ''}#email`, request.url), 307)
}
