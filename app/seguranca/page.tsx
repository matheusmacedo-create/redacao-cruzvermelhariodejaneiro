import Link from 'next/link'
import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight, BellRing, Bot, CircleCheck, Code, DatabaseBackup, DoorClosed, KeyRound, Lock, LogIn, NotebookPen, Scale, ScrollText,
  ShieldBan, Smartphone,
} from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { Ouvir } from '@/components/ajuda/ouvir'
import { CartaoDoVideo } from '@/components/ajuda/cartao-do-video'
import { BotaoDeImprimir } from '@/components/comecar/partes'
import { textoDaParte, type ParteDoGuia } from '@/lib/ajuda/comecar'
import {
  CODIGO_ABERTO, CONSTRUIDO, EM_POUCAS_PALAVRAS, GOVERNANCA, IA_NO_PALACIO, NAO_FAZ_TUDO, PERGUNTAS_DA_SEGURANCA, POR_QUE, POR_QUE_EXISTE, QUEM_VE, SE_DESCONFIAR,
  TRANCAS, TRANSPARENCIA, VIDEOS_DA_SEGURANCA, textoDaListaDaSeguranca, textoDasPerguntas, textoDoNaoFazTudo, type IconeDaSeguranca,
  type ItemDaSeguranca,
} from '@/lib/ajuda/seguranca'
import { videoDaAjuda } from '@/lib/ajuda/videos'
import { textoCorrido } from '@/lib/ajuda/ouvir'
import { DOMINIO_DO_PALACIO } from '@/lib/dominio'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { obterWorkspace } from '@/lib/session'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Segurança do Palácio — Palácio Virtual',
  description: 'Por que o Palácio Virtual da Cruz Vermelha RJ existe, como ele protege os dados da filial e das pessoas, e como é construído, com o Claude.',
}

const ICONES: Record<IconeDaSeguranca, LucideIcon> = {
  chave: KeyRound, porteiro: DoorClosed, bloqueio: ShieldBan, aviso: BellRing, livro: NotebookPen, cadeado: Lock, celular: Smartphone,
  copia: DatabaseBackup, projeto: ScrollText, mercado: Scale, anthropic: Bot,
}

// O mesmo tamanho do guia para começar (app/comecar/page.tsx): letra de 18 a 20 px e alvos de toque a partir de 56 px.
const tituloDaParte = 'text-2xl font-bold leading-tight tracking-tight sm:text-3xl'
const texto = 'text-lg leading-relaxed sm:text-xl'
const botaoPrincipal = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-ring/40'
const botaoSecundario = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-lg font-semibold text-foreground outline-none hover:border-primary/50 focus-visible:ring-4 focus-visible:ring-ring/40'
const ouvirGrande = 'min-h-12 px-4 text-base [&_svg]:size-5 sm:min-h-12'

/**
 * A segurança do Palácio explicada com calma (docs/AJUDA.md §18): uma página aberta, sem login, como o guia para
 * começar. O texto mora em lib/ajuda/seguranca.ts, com o apoio de cada frase na §18. Chegam até aqui a tela de
 * entrada, o guia para começar, a Central de ajuda e a ajuda geral ("Segurança e privacidade").
 *
 * A trilha pública e o portal da transparência só aparecem para quem está logado: estão em lançamento oculto.
 */
