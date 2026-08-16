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

export async function updatePautaStatus(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')
  const status = text(formData, 'status')
  const allowedStatuses = ['incoming', 'collection', 'production', 'review', 'approval', 'approved', 'archived']

  if (!allowedStatuses.includes(status)) throw new Error('Status inválido.')

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  let pautaId = id

  if (isUuid) {
    const { data, error } = await supabase
      .from('pautas')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', context.workspace.id)
      .select('id')
      .single()
    if (error || !data) throw new Error('Pauta não encontrada neste espaço.')
  } else {
    const { data, error } = await supabase
      .from('pautas')
      .insert({
        workspace_id: context.workspace.id,
        title: text(formData, 'title'),
        description: text(formData, 'description'),
        status,
        priority: text(formData, 'priority') || 'medium',
        coordination: text(formData, 'coordination'),
        created_by: context.user.id,
        owner_id: context.user.id,
        tags: [text(formData, 'project')].filter(Boolean),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message || 'Não foi possível atualizar a pauta.')
    pautaId = data.id
  }

  await supabase.from('activity_log').insert({
    workspace_id: context.workspace.id,
    actor_id: context.user.id,
    action: 'status_changed',
    entity_type: 'pauta',
    entity_id: pautaId,
    metadata: { status },
  })

  revalidatePath('/pautas')
  revalidatePath(`/pautas/${pautaId}`)
  if (!isUuid) redirect(`/pautas/${pautaId}`)
}

export async function addPautaParticipant(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const pautaId = text(formData, 'pautaId')
  const userId = text(formData, 'userId')

  if (!pautaId || !userId) throw new Error('Selecione uma pessoa para adicionar.')

  const { data: pauta } = await supabase
    .from('pautas')
    .select('id')
    .eq('id', pautaId)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (!pauta) throw new Error('Pauta não encontrada neste espaço.')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', context.workspace.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!member) throw new Error('A pessoa selecionada não pertence a este espaço.')

  const { error } = await supabase
    .from('pauta_participants')
    .upsert({ pauta_id: pautaId, user_id: userId }, { onConflict: 'pauta_id,user_id', ignoreDuplicates: true })
  if (error) throw new Error('Não foi possível adicionar o participante.')

  await supabase.from('activity_log').insert({
    workspace_id: context.workspace.id,
    actor_id: context.user.id,
    action: 'participant_added',
    entity_type: 'pauta',
    entity_id: pautaId,
    metadata: { user_id: userId },
  })

  revalidatePath(`/pautas/${pautaId}`)
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
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')
  const title = text(formData, 'title')
  const body = text(formData, 'body')
  const format = text(formData, 'format') || 'Matéria editorial'

  if (!id || title.length < 3 || body.length < 10) {
    throw new Error('Preencha o título e o conteúdo antes de enviar para aprovação.')
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  let contentId = id

  if (isUuid) {
    const { data: content, error: contentError } = await supabase
      .from('content_pieces')
      .update({ title, body, status: 'review', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', context.workspace.id)
      .select('id')
      .single()
    if (contentError || !content) throw new Error('Conteúdo não encontrado neste espaço.')
  } else {
    const { data: created, error: createError } = await supabase
      .from('content_pieces')
      .insert({
        workspace_id: context.workspace.id,
        title,
        body,
        format,
        status: 'review',
        responsible_id: context.user.id,
        created_by: context.user.id,
      })
      .select('id')
      .single()
    if (createError || !created) throw new Error(createError?.message || 'Não foi possível salvar o conteúdo.')
    contentId = created.id
  }

  const { data: existing, error: existingError } = await supabase
    .from('approvals')
    .select('id')
    .eq('content_id', contentId)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)

  let approvalId = existing?.id
  if (!approvalId) {
    const { data: approval, error } = await supabase
      .from('approvals')
      .insert({ workspace_id: context.workspace.id, content_id: contentId, requested_by: context.user.id })
      .select('id')
      .single()
    if (error || !approval) throw new Error(error?.message || 'Não foi possível criar a aprovação.')
    approvalId = approval.id

    const { error: stepsError } = await supabase.from('approval_steps').insert([
      { approval_id: approvalId, step_order: 1, label: 'Revisão editorial' },
      { approval_id: approvalId, step_order: 2, label: 'Aprovação final' },
    ])
    if (stepsError) throw new Error(stepsError.message)
  }

  revalidatePath('/aprovacoes')
  revalidatePath(`/conteudos/${contentId}`)
  redirect(`/aprovacoes/${approvalId}`)
}

export async function createCalendarEvent(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient()
  const title = text(formData, 'title'); const eventDate = text(formData, 'eventDate')
  if (title.length < 3 || !eventDate) throw new Error('Informe título e data do agendamento.')
  const { error } = await supabase.from('calendar_events').insert({
    workspace_id: context.workspace.id,
    title,
    event_date: eventDate,
    event_time: text(formData, 'eventTime') || null,
    type: text(formData, 'type') || 'publicacao',
    created_by: context.user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/calendario')
}

export async function archiveInboxItem(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const id = text(formData, 'id')
  const { error } = await supabase.from('inbox_items').update({ status: 'archived' }).eq('id', id).eq('workspace_id', context.workspace.id)
  if (error) throw new Error(error.message)
  revalidatePath('/caixa-de-entrada')
}

export async function convertInboxToPauta(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const id = text(formData, 'id')
  const { data: item, error: readError } = await supabase.from('inbox_items').select('*').eq('id', id).eq('workspace_id', context.workspace.id).single()
  if (readError || !item) throw new Error('Item da caixa de entrada não encontrado.')
  const { data: pauta, error } = await supabase.from('pautas').insert({
    workspace_id: context.workspace.id,
    title: item.title,
    description: item.summary,
    status: 'incoming',
    priority: item.priority || 'medium',
    coordination: item.coordination,
    created_by: context.user.id,
    owner_id: context.user.id,
    tags: [item.type].filter(Boolean),
  }).select('id').single()
  if (error) throw new Error(error.message)
  await supabase.from('inbox_items').update({ status: 'converted' }).eq('id', id).eq('workspace_id', context.workspace.id)
  revalidatePath('/caixa-de-entrada'); revalidatePath('/pautas'); redirect(`/pautas/${pauta.id}`)
}

export async function addContentComment(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const contentId = text(formData, 'contentId')
  const body = text(formData, 'body')

  if (!contentId || body.length < 1 || body.length > 2000) {
    throw new Error('Escreva um comentário com até 2.000 caracteres.')
  }

  const { error } = await supabase.from('content_comments').insert({
    workspace_id: context.workspace.id,
    content_id: contentId,
    author_id: context.user.id,
    body,
  })
  if (error) throw new Error('Não foi possível adicionar o comentário.')

  revalidatePath(`/conteudos/${contentId}`)
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
