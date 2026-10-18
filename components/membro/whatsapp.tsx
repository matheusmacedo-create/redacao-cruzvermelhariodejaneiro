'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, LoaderCircle, MessageCircle, Pause, Play, ShieldCheck, Trash2 } from 'lucide-react'
import {
  conferirConfirmacaoDoVoluntario, confirmarCodigoDoVoluntario, gerarCodigoDeIdaDoVoluntario, pausarWhatsappDoVoluntario, pedirCodigoDoVoluntario,
  removerWhatsappDoVoluntario, type CodigoDeIdaDoVoluntario,
} from '@/app/actions/membro-whatsapp'
import { CODIGO_VALIDADE_MIN, INTERVALO_DA_CONFERENCIA_MS } from '@/lib/whatsapp/regras'
import { TEXTO_DO_CONSENTIMENTO } from '@/lib/whatsapp/voluntarios-regras'
import type { WhatsappDoVoluntario } from '@/lib/whatsapp/voluntarios'
import { cn } from '@/lib/utils'
import { botaoDoMembro, botaoFantasma, botaoSecundario, campoDoMembro } from './marca'
import { Recado, Secao } from './pecas'
import { RotuloDeEnvio } from './perfil'

const cartao = 'rounded-xl border border-border bg-card p-4 sm:p-5'
const dataCurta = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
/** Passado o prazo do código, a tela ainda espera um pouco: a mensagem pode estar a caminho. */
const FOLGA_DA_ESPERA_MS = 15_000
const AVISO_DA_ALTERNATIVA = 'Esse código só chega se você escreveu ao WhatsApp do Voluntariado nas últimas 24 horas, ou se houver um modelo de mensagem aprovado pelo WhatsApp. Se não chegar, use “Gerar código”.'

/**
 * O WhatsApp na Área do Voluntário: confirmar o número e autorizar receber as
 * oportunidades por lá (LGPD: a caixa nunca vem marcada; sem ela, o código
 * nem é gerado). Envia por onSubmit + transição, como o resto do perfil: o
 * formulário não se apaga quando o servidor recusa.
 *
 * Confirmar tem dois caminhos (app/actions/membro-whatsapp.ts). O padrão: a
 * tela mostra um código e o voluntário manda ao WhatsApp do Palácio pelo botão
 * (mensagem pronta); a tela confere sozinha até o bot confirmar. A
 * alternativa: o código chega no número e ele digita.
 */
