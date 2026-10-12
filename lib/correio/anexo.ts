import 'server-only'
import { NextResponse } from 'next/server'
import { abrirConversa, type CaixaVisivel } from './caixa-de-entrada'
import { abreNoNavegador, cabecalho, decodificarPalavras, parteDaMensagem } from './leitura'
import { baixarAnexo, GmailError, lerMensagemDoGmail } from '@/lib/google/gmail'

/** Os parâmetros do endereço do anexo, conferidos; null se algum não serve. */
export function lerPedidoDeAnexo(q: URLSearchParams): { caixaId: string; mensagemId: string; parte: string; baixar: boolean } | null {
  const caixaId = q.get('caixa') ?? ''
  const mensagemId = q.get('mensagem') ?? ''
  const parte = q.get('parte') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(caixaId) || !/^[0-9a-f]{6,32}$/i.test(mensagemId) || !/^[0-9.]{1,20}$/.test(parte)) return null
  return { caixaId, mensagemId, parte, baixar: q.get('baixar') === '1' }
}

/**
 * Um anexo de um e-mail de uma caixa que a pessoa vê (quem chama já
 * conferiu a sessão e a caixa). A mensagem precisa ser da caixa: a conversa
 * dela é lida e a mensagem tem de estar entre as que a caixa vê (pelo
 * endereço ou pela etiqueta, lib/correio/leitura.ts → mensagensDaCaixa), e a
 * parte pedida precisa ser um anexo. Imagem e PDF abrem no navegador; o resto
 * baixa. Nada fica guardado. Serve ao Palácio (/api/correio/anexo) e ao app
 * de e-mail provisório (/api/email/anexo).
 */
export async function respostaDoAnexo(workspaceId: string, caixa: CaixaVisivel, pedido: { mensagemId: string; parte: string; baixar: boolean }): Promise<NextResponse> {
  const naoEncontrado = () => new NextResponse('Anexo não encontrado.', { status: 404 })
  try {
    const m = await lerMensagemDoGmail(workspaceId, pedido.mensagemId, 'full')
    const daCaixa = m.threadId ? await abrirConversa(workspaceId, caixa, m.threadId) : null
    if (!daCaixa?.some((x) => x.id === m.id)) return naoEncontrado()
    const p = parteDaMensagem(m.payload, pedido.parte)
    if (!p?.body?.attachmentId) return naoEncontrado()
    const bytes = await baixarAnexo(workspaceId, pedido.mensagemId, p.body.attachmentId)
    const tipo = (p.mimeType || 'application/octet-stream').toLowerCase()
    const nome = decodificarPalavras(p.filename || cabecalho(p, 'Content-ID').replace(/^<|>$/g, '') || 'anexo').replace(/[\r\n"]/g, '').slice(0, 180)
    const ascii = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_')
    const inline = abreNoNavegador(tipo) && !pedido.baixar
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
