import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { numeroDaOrdem, numeroDoPedido } from './regras'
import type { DadosDaOrdem } from './ordem-pdf'

const hoje = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
const agora = () => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date())

/**
 * Tudo o que o PDF da ordem de compra precisa, pelo serviço (o fornecedor e
 * a empresa vêm de cadastros do Financeiro). Quem chama já confirmou, pelo
 * RLS, que a pessoa vê o pedido. Sem ordem emitida, devolve null.
 */
export async function dadosDaOrdem(admin: SupabaseClient, ws: string, pedidoId: string): Promise<{ dados: DadosDaOrdem; codigo: string; fornecedorEmail: string | null } | null> {
  const { data: p } = await admin.from('compras_pedidos')
    .select('id,ano,numero,titulo,entidade_id,proposta_id,valor_aprovado,local_entrega,necessario_ate,oc_ano,oc_numero,oc_emitida_em,oc_emitida_por,oc_observacao,aprovado_fin_por,aprovado_dir_por')
    .eq('id', pedidoId).eq('workspace_id', ws).maybeSingle()
  if (!p?.oc_numero || !p.proposta_id) return null
  const [{ data: itens }, { data: proposta }, { data: empresa }, { data: perfis }] = await Promise.all([
    admin.from('compras_itens').select('id,descricao,especificacao,quantidade,unidade').eq('pedido_id', pedidoId).order('ordem'),
    admin.from('compras_propostas').select('favorecido_id,frete,prazo_entrega,condicao_pagamento,compras_proposta_itens(item_id,valor_unitario)').eq('id', p.proposta_id).maybeSingle(),
    admin.from('fin_entidades').select('nome,razao_social,cnpj,tipo,principal').eq('id', p.entidade_id).maybeSingle(),
    admin.from('profiles').select('id,full_name').in('id', [p.oc_emitida_por, p.aprovado_fin_por, p.aprovado_dir_por].filter(Boolean)),
  ])
  if (!proposta) return null
  const { data: fornecedor } = await admin.from('fin_favorecidos').select('nome,documento,email,telefone').eq('id', proposta.favorecido_id).maybeSingle()
  const preco = new Map(((proposta.compras_proposta_itens ?? []) as { item_id: string; valor_unitario: number | null }[]).map((x) => [x.item_id, Number(x.valor_unitario ?? 0)]))
  const nome = new Map((perfis ?? []).map((x) => [x.id as string, x.full_name as string]))
  const filial = !empresa || empresa.principal || empresa.tipo === 'filial'
  const codigo = numeroDaOrdem(p.oc_ano, p.oc_numero)
  const aprovadores = [nome.get(p.aprovado_fin_por), p.aprovado_dir_por ? nome.get(p.aprovado_dir_por) : null].filter(Boolean)
  return {
    codigo,
    fornecedorEmail: (fornecedor?.email as string | null) ?? null,
    dados: {
      codigo, pedido: numeroDoPedido(p.ano, p.numero), emitidaEm: hoje(p.oc_emitida_em), geradoEm: agora(),
      comprador: {
        nome: empresa?.razao_social || (filial ? DADOS_DA_FILIAL.nome : empresa?.nome ?? DADOS_DA_FILIAL.nome),
        // O CNPJ da filial no cadastro vem só com dígitos; sem cadastro, o do site.
        cnpj: empresa?.cnpj ?? (filial ? DADOS_DA_FILIAL.cnpj.replace(/\D/g, '') : null),
        endereco: filial ? DADOS_DA_FILIAL.endereco : null,
      },
      fornecedor: { nome: fornecedor?.nome ?? 'Fornecedor', documento: fornecedor?.documento ?? null, email: fornecedor?.email ?? null, telefone: fornecedor?.telefone ?? null },
      itens: (itens ?? []).map((i) => ({ descricao: i.descricao, especificacao: i.especificacao, quantidade: Number(i.quantidade), unidade: i.unidade, valor_unitario: preco.get(i.id) ?? 0 })),
      frete: Number(proposta.frete ?? 0), total: Number(p.valor_aprovado ?? 0),
      prazoEntrega: proposta.prazo_entrega, condicaoPagamento: proposta.condicao_pagamento, localEntrega: p.local_entrega, necessarioAte: p.necessario_ate,
      observacao: p.oc_observacao, emitidaPor: nome.get(p.oc_emitida_por) ?? 'Financeiro', aprovadaPor: aprovadores.length ? aprovadores.join(' e ') : null,
    },
  }
}
