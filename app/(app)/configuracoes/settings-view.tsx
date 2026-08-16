'use client'

import { useState } from 'react'
import { Plus, Users, SlidersHorizontal, Building2, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { users, coordenacoes, type User } from '@/lib/data'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'coordenacoes', label: 'Coordenações', icon: Building2 },
  { id: 'preferencias', label: 'Preferências', icon: SlidersHorizontal },
  { id: 'notificacoes', label: 'Notificações', icon: Bell },
] as const

const statusMeta: Record<User['status'], { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'bg-success/14 text-success' },
  inativo: { label: 'Inativo', className: 'bg-muted text-muted-foreground' },
  convidado: { label: 'Convidado', className: 'bg-warning/20 text-warning-foreground' },
}

const initials = (name: string) =>
  name.split(' ').slice(0, 2).map((n) => n[0]).join('')

export function SettingsView() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('usuarios')

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      {/* Section nav */}
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </nav>

      <div>
        {tab === 'usuarios' && <UsersTab />}
        {tab === 'coordenacoes' && <CoordenacoesTab />}
        {tab === 'preferencias' && <PreferenciasTab />}
        {tab === 'notificacoes' && <NotificacoesTab />}
      </div>
    </div>
  )
}

function UsersTab() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Usuários</h2>
          <p className="text-sm text-muted-foreground">Gerencie acessos e perfis de permissão.</p>
        </div>
        <Button size="lg">
          <Plus className="size-4" />
          Convidar usuário
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1fr_150px_130px_100px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
          <span>Usuário</span>
          <span>Coordenação</span>
          <span>Perfil</span>
          <span className="text-right">Status</span>
        </div>
        <div className="divide-y divide-border">
          {users.map((u) => {
            const st = statusMeta[u.status]
            return (
              <div
                key={u.id}
                className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_150px_130px_100px] md:items-center md:gap-4"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar initials={initials(u.name)} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">{u.coordenacao}</span>
                <span className="text-sm">{u.profile}</span>
                <span className="md:text-right">
                  <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', st.className)}>
                    {st.label}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function CoordenacoesTab() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Coordenações</h2>
          <p className="text-sm text-muted-foreground">
            Áreas internas que enviam atividades e participam das aprovações.
          </p>
        </div>
        <Button size="lg">
          <Plus className="size-4" />
          Nova coordenação
        </Button>
      </div>
      <Card className="divide-y divide-border">
        {coordenacoes.map((c) => (
          <div key={c} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">{c}</span>
            <span className="text-xs text-muted-foreground">
              {users.filter((u) => u.coordenacao === c).length} usuário(s)
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}

function PreferenciasTab() {
  const options = [
    { label: 'Modo escuro automático', desc: 'Seguir o tema do sistema operacional.', on: true },
    { label: 'Assistente de escrita', desc: 'Sugestões de texto no editor de conteúdo.', on: true },
    { label: 'Salvar rascunhos automaticamente', desc: 'Salvar alterações a cada poucos segundos.', on: true },
  ]
  return (
    <div>
      <h2 className="mb-1 text-base font-semibold">Preferências</h2>
      <p className="mb-4 text-sm text-muted-foreground">Ajustes gerais do ambiente de trabalho.</p>
      <Card className="divide-y divide-border">
        {options.map((o) => (
          <Toggle key={o.label} {...o} />
        ))}
      </Card>
    </div>
  )
}

function NotificacoesTab() {
  const options = [
    { label: 'Menções', desc: 'Quando alguém mencionar você em uma conversa.', on: true },
    { label: 'Aprovações pendentes', desc: 'Quando um conteúdo aguardar sua validação.', on: true },
    { label: 'Prazos próximos', desc: 'Um dia antes do prazo de uma pauta sob sua responsabilidade.', on: false },
    { label: 'Novos materiais', desc: 'Quando novos arquivos chegarem à Caixa de Entrada.', on: false },
  ]
  return (
    <div>
      <h2 className="mb-1 text-base font-semibold">Notificações</h2>
      <p className="mb-4 text-sm text-muted-foreground">Escolha o que deseja acompanhar.</p>
      <Card className="divide-y divide-border">
        {options.map((o) => (
          <Toggle key={o.label} {...o} />
        ))}
      </Card>
    </div>
  )
}

function Toggle({ label, desc, on }: { label: string; desc: string; on: boolean }) {
  const [checked, setChecked] = useState(on)
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => setChecked((v) => !v)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
