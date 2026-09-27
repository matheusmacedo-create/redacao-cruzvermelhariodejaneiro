'use client'

import { useState } from 'react'
import { CircleCheck, Loader2, XCircle } from 'lucide-react'
import { botaoDoMembro, campoDoMembro } from '@/components/membro/marca'

// O servidor descarta, fingindo sucesso, o envio feito em menos de 3 s (armadilha para robôs).
const TEMPO_MINIMO_MS = 3500

function Campo({ id, rotulo, dica, obrigatorio, children }: { id: string; rotulo: string; dica?: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{rotulo}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
      {dica && <p id={`${id}-dica`} className="text-sm text-muted-foreground">{dica}</p>}
      {children}
    </div>
  )
}

/**
 * O visitante se cadastra pelo QR da portaria. Envia para /api/visitante; a
 * portaria confirma a entrada na tela dela (Portaria virtual).
 */
export function Autocadastro({ token }: { token: string }) {
  const [inicio] = useState(() => Date.now())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState<string | null>(null)

  if (enviado) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center" data-autocadastro="ok">
        <CircleCheck className="size-12 text-[var(--success-texto)]" aria-hidden="true" />
        <p className="text-lg font-semibold">Pronto, {enviado.split(' ')[0]}!</p>
        <p className="max-w-sm text-sm text-muted-foreground">Mostre esta tela na portaria. A equipe confirma a sua entrada e avisa quem você veio visitar.</p>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={async (e) => {
      e.preventDefault()
      const form = e.currentTarget
      setErro('')
      setEnviando(true)
      try {
        const espera = TEMPO_MINIMO_MS - (Date.now() - inicio)
        if (espera > 0) await new Promise((r) => setTimeout(r, espera))
        const corpo = new FormData(form)
        corpo.set('_inicio', String(inicio))
        corpo.set('t', token)
        const r = await fetch('/api/visitante', { method: 'POST', body: corpo })
        const dados = await r.json().catch(() => ({})) as { erro?: string }
        if (!r.ok) { setErro(dados.erro ?? 'Não foi possível enviar agora. Fale com a portaria.'); return }
        setEnviado(String(corpo.get('nome') ?? '').trim() || 'visitante')
      } catch {
        setErro('Sem conexão. Tente de novo ou fale com a portaria.')
      } finally {
        setEnviando(false)
      }
    }}>
      <Campo id="v-nome" rotulo="Seu nome" obrigatorio>
        <input id="v-nome" name="nome" required minLength={2} maxLength={120} autoComplete="name" className={campoDoMembro} />
      </Campo>
      <Campo id="v-telefone" rotulo="Telefone" dica="Com DDD. Só para a portaria falar com você, se precisar.">
        <input id="v-telefone" name="telefone" type="tel" inputMode="tel" maxLength={30} autoComplete="tel" aria-describedby="v-telefone-dica" className={campoDoMembro} />
      </Campo>
      <Campo id="v-empresa" rotulo="De onde você vem" dica="Empresa, órgão ou instituição. Em branco se for visita particular.">
        <input id="v-empresa" name="empresa" maxLength={120} autoComplete="organization" aria-describedby="v-empresa-dica" className={campoDoMembro} />
      </Campo>
      <Campo id="v-visitado" rotulo="Quem você vai visitar" dica="O nome da pessoa ou o setor (Voluntariado, Escola, Financeiro…).">
        <input id="v-visitado" name="visitado_texto" maxLength={120} aria-describedby="v-visitado-dica" className={campoDoMembro} />
      </Campo>
      <Campo id="v-motivo" rotulo="Motivo da visita">
        <input id="v-motivo" name="motivo" maxLength={300} className={campoDoMembro} placeholder="Ex.: reunião, entrega, curso" />
      </Campo>
      {/* Armadilha para robôs: fora da tela, sem foco. */}
      <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] size-px opacity-0" />
      <p className="text-xs text-muted-foreground">
        Os dados ficam no livro de visitantes da Cruz Vermelha Brasileira – RJ, só para a segurança da filial. Não pedimos documento.
      </p>
      {erro && <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{erro}</p>}
      <button type="submit" disabled={enviando} className={botaoDoMembro} data-autocadastro-enviar>
        {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Enviar
      </button>
    </form>
  )
}
