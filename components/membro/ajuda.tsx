'use client'

import { createContext, use, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { Compass } from 'lucide-react'
import { Tour } from '@/components/ajuda/tour'
import { BOAS_VINDAS_DO_MEMBRO, tourDoMembro, type TourDoMembro } from '@/lib/ajuda/membro'
import type { PassoDoTour } from '@/lib/ajuda/tipos'
import { PROGRESSO_VAZIO, comBoasVindas, comTourVisto, lerProgresso, type Progresso } from '@/lib/ajuda/progresso'
import { cn } from '@/lib/utils'
import { botaoDoMembro, botaoFantasma, botaoSecundario } from './marca'
import { SECOES } from './navegacao'

/**
 * A ajuda da Área do Voluntário: o convite de boas-vindas no primeiro acesso,
 * o tour (de boas-vindas, de cada destino e das telas internas) e o `?tour=1`
 * dos links da Ajuda. O conteúdo vem de lib/ajuda/membro.ts; o motor, de
 * components/ajuda/tour.tsx.
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
/** Quanto um `?tour=1` espera o esqueleto de carregamento (loading.tsx, `data-carregando`) sair. */
const ESPERA_DA_PAGINA_MS = 3000

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

/** "Tour · Formação", "Tour · Prova final". */
function rotuloDoTour(t: TourDoMembro): string {
  return `Tour · ${t.tela?.rotulo ?? SECOES.find((s) => s.href === t.destino)?.rotulo ?? 'Área do Voluntário'}`
}

export function AjudaDoMembro({ previa, nome, children }: {
  /** Visualização da equipe: o convite não abre sozinho e nada fica gravado. */
  previa: boolean
  /** O primeiro nome, para o convite. */
  nome: string
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

  const daTela = useMemo(() => tourDoMembro(pathname), [pathname])

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

  const iniciarBoasVindas = useCallback(() => {
    atualizar(comBoasVindasVistas)
    abrir({ passos: BOAS_VINDAS_DO_MEMBRO, rotulo: 'Boas-vindas', chave: null })
  }, [atualizar, abrir])

  /** Pedir um tour é sinal de que a pessoa já achou a ajuda: o convite não precisa voltar. */
  const abrirTourDe = useCallback((t: TourDoMembro) => {
    atualizar(comBoasVindasVistas)
    abrir({ passos: t.passos, rotulo: rotuloDoTour(t), chave: t.chave })
  }, [atualizar, abrir])

  const iniciarTourDaTela = useCallback(() => {
    if (daTela) abrirTourDe(daTela)
  }, [daTela, abrirTourDe])

  const terminar = useCallback(() => {
    // Concluído ou fechado no X/Esc: nos dois casos a pessoa já viu.
    const chave = tour?.chave
    setTour(null)
    if (chave) atualizar((p) => comTourVisto(p, chave))
  }, [tour, atualizar])

  // ?tour=1 no endereço (o "Fazer o tour" da Ajuda): abre o tour da tela ao
  // chegar e tira o parâmetro, para recarregar a página não repetir. Lido de
  // window.location, e não com useSearchParams: é o layout, e o endereço só
  // interessa uma vez, ao chegar.
  const abrirQuandoPronta = useEffectEvent((t: TourDoMembro) => abrirTourDe(t))
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search)
    if (busca.get('tour') !== '1') return
    const tirarDoEndereco = () => {
      busca.delete('tour')
      const resto = busca.toString()
      window.history.replaceState(null, '', `${pathname}${resto ? `?${resto}` : ''}${window.location.hash}`)
    }
    const aqui = tourDoMembro(pathname)
    if (!aqui) {
      tirarDoEndereco()
      return
    }
    // Numa navegação, o esqueleto do loading.tsx vem antes da página: o tour
    // espera ele sair (até um limite), senão os passos opcionais sumiriam todos.
    // O parâmetro só sai quando o tour abre: se o efeito for desfeito antes
    // (o Strict Mode roda duas vezes no desenvolvimento), a segunda vez ainda o encontra.
    tourPendente.current = true
    const inicio = performance.now()
    let relogio = 0
    const tentar = () => {
      if (document.querySelector('[data-carregando]') && performance.now() - inicio < ESPERA_DA_PAGINA_MS) {
        relogio = window.setTimeout(tentar, 100)
        return
      }
      tourPendente.current = false
      tirarDoEndereco()
      abrirQuandoPronta(aqui)
    }
    relogio = window.setTimeout(tentar, 0)
    return () => {
      window.clearTimeout(relogio)
      tourPendente.current = false
    }
  }, [pathname])

  // O convite de boas-vindas: no Início, para quem ainda não viu, fora da visualização da equipe.
  const cabeConvite = cliente && !previa && pathname === '/membro' && !progresso.boasVindas
  useEffect(() => {
    if (!cabeConvite) return
    const relogio = window.setTimeout(() => { if (!tourPendente.current) setConviteLiberado(true) }, ESPERA_DO_CONVITE_MS)
    return () => window.clearTimeout(relogio)
  }, [cabeConvite])
  const convite = cabeConvite && conviteLiberado && !tour

  const valor = useMemo<AjudaDoMembroState>(() => ({
    progresso, temTourNaTela: !!daTela, iniciarTourDaTela, iniciarBoasVindas,
  }), [progresso, daTela, iniciarTourDaTela, iniciarBoasVindas])

  return (
    <Contexto value={valor}>
      {children}
      {convite && (
        <ConviteDeBoasVindas nome={nome}
          aoAceitar={iniciarBoasVindas}
          aoDispensar={() => atualizar(comBoasVindasVistas)} />
      )}
      {tour && <Tour key={tour.id} passos={tour.passos} rotulo={tour.rotulo} aoTerminar={terminar} />}
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
  return (
    <section role="status" aria-label="Convite para o tour de boas-vindas"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none lg:inset-x-auto lg:bottom-5 lg:right-5 lg:mx-0 lg:w-[22rem]">
      <div className="flex gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Compass className="size-5" /></span>
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{nome ? `Boas-vindas, ${nome}!` : 'Boas-vindas!'}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Quer um tour de 1 minuto pela área?</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={aoDispensar} className={cn(botaoFantasma, 'grow sm:grow-0')}>Agora não</button>
        <button type="button" onClick={aoAceitar} className={cn(botaoDoMembro, 'grow sm:grow-0')}>Fazer o tour</button>
      </div>
    </section>
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
