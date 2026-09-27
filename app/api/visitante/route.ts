import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerVisitante } from '@/lib/portaria/regras'
import { espacoDaEntrada } from '@/lib/portaria/servidor'

export const dynamic = 'force-dynamic'

/**
 * O autocadastro do visitante pelo QR da portaria (/visitante?t=<segredo>).
 * Entra como "aguardando" e só vira entrada quando a portaria confirma.
 * Contra robôs: o segredo do cartaz, um campo escondido, um tempo mínimo de
 * preenchimento e o limite do banco (6 por hora por origem).
 */
export async function POST(request: Request) {
  const responder = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status })
  let f: FormData
  try { f = await request.formData() } catch { return responder(400, { erro: 'Formulário inválido.' }) }

  // Robô: preencheu o campo invisível, ou enviou rápido demais. Responde como
  // se tivesse dado certo, para não ensinar o robô a contornar.
  const inicio = Number(f.get('_inicio') ?? 0)
  if (String(f.get('site') ?? '') || !inicio || Date.now() - inicio < 3000) return responder(200, { ok: true })

  const admin = createAdminClient()
  const token = String(f.get('t') ?? '')
  const workspaceId = await espacoDaEntrada(token, admin)
  if (!workspaceId) return responder(403, { erro: 'Este QR não vale mais. Peça ajuda na portaria.' })

  const { dados, erros } = lerVisitante(f, true)
  if (erros.length) return responder(422, { erro: erros.join(' ') })
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'desconhecido'
  const ipHash = createHash('sha256').update(`portaria:${ip}`).digest('hex')
  const { error } = await admin.rpc('portaria_autocadastro', { p_workspace_id: workspaceId, p_token: token, p: dados, p_ip_hash: ipHash })
  if (error) return responder(error.code === 'P0001' ? 422 : 500, { erro: error.code === 'P0001' ? error.message : 'Não foi possível enviar agora. Fale com a portaria.' })
  return responder(200, { ok: true })
}
