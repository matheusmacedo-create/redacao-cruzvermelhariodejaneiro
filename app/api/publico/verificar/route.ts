import { createAdminClient } from '@/lib/supabase/admin'
import { lerCodigo } from '@/lib/auditoria/catalogo'
import { cabecalhos, chaveDoLimite, comLinks, LIMITE_POR_HORA, segundosAteAProximaHora } from '@/lib/auditoria/consulta'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cabecalhos(request) })
}

/**
 * A consulta pública da trilha: {"codigo": "..."} ou {"hash": "<SHA-256>"}.
 * Só lê — a única escrita é o contador do limite por hora.
 */
export async function POST(request: Request) {
  const h = cabecalhos(request)
  const responder = (status: number, corpo: object, extra: Record<string, string> = {}) => Response.json(corpo, { status, headers: { ...h, ...extra } })

  let corpo: { codigo?: unknown; hash?: unknown }
  try {
    const texto = await request.text()
    if (texto.length > 2000) return responder(400, { erro: 'entrada_invalida' })
    corpo = JSON.parse(texto) ?? {}
  } catch {
    return responder(400, { erro: 'entrada_invalida' })
  }
  const lido = lerCodigo(corpo.codigo)
  const hash = typeof corpo.hash === 'string' && /^[0-9a-fA-F]{64}$/.test(corpo.hash.trim()) ? corpo.hash.trim().toLowerCase() : null
  if (!lido && !hash) return responder(400, { erro: 'entrada_invalida' })

  try {
    const admin = createAdminClient()
    const limite = await admin.rpc('auditoria_permitir', { p_chave: chaveDoLimite(request, 'consulta'), p_limite: LIMITE_POR_HORA.consulta })
    if (limite.error) return responder(503, { erro: 'indisponivel' })
    if (!limite.data) return responder(429, { erro: 'limite' }, { 'Retry-After': String(segundosAteAProximaHora()) })

    const r = lido
      ? await admin.rpc('auditoria_consultar', { p_codigo: lido.codigo })
      : await admin.rpc('auditoria_consultar_hash', { p_hash: hash })
    if (r.error) return responder(503, { erro: 'indisponivel' })
    return responder(200, { ...comLinks(r.data, lido, new URL(request.url).origin), consultado_em: new Date().toISOString() })
  } catch {
    return responder(503, { erro: 'indisponivel' })
  }
}
