import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDeRecebimento, type Doador, type MaterialDaDoacao } from '@/components/app/patrimonio/doacoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Receber doação' }
export const dynamic = 'force-dynamic'

export default async function ReceberDoacao({ searchParams }: { searchParams: Promise<{ campanha?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const c = await cadastrosDoPatrimonio()
  const [{ data: doadores }, { data: campanhas }, { data: materiais }] = await Promise.all([
    supabase.from('doa_doadores').select('id,nome,documento,email,telefone,observacao').eq('workspace_id', ws).order('nome').limit(5000),
    supabase.from('doa_campanhas').select('id,nome').eq('workspace_id', ws).eq('ativa', true).order('nome'),
    supabase.from('est_itens').select('id,codigo,nome,unidade,controla_validade,eh_kit').eq('workspace_id', ws).eq('ativo', true).order('nome').limit(5000),
  ])
  const campanhaInicial = (campanhas ?? []).some((x) => x.id === sp.campanha) ? sp.campanha : undefined
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader title="Receber doação" description="Registre o que chegou e emita o recibo para o doador. Cada material entra no Estoque e cada bem no Patrimônio, pelo valor de mercado." />
      <Card className="p-5 sm:p-6">
        <FormularioDeRecebimento
          doadores={(doadores ?? []) as Doador[]} campanhas={(campanhas ?? []).map((x) => ({ id: x.id as string, nome: x.nome as string }))}
          locais={c.locais.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))} materiais={(materiais ?? []) as MaterialDaDoacao[]}
          estCategorias={c.estCategorias.filter((k) => k.ativa).map((k) => ({ id: k.id, nome: k.nome }))}
          patCategorias={c.categorias.filter((k) => k.ativa).map((k) => ({ id: k.id, nome: k.nome }))} hoje={hojeEmSaoPaulo()} campanhaInicial={campanhaInicial}
        />
      </Card>
    </div>
  )
}
