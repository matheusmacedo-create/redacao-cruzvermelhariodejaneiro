import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { semSegredo, UploadPostConfigError } from '@/lib/publicacao/upload-post'
import { garantirWebhookRegistrado, lerConfiguracao, segredoDoWebhook, urlDoWebhook } from '@/lib/publicacao/webhook-do-conector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Confere (e força, com ?ativar=1) o webhook do Upload-Post — o aviso em
 * tempo real que faz o hub saber do resultado de cada post sem ninguém abrir
 * a tela.
 *
 * Não há mais passo manual: o registro acontece sozinho na primeira
 * publicação, e o verificador da assinatura é lido da própria API do
 * conector. Esta rota existe para DIAGNOSTICAR — dizer se está tudo de pé —
 * e para forçar o registro sem esperar uma publicação. O segredo em si nunca
 * aparece na resposta, porque ninguém mais precisa copiá-lo.
 */
export async function GET(req: Request) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  const ativar = new URL(req.url).searchParams.get('ativar') === '1'
  const destino = urlDoWebhook()

  try {
    if (ativar) await garantirWebhookRegistrado()

    const config = await lerConfiguracao()
    const urlConfigurada = config.webhook_url ?? null
    const apontaParaCa = urlConfigurada === destino && Boolean(config.channels?.webhook)
    const verificadorDisponivel = Boolean(await segredoDoWebhook())

    return NextResponse.json({
      ok: apontaParaCa && verificadorDisponivel,
      urlEsperada: destino,
      urlConfigurada,
      canalWebhookLigado: Boolean(config.channels?.webhook),
      verificadorDisponivel,
      proximoPasso: !apontaParaCa
        ? 'Chame esta rota com ?ativar=1 (ou publique qualquer pacote — o registro acontece sozinho).'
        : !verificadorDisponivel
          ? 'A URL está registrada, mas o conector não devolveu o segredo de assinatura. Confira UPLOAD_POST_API_KEY.'
          : 'Webhook ativo: o resultado de cada post chega sozinho ao hub.',
    })
  } catch (causa) {
    if (causa instanceof UploadPostConfigError) {
      return NextResponse.json({ ok: false, mensagem: causa.message }, { status: 503 })
    }
    return NextResponse.json({
      ok: false,
      mensagem: semSegredo(causa instanceof Error ? causa.message : String(causa)).slice(0, 300),
    }, { status: 502 })
  }
}
