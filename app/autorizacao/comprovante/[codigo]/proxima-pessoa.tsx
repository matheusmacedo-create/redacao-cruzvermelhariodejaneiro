'use client'

import { useRouter } from 'next/navigation'
import { MessageCircle, UserPlus } from 'lucide-react'
import { botaoDoMembro, botaoSecundario } from '@/components/membro/marca'

/**
 * Logo depois de assinar. Quando várias pessoas assinam no mesmo celular (o
 * de quem mandou a ação), cada uma leva o próprio comprovante pelo WhatsApp,
 * e "Outra pessoa vai assinar" troca esta página sem deixá-la no histórico —
 * quem vem depois não abre o comprovante (nem a revogação) de quem veio antes.
 */
export function ProximaPessoa({ codigo, chave, link }: { codigo: string; chave: string; link: string | null }) {
  const router = useRouter()
  function mandar() {
    const endereco = `${window.location.origin}/autorizacao/comprovante/${codigo}?c=${encodeURIComponent(chave)}`
    const texto = `Meu comprovante de autorização de uso de imagem da Cruz Vermelha RJ (${codigo}). Por este link posso ver ou revogar quando quiser: ${endereco}`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" onClick={mandar} className={botaoSecundario}><MessageCircle className="size-4" aria-hidden="true" />Mandar o comprovante para o meu WhatsApp</button>
      {link && <button type="button" onClick={() => router.replace(link)} className={botaoDoMembro}><UserPlus className="size-4" aria-hidden="true" />Outra pessoa vai assinar</button>}
    </div>
  )
}
