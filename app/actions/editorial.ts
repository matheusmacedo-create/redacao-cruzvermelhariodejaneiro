'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

async function notifyPautaParticipants(params: {
  workspaceId: string
  pautaId: string | null
  actorId: string
  actorName: string
  contentTitle: string
  link: string
}) {
  if (!params.pautaId) return
  const supabase = await createClient()
  const [{ data: participantRows }, { data: pautaRow }] = await Promise.all([
    supabase.from('pauta_participants').select('user_id').eq('pauta_id', params.pautaId),
    supabase.from('pautas').select('owner_id,title').eq('id', params.pautaId).maybeSingle(),
  ])

  const recipientIds = new Set<string>((participantRows ?? []).map((row) => row.user_id))
  if (pautaRow?.owner_id) recipientIds.add(pautaRow.owner_id)
  recipientIds.delete(params.actorId)
  if (!recipientIds.size) return

  const rows = [...recipientIds].map((userId) => ({
    workspace_id: params.workspaceId,
    user_id: userId,
    title: 'Matéria enviada para aprovação',
    message: `${params.actorName} enviou "${params.contentTitle}" para aprovação${pautaRow?.title ? ` na pauta "${pautaRow.title}"` : ''}.`,
    link: params.link,
  }))

  const admin = createAdminClient()
  await admin.from('notifications').insert(rows)
}

export async function createPauta(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient()
  const title = text(formData, 'title'); if (title.length < 3) throw new Error('Título obrigatório.')
  const details = Object.fromEntries(['local','participantsCount','volunteersCount','story','contact','objective','result','audience','schedule','organizer','ideaGoal','materialType','request','notes'].map((key) => [key, text(formData, key)]).filter(([, value]) => value))
  const { data, error } = await supabase.from('pautas').insert({ workspace_id: context.workspace.id, title, description: text(formData,'description'), details, status: 'incoming', priority: text(formData,'priority') || 'medium', coordination: text(formData,'coordination'), due_date: text(formData,'dueDate') || null, created_by: context.user.id, owner_id: context.user.id, tags: [text(formData,'recordType') || 'Outro'] }).select('id').single()
  if (error) throw new Error(error.message)
  await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'created', entity_type: 'pauta', entity_id: data.id, metadata: { title } })
  const dueDate = text(formData, 'dueDate')
  if (dueDate) {
    await supabase.from('calendar_events').insert({ workspace_id: context.workspace.id, pauta_id: data.id, title, event_date: dueDate, type: 'atividade', created_by: context.user.id })
  }
  revalidatePath('/pautas'); revalidatePath('/calendario'); redirect(`/pautas/${data.id}`)
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
    if (status === 'approval') {
      const { data: approvalId, error } = await supabase.rpc('submit_pauta_for_approval', { p_pauta_id: id })
      if (error || !approvalId) throw new Error(error?.message || 'Não foi possível enviar a pauta para aprovação.')
    } else {
      const { data, error } = await supabase
        .from('pautas')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('workspace_id', context.workspace.id)
        .select('id')
        .single()
      if (error || !data) throw new Error('Pauta não encontrada neste espaço.')
    }
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
  revalidatePath('/projetos')
  revalidatePath('/aprovacoes')
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

export async function sendPautaMessage(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const pautaId = text(formData, 'pautaId')
  const body = text(formData, 'body')

  if (!pautaId || body.length < 1 || body.length > 5_000) {
    throw new Error('Escreva uma mensagem com até 5.000 caracteres.')
  }

  const { data: pauta } = await supabase
    .from('pautas')
    .select('id')
    .eq('id', pautaId)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (!pauta) throw new Error('Pauta não encontrada neste espaço.')

  const { error } = await supabase.from('messages').insert({
    workspace_id: context.workspace.id,
    pauta_id: pautaId,
    author_id: context.user.id,
    body,
  })
  if (error) throw new Error('Não foi possível enviar a mensagem.')

  await supabase.from('activity_log').insert({
    workspace_id: context.workspace.id,
    actor_id: context.user.id,
    action: 'message_sent',
    entity_type: 'pauta',
    entity_id: pautaId,
    metadata: {},
  })

  revalidatePath(`/pautas/${pautaId}`)
}

