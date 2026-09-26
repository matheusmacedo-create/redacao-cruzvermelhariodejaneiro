import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { WORKSPACE_STORAGE_LIMIT } from '@/lib/storage'
import { TIPOS_OTIMIZAVEIS } from '@/lib/midia/regras'
import { LibraryView } from './library-view'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/biblioteca') }
// "Otimizar fotos antigas" (app/actions/arquivos.ts) roda nesta página: cada rodada baixa, converte e regrava fotos.
export const maxDuration = 120

export default async function BibliotecaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase.from('files').select('id,name,file_type,content_type,size_bytes,status,authorization_status,tags,uploaded_by,created_at,storage_path,profiles!files_uploaded_by_fkey(full_name,initials,color)').eq('workspace_id', context.workspace.id).order('created_at', { ascending: false })
  const files = (data ?? []).map((file: any) => { const profile = Array.isArray(file.profiles) ? file.profiles[0] : file.profiles; return { id:file.id,name:file.name,kind:file.file_type,contentType:file.content_type,size:Number(file.size_bytes ?? 0),status:file.authorization_status || file.status,tags:file.tags ?? [],createdAt:file.created_at,storagePath:file.storage_path,author:{ name:profile?.full_name || 'Usuário',initials:profile?.initials || '?',color:profile?.color },canDelete:file.uploaded_by===context.user.id || pode(context.role, 'biblioteca.apagar_de_outros') } })
  const used = files.reduce((total, file) => total + file.size, 0)

  // Fotos enviadas antes de a Biblioteca otimizar na entrada. Consulta à parte:
  // se falhar (a coluna otimizado_em ainda não existe, por exemplo), o botão
  // só não aparece — a lista de arquivos não depende dela.
  const podeOtimizar = pode(context.role, 'biblioteca.apagar_de_outros')
  let fotosAntigas = { quantidade: 0, bytes: 0 }
  if (podeOtimizar) {
    const { data: antigas, error } = await supabase.from('files').select('size_bytes')
      .eq('workspace_id', context.workspace.id).neq('status', 'deleted').eq('file_type', 'foto')
      .is('otimizado_em', null).not('storage_path', 'is', null).in('content_type', [...TIPOS_OTIMIZAVEIS])
    if (!error && antigas) fotosAntigas = { quantidade: antigas.length, bytes: antigas.reduce((t, f) => t + Number(f.size_bytes ?? 0), 0) }
  }

  return <div><PageHeader title="Biblioteca de mídia" description="Arquivos privados compartilhados com a equipe do Palácio Virtual Cruz Vermelha Brasileira Rio de Janeiro." /><LibraryView initialFiles={files} usedBytes={used} limitBytes={WORKSPACE_STORAGE_LIMIT} workspaceId={context.workspace.id} fotosAntigas={fotosAntigas} podeOtimizar={podeOtimizar} /></div>
}
