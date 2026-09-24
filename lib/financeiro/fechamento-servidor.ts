import 'server-only'

import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { cadastrosDoFinanceiro, contextoDoFinanceiro, lerLinha } from './acesso'
import { conferencia, resumoDoMes, resumoDoPatrimonio, type BemDoFechamento, type Item, type LinhaDoExtratoDoMes, type Resumo } from './fechamento'
import { COLUNAS_DO_LANCAMENTO, primeiroDia, ultimoDia, type Lancamento } from './regras'

export type Fechamento = {
  id: string; mes: string; situacao: 'fechado' | 'reaberto'; resumo: Resumo | Record<string, never>; avisos: { id: string; rotulo: string; detalhe?: string }[]
  observacao: string | null; fechado_por: string | null; fechado_em: string; reaberto_por: string | null; reaberto_em: string | null; motivo_reabertura: string | null
}

/**
 * Tudo o que o fechamento de um mês precisa, lido com a sessão de quem pediu
 * (o RLS vale). Usado pela tela, pela action de fechar (que recalcula no
 * servidor, sem confiar no que a tela mandou) e pelo pacote do contador.
 */
export async function dadosDoMes(mes: string) {
  const { context, supabase, nivel } = await contextoDoFinanceiro()
  const ws = context.workspace.id
  const inicio = primeiroDia(mes)
  const fim = ultimoDia(mes)
  const c = await cadastrosDoFinanceiro()
  const [{ data: pagos }, { data: doMes }, { data: extrato }, { data: importacoes }, { data: horas }, { data: fechamentos }] = await Promise.all([
    supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('workspace_id', ws).not('pago_em', 'is', null).lte('pago_em', fim).limit(50000),
    supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('workspace_id', ws)
      .or(`and(competencia.gte.${inicio},competencia.lte.${fim}),and(vencimento.gte.${inicio},vencimento.lte.${fim})`).limit(20000),
    supabase.from('fin_extrato').select('conta_id,data,situacao,lancamento_id,valor,descricao,documento,motivo').eq('workspace_id', ws).gte('data', inicio).lte('data', fim).order('data').limit(20000),
    supabase.from('fin_importacoes').select('conta_id,saldo_banco,saldo_em').eq('workspace_id', ws).not('saldo_banco', 'is', null).gte('saldo_em', inicio).lte('saldo_em', fim),
    supabase.rpc('financeiro_horas_voluntarias', { p_workspace_id: ws, p_de: inicio, p_ate: fim }),
    supabase.from('fin_fechamentos').select('id,mes,situacao,resumo,avisos,observacao,fechado_por,fechado_em,reaberto_por,reaberto_em,motivo_reabertura').eq('workspace_id', ws).order('fechado_em', { ascending: false }).limit(60),
  ])
  const porId = new Map<string, Lancamento>()
  for (const l of [...(pagos ?? []), ...(doMes ?? [])]) porId.set(l.id as string, lerLinha(l) as Lancamento)
  const lancamentos = [...porId.values()]

  const pagosNoMes = lancamentos.filter((l) => l.pago_em && l.pago_em >= inicio && l.pago_em <= fim)
  const idsDoMes = [...new Set([...pagosNoMes.map((l) => l.id), ...lancamentos.filter((l) => l.competencia >= inicio && l.competencia <= fim).map((l) => l.id)])]
  const anexos: { id: string; lancamento_id: string; caminho: string; nome_original: string; tipo_doc: string; mime: string; sha256: string | null }[] = []
  for (let i = 0; i < idsDoMes.length; i += 300) {
    const { data } = await supabase.from('fin_anexos').select('id,lancamento_id,caminho,nome_original,tipo_doc,mime,sha256').in('lancamento_id', idsDoMes.slice(i, i + 300))
    anexos.push(...((data ?? []) as typeof anexos))
  }
  const comComprovante = new Set(anexos.filter((a) => a.tipo_doc === 'comprovante' || a.tipo_doc === 'recibo').map((a) => a.lancamento_id))
  const h = (Array.isArray(horas) ? horas[0] : horas) as { horas: number | string; pessoas: number } | null

  const resumo = resumoDoMes({
    mes, contas: c.contas, fontes: c.fontes, categorias: c.categorias, lancamentos,
    saldosDoBanco: (importacoes ?? []).map((i) => ({ conta_id: i.conta_id as string, saldo: Number(i.saldo_banco), em: i.saldo_em as string })),
    horas: { horas: Number(h?.horas ?? 0), pessoas: Number(h?.pessoas ?? 0) }, valorHora: c.config.valor_hora_voluntario,
  })
  // Depreciação do Patrimônio (sem o módulo ou sem bens com valor: fica de fora).
  const { data: bens, error: semPatrimonio } = await supabase.rpc('financeiro_bens_para_depreciacao', { p_workspace_id: ws })
  if (!semPatrimonio && Array.isArray(bens) && bens.length) {
    resumo.patrimonio = resumoDoPatrimonio((bens as BemDoFechamento[]).map((b) => ({ ...b, valor: b.valor === null ? null : Number(b.valor), residual_pct: Number(b.residual_pct) })), mes)
  }
  const itens: Item[] = conferencia({
    mes, hoje: hojeEmSaoPaulo(), fechadoAte: c.config.fechado_ate, resumo, contas: c.contas, lancamentos,
    extrato: (extrato ?? []) as LinhaDoExtratoDoMes[], comComprovante,
  })
  return {
    context, supabase, nivel, cadastros: c, resumo, itens, lancamentos, pagosNoMes, anexos, comComprovante,
    extrato: (extrato ?? []).map((e) => ({ ...e, valor: Number(e.valor) })) as (LinhaDoExtratoDoMes & { valor: number; descricao: string; documento: string | null; motivo: string | null })[],
    fechamentos: (fechamentos ?? []) as Fechamento[],
  }
}
