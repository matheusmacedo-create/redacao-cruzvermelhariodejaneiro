/**
 * O modo pedido por um arquivo de importação de pacote, lido sem validar o
 * resto: a tela usa para saber que caminho seguir (criar ou atualizar).
 *
 * Módulo à parte, sem dependências, porque roda no navegador: o validador
 * (importar-pacote.ts) usa node:crypto.
 */

export type ModoDaImportacao = 'criar' | 'atualizar'

/**
 * JSON quebrado ou sem `modo` = criar, e a validação da criação é quem
 * reclama do que estiver errado. Um modo que não existe também segue pela
 * criação, que o recusa com a mensagem certa.
 */
export function modoDoArquivo(conteudo: string): ModoDaImportacao {
  let bruto: unknown
  try { bruto = JSON.parse(conteudo) } catch { return 'criar' }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return 'criar'
  return (bruto as Record<string, unknown>).modo === 'atualizar' ? 'atualizar' : 'criar'
}
