import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assinaturaConfere, interpretarEvento } from '@/lib/imprensa/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Recebe do Resend o que aconteceu com cada mensagem depois de sair: entregue,
 * devolvida, denunciada como spam, barrada pela lista de supressão — e as
 * mudanças na própria lista de supressão da conta.
 *
 * Sem isto o Palácio só sabe que o Resend ACEITOU a mensagem. Endereço que não
 * existe mais continuava "enviado" e válido na tela, e entrava na campanha
 * seguinte. Com o webhook, a devolução definitiva marca o contato como
 * inválido, a denúncia tira da lista, e os dois entram em email_supressoes
 * (migração 20261109120000). Quais eventos viram o quê: lib/imprensa/webhook.ts.
 *
 * Segurança: rota pública, então nada é gravado sem assinatura válida (padrão
 * Svix, segredo em RESEND_WEBHOOK_SECRET — só o nome; o valor mora na Vercel).
 * Sem a variável, a rota responde 503 e o Resend tenta de novo mais tarde.
 *
 * Como ligar: painel do Resend → Webhooks → endereço desta rota, com os
 * eventos email.delivered, email.bounced, email.complained, email.suppressed,
 * email.failed, suppression.added e suppression.removed. O segredo de
 * assinatura que o Resend mostra vai para RESEND_WEBHOOK_SECRET na Vercel.
 */
export async function POST(req: Request) {
  const bruto = await req.text()
  const segredo = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!segredo) {
    return NextResponse.json({ ok: false, mensagem: 'Falta a variável RESEND_WEBHOOK_SECRET.' }, { status: 503 })
  }
  const confere = assinaturaConfere(segredo, {
    id: req.headers.get('svix-id') ?? '',
    timestamp: req.headers.get('svix-timestamp') ?? '',
    assinatura: req.headers.get('svix-signature') ?? '',
  }, bruto)
  if (!confere) return new NextResponse(null, { status: 401 })

  let corpo: unknown
  try { corpo = JSON.parse(bruto) } catch { return new NextResponse(null, { status: 400 }) }

  // Evento que não nos interessa (aberto, clicado, atraso, devolução
  // temporária) é aceito e ignorado: recusar faria o Resend insistir.
  const evento = interpretarEvento(corpo)
  if (!evento) return NextResponse.json({ ok: true, gravado: false })

  const { data, error } = await createAdminClient().rpc('registrar_evento_de_email', {
    p_resend_id: evento.resendId,
    p_email: evento.email,
    p_tipo: evento.tipo,
    p_detalhe: evento.detalhe,
  })
  // 500 faz o Resend repetir a entrega: a função é idempotente.
  if (error) return NextResponse.json({ ok: false }, { status: 500 })
  return NextResponse.json({ ok: true, gravado: data !== 'desconhecido', onde: data })
}
