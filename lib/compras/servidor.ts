import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { contextoDoFinanceiro } from '@/lib/financeiro/acesso'
import { nivelDoNome } from '@/lib/financeiro/regras'
import { chaveDoNome } from '@/lib/equipe'
import { REGRAS_PADRAO, type RegrasDeCompra } from './regras'

/**
 * Compras abre para a Redação inteira (qualquer pessoa pede), mas o que cada
 * um vê e faz depende do nível no Financeiro da empresa do pedido e de ser
 * da Diretoria. O banco decide (compras_pode_ver e as funções compras_*);
 * aqui é para a tela saber o que mostrar.
 */
export async function contextoDeCompras() {
  const fin = await contextoDoFinanceiro()
  const ws = fin.context.workspace.id
  const [{ data: papel }, { data: config }] = await Promise.all([
    fin.supabase.rpc('compras_meu_papel', { p_workspace_id: ws }),
    fin.supabase.from('compras_config').select('limite_simples,limite_diretoria,cotacoes_minimas,diretoria_setor_id').eq('workspace_id', ws).maybeSingle(),
  ])
  const p = (papel ?? {}) as { pede?: boolean; diretoria?: boolean; gestao?: boolean }
  const regras: RegrasDeCompra = config
    ? { limite_simples: Number(config.limite_simples), limite_diretoria: Number(config.limite_diretoria), cotacoes_minimas: Number(config.cotacoes_minimas) }
    : REGRAS_PADRAO
  return { ...fin, pede: Boolean(p.pede), diretoria: Boolean(p.diretoria), gestao: Boolean(p.gestao), regras, diretoriaSetorId: (config?.diretoria_setor_id as string | null) ?? null }
}

type Admin = SupabaseClient

/** Quem tem pelo menos este nível no Financeiro da empresa (admins do espaço incluídos). */
export async function pessoasDoFinanceiro(admin: Admin, ws: string, entidadeId: string, minimo: 2 | 3): Promise<string[]> {
  const [{ data: admins }, { data: acessos }] = await Promise.all([
    admin.from('workspace_members').select('user_id').eq('workspace_id', ws).eq('role', 'admin'),
    admin.from('fin_acesso').select('user_id,nivel,entidade_id').eq('workspace_id', ws),
  ])
  const ids = new Set<string>((admins ?? []).map((a) => a.user_id as string))
  for (const a of acessos ?? []) {
    if ((a.entidade_id === null || a.entidade_id === entidadeId) && nivelDoNome(a.nivel as string) >= minimo) ids.add(a.user_id as string)
  }
  return [...ids]
}

/** A Diretoria: o setor configurado (ou o chamado "Diretoria"); sem ninguém nele, os administradores. */
export async function pessoasDaDiretoria(admin: Admin, ws: string, setorConfigurado: string | null): Promise<string[]> {
  let setor = setorConfigurado
  if (!setor) {
    const { data: setores } = await admin.from('setores').select('id,nome').eq('workspace_id', ws)
    setor = (setores ?? []).find((s) => chaveDoNome(String(s.nome)) === 'diretoria')?.id ?? null
  }
  if (setor) {
    const { data: membros } = await admin.from('setor_membros').select('user_id').eq('setor_id', setor)
    if (membros?.length) return membros.map((m) => m.user_id as string)
  }
  const { data: admins } = await admin.from('workspace_members').select('user_id').eq('workspace_id', ws).eq('role', 'admin')
  return (admins ?? []).map((a) => a.user_id as string)
}

/**
 * A verba da categoria no mês (o Orçamento do Financeiro) e o que já pesa nela:
 * o que foi lançado e o que está em compras aprovadas ou em aprovação ainda
 * sem lançamento. É o "tem verba?" antes de aprovar (como no Procurify).
 */
export async function verbaDaCategoria(supabase: SupabaseClient, ws: string, entidadeId: string, categoriaId: string, mes: string, semEste: string) {
  const ano = Number(mes.slice(0, 4))
  const inicio = `${mes}-01`
  const fim = new Date(Date.UTC(ano, Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const [{ data: orc }, { data: lancados }, { data: compras }] = await Promise.all([
    supabase.from('fin_orcamentos').select('valor_mensal').eq('workspace_id', ws).eq('entidade_id', entidadeId).eq('ano', ano).eq('categoria_id', categoriaId).maybeSingle(),
    supabase.from('fin_lancamentos').select('valor').eq('workspace_id', ws).eq('entidade_id', entidadeId).eq('tipo', 'despesa').eq('categoria_id', categoriaId)
      .neq('aprovacao', 'recusada').gte('competencia', inicio).lte('competencia', fim).limit(5000),
    supabase.from('compras_pedidos').select('valor_aprovado').eq('workspace_id', ws).eq('entidade_id', entidadeId).eq('categoria_id', categoriaId)
      .in('estado', ['em_aprovacao', 'aprovado']).neq('id', semEste).gte('enviado_aprovacao_em', `${inicio}T00:00:00-03:00`).lte('enviado_aprovacao_em', `${fim}T23:59:59-03:00`).limit(1000),
  ])
  const soma = (l: { valor?: unknown; valor_aprovado?: unknown }[] | null, campo: 'valor' | 'valor_aprovado') => (l ?? []).reduce((s, x) => s + Number(x[campo] ?? 0), 0)
  const verba = orc ? Number(orc.valor_mensal) : null
  const lancado = soma(lancados, 'valor')
  const emCompras = soma(compras, 'valor_aprovado')
  return { verba, lancado, emCompras, sobra: verba === null ? null : verba - lancado - emCompras }
}

/** As listas do formulário do pedido. Categoria e fonte só para quem classifica (Financeiro, lançar). */
export async function opcoesDoFormulario(ctx: Awaited<ReturnType<typeof contextoDeCompras>>, entidadeId: string | null, classificar: boolean) {
  const ws = ctx.context.workspace.id
  const ent = entidadeId ?? ctx.empresa?.id ?? '00000000-0000-0000-0000-000000000000'
  const [{ data: setores }, { data: projetos }, { data: meusSetores }, { data: categorias }, { data: fontes }] = await Promise.all([
    ctx.supabase.from('setores').select('id,nome').eq('workspace_id', ws).order('nome'),
    ctx.supabase.from('projects').select('id,name').eq('workspace_id', ws).order('name'),
    ctx.supabase.from('setor_membros').select('setor_id').eq('user_id', ctx.context.user.id).limit(1),
    classificar ? ctx.supabase.from('fin_categorias').select('id,nome').eq('workspace_id', ws).eq('tipo', 'despesa').eq('ativa', true).order('nome') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    classificar ? ctx.supabase.from('fin_fontes').select('id,nome').eq('workspace_id', ws).eq('entidade_id', ent).eq('ativa', true).order('nome') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  return {
    setores: (setores ?? []).map((s) => ({ id: s.id as string, nome: s.nome as string })),
    projetos: (projetos ?? []).map((p) => ({ id: p.id as string, nome: p.name as string })),
    setorPadrao: (meusSetores?.[0]?.setor_id as string | undefined) ?? null,
    categorias: (categorias ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string })),
    fontes: (fontes ?? []).map((f) => ({ id: f.id as string, nome: f.nome as string })),
  }
}
