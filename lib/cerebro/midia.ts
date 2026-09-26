import { put, del } from '@vercel/blob'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WORKSPACE_STORAGE_LIMIT } from '@/lib/storage'
import { otimizarImagem } from '@/lib/midia/otimizar-imagem'
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
 *
 * A capa entra leve, como toda foto da Biblioteca (lib/midia/otimizar-imagem.ts),
 * e só se couber na cota do espaço.
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

    // JPEG girado, sem metadados e no lado maior da Biblioteca. Se o sharp não
    // abrir, a capa vai como veio (sem `otimizado_em`, continua candidata).
    const extensaoRecebida = `.${contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'}`
    let final: { bytes: Buffer; tipo: string; extensao: string } = { bytes, tipo: contentType, extensao: extensaoRecebida }
    let otimizadoEm: string | null = null
    try {
      const otimizada = await otimizarImagem(bytes, contentType, 'padrao')
      final = { bytes: otimizada.bytes, tipo: otimizada.tipo, extensao: otimizada.extensao || extensaoRecebida }
      otimizadoEm = new Date().toISOString()
    } catch (causa) {
      console.error('[cerebro] a capa não pôde ser otimizada, vai como veio:', causa instanceof Error ? causa.message : causa)
    }

    // A cota vale para a capa como para qualquer arquivo da Biblioteca.
    const { data: uso, error: erroUso } = await supabase
      .from('files').select('size_bytes').eq('workspace_id', workspaceId).neq('status', 'deleted')
    if (erroUso) return { fileId: null, motivo: 'não foi possível conferir o espaço da Biblioteca' }
    const usado = (uso ?? []).reduce((total, linha) => total + Number(linha.size_bytes ?? 0), 0)
    if (usado + final.bytes.length > WORKSPACE_STORAGE_LIMIT) {
      return { fileId: null, motivo: 'o espaço de armazenamento da Biblioteca acabou' }
    }

    const nome = `cerebro-${sinalId}${final.extensao}`
    const caminho = `workspaces/${workspaceId}/library/${crypto.randomUUID()}${final.extensao}`
    const blob = await put(caminho, final.bytes, { access: 'private', addRandomSuffix: false, contentType: final.tipo })

    const { data: linha, error } = await supabase.from('files').insert({
      workspace_id: workspaceId,
      name: nome,
      original_name: nome,
      file_type: 'foto',
      content_type: final.tipo,
      storage_path: blob.pathname,
      size_bytes: final.bytes.length,
      status: 'available',
      authorization_status: midia.daCasa ? 'pending' : 'internal',
      // A etiqueta de crédito viaja com o arquivo: quem abrir a Biblioteca
      // meses depois precisa saber de onde a imagem veio.
      tags: ['cerebro', 'redes', midia.daCasa ? 'material-da-casa' : 'referencia-de-terceiro'],
      uploaded_by: usuarioId,
      otimizado_em: otimizadoEm,
      tamanho_original: otimizadoEm ? bytes.length : null,
    }).select('id').single()

    if (error || !linha) {
      // Blob sem linha no banco é arquivo invisível ocupando espaço para sempre.
      await del(blob.pathname).catch(() => {})
      return { fileId: null, motivo: 'não foi possível registrar a capa na Biblioteca' }
    }
    return { fileId: linha.id }
  } catch (causa) {
    const timeout = causa instanceof Error && causa.name === 'TimeoutError'
    return { fileId: null, motivo: timeout ? 'a capa demorou para responder' : 'falha ao baixar a capa' }
  }
}
