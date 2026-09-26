import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { TERMO_VERSAO, hashDoTermo, textoDoTermo } from './termo'
import { codigoDoComprovante, descreverAparelho, documentoCanonico, ehCodigo, linkAberto, type DicasDoAparelho, type Preenchimento, type Tracos } from './regras'

/**
 * Autorização de imagem pelo link — o lado do servidor que não tem sessão:
 * a página pública lê a coleta pelo token e grava a assinatura com a chave de
 * serviço (o banco não deixa ninguém logado gravar nessas tabelas). Toda
 * leitura aqui confere o token; nada sai sem ele.
 */

type Admin = ReturnType<typeof createAdminClient>

export const LIMITE_POR_IP_POR_HORA = 60
export const LIMITE_POR_COLETA = 500

const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex')
const tokenValido = (t: string) => /^[A-Za-z0-9_-]{32,64}$/.test(t)

export type FotoDaColeta = { id: string; nome: string; tipo: string; imagem: boolean }
export type ColetaPublica = {
  id: string
  workspaceId: string
  titulo: string
  descricao: string
  criadoPor: string | null
  aberta: boolean
  motivo?: string
  fotos: FotoDaColeta[]
}

/** A coleta pelo token do link, com as fotos que ainda existem na Biblioteca. */
export async function coletaPeloToken(token: string, admin: Admin = createAdminClient()): Promise<ColetaPublica | null> {
  if (!tokenValido(token)) return null
  const { data: c } = await admin.from('imagem_coletas')
    .select('id, workspace_id, titulo, descricao, file_ids, criado_por, expira_em, encerrada_em')
    .eq('token', token).maybeSingle()
  if (!c) return null
  const ids = (c.file_ids as string[]) ?? []
  const { data: arquivos } = ids.length
    ? await admin.from('files').select('id, name, content_type, file_type').eq('workspace_id', c.workspace_id as string).in('id', ids)
    : { data: [] }
  const porId = new Map((arquivos ?? []).map((a) => [a.id as string, a]))
  const fotos = ids.flatMap((id) => {
    const a = porId.get(id)
    if (!a) return []
    const tipo = String(a.content_type ?? '')
    return [{ id, nome: String(a.name ?? ''), tipo, imagem: tipo.startsWith('image/') || a.file_type === 'foto' }]
  })
  const { aberto, motivo } = linkAberto({ expira_em: c.expira_em as string | null, encerrada_em: c.encerrada_em as string | null })
  return {
    id: c.id as string, workspaceId: c.workspace_id as string, titulo: c.titulo as string, descricao: (c.descricao as string) ?? '',
    criadoPor: (c.criado_por as string | null) ?? null, aberta: aberto, motivo, fotos,
  }
}

/** O caminho no armazenamento de uma foto, só se ela pertence à coleta do token. */
export async function caminhoDaFoto(token: string, fileId: string): Promise<string | null> {
  if (!tokenValido(token) || !/^[0-9a-f-]{36}$/i.test(fileId)) return null
  const admin = createAdminClient()
  const { data: c } = await admin.from('imagem_coletas').select('workspace_id, file_ids').eq('token', token).maybeSingle()
  if (!c || !((c.file_ids as string[]) ?? []).includes(fileId)) return null
  const { data: f } = await admin.from('files').select('storage_path').eq('workspace_id', c.workspace_id as string).eq('id', fileId).maybeSingle()
  return (f?.storage_path as string | null) ?? null
}

export type Provas = { ip: string; userAgent: string; dicas: DicasDoAparelho }
export type ResultadoDaAssinatura = { ok: true; codigo: string; chave: string } | { ok: false; status: number; erro: string }

/**
 * Grava uma assinatura. O documento assinado (quem, o quê, as fotos, o termo,
 * a assinatura, o aparelho e a hora) vira um JSON canônico cujo SHA-256 fica
 * gravado: qualquer alteração posterior deixaria de bater. A `chave` volta só
 * para quem assinou — é ela que abre o comprovante e permite revogar; o banco
 * guarda apenas o hash dela.
 */
