'use client'

import { useState } from 'react'
import { Check, CircleAlert, Copy, Megaphone } from 'lucide-react'
import { lerDescricao } from '@/lib/editorial/descricao-da-pauta'

/** Cabeçalho do calendário editorial: semana, pilar, formato. */
function Ficha({ itens }: { itens: { rotulo: string; valor: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-4">
      {itens.map((item, i) => (
        <span key={i} className="inline-flex items-baseline gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
          {item.rotulo && <span className="font-semibold uppercase tracking-wide text-muted-foreground">{item.rotulo}</span>}
          <span className="font-medium">{item.valor}</span>
        </span>
      ))}
    </div>
  )
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        } catch {
          // Navegador sem permissão de área de transferência: o texto continua
          // na tela para seleção manual, então não vale interromper com erro.
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copiado ? <><Check className="size-3.5" />Copiado</> : <><Copy className="size-3.5" />Copiar</>}
    </button>
  )
}

export function DescricaoDaPauta({ descricao }: { descricao?: string | null }) {
  const blocos = lerDescricao(descricao)

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h3>
        {blocos.length > 0 && <BotaoCopiar texto={(descricao ?? '').replace(/\r\n?/g, '\n')} />}
      </div>

      {!blocos.length && <p className="text-sm text-muted-foreground">Nenhuma descrição informada.</p>}

      {blocos.map((bloco, i) => {
        if (bloco.tipo === 'ficha') return <Ficha key={i} itens={bloco.itens} />

        if (bloco.tipo === 'titulo') return (
          <h4 key={i} className="mt-5 text-xs font-bold uppercase tracking-widest text-primary first:mt-0">{bloco.texto}</h4>
        )

        if (bloco.tipo === 'itens') return (
          <ul key={i} className="mt-2 flex flex-col gap-2">
            {bloco.itens.map((item, j) => (
              <li key={j} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-px shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">{item.marcador}</span>
                <span className="min-w-0 text-pretty">{item.texto}</span>
              </li>
            ))}
          </ul>
        )

        if (bloco.tipo === 'nota') {
          const pendencia = bloco.variante === 'pendencia'
          const Icone = pendencia ? CircleAlert : Megaphone
          return (
            <div key={i} className="mt-5 flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Icone className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                {/* Sem rótulo, a barra parece um alerta do sistema. Ela é uma
                    linha da descrição, escrita por quem montou a pauta. */}
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  {pendencia ? 'Pendência' : 'Recado'}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-pretty">{bloco.texto}</p>
              </div>
            </div>
          )
        }

        if (bloco.tipo === 'hashtags') return (
          <div key={i} className="mt-2 flex flex-wrap gap-1.5">
            {bloco.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tag}</span>
            ))}
          </div>
        )

        return <p key={i} className="mt-2 whitespace-pre-line text-sm leading-relaxed text-pretty">{bloco.texto}</p>
      })}
    </div>
  )
}
