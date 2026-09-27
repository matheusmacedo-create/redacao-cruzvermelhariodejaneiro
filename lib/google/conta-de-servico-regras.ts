/**
 * A chave JSON de uma conta de serviço do Google (o arquivo que o Google
 * Cloud baixa): o que é puro, conferido por scripts/conferir-analytics.ts.
 */

export type ContaDeServico = { email: string; chavePrivada: string }

/**
 * Lê e confere a chave colada. Aceita o arquivo inteiro (com ou sem as
 * quebras de linha, que um campo de uma linha tira) e devolve só o que o
 * Palácio usa: o e-mail da conta e a chave privada.
 */
export function lerContaDeServico(bruto: string): ContaDeServico | { erro: string } {
  let dados: Record<string, unknown>
  try {
    dados = JSON.parse(bruto.trim()) as Record<string, unknown>
  } catch {
    return { erro: 'Cole o conteúdo inteiro do arquivo JSON da chave (começa com { e termina com }).' }
  }
  if (dados.type !== undefined && dados.type !== 'service_account') return { erro: 'Esta chave não é de uma conta de serviço. No Google Cloud, crie a chave em Contas de serviço → Chaves → Adicionar chave → JSON.' }
  const email = typeof dados.client_email === 'string' ? dados.client_email.trim() : ''
  const chave = typeof dados.private_key === 'string' ? dados.private_key.replace(/\\n/g, '\n').trim() : ''
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email)) return { erro: 'A chave não traz o e-mail da conta de serviço (client_email). Cole o arquivo JSON inteiro.' }
  if (!chave.startsWith('-----BEGIN PRIVATE KEY-----') || !chave.includes('-----END PRIVATE KEY-----')) return { erro: 'A chave não traz a chave privada (private_key). Cole o arquivo JSON inteiro.' }
  return { email, chavePrivada: `${chave}\n` }
}

/** O que vai para o cofre: só os dois campos que o Palácio usa (nada de ids de projeto ou de chave). */
export function contaDeServicoParaGuardar(bruto: string): string | { erro: string } {
  const c = lerContaDeServico(bruto)
  return 'erro' in c ? c : JSON.stringify({ type: 'service_account', client_email: c.email, private_key: c.chavePrivada })
}
