import Link from 'next/link'
import { BookOpen, CircleHelp, Keyboard, LifeBuoy, MessagesSquare, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { AreasDaCentral, AtalhoDaAjuda, BotoesDeBoasVindas, BuscaDaCentral } from '@/components/app/ajuda/central'
import { PerguntaAberta, TarefaAberta } from '@/components/app/ajuda/blocos'
import { TOPICOS_GERAIS } from '@/lib/ajuda'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { requireWorkspace } from '@/lib/session'

export const metadata = { title: 'Central de ajuda' }

const tecla = 'inline-flex min-w-7 items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-foreground'

/**
 * A Central de ajuda: tudo o que o painel "?" mostra tela a tela, junto e com
 * busca. O conteúdo é o de lib/ajuda; as áreas listadas são as que a pessoa
 * pode abrir (a mesma regra do menu). Os tópicos gerais têm âncora — é para
 * cá que a busca aponta (/ajuda#esqueci-a-senha).
 */
export default async function CentralDeAjudaPage() {
  const context = await requireWorkspace({ escola: true })
  const escola = ehEquipeDaEscola(context.role)

  return (
    <div className="mx-auto max-w-5xl">
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

      <AreasDaCentral />

      {TOPICOS_GERAIS.length > 0 && (
        <section aria-labelledby="secao-ajuda-geral" className="mt-12">
          <h2 id="secao-ajuda-geral" className="text-lg font-semibold">Ajuda geral</h2>
          <p className="mt-1 text-sm text-muted-foreground">O que vale em toda a Redação, seja qual for a área.</p>
          <nav aria-label="Tópicos da ajuda geral" className="mt-4 flex flex-wrap gap-2">
            {TOPICOS_GERAIS.map((t) => <a key={t.id} href={`#${t.id}`} className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm hover:bg-muted">{t.titulo}</a>)}
          </nav>
          <div className="mt-6 flex max-w-3xl flex-col gap-12">
            {TOPICOS_GERAIS.map((topico) => (
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
