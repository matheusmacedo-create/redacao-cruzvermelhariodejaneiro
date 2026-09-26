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

/**
 * Para onde mandar quem abriu uma página pelo domínio antigo: o mesmo caminho
 * no novo (308). Só navegação (GET/HEAD) fora de /api — webhooks (Upload-Post),
 * o formulário da newsletter do site e as agendas assinadas (.ics) chamam
 * /api pelo endereço antigo e muitos não seguem redirecionamento; esses
 * continuam respondendo nos dois domínios. Devolve null quando não redireciona.
 */
export function enderecoNoDominioNovo(host: string | null, metodo: string, caminho: string, busca: string): string | null {
  if (!host || host.toLowerCase().split(':')[0] !== DOMINIO_ANTIGO) return null
  if (metodo !== 'GET' && metodo !== 'HEAD') return null
  if (caminho === '/api' || caminho.startsWith('/api/')) return null
  return `${ENDERECO_DO_PALACIO}${caminho}${busca}`
}
