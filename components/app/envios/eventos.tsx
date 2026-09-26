'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Download, Eye, EyeOff, ExternalLink, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { alternarAlbum, alternarEnvioDoEvento, criarEvento, definirEventoDoEnvio, esconderDoAlbum, salvarEvento } from '@/app/actions/eventos'
import { cn } from '@/lib/utils'

const campo = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'

function Erro({ texto }: { texto: string | null }) {
  return texto ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{texto}</p> : null
}

/** A ficha do evento: nome, data e local. Serve para criar (sem id) e para editar. */
export function FichaDoEvento({ id, inicial, estreita = false }: { id?: string; inicial?: { nome: string; data: string | null; local: string | null }; estreita?: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  return (
    <form
      className={cn('grid gap-3', !estreita && 'sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end')}
      action={(fd) => iniciar(async () => {
        setErro(null); setSalvo(false)
        const r = id ? await salvarEvento(id, fd) : await criarEvento(fd)
        if (r.erro) { setErro(r.erro); return }
        if (!id && r.id) router.push(`/envios/eventos/${r.id}`)
        else { setSalvo(true); router.refresh() }
      })}
    >
      <label className="text-sm font-medium">Nome do evento<input name="nome" required minLength={3} maxLength={140} defaultValue={inicial?.nome} placeholder="Ex.: Ação de prevenção na Central do Brasil" className={campo} /></label>
      <label className="text-sm font-medium">Data<input name="data" type="date" defaultValue={inicial?.data ?? ''} className={campo} /></label>
      <label className="text-sm font-medium">Local<input name="local" maxLength={300} defaultValue={inicial?.local ?? ''} placeholder="Ex.: Central do Brasil, Centro" className={campo} /></label>
      <Button type="submit" size="lg" disabled={pendente}>{pendente ? 'Salvando…' : id ? (salvo ? 'Salvo' : 'Salvar') : 'Criar evento'}</Button>
      <div className={cn(!estreita && 'sm:col-span-4')}><Erro texto={erro} /></div>
    </form>
  )
}

/** Um link com QR code: copiar, baixar o QR, abrir — e ligar/desligar. */
export function LinkDoEvento({ eventoId, titulo, descricao, url, qr, arquivoDoQr, ligado, rotuloLigar, rotuloDesligar, avisoAoDesligar, aoAlternar }: {
  eventoId: string; titulo: string; descricao: string; url: string | null; qr: string | null; arquivoDoQr: string; ligado: boolean
  rotuloLigar: string; rotuloDesligar: string; avisoAoDesligar: string; aoAlternar: 'album' | 'envio'
}) {
  return (
    <section className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row">
      {ligado && url && qr
        ? <img src={qr} alt={`QR code para ${titulo.toLowerCase()}`} width={112} height={112} className="size-28 shrink-0 rounded-md border border-border bg-white p-1" />
        : <div className="flex size-28 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">desligado</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{descricao}</p>
        {ligado && url && <Copiavel url={url} qr={qr} arquivoDoQr={arquivoDoQr} />}
        <Alternar eventoId={eventoId} ligado={ligado} rotuloLigar={rotuloLigar} rotuloDesligar={rotuloDesligar} avisoAoDesligar={avisoAoDesligar} tipo={aoAlternar} />
      </div>
    </section>
  )
}

function Copiavel({ url, qr, arquivoDoQr }: { url: string; qr: string | null; arquivoDoQr: string }) {
  const [copiado, setCopiado] = useState(false)
  const botao = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 break-all rounded bg-muted px-2 py-1 text-xs">{url}</code>
      <button type="button" className={botao} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem área de transferência */ } }}>
        {copiado ? <Check className="size-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}{copiado ? 'Copiado' : 'Copiar link'}
      </button>
      {qr && <a href={qr} download={arquivoDoQr} className={botao}><Download className="size-3.5" aria-hidden="true" />Baixar QR code</a>}
      <a href={url} target="_blank" rel="noreferrer" className={botao}><ExternalLink className="size-3.5" aria-hidden="true" />Abrir</a>
    </div>
  )
}

