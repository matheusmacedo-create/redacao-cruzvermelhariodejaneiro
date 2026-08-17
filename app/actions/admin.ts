'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export async function resetWorkspaceData(formData: FormData) {
  const context = await requireWorkspace()
  if (context.role !== 'admin') throw new Error('Somente administradores podem reiniciar os dados do espaço.')

  const workspaceId = text(formData, 'workspaceId')
  if (workspaceId !== context.workspace.id) throw new Error('Espaço inválido.')

  const confirmName = text(formData, 'confirmName')
  if (confirmName !== context.workspace.name) throw new Error('O nome digitado não confere com o nome do espaço. Nada foi apagado.')

  const admin = createAdminClient()

  const { data: pautaRows } = await admin.from('pautas').select('id').eq('workspace_id', workspaceId)
  const pautaIds = (pautaRows ?? []).map((p) => p.id)
  const { data: contentRows } = await admin.from('content_pieces').select('id').eq('workspace_id', workspaceId)
  const contentIds = (contentRows ?? []).map((c) => c.id)

  if (pautaIds.length) await admin.from('pauta_participants').delete().in('pauta_id', pautaIds)
  if (contentIds.length) await admin.from('content_versions').delete().in('content_id', contentIds)

  const tablesInOrder = [
    'approval_voters',
    'content_comments',
    'messages',
    'notifications',
    'activity_log',
    'files',
    'inbox_items',
    'calendar_events',
    'pauta_links',
    'approvals',
    'content_pieces',
    'pautas',
    'projects',
  ]
  for (const table of tablesInOrder) {
    await admin.from(table).delete().eq('workspace_id', workspaceId)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function seedDemoWorkspace(formData: FormData) {
  const context = await requireWorkspace()
  if (context.role !== 'admin') throw new Error('Somente administradores podem gerar dados de demonstração.')

  const workspaceId = text(formData, 'workspaceId')
  if (workspaceId !== context.workspace.id) throw new Error('Espaço inválido.')
  if (context.workspace.kind !== 'demo') throw new Error('Esta ação só pode ser usada no espaço de Demonstração, para não afetar a Produção.')

  const admin = createAdminClient()
  const { data: memberRows } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId)
  const memberIds = (memberRows ?? []).map((m) => m.user_id)
  const actorId = context.user.id
  const pick = (offset: number) => memberIds[offset % memberIds.length] ?? actorId

  const projectDefs = [
    { name: 'Campanha de Doação de Sangue', description: 'Mobilização contínua para aumentar os estoques dos bancos de sangue parceiros.' },
    { name: 'Resposta a Emergências Climáticas', description: 'Cobertura das ações da CVRJ em enchentes, deslizamentos e ondas de calor.' },
    { name: 'Educação em Primeiros Socorros', description: 'Série de conteúdos ensinando técnicas básicas de primeiros socorros à população.' },
    { name: 'Voluntariado Comunitário RJ', description: 'Histórias e chamadas para voluntários nas comunidades atendidas pela Cruz Vermelha.' },
  ]
  const { data: projects } = await admin.from('projects').insert(projectDefs.map((p, i) => ({ workspace_id: workspaceId, name: p.name, description: p.description, created_by: pick(i) }))).select('id,name')
  const projectId = (name: string) => projects?.find((p) => p.name === name)?.id ?? null

  const pautaDefs = [
    { title: 'Coleta de sangue no Maracanã', project: 'Campanha de Doação de Sangue', status: 'approved', priority: 'high', coordination: 'Saúde', tags: ['sangue', 'evento'] },
    { title: 'Parceria com faculdades de medicina', project: 'Campanha de Doação de Sangue', status: 'production', priority: 'medium', coordination: 'Saúde', tags: ['parceria'] },
    { title: 'Campanha de Carnaval — doe antes de folgar', project: 'Campanha de Doação de Sangue', status: 'incoming', priority: 'low', coordination: 'Comunicação', tags: ['carnaval'] },
    { title: 'Atendimento na enchente da Zona Norte', project: 'Resposta a Emergências Climáticas', status: 'review', priority: 'critical', coordination: 'Emergências', tags: ['enchente', 'urgente'] },
    { title: 'Abrigo temporário em Nova Iguaçu', project: 'Resposta a Emergências Climáticas', status: 'approval', priority: 'critical', coordination: 'Emergências', tags: ['abrigo'] },
    { title: 'Balanço da temporada de chuvas 2026', project: 'Resposta a Emergências Climáticas', status: 'collection', priority: 'medium', coordination: 'Emergências', tags: ['balanço'] },
    { title: 'Como agir em caso de engasgo', project: 'Educação em Primeiros Socorros', status: 'approved', priority: 'medium', coordination: 'Educação', tags: ['primeiros-socorros'] },
    { title: 'RCP para leigos: guia rápido', project: 'Educação em Primeiros Socorros', status: 'production', priority: 'high', coordination: 'Educação', tags: ['rcp'] },
    { title: 'Perfil: 10 anos de voluntariado da Dona Marta', project: 'Voluntariado Comunitário RJ', status: 'archived', priority: 'low', coordination: 'Comunicação', tags: ['perfil'] },
    { title: 'Chamada para novos voluntários — Zona Oeste', project: 'Voluntariado Comunitário RJ', status: 'review', priority: 'high', coordination: 'Comunicação', tags: ['convocação'] },
  ]
  const { data: pautas } = await admin.from('pautas').insert(pautaDefs.map((p, i) => ({
    workspace_id: workspaceId,
    project_id: projectId(p.project),
    title: p.title,
    description: `Pauta de demonstração vinculada ao projeto ${p.project}.`,
    status: p.status,
    priority: p.priority,
    coordination: p.coordination,
    owner_id: pick(i),
    created_by: pick(i + 1),
    due_date: `2026-0${(i % 9) + 1}-${10 + (i % 15)}`,
    tags: p.tags,
  }))).select('id,title')
  const pautaId = (title: string) => pautas?.find((p) => p.title === title)?.id ?? null

  const contentDefs = [
    { title: 'Texto: Coleta de sangue bate recorde no Maracanã', pauta: 'Coleta de sangue no Maracanã', format: 'Matéria', status: 'approved' },
    { title: 'Post: você já pode doar sangue?', pauta: 'Parceria com faculdades de medicina', format: 'Post', status: 'production' },
    { title: 'Texto: famílias resgatadas na Zona Norte', pauta: 'Atendimento na enchente da Zona Norte', format: 'Matéria', status: 'review' },
    { title: 'Vídeo: por dentro do abrigo de Nova Iguaçu', pauta: 'Abrigo temporário em Nova Iguaçu', format: 'Vídeo', status: 'review' },
    { title: 'Texto: engasgo — o que fazer nos primeiros 30 segundos', pauta: 'Como agir em caso de engasgo', format: 'Matéria', status: 'approved' },
    { title: 'Post: RCP salva vidas', pauta: 'Chamada para novos voluntários — Zona Oeste', format: 'Post', status: 'review' },
  ]
  const { data: contents } = await admin.from('content_pieces').insert(contentDefs.map((c, i) => ({
    workspace_id: workspaceId,
    pauta_id: pautaId(c.pauta),
    title: c.title,
    format: c.format,
    status: c.status,
    body: `Conteúdo de demonstração — "${c.title}".\n\nTexto de exemplo gerado para preencher o espaço de Demonstração com um caso realista de uso.`,
    responsible_id: pick(i),
    created_by: pick(i + 1),
  }))).select('id,title,status')
  const contentId = (title: string) => contents?.find((c) => c.title === title)?.id ?? null

  const approvalDefs = [
    { content: 'Texto: famílias resgatadas na Zona Norte', status: 'pending', voters: [{ offset: 0, decision: 'approved' }, { offset: 1, decision: 'pending' }] },
    { content: 'Vídeo: por dentro do abrigo de Nova Iguaçu', status: 'pending', voters: [{ offset: 0, decision: 'approved' }, { offset: 1, decision: 'approved' }, { offset: 2, decision: 'pending' }] },
    { content: 'Post: RCP salva vidas', status: 'changes_requested', voters: [{ offset: 0, decision: 'changes_requested' }, { offset: 1, decision: 'approved' }] },
    { content: 'Texto: engasgo — o que fazer nos primeiros 30 segundos', status: 'approved', voters: [{ offset: 0, decision: 'approved' }, { offset: 1, decision: 'approved' }] },
  ]
  for (const [i, def] of approvalDefs.entries()) {
    const cId = contentId(def.content)
    if (!cId) continue
    const { data: approval } = await admin.from('approvals').insert({ workspace_id: workspaceId, content_id: cId, requested_by: pick(i + 2), status: def.status }).select('id').single()
    if (!approval) continue
    await admin.from('approval_voters').insert(def.voters.map((v) => ({
      workspace_id: workspaceId,
      approval_id: approval.id,
      user_id: pick(v.offset),
      decision: v.decision,
      decided_at: v.decision === 'pending' ? null : new Date().toISOString(),
    })))
  }

  await admin.from('content_comments').insert([
    { workspace_id: workspaceId, content_id: contentId('Texto: famílias resgatadas na Zona Norte'), author_id: pick(2), body: 'Confirma os nomes das famílias com a assistente social antes de publicar?' },
    { workspace_id: workspaceId, content_id: contentId('Texto: famílias resgatadas na Zona Norte'), author_id: pick(0), body: 'Confirmado, já revisei com a equipe de campo.' },
    { workspace_id: workspaceId, content_id: contentId('Post: RCP salva vidas'), author_id: pick(0), body: 'Precisa ajustar a chamada, ficou muito técnica para o Instagram.' },
  ].filter((c) => c.content_id))

  const eventDefs = [
    { title: 'Coleta de sangue — Maracanã', date: '2026-08-22', time: '09:00', type: 'evento', pauta: 'Coleta de sangue no Maracanã' },
    { title: 'Gravação: abrigo Nova Iguaçu', date: '2026-08-19', time: '14:00', type: 'gravacao', pauta: 'Abrigo temporário em Nova Iguaçu' },
    { title: 'Publicação: engasgo nos primeiros 30s', date: '2026-08-20', time: '10:00', type: 'publicacao', pauta: 'Como agir em caso de engasgo' },
    { title: 'Reunião de pauta — Emergências', date: '2026-08-18', time: '11:00', type: 'reuniao', pauta: 'Balanço da temporada de chuvas 2026' },
    { title: 'Publicação: recorde de doações', date: '2026-08-25', time: '08:30', type: 'publicacao', pauta: 'Coleta de sangue no Maracanã' },
    { title: 'Prazo final: chamada de voluntários', date: '2026-08-29', time: '18:00', type: 'prazo', pauta: 'Chamada para novos voluntários — Zona Oeste' },
  ]
  await admin.from('calendar_events').insert(eventDefs.map((e, i) => ({
    workspace_id: workspaceId,
    title: e.title,
    event_date: e.date,
    event_time: e.time,
    type: e.type,
    pauta_id: pautaId(e.pauta),
    created_by: pick(i),
  })))

  const linkDefs = [
    { pauta: 'Coleta de sangue no Maracanã', title: 'Planilha de doadores confirmados', url: 'https://drive.google.com/exemplo-doadores', category: 'Referência' },
    { pauta: 'Atendimento na enchente da Zona Norte', title: 'Fotos da equipe de campo', url: 'https://drive.google.com/exemplo-fotos', category: 'Arquivo' },
    { pauta: 'RCP para leigos: guia rápido', title: 'Material técnico do curso de RCP', url: 'https://drive.google.com/exemplo-rcp', category: 'Referência' },
    { pauta: 'Chamada para novos voluntários — Zona Oeste', title: 'Formulário de inscrição de voluntários', url: 'https://forms.gle/exemplo-voluntarios', category: 'Link externo' },
  ]
  await admin.from('pauta_links').insert(linkDefs.map((l) => ({
    workspace_id: workspaceId,
    pauta_id: pautaId(l.pauta),
    title: l.title,
    url: l.url,
    category: l.category,
  })).filter((l) => l.pauta_id))

  const inboxDefs = [
    { type: 'Solicitação', title: 'Divulgar mutirão de vacinação em Bangu', summary: 'Coordenação de Saúde pede apoio de comunicação para o mutirão do próximo sábado.', sender: 'Coordenação de Saúde', coordination: 'Saúde', priority: 'high' },
    { type: 'Sugestão de pauta', title: 'Perfil de voluntário que atua há 20 anos', summary: 'Indicação da equipe de RH de voluntários para uma matéria especial.', sender: 'RH de Voluntários', coordination: 'Comunicação', priority: 'medium' },
    { type: 'Release', title: 'Parceria com universidade para curso de primeiros socorros', summary: 'Texto enviado pela assessoria da universidade parceira.', sender: 'Assessoria Externa', coordination: 'Educação', priority: 'low' },
    { type: 'Solicitação', title: 'Cobertura da entrega de doações em Nova Iguaçu', summary: 'Emergências pede registro fotográfico da entrega de kits de higiene.', sender: 'Coordenação de Emergências', coordination: 'Emergências', priority: 'high' },
  ]
  await admin.from('inbox_items').insert(inboxDefs.map((item, i) => ({
    workspace_id: workspaceId,
    type: item.type,
    title: item.title,
    summary: item.summary,
    sender_name: item.sender,
    coordination: item.coordination,
    priority: item.priority,
    status: 'new',
    created_by: pick(i),
  })))

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
