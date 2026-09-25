'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarHeart, GraduationCap, House, MessageCircle, UserRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dentroDe } from '@/lib/membro/regras'

/**
 * Os 5 destinos da área, iguais em todas as larguras. Apostilas e
 * Certificados moram em Formação; Avisos, em Mensagens — no celular chega-se
 * a eles pela sub-aba, e a aba de baixo certa fica acesa. `prefixos` diz onde
 * a aba acende; `rotuloCurto` é o da barra do celular (5 colunas estreitas).
 */
export const SECOES: readonly { href: string; rotulo: string; rotuloCurto: string; icone: LucideIcon; prefixos: readonly string[] }[] = [
  // O início acende só nele mesmo: todas as outras rotas ficam abaixo de /membro.
  { href: '/membro', rotulo: 'Início', rotuloCurto: 'Início', icone: House, prefixos: [] },
  { href: '/membro/cursos', rotulo: 'Formação', rotuloCurto: 'Formação', icone: GraduationCap, prefixos: ['/membro/cursos', '/membro/apostilas', '/membro/certificados'] },
  { href: '/membro/oportunidades', rotulo: 'Oportunidades', rotuloCurto: 'Ações', icone: CalendarHeart, prefixos: ['/membro/oportunidades'] },
  { href: '/membro/mensagens', rotulo: 'Mensagens', rotuloCurto: 'Mensagens', icone: MessageCircle, prefixos: ['/membro/mensagens', '/membro/avisos'] },
  { href: '/membro/perfil', rotulo: 'Perfil', rotuloCurto: 'Perfil', icone: UserRound, prefixos: ['/membro/perfil'] },
]

const MENSAGENS = '/membro/mensagens'

const ativa = (s: (typeof SECOES)[number], caminho: string) => (s.prefixos.length ? s.prefixos.some((p) => dentroDe(caminho, p)) : caminho === s.href)

/** O número desenhado. Fica fora da árvore de acessibilidade: quem lê é o `sr-only` ao lado. */
function Contador({ n, className }: { n: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold leading-none text-primary-foreground tabular-nums', className)}>
      {n > 9 ? '9+' : n}
    </span>
  )
}

const novidadesParaLeitor = (n: number) => `, ${n} ${n === 1 ? 'novidade' : 'novidades'}`

/*
 * Retorno ao toque: `useLinkStatus` só funciona dentro do próprio <Link>, por
 * isso cada miolo de aba é um componente. Pulsa só enquanto a navegação não
 * troca de endereço, e só para quem não pediu menos movimento.
 */
function MioloDaAbaNoTopo({ rotulo, acesa, novidades }: { rotulo: string; acesa: boolean; novidades: number }) {
  const { pending } = useLinkStatus()
  return (
    <span className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
      acesa ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground group-hover:bg-muted group-hover:text-foreground group-active:bg-muted',
      pending && 'bg-muted motion-safe:animate-pulse')}>
      {/* O rótulo em negrito, invisível, reserva a largura: a aba não "pula" ao acender. */}
      <span className="inline-grid">
        <span className="col-start-1 row-start-1">{rotulo}</span>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">{rotulo}</span>
      </span>
      {novidades > 0 && <Contador n={novidades} />}
    </span>
  )
}

