import { Megaphone, Pin } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { avisosDoMembro } from '@/lib/membro/canal'
import { createAdminClient } from '@/lib/supabase/admin'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'

export const dynamic = 'force-dynamic'

/** O mural completo. Abrir aqui marca todos como vistos. */
export default async function Avisos() {
  const m = await exigirMembro()
  const avisos = await avisosDoMembro(m, hojeEmSaoPaulo())
  const novos = avisos.filter((a) => !a.visto).map((a) => a.id)
  if (novos.length && !m.previa) await createAdminClient().rpc('membro_ver_avisos', { p_participante_id: m.participanteId, p_avisos: novos })
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avisos</h1>
        <p className="text-sm text-muted-foreground">Recados da coordenação para todos os voluntários.</p>
      </div>
      {avisos.map((a) => (
        <article key={a.id} className="rounded-xl border border-border bg-card p-5">
          <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            {a.fixado && <span className="flex items-center gap-1 font-medium text-primary"><Pin className="size-3" />Fixado</span>}
            {!a.visto && <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-white">Novo</span>}
            {new Date(a.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          </p>
          <h2 className="font-semibold">{a.titulo}</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground/85">{a.texto}</p>
        </article>
      ))}
      {!avisos.length && <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-card p-10 text-center text-sm text-muted-foreground"><Megaphone className="size-8 text-muted-foreground/70" />Nenhum aviso no momento.</p>}
    </div>
  )
}
