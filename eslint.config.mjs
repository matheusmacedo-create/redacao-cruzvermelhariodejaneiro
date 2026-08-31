import next from 'eslint-config-next/core-web-vitals'

/**
 * O `pnpm lint` existia no package.json sem o ESLint instalado: rodava e
 * falhava. Agora roda.
 *
 * A configuração é a do Next — o que interessa aqui são as regras de hooks
 * (dependência esquecida em useEffect é bug de verdade, não estilo) e as de
 * acessibilidade. Estilo fica de fora de propósito: brigar por aspas e
 * vírgulas ensina todo mundo a ignorar o aviso.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'supabase/**'] },
  ...(Array.isArray(next) ? next : [next]),
  {
    rules: {
      // As imagens daqui são privadas: passam por /api/private-blob, que
      // confere a sessão a cada pedido. O otimizador do next/image busca a
      // origem sem cookie e receberia 401 — <img> é a escolha certa, não um
      // descuido.
      '@next/next/no-img-element': 'off',
    },
  },
]

export default config
