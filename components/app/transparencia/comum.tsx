'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Check, CircleAlert, CircleCheck, Copy, EyeOff, Globe, Loader2, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { cn } from '@/lib/utils'
import { codigoEmGrupos, linkDeVerificacao } from '@/lib/auditoria/catalogo'

/**
 * Peças comuns às telas de Transparência e de Canais oficiais: o diálogo
 * (com o foco preso nele e devolvido a quem abriu), os recados depois de cada
 * ação, o aviso do lançamento oculto e a exibição de hash e código da trilha.
 */

/** O que toda action de app/actions/transparencia.ts devolve. */
export type Resultado = { erro?: string; aviso?: string }

// ---------------------------------------------------------------- datas (sempre no horário de Brasília)

const FUSO = 'America/Sao_Paulo'

// Por partes, e não pelo texto pronto do Intl: servidor e navegador montam a
// mesma string, e a hidratação não reclama de espaço ou vírgula diferente.
function partes(iso: string, opcoes: Intl.DateTimeFormatOptions): Record<string, string> {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...opcoes })
  return Object.fromEntries(f.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
}

/** Instante (timestamptz) → "24/09/2026". */
export function dia(iso: string): string {
  const p = partes(iso, { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${p.day}/${p.month}/${p.year}`
}

/** Instante (timestamptz) → "24/09/2026 às 15:42". */
export function diaEHora(iso: string): string {
  const p = partes(iso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`
}

/** Coluna date ("2026-09-24") → "24/09/2026", sem passar por fuso nenhum. */
export const data = (d: string | null | undefined) =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—'

/** "2026-09-24" + 180 dias, em AAAA-MM-DD. */
export function somarDias(d: string, dias: number): string {
  return new Date(Date.parse(`${d}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------- recados depois de cada ação

export type Recado = {
  tipo: 'ok' | 'aviso' | 'erro'
  texto: string
  link?: { href: string; rotulo: string }
  /** O aviso é de página do site que não foi refeita: o recado oferece refazer. */
  oferecerAtualizacao?: boolean
}

export const FALHA_DE_REDE = 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.'

/**
 * Para o botão que fica ocupado enquanto a ação roda. Com `disabled` de
 * verdade, o navegador tira o foco dele e o leitor de tela se perde no meio da
 * publicação; assim ele continua focado, anuncia o andamento e não aceita
 * clique repetido (o Base UI troca por aria-disabled).
 */
export const OCUPADO_SEM_PERDER_FOCO = { focusableWhenDisabled: true, className: 'aria-disabled:opacity-60' } as const

/**
 * O retorno da action vira recado. `aviso` quer dizer "gravado, mas a página do
 * site não foi refeita agora" — tem de aparecer, senão o portal fica velho sem
 * ninguém saber.
 */
export function recadoDe(r: Resultado, ok: string): Recado {
  if (r.erro) return { tipo: 'erro', texto: r.erro }
  if (r.aviso) return { tipo: 'aviso', texto: r.aviso, oferecerAtualizacao: true }
  return { tipo: 'ok', texto: ok }
}

/** Recado de sucesso some sozinho; aviso e erro ficam até a pessoa fechar. */
export function useRecado() {
  const [recado, setRecado] = useState<Recado | null>(null)
  useEffect(() => {
    if (recado?.tipo !== 'ok') return
    const t = setTimeout(() => setRecado(null), 8000)
    return () => clearTimeout(t)
  }, [recado])
  return [recado, setRecado] as const
}

const ESTILO_DO_RECADO: Record<Recado['tipo'], { caixa: string; icone: React.ReactNode }> = {
  ok: { caixa: 'border-success/50', icone: <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> },
  aviso: { caixa: 'border-warning/70', icone: <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden /> },
  erro: { caixa: 'border-destructive/50', icone: <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> },
}

/**
 * Onde o recado aparece: preso ao pé da tela, porque a ação pode ter sido lá
 * embaixo da lista. A região existe sempre (vazia ou não) — leitor de tela só
 * anuncia mudança em região que já estava na página.
 */
export function RegiaoDeRecados({ recado, onFechar, acaoDoAviso }: { recado: Recado | null; onFechar: () => void; acaoDoAviso?: React.ReactNode }) {
  const estilo = recado ? ESTILO_DO_RECADO[recado.tipo] : null
  return (
    <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 sm:justify-end sm:p-6">
      {recado && estilo && (
        <div className={cn('pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border-2 bg-card px-4 py-3 text-sm shadow-lg', estilo.caixa)}>
          {estilo.icone}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-pretty">{recado.texto}</p>
            {recado.link && <a href={recado.link.href} target="_blank" rel="noopener noreferrer" className="self-start font-medium text-primary underline">{recado.link.rotulo}</a>}
            {recado.oferecerAtualizacao && acaoDoAviso}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar o recado" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- diálogo

const FOCAVEIS = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'summary', '[tabindex]:not([tabindex="-1"])',
].join(',')

const focaveis = (no: HTMLElement) =>
  Array.from(no.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0)

/**
 * O diálogo das duas telas. O de components/app/imprensa/comum.tsx não leva o
 * foco para dentro nem o devolve, e aqui quase tudo acontece em diálogo:
 * ao abrir, o foco vai para o campo marcado com `data-autofocus` (ou o
 * primeiro focável do corpo); Tab e Shift+Tab ficam dentro dele; Escape e o X
 * fecham (menos quando `podeFechar` é falso, no meio de um envio); ao fechar,
 * o foco volta para o botão que abriu.
 */
export function Dialogo({ titulo, descricao, largura = 'max-w-lg', papel = 'dialog', onFechar, podeFechar = true, children }: {
  titulo: string
  descricao?: string
  largura?: string
  /** `alertdialog` para confirmações que não se desfazem. */
  papel?: 'dialog' | 'alertdialog'
  onFechar: () => void
  podeFechar?: boolean
  children: React.ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const id = useId()
  // As versões mais novas de onFechar e podeFechar, para o ouvinte de teclado
  // registrado uma vez só (registrar de novo a cada render roubaria o foco).
  const fechar = useRef(onFechar)
  const pode = useRef(podeFechar)
  useEffect(() => {
    fechar.current = onFechar
    pode.current = podeFechar
  })

  // De layout, e não passivo: o foco volta a quem abriu no mesmo instante em
  // que o diálogo sai da tela. Passivo, ele voltaria depois da pintura — tarde
  // para quem vem logo em seguida decidir para onde o foco vai.
  useLayoutEffect(() => {
    const no = caixa.current
    if (!no) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const corpo = no.querySelector<HTMLElement>('[data-corpo]') ?? no
    const alvo = no.querySelector<HTMLElement>('[data-autofocus]') ?? focaveis(corpo)[0] ?? no
    alvo.focus()

    function tecla(e: KeyboardEvent) {
      if (!no) return
      if (e.key === 'Escape') {
        if (pode.current) { e.stopPropagation(); fechar.current() }
        return
      }
      if (e.key !== 'Tab') return
      const lista = focaveis(no)
      if (!lista.length) { e.preventDefault(); no.focus(); return }
      const primeiro = lista[0]
      const ultimo = lista[lista.length - 1]
      const ativo = document.activeElement
      if (e.shiftKey && (ativo === primeiro || ativo === no || !no.contains(ativo))) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && (ativo === ultimo || !no.contains(ativo))) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      if (anterior?.isConnected) anterior.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-3 py-6 sm:p-4 sm:py-10"
      onMouseDown={(e) => { if (e.target === e.currentTarget && pode.current) fechar.current() }}
    >
      <div ref={caixa} role={papel} aria-modal="true" aria-labelledby={`${id}-titulo`} aria-describedby={descricao ? `${id}-descricao` : undefined} tabIndex={-1} className={cn('w-full outline-none', largura)}>
        <Card className="overflow-hidden p-0 shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id={`${id}-titulo`} className="text-base font-semibold text-balance">{titulo}</h2>
              {descricao && <p id={`${id}-descricao`} className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
            </div>
            <button type="button" onClick={onFechar} disabled={!podeFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div data-corpo className="flex flex-col gap-4 px-4 py-5 sm:px-6">{children}</div>
        </Card>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Publicar, descartar e excluir apagam o botão que abriu o diálogo quando a
 * lista volta do servidor, e o foco cairia no <body>. Marque para onde ele vai
 * nesse caso (o cartão do item, ou a aba inteira se o item sumiu); se o foco
 * ainda estiver num lugar válido, fica onde está.
 */
export function useFocoDepoisDaLista(lista: unknown, reserva: string) {
  const alvo = useRef<string | null>(null)
  useEffect(() => {
    const id = alvo.current
    if (!id) return
    alvo.current = null
    if (focoValido()) return
    const destino = document.getElementById(id) ?? document.getElementById(reserva)
    destino?.focus()
  }, [lista, reserva])
  return (id: string) => {
    alvo.current = id
    // A resposta da action pode já ter trazido a lista nova (revalidatePath):
    // aí o botão já sumiu, e o efeito acima não vai rodar de novo.
    requestAnimationFrame(() => {
      if (alvo.current !== id || focoValido()) return
      alvo.current = null
      const destino = document.getElementById(id) ?? document.getElementById(reserva)
      destino?.focus()
    })
  }
}

const focoValido = () => {
  const ativo = document.activeElement
  return Boolean(ativo && ativo !== document.body && ativo.isConnected)
}

// ---------------------------------------------------------------- formulário

/**
 * Rótulo, campo e ajuda. A ajuda fica fora do <label> e entra por
 * aria-describedby: dentro do rótulo, o leitor de tela leria o texto inteiro
 * como se fosse o nome do campo.
 */
export function Campo({ rotulo, complemento, opcional, ajuda, className, children }: {
  rotulo: string
  /** Só para o leitor de tela, quando o mesmo rótulo se repete (ex.: "da linha 3"). */
  complemento?: string
  opcional?: boolean
  ajuda?: React.ReactNode
  className?: string
  children: (props: { id: string; 'aria-describedby'?: string }) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}{complemento && <span className="sr-only"> {complemento}</span>}{opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
      </label>
      {children({ id, 'aria-describedby': ajuda ? `${id}-ajuda` : undefined })}
      {ajuda && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  )
}

/**
 * A lista de problemas do formulário, numa região que o leitor de tela anuncia
 * assim que muda. Vazia, não ocupa espaço (a margem é da caixa de dentro): vai
 * logo acima dos botões, no mesmo bloco deles.
 */
export function Erros({ erros }: { erros: string[] }) {
  return (
    <div role="alert" aria-atomic="true">
      {erros.length > 0 && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erros.length === 1 ? <p>{erros[0]}</p> : (
            <>
              <p className="font-medium">Confira antes de continuar:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Os botões do pé do diálogo, com os erros logo acima e o andamento para o leitor de tela. */
export function Rodape({ erros, andamento, children }: { erros: string[]; andamento?: string; children: React.ReactNode }) {
  return (
    <div>
      <Erros erros={erros} />
      <p className="sr-only" aria-live="polite">{andamento ?? ''}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{children}</div>
    </div>
  )
}

/**
 * Confirmação de uma ação que não se desfaz (publicar, descartar, excluir).
 * O foco começa em "Voltar": Enter por engano não publica nada.
 */
export function Confirmacao({ titulo, descricao, largura, confirmar, destrutivo, andamento, executar, onFeito, onFechar, children }: {
  titulo: string
  descricao?: string
  largura?: string
  confirmar: { rotulo: string; icone?: React.ReactNode }
  destrutivo?: boolean
  /** O que dizer enquanto a ação roda. */
  andamento: string
  executar: () => Promise<Resultado>
  onFeito: (r: Resultado) => void
  onFechar: () => void
  children: React.ReactNode
}) {
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const agir = () => iniciar(async () => {
    setErro('')
    try {
      const r = await executar()
      if (r.erro) { setErro(r.erro); return }
      onFeito(r)
    } catch {
      setErro(FALHA_DE_REDE)
    }
  })
  return (
    <Dialogo papel="alertdialog" titulo={titulo} descricao={descricao} largura={largura} onFechar={onFechar} podeFechar={!ocupado}>
      <div className="flex flex-col gap-3 text-sm">{children}</div>
      <Rodape erros={erro ? [erro] : []} andamento={ocupado ? andamento : ''}>
        <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado} data-autofocus>Voltar</Button>
        <Button type="button" variant={destrutivo ? 'destructive' : 'default'} onClick={agir} disabled={ocupado} {...OCUPADO_SEM_PERDER_FOCO}>
          {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : confirmar.icone}{ocupado ? andamento : confirmar.rotulo}
        </Button>
      </Rodape>
    </Dialogo>
  )
}

/**
 * Retirar do portal (documento ou parceria): exige o motivo, que fica na
 * Redação com quem retirou; a trilha pública registra a retirada, sem o texto.
 */
export function RetiradaComMotivo({ titulo, descricao, executar, onFeito, onFechar, children }: {
  titulo: string
  descricao?: string
  executar: (motivo: string) => Promise<Resultado>
  onFeito: (r: Resultado) => void
  onFechar: () => void
  children: React.ReactNode
}) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado) return
    if (motivo.trim().length < 5) { setErro('Escreva o motivo, com pelo menos 5 caracteres: é o registro de por que saiu.'); return }
    iniciar(async () => {
      setErro('')
      try {
        const r = await executar(motivo.trim())
        if (r.erro) { setErro(r.erro); return }
        onFeito(r)
      } catch {
        setErro(FALHA_DE_REDE)
      }
    })
  }
  return (
    <Dialogo titulo={titulo} descricao={descricao} onFechar={onFechar} podeFechar={!ocupado}>
      <form className="flex flex-col gap-4" onSubmit={enviar}>
        <div className="flex flex-col gap-2 text-sm">{children}</div>
        <Campo rotulo="Motivo da retirada" ajuda="Pelo menos 5 caracteres. Fica guardado aqui, com o seu nome e a data.">
          {(p) => <textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} required data-autofocus className={inputClass} />}
        </Campo>
        <Rodape erros={erro ? [erro] : []} andamento={ocupado ? 'Retirando do portal e refazendo a página…' : ''}>
          <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado}>Voltar</Button>
          <Button type="submit" variant="destructive" disabled={ocupado} {...OCUPADO_SEM_PERDER_FOCO}>{ocupado && <Loader2 className="size-4 animate-spin" aria-hidden />}{ocupado ? 'Retirando…' : 'Retirar do portal'}</Button>
        </Rodape>
      </form>
    </Dialogo>
  )
}

// ---------------------------------------------------------------- hash e código da trilha

export function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [ok, setOk] = useState(false)
  return (
    <>
      <button
        type="button" aria-label={rotulo} title={rotulo}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => navigator.clipboard?.writeText(valor).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }).catch(() => undefined)}
      >
        {ok ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
      <span className="sr-only" aria-live="polite">{ok ? 'Copiado.' : ''}</span>
    </>
  )
}

/** Os 16 primeiros caracteres do SHA-256 (o inteiro no título e no botão de copiar). */
export function HashCurto({ hash, rotulo = 'SHA-256' }: { hash: string; rotulo?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <code title={hash} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{hash.slice(0, 8)} {hash.slice(8, 16)}…</code>
      <Copiar valor={hash} rotulo={`Copiar o ${rotulo} inteiro`} />
    </span>
  )
}

/** O código de 26 caracteres, com o link para a página pública de verificação. */
export function CodigoDaTrilha({ codigo }: { codigo: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      <a href={linkDeVerificacao(codigo)} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] font-medium text-primary hover:underline">
        {codigoEmGrupos(codigo)}<span className="sr-only"> (abre a página de verificação em outra aba)</span>
      </a>
      <Copiar valor={codigo} rotulo="Copiar o código de verificação" />
    </span>
  )
}

/**
 * Item publicado sem código: ou a leitura da trilha falhou agora, ou o
 * registro falhou na hora de publicar (o gatilho nunca derruba a publicação;
 * a falha vai para a lista de falhas da trilha).
 */
export function SemCodigo({ trilhaDisponivel }: { trilhaDisponivel: boolean }) {
  return trilhaDisponivel
    ? <span className="text-warning-foreground">Sem registro na trilha. Confira as falhas em <Link href="/trilha-publica" className="underline">Trilha pública</Link>.</span>
    : <span className="text-muted-foreground">Não foi possível ler os códigos da trilha agora.</span>
}

// ---------------------------------------------------------------- estado

export type Estado = 'rascunho' | 'no_ar' | 'retirado'

const ESTILO_DO_ESTADO: Record<Estado, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  no_ar: 'bg-success/15 text-success',
  retirado: 'bg-destructive/10 text-destructive',
}

export function Etiqueta({ estado, children }: { estado: Estado; children: React.ReactNode }) {
  return <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTILO_DO_ESTADO[estado])}>{children}</span>
}

// ---------------------------------------------------------------- lançamento oculto

/**
 * O aviso do topo das duas telas (docs/auditoria-publica.md §1 e §9): a
 * página é publicada de verdade, mas fora dos buscadores e sem link no site
 * até a abertura — o que não a torna secreta.
 */
export function AvisoDeLancamento({ aberto, endereco, atualizando, onAtualizar }: {
  aberto: boolean
  endereco: string
  atualizando: boolean
  onAtualizar: () => void
}) {
  const legivel = endereco.replace(/^https?:\/\//, '')
  const link = <a href={endereco} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">{legivel}</a>
  return (
    <Card className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between', !aberto && 'border-warning/50 bg-warning/5')}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', aberto ? 'bg-success/15 text-success' : 'bg-warning/25 text-warning-foreground')}>
          {aberto ? <Globe className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{aberto ? 'Página aberta ao público' : 'Lançamento oculto'}</p>
          {aberto
            ? <p className="mt-0.5 text-pretty text-muted-foreground">A página pública {link} sai sem <span className="font-mono text-xs">noindex</span>, aberta aos buscadores. Se ela foi publicada antes da abertura, use “Atualizar a página no site” uma vez para refazê-la assim.</p>
            : <p className="mt-0.5 text-pretty text-muted-foreground">A página pública {link} já é publicada, mas sai com <span className="font-mono text-xs">noindex</span> e sem link em nenhum menu, rodapé ou matéria do site até a abertura, que ainda será decidida. Quem tiver o endereço consegue abrir: publique só o que já pode ser público.</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:items-end">
        <Button size="sm" variant="outline" className={cn('self-start sm:self-end', OCUPADO_SEM_PERDER_FOCO.className)} focusableWhenDisabled onClick={onAtualizar} disabled={atualizando}>
          {atualizando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
          {atualizando ? 'Atualizando…' : 'Atualizar a página no site'}
        </Button>
        <p className="max-w-72 text-xs text-muted-foreground sm:text-right">Refaz a página com o que está publicado aqui. Use quando um aviso disser que o site não respondeu.</p>
      </div>
    </Card>
  )
}
