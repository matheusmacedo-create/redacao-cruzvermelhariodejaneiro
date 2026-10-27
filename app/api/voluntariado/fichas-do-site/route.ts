import { createHash, timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarFichasDoSite, chaveDoSite } from '@/lib/voluntariado/fichas-do-site'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * As fichas de voluntariado do site na Redação (lib/voluntariado/fichas-do-site.ts).
 *   GET  rotina diária (vercel.json), protegida por CRON_SECRET, como as outras rotinas;
 *   POST aviso do site a cada ficha nova (api/voluntarios.php do site), com a mesma chave da
 *        ligação ("Site — fichas de voluntariado"). O corpo é ignorado: o aviso só dispara a busca,
 *        que roda depois da resposta (after): o site não fica esperando a importação.
 * Responde só com contadores, nunca com dado pessoal.
 */

const igual = (a: string, b: string) => {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

async function espacoDeProducao(): Promise<string | null> {
  const { data } = await createAdminClient().from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function rodar() {
  const ws = await espacoDeProducao()
  if (!ws) return Response.json({ erro: 'Sem espaço de produção.' }, { status: 503 })
  if (!(await chaveDoSite(ws))) return Response.json({ ok: false, motivo: 'ligação com o site não configurada' })
  const r = await buscarFichasDoSite(ws, Date.now() + 40_000)
  return Response.json({ ok: !r.erro, importadas: r.importadas, puladas: r.puladas, jaExistiam: r.jaExistiam, semFoto: r.semFoto, erro: r.erro ?? null })
}

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })
  return rodar()
}

export async function POST(request: Request) {
  const ws = await espacoDeProducao()
  const chave = ws ? await chaveDoSite(ws) : null
  const recebido = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!chave || !recebido || !igual(recebido, chave) || !ws) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })
  after(async () => {
    const r = await buscarFichasDoSite(ws, Date.now() + 40_000)
    if (r.erro) console.error('[fichas-do-site] aviso do site:', r.erro)
  })
  return Response.json({ ok: true }, { status: 202 })
}
