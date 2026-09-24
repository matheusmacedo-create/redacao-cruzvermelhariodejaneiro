import { BrandMark } from '@/components/app/brand-mark'

/** A logo oficial com o nome da Área do Voluntário, no padrão do Redação. */
export function Marca({ subtitulo = 'Área do Voluntário', inverted = false, className = 'w-36 sm:w-40' }: { subtitulo?: string; inverted?: boolean; className?: string }) {
  return <BrandMark compact inverted={inverted} rotulo={subtitulo} className={className} />
}

export const campoDoMembro = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-3 focus:ring-ring/20'
export const botaoDoMembro = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60'
