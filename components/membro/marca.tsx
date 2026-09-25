import Image from 'next/image'
import { BrandMark } from '@/components/app/brand-mark'
import { cn } from '@/lib/utils'

/**
 * Só a logo oficial, sem rótulo. É o único lugar da área em que o emblema
 * aparece: nada de cruz desenhada, recortada ou como marca d'água.
 */
export function Logo({ className = 'w-32', alt = 'Cruz Vermelha Brasileira – Rio de Janeiro' }: { className?: string; alt?: string }) {
  // `loading="eager"`: a logo está sempre no alto da tela. No Next 16 o
  // `priority` foi descontinuado em favor de `preload`/`loading`.
  return <Image src="/images/logo-cvrj.png" alt={alt} width={1844} height={752} loading="eager" sizes="160px" className={cn('h-auto shrink-0 object-contain object-left', className)} />
}

/** A logo oficial com o nome da Área do Voluntário, no padrão do Redação. */
export function Marca({ subtitulo = 'Área do Voluntário', inverted = false, className = 'w-36 sm:w-40' }: { subtitulo?: string; inverted?: boolean; className?: string }) {
  return <BrandMark compact inverted={inverted} rotulo={subtitulo} className={className} />
}

// Campos com 16px em tela de toque (celular em pé ou deitado, iPad): abaixo disso
// o Safari dá zoom ao tocar; só com mouse caem para 14px a partir de sm.
// `min-h-11` (e não `h-11`): dá os mesmos 44px no input e no select, e não
// esmaga um `<textarea>` que ainda use esta classe em vez de `areaDoMembro`.
export const campoDoMembro = 'min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-ring/20 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus:ring-destructive/20 pointer-fine:sm:text-sm'
/** Para `<textarea>`: o mesmo campo, sem altura fixa (quem manda é o `rows`). */
export const areaDoMembro = 'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-ring/20 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus:ring-destructive/20 pointer-fine:sm:text-sm'

// Base comum: alvo de 44px, e o texto pode quebrar sem o botão encolher.
const BOTAO = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60'
/** A ação principal: uma por tela. */
export const botaoDoMembro = `${BOTAO} bg-primary text-primary-foreground hover:bg-primary/90`
export const botaoSecundario = `${BOTAO} border border-border bg-card text-foreground hover:bg-muted`
/** Ex.: entrar na lista de espera. */
export const botaoContorno = `${BOTAO} border border-primary/40 bg-card text-primary hover:bg-primary/5`
/** Ex.: "Anterior". */
export const botaoFantasma = `${BOTAO} text-muted-foreground hover:bg-muted hover:text-foreground`
/** Ex.: cancelar inscrição. O vermelho de erro, mais escuro que o da marca. */
export const botaoPerigo = `${BOTAO} text-destructive hover:bg-destructive/10`

/**
 * Barra que gruda embaixo (prova, aula, perfil, conversa). No celular fica
 * acima da barra de navegação e da área segura do iPhone; no computador, a
 * 16px do pé. Sem `backdrop-blur`: o filtro prende elementos `fixed` dentro dele.
 */
export const barraFixa = 'sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 rounded-xl border border-border bg-card/95 p-3 shadow-sm lg:bottom-4'
