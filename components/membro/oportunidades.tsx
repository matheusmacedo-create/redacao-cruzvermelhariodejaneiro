'use client'

import { createContext, use, useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarClock, CalendarPlus, CalendarX2, CheckCircle2, Clock, Hourglass, Loader2, MapPin, Radio, Timer, UserX, Users, type LucideIcon,
} from 'lucide-react'
import { cancelarInscricao, inscrever } from '@/app/actions/membro'
import type { CartaoDaOportunidade, SeloDoCartao } from '@/lib/membro/oportunidades'
import { cn } from '@/lib/utils'
import { botaoContorno, botaoDoMembro, botaoPerigo, botaoSecundario } from './marca'
import { Recado, Selo, type TomDoSelo } from './pecas'

/**
 * O retorno de uma ação (inscrever, cancelar, sair da espera). Mora acima dos
 * cartões porque o cartão muda de seção depois da ação ("Abertas" → "Minhas
 * inscrições"): o React desmonta o antigo e monta um novo, e um estado local
 * se perderia no caminho.
 */
type Retorno = { id: string; titulo: string; tipo: 'sucesso' | 'aviso'; texto: string; vez: number }
type ContextoDoRetorno = { retorno: Retorno | null; avisar: (r: Omit<Retorno, 'vez'>) => void; limpar: () => void }
const Contexto = createContext<ContextoDoRetorno>({ retorno: null, avisar: () => {}, limpar: () => {} })

/**
 * Envolve as seções da página. `visiveis` são os ids dos cartões na tela:
 * se o cartão sumiu depois da ação (ex.: cancelou com as inscrições
 * encerradas), o recado aparece no alto da lista, com o título da atividade.
 */
export function ListaDeOportunidades({ visiveis, children }: { visiveis: string[]; children: React.ReactNode }) {
  const [retorno, setRetorno] = useState<Retorno | null>(null)
  const avisar = (r: Omit<Retorno, 'vez'>) => setRetorno((antes) => ({ ...r, vez: (antes?.vez ?? 0) + 1 }))
  const limpar = () => setRetorno(null)
  const semCartao = retorno && !visiveis.includes(retorno.id) ? retorno : null
  return (
    <Contexto value={{ retorno, avisar, limpar }}>
      {semCartao && <RecadoDoRetorno key={semCartao.vez} r={semCartao} comTitulo />}
      {children}
    </Contexto>
  )
}

/**
 * O recado de sucesso. Ao aparecer, rola até o cartão e recebe o foco: o
 * botão tocado pode ter sumido (o cartão mudou de seção), e o foco não pode
 * cair no nada. `key={vez}` remonta a cada ação, para rolar de novo.
 */
function RecadoDoRetorno({ r, comTitulo = false }: { r: Retorno; comTitulo?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const alvo = el.closest('article') ?? el
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // `nearest`: se o cartão já está à vista, a tela não pula.
    alvo.scrollIntoView({ block: 'nearest', behavior: suave ? 'smooth' : 'auto' })
    el.focus({ preventScroll: true })
  }, [])
  return <Recado ref={ref} tabIndex={-1} tipo={r.tipo} titulo={comTitulo ? r.titulo : undefined} className="outline-none">{r.texto}</Recado>
}

const SELOS: Record<SeloDoCartao, { tom: TomDoSelo; icone: LucideIcon }> = {
  confirmada: { tom: 'sucesso', icone: CheckCircle2 },
  espera: { tom: 'aviso', icone: Hourglass },
  andamento: { tom: 'neutro', icone: Radio },
  cancelada: { tom: 'perigo', icone: CalendarX2 },
  presente: { tom: 'sucesso', icone: CheckCircle2 },
  ausente: { tom: 'neutro', icone: UserX },
  aguardando: { tom: 'neutro', icone: Clock },
}

/**
 * O cartão de uma oportunidade. Chega pronto do servidor
 * (`cartaoDaOportunidade`): textos, selos e ações já decididos, com o mesmo
 * `agora` da página. `id="o-{id}"` é a âncora que o Início usa.
 */
