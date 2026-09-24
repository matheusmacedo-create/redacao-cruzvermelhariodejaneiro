import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_DA_EMPRESA } from '@/lib/financeiro/acesso'

export const dynamic = 'force-dynamic'

/**
 * "Financeiro" da Escola: abre o Financeiro já nos livros da Escola (a
 * empresa dela, com CNPJ, contas e fechamento próprios). Quem não tem acesso
 * ao Financeiro cai na mensagem de sempre de lá.
 */
export async function GET(request: Request) {
  const destino = new URL('/financeiro', request.url)
  const context = await obterWorkspace()
  if (!context) return NextResponse.redirect(new URL('/', request.url))
  const supabase = await createClient()
  const { data } = await supabase.from('fin_entidades').select('id').eq('workspace_id', context.workspace.id).eq('tipo', 'escola').eq('ativa', true).maybeSingle()
  if (data?.id) (await cookies()).set(COOKIE_DA_EMPRESA, data.id as string, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 365 })
  return NextResponse.redirect(destino)
}
