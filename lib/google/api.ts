/**
 * Onde ficam as APIs do Google. Só fora de produção, para os testes com um
 * servidor de mentira, dá para apontar para outro endereço (GOOGLE_API_TESTE):
 * o caminho continua o mesmo, muda só o servidor.
 */
export function apiDoGoogle(padrao: string): string {
  const teste = process.env.NODE_ENV !== 'production' ? process.env.GOOGLE_API_TESTE?.trim() : ''
  return teste ? `${teste.replace(/\/$/, '')}${new URL(padrao).pathname}` : padrao
}
