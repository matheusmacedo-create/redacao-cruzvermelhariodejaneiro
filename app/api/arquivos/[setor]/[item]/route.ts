import { NextResponse, type NextRequest } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { noSetor } from '@/lib/arquivos/servidor'
import { conteudoDoDrive, ErroDoDrive } from '@/lib/google/drive'
import { disposicao, ehIdDoDrive, mostravelNoNavegador, nomeParaBaixar, PASTA, saidaPara } from '@/lib/arquivos/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/

/**
 * Ver ou baixar um arquivo dos Arquivos do setor, pelo Palácio, sem a
 * pessoa precisar de acesso no Google. Confere a sessão, o setor e que o
 * item mora dentro da pasta dele; o conteúdo vem do Drive e é repassado em
 * fluxo, sem guardar nada aqui. Documento do Google vira PDF para ver e
 * Word/Excel/PowerPoint para baixar.
 *
 * ?modo=ver abre na aba quando o navegador mostra o formato; o resto baixa.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ setor: string; item: string }> }) {
  const { setor: setorId, item: itemId } = await params
  if (!UUID.test(setorId) || !ehIdDoDrive(itemId)) return NextResponse.json({ erro: 'Item não encontrado.' }, { status: 404 })
  // Sem redirecionar: numa rota de API, o redirect() do requireWorkspace viraria erro 500.
  const contexto = await obterWorkspace()
  if (!contexto) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const modo = request.nextUrl.searchParams.get('modo') === 'ver' ? 'ver' : 'baixar'

  try {
    const { item } = await noSetor(contexto, setorId, itemId)
    if (item.mime === PASTA) return NextResponse.json({ erro: 'Pasta não se baixa: abra pelo Palácio.' }, { status: 400 })
    const saida = saidaPara(item.mime, modo)
    if (saida.tipo === 'nenhuma') {
      // Formulário e atalho do Google não têm arquivo: só abrem no Google.
      if (item.linkNoGoogle) return NextResponse.redirect(item.linkNoGoogle)
      return NextResponse.json({ erro: 'Este item só abre no Google.' }, { status: 400 })
    }
    const exportado = saida.tipo === 'exportar'
    const resposta = await conteudoDoDrive(contexto.workspace.id, item.id, exportado ? saida.mime : undefined)
    const tipo = exportado ? saida.mime : item.mime || 'application/octet-stream'
    const nome = nomeParaBaixar(item.nome, exportado ? saida.extensao : undefined)
    const naAba = modo === 'ver' && mostravelNoNavegador(tipo)
    const cabecalhos = new Headers({
      'Content-Type': tipo,
      'Content-Disposition': disposicao(naAba ? 'inline' : 'attachment', nome),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Arquivo de terceiros aberto na origem do Palácio: nada de script, formulário ou moldura.
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
    })
    const tamanho = resposta.headers.get('content-length')
    if (tamanho) cabecalhos.set('Content-Length', tamanho)
    return new NextResponse(resposta.body, { status: 200, headers: cabecalhos })
  } catch (causa) {
    const status = causa instanceof ErroDoDrive && causa.status === 404 ? 404 : causa instanceof ErroDoDrive ? 502 : 403
    return NextResponse.json({ erro: causa instanceof Error ? causa.message : 'Não foi possível abrir o arquivo.' }, { status })
  }
}
