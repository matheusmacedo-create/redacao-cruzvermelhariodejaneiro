import { NextResponse, type NextRequest } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { caixasVisiveis } from '@/lib/correio/caixa-de-entrada'
import { abreNoNavegador, cabecalho, decodificarPalavras, envolveOEndereco, parteDaMensagem } from '@/lib/correio/leitura'
import { baixarAnexo, GmailError, lerMensagemDoGmail } from '@/lib/google/gmail'

export const dynamic = 'force-dynamic'

/**
 * Um anexo de um e-mail da caixa do setor. Confere, nesta ordem: a sessão,
 * se a pessoa vê a caixa, se a mensagem envolve o endereço dela e se a
 * parte pedida é mesmo um anexo. Imagem e PDF abrem no navegador; o resto
 * baixa. Nada fica guardado.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const caixaId = q.get('caixa') ?? ''
  const mensagemId = q.get('mensagem') ?? ''
  const parte = q.get('parte') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(caixaId) || !/^[0-9a-f]{6,32}$/i.test(mensagemId) || !/^[0-9.]{1,20}$/.test(parte)) return new NextResponse('Anexo não encontrado.', { status: 404 })
  const context = await obterWorkspace()
  if (!context) return new NextResponse('Sessão expirada.', { status: 401 })
  const caixa = (await caixasVisiveis(context)).find((c) => c.id === caixaId)
  if (!caixa) return new NextResponse('Anexo não encontrado.', { status: 404 })
  try {
    const m = await lerMensagemDoGmail(context.workspace.id, mensagemId, 'full')
    if (!envolveOEndereco(m.payload, caixa.email)) return new NextResponse('Anexo não encontrado.', { status: 404 })
    const p = parteDaMensagem(m.payload, parte)
    if (!p?.body?.attachmentId) return new NextResponse('Anexo não encontrado.', { status: 404 })
    const bytes = await baixarAnexo(context.workspace.id, mensagemId, p.body.attachmentId)
    const tipo = (p.mimeType || 'application/octet-stream').toLowerCase()
    const nome = decodificarPalavras(p.filename || cabecalho(p, 'Content-ID').replace(/^<|>$/g, '') || 'anexo').replace(/[\r\n"]/g, '').slice(0, 180)
    const ascii = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_')
    const inline = abreNoNavegador(tipo) && q.get('baixar') !== '1'
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': inline ? tipo : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      },
    })
  } catch (causa) {
    return new NextResponse(causa instanceof GmailError ? causa.message : 'Não foi possível abrir o anexo.', { status: 502 })
  }
}
