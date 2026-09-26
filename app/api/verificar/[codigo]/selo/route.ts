import { createAdminClient } from '@/lib/supabase/admin'
import { nomeDoArquivo, lerCanonico } from '@/lib/oficios/documento'

export const dynamic = 'force-dynamic'

const ARQUIVOS = {
  txt: { tipo: 'text/plain; charset=utf-8', sufixo: '-selo.txt' },
  sig: { tipo: 'application/octet-stream', sufixo: '-selo.sig' },
  pem: { tipo: 'application/x-pem-file', sufixo: '-selo-chave-publica.pem' },
} as const

/**
 * Os arquivos do selo digital (lib/oficios/selo.ts), públicos pelo código de
 * verificação: o texto selado, a assinatura Ed25519 (64 bytes) e a chave
 * pública que a confere — o bastante para conferir com openssl, sem o Redação.
 */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const pedido = new URL(request.url).searchParams.get('arquivo') ?? 'txt'
  if (!/^[0-9a-f]{32}$/.test(codigo) || !Object.hasOwn(ARQUIVOS, pedido)) return new Response('Não encontrado.', { status: 404 })
  const arquivo = ARQUIVOS[pedido as keyof typeof ARQUIVOS]
  const admin = createAdminClient()
  const { data: o } = await admin.from('oficios').select('id,conteudo_canonico').eq('codigo_verificacao', codigo).eq('estado', 'assinado').maybeSingle()
  if (!o) return new Response('Não encontrado.', { status: 404 })
  const { data: selo } = await admin.from('oficio_selos').select('mensagem,assinatura,chave_publica').eq('oficio_id', o.id).maybeSingle()
  if (!selo) return new Response('Este ofício ainda não foi selado.', { status: 404 })
  const corpo = pedido === 'txt' ? selo.mensagem : pedido === 'sig' ? new Uint8Array(Buffer.from(selo.assinatura, 'base64')) : `${selo.chave_publica.trim()}\n`
  return new Response(corpo, {
    headers: {
      'Content-Type': arquivo.tipo,
      'Content-Disposition': `attachment; filename="${nomeDoArquivo(lerCanonico(o.conteudo_canonico)?.numero ?? null, arquivo.sufixo)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