/** As 5 abas no alto, a partir de lg. Aba acesa: texto forte e traço vermelho embaixo. */
export function NavegacaoTopo({ novidades = 0 }: { novidades?: number }) {
  const caminho = usePathname()
  return (
    <nav className="hidden h-full items-stretch lg:flex" aria-label="Seções">
      {SECOES.map((s) => {
        const acesa = ativa(s, caminho)
        const n = s.href === MENSAGENS ? novidades : 0
        return (
          <Link key={s.href} href={s.href} aria-current={acesa ? 'page' : undefined} className="group relative flex items-center rounded-lg px-1">
            <MioloDaAbaNoTopo rotulo={s.rotulo} acesa={acesa} novidades={n} />
            {n > 0 && <span className="sr-only">{novidadesParaLeitor(n)}</span>}
            {acesa && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </Link>
        )
      })}
    </nav>
  )
}

function IconeDaAbaNoCelular({ icone: Icone, acesa, novidades }: { icone: LucideIcon; acesa: boolean; novidades: number }) {
  const { pending } = useLinkStatus()
  return (
    <span className={cn('relative flex items-center justify-center rounded-full px-4 py-1 transition-colors',
      acesa ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
      pending && !acesa && 'bg-muted motion-safe:animate-pulse')}>
      <Icone className="size-5" aria-hidden="true" />
      {novidades > 0 && <Contador n={novidades} className="absolute -top-1 right-1 ring-2 ring-card" />}
    </span>
  )
}

/**
 * A barra de baixo do celular. Fica FORA do <header>: dentro dele o
 * `backdrop-filter` virava o bloco de referência do `position: fixed` e a
 * barra grudava no pé do cabeçalho. Respeita a área segura do iPhone.
 */
export function NavegacaoCelular({ novidades = 0 }: { novidades?: number }) {
  const caminho = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden" aria-label="Seções">
      {SECOES.map((s) => {
        const acesa = ativa(s, caminho)
        const n = s.href === MENSAGENS ? novidades : 0
        return (
          <Link key={s.href} href={s.href} aria-current={acesa ? 'page' : undefined}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-xs active:bg-muted">
            <IconeDaAbaNoCelular icone={s.icone} acesa={acesa} novidades={n} />
            <span className={cn('max-w-full truncate', acesa ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>{s.rotuloCurto}</span>
            {n > 0 && <span className="sr-only">{novidadesParaLeitor(n)}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

type Contagem = 'conversas' | 'avisos'
const GRUPOS_DE_SUB_ABAS: readonly { rotulo: string; abas: readonly { href: string; rotulo: string; contagem?: Contagem }[] }[] = [
  { rotulo: 'Formação', abas: [{ href: '/membro/cursos', rotulo: 'Cursos' }, { href: '/membro/apostilas', rotulo: 'Apostilas' }, { href: '/membro/certificados', rotulo: 'Certificados' }] },
  { rotulo: 'Mensagens', abas: [{ href: '/membro/mensagens', rotulo: 'Conversas', contagem: 'conversas' }, { href: '/membro/avisos', rotulo: 'Avisos', contagem: 'avisos' }] },
]

const LEITOR: Record<Contagem, (n: number) => string> = {
  conversas: (n) => `, ${n} com resposta nova`,
  avisos: (n) => `, ${n} ${n === 1 ? 'novo' : 'novos'}`,
}

function MioloDaSubAba({ rotulo, acesa, n }: { rotulo: string; acesa: boolean; n: number }) {
  const { pending } = useLinkStatus()
  return (
    <span className={cn('inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
      acesa ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground group-hover:text-foreground group-active:bg-card/60',
      pending && !acesa && 'motion-safe:animate-pulse')}>
      {rotulo}{n > 0 && <Contador n={n} />}
    </span>
  )
}

/**
 * Sub-abas de Formação (Cursos · Apostilas · Certificados) e de Mensagens
 * (Conversas · Avisos). Aparecem só nas páginas de lista, acima do título;
 * nas de detalhe (um curso, uma conversa) quem leva de volta é o "‹ voltar".
 */
export function SubAbas({ conversas = 0, avisos = 0 }: { conversas?: number; avisos?: number }) {
  const caminho = usePathname()
  const grupo = GRUPOS_DE_SUB_ABAS.find((g) => g.abas.some((a) => a.href === caminho))
  if (!grupo) return null
  const contagem: Record<Contagem, number> = { conversas, avisos }
  return (
    <nav aria-label={grupo.rotulo} className="mb-5 max-w-full overflow-x-auto">
      {/* Borda no trilho: o cinza do fundo da página e o do trilho são quase iguais. */}
      <div className="inline-flex gap-0.5 rounded-lg border border-border bg-muted p-1">
        {grupo.abas.map((a) => {
          const acesa = a.href === caminho
          const n = a.contagem ? contagem[a.contagem] : 0
          return (
            <Link key={a.href} href={a.href} aria-current={acesa ? 'page' : undefined} className="group rounded-md">
              <MioloDaSubAba rotulo={a.rotulo} acesa={acesa} n={n} />
              {n > 0 && a.contagem && <span className="sr-only">{LEITOR[a.contagem](n)}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
