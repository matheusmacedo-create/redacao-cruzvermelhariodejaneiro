'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDaEquipe } from '@/lib/rh/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { PESSOAS_DA_EQUIPE, chaveDoNome } from '@/lib/equipe'
import { ehMotivo, faltamNaEquipe, formatarCpf, lerBeneficios, lerFormulario, lerValor, type NomeDoNivel } from '@/lib/rh/regras'

/**
 * Equipe. Tudo passa por funções do banco, que conferem o nível de acesso,
 * cifram documentos, salários e banco, registram as movimentações e a
 * auditoria. Nada aqui escreve direto nas tabelas.
 */

type Resultado = { erro?: string }

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo passou do tamanho permitido.')
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/equipe')
  if (id) revalidatePath(`/equipe/${id}`)
}

export async function salvarMembro(id: string | null, _anterior: Resultado, formData: FormData): Promise<Resultado> {
  let novoId: string | null = null
  try {
    const { context, supabase, nivel } = await contextoDaEquipe()
    if (nivel < 2) throw new Error('Você não tem acesso para editar a equipe.')
    const { dados, erros } = lerFormulario(formData, hojeEmSaoPaulo())
    if (erros.length) return { erro: erros.join(' ') }
    const { data, error } = await supabase.rpc('salvar_membro_equipe', { p_workspace_id: context.workspace.id, p_id: id, p: dados })
    if (error) erroDoBanco(error, 'Não foi possível salvar a ficha.')
    novoId = String(data)
    revalidar(novoId)
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a ficha.') }
  }
  redirect(`/equipe/${novoId}`)
}

export async function mudarSituacaoDoMembro(id: string, situacao: 'ativo' | 'afastado' | 'desligado', data: string, motivo: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDaEquipe()
    if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida.')
    const { error } = await supabase.rpc('mudar_situacao_membro_equipe', { p_id: id, p_situacao: situacao, p_data: data || null, p_motivo: motivo.trim().slice(0, 600) || null })
    if (error) erroDoBanco(error, 'Não foi possível mudar a situação.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar a situação.') }
  }
}

export type DadosRestritos = { documentos?: Record<string, string>; banco?: Record<string, string> }

/** Abre documentos (e banco, para quem tem o nível). Cada abertura fica na auditoria. */
export async function verDadosRestritos(id: string): Promise<Resultado & DadosRestritos> {
  try {
    const { supabase, nivel } = await contextoDaEquipe()
    if (nivel < 3) throw new Error('Você não tem acesso aos documentos da equipe.')
    const { data, error } = await supabase.rpc('dados_restritos_membro_equipe', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível abrir os dados.')
    const d = (data ?? {}) as DadosRestritos
    if (d.documentos?.cpf) d.documentos = { ...d.documentos, cpf: formatarCpf(d.documentos.cpf) }
    return d
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir os dados.') }
  }
}

export type Remuneracao = { id: string; vigencia: string; motivo: string; salario: number; beneficios: { nome: string; valor: number | null }[]; observacao: string | null; created_at: string }

export async function verRemuneracoes(id: string): Promise<Resultado & { historico?: Remuneracao[] }> {
  try {
    const { supabase, nivel } = await contextoDaEquipe()
    if (nivel < 4) throw new Error('Você não tem acesso a remuneração.')
    const { data, error } = await supabase.rpc('remuneracoes_do_membro_equipe', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível abrir a remuneração.')
    return { historico: ((data ?? []) as Remuneracao[]).map((r) => ({ ...r, salario: Number(r.salario) })) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir a remuneração.') }
  }
}

export async function registrarRemuneracao(id: string, formData: FormData): Promise<Resultado> {
  try {
    const { supabase, nivel } = await contextoDaEquipe()
    if (nivel < 4) throw new Error('Você não tem acesso a remuneração.')
    const vigencia = String(formData.get('vigencia') ?? '')
    const motivo = String(formData.get('motivo') ?? '')
    const salario = lerValor(String(formData.get('salario') ?? ''))
    const { beneficios, erros } = lerBeneficios(String(formData.get('beneficios') ?? ''))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia)) throw new Error('Informe a data de vigência.')
    if (!ehMotivo(motivo)) throw new Error('Escolha o motivo.')
    if (salario === null) throw new Error('Informe o valor (ex.: 3.500,00).')
    if (erros.length) throw new Error(erros.join(' '))
    const { error } = await supabase.rpc('registrar_remuneracao_equipe', {
      p_id: id, p_vigencia: vigencia, p_motivo: motivo, p_salario: salario, p_beneficios: beneficios,
      p_observacao: String(formData.get('observacao') ?? '').trim().slice(0, 600) || null,
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar.') }
  }
}

export async function excluirRemuneracao(membroId: string, remuneracaoId: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDaEquipe()
    const { error } = await supabase.rpc('excluir_remuneracao_equipe', { p_remuneracao_id: remuneracaoId })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    revalidar(membroId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}

export async function definirAcessoDaEquipe(userId: string, nivel: NomeDoNivel | null): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDaEquipe()
    const { error } = await supabase.rpc('definir_acesso_equipe', { p_workspace_id: context.workspace.id, p_user_id: userId, p_nivel: nivel })
    if (error) erroDoBanco(error, 'Não foi possível mudar o acesso.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o acesso.') }
  }
}

/**
 * Cria a ficha de quem está na lista de setores (lib/equipe) e ainda não tem
 * uma, com setor e cargo, e liga ao login de mesmo nome quando existe. Vínculo
 * fica "a definir" (diretoria: estatutário) para alguém completar depois.
 */
export async function trazerDaListaDeSetores(): Promise<Resultado & { criados?: number }> {
  try {
    const { context, supabase, nivel } = await contextoDaEquipe()
    if (nivel < 2) throw new Error('Você não tem acesso para editar a equipe.')
    const ws = context.workspace.id
    const [{ data: fichas }, { data: membros }] = await Promise.all([
      supabase.from('equipe_membros').select('nome,user_id').eq('workspace_id', ws).limit(5000),
      supabase.from('workspace_members').select('user_id,profiles(full_name)').eq('workspace_id', ws),
    ])
    const ligados = new Set((fichas ?? []).map((f) => f.user_id).filter(Boolean))
    const login = new Map<string, string>()
    for (const m of membros ?? []) {
      const nome = ((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string } | null)?.full_name
      if (nome && !ligados.has(m.user_id)) login.set(chaveDoNome(nome), m.user_id as string)
    }
    let criados = 0
    for (const p of faltamNaEquipe(PESSOAS_DA_EQUIPE, fichas ?? [])) {
      const { error } = await supabase.rpc('salvar_membro_equipe', {
        p_workspace_id: ws, p_id: null,
        p: {
          nome: p.nome, setor: p.setor, cargo: p.cargo, vinculo: p.setor === 'Diretoria' ? 'estatutario' : 'outro',
          ...(login.has(chaveDoNome(p.nome)) ? { user_id: login.get(chaveDoNome(p.nome)) } : {}),
        },
      })
      if (error) erroDoBanco(error, `Não foi possível criar a ficha de ${p.nome}.`)
      criados++
    }
    revalidar()
    return { criados }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível trazer a lista.') }
  }
}
