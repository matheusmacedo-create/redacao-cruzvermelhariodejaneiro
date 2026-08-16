import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/session'

const internalEmail = (username: string) => `${username}@usuarios.cvrj.local`
const initials = (name: string) => name.split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase()

export async function POST(request: Request) {
  let context
  try { context = await requireAdmin() } catch { return NextResponse.json({ error:'Acesso negado.' },{ status:403 }) }
  const payload = await request.json(); const username=String(payload.username ?? '').trim().toLowerCase(); const fullName=String(payload.fullName ?? '').trim(); const password=String(payload.password ?? ''); const role=String(payload.role ?? '')
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || fullName.length < 3 || password.length < 8 || !['admin','editor','colaborador'].includes(role)) return NextResponse.json({error:'Dados inválidos.'},{status:400})
  const admin=createAdminClient(); const { data, error }=await admin.auth.admin.createUser({email:internalEmail(username),password,email_confirm:true,user_metadata:{username,full_name:fullName}})
  if (error || !data.user) return NextResponse.json({error:'Usuário já existe ou não pôde ser criado.'},{status:400})
  const { error: profileError }=await admin.from('profiles').insert({id:data.user.id,username,full_name:fullName,job_title:String(payload.jobTitle ?? ''),initials:initials(fullName)})
  if (profileError) { await admin.auth.admin.deleteUser(data.user.id); return NextResponse.json({error:'Não foi possível criar o perfil.'},{status:500}) }
  await admin.from('workspace_members').insert({workspace_id:context.workspace.id,user_id:data.user.id,role,coordination:String(payload.coordination ?? '')})
  return NextResponse.json({ok:true})
}
