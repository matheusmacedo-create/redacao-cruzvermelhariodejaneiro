import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { configDoWhatsapp } from '@/lib/whatsapp/servidor'
import { assinaturaConfere, CABECALHO_DA_ASSINATURA } from '@/lib/whatsapp/kapso'
import { lerEventoDaKapso } from '@/lib/whatsapp/regras'
import { atenderMensagem } from '@/lib/whatsapp/bot'
import { concluirEsquecidos } from '@/lib/whatsapp/envio'
import { processarFila } from '@/lib/whatsapp/fila'
import { redigirVencidos } from '@/lib/whatsapp/assistente/faxina'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Recebe da Kapso o que chega ao WhatsApp do Palácio e passa ao bot
 * (lib/whatsapp/bot.ts).
 *
 * Segurança: cada entrega vem assinada (HMAC-SHA256 do corpo cru com a senha
 * que a tela de conexão deu ao criar o webhook, derivada da chave do cofre).
 * Sem a assinatura certa, 401 — esta é uma rota pública, e sem a conferência
 * qualquer um faria o bot responder ou marcar avisos como lidos em nome de
 * alguém.
 *
 * A Kapso tenta de novo duas vezes se não receber 200 em 10 s. Por isso o
 * trabalho em si responde 200 na hora e segue depois da resposta (after) — o
 * registro com trava por id impede resposta dupla se, mesmo assim, a entrega
 * vier de novo.
 *
 * O lote inteiro tem PRAZO_DO_LOTE_MS (o maxDuration é 300 s): cada turno do
 * assistente termina 20 s antes disso, no máximo, e com menos de 15 s nem
 * começa (sai o texto fixo). No fim, a faxina do assistente redige os planos
 * vencidos (o texto das ações não espera a rotina do dia).
 */

const PRAZO_DO_LOTE_MS = 240_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get('w') ?? ''
  if (!UUID.test(workspaceId)) return new NextResponse(null, { status: 404 })

  const config = await configDoWhatsapp(workspaceId)
  if (!config) return new NextResponse(null, { status: 404 })

  const cru = await req.text()
  if (!assinaturaConfere(config, workspaceId, cru, req.headers.get(CABECALHO_DA_ASSINATURA))) return new NextResponse(null, { status: 401 })
  let corpo: unknown
  try { corpo = JSON.parse(cru) } catch { return new NextResponse(null, { status: 400 }) }

  const evento = lerEventoDaKapso(corpo, req.headers.get('x-webhook-event'), config.numeroId)
  if (!evento.mensagens.length) return NextResponse.json({ ok: true, ignorado: evento.evento || 'sem evento' })

  const admin = createAdminClient()
  const prazoDoLote = Date.now() + PRAZO_DO_LOTE_MS
  after(async () => {
    for (const mensagem of evento.mensagens.slice(0, 20)) await atenderMensagem(admin, workspaceId, config, mensagem, { prazoDoLote })
    // Envio de fotos que ficou aberto mais de 30 min sem resposta: fecha agora, não só na rotina do dia.
    await concluirEsquecidos(admin)
    // Os planos e as perguntas do assistente que venceram: o texto das ações some agora (no máximo 50 por vez).
    await redigirVencidos(admin, { limite: 50 })
    // E a fila anda um pouco (uma lista grande de oportunidades não espera a rotina do dia).
    await processarFila(admin, workspaceId, { orcamentoMs: 60_000, limite: 12 })
  })
  return NextResponse.json({ ok: true })
}
