import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerFormulario, TERMO_VERSAO } from '@/lib/participantes/regras'
import { notificar } from '@/lib/notificacoes/servidor'
import { gerentesDoVoluntariado } from '@/lib/membro/comunicacao'

export const dynamic = 'force-dynamic'

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/**
 * A inscrição pública de voluntários. Entra como "inscrição pendente" e só
 * vira participante quando a coordenação aprova. Armadilhas contra robôs:
 * um campo escondido que pessoa não preenche e um tempo mínimo de
 * preenchimento; o banco ainda limita 5 inscrições por hora por origem.
 */
export async function POST(request: Request) {
  const responder = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status })
  let f: FormData
  try { f = await request.formData() } catch { return responder(400, { erro: 'Formulário inválido.' }) }

  // Robô: preencheu o campo invisível, ou enviou rápido demais. Responde como
  // se tivesse dado certo, para não ensinar o robô a contornar.
  const inicio = Number(f.get('_inicio') ?? 0)
  if (String(f.get('site') ?? '') || !inicio || Date.now() - inicio < 4000) return responder(200, { ok: true })

  const { dados, erros } = lerFormulario(f, hoje(), { publico: true })
  if (erros.length) return responder(422, { erro: erros.join(' ') })
  dados.vinculo = f.get('vinculo') === 'jovem' ? 'jovem' : 'voluntario'

  const admin = createAdminClient()
  const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
  if (!ws) return responder(503, { erro: 'Inscrições indisponíveis no momento.' })
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'desconhecido'
  const ipHash = createHash('sha256').update(`participe:${ip}`).digest('hex')
  const { error } = await admin.rpc('inscrever_participante', { p_workspace_id: ws.id, p: dados, p_ip_hash: ipHash, p_versao_termo: TERMO_VERSAO })
  if (error) return responder(error.code === 'P0001' ? 422 : 500, { erro: error.code === 'P0001' ? error.message : 'Não foi possível enviar a inscrição agora. Tente de novo em instantes.' })
  // Quem gerencia o Voluntariado fica sabendo (sino e, conforme a preferência, e-mail).
  await notificar(admin, {
    workspaceId: ws.id, para: await gerentesDoVoluntariado(ws.id), atorId: null, categoria: 'aprovacoes',
    titulo: 'Nova inscrição de voluntário', mensagem: `${String(dados.nome ?? '').slice(0, 120)} se inscreveu pelo formulário público.`,
    link: '/voluntariado?aba=inscricoes', botao: 'Ver inscrições', nota: 'Aprove ou recuse em Voluntários → Inscrições pendentes.',
  })
  return responder(200, { ok: true })
}
