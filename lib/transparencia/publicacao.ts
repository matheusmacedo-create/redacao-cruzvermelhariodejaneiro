import 'server-only'

import type { Client } from 'basic-ftp'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarArquivoDoPortal, enviarPastaFixaNaRaiz, removerArquivoDoPortal, withFtp } from '@/lib/publicacao/ftp'
import { descobrirRaizDoSite } from '@/lib/site/vitrine'
import { chaveDaTrilha } from '@/lib/auditoria/assinatura'
import { htaccessDoPortal, paginaDaTransparencia, paginaDosCanais, portalAberto, type DocumentoNoPortal, type ParceriaNoPortal, type VersaoNoPortal } from './paginas'
import type { Canal, Categoria, Instrumento, SituacaoDaPrestacao } from './regras'

type Admin = ReturnType<typeof createAdminClient>
type CodigoDaTrilha = { referencia_id: string; versao: number; codigo: string; hash: string; hash_arquivo: string | null; versao_origem?: number | null }

async function codigosDaTrilha(admin: Admin, tipo: string, ids: string[]): Promise<CodigoDaTrilha[]> {
  if (!ids.length) return []
  const { data, error } = await admin.rpc('auditoria_codigos_das_origens', { p_tipo: tipo, p_referencias: ids })
  if (error) throw new Error('Não foi possível ler os códigos da trilha.')
  return (data ?? []) as CodigoDaTrilha[]
}

/** O que está no ar: documentos não retirados com versão publicada, e parcerias publicadas e não retiradas. */
export async function dadosDoPortal(admin: Admin, workspaceId: string): Promise<{ documentos: DocumentoNoPortal[]; parcerias: ParceriaNoPortal[] }> {
  const [{ data: docs, error: e1 }, { data: parcs, error: e2 }] = await Promise.all([
    admin.from('transparencia_documentos')
      .select('id,categoria,titulo,descricao,periodo,ordem,transparencia_versoes(nome_original,tamanho,sha256,arquivo_publico,publicado_em,removido_do_site_em)')
      .eq('workspace_id', workspaceId).is('retirado_em', null).order('ordem').order('created_at'),
    admin.from('transparencia_parcerias').select('*').eq('workspace_id', workspaceId)
      .not('publicado_em', 'is', null).is('retirado_em', null).order('data_assinatura', { ascending: false, nullsFirst: false }),
  ])
  if (e1 || e2) throw new Error('Não foi possível ler o portal.')

  type Versao = { nome_original: string; tamanho: number; sha256: string; arquivo_publico: string | null; publicado_em: string | null; removido_do_site_em: string | null }
  const linhas = (docs ?? []) as { id: string; categoria: Categoria; titulo: string; descricao: string | null; periodo: string | null; transparencia_versoes: Versao[] }[]
  const codigosDocs = await codigosDaTrilha(admin, 'documento', linhas.map((d) => d.id))
  // Para cada arquivo, o registro mais novo com aquele SHA-256 (a ficha editada gera versão nova na trilha com o mesmo arquivo).
  const codigoDoArquivo = (docId: string, sha: string) =>
    codigosDocs.filter((c) => c.referencia_id === docId && c.hash_arquivo === sha).sort((a, b) => b.versao - a.versao)[0]?.codigo ?? null

  const documentos: DocumentoNoPortal[] = []
  for (const d of linhas) {
    const publicadas: VersaoNoPortal[] = d.transparencia_versoes
      .filter((v) => v.publicado_em && v.arquivo_publico)
      .sort((a, b) => (b.publicado_em ?? '').localeCompare(a.publicado_em ?? ''))
      .map((v) => ({ nome: v.nome_original, tamanho: v.tamanho, sha256: v.sha256, url: v.arquivo_publico!, publicadoEm: v.publicado_em!, codigo: codigoDoArquivo(d.id, v.sha256), removida: Boolean(v.removido_do_site_em) }))
    if (!publicadas.length) continue
    documentos.push({ id: d.id, categoria: d.categoria, titulo: d.titulo, descricao: d.descricao, periodo: d.periodo, atual: publicadas[0], anteriores: publicadas.slice(1) })
  }

  const listaDeParcerias = (parcs ?? []) as Record<string, unknown>[]
  const codigosParc = await codigosDaTrilha(admin, 'parceria', listaDeParcerias.map((p) => p.id as string))
  const parcerias: ParceriaNoPortal[] = listaDeParcerias.map((p) => {
    const ultimo = codigosParc.filter((c) => c.referencia_id === p.id).sort((a, b) => b.versao - a.versao)[0]
    return {
      id: p.id as string, instrumento: p.instrumento as Instrumento, numero: p.numero as string | null, orgao: p.orgao as string,
      orgao_cnpj: p.orgao_cnpj as string | null, objeto: p.objeto as string, data_assinatura: p.data_assinatura as string | null,
      vigencia_inicio: p.vigencia_inicio as string | null, vigencia_fim: p.vigencia_fim as string | null,
      valor_total: p.valor_total === null ? null : String(p.valor_total), valor_liberado: p.valor_liberado === null ? null : String(p.valor_liberado),
      situacao_prestacao: p.situacao_prestacao as SituacaoDaPrestacao, prestacao_final_em: p.prestacao_final_em as string | null,
      equipe: (p.equipe ?? []) as { funcao: string; remuneracao: string }[], observacao: p.observacao as string | null,
      publicadoEm: p.publicado_em as string, codigo: ultimo?.codigo ?? null, hash: ultimo?.hash ?? null,
    }
  })
  return { documentos, parcerias }
}

