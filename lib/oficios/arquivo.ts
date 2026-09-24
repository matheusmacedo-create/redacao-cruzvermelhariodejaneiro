import 'server-only'

import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { lerCanonico } from './documento'
import { gerarPdfDoOficio } from './pdf'

/**
 * Os PDFs dos ofícios no Storage (bucket privado "oficios"): o original,
 * gerado uma vez e registrado com o hash, e cada versão assinada que volta
 * do gov.br. Só o servidor lê e grava.
 */

const BUCKET = 'oficios'

export type OficioParaPdf = {
  id: string
  workspace_id: string
  estado: string
  modo_assinatura: 'senha' | 'govbr'
  conteudo_canonico: string | null
  hash_documento: string | null
  codigo_verificacao: string
  emitido_em: string | null
  pdf_original_sha256: string | null
  pdf_atual_path: string | null
  pdf_atual_sha256: string | null
  pdf_versao: number
}

export const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
export const caminhoDaVersao = (o: { workspace_id: string; id: string }, versao: number, sha: string) => `${o.workspace_id}/${o.id}/v${versao}-${sha.slice(0, 16)}.pdf`

async function baixar(path: string): Promise<Uint8Array> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('Não foi possível ler o PDF guardado.')
  return new Uint8Array(await data.arrayBuffer())
}

export async function guardar(path: string, bytes: Uint8Array) {
  const { error } = await createAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error('Não foi possível guardar o PDF.')
}

/**
 * O PDF da vez: o original (gerado e registrado na primeira vez que alguém
 * pede) ou a última versão assinada. Devolve também o hash registrado.
 */
export async function pdfAtual(o: OficioParaPdf): Promise<{ bytes: Uint8Array; sha256: string; versao: number }> {
  if (o.estado === 'rascunho') throw new Error('Rascunho não tem PDF: emita o ofício primeiro.')
  if (!o.pdf_original_sha256 || !o.pdf_atual_path) {
    const doc = lerCanonico(o.conteudo_canonico)
    if (!doc || !o.hash_documento || !o.emitido_em) throw new Error('Ofício sem conteúdo emitido.')
    const bytes = await gerarPdfDoOficio({
      doc, hashDocumento: o.hash_documento, codigoVerificacao: o.codigo_verificacao, urlBase: urlBase(), emitidoEm: o.emitido_em, modo: o.modo_assinatura,
    })
    const sha = sha256Hex(bytes)
    const path = caminhoDaVersao(o, 0, sha)
    await guardar(path, bytes)
    const admin = createAdminClient()
    await admin.rpc('registrar_pdf_original', { p_oficio_id: o.id, p_sha256: sha, p_tamanho: bytes.length, p_path: path })
    // Dois pedidos ao mesmo tempo: vale o que o banco registrou primeiro.
    const { data } = await admin.from('oficios').select('pdf_atual_path,pdf_atual_sha256,pdf_versao').eq('id', o.id).single()
    if (data?.pdf_atual_sha256 === sha) return { bytes, sha256: sha, versao: 0 }
    if (!data?.pdf_atual_path || !data.pdf_atual_sha256) throw new Error('Não foi possível registrar o PDF do ofício.')
    return { bytes: await baixar(data.pdf_atual_path), sha256: data.pdf_atual_sha256, versao: data.pdf_versao }
  }
  const bytes = await baixar(o.pdf_atual_path)
  // O arquivo guardado tem de ser o registrado: se não for, ninguém assina em cima.
  if (sha256Hex(bytes) !== o.pdf_atual_sha256) throw new Error('O PDF guardado não confere com o registro. Avise um admin.')
  return { bytes, sha256: o.pdf_atual_sha256 as string, versao: o.pdf_versao }
}

/**
 * Busca o certificado intermediário que o próprio certificado indica (AIA).
 * O endereço vem de dentro do PDF enviado, então só vai a nomes de domínio
 * públicos — nada de IP, localhost ou porta fora do padrão — e lê pouco.
 */
export async function buscarCertificado(url: string): Promise<Uint8Array | null> {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null
  if (u.port && !['80', '443'].includes(u.port)) return null
  const host = u.hostname.toLowerCase()
  if (isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) return null
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(10_000), redirect: 'error', cache: 'no-store' })
    if (!r.ok) return null
    const b = new Uint8Array(await r.arrayBuffer())
    return b.length > 1_000_000 ? null : b
  } catch {
    return null
  }
}
