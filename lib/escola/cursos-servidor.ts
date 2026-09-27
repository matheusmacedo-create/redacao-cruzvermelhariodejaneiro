import 'server-only'

import { COLUNAS_DA_CAMPANHA, COLUNAS_DA_PECA, lerCampanhaDoBanco, lerPecaDoBanco, type Campanha, type Peca } from './marketing'
import { chave, numerosPorCurso, type Classificacao, type Compra, type Curso } from './cursos'
import type { contextoDoMarketing } from './marketing-servidor'

type Supabase = Awaited<ReturnType<typeof contextoDoMarketing>>['supabase']

/**
 * Tudo o que as telas de cursos precisam, com a sessão da pessoa (o RLS e as
 * funções conferem o nível do marketing). As compras vêm agregadas por
 * produto e pessoa, sem nome nem CPF (escola_compras_por_produto).
 * `pronto: false` quando a migração 20260929070000 ainda não foi aplicada.
 */
export async function dadosDosCursos(supabase: Supabase, ws: string) {
  const [{ data: cs, error }, { data: cl }, { data: co }, { data: camps }, { data: ps }] = await Promise.all([
    supabase.from('escola_cursos').select('id,nome,ativo,pagina_url,descricao').eq('workspace_id', ws).order('nome'),
    supabase.from('escola_produtos').select('produto,curso_id,ignorado').eq('workspace_id', ws),
    supabase.rpc('escola_compras_por_produto', { p_workspace_id: ws }),
    supabase.from('escola_campanhas').select(COLUNAS_DA_CAMPANHA).eq('workspace_id', ws).order('inicio', { ascending: false, nullsFirst: false }).limit(2000),
    supabase.from('escola_pecas').select(COLUNAS_DA_PECA).eq('workspace_id', ws).eq('referencia', false).order('publicada_em', { ascending: false, nullsFirst: false }).limit(5000),
  ])
  const cursos = (cs ?? []) as Curso[]
  const classificacoes = new Map(((cl ?? []) as Classificacao[]).map((c) => [c.produto, c]))
  const compras = ((co ?? []) as Compra[]).map((c) => ({ ...c, recebido: Number(c.recebido) / 100, pagamentos: Number(c.pagamentos) }))
  const campanhas = (camps ?? []).map((c) => lerCampanhaDoBanco(c))
  const pecas = (ps ?? []).map((p) => lerPecaDoBanco(p))
  const calculo = numerosPorCurso(compras, cursos, classificacoes)

  // A campanha é do curso pelo nome (escola_campanhas.curso); a peça, pela campanha.
  const idPorChave = new Map(cursos.map((c) => [chave(c.nome), c.id]))
  const campanhasDe = new Map<string, Campanha[]>()
  for (const c of campanhas) {
    const id = c.curso ? idPorChave.get(chave(c.curso)) : undefined
    if (id) campanhasDe.set(id, [...(campanhasDe.get(id) ?? []), c])
  }
  const cursoDaCampanha = new Map([...campanhasDe].flatMap(([id, cs2]) => cs2.map((c) => [c.id, id] as const)))
  const pecasDe = new Map<string, Peca[]>()
  for (const p of pecas) {
    const id = p.campanha_id ? cursoDaCampanha.get(p.campanha_id) : undefined
    if (id) pecasDe.set(id, [...(pecasDe.get(id) ?? []), p])
  }
  const semCurso = { campanhas: campanhas.filter((c) => !cursoDaCampanha.has(c.id)).length, pecas: pecas.filter((p) => !p.campanha_id || !cursoDaCampanha.has(p.campanha_id)).length }

  return {
    pronto: !error, cursos, classificacoes, ...calculo,
    campanhasDe: (id: string) => campanhasDe.get(id) ?? [],
    pecasDe: (id: string) => pecasDe.get(id) ?? [],
    semCurso,
  }
}
