import 'server-only'
import { apiKey, semSegredo } from '@/lib/publicacao/upload-post'

/**
 * O webhook do Upload-Post sem nenhuma variável nova.
 *
 * O desenho anterior pedia que uma pessoa copiasse o segredo de assinatura
 * para a Vercel — um passo manual que ia falhar em silêncio (webhook sem
 * verificador recusa tudo). Aqui o segredo é LIDO da própria API do conector,
 * com a chave que já existe (UPLOAD_POST_API_KEY), e o registro da URL
 * acontece sozinho na primeira publicação. UPLOAD_POST_WEBHOOK_SECRET vira um
 * atalho opcional: definido, poupa a consulta.
 *
 * A configuração de notificações vive no host do painel (app.), não no da
 * API (api.) — é o endereço que a documentação dá.
 */

const ENDERECO = 'https://app.upload-post.com/api/uploadposts/users/notifications'

/** Cache do segredo por instância: o webhook chega em rajada quando um pacote
 * inteiro publica, e buscar o mesmo valor a cada entrega seria desperdício. */
let cache: { valor: string; ate: number } | null = null
const DEZ_MINUTOS = 10 * 60 * 1000

export type ConfiguracaoDeNotificacao = {
  channels?: Record<string, boolean>
  webhook_url?: string | null
  webhook_secret?: string | null
  webhook_events?: Record<string, boolean>
}

export async function lerConfiguracao(timeoutMs = 10_000): Promise<ConfiguracaoDeNotificacao> {
  const resposta = await fetch(ENDERECO, {
    headers: { Authorization: `Apikey ${apiKey()}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resposta.ok) {
    throw new Error(`O conector não devolveu a configuração de notificações (HTTP ${resposta.status}).`)
  }
  const dados = await resposta.json() as { notifications?: ConfiguracaoDeNotificacao } & ConfiguracaoDeNotificacao
  return dados.notifications ?? dados
}

/**
 * O segredo que assina as entregas. Ordem: variável de ambiente (quando
 * alguém preferir fixá-lo), depois a API do conector, com cache curto.
 */
export async function segredoDoWebhook(): Promise<string | null> {
  const fixo = process.env.UPLOAD_POST_WEBHOOK_SECRET?.trim()
  if (fixo) return fixo
  if (cache && cache.ate > Date.now()) return cache.valor
  try {
    const config = await lerConfiguracao()
    const valor = config.webhook_secret?.trim()
    if (!valor) return null
    cache = { valor, ate: Date.now() + DEZ_MINUTOS }
    return valor
  } catch (causa) {
    console.warn('[webhook] não foi possível ler o segredo no conector:', semSegredo(String(causa)))
    return null
  }
}

/** Derruba o cache — usado quando uma assinatura não bate, para cobrir a
 * rotação do segredo sem esperar o cache vencer. */
export function esquecerSegredo() {
  cache = null
}

export function urlDoWebhook(): string {
  const base = process.env.NEWSLETTER_URL_BASE?.trim().replace(/\/$/, '')
    || 'https://redacao.cruzvermelhariodejaneiro.org'
  return `${base}/api/webhooks/upload-post`
}

/** Já registrado nesta instância? Evita reconferir a cada publicação. */
let registrado = false

/**
 * Garante que o conector aponta para o nosso webhook. Chamado no caminho da
 * publicação: se falhar, a publicação segue — o hub continua funcionando pela
 * conferência ao abrir a tela, como sempre funcionou.
 */
export async function garantirWebhookRegistrado(): Promise<void> {
  if (registrado) return
  try {
    const destino = urlDoWebhook()
    const config = await lerConfiguracao(6_000)
    if (config.webhook_url === destino && config.channels?.webhook) {
      registrado = true
      return
    }
    const resposta = await fetch(ENDERECO, {
      method: 'POST',
      headers: { Authorization: `Apikey ${apiKey()}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
      body: JSON.stringify({
        channels: { webhook: true },
        webhook_url: destino,
        // Só o evento que o hub consome hoje.
        webhook_events: {
          upload_completed: true,
          social_account_connected: false,
          social_account_disconnected: false,
          social_account_reauth_required: false,
        },
      }),
    })
    if (resposta.ok) {
      registrado = true
      // O segredo nasce no primeiro registro — o cache antigo (vazio) já era.
      esquecerSegredo()
    } else {
      console.warn('[webhook] o conector recusou o registro:', resposta.status)
    }
  } catch (causa) {
    console.warn('[webhook] registro adiado:', semSegredo(String(causa)))
  }
}
