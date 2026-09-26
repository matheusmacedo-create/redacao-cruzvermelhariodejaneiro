'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, ChevronDown, Loader2 } from 'lucide-react'
import { useShell } from '@/components/app/app-shell'
import { ACOES_DE_CRIAR, useCriar } from '@/components/app/acoes-de-criar'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * As peças do Início que dizem "isto é o Palácio Virtual da Cruz Vermelha RJ":
 * a abertura com a marca e o mapa das áreas. O resto do Início (meu dia, a
 * semana da comunicação, os indicadores) continua em ./camadas.tsx.
 *
 * Identidade: o vermelho da marca (--primary), a cruz do emblema e a Libre
 * Franklin — as mesmas do menu, do cartaz de envios e da Área do Voluntário.
 * Sem cruz como marca d'água: o emblema aparece uma vez, no lugar dele, e
 * sempre vermelho sobre branco — nunca vazado em branco sobre vermelho.
 *
 * O desenho segue o que as ferramentas de trabalho fazem na página inicial
 * (Asana, Linear, GitHub, Basecamp): o que precisa de você primeiro, números
 * que levam direto à lista, atalhos para começar algo, e o mapa do produto
 * recolhido — ele já está no menu.
 */

/** O emblema, nas mesmas proporções do logo (components/app/sidebar.tsx). */
function Cruz({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden="true">
      <path d="M10 0h10v10h10v10H20v10H10V20H0V10h10z" fill="currentColor" />
    </svg>
  )
}

export type Destaque = { valor: number; rotulo: string; href: string; alerta?: boolean; icone: React.ReactNode }

/**
 * A abertura: a linha da marca com a data, a saudação com o dia em uma frase,
 * os atalhos do "Criar" e quatro números que levam direto ao que é da pessoa.
 */
export function AberturaDoPalacio({ data, saudacao, resumo, destaques, acao }: {
  data: string
  saudacao: string
  resumo: string
  destaques: Destaque[]
  /** Ao lado da data (o "Personalizar o Início"). */
  acao?: React.ReactNode
}) {
  return (
    <header data-ajuda="inicio.resumo" className="flex flex-col gap-5">
      {/* A cruz é SEMPRE vermelha sobre branco (manual da marca): o vermelho da faixa é o filete de baixo. */}
      <div className="flex items-center justify-between gap-3 border-b-2 border-primary pb-2.5">
        <p className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
          <Cruz className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">Palácio Virtual<span className="hidden sm:inline"> · Cruz Vermelha Brasileira — Rio de Janeiro</span></span>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <p className="hidden text-xs font-medium text-muted-foreground sm:block">{data}</p>
          {acao}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-[2.125rem]">{saudacao}</h1>
          <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{resumo}</p>
        </div>
        <AtalhosDeCriar />
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {destaques.map((d) => {
          const aceso = d.alerta && d.valor > 0
          return (
            <li key={d.rotulo}>
              <Link
                href={d.href}
                className={cn(
                  'group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-foreground/20',
                  aceso ? 'border-destructive/40 bg-destructive/[0.03]' : 'border-border',
                )}
              >
                <span className={cn('flex items-center justify-between gap-2 text-xs font-medium', aceso ? 'text-destructive' : 'text-muted-foreground')}>
                  <span className="flex min-w-0 items-start gap-1.5">
                    <span className="shrink-0 [&_svg]:size-4" aria-hidden="true">{aceso ? <AlertTriangle /> : d.icone}</span>
                    <span className="leading-4">{d.rotulo}</span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                </span>
                <span className={cn('text-3xl font-bold leading-none tracking-tight tabular-nums', aceso && 'text-destructive')}>{d.valor}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </header>
  )
}

/**
 * Os mesmos itens do "Criar" do topo (ACOES_DE_CRIAR), à mão na entrada: é
 * por aqui que o dia começa. A equipe da escola não tem o "Criar".
 */
function AtalhosDeCriar() {
  const { equipeDaEscola } = useShell()
  const { executar, pendente, erro } = useCriar()
  if (equipeDaEscola) return null
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Começar agora">
        {ACOES_DE_CRIAR.map((acao, n) => {
          const Icone = acao.icone
          const classe = cn(
            'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60',
            n === 0 ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border bg-card hover:bg-muted',
          )
          const corpo = <><Icone className="size-4" aria-hidden="true" />{acao.rotulo}</>
          return acao.href
            ? <Link key={acao.id} href={acao.href} title={acao.resumo} className={classe}>{corpo}</Link>
            : <button key={acao.id} type="button" title={acao.resumo} disabled={pendente} onClick={() => executar(acao)} className={classe}>{pendente ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Icone className="size-4" aria-hidden="true" />}{acao.rotulo}</button>
        })}
      </div>
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}

/**
 * O Palácio inteiro num quadro: cada grupo do menu com as áreas que a pessoa
 * pode abrir (a mesma regra da sidebar, via useShell). Fica recolhido no fim
 * do Início — o menu já mostra tudo; aberto, é o mapa para quem chega.
 */
export function AreasDoPalacio() {
  const { grupos } = useShell()
  // "Meu dia" (Início, Aprovações) já é esta tela; Administração fica no menu da conta.
  const lista = grupos.filter((g) => g.rotulo && g.id !== 'administracao')
  if (!lista.length) return null
  const total = lista.reduce((n, g) => n + g.areas.filter((a) => !a.foraDoMenu).length, 0)
  return (
    <details data-ajuda="inicio.areas" className="group/areas rounded-xl border border-border bg-card shadow-xs">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background"><Cruz className="size-4 text-primary" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Todas as áreas do Palácio</span>
          <span className="block text-xs text-muted-foreground">{total} áreas em {lista.length} grupos — as mesmas do menu</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/areas:rotate-180" aria-hidden="true" />
      </summary>
      {/* Colunas (e não grade): os grupos têm de 2 a 8 áreas, e em grade o mais longo deixaria buracos nos outros. */}
      <div className="gap-3 border-t border-border p-3 sm:columns-2 sm:p-4 xl:columns-4">
        {lista.map((g) => (
          <Card key={g.id} className="mb-3 flex break-inside-avoid flex-col gap-2 p-3.5 shadow-none">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.rotulo}</p>
            <ul className="-mx-1.5 flex flex-col">
              {g.areas.filter((a) => !a.foraDoMenu).map((a) => {
                const Icone = a.icone
                return (
                  <li key={a.href}>
                    <Link href={a.href} title={a.resumo} className="group flex min-h-10 items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60 sm:min-h-8">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary" aria-hidden="true"><Icone className="size-4" /></span>
                      <span className="min-w-0 flex-1 truncate font-medium">{a.rotulo}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}
      </div>
    </details>
  )
}
