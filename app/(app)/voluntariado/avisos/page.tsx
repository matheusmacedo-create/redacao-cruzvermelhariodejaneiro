import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { ordenarAvisos } from '@/lib/canal/regras'
import { Mural, type AvisoNaEquipe } from '@/components/app/canal/acoes'

export const dynamic = 'force-dynamic'

/** O mural da Área do Voluntário: recados para todos os voluntários ativos. */
export default async function AvisosAosVoluntarios() {
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const [{ data: avisos }, { count: ativos }] = await Promise.all([
    supabase.from('membro_avisos').select('id,titulo,texto,fixado,expira_em,created_at').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(200),
    supabase.from('participantes').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('situacao', 'ativo').is('anonimizado_em', null),
  ])
  const ids = (avisos ?? []).map((a) => a.id as string)
  const { data: vistos } = ids.length ? await supabase.rpc('contar_avisos_vistos', { p_avisos: ids }) : { data: [] }
  const porAviso = new Map(((vistos ?? []) as { aviso_id: string; vistos: number }[]).map((v) => [v.aviso_id, Number(v.vistos)]))
  return (
    <div className="flex flex-col gap-6">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntariado</Link>
      <PageHeader title="Avisos aos voluntários" description="Aparecem no início da Área do Voluntário, com a marca de novo até cada um ver. Fixe o que for importante; programe a saída do mural." />
      <Card className="p-5">
        <Mural hoje={hojeEmSaoPaulo()} total={ativos ?? 0}
          avisos={ordenarAvisos((avisos ?? []).map((a) => ({ ...(a as Omit<AvisoNaEquipe, 'vistos'>), vistos: porAviso.get(a.id as string) ?? 0 })))} />
      </Card>
    </div>
  )
}
