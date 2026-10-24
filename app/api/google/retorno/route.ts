import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esquecerToken, trocarCodigo } from '@/lib/google/gmail'
import { esquecerTokenDeAdmin } from '@/lib/google/diretorio'
import { contaDoDrive, esquecerTokenDoDrive, garantirPastaRaiz } from '@/lib/google/drive'
import { clienteDoAds, contasAcessiveis, esquecerTokenDoAds } from '@/lib/google/ads'
import { contaEscolhida, idDaConta, idDaContaNoPainel } from '@/lib/google/ads-regras'
import { resumoDaSincronizacao, sincronizarCaixas } from '@/lib/correio/sincronizar'
import { encerrarAlertasDaConexao } from '@/lib/integracoes/alertas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A volta do consentimento do Google, para as quatro conexões: a do Gmail
 * (state comum), a da conta de administrador que cria usuários (state
 * "admin.…", começado em /api/google/conectar-admin), a do Google Drive
 * (state "drive.…", de /api/google/conectar-drive) e a do Google Ads (state
 * "ads.…", de /api/google/conectar-ads). Confere o state, troca o código pela
 * autorização e guarda no cofre (com a sessão do admin — a função do banco
 * exige admin). A do Gmail ainda sincroniza os aliases; a do Drive lê a conta
 * pelo about (sem openid) e já cria a pasta raiz; a do Ads lista as contas de
 * anúncios que a autorização alcança e escolhe a única (ou a de
 * GOOGLE_ADS_CUSTOMER_ID, se a alcança).
 */
