'use client'

import { useState, useTransition } from 'react'
import { salvarPreferenciasDeNotificacao } from '@/app/actions/notificacoes'
import { CATEGORIAS, MODOS, ROTULO_DA_CATEGORIA, ROTULO_DO_MODO, type Categoria, type Modo } from '@/lib/notificacoes/regras'
import { cn } from '@/lib/utils'

const EXPLICACAO: Record<Modo, string> = {
  imediato: 'um e-mail assim que acontece',
  resumo: 'um e-mail por dia com o que você não viu',
  nunca: 'sem e-mail; só aparece no sino',
}

export function PreferenciasDeNotificacao({ modos, email }: { modos: Record<Categoria, Modo>; email: string | null }) {
  const [atuais, setAtuais] = useState(modos)
  const [recado, setRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [salvando, iniciar] = useTransition()

  const escolher = (categoria: Categoria, modo: Modo) => {
    const anteriores = atuais
    const novos = { ...atuais, [categoria]: modo }
    setAtuais(novos)
    setRecado(null)
    iniciar(async () => {
      const r = await salvarPreferenciasDeNotificacao(novos)
      if (r.erro) { setAtuais(anteriores); setRecado({ tipo: 'erro', texto: r.erro }) }
      else setRecado({ tipo: 'ok', texto: 'Preferência salva.' })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Tudo aparece no sino. Por e-mail, os avisos vão para {email ? <strong className="text-foreground">{email}</strong> : 'o seu e-mail de recuperação (confirme um acima)'}.
        Se você estiver com a Redação aberta, o e-mail não sai na hora: o que você não abrir entra no resumo do dia.
        Avisos de segurança da conta (senha, verificação em duas etapas) chegam sempre.
      </p>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {CATEGORIAS.map((categoria) => (
          <li key={categoria} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{ROTULO_DA_CATEGORIA[categoria].nome}</p>
              <p className="text-xs text-muted-foreground">{ROTULO_DA_CATEGORIA[categoria].exemplos}</p>
            </div>
            <div role="radiogroup" aria-label={`E-mail de ${ROTULO_DA_CATEGORIA[categoria].nome}`} className="inline-flex shrink-0 rounded-lg border border-border p-0.5">
              {MODOS.map((modo) => (
                <button key={modo} type="button" role="radio" aria-checked={atuais[categoria] === modo} title={EXPLICACAO[modo]} disabled={salvando}
                  onClick={() => escolher(categoria, modo)}
                  className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-wait', atuais[categoria] === modo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  {ROTULO_DO_MODO[modo]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {recado && <p role="status" className={cn('text-sm', recado.tipo === 'ok' ? 'text-success' : 'text-destructive')}>{recado.texto}</p>}
    </div>
  )
}
