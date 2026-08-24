import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SupabaseConfigError } from '@/lib/supabase/env'

// Sem credenciais não dá para saber se a instalação já foi feita. Responder
// 503 mantém a rota fechada, em vez de deixá-la criar um administrador.
function configFailure(cause: unknown) {
  if (!(cause instanceof SupabaseConfigError)) return null
  console.error('[bootstrap]', cause.message)
  return NextResponse.json({ error: 'Configuração do servidor incompleta.' }, { status: 503 })
}

const internalEmail = (username: string) => `${username.toLowerCase()}@usuarios.cvrj.local`
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

export async function GET() {
  let admin
  try {
    admin = createAdminClient()
  } catch (cause) {
    const failure = configFailure(cause)
    if (failure) return failure
    throw cause
  }
  const { count, error } = await admin.from('profiles').select('*', { count: 'exact', head: true })
  if (error) return NextResponse.json({ error: 'Não foi possível verificar o estado da instalação.' }, { status: 503 })
  return NextResponse.json({ needsBootstrap: (count ?? 0) === 0 })
}

export async function POST(request: Request) {
  let admin
  try {
    admin = createAdminClient()
  } catch (cause) {
    const failure = configFailure(cause)
    if (failure) return failure
    throw cause
  }
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

  // Espaço único: o primeiro administrador entra direto na Produção.
  const { data: workspace } = await admin.from('workspaces').select('id').eq('kind', 'production').maybeSingle()
  if (!workspace) {
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Nenhum espaço de produção encontrado.' }, { status: 500 })
  }
  await admin.from('workspace_members').insert({ workspace_id: workspace.id, user_id: userId, role: 'admin', coordination: 'Comunicação' })

  return NextResponse.json({ ok: true })
}
