import { cookies } from 'next/headers'
import { COOKIE_DA_PREVIA } from '@/lib/membro/sessao'
import { nivelDeParticipantesSemRedirecionar } from '@/lib/participantes/acesso'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * /membro/previa?como=geral — a equipe abre a Área do Voluntário como um
 * voluntário genérico (o conteúdo publicado, sem dados de ninguém).
 * /membro/previa?como=<id> — como um voluntário específico (nível gerenciar),
 * registrado na auditoria do cadastro. Só leitura, 2 horas.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const como = url.searchParams.get('como') ?? 'geral'
  const equipe = await nivelDeParticipantesSemRedirecionar().catch(() => null)
  if (!equipe || equipe.nivel < 1) return Response.redirect(new URL('/', request.url), 303)
  if (como !== 'geral') {
    if (!/^[0-9a-f-]{36}$/.test(como) || equipe.nivel < 2) return new Response('Sem acesso para ver a área como este voluntário.', { status: 403 })
    const supabase = await createClient()
    const { error } = await supabase.rpc('auditar_previa_membro', { p_id: como })
    if (error) return new Response('Cadastro não encontrado.', { status: 404 })
  }
  ;(await cookies()).set(COOKIE_DA_PREVIA, como, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 2 * 3600 })
  return Response.redirect(new URL('/membro', request.url), 303)
}
