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
const TOKEN_DA_CAMPANHA = /^[0-9a-f]{32}$/

/** t = o contato (quem sai); c = o destinatário (qual campanha o fez sair). */
async function tokensDoPedido(request: NextRequest): Promise<{ t: string; c: string }> {
  const url = request.nextUrl.searchParams
  const form = url.get('t') ? null : await request.formData().catch(() => null)
  const ler = (k: string) => (url.get(k) ?? (typeof form?.get(k) === 'string' ? String(form?.get(k)) : '')).trim()
  return { t: ler('t'), c: ler('c') }
}

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t')?.trim() ?? ''
  const c = request.nextUrl.searchParams.get('c')?.trim() ?? ''
  const destino = `/comunicados/sair?t=${encodeURIComponent(t)}${c ? `&c=${encodeURIComponent(c)}` : ''}`
  return NextResponse.redirect(new URL(destino, request.nextUrl.origin))
}

export async function POST(request: NextRequest) {
  const { t: token, c } = await tokensDoPedido(request)
  const doNavegador = (request.headers.get('accept') ?? '').includes('text/html')
  const pronto = () => doNavegador
    ? NextResponse.redirect(new URL('/comunicados/saiu', request.nextUrl.origin), { status: 303 })
    : NextResponse.json({ ok: true })

  if (!TOKEN.test(token)) {
    return doNavegador
      ? NextResponse.redirect(new URL('/comunicados/saiu?erro=1', request.nextUrl.origin), { status: 303 })
      : NextResponse.json({ ok: false, erro: 'Token inválido.' }, { status: 400 })
  }

  // A função não reescreve a data de quem já saiu, e só credita o
  // descadastro à campanha quando o destinatário é mesmo daquele contato.
  const { error } = await createAdminClient().rpc('registrar_descadastro', {
    p_token_contato: token,
    p_token_destinatario: TOKEN_DA_CAMPANHA.test(c) ? c : null,
  })

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
