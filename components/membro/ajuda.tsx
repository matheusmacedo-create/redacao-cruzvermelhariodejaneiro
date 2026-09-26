'use client'

import { createContext, use, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { Compass } from 'lucide-react'
import { Tour } from '@/components/ajuda/tour'
import type { TourDoMembro } from '@/lib/ajuda/membro'
import type { PassoDoTour } from '@/lib/ajuda/tipos'
import { PROGRESSO_VAZIO, comBoasVindas, comTourVisto, lerProgresso, type Progresso } from '@/lib/ajuda/progresso'
import { cn } from '@/lib/utils'
import { botaoDoMembro, botaoFantasma, botaoSecundario } from './marca'
import { SECOES } from './navegacao'

/**
 * A ajuda da Área do Voluntário: o convite de boas-vindas no primeiro acesso,
 * o tour (de boas-vindas, de cada destino e das telas internas) e o `?tour=1`
 * dos links da Ajuda. O motor é o de components/ajuda/tour.tsx.
 *
 * O texto (lib/ajuda/membro.ts, com os tours, o passo a passo e as perguntas:
 * ~16 KB comprimidos) fica fora do pacote de toda página — o voluntário
 * costuma estar no 4G — e só é baixado quando um tour começa (carregarTexto).
 * Em toda página basta saber que telas têm tour: a lista vem pronta do
 * servidor (app/membro/(area)/layout.tsx), montada a partir do mesmo texto.
 *
 * O que a pessoa já viu fica no `localStorage` deste aparelho, no formato de
 * lib/ajuda/progresso.ts: o voluntário não tem conta no Supabase Auth, e isto
 * não decide acesso a nada. Sem armazenamento (aba anônima, bloqueio), a área
 * funciona igual e só não lembra: o convite volta na próxima visita. Na
 * visualização da equipe (/membro/previa), o convite não abre sozinho e nada
 * é gravado.
 */

/** A chave no `localStorage`. Mudou o formato? Troque a chave (o antigo é só ignorado). */
export const CHAVE_DA_AJUDA = 'cvrj-membro-ajuda'

/** Quanto o convite espera: a tela assenta antes de aparecer algo no canto. */
const ESPERA_DO_CONVITE_MS = 1000
/**
 * Quanto um `?tour=1` espera o esqueleto de carregamento (loading.tsx,
 * `data-carregando`) sair. Longo de propósito: o voluntário costuma estar no
 * 4G, e o tour aberto sobre o esqueleto perde os passos opcionais (na prévia
 * de produção, com a página levando 5 s, o de Formação caía de 4 para 3
 * passos; o de Oportunidades ficaria só com os do centro). Enquanto isso, o
 * próprio esqueleto mostra que a página está chegando.
 */
const ESPERA_DA_PAGINA_MS = 10_000

type TextoDaAjuda = typeof import('@/lib/ajuda/membro')

let texto: Promise<TextoDaAjuda> | null = null

/** Uma vez baixado, o texto vale para o resto da visita (e o navegador guarda o arquivo). */
function carregarTexto(): Promise<TextoDaAjuda> {
  // Falhou (a conexão caiu no meio)? Esquece a promessa, para o próximo pedido baixar de novo.
  texto ??= import('@/lib/ajuda/membro').catch((erro: unknown) => { texto = null; throw erro })
  return texto
}

/** Baixa de antemão, sem esperar nem reclamar: quando a pessoa tocar, já está aqui. */
function adiantarTexto() {
  carregarTexto().catch(() => {})
}

/**
 * '/membro/cursos/[id]' casa com '/membro/cursos/abc'. A mesma regra de
 * `tourDoMembro` (lib/ajuda/membro.ts), que escolhe o tour quando o texto
 * chega; aqui ela só diz, sem o texto, se a tela tem algum.
 */
function casa(padrao: string, pathname: string): boolean {
  const partes = padrao.split('/').filter(Boolean)
  const reais = pathname.split('/').filter(Boolean)
  return partes.length === reais.length && partes.every((p, i) => /^\[.+\]$/.test(p) || p === reais[i])
}

function lerGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE_DA_AJUDA)
  } catch {
    return null
  }
}

function guardar(p: Progresso) {
  try {
    localStorage.setItem(CHAVE_DA_AJUDA, JSON.stringify(p))
  } catch {
    // Sem armazenamento: segue sem lembrar.
  }
}

/** O que estiver gravado, desconfiando de tudo (o aparelho é da pessoa). */
function progressoDe(bruto: string | null): Progresso {
  if (!bruto) return PROGRESSO_VAZIO
  try {
    return lerProgresso(JSON.parse(bruto))
  } catch {
    return PROGRESSO_VAZIO
  }
}

