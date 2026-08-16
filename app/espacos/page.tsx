import { Database, FlaskConical, ArrowRight, LogOut } from 'lucide-react'
import { CrossMark } from '@/components/app/brand-mark'
import { Button } from '@/components/ui/button'
import { requireSession } from '@/lib/session'
import { selectWorkspace } from './actions'

export default async function WorkspacesPage() {
  const context = await requireSession()
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><CrossMark className="size-11 border border-border"/><div><p className="font-bold">CVRJ Redação</p><p className="text-xs text-muted-foreground">Central de Comunicação</p></div></div><form action="/auth/signout" method="post"><Button variant="ghost" type="submit"><LogOut className="size-4"/> Sair</Button></form></div>
        <div className="mt-14 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ambiente de trabalho</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Escolha por onde começar</h1><p className="mt-3 leading-relaxed text-muted-foreground">Os dados dos dois espaços são totalmente isolados. Use a demonstração para aprender e a produção para construir sua operação do zero.</p></div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {context.memberships.map((item: any) => {
            const workspace = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces
            const demo = workspace.kind === 'demo'
            return <form action={selectWorkspace} key={workspace.id} className="group flex min-h-64 flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><input type="hidden" name="workspaceId" value={workspace.id}/><div className={`flex size-12 items-center justify-center rounded-xl ${demo ? 'bg-primary/10 text-primary' : 'bg-foreground text-background'}`}>{demo ? <FlaskConical className="size-6"/> : <Database className="size-6"/>}</div><h2 className="mt-6 text-xl font-bold">{workspace.name}</h2><p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{demo ? 'Explore fluxos, pautas e conteúdos preenchidos. Tudo que você alterar permanece apenas neste ambiente.' : 'Área operacional limpa para cadastrar a equipe, projetos, pautas e conteúdos reais desde o início.'}</p><div className="mt-6 flex items-center justify-between"><span className="rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize">{item.role}</span><Button type="submit" variant={demo ? 'outline' : 'default'}>Entrar <ArrowRight className="size-4"/></Button></div></form>
          })}
        </div>
      </div>
    </main>
  )
}
