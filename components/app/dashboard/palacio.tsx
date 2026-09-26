'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useShell } from '@/components/app/app-shell'
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
 */

/** O emblema, nas mesmas proporções do logo (components/app/sidebar.tsx). */
function Cruz({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden="true">
      <path d="M10 0h10v10h10v10H20v10H10V20H0V10h10z" fill="currentColor" />
    </svg>
  )
}

export type Destaque = { valor: number; rotulo: string; href: string; alerta?: boolean }

/**
 * A abertura: faixa vermelha com o nome do sistema, a data, a saudação, o
 * resumo do dia em uma frase e três números que levam direto ao que é da pessoa.
 */
export function AberturaDoPalacio({ data, saudacao, resumo, destaques, acoes }: {
  data: string
  saudacao: string
  resumo: string
  destaques: Destaque[]
  acoes: React.ReactNode
}) {
  return (
    <Card data-ajuda="inicio.resumo" className="overflow-hidden p-0">
      {/* A cruz é SEMPRE vermelha sobre branco (manual da marca): o vermelho da faixa é o filete de baixo. */}
      <div className="flex items-center gap-2.5 border-b-2 border-primary bg-card px-5 py-2.5 sm:px-6">
        <Cruz className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
          Palácio Virtual<span className="hidden sm:inline"> · Cruz Vermelha Brasileira — Rio de Janeiro</span>
        </p>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{data}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-balance">{saudacao}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{resumo}</p>
          <div className="mt-4 flex flex-wrap gap-2">{acoes}</div>
        </div>
        <ul className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3 lg:w-[26rem]">
          {destaques.map((d) => (
            <li key={d.rotulo}>
              <Link
                href={d.href}
                className={cn(
                  'flex h-full flex-col rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50',
                  d.alerta && d.valor > 0 ? 'border-destructive/50 bg-destructive/[0.04]' : 'border-border',
                )}
              >
                <span className={cn('text-2xl font-bold tabular-nums leading-none', d.alerta && d.valor > 0 && 'text-destructive')}>{d.valor}</span>
                <span className="mt-1.5 text-xs leading-snug text-muted-foreground">{d.rotulo}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

/**
 * O Palácio inteiro num quadro: cada grupo do menu com as áreas que a pessoa
 * pode abrir (a mesma regra da sidebar, via useShell). É o que mostra o
 * tamanho do sistema — comunicação, expediente, escola, pessoas — e leva a
 * qualquer área em um clique, com o resumo dela no título do link.
 */
export function AreasDoPalacio() {
  const { grupos } = useShell()
  // "Meu dia" (Início, Aprovações) já é esta tela; Administração fica no menu da conta.
  const lista = grupos.filter((g) => g.rotulo && g.id !== 'administracao')
  if (!lista.length) return null
  // Colunas (e não grade): os grupos têm de 2 a 8 áreas, e em grade o mais longo deixaria buracos nos outros.
  return (
    <div data-ajuda="inicio.areas" className="gap-3 sm:columns-2 xl:columns-4">
      {lista.map((g) => (
        <Card key={g.id} className="mb-3 flex break-inside-avoid flex-col gap-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.rotulo}</p>
          <ul className="-mx-1.5 flex flex-col">
            {g.areas.filter((a) => !a.foraDoMenu).map((a) => {
              const Icone = a.icone
              return (
                <li key={a.href}>
                  <Link href={a.href} title={a.resumo} className="group flex min-h-10 items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60 sm:min-h-8">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/[0.08] text-primary" aria-hidden="true"><Icone className="size-4" /></span>
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
  )
}
