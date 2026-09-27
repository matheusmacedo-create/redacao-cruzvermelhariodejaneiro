import 'server-only'
import { apiDoGoogle } from '@/lib/google/api'
import { emailDaContaDeServico, ErroDoGoogle, tokenDaContaDeServico } from '@/lib/google/conta-de-servico'
import { ID_DA_PROPRIEDADE } from '@/lib/site/analytics'
import { lerDadosDoSite, pedidoDasCidades, pedidoDoLote, type DadosDoSite, type Periodo, type RelatorioDoGA } from './relatorio'

/**
 * O Google Analytics do site para Resultados: lido pela Data API do GA4 com a
 * conta de serviço (só leitura), da propriedade do site (ID_DA_PROPRIEDADE).
 * Uma leitura por período a cada 30 minutos: os números do GA mudam devagar,
 * e a cota da API é por projeto.
 */

const ESCOPO = 'https://www.googleapis.com/auth/analytics.readonly'
const MEIA_HORA = 30 * 60_000
const cache = new Map<string, { dados: DadosDoSite; lidoEm: number }>()

export type SituacaoDoAnalytics =
  | { estado: 'sem_chave' }
  | { estado: 'erro'; mensagem: string; email: string | null }
  | { estado: 'ok'; dados: DadosDoSite; lidoEm: number; email: string | null }

async function chamar<T>(workspaceId: string, metodo: string, corpo: unknown, email: string | null): Promise<T> {
  const token = await tokenDaContaDeServico(workspaceId, ESCOPO)
  const res = await fetch(apiDoGoogle(`https://analyticsdata.googleapis.com/v1beta/properties/${ID_DA_PROPRIEDADE}:${metodo}`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const dados = await res.json().catch(() => ({})) as { error?: { message?: string; status?: string } }
  if (!res.ok) {
    const motivo = dados.error?.message ?? `HTTP ${res.status}`
    throw new ErroDoGoogle(
      /has not been used|is disabled|SERVICE_DISABLED/i.test(motivo)
        ? 'A Google Analytics Data API está desligada no projeto do Google Cloud da conta de serviço. Ative em APIs e serviços → Biblioteca → “Google Analytics Data API”.'
        : res.status === 403
          ? `A conta de serviço ainda não tem acesso à propriedade ${ID_DA_PROPRIEDADE} do Analytics. Em Administrador → Gerenciamento de acesso à propriedade, adicione ${email ?? 'o e-mail da conta de serviço'} com o papel Leitor.`
          : res.status === 429 ? 'O limite de consultas do Google Analytics foi atingido. Tente de novo em alguns minutos.'
            : `O Google Analytics recusou a consulta: ${motivo}`,
      res.status,
    )
  }
  return dados as T
}

/** Os números do site no período, ou por que não há números. `hoje` em AAAA-MM-DD (São Paulo). */
export async function situacaoDoAnalytics(workspaceId: string, dias: Periodo, hoje: string): Promise<SituacaoDoAnalytics> {
  const email = await emailDaContaDeServico(workspaceId).catch(() => null)
  if (!email) {
    // Sem chave, ou chave que não é de conta de serviço: a tela explica como ligar.
    return { estado: 'sem_chave' }
  }
  const chave = `${workspaceId}:${dias}:${hoje}`
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.lidoEm < MEIA_HORA) return { estado: 'ok', dados: guardado.dados, lidoEm: guardado.lidoEm, email }
  try {
    const [lote, cidades] = await Promise.all([
      chamar<{ reports?: RelatorioDoGA[] }>(workspaceId, 'batchRunReports', pedidoDoLote(dias), email),
      chamar<RelatorioDoGA>(workspaceId, 'runReport', pedidoDasCidades(dias), email),
    ])
    const dados = lerDadosDoSite(dias, lote, cidades, hoje)
    const lidoEm = Date.now()
    cache.set(chave, { dados, lidoEm })
    return { estado: 'ok', dados, lidoEm, email }
  } catch (causa) {
    return { estado: 'erro', mensagem: causa instanceof ErroDoGoogle ? causa.message : 'Não foi possível ler o Google Analytics agora. Tente de novo em instantes.', email }
  }
}
