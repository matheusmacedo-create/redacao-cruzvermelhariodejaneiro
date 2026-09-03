import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { apiKey, semSegredo, UploadPostConfigError } from '@/lib/publicacao/upload-post'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Ativa e confere o webhook do Upload-Post — o aviso em tempo real que faz o
 * hub saber do resultado de cada post sem ninguém abrir a tela.
 *
 * GET             → mostra a configuração atual da conta no conector.
 * GET ?ativar=1   → registra a URL desta aplicação no conector e devolve o
 *                   segredo de assinatura para colar na Vercel como
 *                   UPLOAD_POST_WEBHOOK_SECRET (e republicar).
 *
 * O segredo aparece aqui de propósito: é um segredo de VERIFICAÇÃO (com ele
 * só se assina aviso de webhook, não se publica nada), a rota é de admin, e
 * sem mostrá-lo não haveria como levá-lo até a variável de ambiente.
 */

// A configuração de notificações vive no host do painel, não no da API.
const ENDERECO = 'https://app.upload-post.com/api/uploadposts/users/notifications'

function urlDoWebhook(): string {
  const base = process.env.NEWSLETTER_URL_BASE?.trim().replace(/\/$/, '')
    || 'https://redacao.cruzvermelhariodejaneiro.org'
  return `${base}/api/webhooks/upload-post`
}

type Notificacoes = {
  channels?: Record<string, boolean>
  webhook_url?: string | null
  webhook_secret?: string | null
  webhook_events?: Record<string, boolean>
}

export async function GET(req: Request) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  let chave: string
  try {
    chave = apiKey()
  } catch (causa) {
    if (causa instanceof UploadPostConfigError) {
      return NextResponse.json({ ok: false, mensagem: causa.message }, { status: 503 })
    }
    throw causa
  }

  const cabecalhos = { Authorization: `Apikey ${chave}`, 'Content-Type': 'application/json' }
  const ativar = new URL(req.url).searchParams.get('ativar') === '1'
  const destino = urlDoWebhook()

  try {
    if (ativar) {
      const resposta = await fetch(ENDERECO, {
        method: 'POST',
        headers: cabecalhos,
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          channels: { webhook: true },
          webhook_url: destino,
          // Só o evento que o hub consome. Os de conexão de conta ficam para
          // quando houver onde guardá-los.
          webhook_events: {
            upload_completed: true,
            social_account_connected: false,
            social_account_disconnected: false,
            social_account_reauth_required: false,
          },
        }),
      })
      if (!resposta.ok) {
        const texto = await resposta.text()
        return NextResponse.json({
          ok: false,
          mensagem: `O conector recusou a ativação (HTTP ${resposta.status}): ${semSegredo(texto).slice(0, 300)}`,
        }, { status: 502 })
      }
    }

    const leitura = await fetch(ENDERECO, {
      headers: cabecalhos,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!leitura.ok) {
      const texto = await leitura.text()
      return NextResponse.json({
        ok: false,
        mensagem: `Não foi possível ler a configuração (HTTP ${leitura.status}): ${semSegredo(texto).slice(0, 300)}`,
      }, { status: 502 })
    }
    const dados = await leitura.json() as { notifications?: Notificacoes } & Notificacoes
    const config = dados.notifications ?? dados

    const urlConfigurada = config.webhook_url ?? null
    const apontaParaCa = urlConfigurada === destino
    const verificadorNaVercel = Boolean(process.env.UPLOAD_POST_WEBHOOK_SECRET?.trim())

    return NextResponse.json({
      ok: apontaParaCa && verificadorNaVercel,
      urlEsperada: destino,
      urlConfigurada,
      canalWebhookLigado: Boolean(config.channels?.webhook),
      segredoParaVercel: config.webhook_secret ?? null,
      verificadorNaVercel,
      proximoPasso: !apontaParaCa
        ? 'Chame esta rota com ?ativar=1 para registrar a URL do webhook no conector.'
        : !verificadorNaVercel
          ? 'Copie segredoParaVercel para a variável UPLOAD_POST_WEBHOOK_SECRET na Vercel e republique. Não compartilhe o valor.'
          : 'Webhook ativo: o resultado de cada post chega sozinho ao hub.',
    })
  } catch (causa) {
    return NextResponse.json({
      ok: false,
      mensagem: semSegredo(causa instanceof Error ? causa.message : String(causa)).slice(0, 300),
    }, { status: 502 })
  }
}
