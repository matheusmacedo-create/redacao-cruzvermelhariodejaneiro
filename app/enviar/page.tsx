import type { Metadata } from 'next'
import { PaginaDeEnvio } from '@/components/enviar/pagina'

// Página pública, sem login: o link (e o QR code) que a equipe usa para mandar
// o que aconteceu numa ação. Fica fora do Google (noindex): é da equipe.
export const metadata: Metadata = {
  title: 'Mandar uma ação — Cruz Vermelha RJ',
  description: 'Mande fotos, vídeos, áudios e o relato de uma ação para a comunicação da Cruz Vermelha Brasileira – Filial RJ.',
  robots: { index: false, follow: false },
}

// Os setores vêm do cadastro do espaço; a página se refaz a cada 10 minutos.
export const revalidate = 600

export default async function Enviar() {
  return <PaginaDeEnvio />
}
