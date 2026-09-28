import Link from 'next/link'
import { ArrowRight, BookOpen, ChevronRight, CircleHelp, Compass, Flame, Inbox, Keyboard, LifeBuoy, MessageSquareHeart, MessagesSquare, Sparkles, ThumbsUp } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { AtalhoDaAjuda, BotoesDeBoasVindas, BuscaDaCentral } from '@/components/app/ajuda/central'
import { AncoraDaAjuda } from '@/components/app/ajuda/ancora'
import { HistoriaNaPratica, PerguntaAberta, TarefaAberta } from '@/components/app/ajuda/blocos'
import { MAIS_PERGUNTADAS, guiasVisiveis, hrefDaAjuda, perguntaDaAjuda, topicosGerais } from '@/lib/ajuda'
import { ROTULO_DO_ESTADO, ROTULO_DO_TIPO, maisUteis, type EstadoDoRetorno, type TipoDeRetorno, type VotoDaPergunta } from '@/lib/ajuda/retornos'
import { createClient } from '@/lib/supabase/server'
import { TODOS_OS_GRUPOS } from '@/lib/navegacao'
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
 * têm âncora — é para cá que a busca aponta (/ajuda#esqueci-a-senha) — e
 * ficam recolhidos: a AncoraDaAjuda abre o tópico da resposta pedida.
 *
 * A ordem (docs/AJUDA.md §11): a busca, as mais perguntadas, a ajuda por
 * área (o que a pessoa mais procura), "Comece por aqui", a ajuda geral e os
 * retornos da própria pessoa.
 */
export default async function CentralDeAjudaPage() {
  const context = await requireWorkspace({ escola: true })
  const escola = ehEquipeDaEscola(context.role)
  const gerais = topicosGerais(escola)
  const grupos = await gruposDaPessoa(context)
  const supabase = await createClient()
  const visiveis = new Set(grupos.flatMap((g) => g.areas.map((a) => a.href)))
  // O beta (docs/AJUDA.md §10): os votos em "Isso ajudou?", os retornos da própria pessoa e, para a administração, quantos esperam resposta.
  // Sem a migração, tudo vem vazio e a Central fica como antes.
  const ehAdmin = context.role === 'admin'
  const [{ data: votos }, { data: meus }, { count: novos }] = await Promise.all([
    supabase.rpc('ajuda_votos_das_perguntas', { p_workspace_id: context.workspace.id, p_dias: 120 }),
    supabase.from('ajuda_retornos').select('id,tipo,caminho,texto,nota,estado,resposta,respondido_em,created_at')
      .eq('workspace_id', context.workspace.id).eq('autor_id', context.user.id).neq('tipo', 'pergunta').order('created_at', { ascending: false }).limit(20),
    ehAdmin
      ? supabase.from('ajuda_retornos').select('id', { count: 'exact', head: true }).eq('workspace_id', context.workspace.id).eq('estado', 'novo').neq('tipo', 'pergunta')
      : Promise.resolve({ count: 0 }),
  ])
  const nomeDaArea = new Map(TODOS_OS_GRUPOS.flatMap((g) => g.areas).map((a) => [a.href, a.rotulo]))
  const maisPerguntadas = maisUteis(((votos ?? []) as VotoDaPergunta[]).filter((v) => v.area && visiveis.has(v.area)), MAIS_PERGUNTADAS.filter((m) => visiveis.has(m.area)), 8)
    .flatMap((m) => {
      const achada = perguntaDaAjuda(m.area, m.id)
      return achada ? [{ ...achada, area: nomeDaArea.get(m.area) ?? m.area, sim: m.sim }] : []
    })
  type MeuRetorno = { id: string; tipo: TipoDeRetorno; caminho: string; texto: string | null; nota: number | null; estado: EstadoDoRetorno; resposta: string | null; respondido_em: string | null; created_at: string }
  const meusRetornos = (meus ?? []) as MeuRetorno[]
  const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

  return (
    <div className="mx-auto max-w-5xl">
      <AncoraDaAjuda />
      <PageHeader
        title="Central de ajuda"
        description="O passo a passo e as perguntas frequentes de cada área que você pode abrir, os atalhos e o que fazer quando a dúvida continua. Em qualquer tela, o botão “?” no alto mostra só a ajuda daquela tela."
      />
      <BuscaDaCentral />

      {ehAdmin && (
        <Link href="/ajuda/retornos" className="mt-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 text-sm hover:bg-primary/[0.07]" data-atalho-retornos>
          <Inbox className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block font-semibold">Retornos do beta</span><span className="block text-muted-foreground">{novos ? `${novos} ${novos === 1 ? 'retorno novo espera' : 'retornos novos esperam'} leitura` : 'Opiniões, dúvidas, problemas e sugestões da equipe, por tela'}</span></span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      {maisPerguntadas.length > 0 && (
        <section aria-labelledby="secao-mais-perguntadas" className="mt-10">
          <h2 id="secao-mais-perguntadas" className="flex items-center gap-2 text-lg font-semibold"><Flame className="size-5 text-primary" aria-hidden="true" />Perguntas mais frequentes</h2>
          <p className="mt-1 text-sm text-muted-foreground">As dúvidas que mais aparecem. Sobem para o topo as que a equipe marca como úteis em “Isso ajudou?”.</p>
          <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {maisPerguntadas.map((m, i) => (
              <li key={m.href}>
                <Link href={m.href} className="flex min-h-14 items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-xs hover:border-primary/40">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/[0.08] text-xs font-semibold tabular-nums text-primary" aria-hidden="true">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{m.pergunta}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{m.area}{m.sim > 0 && <span className="inline-flex items-center gap-1"><ThumbsUp className="size-3" aria-hidden="true" />{m.sim} {m.sim === 1 ? 'achou útil' : 'acharam útil'}</span>}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <AreasDaCentral grupos={grupos} />

      <section aria-labelledby="secao-comece-por-aqui" className="mt-12">
        <h2 id="secao-comece-por-aqui" className="text-lg font-semibold">Comece por aqui</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
              <li className="flex gap-2.5"><CircleHelp className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>O botão <strong className="font-medium text-foreground">“?”</strong>, no alto de cada tela, mostra a ajuda daquela tela e o tour dela. No fim, “Conte para a equipe” manda uma dúvida, um problema ou uma ideia, e a resposta volta no sino.</span></li>
              <li className="flex gap-2.5"><MessageSquareHeart className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>Estamos em <strong className="font-medium text-foreground">beta</strong>: o botão “Beta”, no alto, é o mesmo formulário, para qualquer tela. No celular, que não tem o botão, use o “?”.</span></li>
              <li className="flex gap-2.5"><BookOpen className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>Esta Central junta a ajuda de todas as áreas. A busca (⌘K) também acha as respostas daqui.</span></li>
              {!escola && <li className="flex gap-2.5"><LifeBuoy className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>Algo não funciona? <Link href="/chamados/novo?fila=ti" className="font-medium text-primary hover:underline">Abra um chamado para a TI</Link> contando o que tentou fazer.</span></li>}
              <li className="flex gap-2.5"><MessagesSquare className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" /><span>Dúvida sobre o trabalho? Pergunte à equipe no <Link href="/chat" className="font-medium text-primary hover:underline">Chat</Link>.</span></li>
            </ul>
          </Card>
        </div>
      </section>

      {gerais.length > 0 && (
        <section aria-labelledby="secao-ajuda-geral" className="mt-12">
          <h2 id="secao-ajuda-geral" className="text-lg font-semibold">Ajuda geral</h2>
          <p className="mt-1 text-sm text-muted-foreground">O que vale em todo o Palácio Virtual, seja qual for a área.</p>
          <nav aria-label="Tópicos da ajuda geral" className="mt-4 flex flex-wrap gap-2">
            {gerais.map((t) => <a key={t.id} href={`#${t.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm hover:bg-muted sm:min-h-9">{t.titulo}</a>)}
          </nav>
          {/* Um tópico por vez: recolhidos, com o resumo à vista. O link para uma resposta (#id) abre o tópico dela (AncoraDaAjuda). */}
          <div className="mt-6 flex max-w-3xl flex-col gap-3">
            {gerais.map((topico) => (
              <details key={topico.id} id={topico.id} className="group scroll-mt-6 rounded-xl border border-border bg-card shadow-xs open:bg-muted/10" data-topico-geral>
                <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 rounded-xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold">{topico.titulo}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{topico.resumo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{[topico.tarefas.length ? `${topico.tarefas.length} passo${topico.tarefas.length === 1 ? '' : 's'} a passo` : null, topico.perguntas.length ? `${topico.perguntas.length} pergunta${topico.perguntas.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</p>
                  </span>
                </summary>
                <div className="border-t border-border px-4 pb-5 pt-4 sm:px-5">
                  {(topico.naPratica ?? []).length > 0 && <div className="flex flex-col gap-4">{topico.naPratica!.map((h) => <HistoriaNaPratica key={h.titulo} historia={h} />)}</div>}
                  {topico.tarefas.length > 0 && (
                    <>
                      <h4 className="mb-3 mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Passo a passo</h4>
                      <div className="flex flex-col gap-3">{topico.tarefas.map((t) => <TarefaAberta key={t.id} tarefa={t} nivel={5} />)}</div>
                    </>
                  )}
                  {topico.perguntas.length > 0 && (
                    <>
                      <h4 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Perguntas frequentes</h4>
                      <div className="flex flex-col gap-3">{topico.perguntas.map((p) => <PerguntaAberta key={p.id} pergunta={p} nivel={5} area="geral" />)}</div>
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section id="meus-retornos" aria-labelledby="secao-meus-retornos" className="mt-12 scroll-mt-6">
        <h2 id="secao-meus-retornos" className="flex items-center gap-2 text-lg font-semibold"><MessageSquareHeart className="size-5 text-primary" aria-hidden="true" />Seus retornos do beta</h2>
        <p className="mt-1 text-sm text-muted-foreground">O que você mandou pelo “Beta” e por “Conte para a equipe”, e o que a equipe respondeu.</p>
        {meusRetornos.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nada ainda. Achou algo estranho ou tem uma ideia? Use o “Beta” no alto de qualquer tela.</p>
        ) : (
          <ul className="mt-4 flex max-w-3xl flex-col gap-3">
            {meusRetornos.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm shadow-xs">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{ROTULO_DO_TIPO[r.tipo]}</span>
                  <span>· {quando(r.created_at)}</span>
                  <span className="break-all">· {r.caminho}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ${r.estado === 'resolvido' ? 'bg-success/15 text-success' : r.estado === 'em_analise' ? 'bg-warning/15 text-warning-foreground' : 'bg-muted text-muted-foreground'}`}>{ROTULO_DO_ESTADO[r.estado]}</span>
                </p>
                {(r.texto || r.nota) && <p className="mt-2 whitespace-pre-wrap leading-relaxed">{r.nota ? `Nota ${r.nota} de 5. ` : ''}{r.texto}</p>}
                {r.resposta && (
                  <p className="mt-3 rounded-lg bg-primary/[0.05] px-3 py-2 leading-relaxed"><span className="font-medium">Resposta da equipe{r.respondido_em ? ` (${quando(r.respondido_em)})` : ''}: </span>{r.resposta}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
