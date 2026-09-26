import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { ContasDaEscola } from '@/components/app/escola/contas'
import { MetaAds, type ContaMeta } from '@/components/app/escola/meta'
import { COLUNAS_DA_CONTA, lerConta } from '@/lib/escola/servidor'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'

export const metadata = { title: 'Contas e integrações · Escola' }
export const dynamic = 'force-dynamic'
// A primeira leitura de uma conta nova roda depois da resposta (after) e pode levar quase um minuto.
export const maxDuration = 60

/**
 * Onde a escola se liga ao mundo de fora: as contas da Únicopag por onde ela
 * recebe (quem vê as vendas) e a conta de anúncios do Meta (quem trabalha no
 * marketing). Admin cadastra e guarda as chaves; os demais só veem.
 */
export default async function ConfiguracoesDaEscolaPage() {
  const { context, supabase, nivel, nivelEscola } = await contextoDoMarketing()
  if (nivel < 2 && nivelEscola < 2) notFound()
  const ws = context.workspace.id
  const [{ data: contas }, { data: metaContas }, { data: chaveMeta }] = await Promise.all([
    nivelEscola >= 2 ? supabase.from('escola_contas').select(COLUNAS_DA_CONTA).eq('workspace_id', ws).order('ativa', { ascending: false }).order('nome') : Promise.resolve({ data: [] }),
    nivel >= 2 ? supabase.from('escola_meta_contas').select('id,act_id,nome,filtro,ativa,sincronizada_em,sincronizacao_erro').eq('workspace_id', ws).order('created_at') : Promise.resolve({ data: [] }),
    supabase.from('integracoes_chaves').select('servico').eq('workspace_id', ws).eq('servico', 'meta_ads').maybeSingle(),
  ])
  const temToken = Boolean(chaveMeta) || Boolean(process.env.META_ADS_TOKEN?.trim())
  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/configuracoes" financeiro={nivelEscola >= 2} marketing={nivel >= 2} />
      <PageHeader title="Contas e integrações" description="As contas da Únicopag por onde a escola recebe e a conta de anúncios do Meta. O Palácio Virtual só lê: não cria cobrança, não estorna e não mexe em anúncio." />
      {nivelEscola >= 2 && (
        <section className="flex flex-col gap-3" id="unicopag" data-ajuda="escola-contas.unicopag">
          <div>
            <h2 className="text-base font-medium">Contas da Únicopag</h2>
            <p className="text-sm text-muted-foreground">Cada conta com a chave de API guardada no cofre. Saldo e transações são lidos todo dia e aparecem em Vendas.</p>
          </div>
          <ContasDaEscola contas={(contas ?? []).map((c) => lerConta(c as Record<string, unknown>))} ehAdmin={nivelEscola >= 3} />
        </section>
      )}
      {nivel >= 2 && (
        <section className="flex flex-col gap-3" id="meta" data-ajuda="escola-contas.meta">
          <MetaAds contas={(metaContas ?? []) as ContaMeta[]} ehAdmin={nivel >= 3} temToken={temToken} />
        </section>
      )}
      <Card className="p-4 text-sm text-muted-foreground" data-ajuda="escola-contas.como-funciona">
        <p className="font-medium text-foreground">Como a leitura funciona</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Uma vez por dia (e pelos botões de atualizar), o Palácio Virtual lê o saldo e as transações de cada conta da Únicopag e as campanhas e anúncios do Meta.</li>
          <li>Da transação ficam o valor, a forma de pagamento, o curso, a origem e o nome do pagador com o CPF mascarado. A ficha do aluno continua só no sistema da escola.</li>
          <li>As chaves são testadas antes de guardar e ficam no cofre criptografado; ninguém as vê de novo, nem o admin.</li>
        </ul>
      </Card>
    </div>
  )
}
