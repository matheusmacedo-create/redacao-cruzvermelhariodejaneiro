'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { STATUS_DA_PAUTA } from '@/lib/editorial/status'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoParaComunicacao, publicacoesPrevistas } from '@/lib/editorial/publicacoes-previstas'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

/**
 * Quem deve aprovar este conteúdo.
 *
 * Junta duas origens: as pessoas escolhidas na tela e os participantes da
 * pauta. Tira de fora quem escreveu, quem responde pelo conteúdo e quem está
 * enviando — ninguém aprova o próprio texto.
 *
 * Os ids escolhidos chegam pelo formulário, então são conferidos contra a
 * lista de membros do espaço antes de virarem convite.
 */
async function revisoresDesejados(params: { contentId: string; actorId: string; workspaceId: string; escolhidos: string[] }) {
  const supabase = await createClient()
  const { data: contentRow } = await supabase
    .from('content_pieces').select('pauta_id,responsible_id,created_by')
    .eq('id', params.contentId).maybeSingle()

  const excluidos = new Set([contentRow?.responsible_id, contentRow?.created_by, params.actorId].filter(Boolean) as string[])

  const escolhidos = [...new Set(params.escolhidos)].filter(Boolean)
  let validos: string[] = []
  if (escolhidos.length) {
    const { data: membros } = await supabase
      .from('workspace_members').select('user_id')
      .eq('workspace_id', params.workspaceId).in('user_id', escolhidos)
    validos = (membros ?? []).map((m) => m.user_id)
  }

  const daPauta = contentRow?.pauta_id
    ? (await supabase.from('pauta_participants').select('user_id').eq('pauta_id', contentRow.pauta_id)).data ?? []
    : []

  const desejados = new Set([...validos, ...daPauta.map((row) => row.user_id)].filter((id) => !excluidos.has(id)))

  // Escolheu gente, mas toda ela caiu na exclusão: dizer "escolha alguém" seria
  // mentira, porque a pessoa escolheu.
  if (!desejados.size && escolhidos.length) {
    throw new Error('Quem escreve e quem responde pelo conteúdo não entra na própria aprovação. Escolha outra pessoa para revisar.')
  }
  if (!desejados.size) {
    throw new Error('Escolha pelo menos uma pessoa para revisar antes de enviar para aprovação.')
  }

  return [...desejados]
}

/**
 * Acerta a lista de votantes de uma aprovação e devolve quem entrou agora —
 * são essas as pessoas que precisam ser avisadas.
 *
 * Só remove quem ainda não decidiu: voto registrado é histórico, não some
 * porque alguém saiu da pauta depois.
 */
async function syncApprovalVoters(params: { approvalId: string; workspaceId: string; desejados: string[] }) {
  const supabase = await createClient()
  const desired = new Set(params.desejados)
  const { data: voterRows } = await supabase.from('approval_voters').select('id,user_id,decision').eq('approval_id', params.approvalId)
  const admin = createAdminClient()

  const toRemove = (voterRows ?? []).filter((voter) => voter.decision === 'pending' && !desired.has(voter.user_id)).map((voter) => voter.id)
  if (toRemove.length) await admin.from('approval_voters').delete().in('id', toRemove)

  const existingIds = new Set((voterRows ?? []).map((voter) => voter.user_id))
  const toAdd = [...desired].filter((id) => !existingIds.has(id))
  if (toAdd.length) {
    const { error } = await admin.from('approval_voters').insert(toAdd.map((user_id) => ({ approval_id: params.approvalId, workspace_id: params.workspaceId, user_id })))
    if (error) throw new Error('Não foi possível registrar quem precisa aprovar.')
  }
  return toAdd
}

