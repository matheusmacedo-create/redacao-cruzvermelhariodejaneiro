'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, MessageCircle, Pause, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  conferirConfirmacaoDoWhatsapp, confirmarCodigoDoWhatsapp, gerarCodigoDeIdaDoWhatsapp, pausarMeuWhatsapp, pedirCodigoDoWhatsapp, removerMeuWhatsapp,
  salvarCategoriasDoWhatsapp, type CodigoDeIda,
} from '@/app/actions/whatsapp'
import { CATEGORIAS, ROTULO_DA_CATEGORIA, type Categoria } from '@/lib/notificacoes/regras'
import { CODIGO_VALIDADE_MIN, INTERVALO_DA_CONFERENCIA_MS, categoriaVaiPorWhatsapp } from '@/lib/whatsapp/regras'
import { cn } from '@/lib/utils'

const campo = 'h-10 min-w-48 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
type Recado = { tom: 'ok' | 'erro'; texto: string } | null

/** Passado o prazo do código, a tela ainda espera um pouco: a mensagem pode estar a caminho. */
const FOLGA_DA_ESPERA_MS = 15_000

/**
 * O WhatsApp da pessoa: confirmar o número, pausar, trocar, remover e
 * escolher por assunto o que chega por lá.
 *
 * Confirmar tem dois caminhos (app/actions/whatsapp.ts). O padrão: a tela
 * mostra um código e a pessoa manda ao WhatsApp do Palácio pelo botão (a
 * mensagem já vai pronta); a tela confere sozinha, a cada poucos segundos, até
 * o bot confirmar. A alternativa, "Prefiro receber o código pelo WhatsApp": o
 * código chega no número e a pessoa digita — só chega a quem escreveu ao
 * Palácio nas últimas 24 h ou pelo modelo de Autenticação aprovado.
 */
