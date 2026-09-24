'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Bitcoin, Check, Clock, Copy, Download, ExternalLink, Files, Loader2, RefreshCw, ShieldCheck, Signature, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { assinarOficio, cancelarOficio, duplicarComoRascunho, recusarAssinatura, verificarCarimboAgora } from '@/app/actions/oficios'
import { hashLegivel, momento } from '@/lib/oficios/documento'

export type CarimboNoPainel = {
  estado: 'pendente' | 'enviado' | 'confirmado'
  bloco: number | null
  enviadoEm: string | null
  confirmadoEm: string | null
  ultimoErro: string | null
  calendarios: string[]
} | null

export type AssinanteNoPainel = { userId: string | null; nome: string; cargo: string | null; estado: 'pendente' | 'assinado' | 'recusado'; assinadoEm: string | null; motivo: string | null }

function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" aria-label={rotulo} title={rotulo} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => navigator.clipboard?.writeText(valor).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }).catch(() => undefined)}>
      {ok ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/**
 * O lado direito de um ofício emitido: assinar (com senha), recusar,
 * cancelar, e a situação da prova no Bitcoin com os arquivos para conferir.
 */
export function PainelDoOficio(props: {
  id: string
  estado: 'em_assinatura' | 'assinado' | 'cancelado'
  hashDocumento: string
  hashManifesto: string | null
  codigo: string
  urlPublica: string
  eu: string
  podeCancelar: boolean
  assinantes: AssinanteNoPainel[]
  carimbo: CarimboNoPainel
  motivoCancelamento: string | null
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<'assinar' | 'recusar' | 'cancelar' | null>(null)
  const [senha, setSenha] = useState('')
  const [concordo, setConcordo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, iniciar] = useTransition()
  const minha = props.assinantes.find((a) => a.userId === props.eu)
  const devoAssinar = props.estado === 'em_assinatura' && minha?.estado === 'pendente'
  const assinaram = props.assinantes.filter((a) => a.estado === 'assinado').length

  const fechar = () => { if (!ocupado) { setDialogo(null); setErro(''); setSenha(''); setMotivo(''); setConcordo(false) } }
  const executar = (acao: () => Promise<{ erro?: string }>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await acao()
    if (r.erro) { setErro(r.erro); return }
    setDialogo(null); setSenha(''); setMotivo(''); setConcordo(false)
    depois?.()
    router.refresh()
  })

  const c = props.carimbo
  return (
    <div className="flex flex-col gap-4">
      {devoAssinar && (
        <Card className="flex flex-col gap-3 border-primary/50 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Este ofício espera a sua assinatura.</p>
          <p className="text-xs text-muted-foreground">Leia a folha ao lado. Ao assinar, você confirma este texto — identificado pelo código abaixo — com a sua senha do Redação.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialogo('assinar')}><Signature className="size-4" />Assinar</Button>
            <Button variant="outline" onClick={() => setDialogo('recusar')}>Recusar</Button>
          </div>
        </Card>
      )}
      {aviso && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm" role="status">{aviso}</p>}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assinaturas</p>
          <span className="text-xs tabular-nums text-muted-foreground">{assinaram} de {props.assinantes.length}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {props.assinantes.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {a.estado === 'assinado' ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Assinou" />
                : a.estado === 'recusado' ? <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Recusou" />
                  : <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Pendente" />}
              <div className="min-w-0">
                <p className="font-medium">{a.nome}{a.userId === props.eu ? ' (você)' : ''}</p>
                <p className="text-xs text-muted-foreground">
                  {a.estado === 'assinado' && a.assinadoEm ? `Assinou em ${momento(a.assinadoEm)}` : a.estado === 'recusado' ? `Recusou${a.motivo ? `: ${a.motivo}` : ''}` : props.estado === 'cancelado' ? 'Não assinou' : 'Aguardando'}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {props.estado === 'cancelado' && props.motivoCancelamento && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"><span className="font-semibold">Cancelado:</span> {props.motivoCancelamento}</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integridade</p>
        <div className="text-xs">
          <p className="flex items-center justify-between gap-2 font-medium">Código do documento (SHA-256)<Copiar valor={props.hashDocumento} rotulo="Copiar código do documento" /></p>
          <p className="break-all font-mono text-[11px] text-muted-foreground">{hashLegivel(props.hashDocumento)}</p>
        </div>
        {props.hashManifesto && (
          <div className="text-xs">
            <p className="flex items-center justify-between gap-2 font-medium">Manifesto de assinaturas (SHA-256)<Copiar valor={props.hashManifesto} rotulo="Copiar código do manifesto" /></p>
            <p className="break-all font-mono text-[11px] text-muted-foreground">{hashLegivel(props.hashManifesto)}</p>
          </div>
        )}
        <a href={props.urlPublica} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <ExternalLink className="size-3.5" />Página pública de conferência (e versão para imprimir)
        </a>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Bitcoin className="size-3.5" />Registro no Bitcoin</p>
          {c && <SeloDoCarimbo estado={c.estado} />}
        </div>
        {!c ? (
          <p className="text-xs text-muted-foreground">O registro começa quando todas as pessoas assinarem. Só o código do manifesto vai ao Bitcoin — nenhum texto ou nome.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {c.estado === 'confirmado'
                ? <>Gravado no bloco <a href={`https://mempool.space/block/${c.bloco}`} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline">{c.bloco?.toLocaleString('pt-BR')}</a>{c.confirmadoEm ? `, conferido em ${momento(c.confirmadoEm)}` : ''}. A prova vale por si, mesmo sem o Redação.</>
                : c.estado === 'enviado'
                  ? <>Enviado aos calendários do OpenTimestamps{c.enviadoEm ? ` em ${momento(c.enviadoEm)}` : ''}. Entra num bloco do Bitcoin em algumas horas; o Redação confere sozinho.</>
                  : 'Na fila para ser enviado aos calendários.'}
            </p>
            {c.ultimoErro && c.estado !== 'confirmado' && <p className="text-xs text-destructive">Última tentativa: {c.ultimoErro}</p>}
            <div className="flex flex-wrap gap-2">
              {c.estado !== 'pendente' && (
                <Button size="sm" variant="outline" render={<a href={`/api/verificar/${props.codigo}/prova`} />}><Download className="size-3.5" />Prova .ots</Button>
              )}
              <Button size="sm" variant="outline" render={<a href={`/api/verificar/${props.codigo}/manifesto`} />}><Download className="size-3.5" />Manifesto</Button>
              {c.estado !== 'confirmado' && (
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => executar(async () => {
                  const r = await verificarCarimboAgora(props.id)
                  if (!r.erro) setAviso(r.estado === 'confirmado' ? 'Confirmado no Bitcoin.' : r.estado === 'enviado' ? 'Enviado aos calendários.' : 'Ainda aguardando um bloco do Bitcoin.')
                  return r
                })}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Verificar agora</Button>
              )}
            </div>
          </>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <form action={duplicarComoRascunho.bind(null, props.id)}>
          <Button type="submit" size="sm" variant="outline"><Files className="size-3.5" />Duplicar como rascunho</Button>
        </form>
        {props.podeCancelar && props.estado !== 'cancelado' && (
          <Button size="sm" variant="ghost" onClick={() => setDialogo('cancelar')}><Ban className="size-3.5" />Cancelar ofício</Button>
        )}
      </div>
      {erro && !dialogo && <p className="text-sm text-destructive" role="alert">{erro}</p>}

      {dialogo === 'assinar' && (
        <Dialog titulo="Assinar ofício" descricao="A assinatura fica registrada com data, hora, o código do documento e o seu acesso." onFechar={fechar} podeFechar={!ocupado}>
          <form className="flex flex-col gap-4 px-6 py-5" onSubmit={(e) => { e.preventDefault(); executar(() => assinarOficio(props.id, props.hashDocumento, senha, concordo), () => setAviso('Assinatura registrada.')) }}>
            <p className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">{hashLegivel(props.hashDocumento)}</p>
            <label className="flex items-start gap-2 text-sm">
              <input id="oficio-concordo" type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} className="mt-1 size-4 accent-primary" />
              <span>Li o ofício e concordo com o texto identificado pelo código acima.</span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Sua senha do Redação
              <input id="oficio-senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={inputClass} />
            </label>
            {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Voltar</Button>
              <Button type="submit" disabled={ocupado || !concordo || !senha}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Assinar</Button>
            </div>
          </form>
        </Dialog>
      )}

      {(dialogo === 'recusar' || dialogo === 'cancelar') && (
        <Dialog
          titulo={dialogo === 'recusar' ? 'Recusar assinatura' : 'Cancelar ofício'}
          descricao={dialogo === 'recusar'
            ? 'O ofício é cancelado com o seu motivo. O número fica registrado como cancelado, e dá para duplicar o texto num novo rascunho.'
            : 'O ofício continua guardado, com o número, as assinaturas e o motivo. Nada é apagado.'}
          onFechar={fechar} podeFechar={!ocupado}
        >
          <form className="flex flex-col gap-4 px-6 py-5" onSubmit={(e) => {
            e.preventDefault()
            executar(() => (dialogo === 'recusar' ? recusarAssinatura(props.id, motivo) : cancelarOficio(props.id, motivo)))
          }}>
            <label className="flex flex-col gap-1 text-sm font-medium">Motivo
              <textarea id="oficio-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} className={inputClass} />
            </label>
            {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 5}>{ocupado && <Loader2 className="size-4 animate-spin" />}{dialogo === 'recusar' ? 'Recusar e cancelar' : 'Cancelar ofício'}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

export function SeloDoCarimbo({ estado }: { estado: 'pendente' | 'enviado' | 'confirmado' }) {
  const m = {
    confirmado: { rotulo: 'Confirmado', classe: 'bg-success/15 text-success' },
    enviado: { rotulo: 'Aguardando bloco', classe: 'bg-warning/20 text-warning-foreground' },
    pendente: { rotulo: 'Na fila', classe: 'bg-muted text-muted-foreground' },
  }[estado]
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.classe}`}>{m.rotulo}</span>
}