async function raizDoSite(client: Client, config: Parameters<typeof descobrirRaizDoSite>[1]): Promise<string> {
  const raiz = await descobrirRaizDoSite(client, config)
  if (!raiz) throw new Error('Não achei a pasta do site no FTP (confira em /api/admin/ftp-check).')
  return raiz
}

/** Regera /transparencia/ (página e .htaccess) na sessão dada. */
async function subirPortal(client: Client, raiz: string, admin: Admin, workspaceId: string) {
  const dados = await dadosDoPortal(admin, workspaceId)
  await enviarArquivoDoPortal(client, raiz, 'transparencia', '.htaccess', htaccessDoPortal())
  await enviarPastaFixaNaRaiz(client, raiz, 'transparencia', paginaDaTransparencia(dados))
}

/** Sobe um PDF do portal (nome já validado) e regera a página, numa sessão de FTP. */
export async function publicarNoPortal(workspaceId: string, pdf?: { nome: string; bytes: Buffer }): Promise<void> {
  const admin = createAdminClient()
  await withFtp(async (client, config) => {
    const raiz = await raizDoSite(client, config)
    if (pdf) await enviarArquivoDoPortal(client, raiz, 'transparencia', `arquivos/${pdf.nome}`, pdf.bytes)
    // A página só é regerada depois que o banco registra a publicação; aqui ela reflete o estado atual.
    await subirPortal(client, raiz, admin, workspaceId)
  })
}

/** Só a página (depois de retirar, editar ficha ou mudar parceria). */
export async function regerarPortal(workspaceId: string): Promise<void> {
  const admin = createAdminClient()
  await withFtp(async (client, config) => subirPortal(client, await raizDoSite(client, config), admin, workspaceId))
}

/** Sobe só o PDF (antes de marcar a versão como publicada no banco). */
export async function subirPdfDoPortal(nome: string, bytes: Buffer): Promise<void> {
  await withFtp(async (client, config) => {
    await enviarArquivoDoPortal(client, await raizDoSite(client, config), 'transparencia', `arquivos/${nome}`, bytes)
  })
}

/**
 * Documento retirado: apaga do site os PDFs dele (nomes já validados pela porta
 * do FTP) e regera a página, numa sessão. Quem chama registra no banco depois.
 */
export async function retirarPdfsDoPortal(workspaceId: string, nomes: string[]): Promise<void> {
  const admin = createAdminClient()
  await withFtp(async (client, config) => {
    const raiz = await raizDoSite(client, config)
    for (const nome of nomes) await removerArquivoDoPortal(client, raiz, nome)
    await subirPortal(client, raiz, admin, workspaceId)
  })
}

/** Regera /canais-oficiais/ com a versão mais nova. */
export async function regerarCanais(workspaceId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: v, error } = await admin.from('canais_oficiais_versoes').select('id,versao,canais,observacao,publicado_em')
    .eq('workspace_id', workspaceId).order('versao', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error('Não foi possível ler a lista de canais.')
  if (!v) return
  const codigos = await codigosDaTrilha(admin, 'canais', [workspaceId])
  // O registro desta versão da lista (o banco diz de qual versão cada registro é).
  const registro = codigos.filter((c) => c.versao_origem === v.versao).sort((a, b) => b.versao - a.versao)[0]
  let chaveId: string | null = null
  try { chaveId = chaveDaTrilha()?.id ?? null } catch { chaveId = null }
  const html = paginaDosCanais({
    versao: v.versao as number, canais: v.canais as Canal[], observacao: v.observacao as string | null, publicadoEm: v.publicado_em as string,
    codigo: registro?.codigo ?? null, hash: registro?.hash ?? null, chaveId,
  })
  await withFtp(async (client, config) => {
    const raiz = await raizDoSite(client, config)
    await enviarArquivoDoPortal(client, raiz, 'canais-oficiais', '.htaccess', htaccessDoPortal(portalAberto()))
    await enviarPastaFixaNaRaiz(client, raiz, 'canais-oficiais', html)
  })
}
