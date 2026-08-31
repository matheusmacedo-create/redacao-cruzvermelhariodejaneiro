import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PacoteHub } from '@/components/app/hub/hub'
import { iaConfigurada } from '@/lib/ia/openai'
import { garantirBaseNoSite } from '@/app/actions/pacotes'
import type { DestinoRegistro, PacoteRegistro } from '@/components/app/hub/tipos'

const paraLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  // datetime-local não entende timezone: converte para o horário de Brasília.
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

export default async function PacotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: linha } = await supabase
    .from('social_packages')
    .select('id,titulo_interno,origem_tipo,status,agendar_para,mestre,mestre_file_ids')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!linha) notFound()

  // A base é a notícia no site. Garantir aqui, e não só na criação, é o que
  // dá a base aos pacotes que nasceram antes desta mudança — sem migração de
  // dados e sem ninguém precisar recriá-los.
  await garantirBaseNoSite(id, context.workspace.id)

  const { data: destinosLinhas } = await supabase
    .from('package_destinations')
    .select('id,canal,formato,corpo,extras,file_ids,crops,descolada,estado,agendar_para,erro,external_url')
    .eq('package_id', id).eq('workspace_id', context.workspace.id)
    .order('created_at')

  const m = (linha.mestre ?? {}) as Record<string, string>
  const pacote: PacoteRegistro = {
    id: linha.id,
    tituloInterno: linha.titulo_interno ?? '',
    origemTipo: linha.origem_tipo,
    status: linha.status,
    agendarPara: paraLocal(linha.agendar_para),
    mestre: {
      corpo: m.corpo ?? '',
      titulo: m.titulo ?? '',
      subtitulo: m.subtitulo ?? '',
      linkUrl: m.linkUrl ?? '',
      slug: m.slug ?? '',
      notas: m.notas ?? '',
    },
    fileIds: linha.mestre_file_ids ?? [],
  }

  const destinos: DestinoRegistro[] = (destinosLinhas ?? []).map((d) => ({
    id: d.id,
    canal: d.canal,
    formato: d.formato,
    corpo: d.corpo ?? '',
    extras: (d.extras ?? {}) as Record<string, string>,
    fileIds: d.file_ids ?? [],
    crops: (d.crops ?? {}) as DestinoRegistro['crops'],
    descolada: Boolean(d.descolada),
    estado: d.estado,
    agendarPara: paraLocal(d.agendar_para),
    erro: d.erro,
    externalUrl: d.external_url,
  }))

  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('user_id,profiles(id,full_name,initials,color,active)')
    .eq('workspace_id', context.workspace.id)
  const pessoas = (memberRows ?? [])
    .map((m: any) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles))
    .filter((p: any) => p && p.active !== false && p.id !== context.user.id)
    .map((p: any) => ({ id: p.id, nome: p.full_name, iniciais: p.initials || '?', cor: p.color }))

  return <PacoteHub pacote={pacote} destinos={destinos} pessoas={pessoas} workspaceId={context.workspace.id} iaDisponivel={iaConfigurada()} />
}
