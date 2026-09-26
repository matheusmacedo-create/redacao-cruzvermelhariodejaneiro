/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
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