// Lidos com useSyncExternalStore, e não num efeito: no servidor e na
// hidratação valem o padrão; logo depois, o que o aparelho tiver guardado.
const semAssinatura = () => () => {}
const nadaNoServidor = () => null
const noCliente = () => true
const noServidor = () => false

type PedidoDeTour = { passos: PassoDoTour[]; rotulo: string; chave: string | null }
type TourAberto = PedidoDeTour & { id: number }

type AjudaDoMembroState = {
  progresso: Progresso
  /** A tela aberta tem tour (o do destino, na raiz dele, ou o de uma tela interna). */
  temTourNaTela: boolean
  /** Baixa o texto do tour de antemão: o menu da conta abriu, e o "Tour desta tela" está a um toque. */
  adiantarTour: () => void
  iniciarTourDaTela: () => void
  iniciarBoasVindas: () => void
}

const Contexto = createContext<AjudaDoMembroState | null>(null)

/** Fora do provedor, null: quem usa (o menu da conta) só esconde o que depende da ajuda. */
export function useAjudaDoMembro(): AjudaDoMembroState | null {
  return use(Contexto)
}

/** As boas-vindas contam como vistas (sem mudar a data de quem já tinha visto). */
const comBoasVindasVistas = (p: Progresso) => (p.boasVindas ? p : comBoasVindas(p, new Date().toISOString()))

/** O tour de uma tela, com o rótulo do balão: "Tour · Formação", "Tour · Prova final". */
function pedidoDoTour(t: TourDoMembro): PedidoDeTour {
  return { passos: t.passos, rotulo: `Tour · ${t.tela?.rotulo ?? SECOES.find((s) => s.href === t.destino)?.rotulo ?? 'Área do Voluntário'}`, chave: t.chave }
}

