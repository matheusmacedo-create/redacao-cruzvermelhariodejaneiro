import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CABECALHO_DO_WEBHOOK, configDoWhatsapp, segredoConfere } from '@/lib/whatsapp/servidor'
import { estadoDaEvolution, lerEventoDoWebhook } from '@/lib/whatsapp/regras'
import { atenderMensagem } from '@/lib/whatsapp/bot'
import { registrarEstado } from '@/lib/whatsapp/estado'
import { processarFila } from '@/lib/whatsapp/fila'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Ao reconectar, a fila acumulada sai daqui (depois da resposta), com o ritmo da fila.
export const maxDuration = 300

/**
 * Recebe da Evolution API o que chega ao WhatsApp do Palácio e passa ao bot
 * (lib/whatsapp/bot.ts).
 *
 * Segurança: a Evolution não assina as entregas. Por isso o webhook é ligado
 * pela tela de conexão (/configuracoes/whatsapp) com um cabeçalho próprio
 * (CABECALHO_DO_WEBHOOK), cujo valor é derivado da chave do cofre. Sem ele,
 * 401 — esta é uma rota pública, e sem a conferência qualquer um faria o bot
 * responder ou marcar avisos como lidos em nome de alguém.
 *
 * Códigos de resposta: a Evolution tenta de novo até 10 vezes, MENOS em
 * 400/401/403/404/422. Por isso configuração ausente e senha errada dão 4xx
 * (não adianta insistir), e o trabalho em si responde 200 na hora e segue
 * depois da resposta (after) — o registro com trava por id impede resposta
 * dupla se, mesmo assim, a entrega vier de novo.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get('w') ?? ''
  if (!UUID.test(workspaceId)) return new NextResponse(null, { status: 404 })

  const config = await configDoWhatsapp(workspaceId)
  if (!config) return new NextResponse(null, { status: 404 })
  if (!segredoConfere(config, workspaceId, req.headers.get(CABECALHO_DO_WEBHOOK))) return new NextResponse(null, { status: 401 })

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const evento = lerEventoDoWebhook(corpo)
  // Outra instância no mesmo servidor com este endereço por engano: não é conosco.
  if (evento.instancia && evento.instancia !== config.instancia) return NextResponse.json({ ok: true, ignorado: 'outra instância' })

  if (evento.evento === 'connection.update') {
    console.info('[whatsapp] conexão:', evento.estado)
    const estado = estadoDaEvolution(evento.estado)
    // "connecting" é passagem (QR na tela, reconexão): nem alerta nem fila.
    if (estado !== 'conectando') {
      const admin = createAdminClient()
      after(async () => {
        await registrarEstado(admin, workspaceId, estado)
        if (estado === 'conectado') await processarFila(admin, workspaceId, { orcamentoMs: 270_000 })
      })
    }
    return NextResponse.json({ ok: true })
  }
  if (evento.evento !== 'messages.upsert' || !evento.mensagens.length) return NextResponse.json({ ok: true, ignorado: evento.evento || 'sem evento' })

  const admin = createAdminClient()
  after(async () => {
    for (const mensagem of evento.mensagens.slice(0, 20)) await atenderMensagem(admin, workspaceId, config, mensagem)
  })
  return NextResponse.json({ ok: true })
}
