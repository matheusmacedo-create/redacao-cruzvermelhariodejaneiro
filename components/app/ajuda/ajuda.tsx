'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  /**
   * A trava do foco que está valendo (um número) ou null: um diálogo da ajuda
   * fechou para dar lugar a um tour ou às boas-vindas, que pegam o foco. Os
   * diálogos leem isto por useFocoAoFecharDialogo.
   */
  travaDoFoco: () => number | null
  /** A chave do tour que a dica de primeira visita está oferecendo agora (ou null). */
  dica: string | null
  aceitarDica: () => void
  dispensarDica: () => void
  /** O texto de um tour pedido (na dica, nas boas-vindas) ainda está chegando: a dica mostra "Carregando…". */
  carregandoTour: boolean
  /** Um tour pedido não veio (o texto não baixou): o aviso no canto oferece tentar de novo. */
  falhouTour: boolean
  tentarTourDeNovo: () => void
  esquecerFalhaDoTour: () => void
}

const AjudaContext = createContext<AjudaState | null>(null)

export function useAjuda() {
  const ctx = useContext(AjudaContext)
  if (!ctx) throw new Error('useAjuda precisa estar dentro do AjudaProvider')
  return ctx
}

/** Quanto a dica de primeira visita espera: a tela assenta antes de aparecer algo no canto. */
const ESPERA_DA_DICA_MS = 1000
/** Quanto o tour de um link com ?tour=1 espera, depois de a página chegar, os elementos que ele aponta. */
const ESPERA_DOS_ALVOS_MS = 2500
/**
 * Quanto o ?tour=1 espera o esqueleto do loading.tsx (`data-carregando`)
 * sair. Aberto sobre o esqueleto, o tour perde de vez os passos opcionais
 * (a triagem é na abertura) e manda os outros para o meio da tela.
 */
const ESPERA_DA_PAGINA_MS = 10_000

