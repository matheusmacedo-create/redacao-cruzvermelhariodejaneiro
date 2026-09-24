import 'server-only'

import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { nivelDoNome, type Nivel } from './regras'

/** O nível de quem está logado no Patrimônio (admin = 3). O banco aplica a mesma regra (private.nivel_patrimonio). */
export async function contextoDoPatrimonio() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  let nivel: Nivel = 0
  if (context.role === 'admin') nivel = 3
  else {
    const { data } = await supabase.from('pat_acesso').select('nivel').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).maybeSingle()
    nivel = nivelDoNome(data?.nivel)
  }
  return { context, supabase, nivel }
}

export const COLUNAS_DO_BEM = 'id,numero,plaqueta,plaqueta_antiga,nome,descricao,categoria_id,local_id,marca,modelo,numero_serie,situacao,estado,origem,aquisicao_em,valor,fornecedor,nota_fiscal,fonte_id,projeto_id,lancamento_id,garantia_ate,manutencao_meses,observacao,baixado_em,motivo_baixa,destino_baixa,criado_por,created_at,updated_at'

export type Bem = {
  id: string; numero: number; plaqueta: string; plaqueta_antiga: string | null; nome: string; descricao: string | null; categoria_id: string; local_id: string | null
  marca: string | null; modelo: string | null; numero_serie: string | null; situacao: 'em_uso' | 'reserva' | 'em_manutencao' | 'baixado'; estado: string; origem: string
  aquisicao_em: string | null; valor: number | null; fornecedor: string | null; nota_fiscal: string | null; fonte_id: string | null; projeto_id: string | null
  lancamento_id: string | null; garantia_ate: string | null; manutencao_meses: number | null; observacao: string | null; baixado_em: string | null
  motivo_baixa: string | null; destino_baixa: string | null; criado_por: string | null; created_at: string; updated_at: string
}
export const lerBemDoBanco = (b: Record<string, unknown>) => ({ ...b, valor: b.valor === null || b.valor === undefined ? null : Number(b.valor) }) as Bem

export type CadastrosDoPatrimonio = {
  config: { prefixo: string; proximo_numero: number; termo_padrao: string }
  categorias: { id: string; nome: string; vida_util_meses: number | null; residual_pct: number; conta_contabil: string | null; manutencao_meses: number | null; ativa: boolean }[]
  locais: { id: string; nome: string; descricao: string | null; ativo: boolean }[]
  fontes: { id: string; nome: string; restrita: boolean }[]
  projetos: { id: string; name: string }[]
  /** Categorias do Estoque de materiais (outras que as dos bens). */
  estCategorias: { id: string; nome: string; conta_contabil: string | null; ativa: boolean }[]
}

/** Categorias, locais e o que o formulário precisa. Prepara o espaço na primeira vez. */
export async function cadastrosDoPatrimonio(): Promise<CadastrosDoPatrimonio> {
  const { context, supabase } = await contextoDoPatrimonio()
  const ws = context.workspace.id
  const ler = () => Promise.all([
    supabase.from('pat_config').select('prefixo,proximo_numero,termo_padrao').eq('workspace_id', ws).maybeSingle(),
    supabase.from('pat_categorias').select('id,nome,vida_util_meses,residual_pct,conta_contabil,manutencao_meses,ativa').eq('workspace_id', ws).order('nome'),
    supabase.from('pat_locais').select('id,nome,descricao,ativo').eq('workspace_id', ws).order('nome'),
    // As fontes são do Financeiro: quem não tem nível lá simplesmente não vê nenhuma.
    supabase.from('fin_fontes').select('id,nome,restrita').eq('workspace_id', ws).order('nome'),
    supabase.from('projects').select('id,name').eq('workspace_id', ws).order('name'),
    supabase.from('est_categorias').select('id,nome,conta_contabil,ativa').eq('workspace_id', ws).order('nome'),
  ])
  let r = await ler()
  if (!r[0].data) {
    await supabase.rpc('patrimonio_preparar', { p_workspace_id: ws })
    r = await ler()
  }
  const [config, categorias, locais, fontes, projetos, estCategorias] = r
  return {
    config: { prefixo: config.data?.prefixo ?? 'CVRJ', proximo_numero: Number(config.data?.proximo_numero ?? 1), termo_padrao: config.data?.termo_padrao ?? '' },
    categorias: (categorias.data ?? []).map((c) => ({ ...c, residual_pct: Number(c.residual_pct) })) as CadastrosDoPatrimonio['categorias'],
    locais: (locais.data ?? []) as CadastrosDoPatrimonio['locais'],
    fontes: (fontes.data ?? []) as CadastrosDoPatrimonio['fontes'],
    projetos: (projetos.data ?? []) as CadastrosDoPatrimonio['projetos'],
    estCategorias: (estCategorias.data ?? []) as CadastrosDoPatrimonio['estCategorias'],
  }
}

// ---------------------------------------------------------------- estoque

export const COLUNAS_DO_ITEM = 'id,numero,codigo,nome,descricao,categoria_id,unidade,estoque_minimo,controla_validade,aviso_validade_dias,eh_kit,saldo,valor_estoque,ativo,created_at,updated_at'

export type ItemDoEstoque = {
  id: string; numero: number; codigo: string; nome: string; descricao: string | null; categoria_id: string; unidade: string; estoque_minimo: number
  controla_validade: boolean; aviso_validade_dias: number; eh_kit: boolean; saldo: number; valor_estoque: number; ativo: boolean; created_at: string; updated_at: string
}
export const lerItemDoBanco = (i: Record<string, unknown>) =>
  ({ ...i, estoque_minimo: Number(i.estoque_minimo), saldo: Number(i.saldo), valor_estoque: Number(i.valor_estoque) }) as ItemDoEstoque
