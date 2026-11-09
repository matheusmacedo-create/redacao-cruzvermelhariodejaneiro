'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { ArrowLeft, ArrowRight, Check, CirclePlay, LogIn, MessageCircle, Sparkles, X } from 'lucide-react'
import { Ouvir } from '@/components/ajuda/ouvir'
import { ASSISTENTE, SETORES_DO_GUIA, setorPeloSlug, textoDaJanela, videosParaOSetor, type JanelaDoAssistente } from '@/lib/ajuda/comecar'
import { duracaoLegivel, videoDaAjuda } from '@/lib/ajuda/videos'
import { cn } from '@/lib/utils'

/**
 * O assistente do guia para começar (docs/AJUDA.md §16, "O assistente"): janelas em sequência, uma pergunta de cada
 * vez, que entendem quem está chegando ("Quem é você?", o setor, o e-mail, o acesso) e terminam no caminho da pessoa,
 * com os vídeos que servem para ela. Celular primeiro (público 50+): tela cheia no celular, letra e botões grandes,
 * "Ouvir" em cada janela e "Voltar" sempre à mão.
 *
 * Abre sozinho na primeira visita (a marca fica no aparelho, em `palacio:comecar-assistente`); depois, pelo botão
 * "Começar com o assistente", no alto do guia. Escolher o setor troca o endereço (?setor=…), e a página por trás passa
 * a mostrar o que é do setor. Quem está logado pula as perguntas e vê o caminho.
 */

type Passo = 'inicio' | 'quem' | 'voluntario' | 'conhecer' | 'setor' | 'email' | 'pedir-email' | 'acesso' | 'convite' | 'caminho'
type Resposta = 'sim' | 'nao' | null

const MARCA = 'palacio:comecar-assistente'
const TELA_DE_CELULAR = '(max-width: 767px)'
const EVENTO_DE_SOM = 'ajuda:ouvir'

const botaoPrincipal = 'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-ring/40 sm:w-auto'
const botaoSecundario = 'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-lg font-semibold text-foreground outline-none hover:border-primary/50 focus-visible:ring-4 focus-visible:ring-ring/40 sm:w-auto'
const opcao = 'flex min-h-16 w-full items-center gap-4 rounded-2xl border-2 border-border bg-card px-5 py-3 text-left outline-none hover:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/40'

function assinarArmazenamento(avisar: () => void) {
  window.addEventListener('storage', avisar)
  return () => window.removeEventListener('storage', avisar)
}
function lerMarca(): boolean {
  try { return Boolean(window.localStorage.getItem(MARCA)) } catch { return false }
}
function gravarMarca() {
  try { window.localStorage.setItem(MARCA, new Date().toISOString()) } catch { /* sem armazenamento: abre de novo na próxima vez */ }
}