export function AjudaDoMembro({ previa, nome, caminhosComTour, children }: {
  /** Visualização da equipe: o convite não abre sozinho e nada fica gravado. */
  previa: boolean
  /** O primeiro nome, para o convite. */
  nome: string
  /** As telas que têm tour, no formato de rota ('/membro/cursos/[id]'), sem o texto. */
  caminhosComTour: string[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const bruto = useSyncExternalStore(semAssinatura, lerGuardado, nadaNoServidor)
  const cliente = useSyncExternalStore(semAssinatura, noCliente, noServidor)
  // Depois da primeira escolha, a verdade é o estado daqui: gravar pode falhar sem armazenamento.
  const [mudado, setMudado] = useState<Progresso | null>(null)
  const guardado = useMemo(() => progressoDe(bruto), [bruto])
  const progresso = mudado ?? guardado
  const [tour, setTour] = useState<TourAberto | null>(null)
  const [conviteLiberado, setConviteLiberado] = useState(false)
  const contador = useRef(0)
  // Um `?tour=1` esperando a página: o convite não aparece por cima dele.
  const tourPendente = useRef(false)

  const temTourNaTela = useMemo(() => caminhosComTour.some((c) => casa(c, pathname)), [caminhosComTour, pathname])
  // A página de agora, para quem termina depois de um download: o pedido feito
  // numa tela não abre o tour em outra.
  const caminhoAtual = useRef(pathname)
  useEffect(() => { caminhoAtual.current = pathname }, [pathname])

  // Mudou de página: o tour era da tela anterior e sai sem contar como visto
  // (o voltar do navegador não é "já entendi"). Ajuste durante a renderização,
  // como o React recomenda para estado que depende de uma prop.
  const [caminhoAnterior, setCaminhoAnterior] = useState(pathname)
  if (caminhoAnterior !== pathname) {
    setCaminhoAnterior(pathname)
    setTour(null)
    setConviteLiberado(false)
  }

  const atualizar = useCallback((mudar: (p: Progresso) => Progresso) => {
    const novo = mudar(progresso)
    if (novo === progresso) return
    setMudado(novo)
    if (!previa) guardar(novo)
  }, [progresso, previa])

  const abrir = useCallback((pedido: PedidoDeTour) => {
    if (!pedido.passos.length) return
    contador.current += 1
    setTour({ ...pedido, id: contador.current })
  }, [])

  // O progresso conta na hora do pedido; o tour abre quando o texto chega. Se
  // o download falhar (sem sinal), nada abre — como na Redação — e o pedido
  // pode ser refeito pelo menu da conta ou pela Ajuda. Pedir um tour é sinal
  // de que a pessoa já achou a ajuda: o convite não precisa voltar.
  const iniciarBoasVindas = useCallback(() => {
    atualizar(comBoasVindasVistas)
    const caminho = caminhoAtual.current
    carregarTexto().then(({ BOAS_VINDAS_DO_MEMBRO }) => {
      if (caminhoAtual.current === caminho) abrir({ passos: BOAS_VINDAS_DO_MEMBRO, rotulo: 'Boas-vindas', chave: null })
    }).catch(() => {})
  }, [atualizar, abrir])

  const iniciarTourDaTela = useCallback(() => {
    if (!temTourNaTela) return
    atualizar(comBoasVindasVistas)
    carregarTexto().then(({ tourDoMembro }) => {
      const t = caminhoAtual.current === pathname ? tourDoMembro(pathname) : null
      if (t) abrir(pedidoDoTour(t))
    }).catch(() => {})
  }, [temTourNaTela, pathname, atualizar, abrir])

  const adiantarTour = useCallback(() => { if (temTourNaTela) adiantarTexto() }, [temTourNaTela])

  const terminar = useCallback(() => {
    // Concluído ou fechado no X/Esc: nos dois casos a pessoa já viu.
    const chave = tour?.chave
    setTour(null)
    if (chave) atualizar((p) => comTourVisto(p, chave))
  }, [tour, atualizar])

  // O tour devolve o foco para onde ele estava. Chegando por `?tour=1`, o link
  // clicado ficou na página anterior e não há para onde voltar: sem isto, o
  // foco iria para o <body> e o Tab recomeçaria do topo. Vai para o conteúdo
  // (o mesmo destino do "Pular para o conteúdo").
  const focoDeVolta = useCallback(() => document.getElementById('conteudo'), [])

  // ?tour=1 no endereço (o "Fazer o tour" da Ajuda): abre o tour da tela ao
  // chegar e tira o parâmetro, para recarregar a página não repetir. Lido de
  // window.location, e não com useSearchParams: é o layout, e o endereço só
  // interessa uma vez, ao chegar.
  const abrirQuandoPronta = useEffectEvent((t: TourDoMembro) => {
    atualizar(comBoasVindasVistas)
    abrir(pedidoDoTour(t))
  })
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search)
    if (busca.get('tour') !== '1') return
    const tirarDoEndereco = () => {
      busca.delete('tour')
      const resto = busca.toString()
      window.history.replaceState(null, '', `${pathname}${resto ? `?${resto}` : ''}${window.location.hash}`)
    }
    if (!temTourNaTela) {
      tirarDoEndereco()
      return
    }
    // Numa navegação, o esqueleto do loading.tsx vem antes da página: o tour
    // espera ele sair (até um limite), senão os passos opcionais sumiriam todos.
    // O texto baixa enquanto isso. O parâmetro só sai quando o tour abre (ou
    // quando não vai abrir): se o efeito for desfeito antes (o Strict Mode roda
    // duas vezes no desenvolvimento), a segunda vez ainda o encontra.
    tourPendente.current = true
    const chegando = carregarTexto()
    // A falha é tratada lá embaixo, depois do esqueleto; isto só evita o aviso
    // de promessa rejeitada sem tratamento enquanto ele não sai.
    chegando.catch(() => {})
    const inicio = performance.now()
    let relogio = 0
    let cancelado = false
    const tentar = () => {
      if (document.querySelector('[data-carregando]') && performance.now() - inicio < ESPERA_DA_PAGINA_MS) {
        relogio = window.setTimeout(tentar, 100)
        return
      }
      chegando.then(({ tourDoMembro }) => tourDoMembro(pathname), () => null).then((aqui) => {
        if (cancelado) return
        tourPendente.current = false
        tirarDoEndereco()
        if (aqui) abrirQuandoPronta(aqui)
      })
    }
    relogio = window.setTimeout(tentar, 0)
    return () => {
      cancelado = true
      window.clearTimeout(relogio)
      tourPendente.current = false
    }
  }, [pathname, temTourNaTela])

  // O convite de boas-vindas: no Início, para quem ainda não viu, fora da visualização da equipe.
  const cabeConvite = cliente && !previa && pathname === '/membro' && !progresso.boasVindas
  useEffect(() => {
    if (!cabeConvite) return
    const relogio = window.setTimeout(() => { if (!tourPendente.current) setConviteLiberado(true) }, ESPERA_DO_CONVITE_MS)
    return () => window.clearTimeout(relogio)
  }, [cabeConvite])
  const convite = cabeConvite && conviteLiberado && !tour
  // Com o convite na tela, o "Fazer o tour" está a um toque: o texto já vem vindo.
  useEffect(() => { if (convite) adiantarTexto() }, [convite])

  const valor = useMemo<AjudaDoMembroState>(() => ({
    progresso, temTourNaTela, adiantarTour, iniciarTourDaTela, iniciarBoasVindas,
  }), [progresso, temTourNaTela, adiantarTour, iniciarTourDaTela, iniciarBoasVindas])

  return (
    <Contexto value={valor}>
      {children}
      {/* A região viva fica na página desde o começo, vazia: região que entra já preenchida o leitor de tela não anuncia. */}
      <div role="status">
        {convite && (
          <ConviteDeBoasVindas nome={nome}
            aoAceitar={iniciarBoasVindas}
            aoDispensar={() => atualizar(comBoasVindasVistas)} />
        )}
      </div>
      {tour && <Tour key={tour.id} passos={tour.passos} rotulo={tour.rotulo} aoTerminar={terminar} focoDeVolta={focoDeVolta} />}
    </Contexto>
  )
}

