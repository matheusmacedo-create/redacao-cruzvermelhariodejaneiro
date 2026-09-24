import Link from 'next/link'
import { CalendarCheck, HeartPulse, Landmark, ListOrdered, Settings2 } from 'lucide-react'
import { EscolhaDaEmpresa } from './empresa'

const SECOES = [
  { href: '/financeiro', rotulo: 'Lançamentos', icone: ListOrdered },
  { href: '/financeiro/saude', rotulo: 'Saúde do caixa', icone: HeartPulse },
  { href: '/financeiro/conciliacao', rotulo: 'Conciliação', icone: Landmark },
  { href: '/financeiro/fechamento', rotulo: 'Fechamento', icone: CalendarCheck },
  { href: '/financeiro/cadastros', rotulo: 'Cadastros', icone: Settings2 },
] as const

type Empresa = { id: string; nome: string; cnpj: string | null; tipo: string; principal: boolean }

/** As seções do Financeiro, no alto de cada uma — e de qual empresa são os livros abertos. */
export function SecoesDoFinanceiro({ atual, empresas = [], empresa = null }: { atual: (typeof SECOES)[number]['href']; empresas?: Empresa[]; empresa?: Empresa | null }) {
  return (
    <div className="flex flex-col gap-4">
      <EscolhaDaEmpresa empresas={empresas} atual={empresa} />
      {/* Abas das seções: sublinhadas, para não se confundirem com a troca de empresa acima. */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seções do Financeiro">
        {SECOES.map((s) => {
          const ativa = atual === s.href
          return (
            <Link key={s.href} href={s.href} aria-current={ativa ? 'page' : undefined}
              className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${ativa ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}`}>
              <s.icone className={`size-4 ${ativa ? 'text-primary' : ''}`} />{s.rotulo}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
