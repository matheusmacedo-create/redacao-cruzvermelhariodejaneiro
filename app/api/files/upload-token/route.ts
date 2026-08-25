import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_FILE_LIMIT, LIBRARY_MIME_TYPES, WORKSPACE_STORAGE_LIMIT } from '@/lib/storage'

export const runtime = 'nodejs'

/**
 * Emite a permissão para o navegador enviar o arquivo direto ao Blob.
 *
 * Por que não passar pela função, como antes: a Vercel corta o corpo da
 * requisição em 4,5 MB. Um Reels de 40 MB nunca chegaria aqui — e o limite
 * antigo de 10 MB, na prática, já falhava em produção acima de 4,5 MB.
 *
 * A função continua sendo o guarda: confere sessão, tipo, tamanho declarado e
 * espaço restante antes de liberar o envio. O registro no banco acontece
 * depois, em /api/files/register, contra o tamanho real do arquivo gravado.
 */
export async function POST(request: Request) {
  const context = await requireWorkspace()
  const body = (await request.json()) as HandleUploadBody

  try {
    const resposta = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // O caminho vem do navegador e NÃO pode ser trocado aqui: o retorno
        // desta função só aceita allowedContentTypes, maximumSizeInBytes,
        // validUntil, addRandomSuffix, allowOverwrite, cacheControlMaxAge e
        // ifMatch. Devolver "pathname" era ignorado em silêncio.
        //
        // Então o gate é este: recusar o envio quando o caminho pedido não
        // pertence a este espaço. Sem isto, um cliente gravaria onde quisesse.
        const prefixo = `workspaces/${context.workspace.id}/library/`
        if (!pathname.startsWith(prefixo) || pathname.includes('..')) {
          throw new Error('Caminho de destino inválido para este espaço.')
        }

        const declarado = Number(clientPayload ?? 0)
        if (!declarado || declarado > LIBRARY_FILE_LIMIT) {
          throw new Error(`O arquivo deve ter no máximo ${Math.round(LIBRARY_FILE_LIMIT / 1024 / 1024)} MB.`)
        }

        const supabase = await createClient()
        const { data: linhas, error } = await supabase
          .from('files').select('size_bytes')
          .eq('workspace_id', context.workspace.id).neq('status', 'deleted')
        if (error) throw new Error('Não foi possível verificar o espaço disponível.')

        const usado = (linhas ?? []).reduce((t, r) => t + Number(r.size_bytes ?? 0), 0)
        if (usado + declarado > WORKSPACE_STORAGE_LIMIT) {
          throw new Error('O espaço de armazenamento do espaço foi atingido.')
        }

        return {
          allowedContentTypes: [...LIBRARY_MIME_TYPES],
          maximumSizeInBytes: LIBRARY_FILE_LIMIT,
          // O nome já carrega um identificador único vindo do cliente; sufixo
          // aleatório em cima disso só deixaria o caminho ilegível.
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ workspaceId: context.workspace.id, userId: context.user.id }),
        }
      },
      // O registro no banco não vem daqui. Este retorno de chamada é um webhook
      // da Vercel que não dispara em desenvolvimento e pode se perder; o
      // arquivo ficaria no armazenamento sem linha nenhuma apontando para ele.
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(resposta)
  } catch (causa) {
    const mensagem = causa instanceof Error ? causa.message : 'Não foi possível autorizar o envio.'
    return NextResponse.json({ error: mensagem }, { status: 400 })
  }
}
