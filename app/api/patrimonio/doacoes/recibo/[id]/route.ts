import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { reciboDeDoacao } from '@/lib/patrimonio/documentos'

export const dynamic = 'force-dynamic'

const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/** O recibo de uma doação recebida, em PDF, para entregar ou mandar ao doador. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado.', { status: 404 })
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) return new Response('Sem acesso ao Patrimônio.', { status: 403 })
  const { data: r } = await supabase.from('doa_recebimentos').select('codigo,data,doador_nome,doador_documento,campanha_id,observacao,criado_por').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!r) return new Response('Não encontrado.', { status: 404 })
  const [{ data: itens }, { data: campanha }, { data: quem }] = await Promise.all([
    supabase.from('doa_recebimento_itens').select('descricao,quantidade,unidade,valor_unitario,valor_total,tipo').eq('recebimento_id', id).order('tipo', { ascending: false }).order('descricao'),
    r.campanha_id ? supabase.from('doa_campanhas').select('nome').eq('id', r.campanha_id).maybeSingle() : Promise.resolve({ data: null }),
    r.criado_por ? supabase.from('profiles').select('full_name').eq('id', r.criado_por).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const pdf = await reciboDeDoacao({
    codigo: r.codigo as string, data: r.data as string, doador: r.doador_nome as string, documento: r.doador_documento as string | null, campanha: (campanha?.nome as string) ?? null,
    observacao: r.observacao as string | null, recebidoPor: (quem?.full_name as string) ?? 'Responsável pelo recebimento', geradoEm: agora(),
    itens: (itens ?? []).map((i) => ({ descricao: i.descricao as string, quantidade: Number(i.quantidade), unidade: i.unidade as string, valor_unitario: Number(i.valor_unitario), valor_total: Number(i.valor_total) })),
  })
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="recibo-${r.codigo}.pdf"`, 'Cache-Control': 'no-store' } })
}
