'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, Loader2, ShieldCheck, Stamp, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { conferirCadeiaAgora, fecharLoteDeOntemAgora, registrarPendenciasAgora } from '@/app/actions/trilha'
import { resumoDaConferencia, resumoDaRodada, resumoDaSincronizacao, type Resumo } from './dados'
import { Secao } from './pecas'

type Rodada = 'conferir' | 'registrar' | 'lote'

const RODADAS: Record<Rodada, {
  botao: string
  rodando: string
  ajuda: string
  pergunta: string
  explicacao: string
  confirmar: string
  naoTerminou: string
  Icone: LucideIcon
}> = {
  conferir: {
    botao: 'Conferir a cadeia agora',
    rodando: 'Conferindo a cadeia…',
    ajuda: 'Refaz o hash de cada evento e as contas de cada lote, desde o primeiro registro. Leva alguns segundos.',
    pergunta: 'Conferir a cadeia agora?',
    explicacao: 'A Redação refaz o hash de cada evento, fluxo por fluxo, e as contas de todos os lotes. Nenhum registro muda: o resultado só é acrescentado à própria trilha, como mais um evento de conferência.',
    confirmar: 'Conferir agora',
    naoTerminou: 'A conferência não terminou.',
    Icone: ShieldCheck,
  },
  registrar: {
    botao: 'Registrar pendências agora',
    rodando: 'Registrando pendências…',
    ajuda: 'Registra o que ficou de fora — ofício assinado, certificado emitido, matéria no site, comunicado enviado, publicação do portal —, por exemplo depois de uma falha.',
    pergunta: 'Registrar pendências agora?',
    explicacao: 'Ofícios assinados, certificados emitidos, matérias publicadas no site, comunicados enviados e publicações do portal de transparência e dos canais oficiais que ainda não estão na trilha entram agora, com a data de hoje. Revogações e retiradas que ficaram para trás também. O que já está registrado não muda.',
    confirmar: 'Registrar agora',
    naoTerminou: 'O registro das pendências não terminou.',
    Icone: ListChecks,
  },
  lote: {
    botao: 'Fechar e carimbar o lote de ontem agora',
    rodando: 'Fechando e carimbando o lote…',
    ajuda: 'A rodada inteira da madrugada: pendências, conferência, lote de ontem, assinatura, carimbos e arquivos no site. Pode levar até um minuto.',
    pergunta: 'Fechar e carimbar o lote de ontem agora?',
    explicacao: 'Faz agora a rodada da madrugada: registra pendências, confere a cadeia, fecha o lote de ontem (se ainda não foi fechado), assina, carimba (RFC 3161 e OpenTimestamps) e publica os arquivos em /verificar/lotes/ no site. Nada é feito duas vezes. Pode levar até um minuto; mantenha esta página aberta.',
    confirmar: 'Fechar e carimbar',
    naoTerminou: 'A rodada do lote não terminou.',
    Icone: Stamp,
  },
}

const ORDEM: Rodada[] = ['conferir', 'registrar', 'lote']

type Desfecho = { rodada: Rodada; resumo?: Resumo; erro?: string }

async function executar(rodada: Rodada): Promise<Omit<Desfecho, 'rodada'>> {
  if (rodada === 'conferir') {
    const r = await conferirCadeiaAgora()
    return r.conferencia ? { resumo: resumoDaConferencia(r.conferencia) } : { erro: r.erro ?? 'Resposta inesperada do servidor.' }
  }
  if (rodada === 'registrar') {
    const r = await registrarPendenciasAgora()
    return r.registrados ? { resumo: resumoDaSincronizacao(r.registrados) } : { erro: r.erro ?? 'Resposta inesperada do servidor.' }
  }
  const r = await fecharLoteDeOntemAgora()
  return r.rodada ? { resumo: resumoDaRodada(r.rodada) } : { erro: r.erro ?? 'Resposta inesperada do servidor.' }
}

/**
 * As três rodadas manuais. A rotina da madrugada faz tudo isto sozinha; os
 * botões existem para não esperar (depois de corrigir uma falha, por exemplo).
 * Uma rodada por vez: enquanto uma roda, os três botões ficam indisponíveis,
 * mas continuam no foco do teclado.
 */