/**
 * O convite do primeiro acesso: um cartão discreto, acima da barra de baixo
 * no celular e no canto no computador. Não é modal e não pega o foco — quem
 * chegou para fazer algo segue fazendo; o leitor de tela anuncia sem
 * interromper. Qualquer das duas escolhas conta como vista.
 */
function ConviteDeBoasVindas({ nome, aoAceitar, aoDispensar }: { nome: string; aoAceitar: () => void; aoDispensar: () => void }) {
  const cartao = useRef<HTMLElement>(null)
  const espacador = useRef<HTMLDivElement>(null)
  // O cartão fica por cima do canto da página: no computador, sobre o
  // "Continuar" do curso; no celular, sobre o fim do Início (o link da Ajuda).
  // Enquanto ele está na tela, a página ganha embaixo o espaço que ele ocupa:
  // o scroll-padding do <html> (o mesmo recurso do <main> para a barra de
  // baixo) faz o foco do teclado e as âncoras pararem acima dele, e o
  // espaçador deixa rolar o fim da página para fora de baixo dele. Medido pelo
  // layout (altura + `bottom`), e não pelo getBoundingClientRect: a animação
  // de entrada desloca o cartão. O ResizeObserver acompanha a largura (girar o
  // celular, a fonte que chega) e a troca de posição no lg.
  useEffect(() => {
    const el = cartao.current
    if (!el) return
    const raiz = document.documentElement
    const antes = raiz.style.scrollPaddingBottom
    const medir = () => {
      const ocupa = Math.ceil(el.offsetHeight + (parseFloat(getComputedStyle(el).bottom) || 0))
      raiz.style.scrollPaddingBottom = `${ocupa + 8}px`
      if (espacador.current) espacador.current.style.height = `${ocupa}px`
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => {
      observador.disconnect()
      raiz.style.scrollPaddingBottom = antes
    }
  }, [])
  // O cartão sai da tela com a escolha, levando junto o botão com foco: o foco
  // cairia no <body> e o Tab recomeçaria do topo. Vai para o conteúdo — que é
  // também para onde o tour devolve o foco ao terminar.
  const escolher = (acao: () => void) => () => {
    if (cartao.current?.contains(document.activeElement)) document.getElementById('conteudo')?.focus({ preventScroll: true })
    acao()
  }
  return (
    <>
      <div ref={espacador} aria-hidden="true" />
      <section ref={cartao} aria-label="Convite para o tour de boas-vindas"
        className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none lg:inset-x-auto lg:bottom-5 lg:right-5 lg:mx-0 lg:w-[22rem]">
        <div className="flex gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Compass className="size-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{nome ? `Boas-vindas, ${nome}!` : 'Boas-vindas!'}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Quer um tour de 1 minuto pela área?</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={escolher(aoDispensar)} className={cn(botaoFantasma, 'grow sm:grow-0')}>Agora não</button>
          <button type="button" onClick={escolher(aoAceitar)} className={cn(botaoDoMembro, 'grow sm:grow-0')}>Fazer o tour</button>
        </div>
      </section>
    </>
  )
}

/** "Refazer o tour de boas-vindas", para a página de Ajuda. Roda ali mesmo: o tour só aponta para as abas e o menu da conta. */
export function BotaoDeBoasVindas({ className }: { className?: string }) {
  const ajuda = useAjudaDoMembro()
  if (!ajuda) return null
  return (
    <button type="button" onClick={ajuda.iniciarBoasVindas} className={cn(botaoSecundario, className)}>
      <Compass className="size-4 shrink-0" aria-hidden="true" />Refazer o tour de boas-vindas
    </button>
  )
}