/** Avisa quem acabou de ser convidado a aprovar. Sem isso o convite fica só na tela de quem pediu. */
async function avisarRevisores(params: { userIds: string[]; workspaceId: string; approvalId: string; titulo: string; quem: string }) {
  if (!params.userIds.length) return
  const admin = createAdminClient()
  await admin.from('notifications').insert(params.userIds.map((user_id) => ({
    workspace_id: params.workspaceId,
    user_id,
    title: `${params.quem} pediu sua aprovação`,
    message: params.titulo,
    link: `/aprovacoes/${params.approvalId}`,
  })))
}

export async function createPauta(formData: FormData) {
  const context = await requireWorkspace(); const supabase = await createClient()
  const title = text(formData, 'title'); if (title.length < 3) throw new Error('Título obrigatório.')
  const details = Object.fromEntries(['local','participantsCount','volunteersCount','story','contact','objective','result','audience','schedule','organizer','ideaGoal','materialType','request','notes'].map((key) => [key, text(formData, key)]).filter(([, value]) => value))
  const description = text(formData, 'description')
  // Conferido antes de gravar: data errada numa publicação não pode deixar
  // uma pauta órfã para trás.
  const previstas = publicacoesPrevistas(formData, title)
  const projectId = text(formData, 'projectId')
  let validProjectId: string | null = null
  if (projectId) {
    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('workspace_id', context.workspace.id).maybeSingle()
    validProjectId = project?.id ?? null
  }
  const { data, error } = await supabase.from('pautas').insert({ workspace_id: context.workspace.id, project_id: validProjectId, title, description, details, status: 'incoming', priority: text(formData,'priority') || 'medium', coordination: text(formData,'coordination'), due_date: text(formData,'dueDate') || null, created_by: context.user.id, owner_id: context.user.id, tags: [text(formData,'recordType') || 'Outro'] }).select('id').single()
  if (error) throw new Error(error.message)

  if (previstas.length) {
    // Cada publicação prevista nasce como peça de conteúdo em rascunho, com o
    // contexto do registro já dentro dela, e como data no calendário apontando
    // para essa peça. É o caminho que o Marketing percorre para aprovar: abre
    // a data, lê o contexto, aprova — sem caçar quem pediu.
    const contexto = contextoParaComunicacao(description, details as Record<string, string>)
    try {
      for (const prevista of previstas) {
        const { data: peca, error: pecaError } = await supabase.from('content_pieces').insert({
          workspace_id: context.workspace.id,
          pauta_id: data.id,
          title: prevista.assunto,
          body: contexto,
          format: prevista.canal,
          status: 'draft',
          created_by: context.user.id,
        }).select('id').single()
        if (pecaError || !peca) throw new Error(pecaError?.message || 'Não foi possível criar o conteúdo da publicação.')

        const { error: eventoError } = await supabase.from('calendar_events').insert({
          workspace_id: context.workspace.id,
          pauta_id: data.id,
          content_id: peca.id,
          title: prevista.assunto,
          event_date: prevista.data,
          event_time: prevista.hora,
          type: 'publicacao',
          channel: prevista.canal,
          created_by: context.user.id,
        })
        if (eventoError) throw new Error(eventoError.message)
      }
    } catch (causa) {
      // Some a pauta inteira: em cascata levam-se conteúdos e eventos já
      // criados. Meia agenda de pé é pior do que agenda nenhuma, porque
      // ninguém percebe o que ficou faltando.
      await supabase.from('pautas').delete().eq('id', data.id).eq('workspace_id', context.workspace.id)
      throw causa instanceof Error ? causa : new Error('Não foi possível agendar as publicações previstas.')
    }
  }

  await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'created', entity_type: 'pauta', entity_id: data.id, metadata: { title, publicacoes: previstas.length } })
  const dueDate = text(formData, 'dueDate')
  if (dueDate) {
    await supabase.from('calendar_events').insert({ workspace_id: context.workspace.id, pauta_id: data.id, title, event_date: dueDate, type: 'atividade', created_by: context.user.id })
  }
  revalidatePath('/pautas'); revalidatePath('/calendario'); redirect(`/pautas/${data.id}`)
}

