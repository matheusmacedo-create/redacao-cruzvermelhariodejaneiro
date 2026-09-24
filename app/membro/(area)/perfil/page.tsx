import { Lock } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { perfilDoMembro } from '@/lib/membro/dados'
import { VINCULOS } from '@/lib/participantes/regras'
import { FormularioDoPerfil, PreferenciaDeAvisos } from '@/components/membro/perfil'
import { BensComigo } from '@/components/membro/bens'
import { bensDoMembro } from '@/lib/membro/bens'

export const dynamic = 'force-dynamic'

const DATA = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')

export default async function PerfilDoMembro() {
  const m = await exigirMembro()
  const [p, bens] = await Promise.all([perfilDoMembro(m), bensDoMembro(m)])
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">Mantenha seus dados em dia: é por eles que a filial fala com você.</p>
      </div>
      <section className="rounded-xl border border-border bg-card p-5" id="dados-fixos">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Lock className="size-4 text-muted-foreground/70" />Com a coordenação</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Nome</dt><dd>{p.nome}</dd></div>
          <div><dt className="text-xs text-muted-foreground">E-mail (seu acesso)</dt><dd>{p.email ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">CPF</dt><dd>{p.cpf_mascara ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Nascimento</dt><dd>{DATA(p.data_nascimento)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Vínculo</dt><dd>{VINCULOS[p.vinculo as keyof typeof VINCULOS]?.rotulo ?? p.vinculo}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Setores</dt><dd>{p.setores.join(', ') || '—'}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Para corrigir estes dados, fale com a coordenação do Voluntariado.</p>
      </section>
      <BensComigo bens={bens} />
      <FormularioDoPerfil p={p} />
      <PreferenciaDeAvisos inicial={p.avisos_por_email} />
    </div>
  )
}
