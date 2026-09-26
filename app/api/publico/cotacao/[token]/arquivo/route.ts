import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { conviteDoToken } from '@/lib/compras/convites-servidor'
import { TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO, ehArquivoAceito } from '@/lib/financeiro/regras'

export const dynamic = 'force-dynamic'

/**
 * Primeiro passo do PDF da proposta que o fornecedor anexa: um link de envio
 * de uso único, direto do navegador ao Storage (compras-arquivos, privado).
 * Só sai para um convite em vigor, dentro do prazo. O segundo passo é a
 * própria proposta (../route.ts), que confere o conteúdo e junta o arquivo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const corpo = (await request.json().catch(() => null)) as { tipo?: unknown; tamanho?: unknown } | null
  const tipo = String(corpo?.tipo ?? '')
  const tamanho = Number(corpo?.tamanho)
  if (!ehArquivoAceito(tipo)) return Response.json({ erro: 'Envie PDF, JPG, PNG ou WEBP.' }, { status: 400 })
  if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO) return Response.json({ erro: 'O arquivo pode ter até 20 MB.' }, { status: 400 })

  const admin = createAdminClient()
  const aberto = await conviteDoToken(token, admin)
  if (!aberto) return Response.json({ erro: 'Este link não está valendo.' }, { status: 404 })
  if (aberto.fechado) return Response.json({ erro: 'Esta cotação não recebe mais propostas por este link.' }, { status: 409 })

  const caminho = `${aberto.pedido.workspace_id}/${aberto.pedido.id}/${randomUUID()}.${TIPOS_DE_ARQUIVO[tipo]}`
  const { data, error } = await admin.storage.from('compras-arquivos').createSignedUploadUrl(caminho)
  if (error || !data) return Response.json({ erro: 'Não foi possível preparar o envio do arquivo.' }, { status: 500 })
  return Response.json({ caminho, token: data.token })
}
