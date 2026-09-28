import Image from 'next/image'
import { condensada } from '@/components/cracha/fonte'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { cn } from '@/lib/utils'

/**
 * O crachá de visitante para imprimir (Portaria), no tamanho de cartão
 * (86 × 54 mm) e na mesma identidade do crachá funcional: a logo oficial, o
 * vermelho da marca e a condensada do manual. Dois formatos
 * (FORMATOS_DE_CRACHA): deitado, para o porta-crachá horizontal com
 * presilha, e em pé. É reutilizável: leva só o número, que a portaria anota
 * na entrada e confere na saída — nunca o nome do visitante.
 */

const BASE = 'papel relative flex flex-col overflow-hidden bg-white text-[#1f1f1f] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]'
const CARTAO = `${BASE} h-[86mm] w-[54mm]`
const CARTAO_DEITADO = `${BASE} h-[54mm] w-[86mm]`
const VERMELHO = 'bg-[#e32219] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]'

export function FrenteDoCrachaDeVisitante({ numero, deitado = false }: { numero: string; deitado?: boolean }) {
  if (deitado) return <FrenteDeitada numero={numero} />
  return (
    <div className={CARTAO} aria-label={`Frente do crachá de visitante ${numero}`}>
      <div className="px-[6mm] pt-[5mm]">
        <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} sizes="200px" className="h-auto w-full" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className={cn(condensada.className, 'text-[46pt] font-bold leading-none tracking-tight')}>{numero}</p>
      </div>
      <p className={cn(condensada.className, VERMELHO, 'flex h-[13mm] items-center justify-center text-[26pt] font-bold uppercase leading-none tracking-wide text-white')}>Visitante</p>
      <p className="px-[3mm] py-[2mm] text-center text-[6.5pt] leading-tight text-[#3a3a3a]">Use visível durante toda a visita.<br />Filial do Estado do Rio de Janeiro</p>
    </div>
  )
}

export function VersoDoCrachaDeVisitante({ numero, deitado = false }: { numero: string; deitado?: boolean }) {
  if (deitado) return <VersoDeitado numero={numero} />
  return (
    <div className={CARTAO} aria-label={`Verso do crachá de visitante ${numero}`}>
      <p className={cn(condensada.className, VERMELHO, 'px-[3mm] py-[2mm] text-center text-[13pt] font-bold uppercase leading-none tracking-wide text-white')}>Crachá de visitante</p>
      <ol className="mt-[3mm] flex flex-col gap-[2mm] px-[4mm] text-[7.5pt] leading-snug">
        <li><strong>Uso temporário e pessoal.</strong> Vale só no dia e para a visita registrada na portaria.</li>
        <li><strong>Sempre visível</strong> enquanto estiver na filial.</li>
        <li><strong>Circule só</strong> pelas áreas autorizadas, acompanhado quando pedirem.</li>
        <li><strong>Devolva na portaria</strong> ao sair.</li>
      </ol>
      <p className={cn(condensada.className, 'mx-[3mm] mt-auto border-2 border-[#e32219] text-center text-[16pt] font-bold leading-[1.2]')}>{numero}</p>
      <p className="px-[3mm] pb-[2.5mm] pt-[2mm] text-center text-[5.8pt] leading-snug text-[#3a3a3a]">
        Encontrou este crachá? Devolva à {DADOS_DA_FILIAL.nome}.<br />{DADOS_DA_FILIAL.endereco} · {DADOS_DA_FILIAL.telefone}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- deitado (86 × 54 mm)
// A presilha do porta-crachá horizontal prende pela borda de cima: nada importante encosta nela.

function FrenteDeitada({ numero }: { numero: string }) {
  return (
    <div className={CARTAO_DEITADO} aria-label={`Frente do crachá de visitante ${numero}`}>
      <div className="flex flex-1 items-center gap-[4mm] px-[5mm] pt-[4mm]">
        <div className="flex w-[38mm] shrink-0 flex-col gap-[2mm]">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} sizes="160px" className="h-auto w-full" />
          <p className="text-[6pt] leading-tight text-[#3a3a3a]">Use visível durante toda a visita.<br />Filial do Estado do Rio de Janeiro</p>
        </div>
        <p className={cn(condensada.className, 'min-w-0 flex-1 text-center text-[40pt] font-bold leading-none tracking-tight')}>{numero}</p>
      </div>
      <p className={cn(condensada.className, VERMELHO, 'mt-[3mm] flex h-[12mm] items-center justify-center text-[24pt] font-bold uppercase leading-none tracking-wide text-white')}>Visitante</p>
    </div>
  )
}

function VersoDeitado({ numero }: { numero: string }) {
  return (
    <div className={CARTAO_DEITADO} aria-label={`Verso do crachá de visitante ${numero}`}>
      <p className={cn(condensada.className, VERMELHO, 'px-[3mm] py-[1.6mm] text-center text-[11pt] font-bold uppercase leading-none tracking-wide text-white')}>Crachá de visitante</p>
      <div className="flex flex-1 gap-[3mm] px-[4mm] pt-[2.5mm]">
        <ol className="flex min-w-0 flex-1 flex-col gap-[1.2mm] text-[6.4pt] leading-snug">
          <li><strong>Uso temporário e pessoal.</strong> Vale só no dia e para a visita registrada na portaria.</li>
          <li><strong>Sempre visível</strong> enquanto estiver na filial.</li>
          <li><strong>Circule só</strong> pelas áreas autorizadas, acompanhado quando pedirem.</li>
          <li><strong>Devolva na portaria</strong> ao sair.</li>
        </ol>
        <p className={cn(condensada.className, 'flex h-[14mm] w-[22mm] shrink-0 items-center justify-center self-center border-2 border-[#e32219] text-[15pt] font-bold leading-none')}>{numero}</p>
      </div>
      <p className="px-[3mm] pb-[2mm] pt-[1.5mm] text-center text-[5.2pt] leading-snug text-[#3a3a3a]">
        Encontrou este crachá? Devolva à {DADOS_DA_FILIAL.nome}.<br />{DADOS_DA_FILIAL.endereco} · {DADOS_DA_FILIAL.telefone}
      </p>
    </div>
  )
}
