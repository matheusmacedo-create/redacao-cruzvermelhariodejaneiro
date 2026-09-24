import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Saída dos avisos do Voluntariado por e-mail — o mesmo desenho de
 * /api/newsletter/sair:
 *
 *  - POST do provedor (Gmail, Yahoo), saída em um clique da RFC 8058: sem
 *    tela, resposta 200.
 *  - POST do botão da página /membro/sair-dos-avisos: volta para a página
 *    com "pronto".
 *  - GET não tira ninguém da lista (robôs de segurança abrem todos os links):
 *    manda para a página do botão.
 *
 * O token é um HMAC do id com a chave do cadastro, conferido no banco
 * (membro_preferir_avisos): ninguém tira outra pessoa da lista pelo id.
 */

const ID = /^[0-9a-f-]{36}$/
const TOKEN = /^[0-9a-f]{64}$/

async function doPedido(request: NextRequest) {
  const url = request.nextUrl.searchParams
  let p = url.get('p')?.trim() ?? ''
  let t = url.get('t')?.trim() ?? ''
  if (!p || !t) {
    const form = await request.formData().catch(() => null)
    p = p || String(form?.get('p') ?? '').trim()
    t = t || String(form?.get('t') ?? '').trim()
  }
  return { p, t }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams
  const destino = new URL('/membro/sair-dos-avisos', request.nextUrl.origin)
  destino.searchParams.set('p', url.get('p') ?? '')
  destino.searchParams.set('t', url.get('t') ?? '')
  return NextResponse.redirect(destino)
}

export async function POST(request: NextRequest) {
  const { p, t } = await doPedido(request)
  const doNavegador = (request.headers.get('accept') ?? '').includes('text/html')
  const pagina = (estado: string) => NextResponse.redirect(new URL(`/membro/sair-dos-avisos?estado=${estado}`, request.nextUrl.origin), { status: 303 })

  if (!ID.test(p) || !TOKEN.test(t)) {
    return doNavegador ? pagina('invalido') : NextResponse.json({ ok: false, erro: 'Link inválido.' }, { status: 400 })
  }
  const { data, error } = await createAdminClient().rpc('membro_preferir_avisos', { p_participante_id: p, p_receber: false, p_token: t })
  if (error) {
    console.error('[voluntariado] falha ao sair dos avisos:', error.message)
    // Para o provedor, sucesso mesmo assim: um erro aqui conta como remetente
    // que não honra a saída — pior do que uma linha corrigida depois.
    return doNavegador ? pagina('falhou') : NextResponse.json({ ok: true })
  }
  if (!data) return doNavegador ? pagina('invalido') : NextResponse.json({ ok: false, erro: 'Link inválido.' }, { status: 400 })
  return doNavegador ? pagina('saiu') : NextResponse.json({ ok: true })
}
