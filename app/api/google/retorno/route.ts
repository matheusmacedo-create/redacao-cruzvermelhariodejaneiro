import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esquecerToken, trocarCodigo } from '@/lib/google/gmail'
import { esquecerTokenDeAdmin } from '@/lib/google/diretorio'
import { resumoDaSincronizacao, sincronizarCaixas } from '@/lib/correio/sincronizar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A volta do consentimento do Google, para as duas conexões: a do Gmail
 * (state comum) e a da conta de administrador que cria usuários (state
 * "admin.…", começado em /api/google/conectar-admin). Confere o state, troca
 * o código pela autorização e guarda no cofre (com a sessão do admin — a
 * função do banco exige admin). A do Gmail ainda sincroniza os aliases.
 */
export async function GET(request: NextRequest) {
  const origem = request.nextUrl.origin
  const estado = request.nextUrl.searchParams.get('state') ?? ''
  const deAdmin = estado.startsWith('admin.')
  const parametro = deAdmin ? 'google_admin' : 'google'
  const voltar = (status: string, motivo?: string) => {
    const res = NextResponse.redirect(new URL(`/configuracoes/email?${parametro}=${status}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ''}`, origem))
    res.cookies.set('google_oauth_estado', '', { path: '/api/google', maxAge: 0 })
    return res
  }

  let contexto: Awaited<ReturnType<typeof requirePermissao>>
  try { contexto = await requirePermissao('integracoes.configurar') } catch { return voltar('restrito') }

  const q = request.nextUrl.searchParams
  if (q.get('error')) return voltar('erro', q.get('error') === 'access_denied' ? 'A autorização foi cancelada no Google.' : `O Google devolveu: ${q.get('error')}`)

  const esperado = request.cookies.get('google_oauth_estado')?.value ?? ''
  const bate = estado.length === esperado.length && estado.length > 0 && timingSafeEqual(Buffer.from(estado), Buffer.from(esperado))
  if (!bate) return voltar('erro', `A conexão expirou ou não começou aqui. Clique em "${deAdmin ? 'Conectar conta de administrador' : 'Conectar conta Google'}" de novo.`)

  const codigo = q.get('code') ?? ''
  if (!codigo) return voltar('erro', 'O Google não devolveu o código de autorização.')

  const workspaceId = contexto.workspace.id
  try {
    const { refreshToken, email } = await trocarCodigo(workspaceId, codigo)
    const supabase = await createClient()
    const { error } = await supabase.rpc('definir_chave_de_integracao', {
      p_workspace_id: workspaceId, p_servico: deAdmin ? 'google_admin' : 'google_gmail', p_valor: refreshToken,
    })
    if (error) throw new Error('Não foi possível guardar a autorização no cofre.')
    const admin = createAdminClient()

    if (deAdmin) {
      esquecerTokenDeAdmin(workspaceId)
      await admin.from('google_admin_conexao').upsert({
        workspace_id: workspaceId, email_conta: email || '(conta sem e-mail)', estado: 'ativa',
        conectada_por: contexto.user.id, conectada_em: new Date().toISOString(),
      })
      await admin.from('activity_log').insert({
        workspace_id: workspaceId, actor_id: contexto.user.id, action: 'google_admin_conectado',
        entity_type: 'integracao', metadata: { conta: email },
      })
      return voltar('ok', `Conta de administrador ${email} conectada. Agora dá para gerar links de criação de e-mail.`)
    }

    esquecerToken(workspaceId)
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
