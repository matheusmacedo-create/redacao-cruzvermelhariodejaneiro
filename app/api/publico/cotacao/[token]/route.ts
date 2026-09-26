import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { conteudoConfere } from '@/lib/rh/regras'
import { ehArquivoAceito } from '@/lib/financeiro/regras'
import { lerPropostaDoFornecedor } from '@/lib/compras/convites'
import { avisarResposta, conviteDoToken } from '@/lib/compras/convites-servidor'

export const dynamic = 'force-dynamic'

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const BUCKET = 'compras-arquivos'

/**
 * O fornecedor responde pelo link (docs/compras-cotacao-automatica.md):
 *  { acao: 'proposta', precos, frete, validade, prazo_entrega, condicao_pagamento, observacao, arquivo? }
 *  { acao: 'recusar', motivo }
 * O token é a única credencial; o banco confere de novo (convite em vigor,
 * cotação aberta, prazo) em compras_proposta_do_fornecedor.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!corpo) return Response.json({ erro: 'Não entendi o envio. Tente de novo.' }, { status: 400 })

  const admin = createAdminClient()
  const aberto = await conviteDoToken(token, admin)
  if (!aberto) return Response.json({ erro: 'Este link não está valendo.' }, { status: 404 })

  if (corpo.acao === 'recusar') {
    const motivo = String(corpo.motivo ?? '').trim().slice(0, 500)
    const { data, error } = await admin.rpc('compras_recusa_do_fornecedor', { p_token: token, p_motivo: motivo })
    if (error) return Response.json({ erro: error.code === 'P0001' ? error.message : 'Não foi possível registrar agora. Tente de novo.' }, { status: 409 })
    after(() => avisarResposta(aberto, 'recusa', Boolean((data as { todos_responderam?: boolean })?.todos_responderam), motivo))
    return Response.json({ ok: true })
  }

  if (corpo.acao !== 'proposta') return Response.json({ erro: 'Ação inválida.' }, { status: 400 })
  const lida = lerPropostaDoFornecedor(corpo, aberto.itens.map((i) => i.id), hojeEmSaoPaulo())
  if (!lida.proposta) return Response.json({ erro: lida.erro }, { status: 400 })

  // O arquivo (opcional) já subiu pelo link de envio: confere o caminho e o conteúdo antes de juntar.
  let arquivo: { caminho: string; nome: string; mime: string; tamanho: number } | null = null
  const a = corpo.arquivo as { caminho?: unknown; nome?: unknown; mime?: unknown; tamanho?: unknown } | null | undefined
  if (a && typeof a.caminho === 'string') {
    const prefixo = `${aberto.pedido.workspace_id}/${aberto.pedido.id}/`
    const mime = String(a.mime ?? '')
    if (!a.caminho.startsWith(prefixo) || !/^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(a.caminho.slice(prefixo.length)) || !ehArquivoAceito(mime)) {
      return Response.json({ erro: 'Arquivo inválido. Anexe de novo.' }, { status: 400 })
    }
    const { data: blob } = await admin.storage.from(BUCKET).download(a.caminho)
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null
    if (!bytes || !conteudoConfere(mime, bytes)) {
      await admin.storage.from(BUCKET).remove([a.caminho]).catch(() => undefined)
      return Response.json({ erro: 'O conteúdo do arquivo não confere com o tipo (PDF, JPG, PNG ou WEBP). Anexe o arquivo original.' }, { status: 400 })
    }
    arquivo = { caminho: a.caminho, nome: String(a.nome ?? 'proposta').slice(0, 200), mime, tamanho: bytes.length }
  }

  const { data, error } = await admin.rpc('compras_proposta_do_fornecedor', { p_token: token, p: { ...lida.proposta, ...(arquivo ? { arquivo } : {}) } })
  if (error) {
    if (arquivo) await admin.storage.from(BUCKET).remove([arquivo.caminho]).catch(() => undefined)
    return Response.json({ erro: error.code === 'P0001' ? error.message : 'Não foi possível registrar a proposta agora. Tente de novo.' }, { status: 409 })
  }
  const r = (data ?? {}) as { arquivo_antigo?: string | null; todos_responderam?: boolean }
  if (r.arquivo_antigo) await admin.storage.from(BUCKET).remove([r.arquivo_antigo]).catch(() => undefined)
  after(() => avisarResposta(aberto, 'proposta', Boolean(r.todos_responderam)))
  return Response.json({ ok: true })
}