export function AssistenteDoComeco({ logado, setorDoEndereco }: {
  /** Quem está logado: o primeiro nome e o setor do cadastro (a coordenação). */
  logado: { nome: string; setorSlug: string | null; escola: boolean } | null
  /** O setor que veio no endereço (?setor=…): o link que a coordenação manda já diz que a pessoa é da equipe. */
  setorDoEndereco: string | null
}) {
  const router = useRouter()
  // Servidor e primeira pintura: "já viu" (não abre); no aparelho, a marca de verdade.
  const jaViu = useSyncExternalStore(assinarArmazenamento, lerMarca, () => true)
  const [escolhaDeAbrir, setEscolhaDeAbrir] = useState<boolean | null>(null)
  const aberto = escolhaDeAbrir ?? !jaViu
  const [passo, setPasso] = useState<Passo>('inicio')
  const [historico, setHistorico] = useState<Passo[]>([])
  const [setorSlug, setSetorSlug] = useState<string | null>(logado?.setorSlug ?? setorDoEndereco)
  const [email, setEmail] = useState<Resposta>(logado ? 'sim' : null)
  const [acesso, setAcesso] = useState<Resposta>(logado ? 'sim' : null)
  const setor = setorPeloSlug(setorSlug)

  // O caminho de cada um, para o "Passo 2 de 5" (as janelas de resposta contam como a pergunta delas).
  const trilha: Passo[] = logado ? ['inicio', 'caminho'] : setorDoEndereco ? ['inicio', 'email', 'acesso', 'caminho'] : ['inicio', 'quem', 'setor', 'email', 'acesso', 'caminho']
  const naTrilha: Partial<Record<Passo, Passo>> = { 'pedir-email': 'email', convite: 'acesso', voluntario: 'quem', conhecer: 'quem' }
  const posicao = Math.max(0, trilha.indexOf(naTrilha[passo] ?? passo))

  const ir = (proximo: Passo) => { setHistorico((h) => [...h, passo]); setPasso(proximo) }
  const voltar = () => setHistorico((h) => { const anterior = h[h.length - 1]; if (anterior) setPasso(anterior); return h.slice(0, -1) })
  const fechar = (depois?: () => void) => {
    gravarMarca()
    setEscolhaDeAbrir(false)
    if (depois) setTimeout(depois, 350)
  }
  const abrirDoComeco = () => { setPasso('inicio'); setHistorico([]); setEscolhaDeAbrir(true) }
  const escolherSetor = (slug: string) => {
    setSetorSlug(slug)
    // A página por trás passa a mostrar o setor; o assistente continua aberto.
    router.replace(`/comecar?setor=${slug}`, { scroll: false })
    ir('email')
  }
  const irPara = (ancora: string) => fechar(() => document.getElementById(ancora)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  const linkDoWhatsapp = `/comecar/whatsapp${setor ? `?setor=${setor.slug}` : ''}`

  return (
    <>
      <button type="button" onClick={abrirDoComeco} className={cn(botaoPrincipal, 'print:hidden')} data-abrir-assistente>
        <Sparkles className="size-5" aria-hidden="true" />Começar com o assistente
      </button>
      <Dialog.Root open={aberto} onOpenChange={(abrir) => (abrir ? setEscolhaDeAbrir(true) : fechar())}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
          <Dialog.Popup
            data-assistente
            data-passo={passo}
            className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none transition-[opacity,transform] duration-200 data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-3rem)] sm:w-[min(36rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:shadow-2xl sm:data-[ending-style]:-translate-y-[48%] sm:data-[starting-style]:-translate-y-[48%]"
          >
            <header className="flex shrink-0 items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="flex flex-1 items-center gap-2" aria-hidden="true">
                {trilha.map((t, i) => <span key={t} className={cn('h-2 flex-1 rounded-full', i <= posicao ? 'bg-primary' : 'bg-muted')} />)}
              </div>
              <span className="text-base font-medium text-muted-foreground">Passo {posicao + 1} de {trilha.length}</span>
              <Dialog.Close aria-label="Fechar o assistente" className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none hover:bg-muted focus-visible:ring-4 focus-visible:ring-ring/40">
                <X className="size-6" aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div key={passo} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-6 pt-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
              {passo === 'inicio' && (
                <Janela janela={logado ? { ...ASSISTENTE.boasVindasLogado, titulo: logado.nome ? `Olá, ${logado.nome}! ${ASSISTENTE.boasVindasLogado.titulo}` : ASSISTENTE.boasVindasLogado.titulo } : ASSISTENTE.boasVindas}>
                  <Acoes>
                    <button type="button" className={botaoPrincipal} onClick={() => ir(logado ? 'caminho' : setorDoEndereco ? 'email' : 'quem')} data-assistente-comecar>
                      {logado ? 'Ver o meu caminho' : 'Começar'}<ArrowRight className="size-5" aria-hidden="true" />
                    </button>
                    <button type="button" className={botaoSecundario} onClick={() => fechar()}>Ver o guia inteiro</button>
                  </Acoes>
                </Janela>
              )}

              {passo === 'quem' && (
                <Janela janela={ASSISTENTE.quem}>
                  <ul className="flex flex-col gap-3">
                    {ASSISTENTE.quem.opcoes.map((o) => (
                      <li key={o.id}>
                        <button type="button" className={opcao} onClick={() => ir(o.id as Passo)} data-opcao={o.id}>
                          <span className="min-w-0 flex-1"><span className="block text-xl font-bold">{o.rotulo}</span>{o.detalhe && <span className="mt-0.5 block text-base text-muted-foreground">{o.detalhe}</span>}</span>
                          <ArrowRight className="size-6 shrink-0 text-primary" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Janela>
              )}

              {passo === 'voluntario' && (
                <Janela janela={ASSISTENTE.voluntario}>
                  <Acoes>
                    <a href="/participe" className={botaoPrincipal}>Fazer a minha inscrição<ArrowRight className="size-5" aria-hidden="true" /></a>
                  </Acoes>
                </Janela>
              )}

              {passo === 'conhecer' && (
                <Janela janela={ASSISTENTE.conhecer}>
                  <Acoes>
                    <Link href="/seguranca" className={botaoPrincipal}>Ler a página Segurança do Palácio</Link>
                    <button type="button" className={botaoSecundario} onClick={() => ir('setor')}>Na verdade, trabalho num setor</button>
                  </Acoes>
                </Janela>
              )}

              {passo === 'setor' && (
                <Janela janela={{ ...ASSISTENTE.setor, video: undefined }}>
                  <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    {SETORES_DO_GUIA.map((s) => (
                      <li key={s.slug}>
                        <button type="button" onClick={() => escolherSetor(s.slug)} data-setor={s.slug} aria-pressed={setorSlug === s.slug}
                          className={cn('flex min-h-14 w-full items-center justify-center rounded-xl border-2 px-4 py-2 text-center text-lg font-semibold outline-none focus-visible:ring-4 focus-visible:ring-ring/40', setorSlug === s.slug ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/60')}>
                          {s.nome}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <VideoDoPasso id={ASSISTENTE.setor.video} rotulo="Por que cada setor é importante" />
                </Janela>
              )}

              {passo === 'email' && (
                <Janela janela={ASSISTENTE.email} etiqueta={setor ? `Setor: ${setor.nome}` : undefined}>
                  <SimOuNao
                    sim={() => { setEmail('sim'); ir('acesso') }}
                    nao={() => { setEmail('nao'); ir('pedir-email') }}
                    rotuloDoNao="Ainda não tenho"
                  />
                </Janela>
              )}

              {passo === 'pedir-email' && (
                <Janela janela={ASSISTENTE.pedirEmail}>
                  <Acoes>
                    <a href={linkDoWhatsapp} className={cn(botaoPrincipal, 'bg-[#1e8e3e] hover:bg-[#1a7a35]')} data-pedir-whatsapp>
                      <MessageCircle className="size-6" aria-hidden="true" />Pedir pelo WhatsApp
                    </a>
                    <button type="button" className={botaoSecundario} onClick={() => ir('acesso')}>Já pedi, continuar</button>
                  </Acoes>
                </Janela>
              )}

              {passo === 'acesso' && (
                <Janela janela={ASSISTENTE.acesso}>
                  <SimOuNao
                    sim={() => { setAcesso('sim'); ir('caminho') }}
                    nao={() => { setAcesso('nao'); ir('convite') }}
                    rotuloDoNao="Ainda não"
                  />
                </Janela>
              )}

              {passo === 'convite' && (
                <Janela janela={ASSISTENTE.convite} rotuloDoVideo="Seus dados estão seguros?">
                  <Acoes>
                    <button type="button" className={botaoPrincipal} onClick={() => ir('caminho')}>Ver o meu caminho<ArrowRight className="size-5" aria-hidden="true" /></button>
                  </Acoes>
                </Janela>
              )}

              {passo === 'caminho' && (
                <Janela janela={ASSISTENTE.caminho} etiqueta={setor ? `Setor: ${setor.nome}` : undefined}>
                  <ol className="flex flex-col gap-3" data-caminho>
                    <Etapa feito={email === 'sim'} titulo="O e-mail da Cruz Vermelha">
                      {email !== 'sim' && <a href={linkDoWhatsapp} className="font-semibold text-primary underline underline-offset-4">Pedir pelo WhatsApp</a>}
                    </Etapa>
                    <Etapa feito={acesso === 'sim'} titulo="O acesso ao Palácio">
                      {acesso !== 'sim' && <span>Peça à coordenação do seu setor.</span>}
                    </Etapa>
                    <Etapa feito={Boolean(logado)} titulo={logado ? 'Você já entrou' : 'Entrar no Palácio'}>
                      {!logado && acesso === 'sim' && <Link href="/" className="font-semibold text-primary underline underline-offset-4">Entrar agora</Link>}
                    </Etapa>
                    <Etapa feito={false} titulo={setor ? `O que dá para fazer em ${setor.nome}` : 'O que dá para fazer'}>
                      <button type="button" onClick={() => irPara('fazer')} className="font-semibold text-primary underline underline-offset-4">Ver agora</button>
                    </Etapa>
                  </ol>
                  {videosParaOSetor(setor).length > 0 && (
                    <div className="flex flex-col gap-3">
                      <p className="text-lg font-semibold">Vídeos curtos para começar</p>
                      {videosParaOSetor(setor).map((id) => <VideoDoPasso key={id} id={id} />)}
                    </div>
                  )}
                  <Acoes>
                    {logado
                      ? <Link href={logado.escola ? '/escola' : '/dashboard'} className={botaoPrincipal}>Ir para o Palácio<ArrowRight className="size-5" aria-hidden="true" /></Link>
                      : <Link href="/" className={botaoPrincipal}><LogIn className="size-5" aria-hidden="true" />Entrar no Palácio</Link>}
                    <button type="button" className={botaoSecundario} onClick={() => fechar()}>Ver o guia completo</button>
                  </Acoes>
                </Janela>
              )}
            </div>

            {historico.length > 0 && (
              <footer className="shrink-0 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <button type="button" onClick={voltar} className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-lg font-semibold text-muted-foreground outline-none hover:bg-muted focus-visible:ring-4 focus-visible:ring-ring/40" data-voltar>
                  <ArrowLeft className="size-5" aria-hidden="true" />Voltar
                </button>
              </footer>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

/** Uma janela: a etiqueta (o setor), o título, o "Ouvir", as frases, a dica, o vídeo e o que se faz nela. */
function Janela({ janela, etiqueta, rotuloDoVideo, children }: { janela: JanelaDoAssistente; etiqueta?: string; rotuloDoVideo?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      {etiqueta && <p className="text-base font-semibold uppercase tracking-wide text-primary">{etiqueta}</p>}
      <Dialog.Title className="text-3xl font-bold leading-tight tracking-tight">{janela.titulo}</Dialog.Title>
      <Ouvir texto={textoDaJanela(janela)} rotulo="Ouvir" className="min-h-12 self-start px-4 text-base [&_svg]:size-5" />
      {janela.frases.map((f) => <p key={f} className="text-xl leading-relaxed">{f}</p>)}
      {janela.dica && <p className="rounded-xl bg-muted/70 px-4 py-3 text-lg leading-relaxed"><span className="font-semibold">Dica: </span>{janela.dica}</p>}
      {janela.video && <VideoDoPasso id={janela.video} rotulo={rotuloDoVideo} />}
      {children}
    </section>
  )
}

function Acoes({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div>
}

function SimOuNao({ sim, nao, rotuloDoNao }: { sim: () => void; nao: () => void; rotuloDoNao: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
      <button type="button" onClick={sim} className={cn(opcao, 'justify-center text-xl font-bold')} data-resposta="sim"><Check className="size-6 text-success" aria-hidden="true" />Sim</button>
      <button type="button" onClick={nao} className={cn(opcao, 'justify-center text-xl font-bold')} data-resposta="nao">{rotuloDoNao}</button>
    </div>
  )
}

function Etapa({ feito, titulo, children }: { feito: boolean; titulo: string; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-4 rounded-2xl border-2 border-border bg-card px-4 py-3">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2', feito ? 'border-success bg-success text-success-foreground' : 'border-border')} aria-hidden="true">
        {feito && <Check className="size-5" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-lg">
        <span className={cn('font-bold leading-snug', feito && 'text-muted-foreground')}>{titulo}<span className="sr-only">{feito ? ' (feito)' : ' (a fazer)'}</span></span>
        {children}
      </span>
    </li>
  )
}

/**
 * O vídeo dentro da janela: a capa com o "tocar" e, ao tocar, o player ali mesmo (no celular, a versão em pé), com
 * legenda. Um som por vez: tocar avisa o "Ouvir" e os outros vídeos, que pausam.
 */
function VideoDoPasso({ id, rotulo }: { id?: string; rotulo?: string }) {
  const video = videoDaAjuda(id)
  const chave = useId()
  const player = useRef<HTMLVideoElement>(null)
  const [tocando, setTocando] = useState<'deitado' | 'em-pe' | null>(null)
  useEffect(() => {
    const outro = (e: Event) => { if ((e as CustomEvent<string>).detail !== chave) player.current?.pause() }
    window.addEventListener(EVENTO_DE_SOM, outro)
    return () => window.removeEventListener(EVENTO_DE_SOM, outro)
  }, [chave])
  if (!video) return null
  const fonte = tocando === 'em-pe' && video.noCelular ? video.noCelular : video
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-border bg-card" data-video-do-passo={id}>
      {tocando ? (
        <video
          ref={player}
          src={fonte.enderecoDoVideo}
          poster={fonte.enderecoDaCapa}
          controls
          autoPlay
          playsInline
          preload="metadata"
          onPlay={() => window.dispatchEvent(new CustomEvent(EVENTO_DE_SOM, { detail: chave }))}
          className={cn('w-full bg-black', tocando === 'em-pe' ? 'max-h-[70dvh]' : 'aspect-video')}
        >
          <track kind="captions" srcLang="pt-BR" label="Português" src={fonte.enderecoDaLegenda} default />
        </video>
      ) : (
        <button
          type="button"
          onClick={() => setTocando(video.noCelular && window.matchMedia(TELA_DE_CELULAR).matches ? 'em-pe' : 'deitado')}
          className="flex w-full items-center gap-4 p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          {/* A capa de computador, pequena, é a mesma ideia nas duas telas. */}
          <img src={video.enderecoDaCapa} alt="" className="h-20 w-32 shrink-0 rounded-lg object-cover" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2 text-lg font-bold leading-snug"><CirclePlay className="size-6 shrink-0 text-primary" aria-hidden="true" />{rotulo ?? video.titulo}</span>
            <span className="text-base text-muted-foreground">Vídeo · {duracaoLegivel(video.duracao)}</span>
          </span>
        </button>
      )}
    </div>
  )
}
