'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Tour, acharAlvo } from '@/components/ajuda/tour'
import { ondeNaAjuda, rotuloDoTour, type IndiceDaAjuda, type OndeNaAjuda } from '@/lib/ajuda/indice'
import type { PassoDoTour } from '@/lib/ajuda/tipos'
import { comAtalho, comBoasVindas, comTourVisto, progressoZerado, viuTour, type Progresso } from '@/lib/ajuda/progresso'
import { registrarAjuda, type EventoDaAjuda } from '@/app/actions/ajuda'
import { useShell } from '../app-shell'
import { adiantarAjuda, carregarAjuda } from './carregar'

/** O que o layout sabe da pessoa e a ajuda usa (nome nas boas-vindas, "Primeiros passos"). */
export type PessoaNaAjuda = {
  primeiroNome: string
  equipeDaEscola: boolean
  emailConfirmado: boolean
  temFoto: boolean
}

type PedidoDeTour = { passos: PassoDoTour[]; rotulo: string; chave: string | null }
type TourAberto = PedidoDeTour & { id: number }

type AjudaState = {
  progresso: Progresso
  pessoa: PessoaNaAjuda
  /** Onde a pessoa está, pelo índice leve: área, tela interna e a chave do tour (o texto vem sob demanda). */
  onde: OndeNaAjuda | null
  /** Quantos balões têm as boas-vindas desta pessoa (a janela promete o tempo). */
  passosDasBoasVindas: number
  painelAberto: boolean
  abrirPainel: () => void
  fecharPainel: () => void
  alternarPainel: () => void
  /** Sem argumento, o tour da tela aberta. Com passos próprios e sem chave, não fica lembrado como visto. */
  iniciarTour: (pedido?: Partial<PedidoDeTour>) => void
  tourAberto: boolean
  /** Abre as boas-vindas de novo, sem apagar o que já foi visto. */
  reverBoasVindas: () => void
  /** Zera tudo: as boas-vindas voltam agora e cada tela volta a oferecer o tour. */
  recomecar: () => void
  /** A tecla "?" abre o painel (WCAG 2.1.4: dá para desligar, na Central). */
  atalhoLigado: boolean
  ligarAtalho: (ligado: boolean) => void
  boasVindasAberta: boolean
  /** A pessoa saiu das boas-vindas (qualquer saída conta como vista). */
  sairDasBoasVindas: (fazerTour: boolean) => void
  /** Um diálogo da ajuda (painel, boas-vindas) terminou de fechar: é a vez do que esperava por isso (um tour, as boas-vindas). */
  aoFecharDialogo: () => void
  /** A chave do tour que a dica de primeira visita está oferecendo agora (ou null). */
  dica: string | null
  aceitarDica: () => void
  dispensarDica: () => void
}

const AjudaContext = createContext<AjudaState | null>(null)

export function useAjuda() {
  const ctx = useContext(AjudaContext)
  if (!ctx) throw new Error('useAjuda precisa estar dentro do AjudaProvider')
  return ctx
}

/** Quanto a dica de primeira visita espera: a tela assenta antes de aparecer algo no canto. */
const ESPERA_DA_DICA_MS = 1000
/** Quanto o tour de um link com ?tour=1 espera a tela carregar os elementos que ele aponta. */
const ESPERA_DOS_ALVOS_MS = 2500

/**
 * A ajuda da Redação: boas-vindas no primeiro acesso, a dica de primeira
 * visita em cada tela com tour, o tour em si, o painel "?" e o atalho de
 * teclado. Em toda página só vale o índice leve (lib/ajuda/indice.ts, prop
 * `indice`); o texto (lib/ajuda) é baixado quando um tour começa ou o painel
 * abre (./carregar.ts). O que a pessoa já viu vem de
 * user_metadata.ajuda (lib/ajuda/progresso.ts), gravado por
 * app/actions/ajuda.ts.
 *
 * O progresso vem do layout só na montagem. Depois, a verdade é o estado
 * daqui: cada escolha muda a tela na hora e a gravação vai por trás. O layout
 * não é refeito a cada navegação, então adotar o valor do servidor a cada
 * resposta só traria de volta um valor velho no meio de duas escolhas seguidas.
 */
