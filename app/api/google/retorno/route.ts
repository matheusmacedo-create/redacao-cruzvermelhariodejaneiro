import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esquecerToken, trocarCodigo } from '@/lib/google/gmail'
import { resumoDaSincronizacao, sincronizarCaixas } from '@/lib/correio/sincronizar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A volta do consentimento do Google. Confere o state, troca o código pela
 * autorização, guarda no cofre (com a sessão do admin — a função do banco
 * exige admin) e já sincroniza os aliases.
 */
export async function GET(request: NextRequest) {
  const origem = request.nextUrl.origin
  const voltar = (status: string, motivo?: string) => {
    const res = NextResponse.redirect(new URL(`/configuracoes?google=${status}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ''}#correio`, origem))
    res.cookies.set('google_oauth_estado', '', { path: '/api/google', maxAge: 0 })
    return res
  }

  let contexto: Awaited<ReturnType<typeof requirePermissao>>
  try { contexto = await requirePermissao('integracoes.configurar') } catch { return voltar('restrito') }

  const q = request.nextUrl.searchParams
  if (q.get('error')) return voltar('erro', q.get('error') === 'access_denied' ? 'A autorização foi cancelada no Google.' : `O Google devolveu: ${q.get('error')}`)

  const estado = q.get('state') ?? ''
  const esperado = request.cookies.get('google_oauth_estado')?.value ?? ''
  const bate = estado.length === esperado.length && estado.length > 0 && timingSafeEqual(Buffer.from(estado), Buffer.from(esperado))
  if (!bate) return voltar('erro', 'A conexão expirou ou não começou aqui. Clique em "Conectar conta Google" de novo.')

  const codigo = q.get('code') ?? ''
  if (!codigo) return voltar('erro', 'O Google não devolveu o código de autorização.')

  const workspaceId = contexto.workspace.id
  try {
    const { refreshToken, email } = await trocarCodigo(workspaceId, codigo)
    const supabase = await createClient()
    const { error } = await supabase.rpc('definir_chave_de_integracao', {
      p_workspace_id: workspaceId, p_servico: 'google_gmail', p_valor: refreshToken,
    })
    if (error) throw new Error('Não foi possível guardar a autorização no cofre.')
    esquecerToken(workspaceId)

    const admin = createAdminClient()
    await admin.from('google_conexao').upsert({
      workspace_id: workspaceId, email_conta: email || '(conta sem e-mail)', estado: 'ativa',
      conectada_por: contexto.user.id, conectada_em: new Date().toISOString(),
    })
    await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: contexto.user.id, action: 'google_conectado',
      entity_type: 'integracao', metadata: { conta: email },
    })

    const r = await sincronizarCaixas(workspaceId)
    return voltar('ok', `Conta ${email} conectada. ${resumoDaSincronizacao(r)}`)
  } catch (causa) {
    return voltar('erro', causa instanceof Error ? causa.message : 'Não foi possível concluir a conexão.')
  }
}
