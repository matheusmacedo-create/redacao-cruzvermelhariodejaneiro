import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Área do Voluntário — Cruz Vermelha RJ',
  description: 'O espaço do voluntário da Cruz Vermelha Brasileira – Filial do Rio de Janeiro.',
  robots: { index: false, follow: false },
}

export default function LayoutDoMembro({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-neutral-100 text-neutral-900">{children}</div>
}
