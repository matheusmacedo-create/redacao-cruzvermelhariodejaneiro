import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { obterPerfil, perfilPadrao, redesConectadas } from '@/lib/publicacao/upload-post'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Quais redes estão de fato autorizadas. A tela usa isto para não oferecer um
 * botão que só produziria erro.
 *
 * Fica fora da página do conteúdo de propósito: é uma chamada HTTP a um serviço
 * externo, e pendurá-la no carregamento da página faria toda matéria abrir na
 * velocidade do Upload-Post.
 *
 * Aberto a qualquer membro do espaço — a resposta não contém segredo, só a
 * lista de redes ligadas.
 */
export async function GET() {
  if (!(await obterWorkspace())) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  if (!process.env.UPLOAD_POST_API_KEY) {
    return NextResponse.json({ configurado: false, redes: [] })
  }

  try {
    const { dados } = await obterPerfil(perfilPadrao())
    if (!dados.profile) return NextResponse.json({ configurado: true, redes: [], perfilAusente: true })
    return NextResponse.json({ configurado: true, redes: redesConectadas(dados.profile) })
  } catch {
    // Falhar aqui não pode quebrar a página da matéria. A tela mostra o aviso
    // de indisponível e o resto do editor continua funcionando.
    return NextResponse.json({ configurado: true, redes: [], indisponivel: true })
  }
}