export async function GET(request: NextRequest) {
  const origem = request.nextUrl.origin
  const estado = request.nextUrl.searchParams.get('state') ?? ''
  const deAdmin = estado.startsWith('admin.')
  const doDrive = estado.startsWith('drive.')
  const doAds = estado.startsWith('ads.')
  const parametro = deAdmin ? 'google_admin' : doDrive ? 'google_drive' : doAds ? 'google_ads' : 'google'
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
  if (!bate) return voltar('erro', `A conexão expirou ou não começou aqui. Clique em "${deAdmin ? 'Conectar conta de administrador' : doDrive ? 'Conectar Google Drive' : doAds ? 'Conectar Google Ads' : 'Conectar conta Google'}" de novo.`)

  const codigo = q.get('code') ?? ''
  if (!codigo) return voltar('erro', 'O Google não devolveu o código de autorização.')

  const workspaceId = contexto.workspace.id
  try {
    // O Google Ads troca o código com o cliente que começou o consentimento (o próprio dele, se houver).
    const clienteDoAdsAgora = doAds ? await clienteDoAds(workspaceId) : null
    const { refreshToken, email: doIdToken, accessToken } = await trocarCodigo(workspaceId, codigo, clienteDoAdsAgora ?? undefined)
    // A troca deu certo: os alertas que esta conexão resolve (a autorização que caiu e, com o cliente do Gmail, o cliente
    // OAuth recusado) deixam de valer — no sino e no assistente do WhatsApp (lib/integracoes/alertas.ts).
    const encerrar = () => encerrarAlertasDaConexao({
      workspaceId, conexao: deAdmin ? 'admin' : doDrive ? 'drive' : doAds ? 'ads' : 'gmail', usouClienteDoGmail: !clienteDoAdsAgora?.proprio, atorId: contexto.user.id,
    })
    const supabase = await createClient()
    const { error } = await supabase.rpc('definir_chave_de_integracao', {
      p_workspace_id: workspaceId, p_servico: deAdmin ? 'google_admin' : doDrive ? 'google_drive' : doAds ? 'google_ads' : 'google_gmail', p_valor: refreshToken,
    })
    if (error) throw new Error('Não foi possível guardar a autorização no cofre.')
    const admin = createAdminClient()

    if (doAds) {
      // As contas de anúncios que esta autorização alcança, com o token de agora; a escolhida é a única, ou a da variável.
      // Se a lista falhar (tempo, 5xx), vale a que já estava guardada: uma falha passageira não apaga a escolha.
      const listadas = await contasAcessiveis(accessToken)
      esquecerTokenDoAds(workspaceId)
      const { data: antes } = await admin.from('google_ads_conexao').select('customer_id,contas_acessiveis').eq('workspace_id', workspaceId).maybeSingle()
      const acessiveis = listadas ?? ((antes?.contas_acessiveis as string[] | null) ?? [])
      const escolhida = contaEscolhida({ acessiveis, preferida: idDaConta(process.env.GOOGLE_ADS_CUSTOMER_ID) })
      // A reconexão da mesma conta mantém a escolha (as campanhas criadas ficam no registro, por conta).
      const mantida = antes?.customer_id && (listadas === null || acessiveis.includes(String(antes.customer_id))) ? String(antes.customer_id) : escolhida
      const { error: semTabela } = await admin.from('google_ads_conexao').upsert({
        workspace_id: workspaceId, email_conta: doIdToken || '(conta sem e-mail)', estado: 'ativa', contas_acessiveis: acessiveis, customer_id: mantida,
        conectada_por: contexto.user.id, conectada_em: new Date().toISOString(),
      })
      if (semTabela) {
        await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: workspaceId, p_servico: 'google_ads' })
        return voltar('erro', 'O banco ainda não tem a tabela da conexão do Google Ads (a migração do Google Ads precisa ser aplicada). Nada foi guardado.')
      }
      await encerrar()
      await admin.from('activity_log').insert({
        workspace_id: workspaceId, actor_id: contexto.user.id, action: 'google_ads_conectado',
        entity_type: 'integracao', metadata: { conta: doIdToken, contas: acessiveis, escolhida: mantida },
      })
      const quais = listadas === null ? 'Não deu para listar as contas de anúncios agora (o Google não respondeu); ficou a lista de antes. Reconecte daqui a pouco para atualizar.' : acessiveis.length ? `Contas de anúncios alcançadas: ${acessiveis.map(idDaContaNoPainel).join(', ')}.` : 'A autorização não alcançou nenhuma conta de anúncios: confira se o projeto do Google Cloud tem acesso Explorer à API e se a conta Google é administradora no Google Ads.'
      return voltar('ok', `Google Ads ${doIdToken ? `de ${doIdToken} ` : ''}conectado. ${quais}${mantida ? ` Em uso: ${idDaContaNoPainel(mantida)}.` : acessiveis.length > 1 ? ' Escolha qual usar no cartão.' : ''}`)
    }

    if (doDrive) {
      // Sem openid, o id_token não vem: a conta é lida no about do Drive, com o token de agora.
      const email = doIdToken || await contaDoDrive(accessToken)
      esquecerTokenDoDrive(workspaceId)
      const { error: semTabela } = await admin.from('google_drive_conexao').upsert({
        workspace_id: workspaceId, email_conta: email || '(conta sem e-mail)', estado: 'ativa',
        conectada_por: contexto.user.id, conectada_em: new Date().toISOString(),
      })
      if (semTabela) {
        // A migração do Drive ainda não foi aplicada: sem a conexão no banco, a autorização não serve; sai do cofre.
        await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: workspaceId, p_servico: 'google_drive' })
        return voltar('erro', 'O banco ainda não tem a tabela da conexão do Drive (a migração do Google Drive precisa ser aplicada). Nada foi guardado.')
      }
      await encerrar()
      await admin.from('activity_log').insert({
        workspace_id: workspaceId, actor_id: contexto.user.id, action: 'google_drive_conectado',
        entity_type: 'integracao', metadata: { conta: email },
      })
      // A pasta raiz já nasce (ou é achada de novo, na reconexão da mesma conta); se não der agora, nasce no primeiro arquivo.
      const raiz = await garantirPastaRaiz(workspaceId)
      return voltar('ok', `Google Drive ${email ? `de ${email} ` : ''}conectado. ${raiz.ok ? 'A pasta “Palácio – Arquivos” está pronta.' : `A pasta “Palácio – Arquivos” nasce no primeiro arquivo (${raiz.erro})`}`)
    }
    const email = doIdToken

    if (deAdmin) {
      esquecerTokenDeAdmin(workspaceId)
      await admin.from('google_admin_conexao').upsert({
        workspace_id: workspaceId, email_conta: email || '(conta sem e-mail)', estado: 'ativa',
        conectada_por: contexto.user.id, conectada_em: new Date().toISOString(),
      })
      await encerrar()
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
    await encerrar()
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
