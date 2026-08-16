import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { PageHeader } from '@/components/app/page-header'
import { getPerson, recentActivity } from '@/lib/data'

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

export default function PerfilPage() {
  const me = getPerson('matheus')!
  const myActivity = recentActivity.filter((a) => a.authorId === me.id)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Meu perfil" description="Suas informações e preferências de conta." />

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar initials={me.initials} color={me.color} size="xl" />
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-bold">{me.name}</h2>
            <p className="text-sm text-muted-foreground">{me.role} · {me.coordenacao}</p>
            <p className="mt-1 text-sm text-primary">{me.email}</p>
          </div>
          <Button variant="outline" size="lg" className="sm:ml-auto">
            Alterar foto
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dados pessoais
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" defaultValue={me.name} />
            <Field label="E-mail institucional" defaultValue={me.email} type="email" />
            <Field label="Cargo" defaultValue={me.role} />
            <Field label="Coordenação" defaultValue={me.coordenacao} />
          </div>
          <div className="mt-5 flex justify-end">
            <Button size="lg">Salvar alterações</Button>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Segurança
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nova senha" type="password" placeholder="••••••••" />
            <Field label="Confirmar nova senha" type="password" placeholder="••••••••" />
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="outline" size="lg">Atualizar senha</Button>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Atividade recente
          </h3>
          {myActivity.length > 0 ? (
            <ul className="space-y-3">
              {myActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{a.text}</span>
                  <span className="text-xs text-muted-foreground">{a.time}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma atividade recente.</p>
          )}
        </Card>

        <div className="flex justify-end">
          <Button variant="destructive" size="lg" render={<Link href="/" />}>
            <LogOut className="size-4" />
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  defaultValue,
  type = 'text',
  placeholder,
}: {
  label: string
  defaultValue?: string
  type?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <input className={inputClass} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  )
}
