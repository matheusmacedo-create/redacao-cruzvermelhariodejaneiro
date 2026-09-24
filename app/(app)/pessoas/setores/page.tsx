import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { Setores } from '@/components/app/pessoas/setores'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { setoresDoEspaco } from '@/lib/setores'
import { montarDiretorio, type LinhaDoDiretorio } from '@/lib/pessoas/diretorio'

export const metadata = { title: 'Setores' }
export const dynamic = 'force-dynamic'

/** Os setores da filial: a lista que aparece em Usuários, Equipe, Voluntariado, Registrar e no Correio. */
export default async function SetoresPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const ws = context.workspace.id
  const [setores, { data: linhas }] = await Promise.all([setoresDoEspaco(supabase, ws), supabase.rpc('diretorio', { p_workspace_id: ws })])
  const pessoas = montarDiretorio((linhas ?? []) as LinhaDoDiretorio[], []).filter((p) => p.acesso !== 'desativado')
  const contas = pessoas.filter((p) => p.user_id).map((p) => ({ id: p.user_id as string, nome: p.nome }))
  const ehAdmin = context.role === 'admin'
  return (
    <div className="flex flex-col gap-6">
      <Link href="/pessoas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Diretório</Link>
      <PageHeader title="Setores" description={ehAdmin ? 'A lista de setores da filial, usada em Usuários, Equipe, Voluntariado, Registrar e no Correio. Renomear um setor atualiza quem já está nele.' : 'Os setores da filial. Só administradores mudam esta lista.'} />
      <Card className="p-5">
        <Setores ehAdmin={ehAdmin} contas={contas} setores={setores.map((s) => ({ ...s, pessoas: pessoas.filter((p) => p.setor === s.nome).length }))} />
      </Card>
    </div>
  )
}
