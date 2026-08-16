import { LogOut } from 'lucide-react'
import { updatePassword, updateProfile } from '@/app/actions/editorial'
import { PageHeader } from '@/components/app/page-header'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

export default async function PerfilPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const [{ data: profile }, { data: activity }] = await Promise.all([
    supabase.from('profiles').select('full_name,username,job_title,initials,color').eq('id', context.user.id).single(),
    supabase.from('activity_log').select('id,action,entity_type,created_at').eq('workspace_id', context.workspace.id).eq('actor_id', context.user.id).order('created_at', { ascending: false }).limit(8),
  ])
  const name = profile?.full_name || context.user.email || 'Usuário'
  const coordination = context.memberships.find((membership) => membership.workspaces.some((workspace) => workspace.id === context.workspace.id))?.coordination || 'Sem coordenação'

  return <div className="mx-auto max-w-3xl">
    <PageHeader title="Meu perfil" description="Suas informações e preferências de conta." />
    <div className="flex flex-col gap-6">
      <Card className="flex items-center gap-4 p-6"><Avatar initials={profile?.initials || name.slice(0, 2).toUpperCase()} color={profile?.color} size="xl" /><div><h2 className="text-xl font-bold">{name}</h2><p className="text-sm text-muted-foreground">{profile?.job_title || context.role} · {coordination || 'Sem coordenação'}</p><p className="mt-1 text-sm text-primary">@{profile?.username}</p></div></Card>
      <Card className="p-6"><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dados pessoais</h3><form action={updateProfile}><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome completo" name="fullName" defaultValue={name} required /><Field label="Usuário" defaultValue={profile?.username || ''} disabled /><Field label="Cargo" name="jobTitle" defaultValue={profile?.job_title || ''} /><Field label="Coordenação" defaultValue={coordination || ''} disabled /></div><div className="mt-5 flex justify-end"><Button type="submit" size="lg">Salvar alterações</Button></div></form></Card>
      <Card className="p-6"><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Segurança</h3><form action={updatePassword}><div className="grid gap-4 sm:grid-cols-2"><Field label="Nova senha" name="password" type="password" required /><Field label="Confirmar nova senha" name="confirmation" type="password" required /></div><div className="mt-5 flex justify-end"><Button type="submit" variant="outline" size="lg">Atualizar senha</Button></div></form></Card>
      <Card className="p-6"><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Atividade recente</h3>{activity?.length ? <ul className="flex flex-col gap-3">{activity.map((item) => <li key={item.id} className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{item.action.replaceAll('_', ' ')} · {item.entity_type}</span><time className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('pt-BR').format(new Date(item.created_at))}</time></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhuma atividade recente.</p>}</Card>
      <form action="/auth/signout" method="post" className="flex justify-end"><Button type="submit" variant="destructive" size="lg"><LogOut className="size-4" />Sair da conta</Button></form>
    </div>
  </div>
}

function Field({ label, name, defaultValue, type = 'text', required, disabled }: { label: string; name?: string; defaultValue?: string; type?: string; required?: boolean; disabled?: boolean }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}<input className={inputClass} name={name} type={type} defaultValue={defaultValue} required={required} disabled={disabled} minLength={required ? 3 : undefined} /></label>
}
