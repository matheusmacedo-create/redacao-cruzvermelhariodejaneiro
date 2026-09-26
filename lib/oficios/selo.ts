import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { obterChaveDaTrilha } from '@/lib/auditoria/chave'
import { assinarManifesto, conferirAssinatura, idDaChave } from '@/lib/auditoria/assinatura'
import { createPublicKey } from 'node:crypto'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { lerCanonico } from './documento'

/**
 * O selo digital da filial nos ofícios assinados.
 *
 * O registro no Bitcoin (lib/oficios/carimbo.ts) prova QUANDO o manifesto de
 * assinaturas existia — mas qualquer um pode carimbar qualquer hash. O selo
 * prova QUEM: a Redação assina o mesmo manifesto com a chave Ed25519 da
 * filial (a da trilha pública, guardada no cofre; a chave pública e a
 * impressão digital estão publicadas em /verificar/chave-publica.pem).
 *
 * A mensagem selada é um texto legível — dá para conferir com openssl sem o
 * Redação:
 *
 *   openssl pkeyutl -verify -pubin -inkey chave-publica.pem -rawin \
 *     -in selo.txt -sigfile selo.sig
 */

export const VERSAO_DO_SELO = 'selo-cvbrj/1'

export type OficioParaSelo = {
  id: string
  workspace_id: string
  numero: string | null
  codigo_verificacao: string
  hash_documento: string | null
  hash_manifesto: string | null
  assinado_em: string | null
}

export type Selo = {
  versao: string
  chave_id: string
  chave_publica: string
  mensagem: string
  assinatura: string
  selado_em: string
}

/** "a1b2c3d4e5f60718" → "A1B2-C3D4-E5F6-0718", para ler e comparar a olho. */
export const impressaoLegivel = (id: string) => id.toUpperCase().match(/.{1,4}/g)?.join('-') ?? id

/** O texto que a chave assina. Mesmo ofício, mesmo texto. */
export function mensagemDoSelo(o: OficioParaSelo): string {
  return [
    `Selo digital da ${DADOS_DA_FILIAL.nome}`,
    `CNPJ: ${DADOS_DA_FILIAL.cnpj}`,
    `Formato: ${VERSAO_DO_SELO}`,
    `Ofício: ${o.numero ?? '(sem número)'}`,
    `Código de verificação: ${o.codigo_verificacao}`,
    `Documento (SHA-256): ${o.hash_documento}`,
    `Manifesto de assinaturas (SHA-256): ${o.hash_manifesto}`,
    `Assinaturas concluídas em: ${o.assinado_em}`,
  ].join('\n') + '\n'
}

/**
 * Sela o ofício se ele já terminou de ser assinado e ainda não tem selo. Sem
 * a chave configurada, não faz nada (o ofício continua válido; o selo vem
 * quando a chave chegar). Nunca lança.
 */
export async function garantirSelo(oficioId: string): Promise<Selo | null> {
  try {
    const admin = createAdminClient()
    const { data: ja } = await admin.from('oficio_selos').select('versao,chave_id,chave_publica,mensagem,assinatura,selado_em').eq('oficio_id', oficioId).maybeSingle()
    if (ja) return ja as Selo
    const { data: o } = await admin.from('oficios').select('id,workspace_id,estado,conteudo_canonico,codigo_verificacao,hash_documento,hash_manifesto,assinado_em').eq('id', oficioId).maybeSingle()
    if (!o || o.estado !== 'assinado' || !o.hash_manifesto || !o.assinado_em) return null
    const chave = await obterChaveDaTrilha()
    if (!chave) return null
    const oficio: OficioParaSelo = {
      id: o.id as string, workspace_id: o.workspace_id as string,
      // O número como está no documento assinado ("001/2026"): a conferência usa o mesmo.
      numero: lerCanonico(o.conteudo_canonico as string | null)?.numero ?? null,
      codigo_verificacao: o.codigo_verificacao as string, hash_documento: o.hash_documento as string | null,
      hash_manifesto: o.hash_manifesto as string, assinado_em: new Date(o.assinado_em as string).toISOString(),
    }
    const mensagem = mensagemDoSelo(oficio)
    const selo = {
      oficio_id: oficio.id, workspace_id: oficio.workspace_id, versao: VERSAO_DO_SELO,
      chave_id: chave.chave.id, chave_publica: chave.chave.publicaPem.trim(), mensagem,
      assinatura: assinarManifesto(mensagem, chave.chave),
    }
    // Dois pedidos ao mesmo tempo: fica o primeiro (a chave primária decide).
    const { error } = await admin.from('oficio_selos').insert(selo)
    if (error && error.code !== '23505') { console.error('[oficios] selo:', error.message); return null }
    const { data: gravado } = await admin.from('oficio_selos').select('versao,chave_id,chave_publica,mensagem,assinatura,selado_em').eq('oficio_id', oficioId).maybeSingle()
    return (gravado as Selo | null) ?? null
  } catch (causa) {
    console.error('[oficios] não foi possível selar', oficioId, causa instanceof Error ? causa.message : causa)
    return null
  }
}

export type ConferenciaDoSelo = {
  /** A assinatura confere com a chave pública gravada no selo. */
  assinaturaValida: boolean
  /** A mensagem selada é deste ofício (números e hashes batem com o registro). */
  mensagemConfere: boolean
  /** A chave do selo é a chave atual da filial (a publicada). */
  chaveAtual: boolean | null
}

export async function conferirSelo(selo: Selo, o: OficioParaSelo): Promise<ConferenciaDoSelo> {
  let chaveBate = false
  try { chaveBate = idDaChave(createPublicKey(selo.chave_publica)) === selo.chave_id } catch { chaveBate = false }
  const assinaturaValida = chaveBate && conferirAssinatura(selo.mensagem, selo.assinatura, selo.chave_publica)
  const esperado = mensagemDoSelo({ ...o, assinado_em: o.assinado_em ? new Date(o.assinado_em).toISOString() : null })
  let chaveAtual: boolean | null = null
  try {
    const atual = await obterChaveDaTrilha()
    chaveAtual = atual ? atual.chave.id === selo.chave_id : null
  } catch { chaveAtual = null }
  return { assinaturaValida, mensagemConfere: esperado === selo.mensagem, chaveAtual }
}

/**
 * Sela os ofícios assinados que ainda não têm selo (os de antes do selo, os
 * que concluíram sem a chave e qualquer falha de rede). Roda no agendador.
 */
export async function selarPendentes(limite = 25): Promise<number> {
  const admin = createAdminClient()
  const [{ data: assinados }, { data: selados }] = await Promise.all([
    admin.from('oficios').select('id').eq('estado', 'assinado').not('hash_manifesto', 'is', null).order('assinado_em', { ascending: false }).limit(500),
    admin.from('oficio_selos').select('oficio_id').limit(5000),
  ])
  const ja = new Set((selados ?? []).map((s) => s.oficio_id as string))
  let feitos = 0
  for (const o of (assinados ?? []).filter((x) => !ja.has(x.id as string)).slice(0, limite)) {
    if (await garantirSelo(o.id as string)) feitos++
  }
  return feitos
}
