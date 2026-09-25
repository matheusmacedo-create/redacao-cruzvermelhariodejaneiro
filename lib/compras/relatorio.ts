import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { documentoFormatado } from '@/lib/patrimonio/doacoes'
import { exigencias, mapaComparativo, numeroDaOrdem, numeroDoPedido, type RegrasDeCompra } from './regras'
import type { DadosDoRelatorio } from './relatorio-pdf'

const MES = /^\d{4}-(0[1-9]|1[0-2])$/
export const ehMes = (m: unknown): m is string => typeof m === 'string' && MES.test(m)
export const mesPorExtenso = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * As compras aprovadas no mês (horário de Brasília) numa empresa, prontas para
 * o relatório público. Quem chama já conferiu o acesso ao Financeiro dela.
 */
export async function dadosDoRelatorio(admin: SupabaseClient, ws: string, empresa: { id: string; nome: string; razao_social: string | null }, mes: string, regras: RegrasDeCompra): Promise<DadosDoRelatorio> {
  const [ano, m] = mes.split('-').map(Number)
  const fim = new Date(Date.UTC(ano, m, 1)).toISOString().slice(0, 10)
  const { data: pedidos } = await admin.from('compras_pedidos')
    .select('id,ano,numero,oc_ano,oc_numero,titulo,aprovado_em,valor_aprovado,fonte_id,exige_diretoria,proposta_id,justificativa_escolha')
    .eq('workspace_id', ws).eq('entidade_id', empresa.id).in('estado', ['aprovado', 'emitido', 'recebido_parcial', 'recebido'])
    .gte('aprovado_em', `${mes}-01T00:00:00-03:00`).lt('aprovado_em', `${fim}T00:00:00-03:00`).order('aprovado_em').limit(500)
  const lista = pedidos ?? []
  const ids = lista.map((p) => p.id as string)
  const [{ data: itens }, { data: propostas }, { data: fontes }] = await Promise.all([
    ids.length ? admin.from('compras_itens').select('id,pedido_id,quantidade').in('pedido_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('compras_propostas').select('id,pedido_id,favorecido_id,frete,compras_proposta_itens(item_id,valor_unitario)').in('pedido_id', ids).order('created_at') : Promise.resolve({ data: [] }),
    admin.from('fin_fontes').select('id,nome').eq('workspace_id', ws),
  ])
  const favIds = [...new Set((propostas ?? []).map((p) => p.favorecido_id as string))]
  const { data: favs } = favIds.length ? await admin.from('fin_favorecidos').select('id,nome,tipo_pessoa,documento').in('id', favIds) : { data: [] }
  const fornecedor = new Map((favs ?? []).map((x) => [x.id as string,
    x.tipo_pessoa === 'pf' ? 'Pessoa física' : `${x.nome}${x.documento && String(x.documento).length === 14 ? ` (CNPJ ${documentoFormatado(x.documento as string)})` : ''}`]))
  const fonte = new Map((fontes ?? []).map((x) => [x.id as string, x.nome as string]))

  return {
    empresa: empresa.razao_social || empresa.nome, mes, mesPorExtenso: mesPorExtenso(mes),
    geradoEm: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    compras: lista.map((p) => {
      const its = (itens ?? []).filter((i) => i.pedido_id === p.id).map((i) => ({ id: i.id as string, quantidade: Number(i.quantidade) }))
      const props = (propostas ?? []).filter((x) => x.pedido_id === p.id).map((x) => ({
        id: x.id as string, favorecido_id: x.favorecido_id as string, frete: Number(x.frete),
        precos: ((x.compras_proposta_itens ?? []) as { item_id: string; valor_unitario: number | null }[]).map((pi) => ({ item_id: pi.item_id, valor_unitario: pi.valor_unitario === null ? null : Number(pi.valor_unitario) })),
      }))
      const mapa = mapaComparativo(its, props)
      const valor = Number(p.valor_aprovado ?? 0)
      return {
        codigo: p.oc_numero ? numeroDaOrdem(p.oc_ano, p.oc_numero) : numeroDoPedido(p.ano, p.numero),
        objeto: p.titulo as string, aprovadaEm: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(p.aprovado_em)),
        valor, fonte: p.fonte_id ? fonte.get(p.fonte_id) ?? null : null, diretoria: Boolean(p.exige_diretoria),
        propostasExigidas: exigencias(valor, regras).propostas, justificativa: (p.justificativa_escolha as string | null) || null,
        propostas: props.map((x) => ({ fornecedor: fornecedor.get(x.favorecido_id) ?? 'Fornecedor', total: mapa.totais.get(x.id)?.total ?? 0, completa: mapa.totais.get(x.id)?.completa ?? false, escolhida: x.id === p.proposta_id }))
          .sort((a, b) => Number(b.escolhida) - Number(a.escolhida) || a.total - b.total),
      }
    }),
  }
}
