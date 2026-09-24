'use client'

import { useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from 'react'
import { FileText, Loader2, Mic, Paperclip, SendHorizontal, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient as clienteDoNavegador } from '@/lib/supabase/client'
import { enviarMensagem, prepararArquivos } from '@/app/actions/chat'
import {
  ARQUIVOS_POR_MENSAGEM, DURACAO_MAXIMA_DO_AUDIO, duracaoLegivel, mencaoEmAndamento, mencoesNoTexto, pessoasParaMencionar, tamanhoLegivel,
  TAMANHO_MAXIMO, TAMANHO_MAXIMO_DO_ARQUIVO, type MensagemDoChat, type PessoaDoChat,
} from '@/lib/chat/regras'

/** Por onde a conversa entrega arquivos soltos (arrastar e soltar) à caixa de escrever. */
export type EntradaDeArquivos = { adicionar: (arquivos: File[]) => void }

type Pendente = { chave: string; arquivo: File; url: string | null; duracao: number | null }

const tiposDeAudio = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
const carimbo = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/[^0-9]/g, '').slice(0, 12)

/**
 * A caixa de escrever: texto com @ (lista de pessoas), arquivos (clipe,
 * colar ou arrastar) e mensagem de voz gravada no navegador. Os arquivos sobem
 * direto para o Storage, e só depois a mensagem é registrada. O rascunho fica
 * guardado no navegador, por conversa (e por fio).
 */
