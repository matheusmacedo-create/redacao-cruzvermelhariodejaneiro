'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Lock, Plus, Square, SquareCheck, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { MAXIMO_DE_ALTERNATIVAS, MAXIMO_DE_PERGUNTAS, TIPOS_DE_PERGUNTA, opcoesDa, type Pergunta, type TipoDePergunta } from '@/lib/oportunidades/perguntas'
import { cn } from '@/lib/utils'

/**
 * O editor de perguntas da oportunidade. Vai no mesmo formulário: a lista
 * sai num campo escondido (`perguntas`, JSON) e é conferida no servidor
 * (lerPerguntas) e no banco. No quiz, cada pergunta de escolha tem a
 * resposta certa marcada. Com resposta gravada, as perguntas ficam só para
 * ler (`travadas`) e o campo nem vai: mudar embaralharia o que já foi respondido.
 */

type Rascunho = Pergunta & { chave: number }

let proxima = 1
const nova = (tipo: TipoDePergunta = 'unica'): Rascunho => ({
  chave: proxima++, enunciado: '', tipo, alternativas: tipo === 'unica' || tipo === 'multipla' ? ['', ''] : [], obrigatoria: true, corretas: null,
})

export function EditorDePerguntas({ iniciais, tipoDaOportunidade, travadas }: { iniciais: Pergunta[]; tipoDaOportunidade: string; travadas: boolean }) {
  const [lista, setLista] = useState<Rascunho[]>(() => iniciais.map((p) => ({ ...p, chave: proxima++ })))
  const quiz = tipoDaOportunidade === 'quiz'
  const mudar = (chave: number, f: (p: Rascunho) => Rascunho) => setLista((l) => l.map((p) => (p.chave === chave ? f(p) : p)))
  const mover = (i: number, d: -1 | 1) => setLista((l) => {
    const j = i + d
    if (j < 0 || j >= l.length) return l
    const c = [...l];
    [c[i], c[j]] = [c[j], c[i]]
    return c
  })

  const titulo = tipoDaOportunidade === 'aviso' ? 'Perguntas (opcional)' : tipoDaOportunidade === 'enquete' ? 'Perguntas da enquete' : quiz ? 'Perguntas do quiz' : 'Perguntas na inscrição (opcional)'
  const dica = quiz
    ? 'Marque a resposta certa de cada pergunta. Resposta curta não vale nota.'
    : tipoDaOportunidade === 'enquete' ? 'O voluntário pode mudar a resposta até o prazo.'
      : tipoDaOportunidade === 'aviso' ? 'Sem perguntas, o voluntário só toca em “Estou ciente”.'
        : 'O voluntário responde ao se inscrever (ex.: tamanho da camiseta, turno, transporte).'

  if (travadas) {
    return (
      <section className="flex flex-col gap-2 sm:col-span-2" data-ajuda="voluntarios.perguntas">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" />Já há respostas: as perguntas e o tipo não mudam mais. Se precisar de outras perguntas, crie outra oportunidade.</p>
        <ol className="flex flex-col gap-1.5 text-sm">
          {iniciais.map((p, i) => (
            <li key={i} className="rounded-lg border border-border px-3 py-2">
              <span className="font-medium">{i + 1}. {p.enunciado}</span>
              <span className="block text-xs text-muted-foreground">
                {TIPOS_DE_PERGUNTA[p.tipo].rotulo}{p.obrigatoria ? '' : ' · opcional'}{opcoesDa(p).length ? ` · ${opcoesDa(p).map((o, k) => (p.corretas?.includes(k) ? `${o} ✓` : o)).join(' / ')}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3 sm:col-span-2" data-ajuda="voluntarios.perguntas">
      <input type="hidden" name="perguntas_enviadas" value="1" />
      <input type="hidden" name="perguntas" value={JSON.stringify(lista.map(({ chave: _chave, ...p }) => p))} />
      <div>
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">{dica}</p>
      </div>
      {lista.map((p, i) => {
        const opcoes = p.tipo === 'sim_nao' ? ['Sim', 'Não'] : p.alternativas
        const marcar = (k: number) => mudar(p.chave, (x) => {
          const atuais = x.corretas ?? []
          const corretas = x.tipo === 'multipla' ? (atuais.includes(k) ? atuais.filter((c) => c !== k) : [...atuais, k].sort((a, b) => a - b)) : [k]
          return { ...x, corretas }
        })
        return (
          <fieldset key={p.chave} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">Pergunta {i + 1}</legend>
            <div className="flex flex-wrap items-start gap-2">
              <input aria-label={`Enunciado da pergunta ${i + 1}`} value={p.enunciado} maxLength={500} placeholder="Ex.: Qual o tamanho da sua camiseta?"
                onChange={(e) => mudar(p.chave, (x) => ({ ...x, enunciado: e.target.value }))} className={cn(inputClass, 'min-w-0 flex-1 basis-60')} />
              <select aria-label={`Tipo da pergunta ${i + 1}`} value={p.tipo} className={cn(inputClass, 'w-auto')}
                onChange={(e) => {
                  const tipo = e.target.value as TipoDePergunta
                  mudar(p.chave, (x) => ({
                    ...x, tipo, corretas: null,
                    alternativas: tipo === 'unica' || tipo === 'multipla' ? (x.alternativas.length >= 2 ? x.alternativas : ['', '']) : [],
                  }))
                }}>
                {Object.entries(TIPOS_DE_PERGUNTA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
              </select>
            </div>
            {p.tipo !== 'texto' && (
              <ul className="flex flex-col gap-1.5">
                {opcoes.map((a, k) => {
                  const certa = Boolean(p.corretas?.includes(k))
                  const Icone = p.tipo === 'multipla' ? (certa ? SquareCheck : Square) : (certa ? CheckCircle2 : Circle)
                  return (
                    <li key={k} className="flex items-center gap-2">
                      {quiz ? (
                        <button type="button" onClick={() => marcar(k)} aria-pressed={certa} title={certa ? 'Resposta certa' : 'Marcar como certa'}
                          aria-label={`${certa ? 'Resposta certa' : 'Marcar como certa'}: ${a || `alternativa ${k + 1}`}`}
                          className={cn('shrink-0 rounded p-1', certa ? 'text-success' : 'text-muted-foreground hover:text-foreground')}>
                          <Icone className="size-4" />
                        </button>
                      ) : <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      {p.tipo === 'sim_nao' ? <span className="text-sm">{a}</span> : (
                        <>
                          <input aria-label={`Alternativa ${k + 1} da pergunta ${i + 1}`} value={a} maxLength={200} placeholder={`Alternativa ${k + 1}`}
                            onChange={(e) => mudar(p.chave, (x) => ({ ...x, alternativas: x.alternativas.map((y, n) => (n === k ? e.target.value : y)) }))}
                            className={cn(inputClass, 'h-9 min-w-0 flex-1')} />
                          {p.alternativas.length > 2 && (
                            <button type="button" aria-label={`Tirar a alternativa ${k + 1}`} className="rounded p-1 text-muted-foreground hover:text-destructive"
                              onClick={() => mudar(p.chave, (x) => ({
                                ...x, alternativas: x.alternativas.filter((_, n) => n !== k),
                                corretas: x.corretas ? x.corretas.filter((c) => c !== k).map((c) => (c > k ? c - 1 : c)) : null,
                              }))}>
                              <X className="size-4" />
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  )
                })}
                {(p.tipo === 'unica' || p.tipo === 'multipla') && p.alternativas.length < MAXIMO_DE_ALTERNATIVAS && (
                  <li><button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => mudar(p.chave, (x) => ({ ...x, alternativas: [...x.alternativas, ''] }))}>+ Alternativa</button></li>
                )}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.obrigatoria} onChange={(e) => mudar(p.chave, (x) => ({ ...x, obrigatoria: e.target.checked }))} />Obrigatória</label>
              <span className="flex items-center gap-1">
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button type="button" aria-label="Descer" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button type="button" aria-label={`Tirar a pergunta ${i + 1}`} onClick={() => setLista((l) => l.filter((x) => x.chave !== p.chave))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>
              </span>
            </div>
          </fieldset>
        )
      })}
      {lista.length < MAXIMO_DE_PERGUNTAS && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLista((l) => [...l, nova()])} data-ajuda="voluntarios.nova-pergunta">
          <Plus className="size-4" />Pergunta
        </Button>
      )}
    </section>
  )
}
