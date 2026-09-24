'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { salvarOrcamento } from '@/app/actions/financeiro'
import { valorNoCampo } from '@/lib/financeiro/regras'

/** Um valor mensal por categoria de despesa, para o ano. Vazio tira do orçamento. */
export function EditarOrcamento({ ano, categorias, atuais }: { ano: number; categorias: { id: string; nome: string; grupo: string | null }[]; atuais: Record<string, number> }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(categorias.map((c) => [c.id, atuais[c.id] ? valorNoCampo(atuais[c.id]) : ''])))
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const grupos = [...new Set(categorias.map((c) => c.grupo ?? 'Outras'))]
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} id="editar-orcamento"><Pencil className="size-3.5" />Orçamento de {ano}</Button>
      {aberto && (
        <Dialog titulo={`Orçamento mensal de ${ano}`} descricao="Quanto se espera gastar por mês em cada categoria. Deixe vazio o que não entra no orçamento." largura="max-w-xl" onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            {grupos.map((g) => (
              <fieldset key={g} className="flex flex-col gap-1.5">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</legend>
                {categorias.filter((c) => (c.grupo ?? 'Outras') === g).map((c) => (
                  <label key={c.id} className="flex items-center justify-between gap-3 text-sm">{c.nome}
                    <input value={valores[c.id]} onChange={(e) => setValores({ ...valores, [c.id]: e.target.value })} inputMode="decimal" placeholder="—" aria-label={`${c.nome} por mês`} className={`${inputClass} !w-32 py-1 text-right tabular-nums`} />
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          {erro && <p className="mt-2 text-xs text-destructive" role="alert">{erro}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
            <Button disabled={ocupado} onClick={() => iniciar(async () => {
              setErro('')
              const r = await salvarOrcamento(ano, Object.entries(valores).map(([categoria_id, valor]) => ({ categoria_id, valor })))
              if (r.erro) { setErro(r.erro); return }
              setAberto(false); router.refresh()
            })}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
          </div>
        </Dialog>
      )}
    </>
  )
}
