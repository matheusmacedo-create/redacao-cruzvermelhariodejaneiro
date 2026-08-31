import { put } from '@vercel/blob'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MidiaDaPauta } from './contrato'

/**
 * Traz a capa do sinal para a Biblioteca.
 *
 * A imagem precisa aparecer: sem ela a pessoa decide no escuro sobre um post
 * que ela não viu. Mas aparecer não é poder publicar — quem decide isso é
 * `authorization_status`, e o disparo já barra tudo que não esteja
 * `authorized` (lib/publicacao/arquivos.ts).
 *
 * - Material da própria filial entra como `pending`: é dela, e o que falta
 *   confirmar é quem aparece na foto.
 * - Material de terceiro entra como `internal`: serve de referência na tela
 *   e nunca sai publicado em nome da Cruz.
 */
const TETO_BYTES = 12 * 1024 * 1024
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

export async function trazerCapa(
  supabase: SupabaseClient,
  opcoes: { midia: MidiaDaPauta; workspaceId: string; usuarioId: string; sinalId: string },
): Promise<{ fileId: string | null; motivo?: string }> {
  const { midia, workspaceId, usuarioId, sinalId } = opcoes
  try {
    const r = await fetch(midia.url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' })
    if (!r.ok) return { fileId: null, motivo: `a capa respondeu ${r.status}` }

    const contentType = (r.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!TIPOS.includes(contentType)) return { fileId: null, motivo: `tipo não aceito (${contentType || 'desconhecido'})` }

    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length === 0 || bytes.length > TETO_BYTES) return { fileId: null, motivo: 'capa vazia ou grande demais' }

    const extensao = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    const nome = `cerebro-${sinalId}.${extensao}`
    const caminho = `workspaces/${workspaceId}/library/${crypto.randomUUID()}.${extensao}`
    const blob = await put(caminho, bytes, { access: 'private', addRandomSuffix: false, contentType })

    const { data: linha, error } = await supabase.from('files').insert({
      workspace_id: workspaceId,
      name: nome,
      original_name: nome,
      file_type: 'foto',
      content_type: contentType,
      storage_path: blob.pathname,
      size_bytes: bytes.length,
      status: 'available',
      authorization_status: midia.daCasa ? 'pending' : 'internal',
      // A etiqueta de crédito viaja com o arquivo: quem abrir a Biblioteca
      // meses depois precisa saber de onde a imagem veio.
      tags: ['cerebro', 'redes', midia.daCasa ? 'material-da-casa' : 'referencia-de-terceiro'],
      uploaded_by: usuarioId,
    }).select('id').single()

    if (error || !linha) {
      return { fileId: null, motivo: 'não foi possível registrar a capa na Biblioteca' }
    }
    return { fileId: linha.id }
  } catch (causa) {
    const timeout = causa instanceof Error && causa.name === 'TimeoutError'
    return { fileId: null, motivo: timeout ? 'a capa demorou para responder' : 'falha ao baixar a capa' }
  }
}