export function AjudaProvider({ children, progressoInicial, pessoa, indice }: {
  children: React.ReactNode
  progressoInicial: Progresso
  pessoa: PessoaNaAjuda
  indice: IndiceDaAjuda
}) {
  const { grupos, buscaAberta, open: menuAberto } = useShell()
  const pathname = usePathname()
  const [progresso, setProgresso] = useState(progressoInicial)
  const [painelAberto, setPainelAberto] = useState(false)
  const [revendo, setRevendo] = useState(false)
  const [tour, setTour] = useState<TourAberto | null>(null)
  const [aguardandoTour, setAguardandoTour] = useState(false)
  const [dicaPronta, setDicaPronta] = useState<string | null>(null)
  /** O que espera um diálogo da ajuda terminar de fechar (abrir um tour, as boas-vindas). */
  const pendente = useRef<(() => void) | null>(null)
  const contador = useRef(0)

  const onde = useMemo(() => ondeNaAjuda(pathname, grupos, indice), [pathname, grupos, indice])
  // Para o que termina depois de um download: a tela ainda é a mesma?
  const caminhoAtual = useRef(pathname)
  useEffect(() => { caminhoAtual.current = pathname }, [pathname])
  const gruposAtuais = useRef(grupos)
  useEffect(() => { gruposAtuais.current = grupos }, [grupos])
  const boasVindasAberta = (progresso.boasVindas === null || revendo) && !tour

  // Mudou de página: o tour e o painel eram da tela anterior. O tour sai sem
  // contar como visto (a pessoa não chegou ao fim; o voltar do navegador não é
  // "já entendi"). Ajuste durante a renderização, como o React recomenda para
  // estado que depende de uma prop: sem um quadro com o tour da tela errada.
  const [caminhoAnterior, setCaminhoAnterior] = useState(pathname)
  if (caminhoAnterior !== pathname) {
    setCaminhoAnterior(pathname)
    setTour(null)
    setPainelAberto(false)
    setDicaPronta(null)
    setAguardandoTour(false)
  }
  // O que esperava um diálogo fechar também era da tela anterior.
  useEffect(() => { pendente.current = null }, [pathname])

  const registrar = useCallback((evento: EventoDaAjuda) => {
    // Otimista: a tela já mudou. Uma falha só faz a dica voltar num próximo acesso.
    registrarAjuda(evento).catch(() => {})
  }, [])

  const marcarTour = useCallback((chave: string) => {
    setProgresso((p) => comTourVisto(p, chave))
    registrar({ tipo: 'tour', chave })
  }, [registrar])

  const abrirTour = useCallback((pedido: PedidoDeTour) => {
    if (!pedido.passos.length) return
    contador.current += 1
    setTour({ ...pedido, id: contador.current })
  }, [])

  /**
   * Abrir um tour ou as boas-vindas de dentro de um diálogo da ajuda espera o
   * diálogo terminar de fechar: senão, a devolução do foco dele (ao botão
   * "?") tiraria o foco do balão ou da janela nova, e o leitor de tela não
   * leria nada. O diálogo avisa pelo aoFecharDialogo; o relógio é a garantia,
   * caso o aviso não chegue.
   */
  const depoisDoDialogo = useCallback((fazer: () => void) => {
    pendente.current = fazer
    window.setTimeout(() => {
      if (pendente.current !== fazer) return
      pendente.current = null
      fazer()
    }, 700)
  }, [])

  /**
   * O tour da tela aberta, com o texto baixado sob demanda. Devolve null se a
   * tela não tem tour, se o download falhar ou se a pessoa mudou de página
   * enquanto ele vinha (o tour seria o da tela anterior).
   */
  const tourDaTela = useCallback(async (): Promise<PedidoDeTour | null> => {
    if (!onde?.chave) return null
    const caminho = caminhoAtual.current
    try {
      const { ajudaDoCaminho } = await carregarAjuda()
      if (caminhoAtual.current !== caminho) return null
      const aqui = ajudaDoCaminho(caminho, gruposAtuais.current)
      return aqui?.tour.length ? { passos: aqui.tour, rotulo: rotuloDoTour(aqui), chave: aqui.chave } : null
    } catch {
      return null
    }
  }, [onde])

  // O estado dos diálogos, lido por quem termina depois de um download.
  const dialogos = useRef({ painelAberto, boasVindasAberta })
  useEffect(() => { dialogos.current = { painelAberto, boasVindasAberta } }, [painelAberto, boasVindasAberta])

  const abrirPorCimaDosDialogos = useCallback((alvo: PedidoDeTour) => {
    if (dialogos.current.painelAberto || dialogos.current.boasVindasAberta) {
      depoisDoDialogo(() => abrirTour(alvo))
      setPainelAberto(false)
      setRevendo(false)
      return
    }
    abrirTour(alvo)
  }, [abrirTour, depoisDoDialogo])

  const iniciarTour = useCallback((pedido?: Partial<PedidoDeTour>) => {
    // Com os passos na mão (o painel já tem o texto), abre na hora.
    if (pedido?.passos) {
      abrirPorCimaDosDialogos({ passos: pedido.passos, rotulo: pedido.rotulo ?? 'Tour', chave: pedido.chave ?? null })
      return
    }
    tourDaTela().then((padrao) => {
      if (padrao) abrirPorCimaDosDialogos({ ...padrao, rotulo: pedido?.rotulo ?? padrao.rotulo })
    })
  }, [tourDaTela, abrirPorCimaDosDialogos])

  const aoFecharDialogo = useCallback(() => {
    const fazer = pendente.current
    pendente.current = null
    fazer?.()
  }, [])

  const terminarTour = useCallback(() => {
    // Concluído ou fechado no X/Esc: nos dois casos a pessoa já viu, e a dica não volta.
    const chave = tour?.chave
    setTour(null)
    if (chave) marcarTour(chave)
  }, [tour, marcarTour])

  const sairDasBoasVindas = useCallback((fazerTour: boolean) => {
    if (!progresso.boasVindas) {
      setProgresso((p) => comBoasVindas(p, new Date().toISOString()))
      registrar({ tipo: 'boas-vindas' })
    }
    setRevendo(false)
    if (!fazerTour) return
    // O texto vem enquanto a janela fecha; o tour abre quando os dois terminarem.
    const carregando = carregarAjuda()
    depoisDoDialogo(() => {
      carregando.then((m) => {
        const passos = pessoa.equipeDaEscola ? m.BOAS_VINDAS_ESCOLA : m.BOAS_VINDAS
        if (passos.length) abrirTour({ passos, rotulo: 'Boas-vindas', chave: null })
      }).catch(() => {})
    })
  }, [progresso.boasVindas, pessoa.equipeDaEscola, registrar, depoisDoDialogo, abrirTour])

  const reverBoasVindas = useCallback(() => {
    if (!painelAberto) { setRevendo(true); return }
    depoisDoDialogo(() => setRevendo(true))
    setPainelAberto(false)
  }, [painelAberto, depoisDoDialogo])

  const recomecar = useCallback(() => {
    // Sem progresso, as boas-vindas abrem sozinhas (boasVindasAberta).
    const zerar = () => { setProgresso((p) => comAtalho(progressoZerado(), !p.semAtalho)); registrar({ tipo: 'recomecar' }) }
    if (!painelAberto) { zerar(); return }
    depoisDoDialogo(zerar)
    setPainelAberto(false)
  }, [painelAberto, depoisDoDialogo, registrar])

  const ligarAtalho = useCallback((ligado: boolean) => {
    setProgresso((p) => comAtalho(p, ligado))
    registrar({ tipo: 'atalho', ligado })
  }, [registrar])

  // A dica de primeira visita: só depois das boas-vindas, numa tela com tour
  // ainda não visto, e nunca por cima de outra coisa aberta.
  const chaveDaTela = onde?.chave ?? null
  const cabeDica = Boolean(progresso.boasVindas && chaveDaTela && !viuTour(progresso, chaveDaTela))
  useEffect(() => {
    if (!cabeDica || !chaveDaTela) return
    const relogio = window.setTimeout(() => setDicaPronta(chaveDaTela), ESPERA_DA_DICA_MS)
    return () => window.clearTimeout(relogio)
  }, [cabeDica, chaveDaTela])
  const livre = !tour && !painelAberto && !boasVindasAberta && !buscaAberta && !menuAberto && !aguardandoTour
  const dica = cabeDica && livre && dicaPronta === chaveDaTela ? chaveDaTela : null

  // Com a dica ou as boas-vindas na tela, o "Fazer o tour" está a um clique: o texto já vem vindo.
  useEffect(() => { if (dica || boasVindasAberta) adiantarAjuda() }, [dica, boasVindasAberta])

  const aceitarDica = useCallback(() => {
    tourDaTela().then((pedido) => { if (pedido) abrirTour(pedido) })
  }, [tourDaTela, abrirTour])

  const dispensarDica = useCallback(() => {
    if (chaveDaTela) marcarTour(chaveDaTela)
  }, [chaveDaTela, marcarTour])

  // ?tour=1 no endereço (o botão "Fazer o tour" da Central): abre o tour da
  // tela ao chegar e tira o parâmetro, para recarregar a página não repetir.
  // Lido de window.location num efeito, e não com useSearchParams: no layout,
  // useSearchParams tiraria a renderização estática de todas as páginas. E o
  // parâmetro sai pelo history.replaceState (que o Next acompanha), não por
  // router.replace: este refaria a página no servidor — e poderia trocá-la
  // pelo esqueleto do loading.tsx no meio do tour.
  const ondeRef = useRef(onde)
  useEffect(() => { ondeRef.current = onde }, [onde])
  const boasVindasVistasRef = useRef(Boolean(progresso.boasVindas))
  useEffect(() => { boasVindasVistasRef.current = Boolean(progresso.boasVindas) }, [progresso.boasVindas])
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search)
    if (busca.get('tour') !== '1') return
    busca.delete('tour')
    const resto = busca.toString()
    window.history.replaceState(null, '', `${pathname}${resto ? `?${resto}` : ''}${window.location.hash}`)
    // Quem ainda não viu as boas-vindas vê as boas-vindas primeiro.
    if (!ondeRef.current?.chave || !boasVindasVistasRef.current) return
    // A página pode ainda estar chegando (o esqueleto do loading.tsx vem antes):
    // o texto baixa enquanto isso, e o tour espera aparecer algum elemento que
    // ele aponta, até um limite.
    let relogio = 0
    let cancelado = false
    setAguardandoTour(true)
    tourDaTela().then((pedido) => {
      if (cancelado) return
      if (!pedido) { setAguardandoTour(false); return }
      const comAlvo = pedido.passos.filter((p) => p.alvo && !p.alvo.startsWith('shell.'))
      const inicio = performance.now()
      const tentar = () => {
        if (cancelado) return
        const pronto = !comAlvo.length || comAlvo.some((p) => acharAlvo(p.alvo)) || performance.now() - inicio > ESPERA_DOS_ALVOS_MS
        if (!pronto) { relogio = window.setTimeout(tentar, 120); return }
        setAguardandoTour(false)
        abrirTour(pedido)
      }
      // Um respiro antes da primeira tentativa: se o link veio do painel "?", ele
      // ainda está fechando e devolvendo o foco — o balão tem de abrir depois.
      relogio = window.setTimeout(tentar, 300)
    })
    return () => { cancelado = true; window.clearTimeout(relogio) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na chegada a cada página; tourDaTela muda junto com ela
  }, [pathname, abrirTour])

  // "?" abre e fecha o painel de qualquer tela — menos de dentro de um campo
  // de texto (ali o "?" é para ser digitado), com o tour ou as boas-vindas
  // abertos, com outro diálogo na frente (a busca, o menu do celular, um
  // diálogo da própria página) ou com o atalho desligado na Central.
  const bloqueio = useRef(false)
  useEffect(() => { bloqueio.current = Boolean(tour) || boasVindasAberta || Boolean(progresso.semAtalho) }, [tour, boasVindasAberta, progresso.semAtalho])
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return
      if (bloqueio.current || ehCampoDeTexto(e.target)) return
      const outroDialogo = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some((el) => !el.closest('[data-painel-de-ajuda]'))
      if (outroDialogo) return
      e.preventDefault()
      setPainelAberto((aberto) => !aberto)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const abrirPainel = useCallback(() => setPainelAberto(true), [])
  const fecharPainel = useCallback(() => setPainelAberto(false), [])
  const alternarPainel = useCallback(() => setPainelAberto((aberto) => !aberto), [])

  const valor = useMemo<AjudaState>(() => ({
    progresso, pessoa, onde, passosDasBoasVindas: pessoa.equipeDaEscola ? indice.passosDasBoasVindas.escola : indice.passosDasBoasVindas.equipe, painelAberto, abrirPainel, fecharPainel, alternarPainel,
    iniciarTour, tourAberto: Boolean(tour), reverBoasVindas, recomecar, atalhoLigado: !progresso.semAtalho, ligarAtalho,
    boasVindasAberta, sairDasBoasVindas, aoFecharDialogo, dica, aceitarDica, dispensarDica,
  }), [progresso, pessoa, onde, indice, painelAberto, abrirPainel, fecharPainel, alternarPainel, iniciarTour, tour, reverBoasVindas, recomecar, ligarAtalho, boasVindasAberta, sairDasBoasVindas, aoFecharDialogo, dica, aceitarDica, dispensarDica])

  return (
    <AjudaContext.Provider value={valor}>
      {children}
      {tour && <Tour key={tour.id} passos={tour.passos} rotulo={tour.rotulo} aoTerminar={terminarTour} />}
    </AjudaContext.Provider>
  )
}

/** O foco está num lugar de digitar? Lá o "?" é texto, não atalho. */
function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  if (alvo.isContentEditable) return true
  return alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT'
}
