import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { ANEXO_LIMITE, ANEXO_TIPOS, prefixoDeAnexos } from '@/lib/chamados/servidor'

export const runtime = 'nodejs'

/**
 * Permissão para o navegador enviar um anexo de chamado direto ao Blob
 * (mesmo desenho da Biblioteca: /api/files/upload-token). O arquivo só vira
 * anexo quando a action que abre ou comenta o chamado o registra — e ela
 * confere de novo o caminho, o tamanho e o tipo gravados.
 */
export async function POST(request: Request) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const body = (await request.json()) as HandleUploadBody
  try {
    const resposta = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // O caminho vem do navegador e não pode ser trocado aqui (ver o
        // comentário em /api/files/upload-token): então só confere.
        if (!pathname.startsWith(prefixoDeAnexos(context.workspace.id)) || pathname.includes('..')) {
          throw new Error('Caminho de destino inválido.')
        }
        const declarado = Number(clientPayload ?? 0)
        if (!declarado || declarado > ANEXO_LIMITE) throw new Error(`Cada anexo pode ter no máximo ${ANEXO_LIMITE / 1024 / 1024} MB.`)
        return {
          allowedContentTypes: [...ANEXO_TIPOS],
          maximumSizeInBytes: ANEXO_LIMITE,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ workspaceId: context.workspace.id, userId: context.user.id }),
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(resposta)
  } catch (causa) {
    return NextResponse.json({ error: causa instanceof Error ? causa.message : 'Não foi possível autorizar o envio.' }, { status: 400 })
  }
}
