'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pause, Play, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmarCodigoDoWhatsapp, pausarMeuWhatsapp, pedirCodigoDoWhatsapp, removerMeuWhatsapp, salvarCategoriasDoWhatsapp } from '@/app/actions/whatsapp'
import { CATEGORIAS, ROTULO_DA_CATEGORIA, type Categoria } from '@/lib/notificacoes/regras'
import { categoriaVaiPorWhatsapp } from '@/lib/whatsapp/regras'
import { cn } from '@/lib/utils'

const campo = 'h-10 min-w-48 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
type Recado = { tom: 'ok' | 'erro'; texto: string } | null

/**
 * O WhatsApp da pessoa: confirmar o número por código, pausar, trocar,
 * remover e escolher por assunto o que chega por lá. O número só vale depois
 * do código (app/actions/whatsapp.ts).
 */
export function WhatsappDoPerfil({ disponivel, conta, categorias }: {
  disponivel: boolean
  conta: { numero: string; pausado: boolean } | null
  categorias: Record<Categoria, boolean>
}) {
  const router = useRouter()
  const [trocando, setTrocando] = useState(false)
  const [numero, setNumero] = useState('')
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [atuais, setAtuais] = useState(categorias)
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, rodar] = useTransition()

  function pedir(event?: React.FormEvent) {
    event?.preventDefault()
    setRecado(null)
    rodar(async () => {
      const form = new FormData()
      form.set('numero', numero)
      const r = await pedirCodigoDoWhatsapp(form)
      if (r.erro) return setRecado({ tom: 'erro', texto: r.erro })
      setEnviadoPara(r.numero ?? numero)
      setCodigo('')
      setRecado({ tom: 'ok', texto: r.recado ?? 'Código enviado.' })
    })
  }

  function confirmar(event: React.FormEvent) {
    event.preventDefault()
    setRecado(null)
    rodar(async () => {
      const form = new FormData()
      form.set('codigo', codigo)
      const r = await confirmarCodigoDoWhatsapp(form)
      if (r.erro) return setRecado({ tom: 'erro', texto: r.erro })
      setRecado({ tom: 'ok', texto: r.recado ?? 'WhatsApp confirmado.' })
      setEnviadoPara(null)
      setTrocando(false)
      setNumero('')
      router.refresh()
    })
  }

  function simples(fn: () => Promise<{ erro?: string; recado?: string }>) {
    setRecado(null)
    rodar(async () => {
      const r = await fn()
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) router.refresh()
    })
  }

  function alternar(categoria: Categoria) {
    const anteriores = atuais
    const novas = { ...atuais, [categoria]: !atuais[categoria] }
    setAtuais(novas)
    setRecado(null)
    rodar(async () => {
      const r = await salvarCategoriasDoWhatsapp(novas)
      if (r.erro) { setAtuais(anteriores); setRecado({ tom: 'erro', texto: r.erro }) }
    })
  }

  if (!disponivel && !conta) {
    return <p className="text-sm text-muted-foreground">O WhatsApp do Palácio Virtual ainda não foi ligado pela administração. Quando for, você confirma o seu número aqui e passa a receber os avisos por lá.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Os mesmos avisos do sino, no seu WhatsApp, vindos do número do Palácio Virtual. Não chegam se você estiver com o Palácio aberto,
        e uma conversa movimentada manda no máximo uma mensagem a cada 15 minutos. De 22h às 7h os avisos esperam e chegam de manhã (menos os da portaria e os de segurança da conta). Responda <strong className="text-foreground">menu</strong> por lá para ver os avisos, marcar como lidos ou parar.
      </p>

      {conta && !trocando && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{conta.numero}</p>
            <p className={cn('text-xs', conta.pausado ? 'text-foreground' : 'text-success')}>{conta.pausado ? 'Pausado: nada chega por lá até você retomar.' : 'Confirmado. Os avisos chegam por lá.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={ocupado} onClick={() => simples(() => pausarMeuWhatsapp(!conta.pausado))}>
              {conta.pausado ? <Play className="size-4" /> : <Pause className="size-4" />}{conta.pausado ? 'Retomar' : 'Pausar'}
            </Button>
            {disponivel && <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => { setTrocando(true); setRecado(null) }}>Trocar número</Button>}
            <Button variant="ghost" size="sm" className="text-destructive" disabled={ocupado} onClick={() => { if (confirm('Remover o seu WhatsApp? Os avisos continuam no sino e no e-mail.')) simples(removerMeuWhatsapp) }}>
              <Trash2 className="size-4" />Remover
            </Button>
          </div>
        </div>
      )}

      {(trocando || !conta) && disponivel && !enviadoPara && (
        <form onSubmit={pedir} className="flex flex-col gap-2">
          <label htmlFor="whatsapp-numero" className="text-sm font-medium">Seu número de WhatsApp</label>
          <div className="flex flex-wrap gap-2">
            <input id="whatsapp-numero" className={campo} inputMode="tel" autoComplete="tel" placeholder="(21) 98765-4321" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={ocupado} />
            <Button type="submit" disabled={ocupado || numero.replace(/\D/g, '').length < 10}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Mandar código</Button>
            {conta && <Button type="button" variant="ghost" disabled={ocupado} onClick={() => { setTrocando(false); setRecado(null) }}>Cancelar</Button>}
          </div>
          <p className="text-xs text-muted-foreground">Com DDD. De fora do Brasil, comece com + e o código do país. Chega um código de 6 números pelo WhatsApp.</p>
        </form>
      )}

      {enviadoPara && (
        <form onSubmit={confirmar} className="flex flex-col gap-2">
          <label htmlFor="whatsapp-codigo" className="text-sm font-medium">Código que chegou em {enviadoPara}</label>
          <div className="flex flex-wrap gap-2">
            <input id="whatsapp-codigo" className={cn(campo, 'max-w-40 font-mono tracking-widest')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} disabled={ocupado} />
            <Button type="submit" disabled={ocupado || codigo.length !== 6}>{ocupado && <Loader2 className="size-4 animate-spin" />}Confirmar</Button>
            <Button type="button" variant="ghost" disabled={ocupado} onClick={() => { setEnviadoPara(null); setRecado(null) }}>Corrigir o número</Button>
          </div>
        </form>
      )}

      {recado && <p role={recado.tom === 'erro' ? 'alert' : 'status'} className={cn('text-sm', recado.tom === 'ok' ? 'text-success' : 'text-destructive')}>{recado.texto}</p>}

      {conta && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">O que chega pelo WhatsApp</p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {CATEGORIAS.filter(categoriaVaiPorWhatsapp).map((categoria) => (
              <li key={categoria}>
                <label className="flex cursor-pointer items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block text-sm">{ROTULO_DA_CATEGORIA[categoria].nome}</span>
                    <span className="block text-xs text-muted-foreground">{ROTULO_DA_CATEGORIA[categoria].exemplos}</span>
                  </span>
                  <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={atuais[categoria]} disabled={ocupado} onChange={() => alternar(categoria)} />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
