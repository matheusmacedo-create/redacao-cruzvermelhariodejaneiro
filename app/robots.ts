import type { MetadataRoute } from 'next'

/**
 * O Palácio Virtual é ferramenta interna: nenhuma página dele entra na busca.
 * Quem precisa de uma página pública chega por link ou QR (crachá, diploma,
 * verificação, inscrição), nunca pelo Google. O cabeçalho X-Robots-Tag em
 * next.config.mjs diz o mesmo para quem ignora o robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } }
}
