import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { lerRelacionados } from '@/lib/cerebro/relacionados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * "Explorar o assunto", sob demanda.
 *
 * A tela do Cérebro chama esta rota quando alguém clica no botão — é uma
 * consulta cara (acervo inteiro do Cérebro + varredura de pacotes), então
 * ela não pode rodar a cada render do mural. Exige sessão do espaço: o
 * conteúdo mistura o raciocínio editorial com o histórico interno da Casa.
 */
export async function GET(req: Request) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(id)) {
    return NextResponse.json({ erro: 'id de sinal inválido' }, { status: 400 })
  }

  const r = await lerRelacionados(context.workspace.id, id)
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
