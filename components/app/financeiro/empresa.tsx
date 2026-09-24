'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, GraduationCap, Loader2 } from 'lucide-react'
import { escolherEmpresa } from '@/app/actions/financeiro'
import { cn } from '@/lib/utils'

type Empresa = { id: string; nome: string; cnpj: string | null; tipo: string; principal: boolean }

const cnpjLegivel = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
function IconeDaEmpresa({ tipo, className }: { tipo: string; className?: string }) {
  return tipo === 'escola' ? <GraduationCap className={className} aria-hidden="true" /> : <Building2 className={className} aria-hidden="true" />
}

/**
 * De qual empresa são os livros abertos: a filial ou a Escola (empresa à
 * parte, com CNPJ, contas, lançamentos e fechamento próprios). Trocar aqui
 * vale para todas as abas do Financeiro.
 *
 * Fica num cartão próprio, separado das abas: antes a troca e as abas eram
 * dois grupos de botões parecidos, um em cima do outro, e não dava para
 * saber qual mandava em qual. A falha da troca agora aparece — antes era
 * engolida e o clique parecia não funcionar.
 */
export function EscolhaDaEmpresa({ empresas, atual }: { empresas: Empresa[]; atual: Empresa | null }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [indo, setIndo] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  // Com uma empresa só, não há o que escolher: o cartão seria ruído.
  if (!atual || empresas.length < 2) return null
  const cnpj = atual.cnpj ? `CNPJ ${cnpjLegivel(atual.cnpj)}` : atual.principal ? null : 'CNPJ não informado — complete em Cadastros → Empresa'

  function trocar(e: Empresa) {
    if (e.id === atual?.id || pendente) return
    setErro('')
    setIndo(e.id)
    iniciar(async () => {
      const r = await escolherEmpresa(e.id)
      if (r.erro) { setErro(r.erro); setIndo(null); return }
      router.refresh()
      setIndo(null)
    })
  }

  return (
    <section id="empresa-do-financeiro" aria-label="Empresa do Financeiro" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><IconeDaEmpresa tipo={atual.tipo} className="size-5" /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Livros abertos</p>
            <p className="truncate text-base font-semibold">{atual.nome}</p>
            {cnpj && <p className={cn('truncate text-xs', atual.cnpj ? 'text-muted-foreground' : 'text-warning-foreground')}>{cnpj}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:items-end">
            <p id="trocar-empresa" className="text-xs font-medium text-muted-foreground">Trocar empresa</p>
            <div role="radiogroup" aria-labelledby="trocar-empresa" className="flex flex-wrap gap-2">
              {empresas.map((e) => {
                const ativa = e.id === atual.id
                return (
                  <button key={e.id} type="button" role="radio" aria-checked={ativa} disabled={pendente}
                    onClick={() => trocar(e)}
                    className={cn(
                      'flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-wait',
                      ativa ? 'border-primary bg-primary/[0.06] font-medium text-foreground' : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                    )}>
                    {indo === e.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <IconeDaEmpresa tipo={e.tipo} className="size-4" />}
                    {e.nome}
                    {ativa && <Check className="size-4 text-primary" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
        </div>
      </div>
      <div aria-live="polite">
        {indo && <p className="mt-3 text-xs text-muted-foreground">Abrindo os livros de {empresas.find((e) => e.id === indo)?.nome}…</p>}
        {erro && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      </div>
    </section>
  )
}
