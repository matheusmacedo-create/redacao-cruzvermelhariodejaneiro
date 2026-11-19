import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { urlBase } from '@/lib/newsletter/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Recebe a imagem do topo de uma edição escrita em "Nova edição" (19/11/2026).
 *
 * Imagem de e-mail precisa de endereço público: o cliente de e-mail não tem sessão. O armazenamento do Palácio é
 * privado (a Biblioteca inteira é), então a imagem é guardada lá, numa pasta só dela, e servida pela rota ao lado
 * (`[nome]`), que só entrega arquivos desta pasta, pelo nome que ninguém adivinha. Nada da Biblioteca fica público
 * por causa disto.
 *
 * A tela reduz a foto antes de mandar (1.200 px de largura, JPEG), então o arquivo chega pequeno; o limite daqui é a
 * rede de segurança. Só JPEG e PNG: WebP não abre no Outlook, e uma edição com quadro quebrado é pior do que sem imagem.
 */
const LIMITE = 3 * 1024 * 1024
const EXTENSAO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

export async function POST(request: Request) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  if (!pode(context.role, 'newsletter.enviar')) {
    return NextResponse.json({ erro: 'Pôr imagem numa edição é para administradores e editores.' }, { status: 403 })
  }

  const dados = await request.formData().catch(() => null)
  const arquivo = dados?.get('arquivo')
  if (!(arquivo instanceof File) || !arquivo.size) return NextResponse.json({ erro: 'Escolha uma imagem.' }, { status: 400 })
  const extensao = EXTENSAO[arquivo.type]
  if (!extensao) return NextResponse.json({ erro: 'Use uma foto em JPEG ou PNG.' }, { status: 400 })
  if (arquivo.size > LIMITE) return NextResponse.json({ erro: 'A imagem ficou grande demais (mais de 3 MB). Tente outra foto.' }, { status: 400 })

  // O tipo declarado pelo navegador não prova nada: confere a assinatura do arquivo antes de guardar.
  const inicio = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer())
  const ehJpeg = inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff
  const ehPng = inicio[0] === 0x89 && inicio[1] === 0x50 && inicio[2] === 0x4e && inicio[3] === 0x47
  if ((extensao === 'jpg' && !ehJpeg) || (extensao === 'png' && !ehPng)) {
    return NextResponse.json({ erro: 'Este arquivo não é uma imagem JPEG ou PNG de verdade.' }, { status: 400 })
  }

  const nome = `${crypto.randomUUID()}.${extensao}`
  try {
    await put(`newsletter/edicoes/${nome}`, arquivo, { access: 'private', addRandomSuffix: false, contentType: arquivo.type })
  } catch (causa) {
    console.error('[newsletter] não foi possível guardar a imagem da edição:', causa instanceof Error ? causa.message : causa)
    return NextResponse.json({ erro: 'Não foi possível guardar a imagem agora. Tente de novo.' }, { status: 500 })
  }
  return NextResponse.json({ url: `${urlBase()}/api/newsletter/imagem/${nome}` })
}
