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
        <p className="text-sm text-neutral-600">Recados da coordenação para todos os voluntários.</p>
      </div>
      {avisos.map((a) => (
        <article key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
            {a.fixado && <span className="flex items-center gap-1 font-medium text-[#e32219]"><Pin className="size-3" />Fixado</span>}
            {!a.visto && <span className="rounded-full bg-[#e32219] px-2 py-0.5 font-semibold text-white">Novo</span>}
            {new Date(a.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          </p>
          <h2 className="font-semibold">{a.titulo}</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{a.texto}</p>
        </article>
      ))}
      {!avisos.length && <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500"><Megaphone className="size-8 text-neutral-400" />Nenhum aviso no momento.</p>}
    </div>
  )
}