export function CartaoDeOportunidade({ c }: { c: CartaoDaOportunidade }) {
  const { retorno } = use(Contexto)
  const idDoTitulo = `o-${c.id}-titulo`
  return (
    <article id={`o-${c.id}`} data-oportunidade={c.id} aria-labelledby={idDoTitulo}
      // Margem de rolagem embaixo: no celular a barra de navegação cobre o pé da tela.
      className="flex scroll-mb-[calc(5.5rem+env(safe-area-inset-bottom))] flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5 lg:scroll-mb-4">
      <div className="flex gap-3 sm:gap-4">
        {/* A data já vai por extenso logo abaixo; o bloco é só visual. */}
        <div aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center justify-center self-start rounded-lg bg-muted py-2">
          <span className="text-2xl font-bold leading-none tabular-nums">{c.dia}</span>
          <span className="mt-1 text-xs font-semibold tracking-wide text-muted-foreground">{c.mes}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{c.tipo}</p>
          <h3 id={idDoTitulo} className={cn('font-semibold wrap-break-word', c.cancelada && 'text-muted-foreground')}>{c.titulo}</h3>
          {c.selos.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.selos.map((s) => <Selo key={s.tipo} tom={SELOS[s.tipo].tom} icone={SELOS[s.tipo].icone}>{s.texto}</Selo>)}
            </div>
          )}
        </div>
      </div>
      {/* No celular ocupa a largura toda do cartão; a partir de sm, alinha com o título. */}
      <div className="flex min-w-0 flex-col gap-3 sm:pl-18">
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4">
          <Metadado icone={Clock}>{c.quando}</Metadado>
          {c.local && <Metadado icone={MapPin}>{c.local}</Metadado>}
          {c.vagas && <Metadado icone={Users}>{c.vagas}</Metadado>}
          {c.prazo && <Metadado icone={CalendarClock}>{c.prazo}</Metadado>}
          {c.horas && <Metadado icone={Timer}>{c.horas}</Metadado>}
        </ul>
        {c.motivo && <p className="text-sm text-muted-foreground wrap-break-word"><span className="font-medium text-foreground">Motivo:</span> {c.motivo}</p>}
        {c.descricao && <Descricao id={`o-${c.id}-descricao`} texto={c.descricao} />}
        {retorno?.id === c.id && <RecadoDoRetorno key={retorno.vez} r={retorno} />}
        <Acoes c={c} idDoTitulo={idDoTitulo} />
      </div>
    </article>
  )
}

function Metadado({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return <li className="flex min-w-0 items-start gap-1.5"><Icone className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 wrap-break-word">{children}</span></li>
}

/**
 * Descrição em até 3 linhas, com "Ler mais" só quando o texto foi cortado de
 * verdade. Quem mede é o navegador (o corte depende da largura da tela); o
 * ResizeObserver já dispara uma vez ao começar a observar.
 */
function Descricao({ id, texto }: { id: string; texto: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [aberta, setAberta] = useState(false)
  const [cortada, setCortada] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || aberta) return
    const observador = new ResizeObserver(() => setCortada(el.scrollHeight > el.clientHeight + 1))
    observador.observe(el)
    return () => observador.disconnect()
  }, [aberta])
  return (
    <div className="flex flex-col items-start">
      <p id={id} ref={ref} className={cn('whitespace-pre-line text-sm text-foreground wrap-break-word', !aberta && 'line-clamp-3')}>{texto}</p>
      {(cortada || aberta) && (
        <button type="button" aria-expanded={aberta} aria-controls={id} onClick={() => setAberta(!aberta)}
          className="-ml-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline">
          {aberta ? 'Ler menos' : 'Ler mais'}
        </button>
      )}
    </div>
  )
}

/**
 * Troca o rótulo pelo verbo em andamento sem mudar a largura do botão: os
 * dois ocupam a mesma célula da grade, e o que não vale fica invisível (e
 * fora do leitor de tela).
 */
function Rotulo({ ocupado, rotulo, andamento }: { ocupado: boolean; rotulo: string; andamento: string }) {
  return (
    <span className="grid">
      <span className={cn('col-start-1 row-start-1', ocupado && 'invisible')}>{rotulo}</span>
      <span className={cn('col-start-1 row-start-1 inline-flex items-center justify-center gap-2', !ocupado && 'invisible')}>
        <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />{andamento}
      </span>
    </span>
  )
}

type Resposta = { erro?: string; situacao?: string }

/**
 * As ações do cartão. Sair (da inscrição ou da espera) pede confirmação no
 * próprio cartão, no lugar do `confirm()` do navegador, que não diz de qual
 * atividade se trata. Enquanto a ação corre, os botões ficam com
 * `aria-disabled` e não `disabled`: botão desativado perde o foco do teclado.
 */
