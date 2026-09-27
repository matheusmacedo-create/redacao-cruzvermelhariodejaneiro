import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { NINGUEM, type Membro } from '@/lib/membro/sessao'
import { CODIGO_DE_CERTIFICADO, normalizarCodigo } from './regras'
import { gerarPdfDeDiplomas, gerarPdfDoDiploma } from './diploma-pdf'
import { logoOficial } from '@/lib/pdf/logo'
import { urlBase } from '@/lib/newsletter/contexto'

/**
 * Diplomas de Reconhecimento no servidor (migração 20260929040000). Os de
 * horas saem sozinhos no banco; aqui é só leitura e o PDF. Sem a migração,
 * as leituras devolvem vazio em vez de quebrar a tela.
 */

export type Diploma = {
  id: string
  workspace_id: string
  participante_id: string
  codigo: string
  nome: string
  motivo: 'horas' | 'coordenacao'
  marco_horas: number | null
  texto: string | null
  emitido_em: string
  revogado_em: string | null
}

const COLUNAS = 'id,workspace_id,participante_id,codigo,nome,motivo,marco_horas,texto,emitido_em,revogado_em'

export const urlDeVerificacaoDoDiploma = (codigo: string) => `${urlBase()}/diploma/${codigo}`

/** Os diplomas válidos do voluntário da sessão, do mais novo ao mais antigo. */
export async function diplomasDoMembro(m: Membro): Promise<Diploma[]> {
  if (m.participanteId === NINGUEM) return []
  const { data, error } = await createAdminClient().from('diplomas').select(COLUNAS)
    .eq('participante_id', m.participanteId).is('revogado_em', null).order('emitido_em', { ascending: false })
  return error ? [] : (data as Diploma[])
}

/** Um diploma pelo código (válido ou cancelado). null se não existe ou o código é malformado. */
export async function diplomaPorCodigo(bruto: string): Promise<Diploma | null> {
  const codigo = normalizarCodigo(bruto)
  if (!CODIGO_DE_CERTIFICADO.test(codigo)) return null
  const { data, error } = await createAdminClient().from('diplomas').select(COLUNAS).eq('codigo', codigo).maybeSingle()
  if (error) throw new Error('Diplomas indisponíveis.')
  return (data as Diploma | null) ?? null
}

export async function pdfDoDiploma(d: Diploma): Promise<Response> {
  const pdf = await gerarPdfDoDiploma({
    nome: d.nome, motivo: d.motivo, marcoHoras: d.marco_horas, texto: d.texto, emitidoEm: d.emitido_em,
    codigo: d.codigo, urlDeVerificacao: urlDeVerificacaoDoDiploma(d.codigo), logo: await logoOficial(),
  })
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="diploma-${d.codigo}.pdf"`, 'Cache-Control': 'private, no-store' } })
}

/** Os diplomas válidos de uma filial pelos códigos, na ordem pedida. */
export async function diplomasPorCodigos(workspaceId: string, codigos: string[]): Promise<Diploma[]> {
  if (!codigos.length) return []
  const { data, error } = await createAdminClient().from('diplomas').select(COLUNAS)
    .eq('workspace_id', workspaceId).in('codigo', codigos).is('revogado_em', null)
  if (error) throw new Error('Diplomas indisponíveis.')
  const porCodigo = new Map((data as Diploma[]).map((d) => [d.codigo, d]))
  return codigos.map((c) => porCodigo.get(c)).filter((d): d is Diploma => Boolean(d))
}

/** Vários diplomas num PDF só, uma página A3 cada, para imprimir de uma vez na cerimônia. */
export async function pdfDeVariosDiplomas(lista: Diploma[]): Promise<Response> {
  const logo = await logoOficial()
  const pdf = await gerarPdfDeDiplomas(lista.map((d) => ({
    nome: d.nome, motivo: d.motivo, marcoHoras: d.marco_horas, texto: d.texto, emitidoEm: d.emitido_em,
    codigo: d.codigo, urlDeVerificacao: urlDeVerificacaoDoDiploma(d.codigo), logo,
  })))
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="diplomas-${lista.length}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
