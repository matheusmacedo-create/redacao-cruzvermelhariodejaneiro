import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { adapter } from '@/lib/publicacao/canais'
import { semSegredo } from '@/lib/publicacao/upload-post'
import { explicarRecusaDaRede } from '@/lib/publicacao/recusa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Recebe do Upload-Post o resultado de cada publicação, na hora.
 *
 * Sem isto o hub depende de alguém abrir a tela para o estado se atualizar —
 * o post sai e a linha fica "publicando" até a próxima visita. Com o webhook,
 * o conector nos AVISA quando termina (sucesso ou falha), e o destino muda
 * sozinho, com o link ou com o motivo real.
 *
 * Segurança: toda entrega vem assinada com HMAC-SHA256 sobre
 * "<timestamp>.<corpo cru>". Sem assinatura válida, nada é gravado — esta é
 * uma rota pública, e sem a conferência qualquer um poderia marcar posts como
 * publicados. O segredo entra por UPLOAD_POST_WEBHOOK_SECRET; a ativação
 * guiada vive em /api/admin/redes-webhook.
 */

const JOB_VALIDO = /^[A-Za-z0-9._-]{4,128}$/

export async function POST(req: Request) {
  const segredo = process.env.UPLOAD_POST_WEBHOOK_SECRET?.trim()
  if (!segredo) {
    return NextResponse.json(
      { ok: false, mensagem: 'Webhook sem verificador: defina UPLOAD_POST_WEBHOOK_SECRET (ative em /api/admin/redes-webhook).' },
      { status: 503 },
    )
  }

  const bruto = await req.text()
  const ts = req.headers.get('x-upload-post-timestamp') ?? ''
  const assinatura = (req.headers.get('x-upload-post-signature') ?? '').replace(/^sha256=/, '')
  // Janela de 5 minutos contra replay, como a documentação do conector pede.
  if (!ts || !Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return new NextResponse(null, { status: 400 })
  }
  const esperada = createHmac('sha256', segredo).update(`${ts}.`).update(bruto).digest('hex')
  const a = Buffer.from(assinatura, 'hex')
  const b = Buffer.from(esperada, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new NextResponse(null, { status: 401 })
  }

  let evento: {
    event?: string
    job_id?: string
    platform?: string
    result?: { success?: boolean; url?: string | null; error?: string | null }
  }
  try {
    evento = JSON.parse(bruto)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  // Conexão caiu/voltou etc. não têm onde ser gravados ainda — o disparo já
  // confere as contas antes de gastar, e /api/admin/redes-check mostra tudo.
  if (evento.event !== 'upload_completed') return NextResponse.json({ ok: true, ignorado: evento.event })

  const jobId = evento.job_id ?? ''
  const canal = evento.platform === 'twitter' ? 'x' : evento.platform
  // O id entra numa expressão de filtro do banco — formato estranho não passa.
  if (!JOB_VALIDO.test(jobId) || !canal) return NextResponse.json({ ok: true, mensagem: 'sem job_id ou plataforma' })

  // Cliente admin: o aviso chega sem sessão de gente, e a linha precisa mudar
  // mesmo assim. O job_id assinado é a autorização.
  const supabase = createAdminClient()
  const { data: registro } = await supabase
    .from('social_publications')
    .select('id,workspace_id')
    .or(`job_id.eq.${jobId},request_id.eq.${jobId}`)
    .limit(1)
    .maybeSingle()
  if (!registro) return NextResponse.json({ ok: true, mensagem: 'envio não encontrado' })

  const resultado = evento.result ?? {}
  const campos = resultado.success
    ? { estado: 'publicada', external_url: resultado.url ?? null, erro: null }
    : {
        estado: 'falhou',
        erro: semSegredo(explicarRecusaDaRede({ error: resultado.error }, adapter(canal)?.nome ?? canal)).slice(0, 500),
      }

  const { data: destinos } = await supabase
    .from('package_destinations')
    .update(campos)
    .eq('request_id', registro.id)
    .eq('canal', canal)
    .eq('workspace_id', registro.workspace_id)
    // Publicada não regride por um aviso atrasado; falho pode ser consertado.
    .in('estado', ['publicando', 'na_fila', 'falhou', 'publicada'])
    .select('package_id')

  // O status do pacote é consequência do estado dos destinos.
  const pacotes = [...new Set((destinos ?? []).map((d) => d.package_id as string))]
  for (const pacoteId of pacotes) {
    const { data: estados } = await supabase
      .from('package_destinations').select('estado')
      .eq('package_id', pacoteId).eq('workspace_id', registro.workspace_id)
    const lista = (estados ?? []).map((e) => e.estado)
    if (!lista.length) continue
    const publicados = lista.filter((e) => e === 'publicada').length
    const falhas = lista.filter((e) => e === 'falhou').length
    const pendentes = lista.filter((e) => !['publicada', 'na_fila', 'ignorada', 'falhou'].includes(e)).length
    const status = falhas > 0 || pendentes > 0
      ? (publicados > 0 ? 'parcial' : falhas > 0 ? 'falhou' : 'rascunho')
      : 'publicado'
    await supabase.from('social_packages').update({ status })
      .eq('id', pacoteId).eq('workspace_id', registro.workspace_id)
    revalidatePath(`/redes/${pacoteId}`)
  }
  if (pacotes.length) {
    revalidatePath('/redes')
    revalidatePath('/registro')
    revalidatePath('/dashboard')
  }

  return NextResponse.json({ ok: true, destinos: (destinos ?? []).length })
}
