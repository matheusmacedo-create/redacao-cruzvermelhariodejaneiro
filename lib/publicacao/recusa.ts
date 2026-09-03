/**
 * Tradução das recusas das redes sociais.
 *
 * Quando um envio falha numa rede, o Upload-Post devolve o motivo em inglês —
 * e, dependendo do endpoint, ora no campo `message`, ora no campo `error`.
 * O código antigo só lia `message`: numa falha real do Facebook (token
 * vencido, permissão da página, limite do plano) o campo vinha vazio e a
 * tela mostrava o genérico "A rede recusou a publicação", que não diz o que
 * fazer.
 *
 * Este módulo faz o mesmo que explicarErroDeConexao faz para o FTP: reconhece
 * os motivos conhecidos, diz em português o que aconteceu E qual é o próximo
 * passo, e preserva a resposta original entre parênteses — porque a tradução
 * nunca pode custar a evidência.
 *
 * Módulo puro de propósito: roda na suíte de testes sem servidor.
 */

/** Uma linha de resultado por rede, nas grafias que a API usa — a resposta
 * real de produção trouxe `error_message`/`failure_stage`, que a documentação
 * não prometia. Os campos são unknown de propósito: um objeto onde se esperava
 * string não pode custar o motivo. */
export type RecusaBruta = {
  message?: unknown
  error?: unknown
  error_message?: unknown
  failure_stage?: unknown
}

/** String legível a partir do que vier: texto, objeto com message/error, ou o
 * próprio JSON como último recurso. */
function comoTexto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null
  if (valor && typeof valor === 'object') {
    const o = valor as { message?: unknown; error?: unknown; detail?: unknown }
    return comoTexto(o.message) ?? comoTexto(o.error) ?? comoTexto(o.detail)
      ?? (() => { try { return JSON.stringify(valor).slice(0, 200) } catch { return null } })()
  }
  return null
}

/**
 * O motivo cru da falha, venha no campo que vier. `message` em sucesso carrega
 * "Published"/"Queued"; em falha o motivo de verdade vem em `error_message`
 * (resposta real de produção) ou `error` (documentação) — por isso eles têm
 * prioridade. `failure_stage` diz EM QUE PASSO morreu e entra como complemento.
 */
export function motivoDaRecusa(resultado: RecusaBruta): string | null {
  const motivo = comoTexto(resultado.error_message) ?? comoTexto(resultado.error) ?? comoTexto(resultado.message)
  const etapa = comoTexto(resultado.failure_stage)
  if (motivo && etapa) return `${motivo} (etapa: ${etapa})`
  return motivo ?? (etapa ? `Falhou na etapa: ${etapa}` : null)
}

const CASOS: { padrao: RegExp; dica: (canal: string) => string }[] = [
  {
    // "Your Facebook session has expired. Please reconnect your Facebook
    // account. Go to Manage Users, remove the account, and connect it again."
    padrao: /session has expired|reconnect|token.*(expired|invalid)|(expired|invalid).*token|oauthexception/i,
    dica: (canal) =>
      `A autorização da conta de ${canal} venceu — as redes exigem reconexão de tempos em tempos. `
      + `Abra Configurações → Redes sociais e conecte a conta de novo; depois é só reprocessar este destino.`,
  },
  {
    // "You have reached your monthly limit of X uploads"
    padrao: /monthly limit/i,
    dica: () =>
      'O plano do Upload-Post chegou ao teto de publicações do mês (no gratuito são 10). '
      + 'Espere a virada do mês ou avalie o plano pago em app.upload-post.com.',
  },
  {
    // "You have reached the daily limit of 5 uploads for: ..."
    padrao: /daily limit/i,
    dica: (canal) => `A conta de ${canal} chegou ao limite diário de publicações pelo conector. Tente de novo amanhã ou agende.`,
  },
  {
    padrao: /aspect ratio/i,
    dica: (canal) =>
      `A rede recusou a proporção da imagem. Ajuste o enquadramento deste destino — cada rede aceita `
      + `uma faixa de proporções, e a imagem enviada para ${canal} saiu fora dela.`,
  },
  {
    padrao: /file (size|too large)|too (big|large)|exceeds.*size/i,
    dica: () => 'O arquivo é grande demais para esta rede. Use uma imagem menor ou gere uma versão comprimida.',
  },
  {
    // "(#200) ... permission", "not authorized", "insufficient permission"
    padrao: /permission|not authorized|#200/i,
    dica: (canal) =>
      `A conta conectada não tem permissão de publicar em ${canal}. No Facebook isso costuma ser a página: `
      + `reconecte em Configurações → Redes sociais marcando a página certa, e confira UPLOAD_POST_FACEBOOK_PAGE_ID.`,
  },
  {
    padrao: /page.*not found|invalid page|no page/i,
    dica: () =>
      'O conector não encontrou a página do Facebook configurada. Confira UPLOAD_POST_FACEBOOK_PAGE_ID na Vercel '
      + '— /api/admin/redes-check lista o id certo da página conectada.',
  },
  {
    padrao: /duplicate/i,
    dica: (canal) => `${canal} recusou por conteúdo repetido: um post idêntico saiu há pouco. Mude o texto ou espere um pouco.`,
  },
  {
    padrao: /rate limit|too many requests/i,
    dica: (canal) => `${canal} está limitando chamadas neste momento. Espere alguns minutos e reprocesse.`,
  },
]

/**
 * O texto que vai para a tela e para o banco.
 *
 * Motivo conhecido → dica em português + resposta original entre parênteses.
 * Motivo desconhecido → a resposta original como veio (é melhor um inglês
 * verdadeiro do que um português vazio). Sem motivo nenhum → o genérico, agora
 * apontando para o diagnóstico.
 */
export function explicarRecusaDaRede(resultado: RecusaBruta, canal: string): string {
  const motivo = motivoDaRecusa(resultado)
  if (!motivo) {
    return `A rede recusou a publicação e não disse o motivo. Confira a conexão das contas em /api/admin/redes-check e reprocesse.`
  }
  const conhecida = traduzirSeConhecida(motivo, canal)
  return conhecida ?? `A rede recusou a publicação: ${motivo.slice(0, 200)}`
}

/**
 * Só a tradução, sem moldura: para os erros que chegam pelo caminho geral
 * (falha de HTTP, teto do plano), onde a mensagem pode já estar em português
 * e dizer outra coisa que não "a rede recusou". Motivo desconhecido → null,
 * e quem chamou mantém o texto original.
 */
export function traduzirSeConhecida(motivo: string, canal: string): string | null {
  const original = motivo.slice(0, 200)
  for (const caso of CASOS) {
    if (caso.padrao.test(motivo)) return `${caso.dica(canal)} (resposta da rede: ${original})`
  }
  return null
}
