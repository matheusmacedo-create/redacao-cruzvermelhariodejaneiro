import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { termoDeEntrega } from '@/lib/patrimonio/documentos'
import { BENEFICIARIOS, type TipoDeBeneficiario } from '@/lib/patrimonio/doacoes'

export const dynamic = 'force-dynamic'

const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/** O termo de entrega, em PDF, para quem recebeu assinar. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado.', { status: 404 })
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) return new Response('Sem acesso ao Patrimônio.', { status: 403 })
  const { data: e } = await supabase.from('doa_entregas').select('codigo,data,beneficiario_tipo,beneficiario_nome,beneficiario_documento,responsavel,pessoas,municipio,bairro,campanha_id,observacao,criado_por')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!e) return new Response('Não encontrado.', { status: 404 })
  const [{ data: itens }, { data: campanha }, { data: quem }] = await Promise.all([
    supabase.from('doa_entrega_itens').select('descricao,quantidade,unidade').eq('entrega_id', id).order('descricao'),
    e.campanha_id ? supabase.from('doa_campanhas').select('nome').eq('id', e.campanha_id).maybeSingle() : Promise.resolve({ data: null }),
    e.criado_por ? supabase.from('profiles').select('full_name').eq('id', e.criado_por).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const pdf = await termoDeEntrega({
    codigo: e.codigo as string, data: e.data as string, beneficiario: e.beneficiario_nome as string, tipo: BENEFICIARIOS[e.beneficiario_tipo as TipoDeBeneficiario]?.split(' (')[0] ?? '',
    documento: e.beneficiario_documento as string | null, responsavel: e.responsavel as string | null, pessoas: e.pessoas as number | null, municipio: e.municipio as string | null,
    bairro: e.bairro as string | null, campanha: (campanha?.nome as string) ?? null, observacao: e.observacao as string | null,
    entreguePor: (quem?.full_name as string) ?? 'Responsável pela entrega', geradoEm: agora(),
    itens: (itens ?? []).map((i) => ({ descricao: i.descricao as string, quantidade: Number(i.quantidade), unidade: i.unidade as string })),
  })
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="termo-${e.codigo}.pdf"`, 'Cache-Control': 'no-store' } })
}
