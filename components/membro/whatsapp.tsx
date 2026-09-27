'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Pause, Play, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { confirmarCodigoDoVoluntario, pausarWhatsappDoVoluntario, pedirCodigoDoVoluntario, removerWhatsappDoVoluntario } from '@/app/actions/membro-whatsapp'
import { TEXTO_DO_CONSENTIMENTO } from '@/lib/whatsapp/voluntarios-regras'
import type { WhatsappDoVoluntario } from '@/lib/whatsapp/voluntarios'
import { cn } from '@/lib/utils'
import { botaoDoMembro, botaoSecundario, campoDoMembro } from './marca'
import { Recado, Secao } from './pecas'
import { RotuloDeEnvio } from './perfil'

const cartao = 'rounded-xl border border-border bg-card p-4 sm:p-5'
const dataCurta = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

/**
 * O WhatsApp na Área do Voluntário: confirmar o número com um código e
 * autorizar receber as oportunidades por lá (LGPD: a caixa nunca vem
 * marcada; sem ela, o código nem sai). Envia por onSubmit + transição, como
 * o resto do perfil: o formulário não se apaga quando o servidor recusa.
 */
export function WhatsappDoVoluntarioCartao({ inicial }: { inicial: WhatsappDoVoluntario }) {
  const router = useRouter()
  const [autorizo, setAutorizo] = useState(false)
  const [pendente, setPendente] = useState<string | null>(inicial.pendente)
  const [recado, setRecado] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null)
  const [ocupado, iniciar] = useTransition()

  const rodar = (acao: () => Promise<{ erro?: string; recado?: string; numero?: string }>, depois?: (r: { numero?: string }) => void) => iniciar(async () => {
    setRecado(null)
    const r = await acao()
    if (r.erro) { setRecado({ tipo: 'erro', texto: r.erro }); return }
    setRecado(r.recado ? { tipo: 'sucesso', texto: r.recado } : null)
    depois?.(r)
    router.refresh()
  })

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
        ) : pendente ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); rodar(() => confirmarCodigoDoVoluntario(f), () => setPendente(null)) }}>
            <p className="text-sm">Digite o código de 6 números que mandamos para <strong>{pendente}</strong> pelo WhatsApp.</p>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="whatsapp-codigo">
              Código
              <input id="whatsapp-codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required className={cn(campoDoMembro, 'max-w-40 tracking-widest')} />
            </label>
            {consentimento}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={ocupado || !autorizo} className={botaoDoMembro}><RotuloDeEnvio ocupado={ocupado} icone={ShieldCheck} rotulo="Confirmar" andamento="Confirmando…" /></button>
              <button type="button" disabled={ocupado} className={botaoSecundario} onClick={() => setPendente(null)}>Trocar o número</button>
            </div>
          </form>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); rodar(() => pedirCodigoDoVoluntario(f), (r) => setPendente(r.numero ?? null)) }}>
            <p className="text-sm text-muted-foreground">Receba as oportunidades de voluntariado no seu WhatsApp, assim que forem publicadas.</p>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="whatsapp-numero">
              Seu WhatsApp, com DDD
              <input id="whatsapp-numero" name="numero" type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 98765-4321" required className={cn(campoDoMembro, 'max-w-64')} />
            </label>
            {consentimento}
            <div>
              <button type="submit" disabled={ocupado || !autorizo} className={botaoDoMembro}><RotuloDeEnvio ocupado={ocupado} icone={Send} rotulo="Mandar código" andamento="Mandando…" /></button>
            </div>
          </form>
        )}
        {recado && <Recado tipo={recado.tipo}>{recado.texto}</Recado>}
      </div>
    </Secao>
  )
}
