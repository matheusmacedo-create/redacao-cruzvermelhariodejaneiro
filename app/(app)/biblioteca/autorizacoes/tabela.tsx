import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { USOS, VINCULOS, ehUso, ehVinculo } from '@/lib/imagem/regras'
import { tituloDaColeta, type LinhaDaAutorizacao } from '@/lib/imagem/consulta'

const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

/** A lista de assinaturas: na busca geral (com a ação) e na página de um link. */
export function TabelaDeAutorizacoes({ linhas, mostrarAcao = false, acoes }: { linhas: LinhaDaAutorizacao[]; mostrarAcao?: boolean; acoes?: (l: LinhaDaAutorizacao) => React.ReactNode }) {
  if (!linhas.length) return <Card className="p-6 text-sm text-muted-foreground">Nenhuma assinatura encontrada.</Card>
  return (
    <div data-ajuda="autorizacoes.tabela" className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Pessoa</th>
            {mostrarAcao && <th className="px-3 py-2 font-medium">Ação</th>}
            <th className="px-3 py-2 font-medium">Usos</th>
            <th className="px-3 py-2 font-medium">Assinado em · aparelho</th>
            <th className="px-3 py-2 font-medium">Situação</th>
            {acoes && <th className="px-3 py-2"><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-border align-top last:border-0">
              <td className="px-3 py-2">
                <p className="font-medium">{l.nome}</p>
                <p className="text-xs text-muted-foreground">{ehVinculo(l.vinculo) ? VINCULOS[l.vinculo] : l.vinculo} · <span className="font-mono">{l.codigo}</span></p>
                {l.menor && <p className="text-xs text-muted-foreground">Menor — assinou {l.responsavel_nome} ({l.responsavel_parentesco})</p>}
                {l.contato && <p className="text-xs text-muted-foreground">{l.contato}</p>}
              </td>
              {mostrarAcao && <td className="px-3 py-2"><Link href={`/biblioteca/autorizacoes/${l.coleta_id}`} className="text-primary hover:underline">{tituloDaColeta(l)}</Link></td>}
              <td className="px-3 py-2 text-xs">{l.usos.map((u) => (ehUso(u) ? USOS[u].rotulo : u)).join(' · ')}</td>
              <td className="px-3 py-2 text-xs"><p>{quando(l.assinado_em)}</p><p className="text-muted-foreground">{l.aparelho}</p>{l.ip && <p className="text-muted-foreground">IP {l.ip}</p>}</td>
              <td className="px-3 py-2 text-xs">
                {l.revogada_em ? (
                  <>
                    <span className="rounded bg-destructive/10 px-2 py-0.5 font-medium text-destructive">Revogada</span>
                    <p className="mt-1 text-muted-foreground">{quando(l.revogada_em)} · {l.revogada_por === 'titular' ? 'pela pessoa' : 'pela equipe'}</p>
                    {l.revogacao_motivo && <p className="text-muted-foreground">“{l.revogacao_motivo}”</p>}
                  </>
                ) : <span className="rounded bg-success/10 px-2 py-0.5 font-medium text-success">Válida</span>}
              </td>
              {acoes && <td className="px-3 py-2 text-right">{acoes(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
