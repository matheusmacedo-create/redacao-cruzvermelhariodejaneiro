/**
 * O endereço do Palácio Virtual — um lugar só para o domínio.
 *
 * Era redacao.cruzvermelhariodejaneiro.org; desde a troca do nome do produto
 * é palacio.cruzvermelhariodejaneiro.org. O antigo continua apontando para cá
 * (redirecionamento na Vercel): há links dele em e-mails já enviados, PDFs de
 * ofícios, QR codes impressos, favoritos e no conteúdo gravado. Por isso o
 * que CONFERE um endereço aceita os dois (ehDominioDoPalacio), e o que
 * IDENTIFICA algo para sempre (o UID dos eventos de calendário) não muda.
 *
 * Os links dos e-mails usam NEWSLETTER_URL_BASE quando a Vercel tem essa
 * variável (lib/newsletter/contexto.ts); em branco, vale ENDERECO_DO_PALACIO.
 */

export const DOMINIO_DO_PALACIO = 'palacio.cruzvermelhariodejaneiro.org'

/** O domínio de antes do nome novo. Só para aceitar links antigos, nunca para gerar link novo. */
export const DOMINIO_ANTIGO = 'redacao.cruzvermelhariodejaneiro.org'

export const ENDERECO_DO_PALACIO = `https://${DOMINIO_DO_PALACIO}`

/** O host é do Palácio Virtual (o domínio novo ou o antigo)? */
export function ehDominioDoPalacio(host: string): boolean {
  const h = host.toLowerCase()
  return h === DOMINIO_DO_PALACIO || h === DOMINIO_ANTIGO
}
