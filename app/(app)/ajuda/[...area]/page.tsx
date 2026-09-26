import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight, CircleHelp, Compass } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PerguntaAberta, TarefaAberta } from '@/components/app/ajuda/blocos'
import { AncoraDaAjuda } from '@/components/app/ajuda/ancora'
import { guiaDaArea, hrefDaAjuda } from '@/lib/ajuda'
import { TODOS_OS_GRUPOS } from '@/lib/navegacao'
import { requireWorkspace } from '@/lib/session'
import { cn } from '@/lib/utils'
import { gruposDaPessoa } from '../grupos-da-pessoa'

type Props = { params: Promise<{ area: string[] }> }

// Os endereços das áreas são minúsculas e hífen: o que vier diferente não casa com nenhuma e cai no notFound.
const hrefDe = (segmentos: string[]) => `/${segmentos.join('/')}`

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { area } = await params
  const href = hrefDe(area)
  const achada = TODOS_OS_GRUPOS.flatMap((g) => g.areas).find((a) => a.href === href)
  return { title: achada && guiaDaArea(href) ? `Ajuda: ${achada.rotulo}` : 'Central de ajuda' }
}

// Os links com cara de botão são <Link> com as classes do botão, e não <Button render>:
// este põe role="button" no <a>, e o leitor de tela anunciaria botão para o que navega.
const botao = (variant: 'default' | 'outline', className?: string) => cn(buttonVariants({ variant, size: 'lg' }), 'h-11 sm:h-10', className)

/**
 * A ajuda completa de uma área: para que serve, quem usa, o tour, o passo a
 * passo e as perguntas — tudo aberto e com âncora (/ajuda/pautas#criar-pauta),
 * porque é para cá que o painel "?" e a busca apontam.
 */
export default async function AjudaDaAreaPage({ params }: Props) {
  const context = await requireWorkspace({ escola: true })
  const { area: segmentos } = await params
  const href = hrefDe(segmentos)
  const grupos = await gruposDaPessoa(context)
  const achado = grupos.flatMap((grupo) => grupo.areas.map((area) => ({ grupo, area }))).find((x) => x.area.href === href)
  const guia = achado ? guiaDaArea(href) : null
  if (!achado || !guia) notFound()

  const { grupo, area } = achado
  const Icone = area.icone
  const visiveis = new Set(grupos.flatMap((g) => g.areas.map((a) => a.href)))
  const relacionadas = (guia.relacionadas ?? [])
    .filter((r) => visiveis.has(r) && guiaDaArea(r))
    .map((r) => grupos.flatMap((g) => g.areas).find((a) => a.href === r)!)
  const telas = (guia.telas ?? []).filter((t) => t.tour.length > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <AncoraDaAjuda />
      <PageHeader
        title={area.rotulo}
        description={guia.paraQueServe}
        breadcrumbs={[{ label: 'Central de ajuda', href: '/ajuda' }, { label: grupo.rotulo ? `${grupo.rotulo} · ${area.rotulo}` : area.rotulo }]}
        actions={
          <>
            <Link href={area.href} className={botao('outline')}>
              Abrir {area.rotulo}<ArrowRight aria-hidden="true" />
            </Link>
            {guia.tour.length > 0 && (
              <Link href={`${area.href}?tour=1`} className={botao('default')}>
                <Compass aria-hidden="true" />Fazer o tour
              </Link>
            )}
          </>
        }
      />

      <div className="-mt-2 mb-8 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true"><Icone className="size-5" /></span>
        <div className="min-w-0 text-sm leading-relaxed">
          {guia.quemUsa
            ? <p><span className="font-medium">Quem usa: </span><span className="text-muted-foreground">{guia.quemUsa}</span></p>
            : <p className="text-muted-foreground">{area.resumo}.</p>}
          {guia.tour.length > 0 && <p className="mt-1 text-muted-foreground">O tour abre a tela de {area.rotulo} e mostra, em balões, onde fica cada coisa.</p>}
        </div>
      </div>

      {(guia.tarefas.length > 0 || guia.perguntas.length > 0) && (
        <nav aria-label="Nesta página" className="mb-10">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Nesta página</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {guia.tarefas.map((t) => <li key={t.id}><a href={`#${t.id}`} className="text-primary hover:underline">{t.titulo}</a></li>)}
            {guia.perguntas.length > 0 && <li><a href="#secao-perguntas" className="text-primary hover:underline">Perguntas frequentes ({guia.perguntas.length})</a></li>}
          </ul>
        </nav>
      )}

      {guia.tarefas.length > 0 && (
        <section aria-labelledby="secao-passo-a-passo" className="mb-12">
          <h2 id="secao-passo-a-passo" className="mb-4 text-lg font-semibold">Passo a passo</h2>
          <div className="flex flex-col gap-3">{guia.tarefas.map((t) => <TarefaAberta key={t.id} tarefa={t} />)}</div>
        </section>
      )}

      {guia.perguntas.length > 0 && (
        <section id="secao-perguntas" aria-labelledby="secao-perguntas-titulo" className="mb-12 scroll-mt-6">
          <h2 id="secao-perguntas-titulo" className="mb-4 text-lg font-semibold">Perguntas frequentes</h2>
          <div className="flex flex-col gap-3">{guia.perguntas.map((p) => <PerguntaAberta key={p.id} pergunta={p} />)}</div>
        </section>
      )}

      {telas.length > 0 && (
        <section aria-labelledby="secao-telas" className="mb-12">
          <h2 id="secao-telas" className="mb-1 text-lg font-semibold">Outras telas com tour</h2>
          <p className="mb-4 text-sm text-muted-foreground">Telas dentro de {area.rotulo} que têm o próprio tour.</p>
          <ul className="flex flex-col gap-2">
            {telas.map((tela) => {
              // Tela com endereço fixo abre direto no tour; a de um item (uma pauta, um chamado) precisa do item aberto.
              const fixa = !tela.caminho.includes('[')
              return (
                <li key={tela.caminho}>
                  <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{tela.rotulo}</p>
                      {!fixa && <p className="mt-0.5 text-sm text-muted-foreground">Com essa tela aberta, toque em “?” no alto e depois em “Fazer o tour desta tela”.</p>}
                    </div>
                    {fixa && (
                      <Link href={`${tela.caminho}?tour=1`} className={botao('outline', 'self-start sm:self-auto')}>
                        <Compass aria-hidden="true" />Fazer o tour
                      </Link>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {relacionadas.length > 0 && (
        <section aria-labelledby="secao-relacionadas" className="mb-12">
          <h2 id="secao-relacionadas" className="mb-4 text-lg font-semibold">Anda junto com</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {relacionadas.map((r) => {
              const IconeDaRelacionada = r.icone
              return (
                <li key={r.href}>
                  <Link href={hrefDaAjuda(r.href)} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-xs hover:border-primary/40">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true"><IconeDaRelacionada className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block font-medium">{r.rotulo}</span><span className="block truncate text-xs text-muted-foreground">{r.resumo}</span></span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <p className="flex items-start gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Não achou? Volte à <Link href="/ajuda" className="font-medium text-primary hover:underline">Central de ajuda</Link> e use a busca, ou toque em “?” dentro de {area.rotulo}.</span>
      </p>
    </div>
  )
}
