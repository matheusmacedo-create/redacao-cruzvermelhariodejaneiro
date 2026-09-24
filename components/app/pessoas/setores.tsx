'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { salvarSetor } from '@/app/actions/setores'
import { nomeExibido } from '@/lib/pessoas/diretorio'

export type SetorNaTela = { id: string; nome: string; descricao: string | null; responsavel_id: string | null; email: string | null; ordem: number; ativo: boolean; pessoas: number }
type Opcao = { id: string; nome: string }

function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: string; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}

function Formulario({ s, contas, onFim }: { s: SetorNaTela | null; contas: Opcao[]; onFim: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarSetor.bind(null, s?.id ?? null), {})
  useEffect(() => { if (estado.ok) onFim() }, [estado.ok, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-setor-form>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" ajuda={s && s.pessoas ? `Renomear leva o nome novo às ${s.pessoas} pessoas do setor, às fichas, aos voluntários e às pautas.` : undefined}>
          <input name="nome" required maxLength={80} defaultValue={s?.nome} className={inputClass} />
        </Campo>
        <Campo rotulo="Responsável">
          <select name="responsavel_id" defaultValue={s?.responsavel_id ?? ''} className={inputClass}><option value="">—</option>{contas.map((c) => <option key={c.id} value={c.id}>{nomeExibido(c.nome)}</option>)}</select>
        </Campo>
        <Campo rotulo="Descrição" className="sm:col-span-2"><input name="descricao" maxLength={300} defaultValue={s?.descricao ?? ''} placeholder="O que o setor faz, em uma frase" className={inputClass} /></Campo>
        <Campo rotulo="E-mail do setor"><input name="email" type="email" maxLength={200} defaultValue={s?.email ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Ordem" ajuda="Menor aparece antes nas listas."><input name="ordem" inputMode="numeric" maxLength={4} defaultValue={s?.ordem ?? 100} className={inputClass} /></Campo>
        {s && (
          <Campo rotulo="Situação" ajuda="Setor desativado some das listas de escolha; quem já está nele continua.">
            <select name="ativo" defaultValue={s.ativo ? 'sim' : 'nao'} className={inputClass}><option value="sim">Em uso</option><option value="nao">Desativado</option></select>
          </Campo>
        )}
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

export function Setores({ setores, contas, ehAdmin }: { setores: SetorNaTela[]; contas: Opcao[]; ehAdmin: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const fim = () => { setEditando(null); router.refresh() }
  const nomeDe = new Map(contas.map((c) => [c.id, c.nome]))
  return (
    <div className="flex flex-col gap-3" id="setores">
      {ehAdmin && (editando === 'novo' ? <Formulario s={null} contas={contas} onFim={fim} /> : <div><Button size="sm" variant="outline" onClick={() => setEditando('novo')} id="novo-setor"><Plus className="size-3.5" />Novo setor</Button></div>)}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {setores.map((s) => (
          <li key={s.id} className="px-4 py-3" data-setor={s.nome}>
            {editando === s.id ? <Formulario s={s} contas={contas} onFim={fim} /> : (
              <div className="flex items-start gap-3">
                <div className={`min-w-0 flex-1 ${s.ativo ? '' : 'opacity-60'}`}>
                  <p className="font-medium">{s.nome}{!s.ativo && <span className="ml-2 text-xs font-normal text-muted-foreground">(desativado)</span>} <span className="text-sm font-normal text-muted-foreground">· {s.pessoas} {s.pessoas === 1 ? 'pessoa' : 'pessoas'}</span></p>
                  {s.descricao && <p className="text-sm text-muted-foreground">{s.descricao}</p>}
                  <p className="text-xs text-muted-foreground">{[s.responsavel_id ? `Responsável: ${nomeExibido(nomeDe.get(s.responsavel_id) ?? '—')}` : 'Sem responsável', s.email].filter(Boolean).join(' · ')}</p>
                </div>
                {ehAdmin && <button type="button" title="Editar" aria-label={`Editar ${s.nome}`} onClick={() => setEditando(s.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