export function Escrever({ ref, canalId, respostaDe, tipo, titulo, pessoas, membros, onEnviada, onErro, onForaDaConversa }: {
  ref?: React.Ref<EntradaDeArquivos>
  canalId: string
  respostaDe?: string
  tipo: string
  titulo: string
  /** Quem dá para mencionar (no canal, também quem ainda não está nele). */
  pessoas: PessoaDoChat[]
  membros: string[]
  onEnviada: (m: MensagemDoChat) => void
  onErro: (e: string) => void
  /** Mencionou quem não está na conversa (não foi avisado). */
  onForaDaConversa?: (ids: string[]) => void
}) {
  const chave = `chat-rascunho-${canalId}${respostaDe ? `-${respostaDe}` : ''}`
  const [texto, setTexto] = useState('')
  const [escolhidas, setEscolhidas] = useState<{ id: string; nome: string }[]>([])
  const [mencao, setMencao] = useState<{ inicio: number; busca: string } | null>(null)
  const [indice, setIndice] = useState(0)
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [enviando, iniciar] = useTransition()
  const caixa = useRef<HTMLTextAreaElement>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const naConversa = useMemo(() => new Set(membros), [membros])

  // O rascunho guardado só existe no navegador: lido depois de montar, para o HTML do servidor bater.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { setTexto(localStorage.getItem(chave) ?? '') } catch { setTexto('') } }, [chave])
  useEffect(() => { try { if (texto) localStorage.setItem(chave, texto); else localStorage.removeItem(chave) } catch { /* sem armazenamento local */ } }, [chave, texto])
  useEffect(() => { const el = caixa.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px` } }, [texto])

  // As prévias (imagem e áudio) usam endereços do navegador que precisam ser soltos.
  const vivos = useRef<Pendente[]>([])
  useEffect(() => { vivos.current = pendentes }, [pendentes])
  useEffect(() => () => { vivos.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)) }, [])

  const adicionar = (novos: File[], duracao: number | null = null) => {
    if (!novos.length) return
    const grandes = novos.filter((a) => a.size > TAMANHO_MAXIMO_DO_ARQUIVO)
    if (grandes.length) onErro(`${grandes.map((a) => a.name).join(', ')}: cada arquivo pode ter até 50 MB.`)
    const vazios = novos.filter((a) => a.size === 0)
    if (vazios.length) onErro(`${vazios.map((a) => a.name).join(', ')}: arquivo vazio.`)
    const bons = novos.filter((a) => a.size > 0 && a.size <= TAMANHO_MAXIMO_DO_ARQUIVO)
    // vivos.current: a lista de agora (a gravação chama isto de um render antigo).
    const cabem = bons.slice(0, Math.max(0, ARQUIVOS_POR_MENSAGEM - vivos.current.length))
    if (cabem.length < bons.length) onErro(`Até ${ARQUIVOS_POR_MENSAGEM} arquivos por mensagem.`)
    const novosPendentes = cabem.map((arquivo) => ({
      chave: `${arquivo.name}-${arquivo.size}-${Math.random().toString(36).slice(2)}`, arquivo, duracao,
      url: /^(image|audio)\//.test(arquivo.type) ? URL.createObjectURL(arquivo) : null,
    }))
    vivos.current = [...vivos.current, ...novosPendentes]
    setPendentes((atuais) => [...atuais, ...novosPendentes])
    caixa.current?.focus()
  }
  useImperativeHandle(ref, () => ({ adicionar: (a) => adicionar(a) }))
  const tirar = (p: Pendente) => { if (p.url) URL.revokeObjectURL(p.url); setPendentes((l) => l.filter((x) => x.chave !== p.chave)) }

  const opcoes = useMemo(() => {
    if (!mencao) return []
    const lista: { id: string; nome: string; sub?: string }[] = pessoasParaMencionar(pessoas, mencao.busca, 8)
      .map((p) => ({ id: p.id, nome: p.nome, sub: tipo === 'canal' && !naConversa.has(p.id) ? 'não está no canal' : undefined }))
      .sort((a, b) => Number(Boolean(a.sub)) - Number(Boolean(b.sub)))
    if (tipo === 'canal' && 'canal'.startsWith(mencao.busca.toLowerCase())) lista.push({ id: 'canal', nome: 'canal', sub: 'avisa todo mundo do canal' })
    return lista
  }, [mencao, pessoas, tipo, naConversa])

  const escolher = (o: { id: string; nome: string }) => {
    if (!mencao) return
    const antes = texto.slice(0, mencao.inicio)
    const depois = texto.slice(mencao.inicio + 1 + mencao.busca.length)
    setTexto(`${antes}@${o.nome} ${depois}`)
    if (o.id !== 'canal') setEscolhidas((e) => [...e.filter((x) => x.id !== o.id), { id: o.id, nome: o.nome }])
    setMencao(null)
    requestAnimationFrame(() => { const el = caixa.current; if (el) { const pos = antes.length + o.nome.length + 2; el.focus(); el.setSelectionRange(pos, pos) } })
  }

  // Gravação de voz em andamento.
  const [gravando, setGravando] = useState<{ inicio: number } | null>(null)
  const [agora, setAgora] = useState(0)
  const gravador = useRef<MediaRecorder | null>(null)
  const descartar = useRef(false)

  const enviar = () => {
    const corpo = texto.trim()
    if ((!corpo && !pendentes.length) || enviando || gravando) return
    const indo = pendentes
    iniciar(async () => {
      let anexos: { caminho: string; nome: string; duracao: number | null }[] = []
      if (indo.length) {
        const r = await prepararArquivos(canalId, indo.map((p) => ({ nome: p.arquivo.name, tipo: p.arquivo.type, tamanho: p.arquivo.size })))
        if (r.erro || !r.envios) { onErro(r.erro ?? 'Não foi possível preparar o envio.'); return }
        const supabase = clienteDoNavegador()
        const subidas = await Promise.all(r.envios.map((e, i) => supabase.storage.from('chat-arquivos')
          .uploadToSignedUrl(e.caminho, e.token, indo[i].arquivo, { contentType: indo[i].arquivo.type || 'application/octet-stream' })))
        if (subidas.some((s) => s.error)) { onErro('Um dos arquivos não subiu. Confira a conexão e tente de novo.'); return }
        anexos = r.envios.map((e, i) => ({ caminho: e.caminho, nome: indo[i].arquivo.name, duracao: indo[i].duracao }))
      }
      const mencoes = mencoesNoTexto(corpo, escolhidas)
      const r = await enviarMensagem(canalId, corpo, mencoes, { respostaDe: respostaDe ?? null, anexos })
      if (r.erro) { onErro(r.erro); return }
      onErro('')
      setTexto(''); setEscolhidas([])
      indo.forEach((p) => p.url && URL.revokeObjectURL(p.url))
      setPendentes((l) => l.filter((p) => !indo.includes(p)))
      if (r.mensagem) onEnviada(r.mensagem)
      const fora = mencoes.filter((id) => !naConversa.has(id))
      if (fora.length) onForaDaConversa?.(fora)
    })
  }

  // ------------------------------------------------------------ voz
  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => {
      const n = Date.now(); setAgora(n)
      if ((n - gravando.inicio) / 1000 >= DURACAO_MAXIMA_DO_AUDIO) gravador.current?.stop()
    }, 250)
    return () => clearInterval(t)
  }, [gravando])
  useEffect(() => () => { descartar.current = true; if (gravador.current?.state === 'recording') gravador.current.stop() }, [])

  const gravar = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { onErro('Este navegador não grava áudio.'); return }
    let fluxo: MediaStream
    try { fluxo = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { onErro('Permita o uso do microfone para gravar a mensagem de voz.'); return }
    const escolhido = tiposDeAudio.find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(fluxo, escolhido ? { mimeType: escolhido } : undefined)
    const pedacos: Blob[] = []
    const inicio = Date.now()
    descartar.current = false
    rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data) }
    rec.onstop = () => {
      fluxo.getTracks().forEach((t) => t.stop())
      gravador.current = null
      setGravando(null)
      if (descartar.current || !pedacos.length) return
      const mime = rec.mimeType || escolhido || 'audio/webm'
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
      const duracao = Math.round((Date.now() - inicio) / 100) / 10
      if (duracao < 0.8) { onErro('Gravação curta demais.'); return }
      adicionar([new File(pedacos, `mensagem-de-voz-${carimbo()}.${ext}`, { type: mime })], duracao)
    }
    rec.start(1000)
    gravador.current = rec
    setAgora(inicio)
    setGravando({ inicio })
  }
  const parar = (jogarFora = false) => { descartar.current = jogarFora; gravador.current?.stop() }

  return (
    <div className="relative border-t border-border p-3">
      {mencao && opcoes.length > 0 && (
        <ul className="absolute bottom-full left-3 z-10 mb-1 w-72 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg" role="listbox" aria-label="Mencionar">
          {opcoes.map((o, i) => (
            <li key={o.id}>
              <button type="button" role="option" aria-selected={i === indice} onMouseDown={(e) => { e.preventDefault(); escolher(o) }}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${i === indice ? 'bg-muted' : ''}`}>
                <span className="font-medium">@{o.nome}</span>{o.sub && <span className="text-xs text-muted-foreground">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendentes.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Arquivos para enviar" data-pendentes>
          {pendentes.map((p) => (
            <li key={p.chave} className="relative flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/30 p-1.5 pr-7 text-xs">
              {p.url && p.arquivo.type.startsWith('image/')
                ? <img src={p.url} alt="" className="size-10 rounded object-cover" />
                : p.url && p.arquivo.type.startsWith('audio/')
                  ? <audio controls src={p.url} className="h-8 w-48 max-w-full" />
                  : <FileText className="size-6 text-primary" />}
              <span className="min-w-0">
                <span className="block max-w-40 truncate font-medium">{p.arquivo.type.startsWith('audio/') && p.duracao ? `Voz · ${duracaoLegivel(p.duracao)}` : p.arquivo.name}</span>
                <span className="text-muted-foreground">{tamanhoLegivel(p.arquivo.size)}</span>
              </span>
              <button type="button" disabled={enviando} onClick={() => tirar(p)} className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={`Tirar ${p.arquivo.name}`}><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5 rounded-xl border border-border bg-background px-2 py-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        {gravando ? (
          <div className="flex min-h-8 flex-1 items-center gap-2 px-1 text-sm" role="status" data-gravando>
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
            <span className="font-medium tabular-nums">Gravando {duracaoLegivel((agora - gravando.inicio) / 1000)}</span>
            <span className="text-xs text-muted-foreground">até {DURACAO_MAXIMA_DO_AUDIO / 60} min</span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => parar(true)}>Descartar</Button>
            <Button size="sm" onClick={() => parar()}><Square className="size-3" />Parar</Button>
          </div>
        ) : (
          <>
            <input ref={seletor} type="file" multiple hidden onChange={(e) => { adicionar([...(e.target.files ?? [])]); e.target.value = '' }} />
            <button type="button" className="mb-0.5 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Anexar arquivos" title="Anexar arquivos (até 50 MB cada)"
              disabled={enviando} onClick={() => seletor.current?.click()}><Paperclip className="size-4" /></button>
            <textarea ref={caixa} value={texto} rows={1} maxLength={TAMANHO_MAXIMO} placeholder={respostaDe ? 'Responder no fio…' : `Mensagem para ${titulo}`} aria-label={respostaDe ? 'Responder no fio' : `Mensagem para ${titulo}`}
              className="max-h-[200px] min-h-6 flex-1 resize-none self-center bg-transparent text-sm outline-none"
              onChange={(e) => { setTexto(e.target.value); setMencao(mencaoEmAndamento(e.target.value, e.target.selectionStart ?? e.target.value.length)); setIndice(0) }}
              onPaste={(e) => { const arquivos = [...e.clipboardData.files]; if (arquivos.length) { e.preventDefault(); adicionar(arquivos) } }}
              onKeyDown={(e) => {
                if (mencao && opcoes.length) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => (i + 1) % opcoes.length); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => (i - 1 + opcoes.length) % opcoes.length); return }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(opcoes[indice]); return }
                  if (e.key === 'Escape') { setMencao(null); return }
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar() }
              }} />
            <button type="button" className="mb-0.5 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Gravar mensagem de voz" title="Gravar mensagem de voz"
              disabled={enviando} onClick={() => void gravar()}><Mic className="size-4" /></button>
            <Button size="icon" className="size-8 shrink-0" disabled={enviando || (!texto.trim() && !pendentes.length)} onClick={enviar} aria-label="Enviar">
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </Button>
          </>
        )}
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">
        {enviando && pendentes.length ? 'Enviando arquivos…' : `Enter envia · Shift+Enter quebra linha · @ menciona${tipo === 'canal' ? ' · @canal avisa todos' : ''} · arraste ou cole arquivos`}
      </p>
    </div>
  )
}