export async function registrarAssinatura(token: string, dados: Preenchimento, tracos: Tracos, provas: Provas): Promise<ResultadoDaAssinatura> {
  const admin = createAdminClient()
  const coleta = await coletaPeloToken(token, admin)
  if (!coleta) return { ok: false, status: 404, erro: 'Link não encontrado. Confira o endereço com a equipe da Cruz Vermelha.' }
  if (!coleta.aberta) return { ok: false, status: 410, erro: coleta.motivo ?? 'Este link não aceita mais assinaturas.' }

  const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString()
  const [{ count: doIp }, { count: total }] = await Promise.all([
    admin.from('imagem_autorizacoes').select('id', { count: 'exact', head: true }).eq('coleta_id', coleta.id).eq('ip', provas.ip).gte('assinado_em', umaHoraAtras),
    admin.from('imagem_autorizacoes').select('id', { count: 'exact', head: true }).eq('coleta_id', coleta.id),
  ])
  if ((doIp ?? 0) >= LIMITE_POR_IP_POR_HORA) return { ok: false, status: 429, erro: 'Muitas assinaturas seguidas deste aparelho. Espere um pouco e tente de novo.' }
  if ((total ?? 0) >= LIMITE_POR_COLETA) return { ok: false, status: 422, erro: 'Este link chegou ao limite de assinaturas. Peça um novo à equipe.' }

  // O texto do termo fica guardado na primeira assinatura de cada versão (e nunca muda).
  const termoHash = hashDoTermo()
  const { error: erroDoTermo } = await admin.from('imagem_termo_versoes')
    .upsert({ versao: TERMO_VERSAO, texto: textoDoTermo(), hash: termoHash }, { onConflict: 'versao', ignoreDuplicates: true })
  if (erroDoTermo) { console.error('[imagem] termo:', erroDoTermo.message); return { ok: false, status: 500, erro: 'Não foi possível registrar agora. Tente de novo em instantes.' } }

  const aparelho = descreverAparelho(provas.userAgent, provas.dicas)
  const fileIds = coleta.fotos.map((f) => f.id)
  const chave = randomBytes(24).toString('base64url')

  // Código repetido é raríssimo (32⁸), mas o unique do banco decide: tenta de novo.
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const codigo = codigoDoComprovante(randomBytes(8))
    const assinadoEm = new Date().toISOString()
    const registro = {
      workspace_id: coleta.workspaceId, coleta_id: coleta.id, codigo,
      nome: dados.nome, vinculo: dados.vinculo, contato: dados.contato, menor: dados.menor,
      responsavel_nome: dados.responsavelNome, responsavel_parentesco: dados.responsavelParentesco,
      usos: dados.usos, assinatura: tracos, file_ids: fileIds,
      termo_versao: TERMO_VERSAO, termo_hash: termoHash,
      ip: provas.ip.slice(0, 64), user_agent: provas.userAgent.slice(0, 500), aparelho, aparelho_detalhes: provas.dicas,
      assinado_em: assinadoEm,
    }
    const documento_hash = sha256(documentoCanonico(registro))
    const { error } = await admin.from('imagem_autorizacoes').insert({ ...registro, documento_hash, revogar_token_hash: sha256(chave) })
    if (!error) {
      if (coleta.criadoPor) {
        await notificar(admin, {
          workspaceId: coleta.workspaceId, para: [coleta.criadoPor], atorId: null, categoria: 'aprovacoes',
          titulo: 'Nova autorização de imagem', mensagem: `${dados.nome.slice(0, 120)} assinou a autorização de "${coleta.titulo.slice(0, 80)}".`,
          link: `/biblioteca/autorizacoes/${coleta.id}`, botao: 'Ver assinaturas',
        })
      }
      return { ok: true, codigo, chave }
    }
    if (error.code !== '23505') { console.error('[imagem] assinatura:', error.message); break }
  }
  return { ok: false, status: 500, erro: 'Não foi possível registrar agora. Tente de novo em instantes.' }
}

