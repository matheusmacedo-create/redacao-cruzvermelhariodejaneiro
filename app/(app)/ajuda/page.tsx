import Link from 'next/link'
import { ArrowRight, BookOpen, CircleHelp, Compass, Keyboard, LifeBuoy, MessagesSquare, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { AtalhoDaAjuda, BotoesDeBoasVindas, BuscaDaCentral } from '@/components/app/ajuda/central'
import { AncoraDaAjuda } from '@/components/app/ajuda/ancora'
import { PerguntaAberta, TarefaAberta } from '@/components/app/ajuda/blocos'
import { guiasVisiveis, hrefDaAjuda, topicosGerais } from '@/lib/ajuda'
import type { Grupo } from '@/lib/navegacao'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { requireWorkspace } from '@/lib/session'
import { gruposDaPessoa } from './grupos-da-pessoa'

export const metadata = { title: 'Central de ajuda' }

const tecla = 'inline-flex min-w-7 items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-foreground'

/**
 * A Central de ajuda: tudo o que o painel "?" mostra tela a tela, junto e com
 * busca. O conteúdo é o de lib/ajuda, desenhado aqui no servidor (só a busca
 * baixa o texto para o navegador, e só quando alguém busca); as áreas listadas
 * são as que a pessoa pode abrir (a mesma regra do menu). Os tópicos gerais
 * têm âncora — é para cá que a busca aponta (/ajuda#esqueci-a-senha).
 */
export default async function CentralDeAjudaPage() {
  const context = await requireWorkspace({ escola: true })
  const escola = ehEquipeDaEscola(context.role)
  const gerais = topicosGerais(escola)
  const grupos = await gruposDaPessoa(context)

  return (
    <div className="mx-auto max-w-5xl">
      <AncoraDaAjuda />
      <PageHeader
        title="Central de ajuda"
        description="O passo a passo e as perguntas frequentes de cada área que você pode abrir, os atalhos e o que fazer quando a dúvida continua. Em qualquer tela, o botão “?” no alto mostra só a ajuda daquela tela."
      />
      <BuscaDaCentral />

      <section aria-labelledby="secao-comece-por-aqui" className="mt-10">
        <h2 id="secao-comece-por-aqui" className="text-lg font-semibold">Comece por aqui</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Card className="flex flex-col p-5">
            <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" />Boas-vindas e tours</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">O tour de boas-vindas mostra onde fica cada coisa. Cada tela com tour oferece o dela na primeira visita; recomeçar faz todas oferecerem de novo.</p>
            <BotoesDeBoasVindas />
          </Card>
          <Card className="flex flex-col p-5">
            <h3 className="flex items-center gap-2 font-semibold"><Keyboard className="size-4 text-primary" aria-hidden="true" />Atalhos de teclado</h3>
            <dl className="mt-3 flex flex-col gap-3 text-sm">
              <div className="flex items-start gap-3">
                <dt className="flex w-24 shrink-0 flex-wrap gap-1"><kbd className={tecla}>⌘K</kbd><kbd className={tecla}>Ctrl K</kbd></dt>
                <dd className="leading-relaxed text-muted-foreground">Abre a busca: áreas, ações e respostas da ajuda, de qualquer tela.</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="w-24 shrink-0"><kbd className={tecla}>?</kbd></dt>
                <dd className="leading-relaxed text-muted-foreground">Abre e fecha a ajuda da tela, quando você não está digitando num campo.</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="w-24 shrink-0"><kbd className={tecla}>Esc</kbd></dt>
                <dd className="leading-relaxed text-muted-foreground">Fecha a busca, a ajuda e o tour.</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="flex w-24 shrink-0 gap-1"><kbd className={tecla} aria-label="seta para a esquerda">←</kbd><kbd className={tecla} aria-label="seta para a direita">→</kbd></dt>
                <dd className="leading-relaxed text-muted-foreground">No tour, voltam e avançam os passos.</dd>
              </div>
            </dl>
            <AtalhoDaAjuda />
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold"><LifeBuoy className="size-4 text-primary" aria-hidden="true" />Como pedir ajuda</h3>
            <ul className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <li className="flex gap-2.5"><CircleHelp className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>O botão <strong className="font-medium text-foreground">“?”</strong>, no alto de cada tela, mostra a ajuda daquela tela e o tour dela.</span></li>
              <li className="flex gap-2.5"><BookOpen className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>Esta Central junta a ajuda de todas as áreas. A busca (⌘K) também acha as respostas daqui.</span></li>
              {!escola && <li className="flex gap-2.5"><LifeBuoy className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>Algo não funciona? <Link href="/chamados/novo?fila=ti" className="font-medium text-primary hover:underline">Abra um chamado para a TI</Link> contando o que tentou fazer.</span></li>}
              <li className="flex gap-2.5"><MessagesSquare className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>Dúvida sobre o trabalho? Pergunte à equipe no <Link href="/chat" className="font-medium text-primary hover:underline">Chat</Link>.</span></li>
            </ul>
          </Card>
        </div>
      </section>

      <AreasDaCentral grupos={grupos} />

      {gerais.length > 0 && (
        <section aria-labelledby="secao-ajuda-geral" className="mt-12">
          <h2 id="secao-ajuda-geral" className="text-lg font-semibold">Ajuda geral</h2>
          <p className="mt-1 text-sm text-muted-foreground">O que vale em todo o Palácio Virtual, seja qual for a área.</p>
          <nav aria-label="Tópicos da ajuda geral" className="mt-4 flex flex-wrap gap-2">
            {gerais.map((t) => <a key={t.id} href={`#${t.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm hover:bg-muted sm:min-h-9">{t.titulo}</a>)}
          </nav>
          <div className="mt-6 flex max-w-3xl flex-col gap-12">
            {gerais.map((topico) => (
              <section key={topico.id} id={topico.id} aria-labelledby={`secao-${topico.id}`} className="scroll-mt-6">
                <h3 id={`secao-${topico.id}`} className="text-base font-semibold">{topico.titulo}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{topico.resumo}</p>
                {topico.tarefas.length > 0 && (
                  <>
                    <h4 className="mb-3 mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Passo a passo</h4>
                    <div className="flex flex-col gap-3">{topico.tarefas.map((t) => <TarefaAberta key={t.id} tarefa={t} nivel={5} />)}</div>
                  </>
                )}
                {topico.perguntas.length > 0 && (
                  <>
                    <h4 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Perguntas frequentes</h4>
                    <div className="flex flex-col gap-3">{topico.perguntas.map((p) => <PerguntaAberta key={p.id} pergunta={p} nivel={5} />)}</div>
                  </>
                )}
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** As áreas com ajuda escrita que a pessoa pode abrir, agrupadas como no menu. */
function AreasDaCentral({ grupos }: { grupos: Grupo[] }) {
  const lista = guiasVisiveis(grupos)
  const porGrupo = grupos
    .map((grupo) => ({ grupo, itens: lista.filter((x) => x.grupo.id === grupo.id) }))
    .filter((g) => g.itens.length)

  return (
    <section aria-labelledby="secao-ajuda-por-area" className="mt-12">
      <h2 id="secao-ajuda-por-area" className="text-lg font-semibold">Ajuda por área</h2>
      <p className="mt-1 text-sm text-muted-foreground">Só aparecem as áreas que o seu acesso abre.</p>
      {!porGrupo.length && <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Os guias das áreas ainda estão sendo escritos. Enquanto isso, a ajuda geral está logo abaixo.</p>}
      <div className="mt-5 flex flex-col gap-8">
        {porGrupo.map(({ grupo, itens }) => (
          <div key={grupo.id}>
            {/* O grupo sem título no menu é o do dia de cada pessoa (Início, Aprovações…). */}
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{grupo.rotulo ?? 'Meu dia'}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {itens.map(({ area, guia }) => {
                const Icone = area.icone
                const perguntas = guia.perguntas.length
                return (
                  <li key={area.href}>
                    <Link href={hrefDaAjuda(area.href)} className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-xs outline-none transition-colors hover:border-primary/40 hover:bg-primary/[0.02] focus-visible:ring-2 focus-visible:ring-ring/50">
                      <span className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true"><Icone className="size-[18px]" /></span>
                        <span className="min-w-0 flex-1 font-semibold leading-snug">{area.rotulo}</span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none" aria-hidden="true" />
                      </span>
                      <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{guia.paraQueServe}</span>
                      <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-muted-foreground">
                        {guia.tour.length > 0 && <><Compass className="size-3.5" aria-hidden="true" />Tour ·</>}
                        {' '}{perguntas} pergunta{perguntas === 1 ? '' : 's'}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
