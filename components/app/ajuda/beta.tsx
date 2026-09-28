'use client'

import { useId, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { Bug, Check, HeartHandshake, Lightbulb, Loader2, MessageCircleQuestion, MessageSquareHeart, Send, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { enviarRetorno, votarPergunta } from '@/app/actions/beta'
import { NOTAS, aparelhoDoAgente, type Contexto, type TipoDeRetorno } from '@/lib/ajuda/retornos'
import { cn } from '@/lib/utils'

/**
 * O beta com a equipe (docs/AJUDA.md §10), nas telas:
 *  - FormularioDoBeta: problema, ideia, dúvida ou elogio, com a nota da tela se
 *    quiser. É um só, em dois lugares: o "Beta" do topo (BotaoBeta) e "Conte
 *    para a equipe", no fim do painel "?" (painel-conteudo.tsx). Antes havia
 *    também "O que achou desta tela?" e "Pergunte à equipe", três formulários
 *    parecidos enfileirados no painel (§11);
 *  - IssoAjudou: o voto em cada pergunta da ajuda.
 * Junto vai o contexto do aparelho (tamanho da janela, celular ou não, navegador), para reproduzir.
 */

function contextoDoAparelho(): Contexto {
  if (typeof window === 'undefined') return {}
  const { navegador, sistema } = aparelhoDoAgente(navigator.userAgent)
  return {
    largura: window.innerWidth, altura: window.innerHeight,
    celular: window.matchMedia('(max-width: 767px)').matches,
    toque: window.matchMedia('(pointer: coarse)').matches,
    navegador, sistema, idioma: navigator.language,
    tema: document.documentElement.classList.contains('dark') ? 'escuro' : 'claro',
  }
}

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 sm:text-sm'
const botaoPrincipal = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:min-h-9'
const botaoSecundario = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60 sm:min-h-9'

function Obrigado({ texto }: { texto: string }) {
  return <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success" role="status"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{texto}</p>
}

/** As cinco notas, como botões de rádio (setas do teclado mudam a escolha). */
function EscolhaDaNota({ nota, aoEscolher, nome }: { nota: number | null; aoEscolher: (n: number) => void; nome: string }) {
  return (
    <div role="radiogroup" aria-label="Sua nota para esta tela" className="grid grid-cols-5 gap-1.5">
      {NOTAS.map((n) => (
        <label key={n.valor} className={cn(
          'flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
          nota === n.valor ? 'border-primary bg-primary/[0.07]' : 'border-border hover:bg-muted',
        )}>
          <input type="radio" name={nome} value={n.valor} checked={nota === n.valor} onChange={() => aoEscolher(n.valor)} className="sr-only" />
          <span className="text-xl leading-none" aria-hidden="true">{n.rosto}</span>
          <span className="text-[10.5px] font-medium leading-tight text-muted-foreground">{n.rotulo}</span>
        </label>
      ))}
    </div>
  )
}

/** "Isso ajudou?" debaixo de cada resposta. "Não" abre um campo para dizer o que faltou. */
export function IssoAjudou({ perguntaId, area }: { perguntaId: string; area: string | null }) {
  const caminho = usePathname()
  const [voto, setVoto] = useState<boolean | null>(null)
  const [faltou, setFaltou] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const votar = (util: boolean, texto?: string) => iniciar(async () => {
    setErro('')
    const r = await votarPergunta({ pergunta_id: perguntaId, area, caminho, util, texto, contexto: contextoDoAparelho() })
    if (r.erro) { setErro(r.erro); return }
    setVoto(util)
    if (texto) setEnviado(true)
  })
  if (enviado) return <p className="mt-3 text-xs text-success" role="status">Obrigado! Vamos melhorar esta resposta.</p>
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3" data-isso-ajudou>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{voto === null ? 'Isso ajudou?' : voto ? 'Que bom! Obrigado.' : 'Obrigado. O que faltou?'}</span>
        {voto === null && (
          <>
            <button type="button" disabled={ocupado} onClick={() => votar(true)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 font-medium text-foreground hover:bg-muted"><ThumbsUp className="size-3.5" aria-hidden="true" />Sim</button>
            <button type="button" disabled={ocupado} onClick={() => votar(false)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 font-medium text-foreground hover:bg-muted"><ThumbsDown className="size-3.5" aria-hidden="true" />Não</button>
          </>
        )}
      </div>
      {voto === false && (
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (faltou.trim()) votar(false, faltou) }}>
          <textarea value={faltou} onChange={(e) => setFaltou(e.target.value)} rows={2} maxLength={2000} aria-label="O que faltou nesta resposta" placeholder="Ex.: faltou dizer onde fica o botão no celular." className={campo} />
          <button type="submit" disabled={ocupado || !faltou.trim()} className={cn(botaoSecundario, 'self-start')}>Enviar</button>
        </form>
      )}
      {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
    </div>
  )
}

const TIPOS_DO_BETA: { tipo: TipoDeRetorno; rotulo: string; icone: typeof Bug; dica: string }[] = [
  { tipo: 'problema', rotulo: 'Algo deu errado', icone: Bug, dica: 'O que você fez, o que esperava e o que aconteceu. Ex.: “Toquei em Salvar na proposta e a tela ficou em branco.”' },
  { tipo: 'sugestao', rotulo: 'Tenho uma ideia', icone: Lightbulb, dica: 'O que faria o seu trabalho ficar mais fácil. Ex.: “Seria bom avisar o setor quando a compra chegar.”' },
  { tipo: 'duvida', rotulo: 'Tenho uma dúvida', icone: MessageCircleQuestion, dica: 'O que você queria fazer e não achou como. A resposta volta no sino.' },
  { tipo: 'elogio', rotulo: 'Gostei!', icone: HeartHandshake, dica: 'Conte o que funcionou bem — ajuda a saber o que manter.' },
]

/**
 * O "Beta" do topo: em qualquer tela, contar um problema, uma ideia, uma
 * dúvida ou um elogio, com a nota da tela se quiser. Some no celular (o topo
 * não tem espaço): lá, o mesmo fica no alto do painel "?".
 */
export function BotaoBeta({ className }: { className?: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger data-ajuda="shell.beta" className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-3 text-xs font-semibold text-primary hover:bg-primary/[0.12]', className)}>
        <MessageSquareHeart className="size-4" aria-hidden="true" />Beta<span className="hidden font-medium lg:inline">· dar opinião</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(32rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <FormularioDoBeta aoFechar={() => setAberto(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** O formulário do beta: no diálogo do topo e em "Conte para a equipe", no fim do painel "?" (que começa em "dúvida"). */
export function FormularioDoBeta({ aoFechar, area = null, noPainel = false, tipoInicial = 'problema' }: { aoFechar?: () => void; area?: string | null; noPainel?: boolean; tipoInicial?: TipoDeRetorno }) {
  const caminho = usePathname()
  const id = useId()
  const [tipo, setTipo] = useState<TipoDeRetorno>(tipoInicial)
  const [texto, setTexto] = useState('')
  const [nota, setNota] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const escolhido = TIPOS_DO_BETA.find((t) => t.tipo === tipo)!
  const Titulo = noPainel ? 'p' : Dialog.Title
  if (feito) {
    return (
      <div className="flex flex-col gap-3">
        <Obrigado texto="Recebido! Obrigado por ajudar a melhorar o Palácio. Se precisar de resposta, ela chega no sino e fica em “Seus retornos”, na Central de ajuda." />
        {aoFechar && <button type="button" onClick={aoFechar} className={cn(botaoSecundario, 'self-end')}>Fechar</button>}
      </div>
    )
  }
  return (
    <form className="flex flex-col gap-4" data-formulario-beta onSubmit={(e) => {
      e.preventDefault()
      iniciar(async () => {
        setErro('')
        const r = await enviarRetorno({ tipo, caminho, area, texto, contexto: contextoDoAparelho() })
        if (r.erro) { setErro(r.erro); return }
        // A nota, se veio, vira também a opinião sobre a tela.
        if (nota !== null) await enviarRetorno({ tipo: 'tela', caminho, area, nota, contexto: contextoDoAparelho() })
        setFeito(true)
      })
    }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Titulo className="text-base font-semibold">Palácio Virtual em beta</Titulo>
          <p className="mt-0.5 text-sm text-muted-foreground">Conte o que encontrou nesta tela. Vai direto para quem está melhorando a ferramenta, com a tela e o aparelho que você usa.</p>
        </div>
        {aoFechar && <Dialog.Close aria-label="Fechar" className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-[18px]" aria-hidden="true" /></Dialog.Close>}
      </div>
      <div role="radiogroup" aria-label="O que você quer contar" className="grid grid-cols-2 gap-2">
        {TIPOS_DO_BETA.map((t) => {
          const Icone = t.icone
          return (
            <label key={t.tipo} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50', tipo === t.tipo ? 'border-primary bg-primary/[0.07] text-primary' : 'border-border hover:bg-muted')}>
              <input type="radio" name={`${id}-tipo`} value={t.tipo} checked={tipo === t.tipo} onChange={() => setTipo(t.tipo)} className="sr-only" />
              <Icone className="size-4 shrink-0" aria-hidden="true" />{t.rotulo}
            </label>
          )
        })}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {tipo === 'elogio' ? 'O que você gostou? (opcional)' : 'Conte com as suas palavras'}
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} className={campo} placeholder={escolhido.dica} />
      </label>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">E esta tela, de modo geral? <span className="font-normal text-muted-foreground">(opcional)</span></p>
        <EscolhaDaNota nota={nota} aoEscolher={setNota} nome={`${id}-nota`} />
      </div>
      <p className="text-xs text-muted-foreground">Vai junto: o endereço da tela ({caminho}), o tamanho da janela e o navegador. Não vai nada do que está digitado na tela.</p>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      <button type="submit" disabled={ocupado || (tipo !== 'elogio' && texto.trim().length < 3)} className={cn(botaoPrincipal, 'self-end')}>
        {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}Enviar
      </button>
    </form>
  )
}
