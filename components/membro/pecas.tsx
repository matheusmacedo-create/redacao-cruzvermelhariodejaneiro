import Link from 'next/link'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, Info, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validadeLegivel, type TomDaValidade } from '@/lib/membro/regras'

/**
 * As peças que todas as telas da área do voluntário repetem: cabeçalho de
 * página, seção, estado vazio, selo, recado e link externo. Sem 'use client'
 * e sem hooks, para servir tanto a páginas do servidor quanto a componentes
 * do cliente. Um produto só: mudar aqui muda em todas as telas.
 */

/**
 * O topo de cada página: um H1 por tela. `voltar` é o "‹ Mensagens" das
 * telas de detalhe; `acao` fica à direita a partir de sm e embaixo no
 * celular; `children` entra sob a descrição (selos, "Cadastro 75% completo").
 */
export function CabecalhoDaPagina({ titulo, descricao, acao, voltar, sobretitulo, idDoTitulo, children }: {
  titulo: React.ReactNode; descricao?: React.ReactNode; acao?: React.ReactNode; voltar?: { href: string; rotulo: string }
  sobretitulo?: React.ReactNode; idDoTitulo?: string; children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      {voltar && (
        <Link href={voltar.href} className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />{voltar.rotulo}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {sobretitulo && <p className="mb-0.5 text-sm text-muted-foreground">{sobretitulo}</p>}
          <h1 id={idDoTitulo} className="text-2xl font-bold tracking-tight">{titulo}</h1>
          {descricao && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{descricao}</p>}
          {children && <div className="mt-2">{children}</div>}
        </div>
        {acao && <div className="flex shrink-0 flex-wrap gap-2">{acao}</div>}
      </div>
    </div>
  )
}

/**
 * Uma seção da página: H2 (`text-base`), ícone neutro opcional e "Ver todos".
 * A seção não é um cartão: o conteúdo decide se vai num. Com `id`, a seção
 * leva o nome do próprio título para o leitor de tela.
 */
export function Secao({ titulo, icone: Icone, verTodos, id, acao, className, children }: {
  titulo: React.ReactNode; icone?: LucideIcon; verTodos?: string | { href: string; rotulo: string }; id?: string
  acao?: React.ReactNode; className?: string; children?: React.ReactNode
}) {
  const ver = typeof verTodos === 'string' ? { href: verTodos, rotulo: 'Ver todos' } : verTodos
  const idDoTitulo = id ? `${id}-titulo` : undefined
  return (
    <section id={id} aria-labelledby={idDoTitulo} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={idDoTitulo} className="flex min-w-0 items-center gap-2 text-base font-semibold">
          {Icone && <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}{titulo}
        </h2>
        {(ver || acao) && (
          <div className="flex shrink-0 items-center gap-2">
            {acao}
            {ver && (
              <Link href={ver.href} className="-my-2 -mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
                {ver.rotulo}{typeof titulo === 'string' && <span className="sr-only">: {titulo}</span>}<ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

/** Lista vazia nunca fica muda: diz o que é e qual o próximo passo. */
export function EstadoVazio({ icone: Icone, titulo, texto, acao, className, ...resto }: {
  icone: LucideIcon; titulo: React.ReactNode; texto?: React.ReactNode; acao?: React.ReactNode
} & Omit<React.ComponentPropsWithRef<'div'>, 'title' | 'children'>) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-card p-8 text-center', className)} {...resto}>
      <Icone className="size-8 text-muted-foreground/70" aria-hidden="true" />
      <p className="font-semibold">{titulo}</p>
      {texto && <p className="max-w-prose text-sm text-muted-foreground">{texto}</p>}
      {acao && <div className="mt-2 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  )
}

export type TomDoSelo = 'neutro' | 'destaque' | 'sucesso' | 'aviso' | 'perigo'

// Vermelho sólido só no `destaque` (o que é novo). Erro usa o vermelho escuro
// de escopo (`--destructive` do contêiner da área), nunca o da marca.
const TONS: Record<TomDoSelo, { selo: string; icone: string }> = {
  neutro: { selo: 'bg-muted text-muted-foreground', icone: '' },
  destaque: { selo: 'bg-primary text-primary-foreground', icone: '' },
  sucesso: { selo: 'bg-success/10 text-(--success-texto)', icone: 'text-success' },
  aviso: { selo: 'bg-warning/15 text-warning-foreground', icone: '' },
  perigo: { selo: 'bg-destructive/10 text-destructive', icone: '' },
}

/** Selo de estado: sempre ícone e texto, nunca só cor. */
export function Selo({ tom = 'neutro', icone: Icone, children, className }: { tom?: TomDoSelo; icone: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', TONS[tom].selo, className)}>
      <Icone className={cn('size-3.5 shrink-0', TONS[tom].icone)} aria-hidden="true" />{children}
    </span>
  )
}

const ICONE_DA_VALIDADE: Record<TomDaValidade, LucideIcon> = { sucesso: CheckCircle2, aviso: Clock, perigo: TriangleAlert }

/**
 * "Vale até 29/10/2026", "Vence em 34 dias" ou "Venceu em 18/05/2026". A
 * mesma regra no Início e em Certificados. Sem validade, não mostra nada.
 */
export function SeloDeValidade({ validoAte, hoje, className }: { validoAte: string | null | undefined; hoje: string; className?: string }) {
  const v = validadeLegivel(validoAte, hoje)
  if (!v) return null
  return <Selo tom={v.tom} icone={ICONE_DA_VALIDADE[v.tom]} className={cn('whitespace-nowrap', className)}>{v.texto}</Selo>
}

export type TipoDoRecado = 'erro' | 'sucesso' | 'aviso' | 'info'

const RECADOS: Record<TipoDoRecado, { icone: LucideIcon; caixa: string; corDoIcone: string }> = {
  erro: { icone: XCircle, caixa: 'border-destructive/30 bg-destructive/5 text-destructive', corDoIcone: '' },
  sucesso: { icone: CheckCircle2, caixa: 'border-success/30 bg-success/10 text-(--success-texto)', corDoIcone: 'text-success' },
  aviso: { icone: TriangleAlert, caixa: 'border-warning/50 bg-warning/15 text-warning-foreground', corDoIcone: '' },
  info: { icone: Info, caixa: 'border-border bg-card text-foreground', corDoIcone: 'text-muted-foreground' },
}

/**
 * Faixa de recado com ícone. Erro é `role="alert"` (o leitor de tela
 * interrompe); o resto, `role="status"`. `acao` vai à direita, e desce no
 * celular se não couber.
 */
export function Recado({ tipo, titulo, acao, children, className, ...resto }: {
  tipo: TipoDoRecado; titulo?: React.ReactNode; acao?: React.ReactNode; children?: React.ReactNode
} & Omit<React.ComponentPropsWithRef<'div'>, 'title' | 'role' | 'children'>) {
  const { icone: Icone, caixa, corDoIcone } = RECADOS[tipo]
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border p-3 text-sm sm:p-4', caixa, className)} {...resto}>
      <Icone className={cn('mt-0.5 size-4 shrink-0', corDoIcone)} aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-48">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children}
      </div>
      {acao && <div className="flex shrink-0 flex-wrap items-center gap-2">{acao}</div>}
    </div>
  )
}

/**
 * Link que abre em nova aba, avisando: ícone e "(abre em nova aba)" para o
 * leitor de tela. Sem `className`, é um link de texto; com `className`
 * (ex.: `botaoSecundario`), o estilo passado substitui o de link.
 */
export function LinkExterno({ href, children, className, ...resto }: { href: string } & Omit<React.ComponentPropsWithRef<'a'>, 'href' | 'target' | 'rel'>) {
  return (
    <a {...resto} href={href} target="_blank" rel="noopener noreferrer" className={className ?? 'inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 hover:no-underline'}>
      {children}<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span>
    </a>
  )
}