/** A página ainda está chegando: o esqueleto do loading.tsx está no lugar dela. */
const paginaChegando = () => Boolean(document.querySelector('[data-carregando]'))

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
  /** O texto de um tour pedido (a dica, as boas-vindas) está chegando. */
  const [carregandoTour, setCarregandoTour] = useState(false)
  /** O tour que não veio, para o "Tentar de novo" do aviso: o da tela ou o das boas-vindas. */
  const [falhaDoTour, setFalhaDoTour] = useState<'tela' | 'boas-vindas' | null>(null)
  /** Cada pedido de tour ganha um número: a resposta de um pedido antigo (desistido, de outra tela) não vale. */
  const ultimoPedido = useRef(0)
  /**
   * As boas-vindas acabaram de fechar nesta tela: a dica dela espera a próxima
   * visita. Logo depois de alguém dizer "Agora não" a um tour (ou de acabar
   * um), oferecer outro no canto é insistir.
   */
  const [boasVindasFecharamAqui, setBoasVindasFecharamAqui] = useState(false)
  /** O que espera um diálogo da ajuda terminar de fechar (abrir um tour, as boas-vindas). */
  const pendente = useRef<(() => void) | null>(null)
  // Cada trava tem um número: o diálogo que abriu com uma trava já valendo (as
  // boas-vindas pedidas pelo painel) não é o que ela segura.
  const trava = useRef({ numero: 0, valendo: false })
  const soltarFoco = useRef(0)
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
    setBoasVindasFecharamAqui(false)
    setCarregandoTour(false)
    setFalhaDoTour(null)
  }
  // O que esperava um diálogo fechar também era da tela anterior, e o tour que estava baixando também.
  useEffect(() => { pendente.current = null; ultimoPedido.current += 1 }, [pathname])

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
    // O diálogo que fecha não devolve o foco ao botão que o abriu: a Base UI
    // faria isso num microtask depois de o balão pegar o foco, e o leitor de
    // tela leria o botão em vez do passo. O relógio solta a trava depois que
    // o fechamento (uns 200 ms de animação) com certeza terminou.
    trava.current = { numero: trava.current.numero + 1, valendo: true }
    window.clearTimeout(soltarFoco.current)
    soltarFoco.current = window.setTimeout(() => { trava.current = { ...trava.current, valendo: false } }, 1500)
    window.setTimeout(() => {
      if (pendente.current !== fazer) return
      pendente.current = null
      fazer()
    }, 700)
  }, [])
  const travaDoFoco = useCallback(() => (trava.current.valendo ? trava.current.numero : null), [])

  /**
   * O tour da tela aberta, com o texto baixado sob demanda. Devolve null se a
   * tela não tem tour ou se a pessoa mudou de página enquanto ele vinha (o
   * tour seria o da tela anterior). Se o download falhar, rejeita: quem pediu
   * avisa (um botão que não faz nada parece quebrado).
   */
  const tourDaTela = useCallback(async (): Promise<PedidoDeTour | null> => {
    if (!onde?.chave) return null
    const caminho = caminhoAtual.current
    const { ajudaDoCaminho } = await carregarAjuda()
    if (caminhoAtual.current !== caminho) return null
    const aqui = ajudaDoCaminho(caminho, gruposAtuais.current)
    return aqui?.tour.length ? { passos: aqui.tour, rotulo: rotuloDoTour(aqui), chave: aqui.chave } : null
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

  /**
   * Um tour que precisa baixar o texto antes de abrir (o da tela, o das
   * boas-vindas). Enquanto baixa, a dica mostra que está carregando e a
   * tecla "?" espera; se falhar, o aviso no canto oferece tentar de novo. E
   * abre por cima do que tiver sido aberto no meio tempo (o painel "?"), em
   * vez de dois diálogos modais um sobre o outro.
   */
  const baixarEAbrir = useCallback((qual: 'tela' | 'boas-vindas', baixar: () => Promise<PedidoDeTour | null>) => {
    const numero = ++ultimoPedido.current
    setCarregandoTour(true)
    setFalhaDoTour(null)
    baixar().then(
      (pedido) => { if (numero === ultimoPedido.current && pedido) abrirPorCimaDosDialogos(pedido) },
      () => { if (numero === ultimoPedido.current) setFalhaDoTour(qual) },
    ).finally(() => { if (numero === ultimoPedido.current) setCarregandoTour(false) })
  }, [abrirPorCimaDosDialogos])

  const pedirTourDaTela = useCallback(() => baixarEAbrir('tela', tourDaTela), [baixarEAbrir, tourDaTela])

  const pedirTourDasBoasVindas = useCallback(() => {
    baixarEAbrir('boas-vindas', async () => {
      const m = await carregarAjuda()
      const passos = pessoa.equipeDaEscola ? m.BOAS_VINDAS_ESCOLA : m.BOAS_VINDAS
      return passos.length ? { passos, rotulo: 'Boas-vindas', chave: null } : null
    })
  }, [baixarEAbrir, pessoa.equipeDaEscola])

  const iniciarTour = useCallback((pedido?: Partial<PedidoDeTour>) => {
    // Com os passos na mão (o painel já tem o texto), abre na hora.
    if (pedido?.passos) {
      abrirPorCimaDosDialogos({ passos: pedido.passos, rotulo: pedido.rotulo ?? 'Tour', chave: pedido.chave ?? null })
      return
    }
    pedirTourDaTela()
  }, [pedirTourDaTela, abrirPorCimaDosDialogos])

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
    setBoasVindasFecharamAqui(true)
    if (!fazerTour) return
    // O texto já vinha desde que a janela abriu (adiantarAjuda); o tour abre
    // quando ela terminar de fechar. Sem conexão, o aviso no canto diz que
    // não deu, em vez de a janela sumir e o tour nunca vir.
    adiantarAjuda()
    depoisDoDialogo(pedirTourDasBoasVindas)
  }, [progresso.boasVindas, registrar, depoisDoDialogo, pedirTourDasBoasVindas])

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

  // A dica de primeira visita: só depois das boas-vindas (e não na mesma tela
  // em que elas acabaram de fechar), numa tela com tour ainda não visto, e
  // nunca por cima de outra coisa aberta.
  const chaveDaTela = onde?.chave ?? null
  const cabeDica = Boolean(progresso.boasVindas && chaveDaTela && !viuTour(progresso, chaveDaTela) && !boasVindasFecharamAqui)
  useEffect(() => {
    if (!cabeDica || !chaveDaTela) return
    // A espera conta a partir de quando a página chega: com o esqueleto do
    // loading.tsx ainda na tela, a dica ofereceria um tour que abriria sobre
    // ele e perderia os passos (os alvos ainda não existem).
    let relogio = 0
    const tentar = (esperou: boolean) => {
      if (paginaChegando()) { relogio = window.setTimeout(() => tentar(false), 250); return }
      if (!esperou) { relogio = window.setTimeout(() => tentar(true), ESPERA_DA_DICA_MS); return }
      setDicaPronta(chaveDaTela)
    }
    relogio = window.setTimeout(() => tentar(true), ESPERA_DA_DICA_MS)
    return () => window.clearTimeout(relogio)
  }, [cabeDica, chaveDaTela])
  const livre = !tour && !painelAberto && !boasVindasAberta && !buscaAberta && !menuAberto && !aguardandoTour
  // O aviso de falha ocupa o lugar da dica, no mesmo canto.
  const falhouTour = Boolean(falhaDoTour) && livre
  const dica = cabeDica && livre && !falhaDoTour && dicaPronta === chaveDaTela ? chaveDaTela : null

  // Com a dica ou as boas-vindas na tela, o "Fazer o tour" está a um clique: o texto já vem vindo.
  useEffect(() => { if (dica || boasVindasAberta) adiantarAjuda() }, [dica, boasVindasAberta])

  const aceitarDica = useCallback(() => {
    if (!carregandoTour) pedirTourDaTela()
  }, [carregandoTour, pedirTourDaTela])

  const dispensarDica = useCallback(() => {
    // "Agora não" com o tour ainda chegando: desiste dele.
    ultimoPedido.current += 1
    setCarregandoTour(false)
    if (chaveDaTela) marcarTour(chaveDaTela)
  }, [chaveDaTela, marcarTour])

  const tentarTourDeNovo = useCallback(() => {
    if (falhaDoTour === 'boas-vindas') pedirTourDasBoasVindas()
    else if (falhaDoTour === 'tela') pedirTourDaTela()
  }, [falhaDoTour, pedirTourDasBoasVindas, pedirTourDaTela])

  // Fechado o aviso, a dica desta tela (se houver) só volta na próxima visita: reaparecer no mesmo instante seria insistir.
  const esquecerFalhaDoTour = useCallback(() => { setFalhaDoTour(null); setDicaPronta(null) }, [])

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
    if (new URLSearchParams(window.location.search).get('tour') !== '1') return
    // O parâmetro só sai quando o tour abre (ou quando não vai abrir): o Strict
    // Mode do desenvolvimento desfaz e refaz este efeito na montagem, e a
    // segunda vez precisa ainda encontrá-lo — senão o link abria a página sem tour.
    const tirarDoEndereco = () => {
      const busca = new URLSearchParams(window.location.search)
      busca.delete('tour')
      const resto = busca.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${resto ? `?${resto}` : ''}${window.location.hash}`)
    }
    // Quem ainda não viu as boas-vindas vê as boas-vindas primeiro.
    if (!ondeRef.current?.chave || !boasVindasVistasRef.current) { tirarDoEndereco(); return }
    // A página pode ainda estar chegando (o esqueleto do loading.tsx vem antes):
    // o texto baixa enquanto isso, e o tour espera aparecer algum elemento que
    // ele aponta, até um limite.
    let relogio = 0
    let cancelado = false
    const inicio = performance.now()
    setAguardandoTour(true)
    tourDaTela().then((pedido) => {
      if (cancelado) return
      if (!pedido) { tirarDoEndereco(); setAguardandoTour(false); return }
      const comAlvo = pedido.passos.filter((p) => p.alvo && !p.alvo.startsWith('shell.'))
      let semEsqueletoDesde = 0
      const tentar = () => {
        if (cancelado) return
        const agora = performance.now()
        // Primeiro a página (o esqueleto sai), depois algum elemento que o tour aponta; cada espera com limite.
        if (paginaChegando() && agora - inicio < ESPERA_DA_PAGINA_MS) { relogio = window.setTimeout(tentar, 120); return }
        semEsqueletoDesde ||= agora
        const pronto = !comAlvo.length || comAlvo.some((p) => acharAlvo(p.alvo)) || agora - semEsqueletoDesde > ESPERA_DOS_ALVOS_MS
        if (!pronto) { relogio = window.setTimeout(tentar, 120); return }
        tirarDoEndereco()
        setAguardandoTour(false)
        abrirPorCimaDosDialogos(pedido)
      }
      // Um respiro antes da primeira tentativa: se o link veio do painel "?", ele
      // ainda está fechando e devolvendo o foco — o balão tem de abrir depois.
      relogio = window.setTimeout(tentar, 300)
    }, () => {
      // Sem conexão: o aviso no canto oferece tentar de novo (o parâmetro sai, para não repetir ao recarregar).
      if (cancelado) return
      tirarDoEndereco()
      setAguardandoTour(false)
      setFalhaDoTour('tela')
    })
    return () => { cancelado = true; window.clearTimeout(relogio) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na chegada a cada página; tourDaTela muda junto com ela
  }, [pathname, abrirPorCimaDosDialogos])

  // "?" abre e fecha o painel de qualquer tela — menos de dentro de um campo
  // de texto (ali o "?" é para ser digitado), com o tour ou as boas-vindas
  // abertos, com outro diálogo na frente (a busca, o menu do celular, um
  // diálogo da própria página) ou com o atalho desligado na Central.
  // Com um tour a caminho (o texto baixando, a página chegando), o "?" também espera: o tour abriria por cima do painel.
  const bloqueio = useRef(false)
  useEffect(() => { bloqueio.current = Boolean(tour) || boasVindasAberta || Boolean(progresso.semAtalho) || aguardandoTour || carregandoTour }, [tour, boasVindasAberta, progresso.semAtalho, aguardandoTour, carregandoTour])
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

  // Fechado o tour, o foco volta ao "?" quando o que o tinha sumiu (a dica) ou era a página toda.
  const focoDeVolta = useCallback(() => acharAlvo('shell.ajuda'), [])

  const abrirPainel = useCallback(() => setPainelAberto(true), [])
  const fecharPainel = useCallback(() => setPainelAberto(false), [])
  const alternarPainel = useCallback(() => setPainelAberto((aberto) => !aberto), [])

  const valor = useMemo<AjudaState>(() => ({
    progresso, pessoa, onde, passosDasBoasVindas: pessoa.equipeDaEscola ? indice.passosDasBoasVindas.escola : indice.passosDasBoasVindas.equipe, painelAberto, abrirPainel, fecharPainel, alternarPainel,
    iniciarTour, tourAberto: Boolean(tour), reverBoasVindas, recomecar, atalhoLigado: !progresso.semAtalho, ligarAtalho,
    boasVindasAberta, sairDasBoasVindas, aoFecharDialogo, travaDoFoco, dica, aceitarDica, dispensarDica,
    carregandoTour, falhouTour, tentarTourDeNovo, esquecerFalhaDoTour,
  }), [progresso, pessoa, onde, indice, painelAberto, abrirPainel, fecharPainel, alternarPainel, iniciarTour, tour, reverBoasVindas, recomecar, ligarAtalho, boasVindasAberta, sairDasBoasVindas, aoFecharDialogo, travaDoFoco, dica, aceitarDica, dispensarDica, carregandoTour, falhouTour, tentarTourDeNovo, esquecerFalhaDoTour])

  return (
    <AjudaContext.Provider value={valor}>
      {children}
      {tour && <Tour key={tour.id} passos={tour.passos} rotulo={tour.rotulo} aoTerminar={terminarTour} focoDeVolta={focoDeVolta} />}
    </AjudaContext.Provider>
  )
}

/**
 * O `finalFocus` dos diálogos da ajuda (o painel "?" e as boas-vindas).
 * Fechando para dar lugar a um tour ou às boas-vindas (a trava pedida depois
 * que ele abriu), não devolve o foco: quem abre pega. No resto, devolve a
 * quem o tinha na abertura — ou ao "?", quando ninguém tinha (o <body>: as
 * boas-vindas abriram sozinhas, ou pelo painel, que fechou antes sem
 * devolver; o Safari não dá foco ao botão clicado) ou quando esse elemento
 * saiu da tela. Sem isto, o foco ia para o começo da página e o teclado
 * recomeçava do topo.
 */
export function useFocoAoFecharDialogo(aberto: boolean): () => boolean | HTMLElement {
  const { travaDoFoco } = useAjuda()
  const antes = useRef<Element | null>(null)
  const travaNaAbertura = useRef<number | null>(null)
  // Efeito de layout: roda antes de a Base UI levar o foco para dentro do diálogo (ela faz isso num microtask).
  useLayoutEffect(() => {
    if (!aberto) return
    antes.current = document.activeElement
    travaNaAbertura.current = travaDoFoco()
  }, [aberto, travaDoFoco])
  return useCallback(() => {
    const valendo = travaDoFoco()
    if (valendo !== null && valendo !== travaNaAbertura.current) return false
    const anterior = antes.current
    if (anterior instanceof HTMLElement && anterior.isConnected && anterior !== document.body) return anterior
    return acharAlvo('shell.ajuda') ?? true
  }, [travaDoFoco])
}

/** O foco está num lugar de digitar? Lá o "?" é texto, não atalho. */
function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  if (alvo.isContentEditable) return true
  return alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT'
}
