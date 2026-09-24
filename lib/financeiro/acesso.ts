import 'server-only'

import { cookies } from 'next/headers'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { nivelDoNome, type Nivel } from './regras'

/** A empresa aberta no Financeiro (cookie): a filial ou a Escola, cada uma com os seus livros. */
export const COOKIE_DA_EMPRESA = 'fin_empresa'

export type Empresa = { id: string; nome: string; razao_social: string | null; cnpj: string | null; tipo: 'filial' | 'escola' | 'outra'; principal: boolean; fechado_ate: string | null }

/**
 * O nível de quem está logado no Financeiro, na empresa aberta: admin tem
 * tudo; os demais, o que um admin concedeu — para todas as empresas ou só
 * para uma (a equipe da escola só pode ter os livros da Escola). `nivelGeral`
 * é o de todas as empresas: categorias, regras, valor da hora e quem acessa.
 * O banco aplica a mesma regra (private.nivel_fin e private.nivel_financeiro);
 * aqui é para a tela e as actions.
 */
export async function contextoDoFinanceiro() {
  const context = await requireWorkspace({ escola: true })
  const supabase = await createClient()
  const ehAdmin = context.role === 'admin'
  const { data: acesso } = ehAdmin ? { data: null } : await supabase.from('fin_acesso').select('nivel,entidade_id').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).maybeSingle()
  const concedido: Nivel = ehAdmin ? 4 : nivelDoNome(acesso?.nivel)
  // As empresas que esta pessoa enxerga (o RLS filtra pelo acesso). Sem acesso ao Financeiro, a lista vem vazia.
  let { data: empresas } = await supabase.from('fin_entidades').select('id,nome,razao_social,cnpj,tipo,principal,fechado_ate').eq('workspace_id', context.workspace.id).eq('ativa', true).order('ordem')
  if (!empresas?.length && concedido >= 1) {
    await supabase.rpc('financeiro_preparar', { p_workspace_id: context.workspace.id })
    ;({ data: empresas } = await supabase.from('fin_entidades').select('id,nome,razao_social,cnpj,tipo,principal,fechado_ate').eq('workspace_id', context.workspace.id).eq('ativa', true).order('ordem'))
  }
  const lista = (empresas ?? []) as Empresa[]
  const escolhida = (await cookies()).get(COOKIE_DA_EMPRESA)?.value
  const empresa = lista.find((e) => e.id === escolhida) ?? lista.find((e) => e.principal) ?? lista[0] ?? null
  const soDeUma = !ehAdmin && Boolean(acesso?.entidade_id)
  const nivel: Nivel = !empresa ? 0 : soDeUma && acesso?.entidade_id !== empresa.id ? 0 : concedido
  const nivelGeral: Nivel = soDeUma || context.role === 'escola' ? 0 : concedido
  return { context, supabase, nivel, nivelGeral, empresas: lista, empresa }
}

/** O nível numa empresa qualquer (a de um lançamento que não é o da empresa aberta). */
export function nivelNaEmpresa(ctx: { nivel: Nivel; nivelGeral: Nivel; empresa: Empresa | null; empresas: Empresa[] }, empresaId: string | null | undefined): Nivel {
  if (!empresaId || !ctx.empresas.some((e) => e.id === empresaId)) return 0
  if (ctx.empresa?.id === empresaId) return ctx.nivel
  return ctx.nivelGeral
}

export type Cadastros = {
  contas: { id: string; nome: string; tipo: string; banco: string | null; agencia: string | null; numero: string | null; fonte_id: string | null; saldo_inicial: number; saldo_inicial_em: string; ativa: boolean }[]
  fontes: { id: string; nome: string; restrita: boolean; projeto_id: string | null; financiador: string | null; descricao: string | null; inicio: string | null; fim: string | null; valor_previsto: number | null; ativa: boolean }[]
  categorias: { id: string; tipo: 'despesa' | 'receita'; nome: string; grupo: string | null; codigo_contabil: string | null; fixa: boolean; ativa: boolean; ordem: number }[]
  favorecidos: { id: string; nome: string; tipo_pessoa: string; documento: string | null; chave_pix: string | null; email: string | null; telefone: string | null; observacao: string | null }[]
  projetos: { id: string; name: string }[]
  /** A empresa destes cadastros (contas, fontes e o mês fechado são dela). */
  empresa: Empresa | null
  empresas: Empresa[]
  config: { aprovacao_ativa: boolean; aprovacao_acima: number | null; fechado_ate: string | null; reserva_minima_meses: number; valor_hora_voluntario: number | null }
}

/**
 * Tudo o que os formulários e as listas precisam para dar nome aos ids, da
 * empresa aberta (ou da pedida — um lançamento abre na empresa dele).
 * Contas, fontes, favorecidos e o mês fechado são da empresa; categorias,
 * comuns. Prepara o espaço na primeira vez.
 */
export async function cadastrosDoFinanceiro(empresaId?: string | null): Promise<Cadastros> {
  const { context, supabase, empresas, empresa: aberta } = await contextoDoFinanceiro()
  const ws = context.workspace.id
  const empresa = (empresaId && empresas.find((e) => e.id === empresaId)) || aberta
  const ent = empresa?.id ?? '00000000-0000-0000-0000-000000000000'
  const ler = () => Promise.all([
    supabase.from('fin_contas').select('id,nome,tipo,banco,agencia,numero,fonte_id,saldo_inicial,saldo_inicial_em,ativa').eq('workspace_id', ws).eq('entidade_id', ent).order('nome'),
    supabase.from('fin_fontes').select('id,nome,restrita,projeto_id,financiador,descricao,inicio,fim,valor_previsto,ativa').eq('workspace_id', ws).eq('entidade_id', ent).order('restrita').order('nome'),
    supabase.from('fin_categorias').select('id,tipo,nome,grupo,codigo_contabil,fixa,ativa,ordem').eq('workspace_id', ws).order('ordem').order('nome'),
    supabase.from('fin_favorecidos').select('id,nome,tipo_pessoa,documento,chave_pix,email,telefone,observacao').eq('workspace_id', ws).eq('entidade_id', ent).order('nome').limit(5000),
    supabase.from('projects').select('id,name').eq('workspace_id', ws).order('name'),
    supabase.from('fin_config').select('aprovacao_ativa,aprovacao_acima,fechado_ate,reserva_minima_meses,valor_hora_voluntario').eq('workspace_id', ws).maybeSingle(),
  ])
  let r = await ler()
  if (!r[1].data?.length && empresa) {
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
    empresa, empresas,
    config: {
      aprovacao_ativa: Boolean(config.data?.aprovacao_ativa), aprovacao_acima: numero(config.data?.aprovacao_acima),
      // O mês fechado é o da empresa (cada uma fecha o seu).
      fechado_ate: empresa?.fechado_ate ?? null, reserva_minima_meses: Number(config.data?.reserva_minima_meses ?? 3),
      valor_hora_voluntario: numero(config.data?.valor_hora_voluntario),
    },
  }
}

/** Numeric do Postgres chega como texto: converte os campos de valor. */
export function lerLinha<T extends { valor: unknown; valor_pago: unknown }>(l: T) {
  return { ...l, valor: Number(l.valor), valor_pago: l.valor_pago === null ? null : Number(l.valor_pago) }
}
