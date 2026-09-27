import 'server-only'
import QRCode from 'qrcode'
import { urlBase } from '@/lib/newsletter/contexto'

/**
 * O link do /enviar e o QR dele, iguais na página do cartaz e no PNG. O QR
 * sai em PNG grande (1200 px) para ficar nítido no papel e no story.
 */
export async function linkEQrDoEnvio() {
  const link = `${urlBase()}/enviar`
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 0, width: 1200, color: { dark: '#1a1a1a', light: '#ffffff' } })
  return { link, qr, endereco: link.replace(/^https?:\/\//, '') }
}
