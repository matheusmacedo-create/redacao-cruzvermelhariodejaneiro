'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff, Loader2,
  MessageCircle, MessageSquare, RefreshCw, Send, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { carregarFila, responder, esconder, type Fila } from '@/app/actions/atendimento'
import type { Mensagem } from '@/lib/atendimento/normalizar'

/**
 * O painel de atendimento: o que o público escreveu, numa fila só.
 *
 * Carrega ao abrir, com botão de atualizar — não há webhook de comentário nem
 * de DM neste conector, então "tempo real" seria uma promessa falsa. Consulta
 * periódica gastaria chamadas o dia inteiro para chegar minutos atrasada do
 * mesmo jeito.
 */

const CORES: Record<string, string> = {
  instagram: 'bg-pink-500/12 text-pink-700',
  facebook: 'bg-blue-500/12 text-blue-700',
  youtube: 'bg-red-500/12 text-red-700',
  linkedin: 'bg-sky-500/12 text-sky-700',
}

const NOMES: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn',
}

function quando(iso: string): string {
  if (!iso) return 'sem data'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sem data'
  const minutos = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  if (minutos < 60 * 24) return `há ${Math.floor(minutos / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * As três operações entram por parâmetro, com as ações reais como padrão.
 *
 * Não é indireção gratuita: é o que permite exercitar esta tela num navegador
 * de verdade, com respostas conhecidas, sem depender de rede social nem de
 * banco. O caminho de produção continua sendo o padrão — quem usa o painel não
 * passa nada.
 */
export function PainelDeAtendimento({
  carregar = carregarFila,
  enviar = responder,
  alternarVisibilidade = esconder,
}: {
  carregar?: () => Promise<Fila>
  enviar?: (dados: FormData) => Promise<{ erro?: string; recado?: string }>
  alternarVisibilidade?: (dados: FormData) => Promise<{ erro?: string; recado?: string }>
} = {}) {
  const [fila, setFila] = useState<Fila | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set())
  const [respondidos, setRespondidos] = useState<Set<string>>(new Set())
  const jaBuscou = useRef(false)

  const buscar = useCallback(async () => {
    setCarregando(true)
    setFila(await carregar())
    setCarregando(false)
  }, [carregar])

  useEffect(() => {
    // O guarda existe porque o modo estrito do React roda o efeito duas vezes
    // em desenvolvimento, e cada busca aqui são várias chamadas ao conector.
    if (jaBuscou.current) return
    jaBuscou.current = true
    void buscar()
  }, [buscar])

  const mensagens = (fila?.mensagens ?? []).filter((m) => !respondidos.has(m.id))

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">O que o público escreveu</h2>
            {!carregando && fila?.mensagens && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {mensagens.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Comentários das publicações e mensagens diretas, das redes que o conector alcança.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void buscar()} disabled={carregando}>
          {carregando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Atualizar
        </Button>
      </div>

      {recado && (
        <div className={cn(
          'flex items-start gap-2 border-b border-border px-4 py-3 text-sm',
          recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/12 text-success',
        )}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <p className="flex-1">{recado.texto}</p>
          <button type="button" onClick={() => setRecado(null)} aria-label="Fechar aviso"><X className="size-4" /></button>
        </div>
      )}

      {carregando && !fila && (
        <p className="p-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
          Buscando comentários e mensagens…
        </p>
      )}

      {fila?.erro && (
        <p className="p-6 text-sm text-destructive">{fila.erro}</p>
      )}

      {fila && !fila.erro && !mensagens.length && !carregando && (
        <p className="p-10 text-center text-sm text-muted-foreground">
          Nenhum comentário ou mensagem nova nas publicações recentes.
        </p>
      )}

      {mensagens.length > 0 && (
        <ul className="divide-y divide-border">
          {mensagens.map((m) => (
            <Linha
              key={m.id}
              mensagem={m}
              escondido={escondidos.has(m.id)}
              aoResponder={(texto) => enviarResposta(m, texto)}
              aoEsconder={() => trocarVisibilidade(m)}
            />
          ))}
        </ul>
      )}

      {(fila?.avisos?.length || fila?.foraDoAlcance?.length) && (
        <div className="space-y-1 border-t border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
          {fila.avisos?.map((aviso, i) => (
            <p key={`a${i}`} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />{aviso}
            </p>
          ))}
          {fila.foraDoAlcance?.map((f) => (
            <p key={f.canal}>
              <strong className="capitalize text-foreground">{NOMES[f.canal] ?? f.canal}:</strong> {f.motivo}
            </p>
          ))}
        </div>
      )}
    </Card>
  )

  async function enviarResposta(m: Mensagem, texto: string) {
    const dados = new FormData()
    dados.set('origem', m.origem)
    dados.set('canal', m.canal)
    dados.set('texto', texto)
    if (m.comentarioId) dados.set('comentarioId', m.comentarioId)
    if (m.postId) dados.set('postId', m.postId)
    if (m.destinatarioId) dados.set('destinatarioId', m.destinatarioId)

    const r = await enviar(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return false }
    // Sai da fila: respondido não é mais pendência. A próxima atualização
    // traz a lista de novo do conector, então nada se perde.
    setRespondidos((antes) => new Set(antes).add(m.id))
    setRecado({ tom: 'ok', texto: r.recado ?? 'Resposta enviada.' })
    return true
  }

  async function trocarVisibilidade(m: Mensagem) {
    if (!m.comentarioId) return
    const estaEscondido = escondidos.has(m.id)
    const dados = new FormData()
    dados.set('canal', m.canal)
    dados.set('comentarioId', m.comentarioId)
    if (estaEscondido) dados.set('mostrar', '1')

    const r = await alternarVisibilidade(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
    setEscondidos((antes) => {
      const novo = new Set(antes)
      if (estaEscondido) novo.delete(m.id); else novo.add(m.id)
      return novo
    })
    setRecado({ tom: 'ok', texto: r.recado ?? 'Pronto.' })
  }
}

function Linha({ mensagem, escondido, aoResponder, aoEsconder }: {
  mensagem: Mensagem
  escondido: boolean
  aoResponder: (texto: string) => Promise<boolean>
  aoEsconder: () => Promise<void>
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, comecar] = useTransition()

  const eDm = mensagem.origem === 'dm'

  return (
    <li className={cn('p-4', escondido && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn('rounded-md px-2 py-0.5 font-medium', CORES[mensagem.canal] ?? 'bg-muted text-muted-foreground')}>
          {NOMES[mensagem.canal] ?? mensagem.canal}
        </span>
        <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          {eDm ? <MessageSquare className="size-3" /> : <MessageCircle className="size-3" />}
          {eDm ? 'Mensagem direta' : 'Comentário'}
        </span>
        <span className="font-medium text-foreground">{mensagem.autor}</span>
        <span className="text-muted-foreground">{quando(mensagem.quando)}</span>
        {escondido && <span className="rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground">Escondido</span>}
        {mensagem.formatoDesconhecido && (
          <span className="rounded-md bg-warning/20 px-2 py-0.5 text-warning-foreground">Formato não reconhecido</span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm">{mensagem.texto}</p>

      {mensagem.postTitulo && (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          em “{mensagem.postTitulo}”
          {mensagem.postUrl && (
            <a href={mensagem.postUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline">
              abrir <ExternalLink className="size-3" />
            </a>
          )}
        </p>
      )}

      {!mensagem.respondivel && mensagem.motivo && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />{mensagem.motivo}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {mensagem.respondivel && !abrindo && (
          <Button size="sm" variant="outline" onClick={() => setAbrindo(true)}>
            <Send className="size-3.5" />Responder
          </Button>
        )}
        {!eDm && mensagem.comentarioId && (
          <Button size="sm" variant="ghost" onClick={() => void aoEsconder()}>
            {escondido ? <><Eye className="size-3.5" />Mostrar</> : <><EyeOff className="size-3.5" />Esconder</>}
          </Button>
        )}
      </div>

      {abrindo && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            comecar(async () => {
              const foi = await aoResponder(texto)
              if (foi) { setTexto(''); setAbrindo(false) }
            })
          }}
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={2000}
            autoFocus
            aria-label={`Resposta para ${mensagem.autor}`}
            placeholder={eDm ? 'Sua mensagem…' : 'Sua resposta pública ao comentário…'}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={enviando || !texto.trim()}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {eDm ? 'Enviar mensagem' : 'Publicar resposta'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAbrindo(false); setTexto('') }}>
              Cancelar
            </Button>
            {!eDm && (
              <span className="text-xs text-muted-foreground">A resposta fica pública, sob o comentário.</span>
            )}
          </div>
        </form>
      )}
    </li>
  )
}
