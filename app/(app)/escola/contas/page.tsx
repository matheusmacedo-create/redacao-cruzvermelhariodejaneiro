import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { ContasDaEscola } from '@/components/app/escola/contas'
import { COLUNAS_DA_CONTA, contextoDaEscola, lerConta } from '@/lib/escola/servidor'

export const metadata = { title: 'Contas Únicopag · Escola' }
export const dynamic = 'force-dynamic'
// A primeira leitura de uma conta nova roda depois da resposta (after) e pode levar quase um minuto.
export const maxDuration = 60

/** As contas da Únicopag por onde a escola recebe. Admin cadastra e guarda a chave; os demais só veem. */
export default async function ContasDaEscolaPage() {
  const { context, supabase, nivel } = await contextoDaEscola()
  if (nivel < 2) notFound()
  const { data } = await supabase.from('escola_contas').select(COLUNAS_DA_CONTA).eq('workspace_id', context.workspace.id).order('ativa', { ascending: false }).order('nome')
  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/contas" />
      <PageHeader title="Contas Únicopag" description="Cada conta da Únicopag da escola, com a chave de API guardada no cofre. A Redação só lê: não cria cobrança, não estorna e não mexe no dinheiro." />
      <ContasDaEscola contas={(data ?? []).map((c) => lerConta(c))} ehAdmin={nivel >= 3} />
      <Card className="p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Como a leitura funciona</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Uma vez por dia (e quando alguém clica em Atualizar agora), a Redação lê o saldo e as transações de cada conta ativa.</li>
          <li>Da transação fica o valor, a forma de pagamento, o curso, a origem e o nome do pagador com o CPF mascarado. A ficha do aluno continua só no sistema da escola.</li>
          <li>A chave de cada conta é testada antes de guardar e fica no cofre criptografado; ninguém a vê de novo, nem o admin.</li>
        </ul>
      </Card>
    </div>
  )
}
