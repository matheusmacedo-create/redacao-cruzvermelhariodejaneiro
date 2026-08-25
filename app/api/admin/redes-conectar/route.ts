import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import {
  garantirPerfil,
  linkDeConexao,
  perfilPadrao,
  semSegredo,
  UploadPostError,
} from '@/lib/publicacao/upload-post'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Leva o administrador à página onde ele autoriza as contas da Cruz Vermelha
 * (Facebook, Instagram, LinkedIn, X, Threads) no Upload-Post.
 *
 * É este passo que dispensa o App Review da Meta: o OAuth roda contra o app já
 * aprovado do Upload-Post. Nada de vídeo de demonstração nem semanas de espera —
 * quem administra a página entra, autoriza e acabou.
 *
 * A URL gerada carrega um JWT que permite conectar e desconectar contas. Vale
 * 48 horas e não deve ser repassada: por isso redirecionamos direto em vez de
 * devolver o link em tela, onde ele acabaria copiado para um grupo de WhatsApp.
 */
export async function GET(request: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  if (!process.env.UPLOAD_POST_API_KEY) {
    return NextResponse.json({ error: 'Falta a variável UPLOAD_POST_API_KEY.' }, { status: 503 })
  }

  const perfil = perfilPadrao()

  try {
    await garantirPerfil(perfil)
    const { dados } = await linkDeConexao({
      username: perfil,
      language: 'pt',
      redirect_url: new URL('/configuracoes', request.nextUrl.origin).toString(),
      connect_title: 'Conectar as redes da Cruz Vermelha',
      connect_description:
        'Autorize as contas oficiais para que a Redação possa publicar direto daqui.',
      platforms: ['facebook', 'instagram', 'linkedin', 'x', 'threads'],
      show_calendar: false,
    })

    // 303 para que o navegador troque o POST/GET por um GET simples no destino.
    return NextResponse.redirect(dados.access_url, 303)
  } catch (erro) {
    const status = erro instanceof UploadPostError ? erro.status : 0
    return NextResponse.json({
      error: semSegredo(erro instanceof Error ? erro.message : String(erro)).slice(0, 300),
      statusUploadPost: status,
    }, { status: status === 401 ? 401 : 502 })
  }
}
