import localFont from 'next/font/local'

// A Franklin Gothic Demi Cond do manual, na equivalente livre (lib/pdf/fontes): o crachá e a verificação.
export const condensada = localFont({ src: [{ path: '../../lib/pdf/fontes/BarlowCondensed_600SemiBold.ttf', weight: '600' }, { path: '../../lib/pdf/fontes/BarlowCondensed_700Bold.ttf', weight: '700' }], display: 'swap' })
