'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Lock, MailX, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { enviarEmailDoSetor } from '@/app/actions/correio'

export type CaixaDoSetor = { id: string; email: string; nome: string; assinatura: string; setor: string }
export type EnvioNaTela = {
  id: string
  de: string
  para: string[]
  cc: string[]
  assunto: string
  corpo: string
  estado: 'enviado' | 'falhou'
  erro: string | null
  quando: string
  setor: string
  autor: string
}

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function Correio({ caixas, historico, situacao, ehAdmin }: {
  caixas: CaixaDoSetor[]
  historico: EnvioNaTela[]
  situacao: 'ok' | 'expirada' | 'desconectado'
  ehAdmin: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      {situacao !== 'ok' ? (
        <Card className="flex items-start gap-3 border-dashed p-5 text-sm">
          <MailX className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            {situacao === 'expirada' ? 'A autorização da conta Google expirou. ' : 'O correio ainda não foi ligado à conta Google. '}
            {ehAdmin ? <>Resolva em <a href="/configuracoes#correio" className="text-primary hover:underline">Configurações → Correio dos setores</a>.</> : 'Avise um administrador.'}
          </p>
        </Card>
      ) : caixas.length === 0 ? (
        <Card className="flex items-start gap-3 border-dashed p-5 text-sm">
          <MailX className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Você ainda não faz parte de um setor com endereço ativo. {ehAdmin
              ? <>Atribua endereços e membros em <a href="/configuracoes#correio" className="text-primary hover:underline">Configurações → Correio dos setores</a>.</>
              : 'Peça a um administrador para incluir você no seu setor.'}
          </p>
        </Card>
      ) : (
        <Escrever caixas={caixas} />
      )}
      <Historico envios={historico} />
    </div>
  )
}

function Escrever({ caixas }: { caixas: CaixaDoSetor[] }) {
  const router = useRouter()
  const [caixaId, setCaixaId] = useState(caixas[0].id)
  const [para, setPara] = useState('')
  const [cc, setCc] = useState('')
  const [mostrarCc, setMostrarCc] = useState(false)
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [enviando, enviar] = useTransition()
  const caixa = caixas.find((c) => c.id === caixaId) ?? caixas[0]

  function disparar() {
    setRecado(null)
    enviar(async () => {
      const f = new FormData()
      f.set('caixaId', caixa.id); f.set('para', para); f.set('cc', cc); f.set('assunto', assunto); f.set('corpo', corpo)
      const r = await enviarEmailDoSetor(f)
      if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); router.refresh(); return }
      setRecado({ tom: 'ok', texto: r.recado ?? 'Enviado.' })
      setPara(''); setCc(''); setAssunto(''); setCorpo('')
      router.refresh()
    })
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr] sm:items-center">
        <span className="text-sm font-medium">De</span>
        {caixas.length === 1 ? (
          <p className="flex items-center gap-2 text-sm">
            <Lock className="size-3.5 text-muted-foreground" />
            <span><strong>{caixa.nome || caixa.email}</strong> &lt;{caixa.email}&gt;</span>
            <span className="text-xs text-muted-foreground">· {caixa.setor}</span>
          </p>
        ) : (
          <select value={caixaId} onChange={(e) => setCaixaId(e.target.value)} disabled={enviando} className={campo} aria-label="Enviar de">
            {caixas.map((c) => <option key={c.id} value={c.id}>{c.nome ? `${c.nome} <${c.email}>` : c.email} — {c.setor}</option>)}
          </select>
        )}
        <label htmlFor="correio-para" className="text-sm font-medium">Para</label>
        <div className="flex gap-2">
          <input id="correio-para" value={para} onChange={(e) => setPara(e.target.value)} disabled={enviando} placeholder="nome@exemplo.org, outro@exemplo.org" className={campo} />
          {!mostrarCc && <Button variant="ghost" size="sm" onClick={() => setMostrarCc(true)}>Cc</Button>}
        </div>
        {mostrarCc && (
          <>
            <label htmlFor="correio-cc" className="text-sm font-medium">Cc</label>
            <input id="correio-cc" value={cc} onChange={(e) => setCc(e.target.value)} disabled={enviando} className={campo} />
          </>
        )}
        <label htmlFor="correio-assunto" className="text-sm font-medium">Assunto</label>
        <input id="correio-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={enviando} maxLength={200} className={campo} />
      </div>

      <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} disabled={enviando} rows={10} aria-label="Mensagem" placeholder="Escreva a mensagem…" className={campo} />

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock className="size-3.5" />Assinatura do setor — entra automaticamente e não pode ser alterada aqui
        </p>
        {caixa.assinatura
          // A assinatura vem do Gmail; mostrada num quadro sem script.
          ? <iframe title="Assinatura" sandbox="" srcDoc={caixa.assinatura} className="h-32 w-full rounded-md border border-border bg-white" />
          : <p className="text-xs text-muted-foreground">Este endereço não tem assinatura no Gmail.</p>}
      </div>

      {recado && (
        <p className={`flex items-start gap-2 text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-500'}`}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{recado.texto}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={disparar} disabled={enviando || !para.trim() || !assunto.trim() || !corpo.trim()}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar
        </Button>
      </div>
    </Card>
  )
}

function Historico({ envios }: { envios: EnvioNaTela[] }) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? envios.filter((e) => `${e.assunto} ${e.de} ${e.para.join(' ')} ${e.autor}`.toLowerCase().includes(t)) : envios
  }, [envios, busca])

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="font-medium">Enviados</p>
          <p className="text-xs text-muted-foreground">Você vê o que saiu pelos seus setores. Administradores veem todos.</p>
        </div>
        <div className="relative min-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" className={`pl-9 ${campo}`} />
        </div>
      </div>
      {!lista.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{envios.length ? 'Nada na busca.' : 'Nada enviado ainda.'}</p>
      ) : (
        <ul className="divide-y divide-border">
          {lista.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setAberto(aberto === e.id ? null : e.id)} aria-expanded={aberto === e.id}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.assunto}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.de} → {e.para.join(', ')}{e.cc.length ? ` · cc ${e.cc.join(', ')}` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{e.setor} · {e.autor} · {quando.format(new Date(e.quando))}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.estado === 'enviado' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                  {e.estado === 'enviado' ? 'Enviado' : 'Falhou'}
                </span>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${aberto === e.id ? 'rotate-180' : ''}`} />
              </button>
              {aberto === e.id && (
                <div className="border-t border-border bg-muted/20 px-4 py-3 text-sm">
                  {e.erro && <p className="mb-2 text-xs text-destructive">{e.erro}</p>}
                  <p className="whitespace-pre-wrap">{e.corpo}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
