import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { NovaColeta } from './nova-coleta'

export const metadata = { title: 'Pedir autorização de imagem' }

/** Escolher as fotos de uma ação e gerar o link. Chega com ?arquivos= quando vem da seleção na Biblioteca. */
export default async function NovaColetaPage({ searchParams }: { searchParams: Promise<{ arquivos?: string }> }) {
  const context = await requireWorkspace()
  const { arquivos } = await searchParams
  const supabase = await createClient()
  const { data } = await supabase.from('files').select('id, name, file_type, storage_path, tags, created_at, authorization_status')
    .eq('workspace_id', context.workspace.id).in('file_type', ['foto', 'video']).neq('status', 'deleted').neq('authorization_status', 'internal')
    .order('created_at', { ascending: false }).limit(300)
  const fotos = (data ?? []).map((f) => ({
    id: f.id as string, nome: f.name as string, tipo: f.file_type as string, caminho: f.storage_path as string | null,
    pasta: ((f.tags as string[]) ?? []).find((t) => t.startsWith('pasta:'))?.slice(6) ?? null, pendente: f.authorization_status === 'pending',
  }))
  const escolhidas = (arquivos ?? '').split(',').filter((id) => fotos.some((f) => f.id === id))
  return (
    <div>
      <PageHeader
        title="Pedir autorização de imagem"
        description="Escolha as fotos da ação e gere o link. Quem aparece nelas abre no celular, vê as fotos e assina."
        breadcrumbs={[{ label: 'Biblioteca de mídia', href: '/biblioteca' }, { label: 'Autorizações de imagem', href: '/biblioteca/autorizacoes' }, { label: 'Pedir autorização' }]}
      />
      <NovaColeta fotos={fotos} escolhidasDeInicio={escolhidas} />
    </div>
  )
}
