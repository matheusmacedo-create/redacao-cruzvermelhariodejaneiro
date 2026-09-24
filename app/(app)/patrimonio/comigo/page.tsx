import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { AceitarTermo } from '@/components/app/patrimonio/acoes'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Bens comigo' }
export const dynamic = 'force-dynamic'

const data = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('pt-BR', { timeZone: d.length === 10 ? 'UTC' : 'America/Sao_Paulo' })

/** Os bens da filial sob a minha responsabilidade, com o termo para aceitar. Vale para qualquer pessoa da equipe. */
export default async function Comigo() {
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  const { data: cautelas } = await supabase.from('pat_cautelas').select('id,bem_id,entregue_em,prevista_devolucao,termo,termo_aceito_em,observacao,pat_bens(plaqueta,nome,marca,modelo,numero_serie)')
    .eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).is('devolvido_em', null).order('entregue_em', { ascending: false })
  const lista = (cautelas ?? []).map((c) => ({ ...c, bem: (Array.isArray(c.pat_bens) ? c.pat_bens[0] : c.pat_bens) as { plaqueta: string; nome: string; marca: string | null; modelo: string | null; numero_serie: string | null } | null }))
  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/comigo" nivel={nivel} />
      <PageHeader title="Bens comigo" description="O que é da filial e está sob a sua responsabilidade. Confira e aceite o termo de cada um." />
      {!lista.length ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum bem da filial está com você.</Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {lista.map((c) => (
            <Card key={c.id as string} className="flex flex-col gap-3 p-5" data-cautela={c.id as string}>
              <div className="flex items-baseline justify-between gap-2"><span className="font-medium">{c.bem?.nome}</span><span className="font-mono text-xs text-muted-foreground">{c.bem?.plaqueta}</span></div>
              <p className="text-xs text-muted-foreground">{[c.bem?.marca, c.bem?.modelo, c.bem?.numero_serie && `série ${c.bem.numero_serie}`].filter(Boolean).join(' · ')}{' '}
                · recebido em {data(c.entregue_em as string)}{c.prevista_devolucao ? ` · devolver até ${data(c.prevista_devolucao as string)}` : ''}</p>
              {c.observacao && <p className="text-xs text-muted-foreground">“{c.observacao as string}”</p>}
              <p className="whitespace-pre-line rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">{c.termo as string}</p>
              {c.termo_aceito_em ? <p className="text-xs text-success">Termo aceito em {data(c.termo_aceito_em as string)}.</p> : <AceitarTermo cautelaId={c.id as string} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
