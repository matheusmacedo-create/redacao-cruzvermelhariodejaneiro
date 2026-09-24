import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDeEntrega, type MaterialDaDoacao } from '@/components/app/patrimonio/doacoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Entregar doação' }
export const dynamic = 'force-dynamic'

export default async function EntregarDoacao({ searchParams }: { searchParams: Promise<{ campanha?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const c = await cadastrosDoPatrimonio()
  const [{ data: campanhas }, { data: materiais }, { data: saldos }] = await Promise.all([
    supabase.from('doa_campanhas').select('id,nome').eq('workspace_id', ws).eq('ativa', true).order('nome'),
    supabase.from('est_itens').select('id,codigo,nome,unidade,controla_validade,eh_kit').eq('workspace_id', ws).eq('ativo', true).gt('saldo', 0).order('nome').limit(5000),
    supabase.from('est_saldos').select('item_id,local_id,validade,quantidade').eq('workspace_id', ws).gt('quantidade', 0).limit(20000),
  ])
  // O que dá para entregar (vencido não sai), por local e material.
  const disponivel: Record<string, Record<string, number>> = {}
  for (const s of saldos ?? []) {
    if (s.validade && (s.validade as string) < hoje) continue
    const l = (disponivel[s.local_id as string] ??= {})
    l[s.item_id as string] = Math.round(((l[s.item_id as string] ?? 0) + Number(s.quantidade)) * 1000) / 1000
  }
  const campanhaInicial = (campanhas ?? []).some((x) => x.id === sp.campanha) ? sp.campanha : undefined
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader title="Entregar doação" description="Registre o que foi entregue e para quem. Sai do Estoque (o que vence primeiro) e gera o termo de entrega para assinar." />
      <Card className="p-5 sm:p-6">
        <FormularioDeEntrega
          campanhas={(campanhas ?? []).map((x) => ({ id: x.id as string, nome: x.nome as string }))} locais={c.locais.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))}
          materiais={(materiais ?? []) as MaterialDaDoacao[]} disponivel={disponivel} hoje={hoje} campanhaInicial={campanhaInicial}
        />
      </Card>
    </div>
  )
}
