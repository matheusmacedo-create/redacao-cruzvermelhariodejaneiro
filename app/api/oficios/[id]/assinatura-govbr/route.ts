import { after } from 'next/server'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarCertificado, caminhoDaVersao, guardar, pdfAtual, type OficioParaPdf } from '@/lib/oficios/arquivo'
import { avaliarEnvio } from '@/lib/oficios/assinatura-pdf'
import { processarFila } from '@/lib/oficios/carimbo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LIMITE = 4 * 1024 * 1024
const CAMPOS = 'id,workspace_id,estado,modo_assinatura,conteudo_canonico,hash_documento,codigo_verificacao,emitido_em,pdf_original_sha256,pdf_atual_path,pdf_atual_sha256,pdf_versao,ano,numero,assunto'

const erro = (mensagem: string, status = 400) => Response.json({ erro: mensagem }, { status })

/**
 * Recebe o PDF assinado no gov.br por quem está na lista de assinatura.
 * Confere que é o PDF da vez com exatamente uma assinatura nova, íntegra,
 * de certificado gov.br ou ICP-Brasil, no nome de quem envia — e só então
 * guarda a nova versão e registra a assinatura.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return erro('Ofício não encontrado.', 404)
  const context = await requireWorkspace()
  const supabase = await createClient()

  const tamanho = Number(request.headers.get('content-length') ?? 0)
  if (tamanho > LIMITE + 64 * 1024) return erro('O PDF passa de 4 MB. Assine o arquivo baixado aqui, sem acrescentar páginas ou imagens.', 413)
  let arquivo: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('pdf')
    arquivo = f instanceof File ? f : null
  } catch {
    return erro('Envie o PDF assinado.')
  }
  if (!arquivo || !arquivo.size) return erro('Envie o PDF assinado.')
  if (arquivo.size > LIMITE) return erro('O PDF passa de 4 MB.', 413)

  const [{ data: o }, { data: minha }, { data: perfil }] = await Promise.all([
    supabase.from('oficios').select(CAMPOS).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('oficio_assinantes').select('estado').eq('oficio_id', id).eq('user_id', context.user.id).maybeSingle(),
    supabase.from('profiles').select('full_name').eq('id', context.user.id).maybeSingle(),
  ])
  if (!o) return erro('Ofício não encontrado.', 404)
  if (o.estado !== 'em_assinatura') return erro('Este ofício não está aguardando assinatura.', 409)
  if (o.modo_assinatura !== 'govbr') return erro('Este ofício é assinado com a senha do Palácio Virtual.', 409)
  if (minha?.estado !== 'pendente') return erro('Você não está entre quem assina este ofício, ou já assinou.', 403)

  try {
    const anterior = await pdfAtual(o as OficioParaPdf)
    const novo = new Uint8Array(await arquivo.arrayBuffer())
    const r = await avaliarEnvio(anterior.bytes, novo, perfil?.full_name ?? '', { buscar: buscarCertificado })
    if (!r.ok) return erro(r.erro, 422)

    const versao = anterior.versao + 1
    const path = caminhoDaVersao(o, versao, r.sha256)
    await guardar(path, novo)
    const h = request.headers
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || ''
    const certificado = {
      titular: r.nova.titular, cpf: r.nova.cpfMascarado, emissor: r.nova.emissor, serial: r.nova.serial,
      infraestrutura: r.nova.infraestrutura, assinado_em_no_pdf: r.nova.assinadoEm,
    }
    const { data: concluido, error } = await createAdminClient().rpc('registrar_assinatura_govbr', {
      p_oficio_id: o.id, p_user_id: context.user.id, p_pdf_anterior_sha256: anterior.sha256, p_pdf_sha256: r.sha256, p_pdf_path: path,
      p_certificado: certificado, p_ip: ip.slice(0, 64), p_user_agent: (h.get('user-agent') ?? '').slice(0, 300),
    })
    if (error) return erro(error.code === 'P0001' && error.message ? error.message : 'Não foi possível registrar a assinatura.', 409)

    const numero = o.numero ? `${String(o.numero).padStart(3, '0')}/${o.ano}` : ''
    await supabase.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: 'oficio_assinado', entity_type: 'oficio', entity_id: o.id,
      metadata: { numero, assunto: o.assunto, concluido: Boolean(concluido), metodo: 'govbr' },
    })
    if (concluido) after(async () => { await processarFila(1, o.id).catch(() => undefined) })
    return Response.json({ ok: true, concluido: Boolean(concluido), titular: r.nova.titular })
  } catch (causa) {
    return erro(causa instanceof Error ? causa.message : 'Não foi possível conferir o PDF.', 500)
  }
}
