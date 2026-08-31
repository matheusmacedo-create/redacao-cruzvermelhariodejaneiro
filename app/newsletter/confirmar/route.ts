import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O clique que confirma a inscrição.
 *
 * É uma rota, não uma página, de propósito: confirmar grava no banco, e
 * componente que grava enquanto renderiza é um erro esperando acontecer — o
 * React pode renderizar de novo, e a gravação iria junto. Aqui a gravação
 * acontece uma vez e a rota redireciona para a tela do resultado.
 *
 * Confirma no GET, ao contrário da saída, que exige POST. A diferença tem
 * motivo: um robô de segurança corporativa que abra este link confirma um
 * endereço que já tinha sido digitado no formulário e que pertence à própria
 * organização dele — irrita, não prejudica terceiros. Já um GET que
 * descadastra tiraria da lista quem nunca pediu para sair. O atrito fica só do
 * lado em que ele protege alguém.
 */

const TOKEN_VALIDO = /^[0-9a-f]{48}$/

export async function GET(request: NextRequest) {
  const origem = request.nextUrl.origin
  const paraErro = (motivo: string) =>
    NextResponse.redirect(new URL(`/newsletter/erro?motivo=${encodeURIComponent(motivo)}`, origem))
  const paraConfirmado = (ja = false) =>
    NextResponse.redirect(new URL(`/newsletter/confirmado${ja ? '?ja=1' : ''}`, origem))

  const token = request.nextUrl.searchParams.get('t')?.trim() ?? ''
  if (!TOKEN_VALIDO.test(token)) {
    return paraErro('Este link de confirmação não é válido. Se você copiou e colou da mensagem, confira se ele veio inteiro.')
  }

  const admin = createAdminClient()
  const { data: inscrito, error: erroDaBusca } = await admin
    .from('newsletter_inscritos')
    .select('id, estado, token_confirmacao_expira_em')
    .eq('token_confirmacao', token)
    .maybeSingle()

  if (erroDaBusca) {
    console.error('[newsletter] falha ao buscar a confirmação:', erroDaBusca.message)
    return paraErro('Houve uma falha do nosso lado. Tente abrir o link de novo em alguns minutos.')
  }

  // Token não encontrado tem duas causas, e a mais comum de longe é boa: já foi
  // usado — a confirmação apaga o token — e a pessoa está reabrindo a mesma
  // mensagem. Tratar como sucesso evita acusar erro de quem não errou.
  if (!inscrito) return paraConfirmado(true)
  if (inscrito.estado === 'confirmado') return paraConfirmado(true)

  const prazo = inscrito.token_confirmacao_expira_em as string | null
  if (prazo && new Date(prazo).getTime() < Date.now()) {
    return paraErro('Este link expirou — eles valem por três dias, por segurança. É só se inscrever de novo pelo site que enviamos outro na hora.')
  }

  const { error } = await admin
    .from('newsletter_inscritos')
    .update({
      estado: 'confirmado',
      confirmado_em: new Date().toISOString(),
      // Token usado é token que não serve mais, e o que não é guardado não vaza.
      token_confirmacao: null,
      token_confirmacao_expira_em: null,
    })
    .eq('id', inscrito.id)

  if (error) {
    console.error('[newsletter] falha ao confirmar:', error.message)
    return paraErro('Houve uma falha do nosso lado. Tente abrir o link de novo em alguns minutos.')
  }

  return paraConfirmado()
}