export function WhatsappDoVoluntarioCartao({ inicial }: { inicial: WhatsappDoVoluntario }) {
  const router = useRouter()
  const formulario = useRef<HTMLFormElement>(null)
  const [autorizo, setAutorizo] = useState(false)
  const [ida, setIda] = useState<CodigoDeIdaDoVoluntario | null>(null)
  const [idaVenceu, setIdaVenceu] = useState(false)
  // O código de digitar: `enviado` = pedido agora; sem ele, veio da página (pode ser um de ida, que não se digita).
  const [volta, setVolta] = useState<{ numero: string; enviado: boolean } | null>(inicial.pendente ? { numero: inicial.pendente, enviado: false } : null)
  const [recado, setRecado] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null)
  const [ocupado, iniciar] = useTransition()

  const rodar = <R extends { erro?: string; recado?: string }>(acao: () => Promise<R>, depois?: (r: R) => void) => iniciar(async () => {
    setRecado(null)
    const r = await acao()
    if (r.erro) { setRecado({ tipo: 'erro', texto: r.erro }); return }
    setRecado(r.recado ? { tipo: 'sucesso', texto: r.recado } : null)
    depois?.(r)
    router.refresh()
  })

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
        const r = await conferirConfirmacaoDoVoluntario(atual.numero, atual.desde)
        if (parado) return
        if (r.confirmado) {
          setRecado({ tipo: 'sucesso', texto: `WhatsApp confirmado: ${atual.numero}.` })
          setIda(null)
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

  /** O formulário de cada caminho: o número e a autorização (a caixa está marcada para chegar até aqui). */
  const dados = (numero: string) => {
    const f = new FormData()
    f.set('numero', numero)
    if (autorizo) f.set('autorizo', '1')
    return f
  }
  const gerar = (f: FormData) => rodar(() => gerarCodigoDeIdaDoVoluntario(f), (r) => { if (r.ida) { setVolta(null); setIdaVenceu(false); setIda(r.ida) } })
  const pedir = (f: FormData) => rodar(() => pedirCodigoDoVoluntario(f), (r) => { setIda(null); setVolta(r.numero ? { numero: r.numero, enviado: true } : null) })

  const consentimento = (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm" data-ajuda="membro.whatsapp-autorizacao">
      <input type="checkbox" name="autorizo" value="1" className="mt-0.5 size-5 shrink-0 accent-primary" checked={autorizo} onChange={(e) => setAutorizo(e.target.checked)} />
      <span className="min-w-0 text-muted-foreground">{TEXTO_DO_CONSENTIMENTO}</span>
    </label>
  )

  return (
    <Secao titulo="WhatsApp" icone={MessageCircle} id="whatsapp" className={cartao}>
      <div className="flex flex-col gap-4" data-ajuda="membro.whatsapp">
        {inicial.numero ? (
          <>
            <p className="text-sm">
              As oportunidades chegam em <strong>{inicial.numero}</strong>{inicial.pausado ? <>, mas <strong>estão pausadas</strong></> : null}.
              {inicial.autorizadoEm && <span className="block text-muted-foreground">Autorizado em {dataCurta(inicial.autorizadoEm)}. No WhatsApp, responda <strong>sair</strong> para parar.</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocupado} className={botaoSecundario} onClick={() => rodar(() => pausarWhatsappDoVoluntario(!inicial.pausado))}>
                {inicial.pausado ? <><Play className="size-4" aria-hidden="true" />Voltar a receber</> : <><Pause className="size-4" aria-hidden="true" />Pausar</>}
              </button>
              <button type="button" disabled={ocupado} className={cn(botaoSecundario, 'text-destructive')} onClick={() => rodar(removerWhatsappDoVoluntario)}>
                <Trash2 className="size-4" aria-hidden="true" />Remover o número
              </button>
            </div>
          </>
        ) : ida ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Para confirmar <strong>{ida.numero}</strong>, mande este código <strong>desse número</strong> para o WhatsApp do Voluntariado{ida.palacio ? <>, <strong className="whitespace-nowrap">{ida.palacio}</strong></> : null}:
            </p>
            <p className="font-mono text-3xl font-semibold tracking-[0.3em]">{ida.codigo}</p>
            {ida.link && !idaVenceu && (
              <div><a href={ida.link} target="_blank" rel="noreferrer" className={botaoDoMembro}><MessageCircle className="size-4" aria-hidden="true" />Abrir o WhatsApp</a></div>
            )}
            <p className="text-sm text-muted-foreground">
              {ida.link ? 'O botão abre a conversa com a mensagem pronta: é só enviar. ' : 'Mande o código numa mensagem ao WhatsApp do Voluntariado. '}
              O código vale por {CODIGO_VALIDADE_MIN} minutos e só serve mandado de {ida.numero}.
            </p>
            {idaVenceu
              ? <Recado tipo="erro">O código não vale mais (venceu, foi trocado ou errou demais) e o número não foi confirmado. Gere outro.</Recado>
              : <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />Esperando a sua mensagem. A confirmação aparece aqui sozinha.</p>}
            <div className="flex flex-wrap gap-2">
              {idaVenceu && <button type="button" disabled={ocupado} className={botaoDoMembro} onClick={() => gerar(dados(ida.numero))}><RotuloDeEnvio ocupado={ocupado} icone={KeyRound} rotulo="Gerar outro código" andamento="Gerando…" /></button>}
              <button type="button" disabled={ocupado} className={botaoSecundario} onClick={() => { setIda(null); setRecado(null) }}>Trocar o número</button>
              <button type="button" disabled={ocupado} className={botaoFantasma} onClick={() => pedir(dados(ida.numero))}>Prefiro receber o código pelo WhatsApp</button>
            </div>
            <p className="text-xs text-muted-foreground">{AVISO_DA_ALTERNATIVA}</p>
          </div>
        ) : volta ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); rodar(() => confirmarCodigoDoVoluntario(f), () => setVolta(null)) }}>
            <p className="text-sm">
              {volta.enviado
                ? <>Digite o código de 6 números que mandamos para <strong>{volta.numero}</strong> pelo WhatsApp.</>
                : <>Há uma confirmação em andamento para <strong>{volta.numero}</strong>. Se o código chegou pelo WhatsApp, digite abaixo; se não, gere um código novo.</>}
            </p>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="whatsapp-codigo">
              Código
              <input id="whatsapp-codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required className={cn(campoDoMembro, 'max-w-40 tracking-widest')} />
            </label>
            {consentimento}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={ocupado || !autorizo} className={botaoDoMembro}><RotuloDeEnvio ocupado={ocupado} icone={ShieldCheck} rotulo="Confirmar" andamento="Confirmando…" /></button>
              <button type="button" disabled={ocupado} className={botaoSecundario} onClick={() => { setVolta(null); setRecado(null) }}>{volta.enviado ? 'Trocar o número' : 'Gerar um código novo'}</button>
              {volta.enviado && <button type="button" disabled={ocupado || !autorizo} className={botaoFantasma} onClick={() => gerar(dados(volta.numero))}>Não chegou? Gerar um código para mandar</button>}
            </div>
          </form>
        ) : (
          <form ref={formulario} className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); gerar(new FormData(e.currentTarget)) }}>
            <p className="text-sm text-muted-foreground">Receba as oportunidades de voluntariado no seu WhatsApp, assim que forem publicadas.</p>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="whatsapp-numero">
              Seu WhatsApp, com DDD
              <input id="whatsapp-numero" name="numero" type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 98765-4321" required className={cn(campoDoMembro, 'max-w-64')} />
            </label>
            {consentimento}
            <p className="text-sm text-muted-foreground">A tela mostra um código de 6 números para você mandar, deste número, ao WhatsApp do Voluntariado. A confirmação aparece aqui sozinha.</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={ocupado || !autorizo} className={botaoDoMembro}><RotuloDeEnvio ocupado={ocupado} icone={KeyRound} rotulo="Gerar código" andamento="Gerando…" /></button>
              <button type="button" disabled={ocupado || !autorizo} className={botaoFantasma} onClick={() => { if (formulario.current?.reportValidity()) pedir(new FormData(formulario.current)) }}>
                Prefiro receber o código pelo WhatsApp
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{AVISO_DA_ALTERNATIVA}</p>
          </form>
        )}
        {recado && <Recado tipo={recado.tipo}>{recado.texto}</Recado>}
      </div>
    </Secao>
  )
}
