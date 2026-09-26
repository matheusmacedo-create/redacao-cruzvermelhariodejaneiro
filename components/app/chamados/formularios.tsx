'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Lock, MessageSquare, Monitor, Paperclip, Send, Star, Ticket, Wrench, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { enviarAnexoDeChamado } from '@/lib/chamados/upload'
import {
  IMPACTO, URGENCIA, prioridade, ROTULO_DA_PRIORIDADE, type Status,
} from '@/lib/chamados/regras'
import {
  abrirChamado, atribuirChamado, avaliarChamado, comentarChamado, definirImpacto, mudarStatusDoChamado, transferirChamado,
} from '@/app/actions/chamados'
import { campo } from './comum'

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null
type Resultado = { erro?: string; recado?: string; id?: string }

function Recado({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null
  return <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={cn('rounded-lg px-3 py-2 text-sm', aviso.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>{aviso.texto}</p>
}

// ------------------------------------------------------------------ anexos

type Anexo = { pathname: string; nome: string }
type Enviando = { chave: string; nome: string; progresso: number; erro?: string }

export function CampoDeAnexos({ workspaceId, anexos, setAnexos, ocupado, setOcupado }: { workspaceId: string; anexos: Anexo[]; setAnexos: (a: Anexo[]) => void; ocupado: boolean; setOcupado: (o: boolean) => void }) {
  const [enviando, setEnviando] = useState<Enviando[]>([])
  async function escolher(lista: FileList | null) {
    if (!lista?.length) return
    setOcupado(true)
    const novos: Anexo[] = []
    for (const arquivo of [...lista].slice(0, 6 - anexos.length)) {
      const chave = `${arquivo.name}-${arquivo.size}-${Math.random()}`
      setEnviando((e) => [...e, { chave, nome: arquivo.name, progresso: 0 }])
      try {
        if (arquivo.size > 25 * 1024 * 1024) throw new Error('maior que 25 MB')
        novos.push(await enviarAnexoDeChamado(arquivo, workspaceId, (p) => setEnviando((e) => e.map((x) => x.chave === chave ? { ...x, progresso: p } : x))))
        setEnviando((e) => e.filter((x) => x.chave !== chave))
      } catch (causa) {
        setEnviando((e) => e.map((x) => x.chave === chave ? { ...x, erro: causa instanceof Error ? causa.message : 'falhou' } : x))
      }
    }
    setAnexos([...anexos, ...novos])
    setOcupado(false)
  }
  return (
    <div className="flex flex-col gap-2">
      <label data-ajuda="chamados.anexos" className={cn('inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50', (ocupado || anexos.length >= 6) && 'pointer-events-none opacity-50')}>
        <Paperclip className="size-4" />Anexar foto, print ou arquivo
        <input type="file" multiple className="sr-only" accept="image/*,video/mp4,video/quicktime,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx" onChange={(e) => { void escolher(e.target.files); e.target.value = '' }} />
      </label>
      {(anexos.length > 0 || enviando.length > 0) && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {anexos.map((a) => <li key={a.pathname} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1"><Paperclip className="size-3" />{a.nome}<button type="button" aria-label={`Remover ${a.nome}`} onClick={() => setAnexos(anexos.filter((x) => x.pathname !== a.pathname))}><X className="size-3" /></button></li>)}
          {enviando.map((e) => <li key={e.chave} className={cn('flex items-center gap-1 rounded-md px-2 py-1', e.erro ? 'bg-destructive/10 text-destructive' : 'bg-muted')}>{e.erro ? `${e.nome}: ${e.erro}` : <><Loader2 className="size-3 animate-spin" />{e.nome} {e.progresso}%</>}{e.erro && <button type="button" aria-label="Fechar" onClick={() => setEnviando((l) => l.filter((x) => x.chave !== e.chave))}><X className="size-3" /></button>}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Até 6 arquivos de 25 MB: imagem, vídeo curto, PDF, Word, Excel ou texto.</p>
    </div>
  )
}

// ------------------------------------------------------------------ abrir

export type FilaParaAbrir = { id: string; nome: string; descricao: string | null; icone: string; categorias: { id: string; nome: string; descricao: string | null; pedeLocal: boolean; tipo: 'incidente' | 'solicitacao' }[] }

const ICONES: Record<string, typeof Ticket> = { monitor: Monitor, wrench: Wrench }

export function NovoChamado({ workspaceId, filas, filaInicial }: { workspaceId: string; filas: FilaParaAbrir[]; filaInicial?: string }) {
  const router = useRouter()
  const [filaId, setFilaId] = useState(filas.some((f) => f.id === filaInicial) ? filaInicial! : filas.length === 1 ? filas[0].id : '')
  const [categoriaId, setCategoriaId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [local, setLocal] = useState('')
  const [urgencia, setUrgencia] = useState<1 | 2 | 3>(2)
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [subindo, setSubindo] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  const fila = filas.find((f) => f.id === filaId)
  const categoria = fila?.categorias.find((c) => c.id === categoriaId)

  function enviar(event: React.FormEvent) {
    event.preventDefault()
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      Object.entries({ filaId, categoriaId, titulo, descricao, local, urgencia: String(urgencia), anexos: JSON.stringify(anexos) }).forEach(([k, v]) => form.set(k, v))
      const r = await abrirChamado(form)
      if (r.erro || !r.id) return setAviso({ tom: 'erro', texto: r.erro ?? 'Não foi possível abrir.' })
      router.push(`/chamados/${r.id}?aberto=1`)
    })
  }

  if (!fila) {
    return (
      <div data-ajuda="chamados.equipes" className="grid gap-4 sm:grid-cols-2">
        {filas.map((f) => {
          const Icone = ICONES[f.icone] ?? Ticket
          return (
            <button key={f.id} type="button" onClick={() => { setFilaId(f.id); setCategoriaId('') }} className="flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="size-5" /></span>
              <span><span className="block font-semibold">{f.nome}</span><span className="mt-1 block text-sm text-muted-foreground">{f.descricao}</span></span>
            </button>
          )
        })}
        {!filas.length && <Card className="p-6 text-sm text-muted-foreground">Nenhuma equipe está recebendo chamados agora.</Card>}
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm">
        {filas.length > 1 && <button type="button" onClick={() => setFilaId('')} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Trocar de equipe</button>}
        <span className="font-medium">{fila.nome}</span>
      </div>

      <fieldset data-ajuda="chamados.assunto" className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Qual é o assunto?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {fila.categorias.map((c) => (
            <label key={c.id} className={cn('flex cursor-pointer flex-col rounded-lg border p-3 text-sm', categoriaId === c.id ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-muted/40')}>
              <input type="radio" name="categoria" value={c.id} checked={categoriaId === c.id} onChange={() => setCategoriaId(c.id)} className="sr-only" />
              <span className="font-medium">{c.nome}</span>
              {c.descricao && <span className="mt-0.5 text-xs text-muted-foreground">{c.descricao}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {categoria && <>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Resumo
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} required className={campo} placeholder={categoria.tipo === 'incidente' ? 'Ex.: Impressora da recepção não imprime' : 'Ex.: Acesso à pasta do Voluntariado'} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Descreva com detalhes
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} required rows={5} maxLength={10000} className={campo} placeholder={categoria.tipo === 'incidente' ? 'O que aconteceu, desde quando, o que já tentou, se aparece alguma mensagem de erro.' : 'O que você precisa, para quem, e até quando.'} />
        </label>
        {categoria.pedeLocal && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">Local
            <input value={local} onChange={(e) => setLocal(e.target.value)} maxLength={140} required className={campo} placeholder="Ex.: 2º andar, sala da Comunicação" />
          </label>
        )}
        <fieldset data-ajuda="chamados.urgencia">
          <legend className="mb-2 text-sm font-medium">Quanto isso atrapalha?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {([1, 2, 3] as const).map((u) => (
              <label key={u} className={cn('flex cursor-pointer flex-col rounded-lg border p-3 text-sm', urgencia === u ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-muted/40')}>
                <input type="radio" name="urgencia" checked={urgencia === u} onChange={() => setUrgencia(u)} className="sr-only" />
                <span className="font-medium">{URGENCIA[u].rotulo}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{URGENCIA[u].ajuda}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <CampoDeAnexos workspaceId={workspaceId} anexos={anexos} setAnexos={setAnexos} ocupado={subindo} setOcupado={setSubindo} />
        <Recado aviso={aviso} />
        <div className="flex justify-end"><Button type="submit" size="lg" disabled={ocupado || subindo}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Abrir chamado</Button></div>
      </>}
    </form>
  )
}

// ------------------------------------------------------------------ conversa

export function CaixaDeMensagem({ workspaceId, chamadoId, equipe, encerrado }: { workspaceId: string; chamadoId: string; equipe: boolean; encerrado: boolean }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [interno, setInterno] = useState(false)
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [subindo, setSubindo] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  if (encerrado) return <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">Chamado encerrado. Se o problema voltar, abra um novo chamado e cite este.</p>
  function enviar(event: React.FormEvent) {
    event.preventDefault()
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('chamadoId', chamadoId); form.set('texto', texto); form.set('interno', interno ? '1' : '0'); form.set('anexos', JSON.stringify(anexos))
      const r = await comentarChamado(form)
      if (r.erro) return setAviso({ tom: 'erro', texto: r.erro })
      setTexto(''); setAnexos([]); setInterno(false)
      router.refresh()
    })
  }
  return (
    <form data-ajuda="chamados.mensagem" onSubmit={enviar} className={cn('flex flex-col gap-3 rounded-xl border p-4', interno ? 'border-warning/50 bg-warning/5' : 'border-border bg-card')}>
      {equipe && (
        <div className="flex gap-1 text-sm" role="tablist">
          <button type="button" role="tab" aria-selected={!interno} onClick={() => setInterno(false)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5', !interno ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}><MessageSquare className="size-3.5" />Responder a quem abriu</button>
          <button type="button" role="tab" aria-selected={interno} onClick={() => setInterno(true)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5', interno ? 'bg-warning/30 text-warning-foreground' : 'text-muted-foreground hover:bg-muted')}><Lock className="size-3.5" />Nota interna</button>
        </div>
      )}
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={10000} className={campo} placeholder={interno ? 'Só a equipe vê esta nota.' : equipe ? 'Escreva a resposta para quem abriu o chamado.' : 'Escreva para a equipe que está atendendo.'} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CampoDeAnexos workspaceId={workspaceId} anexos={anexos} setAnexos={setAnexos} ocupado={subindo} setOcupado={setSubindo} />
        <Button type="submit" size="lg" disabled={ocupado || subindo || (!texto.trim() && !anexos.length)}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{interno ? 'Salvar nota' : 'Enviar'}</Button>
      </div>
      <Recado aviso={aviso} />
    </form>
  )
}

// ------------------------------------------------------------------ status

const PEDE_TEXTO: Partial<Record<Status, { rotulo: string; placeholder: string; obrigatorio: boolean }>> = {
  resolvido: { rotulo: 'Como foi resolvido?', placeholder: 'É o que quem abriu vai ler para confirmar. Ex.: troquei o cabo de rede da mesa 3.', obrigatorio: true },
  cancelado: { rotulo: 'Motivo do cancelamento', placeholder: 'Ex.: aberto em duplicidade (ver TI-0041).', obrigatorio: true },
  aguardando_solicitante: { rotulo: 'O que você precisa de quem abriu? (opcional)', placeholder: 'Ex.: qual o número de patrimônio da impressora?', obrigatorio: false },
  aguardando_terceiro: { rotulo: 'Aguardando o quê? (opcional)', placeholder: 'Ex.: peça encomendada ao fornecedor, previsão sexta.', obrigatorio: false },
  em_atendimento: { rotulo: 'O que ainda não foi resolvido?', placeholder: 'Descreva o que continua acontecendo.', obrigatorio: true },
}

const BOTAO_DO_STATUS: Record<Status, string> = {
  novo: 'Novo',
  em_atendimento: 'Atender',
  aguardando_solicitante: 'Pedir informação',
  aguardando_terceiro: 'Aguardar terceiro',
  resolvido: 'Resolver',
  fechado: 'Confirmar e fechar',
  cancelado: 'Cancelar chamado',
}

export function AcoesDeStatus({ chamadoId, status, proximos, equipe }: { chamadoId: string; status: Status; proximos: Status[]; equipe: boolean }) {
  const router = useRouter()
  const [escolhido, setEscolhido] = useState<Status | null>(null)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  // O "fechar" de quem abriu tem o seu próprio cartão (avaliação).
  const opcoes = proximos.filter((s) => !(s === 'fechado' && !equipe))
  if (!opcoes.length) return null
  // "Atender" vai direto; reabrir (resolvido → em atendimento) pede o motivo.
  const pedeTexto = (s: Status) => Boolean(PEDE_TEXTO[s]) && (s !== 'em_atendimento' || status === 'resolvido')
  const pede = escolhido ? PEDE_TEXTO[escolhido] : undefined

  function aplicar(para: Status) {
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('chamadoId', chamadoId); form.set('status', para); form.set('texto', texto)
      const r = await mudarStatusDoChamado(form)
      if (r.erro) return setAviso({ tom: 'erro', texto: r.erro })
      setEscolhido(null); setTexto('')
      router.refresh()
    })
  }

  const rotulo = (s: Status) => status === 'resolvido' && s === 'em_atendimento' ? 'Reabrir' : BOTAO_DO_STATUS[s]
  return (
    <div data-ajuda="chamados.acoes" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {opcoes.map((s) => (
          <Button key={s} variant={s === 'resolvido' || (s === 'em_atendimento' && status === 'novo') ? 'default' : s === 'cancelado' ? 'ghost' : 'outline'} size="sm" disabled={ocupado}
            className={s === 'cancelado' ? 'text-destructive' : undefined}
            onClick={() => { setAviso(null); if (pedeTexto(s)) { setEscolhido(escolhido === s ? null : s); setTexto('') } else aplicar(s) }}>
            {rotulo(s)}
          </Button>
        ))}
      </div>
      {escolhido && pede && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">{pede.rotulo}
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={5000} className={campo} placeholder={pede.placeholder} autoFocus />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEscolhido(null)}>Voltar</Button>
            <Button size="sm" disabled={ocupado || (pede.obrigatorio && texto.trim().length < 3)} onClick={() => aplicar(escolhido)}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}{rotulo(escolhido)}</Button>
          </div>
        </div>
      )}
      <Recado aviso={aviso} />
    </div>
  )
}

// ------------------------------------------------------------------ avaliação

export function Avaliacao({ chamadoId, podeReabrir }: { chamadoId: string; podeReabrir: boolean }) {
  const router = useRouter()
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [reabrindo, setReabrindo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  function executar(acao: (f: FormData) => Promise<Resultado>, campos: Record<string, string>) {
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('chamadoId', chamadoId)
      Object.entries(campos).forEach(([k, v]) => form.set(k, v))
      const r = await acao(form)
      if (r.erro) return setAviso({ tom: 'erro', texto: r.erro })
      router.refresh()
    })
  }
  return (
    <Card data-ajuda="chamados.avaliacao" className="flex flex-col gap-4 border-success/40 bg-success/5 p-5">
      <div><p className="font-semibold">A equipe marcou este chamado como resolvido</p><p className="text-sm text-muted-foreground">Confirme e diga como foi o atendimento — ou reabra, se o problema continuar.</p></div>
      {!reabrindo ? <>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Nota do atendimento">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} de 5`} onClick={() => setNota(n)} className="rounded p-1 hover:bg-muted">
              <Star className={cn('size-7', n <= nota ? 'fill-warning text-warning' : 'text-muted-foreground/40')} />
            </button>
          ))}
        </div>
        {nota > 0 && <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={1000} className={campo} placeholder="Quer deixar um comentário? (opcional)" />}
        <div className="flex flex-wrap justify-between gap-2">
          {podeReabrir ? <Button variant="ghost" size="sm" onClick={() => setReabrindo(true)}>O problema continua — reabrir</Button> : <span />}
          <Button size="sm" disabled={!nota || ocupado} onClick={() => executar(avaliarChamado, { nota: String(nota), comentario })}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Confirmar e avaliar</Button>
        </div>
      </> : <>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={5000} className={campo} placeholder="O que ainda não foi resolvido?" autoFocus />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setReabrindo(false)}>Voltar</Button>
          <Button size="sm" disabled={motivo.trim().length < 3 || ocupado} onClick={() => executar(mudarStatusDoChamado, { status: 'em_atendimento', texto: motivo })}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Reabrir chamado</Button>
        </div>
      </>}
      <Recado aviso={aviso} />
    </Card>
  )
}

// ------------------------------------------------------------------ triagem (equipe)

export function Triagem({ chamadoId, responsavelId, equipe, impacto, urgencia, filas, filaAtual, encerrado }: {
  chamadoId: string; responsavelId: string | null; equipe: { id: string; nome: string }[]; impacto: 1 | 2 | 3; urgencia: 1 | 2 | 3
  filas: { id: string; nome: string; categorias: { id: string; nome: string }[] }[]; filaAtual: string; encerrado: boolean
}) {
  const router = useRouter()
  const [transferindo, setTransferindo] = useState(false)
  const [destino, setDestino] = useState('')
  const [categoria, setCategoria] = useState('')
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  function executar(acao: (f: FormData) => Promise<Resultado>, campos: Record<string, string>) {
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('chamadoId', chamadoId)
      Object.entries(campos).forEach(([k, v]) => form.set(k, v))
      const r = await acao(form)
      setAviso(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) { setTransferindo(false); router.refresh() }
    })
  }
  const outras = filas.filter((f) => f.id !== filaAtual)
  return (
    <div className="flex flex-col gap-4 text-sm">
      <label className="flex flex-col gap-1.5 font-medium">Responsável
        <select value={responsavelId ?? ''} disabled={encerrado || ocupado} onChange={(e) => executar(atribuirChamado, { responsavelId: e.target.value })} className={campo}>
          <option value="">Sem responsável</option>
          {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 font-medium">Impacto
        <select value={impacto} disabled={encerrado || ocupado} onChange={(e) => executar(definirImpacto, { impacto: e.target.value })} className={campo}>
          {([1, 2, 3] as const).map((i) => <option key={i} value={i}>{IMPACTO[i].rotulo} → prioridade {ROTULO_DA_PRIORIDADE[prioridade(urgencia, i)].toLowerCase()}</option>)}
        </select>
        <span className="text-xs font-normal text-muted-foreground">Urgência informada: {URGENCIA[urgencia].rotulo.toLowerCase()}. A prioridade sai da combinação dos dois.</span>
      </label>
      {!encerrado && outras.length > 0 && (transferindo ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <select value={destino} onChange={(e) => { setDestino(e.target.value); setCategoria('') }} className={campo}><option value="">Transferir para…</option>{outras.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          {destino && <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}><option value="">Assunto na nova fila…</option>{outras.find((f) => f.id === destino)?.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={campo} placeholder="Por que está transferindo?" />
          <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setTransferindo(false)}>Voltar</Button><Button size="sm" disabled={!destino || !categoria || motivo.trim().length < 3 || ocupado} onClick={() => executar(transferirChamado, { filaId: destino, categoriaId: categoria, texto: motivo })}>Transferir</Button></div>
        </div>
      ) : <Button variant="outline" size="sm" onClick={() => setTransferindo(true)}>Transferir para outra fila</Button>)}
      <Recado aviso={aviso} />
    </div>
  )
}