export type Comprovante = {
  codigo: string
  titulo: string
  nome: string
  vinculo: string
  contato: string | null
  menor: boolean
  responsavelNome: string | null
  responsavelParentesco: string | null
  usos: string[]
  assinatura: Tracos
  aparelho: string
  ip: string | null
  assinadoEm: string
  termoVersao: string
  termoHash: string
  documentoHash: string
  fotos: number
  revogadaEm: string | null
  revogadaPor: string | null
}

/** O comprovante de quem assinou: só abre com o código e a chave certa. */
export async function comprovante(codigo: string, chave: string): Promise<Comprovante | null> {
  if (!ehCodigo(codigo) || !/^[A-Za-z0-9_-]{20,64}$/.test(chave)) return null
  const admin = createAdminClient()
  const { data: a } = await admin.from('imagem_autorizacoes')
    .select('codigo, nome, vinculo, contato, menor, responsavel_nome, responsavel_parentesco, usos, assinatura, aparelho, ip, assinado_em, termo_versao, termo_hash, documento_hash, file_ids, revogada_em, revogada_por, revogar_token_hash, imagem_coletas(titulo)')
    .eq('codigo', codigo).maybeSingle()
  if (!a || a.revogar_token_hash !== sha256(chave)) return null
  const coleta = (Array.isArray(a.imagem_coletas) ? a.imagem_coletas[0] : a.imagem_coletas) as { titulo?: string } | null
  return {
    codigo: a.codigo as string, titulo: coleta?.titulo ?? '', nome: a.nome as string, vinculo: a.vinculo as string,
    contato: a.contato as string | null, menor: Boolean(a.menor), responsavelNome: a.responsavel_nome as string | null,
    responsavelParentesco: a.responsavel_parentesco as string | null, usos: (a.usos as string[]) ?? [], assinatura: (a.assinatura as Tracos) ?? [],
    aparelho: a.aparelho as string, ip: a.ip as string | null, assinadoEm: a.assinado_em as string, termoVersao: a.termo_versao as string,
    termoHash: a.termo_hash as string, documentoHash: a.documento_hash as string, fotos: ((a.file_ids as string[]) ?? []).length,
    revogadaEm: a.revogada_em as string | null, revogadaPor: a.revogada_por as string | null,
  }
}

/** Quem assinou revoga pelo comprovante. Vale dali em diante; o registro fica. */
export async function revogarPeloTitular(codigo: string, chave: string, motivo: string): Promise<{ ok: boolean; erro?: string }> {
  const atual = await comprovante(codigo, chave)
  if (!atual) return { ok: false, erro: 'Comprovante não encontrado.' }
  if (atual.revogadaEm) return { ok: true }
  const admin = createAdminClient()
  const { data, error } = await admin.from('imagem_autorizacoes')
    .update({ revogada_em: new Date().toISOString(), revogada_por: 'titular', revogacao_motivo: motivo.replace(/\s+/g, ' ').trim().slice(0, 500) || null })
    .eq('codigo', codigo).is('revogada_em', null)
    .select('workspace_id, coleta_id, nome, imagem_coletas(criado_por, titulo)').maybeSingle()
  if (error) { console.error('[imagem] revogar:', error.message); return { ok: false, erro: 'Não foi possível revogar agora. Tente de novo.' } }
  const coleta = (Array.isArray(data?.imagem_coletas) ? data?.imagem_coletas[0] : data?.imagem_coletas) as { criado_por?: string | null; titulo?: string } | null
  if (data && coleta?.criado_por) {
    await notificar(admin, {
      workspaceId: data.workspace_id as string, para: [coleta.criado_por], atorId: null, categoria: 'aprovacoes',
      titulo: 'Autorização de imagem revogada', mensagem: `${String(data.nome).slice(0, 120)} revogou a autorização de "${String(coleta.titulo ?? '').slice(0, 80)}". Não use mais essas fotos com essa pessoa em publicações novas.`,
      link: `/biblioteca/autorizacoes/${data.coleta_id}`, botao: 'Ver a coleta',
    })
  }
  return { ok: true }
}
