import { lerDicas, lerPreenchimento, lerTracos } from '@/lib/imagem/regras'
import { registrarAssinatura } from '@/lib/imagem/servidor'

export const dynamic = 'force-dynamic'

/**
 * A assinatura da autorização de imagem (página /autorizacao/[token]). Sem
 * login: vale o token do link. Mesmas armadilhas da inscrição pública (campo
 * escondido e tempo mínimo); o limite por aparelho e por link fica em
 * registrarAssinatura.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const responder = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } })
  let corpo: Record<string, unknown>
  try { corpo = await request.json() } catch { return responder(400, { erro: 'Formulário inválido.' }) }
  if (!corpo || typeof corpo !== 'object') return responder(400, { erro: 'Formulário inválido.' })

  // Robô: preencheu o campo invisível ou mandou rápido demais.
  const inicio = Number(corpo._inicio ?? 0)
  if (String(corpo.site ?? '') || !inicio || Date.now() - inicio < 5000) return responder(422, { erro: 'Confira o formulário e envie de novo.' })

  const { dados, erros } = lerPreenchimento(corpo)
  const { tracos, erro } = lerTracos(corpo.assinatura)
  if (erro) erros.push(erro)
  if (erros.length || !dados || !tracos) return responder(422, { erro: erros.join(' ') })

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'desconhecido'
  const resultado = await registrarAssinatura(token, dados, tracos, { ip, userAgent: request.headers.get('user-agent') ?? '', dicas: lerDicas(corpo.dicas) })
  if (!resultado.ok) return responder(resultado.status, { erro: resultado.erro })
  return responder(200, { ok: true, codigo: resultado.codigo, chave: resultado.chave })
}
