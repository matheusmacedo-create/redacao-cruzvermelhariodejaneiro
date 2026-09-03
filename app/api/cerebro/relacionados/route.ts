import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { lerRelacionados } from '@/lib/cerebro/relacionados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Extração de termos com IA + duas buscas: o teto padrão cortaria no meio.
export const maxDuration = 60

/**
 * "Explorar o assunto", sob demanda.
 *
 * A tela manda o id, o título e o resumo da história; a IA extrai os termos
 * do assunto e as buscas (imprensa, acervo do Cérebro, pacotes da Casa)
 * rodam com essas mesmas palavras. É caro de propósito — por isso só roda
 * quando o humano clica, nunca junto do mural. Exige sessão do espaço.
 */
export async function POST(req: Request) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  let corpo: { id?: string; titulo?: string; resumo?: string }
  try {
    corpo = (await req.json()) as typeof corpo
  } catch {
    return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 })
  }

  const id = corpo.id ?? ''
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(id)) {
    return NextResponse.json({ erro: 'id de sinal inválido' }, { status: 400 })
  }
  const titulo = String(corpo.titulo ?? '').slice(0, 300)
  const resumo = String(corpo.resumo ?? '').slice(0, 2400)
  if (!titulo) return NextResponse.json({ erro: 'faltou o título da história' }, { status: 400 })

  const r = await lerRelacionados(context.workspace.id, { id, titulo, resumo })
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
