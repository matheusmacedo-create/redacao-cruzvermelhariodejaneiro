/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // As fontes da identidade e a logo, lidas do disco pelos PDFs (lib/pdf/fontes.ts, lib/pdf/logo.ts).
  outputFileTracingIncludes: {
    '/membro/certificados/*/pdf': ['./lib/pdf/fontes/*.ttf', './public/images/logo-cvrj.png'],
    '/membro/cracha/pdf': ['./lib/pdf/fontes/*.ttf', './public/images/logo-cvrj.png'],
    '/api/cracha/pdf': ['./lib/pdf/fontes/*.ttf', './public/images/logo-cvrj.png'],
    '/membro/diplomas/*/pdf': ['./lib/pdf/fontes/*.ttf', './public/images/logo-cvrj.png'],
    '/api/voluntariado/diplomas/*/pdf': ['./lib/pdf/fontes/*.ttf', './public/images/logo-cvrj.png'],
    '/api/voluntariado/diplomas/lote': ['./lib/pdf/fontes/*.ttf', './public/images/logo-cvrj.png'],
    '/api/envios/cartaz': ['./lib/pdf/fontes/*.ttf', './public/images/logo-cvrj.png'],
  },
  // A Caixa de entrada virou o Direct das redes (26/09/2026): links e favoritos antigos continuam chegando.
  async redirects() {
    return [
      { source: '/caixa-de-entrada', destination: '/direct', permanent: false },
      { source: '/caixa-de-entrada/:resto*', destination: '/direct', permanent: false },
    ]
  },
}

export default nextConfig
