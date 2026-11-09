import Link from 'next/link'
import QRCode from 'qrcode'
import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Bell, BookOpen, CircleHelp, House, LogIn, Menu, MessageCircle, Plus, Search, ShieldCheck, UserRound } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { Ouvir } from '@/components/ajuda/ouvir'
import { CartaoDoVideo } from '@/components/ajuda/cartao-do-video'
import { BotaoDeImprimir, EscolhaDoGuia, MarcarGuiaVisto } from '@/components/comecar/partes'
import {
  A_TELA, COMO_ENTRAR, ESCOLHA_DO_ACESSO, ESCOLHA_DO_EMAIL, E_SEGURO, O_QUE_E, O_QUE_E_DA_ESCOLA, SETORES_DO_GUIA, SE_TRAVAR,
  coisasParaOSetor, itensPara, setorPelaCoordenacao, setorPeloSlug, textoDaCoisa, textoDaLista, textoDaParte, textoDoNao, textoDoSim, videosParaOSetor,
  type CoisaQueDaParaFazer, type EscolhaDoGuia as Escolha, type ItemDaTela,
} from '@/lib/ajuda/comecar'
import { hrefDaAjuda, hrefDoGlossario } from '@/lib/ajuda/indice'
import { videoDaAjuda } from '@/lib/ajuda/videos'
import { DOMINIO_DO_PALACIO } from '@/lib/dominio'
import { TODOS_OS_GRUPOS } from '@/lib/navegacao'
import { urlBase } from '@/lib/newsletter/contexto'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { obterWorkspace } from '@/lib/session'
import { cn } from '@/lib/utils'
import { gruposDaPessoa } from '@/app/(app)/ajuda/grupos-da-pessoa'

export const metadata: Metadata = {
  title: 'Comece por aqui — Palácio Virtual',
  description: 'O Palácio Virtual da Cruz Vermelha RJ, passo a passo: o e-mail da Cruz Vermelha, o acesso, como entrar e o que dá para fazer.',
}

const ICONES: Record<ItemDaTela['icone'], LucideIcon> = { menu: Menu, inicio: House, busca: Search, sino: Bell, ajuda: CircleHelp, conta: UserRound, criar: Plus }

// Letra grande e alvos de toque grandes (a partir de 56 px): o guia é para quem usa pouco o computador.
const tituloDaParte = 'text-2xl font-bold leading-tight tracking-tight sm:text-3xl'
const texto = 'text-lg leading-relaxed sm:text-xl'
const botaoPrincipal = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-ring/40'
const botaoSecundario = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-lg font-semibold text-foreground outline-none hover:border-primary/50 focus-visible:ring-4 focus-visible:ring-ring/40'
const ouvirGrande = 'min-h-12 px-4 text-base [&_svg]:size-5 sm:min-h-12'

/**
 * O guia para começar (docs/AJUDA.md §16): uma página aberta, sem login, para quem usa pouco o computador. O conteúdo
 * mora em lib/ajuda/comecar.ts. A tela de entrada, a Central de ajuda, as boas-vindas e os "Primeiros passos" levam
 * até aqui.
 *
 * Por setor: "Qual é o seu setor?" leva a /comecar?setor=juridico (o endereço que a coordenação manda ao setor); com
 * login e sem setor no endereço, vale a coordenação da pessoa. O setor muda "O que dá para fazer" ("Do seu setor" e
 * "O que todo mundo usa"), os vídeos e a frase do WhatsApp ("quero me cadastrar em Jurídico").
 *
 * Sem login, mostra tudo o que é do setor. Com login, só o que a pessoa abre, as respostas do passo 2 já vêm como "sim",
 * e abrir o guia marca o item dos "Primeiros passos".
 */
