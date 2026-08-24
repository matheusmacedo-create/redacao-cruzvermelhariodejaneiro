import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const internalEmail = (username: string) => `${username.toLowerCase()}@usuarios.cvrj.local`
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

export async function GET() {
  const admin = createAdminClient()
  const { count, error } = await admin.from('profiles').select('*', { count: 'exact', head: true })
  if (error) return NextResponse.json({ error: 'Não foi possível verificar o estado da instalação.' }, { status: 503 })
  return NextResponse.json({ needsBootstrap: (count ?? 0) === 0 })
}

export async function POST(request: Request) {
  const admin = createAdminClient()
  const { count, error: countError } = await admin.from('profiles').select('*', { count: 'exact', head: true })
  // Falha ao contar não pode liberar a criação de administrador: sem esta
  // checagem, um erro de credencial abriria o cadastro para qualquer pessoa.
  if (countError) {
    console.error('[bootstrap] não foi possível contar os perfis:', countError.message)
    return NextResponse.json({ error: 'Não foi possível verificar o estado da instalação. Tente novamente.' }, { status: 503 })
  }
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'A configuração inicial já foi concluída.' }, { status: 409 })

  const payload = await request.json()
  const username = String(payload.username ?? '').trim().toLowerCase()
  const fullName = String(payload.fullName ?? '').trim()
  const password = String(payload.password ?? '')
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || fullName.length < 3 || password.length < 8) {
    return NextResponse.json({ error: 'Informe nome, usuário válido e senha com pelo menos 8 caracteres.' }, { status: 400 })
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: internalEmail(username), password, email_confirm: true,
    user_metadata: { username, full_name: fullName },
  })
  if (authError || !created.user) return NextResponse.json({ error: 'Não foi possível criar o administrador.' }, { status: 400 })

  const userId = created.user.id
  const { error: profileError } = await admin.from('profiles').insert({ id: userId, username, full_name: fullName, job_title: 'Administrador', initials: initials(fullName) })
  if (profileError) { await admin.auth.admin.deleteUser(userId); return NextResponse.json({ error: 'Não foi possível criar o perfil.' }, { status: 500 }) }

  const { data: workspaces } = await admin.from('workspaces').select('id,kind')
  await admin.from('workspace_members').insert((workspaces ?? []).map((workspace) => ({ workspace_id: workspace.id, user_id: userId, role: 'admin', coordination: 'Comunicação' })))

  const demo = workspaces?.find((workspace) => workspace.kind === 'demo')
  if (demo) {
    const { data: project } = await admin.from('projects').insert({ workspace_id: demo.id, name: 'Ações Humanitárias 2026', description: 'Conteúdo demonstrativo para conhecer o fluxo editorial.', created_by: userId }).select('id').single()
    const { data: pauta } = await admin.from('pautas').insert({ workspace_id: demo.id, project_id: project?.id, title: 'Ação de saúde no Centro do Rio', description: 'Cobertura demonstrativa de atendimento comunitário.', status: 'production', priority: 'high', coordination: 'Saúde', owner_id: userId, created_by: userId, due_date: '2026-08-28', tags: ['saúde','voluntariado'] }).select('id').single()
    await admin.from('inbox_items').insert([{ workspace_id: demo.id, type: 'Solicitação', title: 'Divulgação da campanha de doação de sangue', summary: 'Material recebido para triagem editorial.', sender_name: 'Coordenação de Saúde', coordination: 'Saúde', priority: 'high', status: 'new', created_by: userId }])
    await admin.from('content_pieces').insert({ workspace_id: demo.id, pauta_id: pauta?.id, title: 'Voluntários levam cuidado ao Centro do Rio', format: 'Matéria', status: 'draft', body: 'Uma ação da Cruz Vermelha Brasileira reuniu voluntários no Centro do Rio de Janeiro.\n\nA equipe realizou orientações de saúde e distribuiu kits de higiene para a população.', responsible_id: userId, created_by: userId })
    await admin.from('calendar_events').insert({ workspace_id: demo.id, title: 'Publicação da ação no Centro', event_date: '2026-08-28', event_time: '10:00', type: 'publicacao', pauta_id: pauta?.id, created_by: userId })
  }
  return NextResponse.json({ ok: true })
}
