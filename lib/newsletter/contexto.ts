import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * O que a inscrição pública precisa saber e não tem como perguntar.
 *
 * A rota de inscrição não tem sessão: quem preenche o formulário no site
 * institucional não está logado na Redação. Então o espaço de trabalho e o
 * endereço dos links têm de ser resolvidos aqui.
 */

/**
 * Endereço público da Redação, base dos links de confirmação e de saída.
 *
 * Não usa VERCEL_URL de propósito: aquilo é o endereço do deploy
 * (`redacao-abc123.vercel.app`), que muda a cada publicação. Um link de saída
 * com endereço de deploy para de funcionar na próxima subida — e link de saída
 * quebrado é reclamação de spam.
 */
export function urlBase(): string {
  const configurado = process.env.NEWSLETTER_URL_BASE?.trim()
  return (configurado || 'https://redacao.cruzvermelhariodejaneiro.org').replace(/\/+$/, '')
}

export const urlDeConfirmacao = (token: string) => `${urlBase()}/newsletter/confirmar?t=${token}`

/**
 * O link de saída VISÍVEL, o do rodapé da mensagem.
 *
 * Abre uma página com um botão; sair mesmo só acontece no POST desse botão.
 * Parece um passo a mais e é proposital: filtro de segurança corporativo abre
 * todo link de todo e-mail que entra na empresa, antes de a pessoa ver a
 * mensagem. Se sair fosse um GET, esses robôs descadastrariam sozinhos quem
 * nunca clicou — e o efeito só apareceria como uma lista que encolhe sem
 * explicação.
 */
export const urlDeSaida = (token: string) => `${urlBase()}/newsletter/sair?t=${token}`

/**
 * O link de saída para MÁQUINA, o do cabeçalho List-Unsubscribe.
 *
 * Aqui a saída em um clique é obrigatória (RFC 8058): o provedor manda um POST
 * e espera que a pessoa esteja fora. Não há risco de robô de segurança porque
 * eles fazem GET, não POST — e o GET desta rota só redireciona para a página
 * do botão.
 */
export const urlDeSaidaEmUmClique = (token: string) => `${urlBase()}/api/newsletter/sair?t=${token}`

/**
 * Qual espaço recebe as inscrições.
 *
 * A regra é: o que estiver configurado; senão, o único que existir. Hoje há um
 * só ("Produção"), então funciona sem configurar nada. Se um segundo espaço
 * aparecer amanhã, isto FALHA dizendo o que fazer, em vez de escolher um dos
 * dois na sorte — inscrição parar com erro claro é ruim; inscrição cair no
 * espaço errado em silêncio é pior, porque ninguém descobre.
 */
export async function espacoDaNewsletter(): Promise<{ id: string } | { erro: string }> {
  const configurado = process.env.NEWSLETTER_WORKSPACE_ID?.trim()
  if (configurado) return { id: configurado }

  const admin = createAdminClient()
  const { data, error } = await admin.from('workspaces').select('id').limit(2)
  if (error) return { erro: `Não foi possível resolver o espaço da newsletter: ${error.message}` }
  if (!data?.length) return { erro: 'Não há espaço de trabalho para receber a inscrição.' }
  if (data.length > 1) {
    return { erro: 'Há mais de um espaço de trabalho: defina NEWSLETTER_WORKSPACE_ID para dizer qual recebe as inscrições.' }
  }
  return { id: data[0].id as string }
}

/**
 * Origens autorizadas a chamar a rota de inscrição pelo navegador.
 *
 * O site institucional e a Redação são domínios diferentes, então a chamada é
 * de outra origem e precisa de CORS. A lista é fechada: liberar "*" deixaria
 * qualquer página da internet postar na lista da Cruz Vermelha.
 */
const ORIGENS = [
  'https://cruzvermelhariodejaneiro.org',
  'https://www.cruzvermelhariodejaneiro.org',
]

export function origensPermitidas(): string[] {
  const extra = process.env.NEWSLETTER_ORIGENS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []
  return [...ORIGENS, ...extra]
}

/** Cabeçalhos de CORS quando a origem é conhecida; vazio quando não é. */
export function cabecalhosDeCors(origem: string | null): Record<string, string> {
  if (!origem || !origensPermitidas().includes(origem)) return {}
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
