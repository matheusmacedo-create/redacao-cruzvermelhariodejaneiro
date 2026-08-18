import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { metaEnv } from '@/lib/meta/config'
import { cifrarToken, segredoConfere } from '@/lib/meta/crypto'
import { listarPaginas, tokenLongaDuracao, trocarCodigoPorToken } from '@/lib/meta/graph'

/**
 * Passo 2 do "Conectar Facebook/Instagram".
 *
 * Recebe o código da Meta, troca por um token de longa duração, descobre as
 * Páginas administradas e a conta do Instagram vinculada a cada uma, e grava
 * um canal para cada destino publicável — com o token sempre cifrado.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function voltarPara(mensagem: string, tipo: 'ok' | 'erro') {
  const url = new URL(`${metaEnv.siteUrl}/configuracoes`)
  url.searchParams.set('aba', 'canais')
  url.searchParams.set(tipo === 'ok' ? 'conectado' : 'erro', mensagem)
  return NextResponse.redirect(url.toString())
}

export async function GET(request: Request) {
  const context = await requireAdmin()
  const url = new URL(request.url)
  const cookieStore = await cookies()

  const limparCookies = () => {
    cookieStore.delete('cvrj_oauth_state')
    cookieStore.delete('cvrj_oauth_workspace')
  }

  // A pessoa cancelou no diálogo da Meta.
  if (url.searchParams.get('error')) {
    limparCookies()
    return voltarPara(url.searchParams.get('error_description') ?? 'Conexão cancelada.', 'erro')
  }

  const state = url.searchParams.get('state')
  const stateEsperado = cookieStore.get('cvrj_oauth_state')?.value
  if (!stateEsperado || !segredoConfere(state, stateEsperado)) {
    limparCookies()
    return voltarPara('A conexão expirou ou é inválida. Tente novamente.', 'erro')
  }

  // O espaço tem que ser o mesmo de onde a conexão partiu.
  const workspaceId = cookieStore.get('cvrj_oauth_workspace')?.value
  if (!workspaceId || workspaceId !== context.workspace.id) {
    limparCookies()
    return voltarPara('A conexão foi iniciada em outro espaço de trabalho.', 'erro')
  }

  const code = url.searchParams.get('code')
  if (!code) {
    limparCookies()
    return voltarPara('A Meta não devolveu o código de autorização.', 'erro')
  }

  try {
    const curto = await trocarCodigoPorToken(code)
    const longo = await tokenLongaDuracao(curto.access_token)
    const paginas = await listarPaginas(longo.access_token)

    if (paginas.length === 0) {
      limparCookies()
      return voltarPara(
        'Nenhuma Página do Facebook foi encontrada nesta conta. Verifique se você é administrador da Página no Meta Business.',
        'erro',
      )
    }

    const admin = createAdminClient()
    const agora = new Date().toISOString()
    const canais: any[] = []

    for (const pagina of paginas) {
      // O token da Página é o que publica — não o token do usuário.
      canais.push({
        workspace_id: workspaceId,
        platform: 'facebook',
        external_id: pagina.id,
        account_name: pagina.name,
        username: null,
        avatar_url: pagina.picture?.data?.url ?? null,
        facebook_page_id: pagina.id,
        access_token_cipher: cifrarToken(pagina.access_token),
        token_expires_at: null, // token de Página derivado de token longo não expira
        status: 'active',
        last_checked_at: agora,
        last_error: null,
        connected_by: context.user.id,
      })

      const ig = pagina.instagram_business_account
      if (ig?.id) {
        canais.push({
          workspace_id: workspaceId,
          platform: 'instagram',
          external_id: ig.id,
          account_name: ig.name ?? pagina.name,
          username: ig.username ?? null,
          avatar_url: ig.profile_picture_url ?? null,
          facebook_page_id: pagina.id,
          // O Instagram publica usando o token da Página vinculada.
          access_token_cipher: cifrarToken(pagina.access_token),
          token_expires_at: null,
          status: 'active',
          last_checked_at: agora,
          last_error: null,
          connected_by: context.user.id,
        })
      }
    }

    const { error } = await admin
      .from('social_channels')
      .upsert(canais, { onConflict: 'workspace_id,platform,external_id' })

    limparCookies()

    if (error) return voltarPara('Não foi possível salvar os canais conectados.', 'erro')

    const comInstagram = canais.filter((canal) => canal.platform === 'instagram').length
    if (comInstagram === 0) {
      return voltarPara(
        `${canais.length} Página(s) conectada(s), mas nenhuma conta do Instagram vinculada foi encontrada. Vincule a conta Instagram Business à Página no Meta Business para publicar no Instagram.`,
        'ok',
      )
    }

    return voltarPara(`${canais.length} canal(is) conectado(s) com sucesso.`, 'ok')
  } catch (erro) {
    limparCookies()
    return voltarPara(erro instanceof Error ? erro.message : 'Falha ao conectar com a Meta.', 'erro')
  }
}
