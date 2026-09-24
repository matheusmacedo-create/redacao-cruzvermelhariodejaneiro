import { createAdminClient } from '@/lib/supabase/admin'
import { lerCodigo } from '@/lib/auditoria/catalogo'
import { cabecalhos, chaveDoLimite, LIMITE_POR_HORA, segundosAteAProximaHora } from '@/lib/auditoria/consulta'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cabecalhos(request) })
}

/**
 * O texto canônico de um item público, byte a byte como foi registrado: o
 * SHA-256 deste arquivo é o hash do registro (sha256sum <codigo>.json).
 */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const h = cabecalhos(request)
  const responder = (status: number, corpo: object, extra: Record<string, string> = {}) => Response.json(corpo, { status, headers: { ...h, ...extra } })
  const lido = lerCodigo(decodeURIComponent((await params).codigo))
  if (!lido || lido.tipo !== 'trilha') return responder(400, { erro: 'entrada_invalida' })

  try {
    const admin = createAdminClient()
    const limite = await admin.rpc('auditoria_permitir', { p_chave: chaveDoLimite(request, 'arquivo'), p_limite: LIMITE_POR_HORA.arquivo })
    if (limite.error) return responder(503, { erro: 'indisponivel' })
    if (!limite.data) return responder(429, { erro: 'limite' }, { 'Retry-After': String(segundosAteAProximaHora()) })

    const { data, error } = await admin.rpc('auditoria_conteudo', { p_codigo: lido.codigo })
    if (error) return responder(503, { erro: 'indisponivel' })
    if (typeof data !== 'string') return responder(404, { erro: 'sem_conteudo' })
    return new Response(data, {
      headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${lido.codigo}.json"` },
    })
  } catch {
    return responder(503, { erro: 'indisponivel' })
  }
}