export async function changePautaProject(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')
  const projectId = text(formData, 'projectId')

  let validProjectId: string | null = null
  if (projectId) {
    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!project) throw new Error('Projeto não encontrado neste espaço.')
    validProjectId = project.id
  }

  const { data, error } = await supabase.from('pautas').update({ project_id: validProjectId, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', context.workspace.id).select('id').single()
  if (error || !data) throw new Error('Não foi possível atualizar o projeto desta pauta.')

  await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'status_changed', entity_type: 'pauta', entity_id: id, metadata: { field: 'project', projectId: validProjectId } })

  revalidatePath(`/pautas/${id}`)
  revalidatePath('/projetos')
}

export async function deletePauta(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')

  const { data: pauta } = await supabase.from('pautas').select('id,title,created_by,owner_id').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!pauta) throw new Error('Pauta não encontrada.')
  if (context.role !== 'admin' && pauta.created_by !== context.user.id && pauta.owner_id !== context.user.id) {
    throw new Error('Somente quem criou a pauta, o responsável ou um administrador pode excluí-la.')
  }

  const admin = createAdminClient()

  const { data: contentRows } = await admin.from('content_pieces').select('id').eq('pauta_id', id).eq('workspace_id', context.workspace.id)
  const contentIds = (contentRows ?? []).map((c) => c.id)

  if (contentIds.length) {
    const { data: approvalRows } = await admin.from('approvals').select('id').in('content_id', contentIds)
    const approvalIds = (approvalRows ?? []).map((a) => a.id)
    if (approvalIds.length) await admin.from('approval_voters').delete().in('approval_id', approvalIds)
    await admin.from('approvals').delete().in('content_id', contentIds)
    await admin.from('content_comments').delete().in('content_id', contentIds)
    await admin.from('content_versions').delete().in('content_id', contentIds)
  }

  await admin.from('pauta_participants').delete().eq('pauta_id', id)
  await admin.from('messages').delete().eq('pauta_id', id).eq('workspace_id', context.workspace.id)
  await admin.from('calendar_events').delete().eq('pauta_id', id).eq('workspace_id', context.workspace.id)
  await admin.from('pauta_links').delete().eq('pauta_id', id).eq('workspace_id', context.workspace.id)
  await admin.from('content_pieces').delete().eq('pauta_id', id).eq('workspace_id', context.workspace.id)
  await admin.from('activity_log').delete().eq('entity_type', 'pauta').eq('entity_id', id).eq('workspace_id', context.workspace.id)

  const { error } = await admin.from('pautas').delete().eq('id', id).eq('workspace_id', context.workspace.id)
  if (error) throw new Error('Não foi possível excluir a pauta.')

  revalidatePath('/pautas')
  revalidatePath('/calendario')
  revalidatePath('/projetos')
  redirect('/pautas')
}

/**
 * Reescreve a descrição de uma pauta.
 *
 * Antes disso a descrição só podia ser escrita uma vez, no formulário de
 * registro, e nunca mais. Quem lia um "PENDENCIA: preencher a data da proxima
 * turma" não tinha como preencher a data nem como tirar o recado depois de
 * resolvido — o aviso ficava na tela para sempre, e um aviso que não sai
 * ensina todo mundo a ignorar aviso.
 *
 * Qualquer pessoa do espaço edita, como já acontece com o status: o briefing é
 * trabalho de mais de uma cabeça. Quem editou fica no histórico da pauta.
 */
export async function atualizarDescricaoDaPauta(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')
  const descricao = String(formData.get('description') ?? '').trim()

  if (!id) throw new Error('Pauta não informada.')
  if (descricao.length > 20_000) throw new Error('A descrição passou de 20.000 caracteres.')

  const { data, error } = await supabase
    .from('pautas')
    .update({ description: descricao, updated_at: new Date().toISOString() })
    .eq('id', id).eq('workspace_id', context.workspace.id)
    .select('id,title')
    .single()
  if (error || !data) throw new Error('Pauta não encontrada neste espaço.')

  await supabase.from('activity_log').insert({
    workspace_id: context.workspace.id,
    actor_id: context.user.id,
    action: 'description_updated',
    entity_type: 'pauta',
    entity_id: id,
    metadata: { title: data.title },
  })

  revalidatePath(`/pautas/${id}`)
}

