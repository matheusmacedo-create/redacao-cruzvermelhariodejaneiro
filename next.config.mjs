/** @type {import('next').NextConfig} */
const nextConfig = {
  // A hora do build, para o pé do menu mostrar quando a versão no ar foi publicada (lib/versao.ts).
  env: { PALACIO_PUBLICADO_EM: new Date().toISOString() },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Cache de telas no navegador: voltar a uma tela visitada há menos de 30 s
    // (o menu, o "voltar") abre na hora, sem ir ao servidor. Salvar algo
    // (revalidatePath nas actions) e router.refresh() limpam esse cache, então
    // o que a própria pessoa muda aparece na hora. O padrão do Next é 0.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      // O service worker (public/sw.js) sempre conferido: versão nova chega na próxima visita.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, max-age=0' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      // Logo e imagens fixas: um dia sem perguntar ao servidor (o padrão da Vercel é perguntar a cada tela).
      { source: '/images/:arquivo*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
    ]
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
