import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'

export const dynamic = 'force-dynamic'

/**
 * Certificados da Escola (cursos presenciais). O sistema da escola chama esta rota na primeira
 * impressão de cada certificado; a Redação grava em `certificados` (origem 'escola'), o gancho da
 * tabela registra na trilha de auditoria e a conferência fica em /certificado/<código>, a mesma
 * página dos certificados do voluntariado. Pedir de novo para a mesma matrícula devolve o mesmo
 * código.
 *
 * Protegida por ESCOLA_CERTIFICADOS_TOKEN (Bearer). O espaço é ESCOLA_CERTIFICADOS_WORKSPACE_ID
 * ou, sem ela, o único espaço com conta da escola ativa. A resposta traz só o código e o link:
 * nunca dado de aluno além do que foi enviado.
 */
function autorizado(request: Request) {
  const segredo = process.env.ESCOLA_CERTIFICADOS_TOKEN
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  return Boolean(segredo) && (segredo ?? '').length >= 32 && recebido.length === esperado.length
    && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
}

async function espacoDaEscola(): Promise<string | null> {
  const fixo = process.env.ESCOLA_CERTIFICADOS_WORKSPACE_ID?.trim()
  if (fixo) return fixo
  const { data } = await createAdminClient().from('escola_contas').select('workspace_id').eq('ativa', true)
  const espacos = [...new Set((data ?? []).map((c) => c.workspace_id as string))]
  return espacos.length === 1 ? espacos[0] : null
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function POST(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  let corpo: Record<string, unknown>
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ erro: 'Corpo inválido.' }, { status: 400 })
  }
  const matricula = texto(corpo.matricula_id, 64)
  const nome = texto(corpo.nome, 200)
  const curso = texto(corpo.curso, 200)
  const carga = Number(corpo.carga_horaria)
  const emitido = typeof corpo.emitido_em === 'string' && !Number.isNaN(Date.parse(corpo.emitido_em)) ? corpo.emitido_em : null
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(matricula) || nome.length < 3 || curso.length < 3) {
    return Response.json({ erro: 'Informe matrícula, nome do aluno e curso.' }, { status: 400 })
  }

  const espaco = await espacoDaEscola()
  if (!espaco) return Response.json({ erro: 'Espaço da escola não configurado.' }, { status: 500 })

  const { data, error } = await createAdminClient().rpc('escola_emitir_certificado', {
    p_workspace_id: espaco,
    p_matricula_id: matricula,
    p_turma_id: texto(corpo.turma_id, 64) || null,
    p_nome: nome,
    p_curso: curso,
    p_carga_horaria: Number.isFinite(carga) && carga > 0 ? carga : null,
    p_emitido_em: emitido,
  })
  if (error || typeof data !== 'string') {
    console.error('[escola/certificados]', error?.message)
    return Response.json({ erro: 'Não foi possível registrar o certificado.' }, { status: 500 })
  }
  return Response.json({ codigo: data, url: `${urlBase()}/certificado/${data}` })
}
