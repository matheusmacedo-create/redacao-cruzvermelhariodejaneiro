import { createAdminClient } from '@/lib/supabase/admin'
import { lerCodigo } from '@/lib/auditoria/catalogo'
import { cabecalhos, chaveDoLimite, LIMITE_POR_HORA, segundosAteAProximaHora } from '@/lib/auditoria/consulta'
import { montarProvaDoItem, nomeDaProva, type DadosDaProva } from '@/lib/auditoria/prova'

export const dynamic = 'force-dynamic'

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cabecalhos(request) })
}

/** A prova OpenTimestamps do item (.ots), montada na hora a partir do lote. */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const h = cabecalhos(request)
  const responder = (status: number, corpo: object, extra: Record<string, string> = {}) => Response.json(corpo, { status, headers: { ...h, ...extra } })
  const lido = lerCodigo(decodeURIComponent((await params).codigo))
  if (!lido) return responder(400, { erro: 'entrada_invalida' })

  try {
    const admin = createAdminClient()
    const limite = await admin.rpc('auditoria_permitir', { p_chave: chaveDoLimite(request, 'arquivo'), p_limite: LIMITE_POR_HORA.arquivo })
    if (limite.error) return responder(503, { erro: 'indisponivel' })
    if (!limite.data) return responder(429, { erro: 'limite' }, { 'Retry-After': String(segundosAteAProximaHora()) })

    const { data, error } = await admin.rpc('auditoria_dados_prova', { p_codigo: lido.codigo })
    if (error) return responder(503, { erro: 'indisponivel' })
    const dados = data as DadosDaProva | null
    if (!dados) return responder(404, { erro: 'sem_prova' })
    if (!dados.ots) return responder(409, { erro: 'prova_em_preparo' })
    const bytes = montarProvaDoItem(dados)
    return new Response(new Uint8Array(bytes), {
      headers: { ...h, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${nomeDaProva(dados)}"` },
    })
  } catch {
    return responder(503, { erro: 'indisponivel' })
  }
}
