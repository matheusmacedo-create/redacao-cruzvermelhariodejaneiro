import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { PeopleView } from './people-view'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/pessoas') }

export default async function PessoasPage() {
  const context = await requireWorkspace(); const supabase = await createClient()
  const { data: members } = await supabase.from('workspace_members').select('role,coordination,profiles(id,full_name,job_title,initials,color,avatar_path,active)').eq('workspace_id', context.workspace.id)
  const people = (members ?? []).filter((item: any) => { const p = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return p?.active !== false }).map((item: any) => { const p = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return { id:p.id,name:p.full_name,role:p.job_title,initials:p.initials,color:p.color,avatarPath:p.avatar_path,coordination:item.coordination,accessRole:item.role } })
  return <div><PageHeader title="Diretório" description="Quem tem acesso à Redação: coordenação, cargo e papel de cada pessoa." actions={pode(context.role, 'usuarios.gerenciar') ? <Button size="lg" render={<Link href="/usuarios"/>}><Plus className="size-4"/>Adicionar colaborador</Button> : undefined}/><PeopleView people={people}/></div>
}