function Alternar({ eventoId, ligado, rotuloLigar, rotuloDesligar, avisoAoDesligar, tipo }: {
  eventoId: string; ligado: boolean; rotuloLigar: string; rotuloDesligar: string; avisoAoDesligar: string; tipo: 'album' | 'envio'
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button type="button" size="sm" variant={ligado ? 'outline' : 'default'} disabled={pendente}
          onClick={() => {
            if (ligado && !window.confirm(avisoAoDesligar)) return
            iniciar(async () => {
              const r = tipo === 'album' ? await alternarAlbum(eventoId, !ligado) : await alternarEnvioDoEvento(eventoId, !ligado)
              setErro(r.erro ?? null)
              router.refresh()
            })
          }}>
          {ligado ? rotuloDesligar : rotuloLigar}
        </Button>
      </div>
      <Erro texto={erro} />
    </div>
  )
}

export type FotoInterna = { id: string; categoria: 'foto' | 'video'; autor: string; envioId: string; oculto: boolean; miniatura: string }

/** As fotos do evento como a equipe vê: todas, com "Esconder do álbum" em cada uma. */
export function FotosDoEvento({ fotos }: { fotos: FotoInterna[] }) {
  const [ocultos, setOcultos] = useState(() => new Set(fotos.filter((f) => f.oculto).map((f) => f.id)))
  const [erro, setErro] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  if (!fotos.length) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma foto ainda. Mande o link de envio para quem vai estar no evento.</p>
  return (
    <div className="flex flex-col gap-2" data-ajuda="eventos.fotos">
      <Erro texto={erro} />
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
        {fotos.map((f) => {
          const oculto = ocultos.has(f.id)
          return (
            <li key={f.id} className="group relative">
              <a href={`/envios/${f.envioId}`} className={cn('block aspect-square overflow-hidden rounded-md bg-muted', oculto && 'opacity-35')} title={`De ${f.autor} — abrir o envio`}>
                {f.categoria === 'foto'
                  ? <img src={f.miniatura} alt={`Foto de ${f.autor}`} loading="lazy" className="size-full object-cover" />
                  : <span className="flex size-full items-center justify-center bg-foreground/85 text-background"><Play className="size-6" aria-hidden="true" /></span>}
              </a>
              <button type="button"
                onClick={() => iniciar(async () => {
                  const r = await esconderDoAlbum(f.id, !oculto)
                  if (r.erro) { setErro(r.erro); return }
                  setOcultos((antes) => { const n = new Set(antes); if (oculto) n.delete(f.id); else n.add(f.id); return n })
                })}
                aria-label={oculto ? `Mostrar no álbum a foto de ${f.autor}` : `Esconder do álbum a foto de ${f.autor}`}
                className="absolute right-1 top-1 inline-flex h-7 items-center gap-1 rounded-md bg-black/60 px-1.5 text-[11px] font-medium text-white hover:bg-black/80">
                {oculto ? <><Eye className="size-3.5" aria-hidden="true" />Mostrar</> : <><EyeOff className="size-3.5" aria-hidden="true" />Esconder</>}
              </button>
              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[10px] text-white">{f.autor}</span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Esconder tira a foto do álbum para quem tem o link; ela continua no envio e na sua caixa.</p>
    </div>
  )
}

/** No envio: de que evento ele é (junta ao álbum). */
export function EventoDoEnvio({ envioId, atual, eventos }: { envioId: string; atual: string | null; eventos: { id: string; nome: string; data: string | null }[] }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2" data-ajuda="envios.evento">
      <select
        aria-label="Evento deste envio" value={atual ?? ''} disabled={pendente}
        onChange={(e) => { const v = e.target.value; iniciar(async () => { const r = await definirEventoDoEnvio(envioId, v); setErro(r.erro ?? null); router.refresh() }) }}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <option value="">Nenhum (envio avulso)</option>
        {eventos.map((ev) => <option key={ev.id} value={ev.id}>{ev.nome}{ev.data ? ` — ${ev.data.split('-').reverse().join('/')}` : ''}</option>)}
      </select>
      <Erro texto={erro} />
    </div>
  )
}