export async function saveContent(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const id = text(formData,'id')
  const title = text(formData,'title'); const body = text(formData,'body'); const subtitle = text(formData,'subtitle')
  const { data: current, error: readError } = await supabase.from('content_pieces').select('version').eq('id',id).eq('workspace_id',context.workspace.id).single()
  if (readError) throw new Error('Conteúdo não encontrado.')
  const version = current.version + 1
  const { error } = await supabase.from('content_pieces').update({ title, subtitle, body, version, updated_at: new Date().toISOString() }).eq('id',id).eq('workspace_id',context.workspace.id)
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
  const subtitle = text(formData, 'subtitle')
  const format = text(formData, 'format') || 'Matéria editorial'

  if (!id || title.length < 3 || body.length < 10) {
    throw new Error('Preencha o título e o conteúdo antes de enviar para aprovação.')
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  let contentId = id

  if (isUuid) {
    const { data: content, error: contentError } = await supabase
      .from('content_pieces')
      .update({ title, subtitle, body, updated_at: new Date().toISOString() })
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

  const { data: approvalId, error: submitError } = await supabase.rpc('submit_content_for_approval', { p_content_id: contentId })
  if (submitError || !approvalId) throw new Error(submitError?.message || 'Não foi possível enviar para aprovação.')

  const { data: contentRow } = await supabase.from('content_pieces').select('pauta_id').eq('id', contentId).maybeSingle()
  await notifyPautaParticipants({
    workspaceId: context.workspace.id,
    pautaId: contentRow?.pauta_id ?? null,
    actorId: context.user.id,
    actorName: context.profile?.full_name || 'Alguém da equipe',
    contentTitle: title,
    link: `/aprovacoes/${approvalId}`,
  })

  revalidatePath('/aprovacoes')
  revalidatePath(`/conteudos/${contentId}`)
  redirect(`/aprovacoes/${approvalId}`)
}

export async function archiveContentDraft(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')
  const title = text(formData, 'title')
  const body = text(formData, 'body')
  const subtitle = text(formData, 'subtitle')

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  if (!isUuid) throw new Error('Salve a matéria antes de arquivá-la.')

  const { data: current, error: readError } = await supabase.from('content_pieces').select('version').eq('id', id).eq('workspace_id', context.workspace.id).single()
  if (readError) throw new Error('Conteúdo não encontrado.')
  const version = current.version + 1

  const { error } = await supabase.from('content_pieces').update({ title, subtitle, body, version, status: 'archived', updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', context.workspace.id)
  if (error) throw new Error(error.message)
  await supabase.from('content_versions').insert({ content_id: id, version, title, body, author_id: context.user.id })
  await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'archived', entity_type: 'content_piece', entity_id: id, metadata: { title } })

  revalidatePath(`/conteudos/${id}`)
  revalidatePath('/pautas')
}

export async function createCalendarEvent(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const title = text(formData, 'title')
  const eventDate = text(formData, 'eventDate')
  const createIntegratedPauta = text(formData, 'createPauta') === 'on'
  if (title.length < 3 || !eventDate) throw new Error('Informe título e data do agendamento.')

  let pautaId: string | null = null
  if (createIntegratedPauta) {
    const { data: pauta, error: pautaError } = await supabase.from('pautas').insert({
      workspace_id: context.workspace.id,
      title,
      description: text(formData, 'description') || null,
      status: 'incoming',
      priority: text(formData, 'priority') || 'medium',
      coordination: text(formData, 'coordination') || null,
      due_date: eventDate,
      created_by: context.user.id,
      owner_id: context.user.id,
    }).select('id').single()
    if (pautaError || !pauta) throw new Error(pautaError?.message || 'Não foi possível criar a pauta integrada.')
    pautaId = pauta.id
  }

  const { error } = await supabase.from('calendar_events').insert({
    workspace_id: context.workspace.id,
    pauta_id: pautaId,
    title,
    event_date: eventDate,
    event_time: text(formData, 'eventTime') || null,
    type: text(formData, 'type') || 'publicacao',
    created_by: context.user.id,
  })
  if (error) {
    if (pautaId) await supabase.from('pautas').delete().eq('id', pautaId).eq('workspace_id', context.workspace.id)
    throw new Error(error.message)
  }
  revalidatePath('/calendario')
  revalidatePath('/pautas')
}

export async function addDriveLink(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient()
  const pautaId = text(formData, 'pautaId'); const rawUrl = text(formData, 'url'); const title = text(formData, 'name') || 'Link da pauta'
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('Informe uma URL válida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Informe um link HTTP ou HTTPS.')
  const { error } = await supabase.from('pauta_links').insert({ workspace_id: context.workspace.id, pauta_id: pautaId, title, url: url.toString(), category: text(formData, 'category') || 'arquivo', created_by: context.user.id })
  if (error) throw new Error(`Não foi possível salvar o link: ${error.message}`)
  revalidatePath(`/pautas/${pautaId}`)
}

export async function removeDriveLink(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const pautaId = text(formData, 'pautaId')
  const { error } = await supabase.from('pauta_links').delete().eq('id', text(formData, 'fileId')).eq('workspace_id', context.workspace.id)
  if (error) throw new Error('Não foi possível remover o link.')
  revalidatePath(`/pautas/${pautaId}`)
}

export async function createPautaContent(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const pautaId = text(formData, 'pautaId')
  const title = text(formData, 'title'); const body = text(formData, 'body'); const format = text(formData, 'format') || 'Link'
  if (title.length < 3) throw new Error('Informe o título do conteúdo.')
  const { data, error } = await supabase.from('content_pieces').insert({ workspace_id: context.workspace.id, pauta_id: pautaId, title, body, format, status: 'draft', responsible_id: context.user.id, created_by: context.user.id }).select('id').single()
  if (error || !data) throw new Error(error?.message || 'Não foi possível criar o conteúdo.')
  revalidatePath(`/pautas/${pautaId}`); redirect(`/conteudos/${data.id}`)
}

export async function createPautaApproval(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient(); const pautaId = text(formData, 'pautaId')
  let contentId = text(formData, 'contentId')
  if (!contentId) {
    const { data, error } = await supabase.from('content_pieces').insert({ workspace_id: context.workspace.id, pauta_id: pautaId, title: text(formData, 'title'), body: text(formData, 'body') || text(formData, 'url'), format: text(formData, 'format') || 'Conteúdo', status: 'review', responsible_id: context.user.id, created_by: context.user.id }).select('id').single()
    if (error || !data) throw new Error(error?.message || 'Não foi possível criar o caso.'); contentId = data.id
  }
  const { data: approvalId, error } = await supabase.rpc('submit_pauta_for_approval', { p_pauta_id: pautaId })
  if (error || !approvalId) throw new Error(error?.message || 'Não foi possível criar a aprovação.')
  revalidatePath(`/pautas/${pautaId}`); revalidatePath('/aprovacoes'); redirect(`/aprovacoes/${approvalId}`)
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

export async function createProject(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const name = text(formData, 'name')
  if (name.length < 3) throw new Error('Informe um nome com pelo menos 3 caracteres.')
  const { error } = await supabase.from('projects').insert({
    workspace_id: context.workspace.id,
    name,
    description: text(formData, 'description'),
    status: 'active',
    color: text(formData, 'color') || 'blue',
    created_by: context.user.id,
  })
  if (error) throw new Error('Não foi possível criar o projeto.')
  revalidatePath('/projetos')
}

export async function updateProfile(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const fullName = text(formData, 'fullName')
  if (fullName.length < 3) throw new Error('Informe seu nome completo.')
  const initials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const { data, error } = await supabase.from('profiles').update({
    full_name: fullName,
    job_title: text(formData, 'jobTitle'),
    initials,
    updated_at: new Date().toISOString(),
  }).eq('id', context.user.id).select('id').single()
  if (error || !data) throw new Error('Não foi possível atualizar o perfil. Tente novamente.')
  revalidatePath('/perfil')
}

export async function updatePassword(formData: FormData) {
  await requireWorkspace()
  const supabase = await createClient()
  const password = text(formData, 'password')
  const confirmation = text(formData, 'confirmation')
  if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.')
  if (password !== confirmation) throw new Error('As senhas não coincidem.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error('Não foi possível atualizar a senha.')
}

export async function decideApproval(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')
  const decision = text(formData, 'decision')
  const note = text(formData, 'note')
  if (!['approved', 'changes_requested'].includes(decision)) throw new Error('Selecione uma decisão.')
  if (decision === 'changes_requested' && !note) throw new Error('Explique quais ajustes são necessários.')
  const { data: approval } = await supabase.from('approvals').select('id').eq('id', id).eq('workspace_id', context.workspace.id).single()
  if (!approval) throw new Error('Aprovação não encontrada.')
  const { error: voteError } = await supabase.rpc('vote_on_approval', { p_approval_id: id, p_decision: decision, p_comment: note || null })
  if (voteError) throw new Error(voteError.message)
  await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: decision, entity_type: 'approval', entity_id: id, metadata: { note } })
  revalidatePath('/aprovacoes')
  revalidatePath(`/aprovacoes/${id}`)
  redirect('/aprovacoes')
}

export async function sendDirectMessage(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const recipientId = text(formData, 'recipientId')
  const body = text(formData, 'body')
  if (!recipientId || body.length < 1 || body.length > 2000) throw new Error('Escreva uma mensagem com até 2.000 caracteres.')
  if (recipientId === context.user.id) throw new Error('Selecione outra pessoa do espaço.')

  const { data: member } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', context.workspace.id).eq('user_id', recipientId).maybeSingle()
  if (!member) throw new Error('A pessoa selecionada não pertence a este espaço.')

  const admin = createAdminClient()
  const { error } = await admin.from('notifications').insert({
    workspace_id: context.workspace.id,
    user_id: recipientId,
    title: `Mensagem de ${context.profile?.full_name || 'um colega'}`,
    message: body,
    link: '/caixa-de-entrada',
  })
  if (error) throw new Error('Não foi possível enviar a mensagem.')

  revalidatePath('/caixa-de-entrada')
}
