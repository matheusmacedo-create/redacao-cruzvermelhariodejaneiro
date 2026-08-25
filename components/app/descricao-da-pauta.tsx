'use client'

import { useState } from 'react'
import { Check, CircleAlert, Copy, Megaphone, Pencil, X } from 'lucide-react'
import { lerDescricao } from '@/lib/editorial/descricao-da-pauta'
import { atualizarDescricaoDaPauta } from '@/app/actions/editorial'
import { Button } from '@/components/ui/button'

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

export function DescricaoDaPauta({ descricao, pautaId }: { descricao?: string | null; pautaId?: string }) {
  const blocos = lerDescricao(descricao)
  const original = (descricao ?? '').replace(/\r\n?/g, '\n')
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(original)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const abrirEdicao = () => { setRascunho(original); setErro(''); setEditando(true) }

  if (editando && pautaId) {
    return (
      <form
        action={async (formData) => {
          setSalvando(true); setErro('')
          try { await atualizarDescricaoDaPauta(formData); setEditando(false) }
          catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar.') }
          finally { setSalvando(false) }
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="id" value={pautaId} />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Editar descrição</h3>
        <textarea
          name="description"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          rows={16}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        {/* A pessoa acabou de descobrir que ">>" vira uma barra vermelha. Aqui
            é onde ela precisa saber disso — não num manual à parte. */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1.5 font-semibold uppercase tracking-wide">Como o texto vira tela</p>
          <ul className="flex flex-col gap-0.5">
            <li><code className="font-mono text-foreground">SLIDES</code> — linha inteira em caixa alta vira título de seção</li>
            <li><code className="font-mono text-foreground">1 (Capa): texto</code> — vira item com o marcador destacado</li>
            <li><code className="font-mono text-foreground">&gt;&gt; PENDENCIA: texto</code> — vira a barra vermelha de pendência</li>
            <li><code className="font-mono text-foreground">&gt;&gt; texto</code> — vira a barra de recado</li>
            <li><code className="font-mono text-foreground">#tag</code> — linha só de hashtags vira etiquetas</li>
          </ul>
          <p className="mt-2">Resolveu a pendência? Apague a linha do <code className="font-mono text-foreground">&gt;&gt;</code> e ela some da tela.</p>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={salvando}><X className="size-4" />Cancelar</Button>
          <Button type="submit" disabled={salvando || rascunho === original}>{salvando ? 'Salvando…' : 'Salvar descrição'}</Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h3>
        <div className="flex items-center gap-2">
          {blocos.length > 0 && <BotaoCopiar texto={original} />}
          {pautaId && (
            <button
              type="button"
              onClick={abrirEdicao}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" />{blocos.length ? 'Editar' : 'Escrever'}
            </button>
          )}
        </div>
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
