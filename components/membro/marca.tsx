/** A cruz e o nome, no alto da área do membro. */
export function Marca({ subtitulo = 'Área do Voluntário' }: { subtitulo?: string }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden="true" className="relative inline-block size-9 shrink-0">
        <span className="absolute left-1/2 top-0 h-full w-[34%] -translate-x-1/2 bg-[#e32219]" />
        <span className="absolute left-0 top-1/2 h-[34%] w-full -translate-y-1/2 bg-[#e32219]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Cruz Vermelha RJ</span>
        <span className="block text-base font-bold tracking-tight text-neutral-900">{subtitulo}</span>
      </span>
    </span>
  )
}

export const campoDoMembro = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-[#e32219] focus:ring-2 focus:ring-[#e32219]/20'
export const botaoDoMembro = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#e32219] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c81d15] disabled:opacity-60'
