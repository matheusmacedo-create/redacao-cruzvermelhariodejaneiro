import 'server-only'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { recortar, type CaixaDeRecorte } from '@/lib/publicacao/recorte'
import { ETIQUETA_DE_IA } from '@/lib/ia/etiqueta'

/**
 * Carrega arquivos da Biblioteca como bytes para envio às redes.
 *
 * Bytes, e não URL: os arquivos são privados, e o Upload-Post busca a URL a
 * partir do servidor dele — tomaria 403. Vivia dentro de app/actions/redes.ts;
 * saiu para cá porque o disparo do hub também precisa, e um arquivo 'use
 * server' não pode exportar helper sem transformá-lo em action chamável pelo
 * navegador.
 */
export async function carregarArquivo(
  fileId: string,
  workspaceId: string,
  crop?: CaixaDeRecorte,
) {
  const supabase = await createClient()
  const { data: arquivo } = await supabase
    .from('files')
    .select('name,content_type,storage_path,status,authorization_status,tags')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!arquivo || arquivo.status === 'deleted' || !arquivo.storage_path) {
    throw new Error('Arquivo não encontrado na Biblioteca deste espaço.')
  }

  // A tela já filtra, mas o id chega pelo formulário e formulário é do
  // navegador. Publicar imagem sem autorização de uso é o tipo de erro que
  // não se desfaz depois que saiu na página da instituição.
  if (arquivo.authorization_status !== 'authorized') {
    throw new Error(
      'Este arquivo não tem autorização de uso de imagem. Marque a autorização na Biblioteca antes de publicar.',
    )
  }

  const resultado = await get(arquivo.storage_path, { access: 'private' })
  if (!resultado) throw new Error('O arquivo não está mais disponível no armazenamento.')

  let bytes: Buffer = Buffer.from(await new Response(resultado.stream).arrayBuffer())
  const contentType = arquivo.content_type || resultado.blob.contentType || 'application/octet-stream'

  // O recorte acontece aqui, na hora do envio: o original da Biblioteca nunca
  // é alterado — a variante guarda só a intenção de corte.
  if (crop && contentType.startsWith('image/')) {
    bytes = await recortar(bytes, crop)
  }

  return {
    blob: new File([new Uint8Array(bytes)], arquivo.name || 'arquivo', { type: contentType }),
    contentType,
    storagePath: arquivo.storage_path,
    // A etiqueta viaja com o arquivo até o disparo: é ela que faz o conector
    // declarar à rede que a imagem é sintética.
    geradaPorIa: (arquivo.tags ?? []).includes(ETIQUETA_DE_IA),
  }
}

export async function carregarArquivos(
  fileIds: string[],
  workspaceId: string,
  crops?: Record<string, CaixaDeRecorte>,
) {
  const carregados = []
  for (const id of fileIds) carregados.push(await carregarArquivo(id, workspaceId, crops?.[id]))
  return carregados
}