export async function updatePautaStatus(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')
  const status = text(formData, 'status')
  const allowedStatuses: readonly string[] = STATUS_DA_PAUTA

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

export async function removePautaParticipant(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const pautaId = text(formData, 'pautaId')
  const userId = text(formData, 'userId')

  if (!pautaId || !userId) throw new Error('Selecione uma pessoa para remover.')

  const { data: pauta } = await supabase
    .from('pautas')
    .select('id')
    .eq('id', pautaId)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (!pauta) throw new Error('Pauta não encontrada neste espaço.')

  const { error } = await supabase
    .from('pauta_participants')
    .delete()
    .eq('pauta_id', pautaId)
    .eq('user_id', userId)
  if (error) throw new Error('Não foi possível remover o participante.')

  await supabase.from('activity_log').insert({
    workspace_id: context.workspace.id,
    actor_id: context.user.id,
    action: 'participant_removed',
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

  const { data: duplicate } = await supabase
    .from('messages')
    .select('id')
    .eq('pauta_id', pautaId)
    .eq('author_id', context.user.id)
    .eq('body', body)
    .gte('created_at', new Date(Date.now() - 10_000).toISOString())
    .limit(1)
    .maybeSingle()
  if (duplicate) { revalidatePath(`/pautas/${pautaId}`); return }

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

/**
 * As falhas esperadas voltam como valor, não como exceção: o Next apaga a
 * mensagem de uma exceção de server action em produção, e a tela recebe só o
 * "Minified React error #441" — foi o que escondeu, de quem enviava, o recado
 * "escolha pelo menos uma pessoa para revisar".
 */
export async function submitContentForApproval(formData: FormData): Promise<{ approvalId?: string; erro?: string }> {
  try {
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

  // Resolvido antes da RPC: uma aprovação sem ninguém convidado fica pendente
  // para sempre, e a tela ainda mostra "0/0 — todas as pessoas já decidiram".
  // Melhor recusar o envio do que criar uma rodada que nunca fecha.
  const desejados = await revisoresDesejados({
    contentId,
    actorId: context.user.id,
    workspaceId: context.workspace.id,
    escolhidos: formData.getAll('aprovadores').map((valor) => String(valor)),
  })

  const { data: approvalId, error: submitError } = await supabase.rpc('submit_content_for_approval', { p_content_id: contentId })
  if (submitError || !approvalId) throw new Error(submitError?.message || 'Não foi possível enviar para aprovação.')

  const novos = await syncApprovalVoters({ approvalId, workspaceId: context.workspace.id, desejados })
  await avisarRevisores({
    userIds: novos,
    workspaceId: context.workspace.id,
    approvalId,
    titulo: title,
    quem: context.profile?.full_name || 'Um colega',
  })

  revalidatePath('/aprovacoes')
  revalidatePath(`/aprovacoes/${approvalId}`)
  revalidatePath(`/conteudos/${contentId}`)
  return { approvalId }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar para aprovação.') }
  }
}

/**
 * Convida mais gente para uma aprovação já aberta.
 *
 * Existe porque a rodada pode ter nascido sem votante — foi o que aconteceu com
 * as aprovações criadas antes desta conferência — e porque revisor a mais é uma
 * decisão normal no meio do caminho. Só quem pediu a aprovação, ou um
 * administrador, convida.
 */
export async function adicionarRevisores(formData: FormData): Promise<{ erro?: string }> {
  try {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const approvalId = text(formData, 'approvalId')

  const { data: approval } = await supabase
    .from('approvals').select('id,status,content_id,requested_by')
    .eq('id', approvalId).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!approval) throw new Error('Aprovação não encontrada.')
  if (approval.status !== 'pending') throw new Error('Esta rodada já foi encerrada.')
  if (approval.requested_by !== context.user.id && context.role !== 'admin') {
    throw new Error('Só quem pediu a aprovação pode convidar mais pessoas.')
  }

  const escolhidos = [...new Set(formData.getAll('aprovadores').map((valor) => String(valor)).filter(Boolean))]
  if (!escolhidos.length) throw new Error('Escolha quem mais precisa aprovar.')

  const { data: membros } = await supabase
    .from('workspace_members').select('user_id')
    .eq('workspace_id', context.workspace.id).in('user_id', escolhidos)
  const validos = (membros ?? []).map((m) => m.user_id).filter((id) => id !== context.user.id)
  if (!validos.length) throw new Error('Nenhuma das pessoas escolhidas pertence a este espaço.')

  // Só acrescenta. Quem já está na rodada continua, tenha votado ou não.
  const { data: jaConvidados } = await supabase
    .from('approval_voters').select('user_id').eq('approval_id', approvalId)
  const existentes = new Set((jaConvidados ?? []).map((v) => v.user_id))
  const novos = validos.filter((id) => !existentes.has(id))
  if (!novos.length) throw new Error('Essas pessoas já estão nesta aprovação.')

  const admin = createAdminClient()
  const { error } = await admin.from('approval_voters').insert(
    novos.map((user_id) => ({ approval_id: approvalId, workspace_id: context.workspace.id, user_id })),
  )
  if (error) throw new Error('Não foi possível convidar essas pessoas.')

  const { data: peca } = await supabase
    .from('content_pieces').select('title').eq('id', approval.content_id).maybeSingle()

  await avisarRevisores({
    userIds: novos,
    workspaceId: context.workspace.id,
    approvalId,
    titulo: peca?.title || 'Conteúdo editorial',
    quem: context.profile?.full_name || 'Um colega',
  })

  revalidatePath('/aprovacoes')
  revalidatePath(`/aprovacoes/${approvalId}`)
  return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível convidar.') }
  }
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
  const context = await requireWorkspace()
  const supabase = await createClient()
  const pautaId = text(formData, 'pautaId')
  let contentId = text(formData, 'contentId')

  if (contentId) {
    // Conferido porque o id vem do formulário: um conteúdo de outro espaço, ou
    // de outra pauta, não entra na aprovação desta.
    const { data: existente } = await supabase
      .from('content_pieces').select('id')
      .eq('id', contentId).eq('pauta_id', pautaId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!existente) throw new Error('Conteúdo não encontrado nesta pauta.')
  } else {
    const titulo = text(formData, 'title')
    if (titulo.length < 3) throw new Error('Informe o título do caso.')
    const { data, error } = await supabase.from('content_pieces').insert({
      workspace_id: context.workspace.id,
      pauta_id: pautaId,
      title: titulo,
      body: text(formData, 'body') || text(formData, 'url'),
      format: text(formData, 'format') || 'Conteúdo',
      status: 'review',
      responsible_id: context.user.id,
      created_by: context.user.id,
    }).select('id').single()
    if (error || !data) throw new Error(error?.message || 'Não foi possível criar o caso.')
    contentId = data.id
  }

  // Antes de criar a rodada, porque rodada sem votante fica pendente para
  // sempre — e era exatamente o que este caminho produzia: ele nunca convidou
  // ninguém.
  const desejados = await revisoresDesejados({
    contentId,
    actorId: context.user.id,
    workspaceId: context.workspace.id,
    escolhidos: formData.getAll('aprovadores').map((valor) => String(valor)),
  })

  // submit_content_for_approval, e não submit_pauta_for_approval: aquela pega o
  // conteúdo mais recente da pauta e ignorava o que a pessoa escolheu na tela.
  const { data: approvalId, error } = await supabase.rpc('submit_content_for_approval', { p_content_id: contentId })
  if (error || !approvalId) throw new Error(error?.message || 'Não foi possível criar a aprovação.')

  await supabase.from('pautas').update({ status: 'approval', updated_at: new Date().toISOString() })
    .eq('id', pautaId).eq('workspace_id', context.workspace.id)

  const novos = await syncApprovalVoters({ approvalId, workspaceId: context.workspace.id, desejados })
  const { data: peca } = await supabase.from('content_pieces').select('title').eq('id', contentId).maybeSingle()
  await avisarRevisores({
    userIds: novos,
    workspaceId: context.workspace.id,
    approvalId,
    titulo: peca?.title || 'Conteúdo editorial',
    quem: context.profile?.full_name || 'Um colega',
  })

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

  const { data: duplicate } = await supabase
    .from('content_comments')
    .select('id')
    .eq('content_id', contentId)
    .eq('author_id', context.user.id)
    .eq('body', body)
    .gte('created_at', new Date(Date.now() - 10_000).toISOString())
    .limit(1)
    .maybeSingle()
  if (duplicate) { revalidatePath(`/mensagens/${contentId}`); return }

  const { error } = await supabase.from('content_comments').insert({
    workspace_id: context.workspace.id,
    content_id: contentId,
    author_id: context.user.id,
    body,
  })
  if (error) throw new Error('Não foi possível adicionar o comentário.')

  revalidatePath(`/conteudos/${contentId}`)
  revalidatePath(`/mensagens/${contentId}`)
  revalidatePath('/mensagens')
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

export async function deleteProject(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = text(formData, 'id')

  const { data: project } = await supabase.from('projects').select('id,name,created_by').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!project) throw new Error('Projeto não encontrado.')
  if (context.role !== 'admin' && project.created_by !== context.user.id) {
    throw new Error('Somente quem criou o projeto ou um administrador pode excluí-lo.')
  }

  const admin = createAdminClient()
  await admin.from('pautas').update({ project_id: null }).eq('project_id', id).eq('workspace_id', context.workspace.id)
  const { error } = await admin.from('projects').delete().eq('id', id).eq('workspace_id', context.workspace.id)
  if (error) throw new Error('Não foi possível excluir o projeto.')

  await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'deleted', entity_type: 'project', entity_id: id, metadata: { name: project.name } })

  revalidatePath('/projetos')
  redirect('/projetos')
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

  const { data: duplicate } = await supabase
    .from('messages')
    .select('id')
    .is('pauta_id', null)
    .eq('author_id', context.user.id)
    .eq('recipient_id', recipientId)
    .eq('body', body)
    .gte('created_at', new Date(Date.now() - 10_000).toISOString())
    .limit(1)
    .maybeSingle()
  if (duplicate) { revalidatePath(`/mensagens/pessoa/${recipientId}`); return }

  // A mensagem vem primeiro: é ela que fica. A notificação só avisa que chegou.
  const { error } = await supabase.from('messages').insert({
    workspace_id: context.workspace.id,
    pauta_id: null,
    author_id: context.user.id,
    recipient_id: recipientId,
    body,
  })
  if (error) throw new Error('Não foi possível enviar a mensagem.')

  const admin = createAdminClient()
  const { error: notifyError } = await admin.from('notifications').insert({
    workspace_id: context.workspace.id,
    user_id: recipientId,
    title: `Mensagem de ${context.profile?.full_name || 'um colega'}`,
    message: body,
    link: `/mensagens/pessoa/${context.user.id}`,
  })
  // Falhar o aviso não pode apagar a mensagem, que já está salva.
  if (notifyError) console.error('[sendDirectMessage] notificação não enviada:', notifyError.message)

  revalidatePath('/mensagens')
  revalidatePath(`/mensagens/pessoa/${recipientId}`)
}
