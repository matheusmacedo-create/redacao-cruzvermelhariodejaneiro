import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A saída da lista.
 *
 * Atende dois chamadores diferentes pelo mesmo endereço:
 *
 *  - O PROVEDOR (Gmail, Yahoo, Apple), com um POST vazio, quando a pessoa usa
 *    o botão "cancelar inscrição" que aparece ao lado do remetente. É a saída
 *    em um clique da RFC 8058: nenhuma tela, nenhuma pergunta, resposta 200 e
 *    a pessoa está fora. Exigir confirmação aqui é o que faz o provedor passar
 *    a marcar o remetente como spam.
 *
 *  - O BOTÃO da nossa página de saída, com um POST de formulário, que espera
 *    ser levado para uma página de "pronto".
 *
 * O GET não descadastra: manda para a página do botão. É o que protege quem
 * nunca clicou de ser removido por um robô de segurança corporativa varrendo
 * os links da mensagem.
 *
 * Sair NUNCA falha por token já usado: quem clica duas vezes tem de ver
 * "pronto", não um erro. E a linha não é apagada — o registro de que a pessoa
 * saiu, e de quando, é justamente o que impede reinscrevê-la sem querer.
 */

const TOKEN_VALIDO = /^[0-9a-f]{48}$/

async function tokenDoPedido(request: NextRequest): Promise<string> {
  const daUrl = request.nextUrl.searchParams.get('t')?.trim()
  if (daUrl) return daUrl
  const form = await request.formData().catch(() => null)
  const doForm = form?.get('t')
  return typeof doForm === 'string' ? doForm.trim() : ''
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim() ?? ''
  return NextResponse.redirect(new URL(`/newsletter/sair?t=${encodeURIComponent(token)}`, request.nextUrl.origin))
}

export async function POST(request: NextRequest) {
  const token = await tokenDoPedido(request)
  // Quem veio do nosso formulário navega; o provedor só quer o 200.
  const doNavegador = (request.headers.get('accept') ?? '').includes('text/html')

  const pronto = () => doNavegador
    ? NextResponse.redirect(new URL('/newsletter/saiu', request.nextUrl.origin), { status: 303 })
    : NextResponse.json({ ok: true })

  if (!TOKEN_VALIDO.test(token)) {
    return doNavegador
      ? NextResponse.redirect(new URL('/newsletter/erro?motivo=Link+de+sa%C3%ADda+inv%C3%A1lido.', request.nextUrl.origin), { status: 303 })
      : NextResponse.json({ ok: false, erro: 'Token inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('newsletter_inscritos')
    .update({ estado: 'descadastrado', descadastrado_em: new Date().toISOString() })
    .eq('token_descadastro', token)
    // Já descadastrado continua descadastrado: sem este filtro, um segundo
    // clique reescreveria a data em que a pessoa saiu.
    .neq('estado', 'descadastrado')

  if (error) {
    console.error('[newsletter] falha ao descadastrar:', error.message)
    // Ainda assim responde sucesso para o provedor: um erro aqui faria o Gmail
    // registrar que o remetente não honra o cancelamento — o que custa mais
    // caro do que uma linha que fica para trás e é corrigida depois.
    return doNavegador
      ? NextResponse.redirect(new URL('/newsletter/erro?motivo=N%C3%A3o+deu+para+concluir+agora.+Tente+de+novo.', request.nextUrl.origin), { status: 303 })
      : NextResponse.json({ ok: true })
  }

  return pronto()
}
