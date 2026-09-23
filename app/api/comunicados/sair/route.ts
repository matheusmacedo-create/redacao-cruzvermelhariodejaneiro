import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Saída da lista de comunicados (banco de contatos da Imprensa).
 *
 * Mesmo desenho da saída da newsletter: POST vazio do provedor (saída em um
 * clique, RFC 8058) responde 200 sem tela; POST do botão da nossa página leva
 * para "pronto"; GET só manda para a página do botão, para que robô de
 * segurança corporativa varrendo links não tire ninguém da lista.
 */

const TOKEN = /^[0-9a-f]{48}$/

async function tokenDoPedido(request: NextRequest): Promise<string> {
  const daUrl = request.nextUrl.searchParams.get('t')?.trim()
  if (daUrl) return daUrl
  const form = await request.formData().catch(() => null)
  const doForm = form?.get('t')
  return typeof doForm === 'string' ? doForm.trim() : ''
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim() ?? ''
  return NextResponse.redirect(new URL(`/comunicados/sair?t=${encodeURIComponent(token)}`, request.nextUrl.origin))
}

export async function POST(request: NextRequest) {
  const token = await tokenDoPedido(request)
  const doNavegador = (request.headers.get('accept') ?? '').includes('text/html')
  const pronto = () => doNavegador
    ? NextResponse.redirect(new URL('/comunicados/saiu', request.nextUrl.origin), { status: 303 })
    : NextResponse.json({ ok: true })

  if (!TOKEN.test(token)) {
    return doNavegador
      ? NextResponse.redirect(new URL('/comunicados/saiu?erro=1', request.nextUrl.origin), { status: 303 })
      : NextResponse.json({ ok: false, erro: 'Token inválido.' }, { status: 400 })
  }

  const { error } = await createAdminClient()
    .from('press_contacts')
    .update({ descadastrado_em: new Date().toISOString() })
    .eq('token_descadastro', token)
    // Segundo clique não reescreve a data em que a pessoa saiu.
    .is('descadastrado_em', null)

  if (error) {
    console.error('[comunicados] falha ao descadastrar:', error.message)
    // Para o provedor, sucesso mesmo assim: erro aqui vira "remetente que não
    // honra o cancelamento", que custa mais do que corrigir a linha depois.
    return doNavegador
      ? NextResponse.redirect(new URL('/comunicados/saiu?erro=1', request.nextUrl.origin), { status: 303 })
      : NextResponse.json({ ok: true })
  }

  return pronto()
}
