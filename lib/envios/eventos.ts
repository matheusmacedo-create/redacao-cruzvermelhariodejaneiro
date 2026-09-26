import 'server-only'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { armazenamento } from './servidor'
import { entraNoAlbum, primeiroNome } from './album'
import { nomeDaChave } from './regras'

/**
 * O lado do servidor do Álbum do evento (docs/envio-de-acoes.md §9). As
 * rotas públicas (/enviar/[codigo], /album/[token], /api/publico/album) não
 * têm sessão: tudo aqui usa o cliente de serviço e só devolve o que o código
 * ou o token abre.
 */

type Admin = ReturnType<typeof createAdminClient>

export const novoCodigo = () => {
  const letras = 'abcdefghijkmnpqrstuvwxyz23456789'
  return [...randomBytes(10)].map((b) => letras[b % letras.length]).join('').padEnd(10, 'x').slice(0, 10)
}
export const novoTokenDoAlbum = () => randomBytes(24).toString('base64url')
export const ehCodigo = (c: string) => /^[a-z0-9]{10}$/.test(c)
export const ehTokenDoAlbum = (t: string) => /^[A-Za-z0-9_-]{32}$/.test(t)

export type Evento = {
  id: string; workspace_id: string; nome: string; data_do_evento: string | null; local: string | null
  codigo: string; album_token: string | null; envio_aberto: boolean
}
const COLUNAS = 'id, workspace_id, nome, data_do_evento, local, codigo, album_token, envio_aberto'

/** O evento pelo código do link de envio (só se ainda aceita envios). */
export async function eventoPeloCodigo(codigo: string, admin: Admin = createAdminClient()): Promise<Evento | null> {
  if (!ehCodigo(codigo)) return null
  try {
    const { data } = await admin.from('envio_eventos').select(COLUNAS).eq('codigo', codigo).eq('envio_aberto', true).maybeSingle()
    return (data as Evento | null) ?? null
  } catch { return null }
}

export type FotoDoAlbum = {
  /** `nome` é o nome canônico do arquivo (o da chave), que vai no download e no .zip. */
  id: string; nome: string; categoria: 'foto' | 'video'; tamanho: number; tipo: string | null
  autor: string; temMiniatura: boolean; quando: string
}

/** O álbum pelo token: o evento e o que pode aparecer (foto e vídeo recebidos e não escondidos). */
export async function albumPeloToken(token: string, admin: Admin = createAdminClient()): Promise<{ evento: Evento; fotos: FotoDoAlbum[] } | null> {
  if (!ehTokenDoAlbum(token)) return null
  const { data: evento } = await admin.from('envio_eventos').select(COLUNAS).eq('album_token', token).maybeSingle()
  if (!evento) return null
  const fotos = await arquivosDoEvento(admin, (evento as Evento).id)
  return { evento: evento as Evento, fotos: fotos.filter((f) => !f.oculto).map(({ oculto: _o, ...f }) => f) }
}

/** Todos os arquivos de foto e vídeo do evento, com os escondidos marcados (a tela interna mostra tudo). */
export async function arquivosDoEvento(admin: Admin, eventoId: string): Promise<(FotoDoAlbum & { oculto: boolean; envioId: string })[]> {
  const { data } = await admin.from('envios')
    .select('id, nome, estado, envio_arquivos(id, chave, nome, categoria, tamanho, tipo_mime, estado, oculto_no_album, miniatura, recebido_em, criado_em)')
    .eq('evento_id', eventoId).neq('estado', 'arquivado').order('criado_em').limit(500)
  type Linha = { id: string; nome: string; envio_arquivos: { id: string; chave: string; nome: string; categoria: string; tamanho: number; tipo_mime: string | null; estado: string; oculto_no_album: boolean; miniatura: string | null; recebido_em: string | null; criado_em: string }[] }
  return ((data ?? []) as Linha[]).flatMap((e) => (e.envio_arquivos ?? [])
    .filter((a) => entraNoAlbum({ id: a.id, nome: a.nome, categoria: a.categoria, tamanho: a.tamanho, autor: e.nome, estado: a.estado }))
    .map((a) => ({
      id: a.id, nome: nomeDaChave(a.chave), categoria: a.categoria as 'foto' | 'video', tamanho: Number(a.tamanho), tipo: a.tipo_mime,
      autor: primeiroNome(e.nome), temMiniatura: Boolean(a.miniatura), quando: a.recebido_em ?? a.criado_em,
      oculto: a.oculto_no_album, envioId: e.id,
    })))
    .sort((x, y) => x.quando.localeCompare(y.quando))
}

/** A chave no R2 de um arquivo do evento (e da miniatura), conferindo que ele é mesmo do evento. */
export async function chavesDoArquivo(admin: Admin, eventoId: string, arquivoId: string, incluirOcultos = false) {
  if (!/^[0-9a-f-]{36}$/.test(arquivoId)) return null
  const { data } = await admin.from('envio_arquivos')
    .select('chave, miniatura, nome, tipo_mime, categoria, estado, oculto_no_album, envios!inner(evento_id)')
    .eq('id', arquivoId).eq('envios.evento_id', eventoId).maybeSingle()
  const a = data as { chave: string; miniatura: string | null; nome: string; tipo_mime: string | null; categoria: string; estado: string; oculto_no_album: boolean } | null
  if (!a || a.estado !== 'recebido' || (a.categoria !== 'foto' && a.categoria !== 'video')) return null
  if (a.oculto_no_album && !incluirOcultos) return null
  return a
}

/** As chaves no R2 de todos os arquivos visíveis do evento, de uma vez (para o .zip). */
export async function chavesDoEvento(admin: Admin, eventoId: string): Promise<Map<string, { chave: string; miniatura: string | null; nome: string }>> {
  const { data } = await admin.from('envio_arquivos')
    .select('id, chave, miniatura, nome, envios!inner(evento_id)')
    .eq('envios.evento_id', eventoId).eq('estado', 'recebido').eq('oculto_no_album', false).in('categoria', ['foto', 'video']).limit(2000)
  return new Map(((data ?? []) as { id: string; chave: string; miniatura: string | null; nome: string }[]).map((a) => [a.id, a]))
}

/** Link assinado do R2 (GET, 10 minutos): ver, a miniatura ou baixar com o nome original. */
export function linkDoArquivo(a: { chave: string; miniatura: string | null; nome: string }, tipo: 'mini' | 'ver' | 'baixar'): string | null {
  const r2 = armazenamento()
  if (!r2) return null
  const chave = tipo === 'mini' && a.miniatura ? a.miniatura : a.chave
  // Baixa com o nome canônico (data-assunto-autor-número), não com o "IMG_4821" do celular.
  return urlAssinada(r2.config, r2.bucket, chave, 'GET', 600, tipo === 'baixar' ? { nomeParaBaixar: nomeDaChave(a.chave) } : {})
}