export function WhatsappDoPerfil({ disponivel, conta, categorias }: {
  disponivel: boolean
  conta: { numero: string; pausado: boolean } | null
  categorias: Record<Categoria, boolean>
}) {
  const router = useRouter()
  const [trocando, setTrocando] = useState(false)
  const [numero, setNumero] = useState('')
  const [ida, setIda] = useState<CodigoDeIda | null>(null)
  const [idaVenceu, setIdaVenceu] = useState(false)
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [atuais, setAtuais] = useState(categorias)
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, rodar] = useTransition()

  // Com o código de ida na tela, pergunta ao servidor se o bot já confirmou. Para quando confirma, quando o
  // código deixa de valer ou quando o prazo acaba; com a aba escondida espera, e confere assim que ela volta.
  useEffect(() => {
    if (!ida || idaVenceu) return
    const atual = ida
    const fim = new Date(atual.expiraEm).getTime() + FOLGA_DA_ESPERA_MS
    let parado = false
    let consultando = false
    const conferir = async () => {
      if (parado || consultando || document.hidden) return
      if (Date.now() > fim) { setIdaVenceu(true); return }
      consultando = true
      try {
        const r = await conferirConfirmacaoDoWhatsapp(atual.numero, atual.desde)
        if (parado) return
        if (r.confirmado) {
          setRecado({ tom: 'ok', texto: `WhatsApp confirmado: ${atual.numero}.` })
          setIda(null)
          setTrocando(false)
          setNumero('')
          router.refresh()
        } else if (!r.valendo) setIdaVenceu(true)
      } finally {
        consultando = false
      }
    }
    const relogio = window.setInterval(conferir, INTERVALO_DA_CONFERENCIA_MS)
    const aoVoltar = () => { void conferir() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { parado = true; window.clearInterval(relogio); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [ida, idaVenceu, router])

  function gerar(paraNumero: string) {
    setRecado(null)
    rodar(async () => {
      const form = new FormData()
      form.set('numero', paraNumero)
      const r = await gerarCodigoDeIdaDoWhatsapp(form)
      if (r.erro || !r.ida) return setRecado({ tom: 'erro', texto: r.erro ?? 'Não foi possível gerar o código.' })
      setEnviadoPara(null)
      setIdaVenceu(false)
      setIda(r.ida)
    })
  }

  function pedir(paraNumero: string) {
    setRecado(null)
    rodar(async () => {
      const form = new FormData()
      form.set('numero', paraNumero)
      const r = await pedirCodigoDoWhatsapp(form)
      if (r.erro) return setRecado({ tom: 'erro', texto: r.erro })
      setIda(null)
      setEnviadoPara(r.numero ?? paraNumero)
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

  function recomecar() {
    setIda(null)
    setEnviadoPara(null)
    setRecado(null)
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

  const serve = (n: string) => n.replace(/\D/g, '').length >= 10
  // A alternativa ao código de ida, com o aviso de quando ela funciona.
  const prefiroReceber = (paraNumero: string) => (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="link" className="h-auto px-0 text-left whitespace-normal" disabled={ocupado || !serve(paraNumero)} onClick={() => pedir(paraNumero)}>
        Prefiro receber o código pelo WhatsApp
      </Button>
      <p className="text-xs text-muted-foreground">Esse código só chega se você escreveu ao WhatsApp do Palácio nas últimas 24 horas, ou se a administração tiver aprovado o modelo de código (categoria Autenticação).</p>
    </div>
  )

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
            <p className={cn('text-xs', conta.pausado ? 'text-foreground' : 'text-success')}>{conta.pausado ? 'Pausado: até você retomar, só os avisos de segurança da conta chegam por lá.' : 'Confirmado. Os avisos chegam por lá.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={ocupado} onClick={() => simples(() => pausarMeuWhatsapp(!conta.pausado))}>
              {conta.pausado ? <Play className="size-4" /> : <Pause className="size-4" />}{conta.pausado ? 'Retomar' : 'Pausar'}
            </Button>
            {disponivel && <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => { setTrocando(true); setRecado(null) }}>Trocar número</Button>}
            <Button variant="ghost" size="sm" className="text-destructive" disabled={ocupado} onClick={() => { if (confirm('Remover o seu WhatsApp? Os avisos continuam no sino e no e-mail. Por segurança, este número e o seu e-mail confirmado recebem um aviso da remoção.')) simples(removerMeuWhatsapp) }}>
              <Trash2 className="size-4" />Remover
            </Button>
          </div>
        </div>
      )}

      {(trocando || !conta) && disponivel && !ida && !enviadoPara && (
        <form onSubmit={(e) => { e.preventDefault(); gerar(numero) }} className="flex flex-col gap-2">
          <label htmlFor="whatsapp-numero" className="text-sm font-medium">Seu número de WhatsApp</label>
          <div className="flex flex-wrap gap-2">
            <input id="whatsapp-numero" className={campo} inputMode="tel" autoComplete="tel" placeholder="(21) 98765-4321" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={ocupado} />
            <Button type="submit" disabled={ocupado || !serve(numero)}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Gerar código</Button>
            {conta && <Button type="button" variant="ghost" disabled={ocupado} onClick={() => { setTrocando(false); setRecado(null) }}>Cancelar</Button>}
          </div>
          <p className="text-xs text-muted-foreground">Com DDD. De fora do Brasil, comece com + e o código do país. A tela mostra um código de 6 números para você mandar, deste número, ao WhatsApp do Palácio.{conta && ' Confirmado o novo, o número antigo e o seu e-mail confirmado recebem um aviso da troca.'}</p>
          {prefiroReceber(numero)}
        </form>
      )}

      {ida && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            Para confirmar <strong>{ida.numero}</strong>, mande este código <strong>desse número</strong> para o WhatsApp do Palácio Virtual{ida.palacio ? <>, <strong className="whitespace-nowrap">{ida.palacio}</strong></> : null}:
          </p>
          <p className="font-mono text-3xl font-semibold tracking-[0.3em]">{ida.codigo}</p>
          {ida.link && !idaVenceu && (
            <Button className="self-start" render={<a href={ida.link} target="_blank" rel="noreferrer" />}><MessageCircle className="size-4" />Abrir o WhatsApp</Button>
          )}
          <p className="text-xs text-muted-foreground">
            {ida.link ? 'O botão abre a conversa com o Palácio e a mensagem pronta: é só enviar. ' : 'Mande o código numa mensagem ao WhatsApp do Palácio Virtual. '}
            O código vale por {CODIGO_VALIDADE_MIN} minutos e só serve mandado de {ida.numero}.
          </p>
          {idaVenceu ? (
            <p role="alert" className="text-sm text-destructive">O código não vale mais (venceu, foi trocado ou errou demais) e o número não foi confirmado. Gere outro.</p>
          ) : (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Esperando a sua mensagem. A confirmação aparece aqui sozinha.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {idaVenceu && <Button type="button" disabled={ocupado} onClick={() => gerar(ida.numero)}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Gerar outro código</Button>}
            <Button type="button" variant="ghost" disabled={ocupado} onClick={recomecar}>Corrigir o número</Button>
          </div>
          {prefiroReceber(ida.numero)}
        </div>
      )}

      {enviadoPara && (
        <form onSubmit={confirmar} className="flex flex-col gap-2">
          <label htmlFor="whatsapp-codigo" className="text-sm font-medium">Código que chegou em {enviadoPara}</label>
          <div className="flex flex-wrap gap-2">
            <input id="whatsapp-codigo" className={cn(campo, 'max-w-40 font-mono tracking-widest')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} disabled={ocupado} />
            <Button type="submit" disabled={ocupado || codigo.length !== 6}>{ocupado && <Loader2 className="size-4 animate-spin" />}Confirmar</Button>
            <Button type="button" variant="ghost" disabled={ocupado} onClick={recomecar}>Corrigir o número</Button>
          </div>
          <Button type="button" variant="link" className="h-auto self-start px-0 text-left whitespace-normal" disabled={ocupado} onClick={() => gerar(enviadoPara)}>Não chegou? Gerar um código para mandar ao Palácio</Button>
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