function Acoes({ c, idDoTitulo }: { c: CartaoDaOportunidade; idDoTitulo: string }) {
  const router = useRouter()
  const { avisar, limpar } = use(Contexto)
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const idDaPergunta = useId()
  const manter = useRef<HTMLButtonElement>(null)
  const botaoSair = useRef<HTMLButtonElement>(null)
  const devolverFoco = useRef(false)

  // Abriu a confirmação: foco na opção que não desfaz nada. Desistiu: o foco volta ao botão de sair.
  useEffect(() => {
    if (confirmando) manter.current?.focus()
    else if (devolverFoco.current) {
      devolverFoco.current = false
      botaoSair.current?.focus()
    }
  }, [confirmando])

  const { participar, agenda, sair, semVolta } = c.acoes
  if (!participar && !agenda && !sair) return null

  const rodar = (acao: () => Promise<Resposta>, sucesso: (r: Resposta) => Pick<Retorno, 'tipo' | 'texto'>) => {
    if (ocupado) return
    iniciar(async () => {
      setErro('')
      limpar()
      const r = await acao()
      if (r.erro) {
        setErro(r.erro)
        return
      }
      // Depois do `await`, o que muda a tela precisa de outra transição: assim o
      // botão segue em "Inscrevendo…" até a lista nova chegar, e o recado entra junto.
      iniciar(() => {
        setConfirmando(false)
        avisar({ id: c.id, titulo: c.titulo, ...sucesso(r) })
        router.refresh()
      })
    })
  }

  const querParticipar = () => rodar(() => inscrever(c.id), (r) => {
    if (r.situacao === 'espera') {
      return participar === 'vaga'
        ? { tipo: 'aviso', texto: 'As vagas acabaram antes da sua inscrição: você entrou na lista de espera. Se abrir uma vaga, você sobe automaticamente.' }
        : { tipo: 'sucesso', texto: 'Você entrou na lista de espera. Se abrir uma vaga, você sobe automaticamente.' }
    }
    return { tipo: 'sucesso', texto: participar === 'espera' ? 'Abriu uma vaga e a sua inscrição foi confirmada. Enviamos os detalhes para o seu e-mail.' : 'Inscrição confirmada. Enviamos os detalhes para o seu e-mail.' }
  })
  const confirmarSaida = () => rodar(() => cancelarInscricao(c.id), () => (
    { tipo: 'sucesso', texto: sair === 'espera' ? 'Você saiu da lista de espera.' : 'Inscrição cancelada. Obrigado por liberar a vaga.' }
  ))
  const desistir = () => {
    if (ocupado) return
    devolverFoco.current = true
    setConfirmando(false)
  }

  const espera = sair === 'espera'
  const pergunta = espera
    ? (semVolta ? 'Sair da lista de espera? As inscrições já encerraram: depois de sair, não dá para voltar.' : 'Sair da lista de espera?')
    : (semVolta ? 'Tem certeza? A vaga vai para a próxima pessoa, e as inscrições já encerraram: depois de cancelar, não dá para se inscrever de novo.' : 'Tem certeza? A vaga vai para a próxima pessoa.')

  return (
    <div className="flex flex-col gap-3">
      {erro && <Recado tipo="erro">{erro}</Recado>}
      {confirmando && sair ? (
        <div role="group" aria-labelledby={idDaPergunta} className="flex flex-col gap-3 rounded-lg bg-muted p-3"
          onKeyDown={(e) => { if (e.key === 'Escape') desistir() }}>
          <p id={idDaPergunta} className="text-sm font-medium">{pergunta}</p>
          <div className="flex flex-wrap gap-2">
            <button ref={manter} type="button" aria-disabled={ocupado || undefined} onClick={desistir} className={cn(botaoSecundario, 'grow sm:grow-0')}>
              {espera ? 'Ficar na lista' : 'Manter inscrição'}
            </button>
            <button type="button" aria-disabled={ocupado || undefined} onClick={confirmarSaida} className={cn(botaoPerigo, 'grow sm:grow-0')}>
              <Rotulo ocupado={ocupado} rotulo={espera ? 'Sim, sair' : 'Sim, cancelar'} andamento={espera ? 'Saindo…' : 'Cancelando…'} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {participar && (
            <button type="button" aria-disabled={ocupado || undefined} aria-describedby={idDoTitulo} onClick={querParticipar}
              className={cn(participar === 'vaga' ? botaoDoMembro : botaoContorno, 'w-full sm:w-auto')}>
              <Rotulo ocupado={ocupado} rotulo={participar === 'vaga' ? 'Quero participar' : 'Entrar na lista de espera'} andamento={participar === 'vaga' ? 'Inscrevendo…' : 'Entrando na lista…'} />
            </button>
          )}
          {/* <a> e não <Link>: é um arquivo .ics para baixar, não uma página. */}
          {agenda && (
            <a href={`/membro/oportunidades/${c.id}/agenda`} aria-describedby={idDoTitulo} className={cn(botaoSecundario, 'grow sm:grow-0')}>
              <CalendarPlus className="size-4 shrink-0" aria-hidden="true" />Adicionar à agenda
            </a>
          )}
          {sair && (
            <button ref={botaoSair} type="button" aria-describedby={idDoTitulo} onClick={() => { setErro(''); setConfirmando(true) }} className={cn(botaoPerigo, 'grow sm:grow-0')}>
              {espera ? 'Sair da lista de espera' : 'Cancelar inscrição'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