export function RodarAgora() {
  const router = useRouter()
  // A última pedida continua guardada depois de fechar o diálogo, para ele não piscar vazio.
  const [pedida, setPedida] = useState<Rodada>('conferir')
  const [confirmando, setConfirmando] = useState(false)
  const [ultima, setUltima] = useState<Rodada | null>(null)
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null)
  const [ocupado, iniciar] = useTransition()
  const rodando = ocupado ? ultima : null

  function pedir(rodada: Rodada) {
    if (ocupado) return
    setPedida(rodada)
    setConfirmando(true)
  }

  function rodar() {
    const rodada = pedida
    setConfirmando(false)
    setUltima(rodada)
    setDesfecho(null)
    iniciar(async () => {
      try {
        setDesfecho({ rodada, ...(await executar(rodada)) })
        router.refresh()
      } catch {
        // Sem resposta (conexão caiu ou o tempo acabou): o servidor pode ter terminado mesmo assim.
        setDesfecho({ rodada, erro: 'A resposta não chegou (conexão ou tempo esgotado). A rodada pode ter terminado no servidor: recarregue a página para ver o estado atual.' })
      }
    })
  }

  return (
    <Secao
      id="trilha-rodar"
      titulo="Rodar agora"
      descricao="A rotina diária faz tudo isto sozinha, de madrugada. Use os botões para não esperar — depois de corrigir uma falha, por exemplo. Pode repetir sem receio: nada é registrado, fechado ou carimbado duas vezes."
    >
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-border">
          {ORDEM.map((r) => {
            const { Icone } = RODADAS[r]
            return (
              <li key={r} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <p id={`trilha-rodar-${r}`} className="text-sm text-muted-foreground sm:max-w-2xl">{RODADAS[r].ajuda}</p>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => pedir(r)}
                  disabled={ocupado}
                  focusableWhenDisabled
                  aria-describedby={`trilha-rodar-${r}`}
                  // O rótulo mais longo não cabe numa linha num celular estreito: quebra lá, e só lá.
                  className={cn('h-auto min-h-9 self-start whitespace-normal py-1.5 text-left sm:shrink-0 sm:self-auto sm:whitespace-nowrap', rodando !== r && 'aria-disabled:opacity-50')}
                >
                  {rodando === r ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Icone className="size-4" aria-hidden="true" />}
                  {rodando === r ? RODADAS[r].rodando : RODADAS[r].botao}
                </Button>
              </li>
            )
          })}
        </ul>

        {/* A região existe desde o início (vazia): leitores de tela só anunciam mudança numa região que já estava lá. */}
        <div role="status">
          {rodando && (
            <p className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm">
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
              {RODADAS[rodando].rodando}{rodando === 'lote' && ' Pode levar até um minuto; mantenha esta página aberta.'}
            </p>
          )}
          {!rodando && desfecho && <QuadroDoDesfecho desfecho={desfecho} fechar={() => setDesfecho(null)} />}
        </div>
      </Card>

      <Confirmacao rodada={pedida} aberta={confirmando} aoConfirmar={rodar} aoFechar={() => setConfirmando(false)} />
    </Secao>
  )
}

function QuadroDoDesfecho({ desfecho, fechar }: { desfecho: Desfecho; fechar: () => void }) {
  const { resumo, erro } = desfecho
  const tom = erro ? 'bg-destructive/10' : resumo?.tom === 'atencao' ? 'bg-warning/15' : 'bg-success/10'
  return (
    <div className={cn('flex items-start justify-between gap-3 border-t border-border px-4 py-3 text-sm', tom)}>
      <div className="min-w-0">
        <p className={cn('font-semibold', erro && 'text-destructive')}>{erro ? RODADAS[desfecho.rodada].naoTerminou : resumo?.titulo}</p>
        {erro ? <p className="mt-0.5 break-words">{erro}</p> : resumo && resumo.detalhes.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 break-words">
            {resumo.detalhes.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
      </div>
      <button type="button" onClick={fechar} aria-label="Fechar o resumo" className="shrink-0 rounded p-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * A confirmação é um <dialog> nativo: nome e descrição acessíveis, foco preso
 * dentro enquanto aberto, Escape fecha, e o foco volta sozinho ao botão que
 * abriu. O primeiro foco cai em "Voltar", de propósito: dois cliques
 * apressados no botão não disparam a rodada.
 */
function Confirmacao({ rodada, aberta, aoConfirmar, aoFechar }: { rodada: Rodada; aberta: boolean; aoConfirmar: () => void; aoFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberta && !d.open) d.showModal()
    if (!aberta && d.open) d.close()
  }, [aberta])
  const { pergunta, explicacao, confirmar, Icone } = RODADAS[rodada]
  return (
    <dialog
      ref={ref}
      aria-labelledby="trilha-confirmar-titulo"
      aria-describedby="trilha-confirmar-texto"
      onClose={aoFechar}
      // Apertar no fundo escurecido fecha, como nos outros diálogos da Redação. O
      // fundo chega como evento do próprio <dialog>, mas fora do retângulo dele —
      // conferir as coordenadas evita fechar quando se arrasta a barra de rolagem.
      onMouseDown={(e) => {
        const caixa = e.currentTarget.getBoundingClientRect()
        if (e.clientX < caixa.left || e.clientX > caixa.right || e.clientY < caixa.top || e.clientY > caixa.bottom) aoFechar()
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-[rgb(0_0_0/0.45)]"
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <h2 id="trilha-confirmar-titulo" className="text-base font-semibold">{pergunta}</h2>
        <p id="trilha-confirmar-texto" className="text-sm text-muted-foreground">{explicacao}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="lg" onClick={aoFechar}>Voltar</Button>
          <Button size="lg" onClick={aoConfirmar}><Icone className="size-4" aria-hidden="true" />{confirmar}</Button>
        </div>
      </div>
    </dialog>
  )
}