export default async function ComecarPage({ searchParams }: { searchParams: Promise<{ whatsapp?: string; setor?: string }> }) {
  const { whatsapp, setor: setorPedido } = await searchParams
  const context = await obterWorkspace({ escola: true }).catch(() => null)
  const grupos = context ? await gruposDaPessoa(context).catch(() => null) : null
  const abre = grupos ? new Set(grupos.flatMap((g) => g.areas.map((a) => a.href))) : null
  const escola = context ? ehEquipeDaEscola(context.role) : false
  const nome = context?.profile?.full_name?.trim().split(/\s+/)[0] || ''
  const coordenacao = context ? context.memberships.find((m) => m.workspaces?.id === context.workspace.id)?.coordination ?? null : null
  const setor = setorPeloSlug(setorPedido) ?? setorPelaCoordenacao(coordenacao)
  const doSeuSetor = Boolean(setor && !setorPeloSlug(setorPedido))
  const nomeDaArea = new Map(TODOS_OS_GRUPOS.flatMap((g) => g.areas).map((a) => [a.href, a.rotulo] as const))
  const visivel = (c: CoisaQueDaParaFazer) => !abre || abre.has(c.area)
  const { doSetor, deTodos } = coisasParaOSetor(setor)
  const coisasDoSetor = doSetor.filter(visivel)
  const coisasDeTodos = deTodos.filter(visivel)
  const videos = videosParaOSetor(setor).flatMap((id) => {
    const v = videoDaAjuda(id)
    return v && (!abre || abre.has(v.area)) ? [v] : []
  })
  const oQueE = escola ? O_QUE_E_DA_ESCOLA : O_QUE_E
  // O botão e o QR da versão impressa: o endereço fixo que leva ao WhatsApp do Palácio, com o setor na frase
  // (app/comecar/whatsapp/route.ts).
  const linkDoWhatsapp = `/comecar/whatsapp${setor ? `?setor=${setor.slug}` : ''}`
  const qrDoWhatsapp = await QRCode.toDataURL(`${urlBase()}${linkDoWhatsapp}`, { errorCorrectionLevel: 'M', margin: 1, width: 360 }).catch(() => null)

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <MarcarGuiaVisto logado={Boolean(context)} />
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 print:gap-8 print:pt-0">
        <header className="flex flex-col gap-5">
          <BrandMark selo className="w-60 items-start sm:w-72" />
          <div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Comece por aqui</h1>
            <p className={cn(texto, 'mt-3 text-muted-foreground')}>O Palácio Virtual, passo a passo e com calma. Em cada parte, o botão “Ouvir” lê o texto em voz alta.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row print:hidden">
            {context
              ? <Link href={escola ? '/escola' : '/dashboard'} className={botaoPrincipal}>Ir para o Palácio<ArrowRight className="size-5" aria-hidden="true" /></Link>
              : <Link href="/" className={botaoPrincipal}><LogIn className="size-5" aria-hidden="true" />Entrar no Palácio</Link>}
            <BotaoDeImprimir />
          </div>
          {context && (
            <p className={cn(texto, 'rounded-xl border border-primary/25 bg-primary/[0.05] px-5 py-4')}>
              {nome ? `${nome}, você` : 'Você'} já está no Palácio. Os passos 1 e 2 são para quem ainda não tem acesso: pule para o passo 3 se quiser.
            </p>
          )}
        </header>

        <Parte id={oQueE.id} titulo={oQueE.titulo} ouvir={textoDaParte(oQueE)}>
          {oQueE.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
        </Parte>

        {!escola && (
          <section id="setor" aria-labelledby="titulo-setor" className="flex scroll-mt-6 flex-col gap-5">
            <h2 id="titulo-setor" className={tituloDaParte}>{setor ? `O seu setor: ${setor.nome}` : 'Qual é o seu setor?'}</h2>
            <p className={texto}>
              {setor
                ? `${doSeuSetor ? 'É o setor que está no seu cadastro. ' : ''}O guia agora mostra o que é do seu setor (${setor.descricao.replace(/\.$/, '').replace(/^./, (l) => l.toLowerCase())}). Não é o seu? Escolha outro.`
                : 'Cada setor usa uma parte do Palácio. Escolha o seu: o guia mostra o que é do seu trabalho.'}
            </p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:hidden">
              {SETORES_DO_GUIA.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/comecar?setor=${s.slug}#setor`}
                    scroll={false}
                    aria-current={setor?.slug === s.slug ? 'true' : undefined}
                    className={cn('flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 px-5 py-3 text-lg font-semibold outline-none focus-visible:ring-4 focus-visible:ring-ring/40', setor?.slug === s.slug ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50')}
                  >
                    {s.nome}{setor?.slug === s.slug && <span className="text-base font-medium">o seu</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {setor && <p className="text-base text-muted-foreground">Para mandar este guia a alguém do setor: <span className="break-all font-medium text-foreground">{DOMINIO_DO_PALACIO}/comecar?setor={setor.slug}</span></p>}
          </section>
        )}

        <EscolhaNaPagina escolha={ESCOLHA_DO_EMAIL} inicial={whatsapp === 'fora' ? 'nao' : null} comNao={<>
          {whatsapp === 'fora' && (
            <p role="alert" className={cn(texto, 'rounded-xl border-2 border-warning/60 bg-warning/10 px-5 py-4 font-medium')}>
              O WhatsApp do Palácio não respondeu agora. Peça ajuda à coordenação do seu setor ou tente de novo daqui a pouco.
            </p>
          )}
          <a href={linkDoWhatsapp} className={cn(botaoPrincipal, 'bg-[#1e8e3e] hover:bg-[#1a7a35] print:hidden')}>
            <MessageCircle className="size-6" aria-hidden="true" />Pedir pelo WhatsApp
          </a>
          {qrDoWhatsapp && (
            <figure className="hidden items-center gap-5 print:flex">
              <img src={qrDoWhatsapp} alt="" className="size-40" />
              <figcaption className={texto}>No celular, aponte a câmera para este código: o WhatsApp do Palácio abre com a frase pronta, “quero me cadastrar{setor ? ` em ${setor.nome}` : ''}”.</figcaption>
            </figure>
          )}
        </>} />

        <EscolhaNaPagina
          escolha={ESCOLHA_DO_ACESSO}
          inicial={context ? 'sim' : null}
          comSim={!context && <Link href="/" className={cn(botaoPrincipal, 'self-start print:hidden')}><LogIn className="size-5" aria-hidden="true" />Entrar no Palácio</Link>}
        />

        <Parte id={COMO_ENTRAR.id} titulo={COMO_ENTRAR.titulo} ouvir={textoDaParte(COMO_ENTRAR)}>
          {COMO_ENTRAR.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
          <Passos passos={COMO_ENTRAR.passos ?? []} />
          <p className={cn(texto, 'font-semibold')}>O endereço: <span className="whitespace-nowrap text-primary">{DOMINIO_DO_PALACIO}</span></p>
        </Parte>

        <Parte id={A_TELA.id} titulo={A_TELA.titulo} ouvir={textoDaLista(A_TELA, escola)}>
          <ul className="flex flex-col gap-4">
            {itensPara(A_TELA.itens, escola).map((item) => {
              const Icone = ICONES[item.icone]
              return (
                <li key={item.icone} className="flex items-start gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-border bg-card text-foreground" aria-hidden="true"><Icone className="size-6" /></span>
                  <span className={texto}>{item.texto}</span>
                </li>
              )
            })}
          </ul>
        </Parte>

        {(coisasDoSetor.length > 0 || coisasDeTodos.length > 0) && (
          <section id="fazer" aria-labelledby="titulo-fazer" className="flex scroll-mt-6 flex-col gap-6">
            <h2 id="titulo-fazer" className={tituloDaParte}>O que dá para fazer</h2>
            {coisasDoSetor.length > 0 && setor && (
              <div className="flex flex-col gap-4">
                <h3 className="text-xl font-bold text-primary sm:text-2xl">Do seu setor: {setor.nome}</h3>
                <ListaDeCoisas coisas={coisasDoSetor} nomeDaArea={nomeDaArea} />
              </div>
            )}
            <div className="flex flex-col gap-4">
              <h3 className="text-xl font-bold sm:text-2xl">O que todo mundo usa</h3>
              {!setor && !escola && <p className={texto}>Escolha o seu setor, mais acima, para ver também o que é do seu trabalho.</p>}
              <ListaDeCoisas coisas={coisasDeTodos} nomeDaArea={nomeDaArea} />
            </div>
          </section>
        )}

        {videos.length > 0 && (
          <section id="videos" aria-labelledby="titulo-videos" className="flex scroll-mt-6 flex-col gap-5 print:hidden">
            <h2 id="titulo-videos" className={tituloDaParte}>Prefere ver? {videos.length === 1 ? 'Um vídeo curto' : `${videos.length === 3 ? 'Três' : videos.length === 2 ? 'Dois' : videos.length} vídeos curtos`}</h2>
            <p className={texto}>Cada um mostra uma tarefa, do começo ao fim, com voz e legenda. Veja na ordem.</p>
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {videos.map((v, i) => <li key={v.id}><CartaoDoVideo id={v.id} numero={i + 1} onde={nomeDaArea.get(v.area)} grande /></li>)}
            </ol>
          </section>
        )}

        <Parte id={E_SEGURO.id} titulo={E_SEGURO.titulo} ouvir={textoDaParte(E_SEGURO)}>
          {E_SEGURO.frases.map((f) => <p key={f} className={texto}>{f}</p>)}
          <Link href="/seguranca" className={cn(botaoSecundario, 'self-start print:hidden')}><ShieldCheck className="size-5" aria-hidden="true" />Segurança do Palácio</Link>
          <p className="hidden text-base print:block">{DOMINIO_DO_PALACIO}/seguranca</p>
        </Parte>

        <Parte id={SE_TRAVAR.id} titulo={SE_TRAVAR.titulo} ouvir={textoDaLista(SE_TRAVAR, escola)}>
          <ul className="flex list-disc flex-col gap-3 pl-6 marker:text-primary">
            {itensPara(SE_TRAVAR.itens, escola).map((i) => <li key={i.texto} className={texto}>{i.texto}</li>)}
          </ul>
          <div className="flex flex-wrap gap-3 print:hidden">
            <Link href="/ajuda" className={botaoSecundario}><CircleHelp className="size-5" aria-hidden="true" />Central de ajuda</Link>
            <Link href={hrefDoGlossario()} className={botaoSecundario}><BookOpen className="size-5" aria-hidden="true" />Glossário</Link>
          </div>
        </Parte>

        <footer className="border-t border-border pt-6 text-base text-muted-foreground">
          Cruz Vermelha Brasileira · Filial do Rio de Janeiro · <span className="break-all">{DOMINIO_DO_PALACIO}/comecar{setor ? `?setor=${setor.slug}` : ''}</span>
        </footer>
      </div>
    </main>
  )
}

/** Uma lista de "Quero…": o que é, como se faz, o "Ouvir", o botão que leva até lá e, quando há, o passo a passo. */
function ListaDeCoisas({ coisas, nomeDaArea }: { coisas: CoisaQueDaParaFazer[]; nomeDaArea: Map<string, string> }) {
  return (
    <ul className="flex flex-col gap-4">
      {coisas.map((c) => (
        <li key={`${c.area}:${c.quero}`} className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-5 print:break-inside-avoid">
          <p className="text-xl font-bold leading-snug">“{c.quero}”</p>
          <p className={texto}>{c.como}</p>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Ouvir texto={textoDaCoisa(c)} className={ouvirGrande} />
            <Link href={c.link?.href ?? c.area} className={cn(botaoSecundario, 'min-h-12 text-base')}>{c.link?.rotulo ?? `Abrir ${nomeDaArea.get(c.area) ?? 'a área'}`}<ArrowRight className="size-4" aria-hidden="true" /></Link>
            {c.tarefa && <Link href={hrefDaAjuda(c.area, c.tarefa)} className="inline-flex min-h-12 items-center gap-1.5 px-2 text-base font-semibold text-primary underline-offset-4 hover:underline"><BookOpen className="size-5" aria-hidden="true" />Ver o passo a passo</Link>}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Uma parte do guia: o título, o "Ouvir" e o conteúdo. Na impressão, não quebra no meio da página quando dá. */
function Parte({ id, titulo, ouvir, children }: { id: string; titulo: string; ouvir: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`titulo-${id}`} className="flex scroll-mt-6 flex-col gap-5">
      <h2 id={`titulo-${id}`} className={tituloDaParte}>{titulo}</h2>
      <Ouvir texto={ouvir} rotulo="Ouvir esta parte" className={cn(ouvirGrande, 'self-start print:hidden')} />
      {children}
    </section>
  )
}

function Passos({ passos }: { passos: string[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {passos.map((p, i) => (
        <li key={p} className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground" aria-hidden="true">{i + 1}</span>
          <span className={texto}><span className="sr-only">Passo {i + 1}: </span>{p}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Os passos 1 e 2: a pergunta de sim ou não (EscolhaDoGuia, no navegador) com o que fazer em cada caso, desenhado
 * aqui. `inicial`: a resposta que já vem marcada (quem está logado já tem o acesso; quem voltou do WhatsApp fora do ar
 * estava no "não"). `comSim` e `comNao`: o que vai junto de cada resposta (o botão de entrar, o do WhatsApp).
 */
function EscolhaNaPagina({ escolha, inicial, comSim, comNao }: { escolha: Escolha; inicial: 'sim' | 'nao' | null; comSim?: React.ReactNode; comNao?: React.ReactNode }) {
  return (
    <section id={escolha.id} aria-labelledby={`titulo-${escolha.id}`} className="flex scroll-mt-6 flex-col gap-5">
      <h2 id={`titulo-${escolha.id}`} className={tituloDaParte}>{escolha.titulo}</h2>
      <EscolhaDoGuia
        id={escolha.id}
        pergunta={escolha.pergunta}
        inicial={inicial}
        sim={
          <div className="flex flex-col gap-4">
            {escolha.sim.map((f) => <p key={f} className={texto}>{f}</p>)}
            <Ouvir texto={textoDoSim(escolha)} className={cn(ouvirGrande, 'self-start print:hidden')} />
            {comSim}
          </div>
        }
        nao={
          <div className="flex flex-col gap-5">
            <Ouvir texto={textoDoNao(escolha)} rotulo="Ouvir os passos" className={cn(ouvirGrande, 'self-start print:hidden')} />
            <Passos passos={escolha.nao.passos} />
            {escolha.nao.dica && <p className={cn(texto, 'rounded-xl bg-muted/70 px-5 py-4')}><span className="font-semibold">Dica: </span>{escolha.nao.dica}</p>}
            {comNao}
          </div>
        }
      />
    </section>
  )
}
