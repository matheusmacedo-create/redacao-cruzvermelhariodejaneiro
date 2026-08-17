import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { WORKSPACE_STORAGE_LIMIT } from '@/lib/storage'
import { LibraryView } from './library-view'

export default async function BibliotecaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase.from('files').select('id,name,file_type,content_type,size_bytes,status,authorization_status,tags,uploaded_by,created_at,storage_path,profiles!files_uploaded_by_fkey(full_name,initials,color)').eq('workspace_id', context.workspace.id).order('created_at', { ascending: false })
  const files = (data ?? []).map((file: any) => { const profile = Array.isArray(file.profiles) ? file.profiles[0] : file.profiles; return { id:file.id,name:file.name,kind:file.file_type,contentType:file.content_type,size:Number(file.size_bytes ?? 0),status:file.authorization_status || file.status,tags:file.tags ?? [],createdAt:file.created_at,storagePath:file.storage_path,author:{ name:profile?.full_name || 'Usuário',initials:profile?.initials || '?',color:profile?.color },canDelete:file.uploaded_by===context.user.id || ['admin','editor'].includes(context.role) } })
  const used = files.reduce((total, file) => total + file.size, 0)
  return <div><PageHeader title="Biblioteca" description="Arquivos privados compartilhados com a equipe da Redação Cruz Vermelha Brasileira Rio de Janeiro." /><LibraryView initialFiles={files} usedBytes={used} limitBytes={WORKSPACE_STORAGE_LIMIT} /></div>
}
