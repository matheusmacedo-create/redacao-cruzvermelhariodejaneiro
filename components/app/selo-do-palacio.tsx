import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * O selo do Palácio Virtual: o palácio da filial num medalhão vermelho, sem
 * fundo (public/images/palacio-virtual.png, 512 px). É a marca do sistema:
 * favicon, menu, telas de entrada e avisos do navegador. Documentos da filial
 * (ofícios, crachás, certificados) continuam com a logo oficial da CVB.
 */
export function SeloDoPalacio({ tamanho, className, priority }: { tamanho: number; className?: string; priority?: boolean }) {
  return (
    <Image src="/images/palacio-virtual.png" alt="" width={512} height={512} sizes={`${tamanho}px`} priority={priority}
      style={{ width: tamanho, height: tamanho }} className={cn('shrink-0 select-none', className)} draggable={false} />
  )
}
