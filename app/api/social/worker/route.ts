import { NextResponse } from 'next/server'
import { metaEnv } from '@/lib/meta/config'
import { segredoConfere } from '@/lib/meta/crypto'
import { executarPost, postsDaFila } from '@/lib/meta/runner'

/**
 * Worker do agendamento — o "cron do Instagram" que a Meta não fornece.
 *
 * Chamado a cada minuto pelo pg_cron do Supabase (ver o bloco final da
 * migração 0001). Autenticado por segredo compartilhado no header, não por
 * sessão: quem chama é o banco, não um usuário.
 *
 * Processa poucos posts por passada e respeita um prazo próprio. Se estourar,
 * o progresso já está salvo e a passada seguinte continua de onde parou.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PRAZO_MS = 50_000

async function processar() {
  const prazoFinal = Date.now() + PRAZO_MS
  const ids = await postsDaFila(5)

  const resultados: Array<{ postId: string; status?: string; erro?: string }> = []

  for (const postId of ids) {
    if (Date.now() > prazoFinal - 10_000) break
    try {
      const resultado = await executarPost(postId, { prazoFinal })
      resultados.push({ postId, status: resultado.status })
    } catch (erro) {
      // Falha fora do fluxo previsto: registra e segue para o próximo post,
      // para um post problemático não travar a fila inteira.
      resultados.push({ postId, erro: erro instanceof Error ? erro.message : String(erro) })
    }
  }

  return { encontrados: ids.length, processados: resultados.length, resultados }
}

export async function POST(request: Request) {
  if (!segredoConfere(request.headers.get('x-worker-secret'), metaEnv.workerSecret)) {
    return new NextResponse('Não autorizado.', { status: 401 })
  }
  return NextResponse.json(await processar())
}

/** Mesma rota via GET, para acionar manualmente durante os testes. */
export async function GET(request: Request) {
  if (!segredoConfere(request.headers.get('x-worker-secret'), metaEnv.workerSecret)) {
    return new NextResponse('Não autorizado.', { status: 401 })
  }
  return NextResponse.json(await processar())
}
