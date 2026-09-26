import Link from 'next/link'
import { Building2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { Diretorio } from '@/components/app/pessoas/diretorio'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { PESSOAS_DA_EQUIPE } from '@/lib/equipe'
import { setoresDoEspaco } from '@/lib/setores'
import { adminsDemais, montarDiretorio, type LinhaDoDiretorio } from '@/lib/pessoas/diretorio'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/pessoas') }
export const dynamic = 'force-dynamic'

/**
 * O Diretório da filial: a equipe inteira — com conta na Redação, só na
 * Equipe (RH) ou na lista oficial dos setores — com cargo, setor, contato e
 * o estado do acesso. Admin vê o que falta completar e dá acesso daqui.
 */
export default async function PessoasPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const ws = context.workspace.id
  const ehAdmin = pode(context.role, 'usuarios.gerenciar')
  const [{ data: linhas }, setores] = await Promise.all([
    supabase.rpc('diretorio', { p_workspace_id: ws }),
    setoresDoEspaco(supabase, ws),
  ])
  const pessoas = montarDiretorio((linhas ?? []) as LinhaDoDiretorio[], PESSOAS_DA_EQUIPE.map((p) => ({ nome: p.nome, cargo: p.cargo, setor: p.setor })))
  const responsavel = new Map(pessoas.filter((p) => p.user_id).map((p) => [p.user_id as string, p.nome]))
  const admins = adminsDemais(pessoas)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Diretório"
        description={`A equipe da filial: ${pessoas.filter((p) => p.acesso !== 'desativado').length} pessoas em ${setores.filter((s) => s.ativo).length} setores, com contato e acesso ao Palácio Virtual.`}
        actions={<div className="flex flex-wrap items-start gap-2">
          <Button variant="outline" render={<Link href="/pessoas/setores" />} data-ajuda="diretorio.setores"><Building2 className="size-4" />Setores</Button>
          {ehAdmin && <Button render={<Link href="/pessoas/adicionar" />} data-ajuda="diretorio.adicionar"><UserPlus className="size-4" />Adicionar pessoas</Button>}
        </div>}
      />
      <Diretorio
        pessoas={pessoas}
        setores={setores.filter((s) => s.ativo).map((s) => ({ nome: s.nome, descricao: s.descricao, responsavel: s.responsavel_id ? responsavel.get(s.responsavel_id) ?? null : null, email: s.email }))}
        ehAdmin={ehAdmin}
        alertaDeAdmins={ehAdmin && admins.alerta ? { admins: admins.admins, contas: admins.contas } : null}
      />
    </div>
  )
}
