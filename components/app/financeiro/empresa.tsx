'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, GraduationCap, Loader2 } from 'lucide-react'
import { escolherEmpresa } from '@/app/actions/financeiro'

type Empresa = { id: string; nome: string; cnpj: string | null; tipo: string; principal: boolean }

const cnpjLegivel = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

/**
 * De qual empresa são os livros abertos: a filial ou a Escola (empresa à
 * parte, com CNPJ, contas, lançamentos e fechamento próprios). Trocar aqui
 * vale para todas as abas do Financeiro.
 */
export function EscolhaDaEmpresa({ empresas, atual }: { empresas: Empresa[]; atual: Empresa | null }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  if (empresas.length < 2 || !atual) return null
  return (
    <div className="flex flex-wrap items-center gap-2" id="empresa-do-financeiro">
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="radiogroup" aria-label="Empresa">
        {empresas.map((e) => {
          const Icone = e.tipo === 'escola' ? GraduationCap : Building2
          const ativa = e.id === atual.id
          return (
            <button key={e.id} type="button" role="radio" aria-checked={ativa} disabled={pendente}
              onClick={() => { if (!ativa) iniciar(async () => { await escolherEmpresa(e.id); router.refresh() }) }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${ativa ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icone className="size-4" />{e.nome}
            </button>
          )
        })}
      </div>
      {pendente ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : (
        <span className="text-xs text-muted-foreground">Livros de {atual.nome}{atual.cnpj ? ` · CNPJ ${cnpjLegivel(atual.cnpj)}` : atual.principal ? '' : ' · CNPJ não informado (Cadastros → Empresa)'}</span>
      )}
    </div>
  )
}
