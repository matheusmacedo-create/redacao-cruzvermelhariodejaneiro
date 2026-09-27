import Link from 'next/link'
import { familiaDaArea } from '@/lib/navegacao'
import { pode } from '@/lib/permissoes'

/**
 * As abas de uma área que tem partes (lib/navegacao.ts, `dentroDe`):
 * Resultados › Histórico; Transparência › Canais oficiais › Trilha pública.
 * As partes não ocupam linha na sidebar — é por aqui que se vai de uma à
 * outra. A aba que o papel não abre não aparece; a página confere de novo.
 */
export function AbasDaArea({ atual, papel }: { atual: string; papel: string | null | undefined }) {
  const abas = familiaDaArea(atual, (p) => pode(papel, p))
  if (!abas.length) return null
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seções desta área" data-abas-da-area>
      {abas.map((a) => {
        const ativa = a.href === atual
        const Icone = a.icone
        return (
          <Link key={a.href} href={a.href} aria-current={ativa ? 'page' : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${ativa ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}`}>
            <Icone className={`size-4 ${ativa ? 'text-primary' : ''}`} aria-hidden="true" />{a.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
