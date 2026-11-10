'use client'

import { useState } from 'react'
import type { ContatoDeImprensa } from '@/app/actions/imprensa'
import { naoLe } from '@/lib/imprensa/campanha'
import { campoClass } from './campos'

/**
 * Peças pequenas dos formulários e das listas da Imprensa, pensadas primeiro
 * para o celular: alvo de toque de 44 px e uma escolha por toque.
 */

export const STATUS_INFO: Record<ContatoDeImprensa['emailStatus'], { rotulo: string; classe: string }> = {
  nao_verificado: { rotulo: 'Não verificado', classe: 'bg-secondary text-secondary-foreground' },
  valido: { rotulo: 'Válido', classe: 'bg-emerald-500/15 text-emerald-700' },
  arriscado: { rotulo: 'Arriscado', classe: 'bg-amber-500/15 text-amber-700' },
  invalido: { rotulo: 'Inválido', classe: 'bg-destructive/10 text-destructive' },
}

export function BadgeDeStatus({ status }: { status: ContatoDeImprensa['emailStatus'] }) {
  const s = STATUS_INFO[status]
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.classe}`}>{s.rotulo}</span>
}

/** Como o contato responde aos envios: saiu, nunca recebeu, ou quantos abriu. */
export function Leitura({ contato }: { contato: Pick<ContatoDeImprensa, 'descadastradoEm' | 'totalEnvios' | 'totalAberturas' | 'enviosSemAbertura'> }) {
  if (contato.descadastradoEm) {
    return <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">Saiu da lista</span>
  }
  if (!contato.totalEnvios) return <span className="text-xs text-muted-foreground">nunca recebeu</span>
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs">Abriu {contato.totalAberturas} de {contato.totalEnvios}</span>
      {naoLe(contato.enviosSemAbertura) && (
        <span className="inline-flex w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {contato.enviosSemAbertura} seguidos sem abrir
        </span>
      )}
    </div>
  )
}

/** Uma marca pequena de texto: editoria, etiqueta, tipo. */
export function Marca({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'destaque' | 'alerta' }) {
  const classe = tom === 'destaque' ? 'bg-primary/10 text-primary' : tom === 'alerta' ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${classe}`}>{children}</span>
}

/** Várias opções, cada uma liga e desliga com um toque. */
export function Chips({ rotulo, opcoes, marcadas, onMudar, desabilitado }: {
  rotulo: string
  opcoes: readonly { id: string; rotulo: string }[]
  marcadas: readonly string[]
  onMudar: (marcadas: string[]) => void
  desabilitado?: boolean
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => {
        const marcada = marcadas.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={marcada}
            disabled={desabilitado}
            onClick={() => onMudar(marcada ? marcadas.filter((m) => m !== o.id) : [...marcadas, o.id])}
            className={`min-h-11 rounded-full border px-3.5 text-sm transition-colors disabled:opacity-50 ${marcada ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}

const OUTRO = '__outro__'

/**
 * Uma lista de opções prontas com a saída "Outra…", que abre um campo para
 * escrever. O valor é sempre o texto: o da opção, ou o que a pessoa digitou.
 */
export function SeletorComOutro({ rotulo, valor, onMudar, opcoes, vazio, outro = 'Outra…', placeholder, desabilitado }: {
  rotulo: string
  valor: string
  onMudar: (valor: string) => void
  opcoes: readonly string[]
  /** O rótulo da opção sem valor ("Não informada", "A do veículo"). */
  vazio: string
  outro?: string
  placeholder?: string
  desabilitado?: boolean
}) {
  const [escrevendo, setEscrevendo] = useState(valor !== '' && !opcoes.includes(valor))
  return (
    <>
      <select
        aria-label={rotulo}
        value={escrevendo ? OUTRO : valor}
        disabled={desabilitado}
        onChange={(e) => {
          const v = e.target.value
          setEscrevendo(v === OUTRO)
          onMudar(v === OUTRO ? '' : v)
        }}
        className={`mt-1 ${campoClass}`}
      >
        <option value="">{vazio}</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OUTRO}>{outro}</option>
      </select>
      {escrevendo && (
        <input
          aria-label={`${rotulo}: escreva`}
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          disabled={desabilitado}
          placeholder={placeholder}
          autoFocus
          className={`mt-2 ${campoClass}`}
        />
      )}
    </>
  )
}