export default async function SegurancaPage() {
  const context = await obterWorkspace({ escola: true }).catch(() => null)
  const escola = context ? ehEquipeDaEscola(context.role) : false
  const partes: { id: string; titulo: string }[] = [
    POR_QUE_EXISTE, EM_POUCAS_PALAVRAS, POR_QUE, TRANCAS, QUEM_VE, CONSTRUIDO, NAO_FAZ_TUDO, GOVERNANCA, ...(context ? [TRANSPARENCIA] : []), IA_NO_PALACIO,
    { id: 'perguntas', titulo: 'Perguntas que a equipe faz' }, SE_DESCONFIAR,
  ]
  // Os vídeos curtos (§18), só os já gravados; o da transparência, só com login, como a parte dele.
  const videos = VIDEOS_DA_SEGURANCA.filter((v) => (!v.soComLogin || context) && videoDaAjuda(v.id))

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 print:gap-8 print:pt-0">
        <header className="flex flex-col gap-5">
          <BrandMark selo className="w-60 items-start sm:w-72" />
          <div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Segurança do Palácio</h1>
            <p className={cn(texto, 'mt-3 text-muted-foreground')}>Por que o Palácio existe, como ele protege os seus dados e como é construído, explicado com calma. Em cada parte, o botão “Ouvir” lê o texto em voz alta.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row print:hidden">
            {context
              ? <Link href={escola ? '/escola' : '/dashboard'} className={botaoPrincipal}>Ir para o Palácio<ArrowRight className="size-5" aria-hidden="true" /></Link>
              : <Link href="/" className={botaoPrincipal}><LogIn className="size-5" aria-hidden="true" />Entrar no Palácio</Link>}
            <BotaoDeImprimir rotulo="Imprimir esta página" />
          </div>
          <nav aria-label="Nesta página" className="rounded-2xl border-2 border-border bg-card p-5 print:hidden">
            <p className="text-lg font-semibold">Nesta página</p>
            <ol className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {partes.map((p, i) => (
                <li key={p.id}>
                  <a href={`#${p.id}`} className="inline-flex min-h-11 items-center gap-2 text-lg text-primary underline-offset-4 hover:underline">
                    <span className="text-base tabular-nums text-muted-foreground" aria-hidden="true">{i + 1}.</span>{p.titulo}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {videos.length > 0 && (
            <section aria-labelledby="titulo-videos" className="flex flex-col gap-4 print:hidden" data-seguranca-videos>
              <h2 id="titulo-videos" className="text-xl font-bold sm:text-2xl">Prefere ver em vídeo?</h2>
              <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {videos.map((v, i) => <li key={v.id}><CartaoDoVideo id={v.id} numero={i + 1} onde="Segurança" grande /></li>)}
              </ol>
            </section>
          )}
        </header>

        <Parte parte={POR_QUE_EXISTE}>
          {POR_QUE_EXISTE.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
        </Parte>

        <Parte parte={EM_POUCAS_PALAVRAS}>
          <ul className="flex flex-col gap-4" data-seguranca-resumo>
            {EM_POUCAS_PALAVRAS.frases.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <CircleCheck className="mt-1 size-6 shrink-0 text-success" aria-hidden="true" />
                <span className={texto}>{f}</span>
              </li>
            ))}
          </ul>
        </Parte>

        <Parte parte={POR_QUE}>
          {POR_QUE.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
        </Parte>

        <Parte parte={TRANCAS} ouvir={textoDaListaDaSeguranca(TRANCAS)}>
          {TRANCAS.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-seguranca-trancas>
            {TRANCAS.itens.map((i) => <Cartao key={i.id} item={i} />)}
          </ul>
        </Parte>

        <Parte parte={QUEM_VE} ouvir={textoDaListaDaSeguranca(QUEM_VE)}>
          {QUEM_VE.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
          <dl className="flex flex-col divide-y-2 divide-border rounded-2xl border-2 border-border bg-card" data-seguranca-quem-ve>
            {QUEM_VE.itens.map((i) => (
              <div key={i.id} className="flex flex-col gap-1 px-5 py-4 print:break-inside-avoid" data-item={i.id}>
                <dt className="text-xl font-bold">{i.titulo}</dt>
                <dd className={texto}>{i.texto}</dd>
              </div>
            ))}
          </dl>
        </Parte>

        <Parte parte={CONSTRUIDO}>
          {CONSTRUIDO.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
        </Parte>

        <Parte parte={NAO_FAZ_TUDO} ouvir={textoDoNaoFazTudo()}>
          {NAO_FAZ_TUDO.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
          <ul className="flex flex-col gap-4" data-seguranca-regras>
            {NAO_FAZ_TUDO.itens.map((i) => <Cartao key={i.id} item={i} />)}
          </ul>
          {NAO_FAZ_TUDO.exemplos.map((e) => (
            <div key={e.titulo} className="flex flex-col gap-3 rounded-2xl border-2 border-primary/30 bg-primary/[0.04] p-5 print:break-inside-avoid" data-seguranca-exemplo>
              <p className="text-xl font-bold">{e.titulo}</p>
              {e.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
            </div>
          ))}
        </Parte>

        <Parte parte={GOVERNANCA} ouvir={textoCorrido([textoDaParte(GOVERNANCA), ...CODIGO_ABERTO.frases])}>
          {GOVERNANCA.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
          <ol className="flex flex-col gap-4" data-seguranca-passos>
            {(GOVERNANCA.passos ?? []).map((p, i) => (
              <li key={p} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground" aria-hidden="true">{i + 1}</span>
                <span className={texto}><span className="sr-only">Passo {i + 1}: </span>{p}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-5" data-seguranca-codigo>
            {CODIGO_ABERTO.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
            <a href={CODIGO_ABERTO.link} target="_blank" rel="noreferrer" className={cn(botaoSecundario, 'self-start print:hidden')}><Code className="size-5" aria-hidden="true" />Ver o código do Palácio</a>
            <p className="hidden break-all text-base print:block">{CODIGO_ABERTO.link}</p>
          </div>
        </Parte>

        {context && (
          <Parte parte={TRANSPARENCIA}>
            {TRANSPARENCIA.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
          </Parte>
        )}

        <Parte parte={IA_NO_PALACIO}>
          {IA_NO_PALACIO.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
        </Parte>

        <section id="perguntas" aria-labelledby="titulo-perguntas" className="flex scroll-mt-6 flex-col gap-5">
          <h2 id="titulo-perguntas" className={tituloDaParte}>Perguntas que a equipe faz</h2>
          <Ouvir texto={textoDasPerguntas()} rotulo="Ouvir esta parte" className={cn(ouvirGrande, 'self-start print:hidden')} />
          <dl className="flex flex-col gap-4" data-seguranca-perguntas>
            {PERGUNTAS_DA_SEGURANCA.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-2xl border-2 border-border bg-card p-5 print:break-inside-avoid">
                <dt className="text-xl font-bold">{p.pergunta}</dt>
                <dd className={texto}>{p.resposta}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Parte parte={SE_DESCONFIAR}>
          <ul className="flex list-disc flex-col gap-3 pl-6 marker:text-primary">
            {SE_DESCONFIAR.frases.map((f) => <li key={f} className={texto}>{f}</li>)}
          </ul>
        </Parte>

        <footer className="border-t border-border pt-6 text-base text-muted-foreground">
          Cruz Vermelha Brasileira · Filial do Rio de Janeiro · <span className="break-all">{DOMINIO_DO_PALACIO}/seguranca</span>
        </footer>
      </div>
    </main>
  )
}

/** Uma parte: o título, o "Ouvir" e o conteúdo. Sem `ouvir`, lê o título e as frases da parte. */
function Parte({ parte, ouvir, children }: { parte: { id: string; titulo: string } & Partial<ParteDoGuia>; ouvir?: string; children: React.ReactNode }) {
  return (
    <section id={parte.id} aria-labelledby={`titulo-${parte.id}`} className="flex scroll-mt-6 flex-col gap-5">
      <h2 id={`titulo-${parte.id}`} className={tituloDaParte}>{parte.titulo}</h2>
      <Ouvir texto={ouvir ?? textoDaParte({ id: parte.id, titulo: parte.titulo, frases: parte.frases ?? [], passos: parte.passos })} rotulo="Ouvir esta parte" className={cn(ouvirGrande, 'self-start print:hidden')} />
      {children}
    </section>
  )
}

/** Uma tranca ou uma regra: o desenho, o nome e o que o sistema faz de verdade. */
function Cartao({ item }: { item: ItemDaSeguranca }) {
  const Icone = ICONES[item.icone]
  return (
    <li className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-5 print:break-inside-avoid" data-item={item.id}>
      <p className="flex items-center gap-3 text-xl font-bold leading-snug">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary" aria-hidden="true"><Icone className="size-6" /></span>
        {item.titulo}
      </p>
      <p className={texto}>{item.texto}</p>
    </li>
  )
}
