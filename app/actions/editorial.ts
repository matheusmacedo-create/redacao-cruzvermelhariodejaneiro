'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export async function createPauta(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient()
  const title = text(formData, 'title'); if (title.length < 3) throw new Error('Título obrigatório.')
  const { data, error } = await supabase.from('pautas').insert({ workspace_id: context.workspace.id, title, description: text(formData,'description'), status: 'incoming', priority: text(formData,'priority') || 'medium', coordination: text(formData,'coordination'), due_date: text(formData,'dueDate') || null, created_by: context.user.id, owner_id: context.user.id, tags: text(formData,'tags').split(',').map((tag) => tag.trim()).filter(Boolean) }).select('id').single()
  if (error) throw new Error(error.message)
  await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'created', entity_type: 'pauta', entity_id: data.id, metadata: { title } })
  revalidatePath('/pautas'); redirect(`/pautas/${data.id}`)
}

export async function saveContent(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const id = text(formData,'id')
  const title = text(formData,'title'); const body = text(formData,'body')
  const { data: current, error: readError } = await supabase.from('content_pieces').select('version').eq('id',id).eq('workspace_id',context.workspace.id).single()
  if (readError) throw new Error('Conteúdo não encontrado.')
  const version = current.version + 1
  const { error } = await supabase.from('content_pieces').update({ title, body, version, updated_at: new Date().toISOString() }).eq('id',id).eq('workspace_id',context.workspace.id)
  if (error) throw new Error(error.message)
  await supabase.from('content_versions').insert({ content_id:id, version, title, body, author_id:context.user.id })
  revalidatePath(`/conteudos/${id}`)
}

export async function submitContentForApproval(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const id = text(formData,'id')
  const { data: existing } = await supabase.from('approvals').select('id').eq('content_id',id).eq('workspace_id',context.workspace.id).maybeSingle()
  if (!existing) {
    const { data: approval, error } = await supabase.from('approvals').insert({ workspace_id:context.workspace.id,content_id:id,requested_by:context.user.id }).select('id').single()
    if (error) throw new Error(error.message)
    await supabase.from('approval_steps').insert([{ approval_id:approval.id,step_order:1,label:'Revisão editorial' },{ approval_id:approval.id,step_order:2,label:'Aprovação final' }])
  }
  await supabase.from('content_pieces').update({ status:'review', updated_at:new Date().toISOString() }).eq('id',id).eq('workspace_id',context.workspace.id)
  revalidatePath('/aprovacoes'); revalidatePath(`/conteudos/${id}`)
}

export async function decideApproval(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const id=text(formData,'id'); const decision=text(formData,'decision'); const note=text(formData,'note')
  if (!['approved','changes_requested'].includes(decision)) throw new Error('Decisão inválida.')
  const { data: approval } = await supabase.from('approvals').select('content_id').eq('id',id).eq('workspace_id',context.workspace.id).single()
  if (!approval) throw new Error('Aprovação não encontrada.')
  await supabase.from('approvals').update({ status:decision,updated_at:new Date().toISOString() }).eq('id',id)
  await supabase.from('approval_steps').update({ status:decision === 'approved' ? 'aprovado' : 'reprovado', comment:note, decided_at:new Date().toISOString(), reviewer_id:context.user.id }).eq('approval_id',id).eq('step_order',1)
  await supabase.from('content_pieces').update({ status:decision === 'approved' ? 'approved' : 'draft' }).eq('id',approval.content_id)
  revalidatePath('/aprovacoes'); revalidatePath(`/aprovacoes/${id}`)
}
