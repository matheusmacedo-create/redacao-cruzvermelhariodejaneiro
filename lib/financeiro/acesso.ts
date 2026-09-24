import 'server-only'

import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { nivelDoNome, type Nivel } from './regras'

/**
 * O nível de quem está logado no Financeiro: admin tem tudo; os demais, o
 * que um admin concedeu. O banco aplica a mesma regra
 * (private.nivel_financeiro); aqui é para a tela e as actions.
 */
export async function contextoDoFinanceiro() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  let nivel: Nivel = 0
  if (context.role === 'admin') nivel = 4
  else {
    const { data } = await supabase.from('fin_acesso').select('nivel').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).maybeSingle()
    nivel = nivelDoNome(data?.nivel)
  }
  return { context, supabase, nivel }
}

export type Cadastros = {
  contas: { id: string; nome: string; tipo: string; banco: string | null; agencia: string | null; numero: string | null; fonte_id: string | null; saldo_inicial: number; saldo_inicial_em: string; ativa: boolean }[]
  fontes: { id: string; nome: string; restrita: boolean; projeto_id: string | null; financiador: string | null; descricao: string | null; inicio: string | null; fim: string | null; valor_previsto: number | null; ativa: boolean }[]
  categorias: { id: string; tipo: 'despesa' | 'receita'; nome: string; grupo: string | null; codigo_contabil: string | null; fixa: boolean; ativa: boolean; ordem: number }[]
  favorecidos: { id: string; nome: string; tipo_pessoa: string; documento: string | null; chave_pix: string | null; email: string | null; telefone: string | null; observacao: string | null }[]
  projetos: { id: string; name: string }[]
  config: { aprovacao_ativa: boolean; aprovacao_acima: number | null; fechado_ate: string | null; reserva_minima_meses: number }
}

/** Tudo o que os formulários e as listas precisam para dar nome aos ids. Prepara o espaço na primeira vez. */
export async function cadastrosDoFinanceiro(): Promise<Cadastros> {
  const { context, supabase } = await contextoDoFinanceiro()
  const ws = context.workspace.id
  const ler = () => Promise.all([
    supabase.from('fin_contas').select('id,nome,tipo,banco,agencia,numero,fonte_id,saldo_inicial,saldo_inicial_em,ativa').eq('workspace_id', ws).order('nome'),
    supabase.from('fin_fontes').select('id,nome,restrita,projeto_id,financiador,descricao,inicio,fim,valor_previsto,ativa').eq('workspace_id', ws).order('restrita').order('nome'),
    supabase.from('fin_categorias').select('id,tipo,nome,grupo,codigo_contabil,fixa,ativa,ordem').eq('workspace_id', ws).order('ordem').order('nome'),
    supabase.from('fin_favorecidos').select('id,nome,tipo_pessoa,documento,chave_pix,email,telefone,observacao').eq('workspace_id', ws).order('nome').limit(5000),
    supabase.from('projects').select('id,name').eq('workspace_id', ws).order('name'),
    supabase.from('fin_config').select('aprovacao_ativa,aprovacao_acima,fechado_ate,reserva_minima_meses').eq('workspace_id', ws).maybeSingle(),
  ])
  let r = await ler()
  if (!r[1].data?.length) {
    await supabase.rpc('financeiro_preparar', { p_workspace_id: ws })
    r = await ler()
  }
  const [contas, fontes, categorias, favorecidos, projetos, config] = r
  const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    contas: (contas.data ?? []).map((c) => ({ ...c, saldo_inicial: Number(c.saldo_inicial) })) as Cadastros['contas'],
    fontes: (fontes.data ?? []).map((f) => ({ ...f, valor_previsto: numero(f.valor_previsto) })) as Cadastros['fontes'],
    categorias: (categorias.data ?? []) as Cadastros['categorias'],
    favorecidos: (favorecidos.data ?? []) as Cadastros['favorecidos'],
    projetos: (projetos.data ?? []) as Cadastros['projetos'],
    config: {
      aprovacao_ativa: Boolean(config.data?.aprovacao_ativa), aprovacao_acima: numero(config.data?.aprovacao_acima),
      fechado_ate: (config.data?.fechado_ate as string | null) ?? null, reserva_minima_meses: Number(config.data?.reserva_minima_meses ?? 3),
    },
  }
}

/** Numeric do Postgres chega como texto: converte os campos de valor. */
export function lerLinha<T extends { valor: unknown; valor_pago: unknown }>(l: T) {
  return { ...l, valor: Number(l.valor), valor_pago: l.valor_pago === null ? null : Number(l.valor_pago) }
}
