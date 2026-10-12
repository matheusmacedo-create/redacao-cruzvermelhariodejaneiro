import { redirect } from 'next/navigation'
import { CabecalhoDoEmail } from '@/components/email-provisorio/cabecalho'
import { EquipeDasCaixas, type CaixaDaEquipe } from '@/components/email-provisorio/equipe'
import { exigirContextoDoEmail } from '@/lib/email-provisorio/sessao'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = { title: 'Equipe das caixas — E-mail dos setores' }
export const dynamic = 'force-dynamic'

/**
 * Quem vê cada caixa, para o responsável dela (e para quem configura o
 * correio no Palácio, que vê todas e escolhe os responsáveis). Mostra só as
 * caixas em que a pessoa é responsável; as actions conferem de novo.
 */
export default async function EquipeDasCaixasPage() {
  const ctx = await exigirContextoDoEmail()
  if (!ctx || !ctx.responsavelDe.size) redirect('/email')
  const minhas = ctx.caixas.filter((c) => ctx.responsavelDe.has(c.id))
  const admin = createAdminClient()
  const { data: acessos } = await admin.from('email_acessos').select('caixa_id,user_id,responsavel,profiles:user_id(full_name,username,active,trocar_senha)')
    .eq('workspace_id', ctx.workspaceId).in('caixa_id', minhas.map((c) => c.id))
  const pessoas = [...new Set((acessos ?? []).map((a) => a.user_id as string))]
  const { data: doPalacio } = pessoas.length
    ? await admin.from('workspace_members').select('user_id').in('user_id', pessoas)
    : { data: [] as { user_id: string }[] }
  const noPalacio = new Set((doPalacio ?? []).map((m) => m.user_id as string))

  const caixas: CaixaDaEquipe[] = minhas.map((c) => ({
    id: c.id, email: c.email, setor: c.setor,
    pessoas: (acessos ?? []).filter((a) => a.caixa_id === c.id).map((a) => {
      const p = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as { full_name?: string; username?: string; active?: boolean; trocar_senha?: boolean } | null
      return {
        id: a.user_id as string, nome: p?.full_name || p?.username || '—', usuario: p?.username ?? '',
        responsavel: Boolean(a.responsavel), doPalacio: noPalacio.has(a.user_id as string),
        ativa: p?.active !== false, aguardandoPrimeiroAcesso: Boolean(p?.trocar_senha),
      }
    }).sort((a, b) => Number(b.responsavel) - Number(a.responsavel) || a.nome.localeCompare(b.nome, 'pt-BR')),
  }))

  return (
    <main className="min-h-screen bg-background">
      <CabecalhoDoEmail nome={ctx.nome} responsavel atual="equipe" />
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Equipe das caixas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx.administra
              ? 'Você configura o correio: vê todas as caixas e escolhe o responsável de cada uma. O responsável dá e tira acesso às pessoas do setor dele.'
              : 'Você é responsável por estas caixas: dê acesso a quem trabalha no setor, gere uma senha provisória para quem esqueceu e tire o acesso de quem saiu.'}
          </p>
        </div>
        <EquipeDasCaixas caixas={caixas} administra={ctx.administra} eu={ctx.userId} />
      </div>
    </main>
  )
}
