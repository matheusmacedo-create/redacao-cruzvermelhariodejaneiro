import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { Membro } from '@/lib/rh/acesso'
import type { NoDoOrganograma } from '@/lib/rh/regras'
import { nomeDe } from './comum'

type Pessoa = Pick<Membro, 'id' | 'nome' | 'nome_social' | 'cargo' | 'setor' | 'situacao'>

function No({ n }: { n: NoDoOrganograma<Pessoa> }) {
  return (
    <li className="relative pl-5 before:absolute before:left-0 before:top-5 before:h-px before:w-4 before:bg-border">
      <Link href={`/equipe/${n.membro.id}`} className="my-1 inline-flex flex-col rounded-lg border border-border bg-card px-3 py-2 hover:border-primary/60">
        <span className="text-sm font-medium">{nomeDe(n.membro)}{n.membro.situacao === 'afastado' && <span className="ml-2 text-[11px] font-normal text-warning-foreground">afastado</span>}</span>
        <span className="text-xs text-muted-foreground">{[n.membro.cargo, n.membro.setor].filter(Boolean).join(' · ') || 'Sem cargo'}{n.equipe.length ? ` · ${n.equipe.length} direto${n.equipe.length > 1 ? 's' : ''}` : ''}</span>
      </Link>
      {n.equipe.length > 0 && <ul className="ml-3 border-l border-border">{n.equipe.map((f) => <No key={f.membro.id} n={f} />)}</ul>}
    </li>
  )
}

/**
 * O organograma pelo gestor direto de cada um. Quem ainda não tem gestor nem
 * equipe fica num quadro à parte, para não parecer topo de hierarquia.
 */
export function Organograma({ arvore }: { arvore: NoDoOrganograma<Pessoa>[] }) {
  if (!arvore.length) return <Card className="p-10 text-center text-sm text-muted-foreground">Sem fichas ainda.</Card>
  const semGestor = arvore.filter((n) => !n.equipe.length)
  const comEquipe = arvore.filter((n) => n.equipe.length)
  return (
    <div className="flex flex-col gap-5">
      {comEquipe.length > 0 && (
        <Card className="overflow-x-auto p-5" data-organograma>
          <ul className="-ml-5">{comEquipe.map((n) => <No key={n.membro.id} n={n} />)}</ul>
        </Card>
      )}
      {semGestor.length > 0 && (
        <Card className="p-5" data-sem-gestor>
          <p className="mb-2 text-sm font-semibold">Sem gestor definido ({semGestor.length})</p>
          <p className="mb-3 text-xs text-muted-foreground">Defina o gestor direto na ficha de cada um para que entrem no organograma.</p>
          <div className="flex flex-wrap gap-2">
            {semGestor.map((n) => (
              <Link key={n.membro.id} href={`/equipe/${n.membro.id}`} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/60">
                <span className="font-medium">{nomeDe(n.membro)}</span>{n.membro.setor ? <span className="text-muted-foreground"> · {n.membro.setor}</span> : null}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
