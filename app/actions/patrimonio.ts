'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { notificar } from '@/lib/notificacoes/servidor'
import { enviarAoVoluntario } from '@/lib/membro/comunicacao'
import { emailDeBemEntregue } from '@/lib/membro/emails'
import { urlBase } from '@/lib/newsletter/contexto'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { ehDestinoDeBaixa, ehEstado, ehNomeDoNivel, ehTipoDeManutencao, lerBem, lerValor, type NomeDoNivel } from '@/lib/patrimonio/regras'

/**
 * Patrimônio — escrita. As regras (nível, bem baixado, cautela aberta,
 * inventário aberto) são conferidas de novo pelo banco.
 */

type Resultado = { erro?: string }

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo está fora do permitido.')
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/patrimonio', 'layout')
  if (id) revalidatePath(`/patrimonio/${id}`)
}

const ehUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)

export async function salvarBem(id: string | null, _anterior: Resultado & { id?: string }, formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const { dados, erros } = lerBem(formData, hojeEmSaoPaulo())
    if (!dados) throw new Error(erros.join(' '))
    const { data, error } = await supabase.rpc('patrimonio_salvar_bem', { p_workspace_id: context.workspace.id, p_id: id, p: dados })
    if (error) erroDoBanco(error, 'Não foi possível salvar o bem.')
    revalidar(data as string)
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o bem.') }
  }
}

/** Entrega a um login do Redação ou a um voluntário, e avisa a pessoa para aceitar o termo. */
export async function entregarBem(bemId: string, p: { tipo: 'equipe' | 'voluntario'; pessoa: string; prevista: string; observacao: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.pessoa)) throw new Error('Escolha a pessoa.')
    if (p.prevista && !/^\d{4}-\d{2}-\d{2}$/.test(p.prevista)) throw new Error('Data de devolução inválida.')
    const { error } = await supabase.rpc('patrimonio_entregar', {
      p_bem_id: bemId,
      p: { [p.tipo === 'equipe' ? 'user_id' : 'participante_id']: p.pessoa, prevista_devolucao: p.prevista, observacao: p.observacao.slice(0, 1000) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a entrega.')
    const { data: bem } = await supabase.from('pat_bens').select('nome,plaqueta').eq('id', bemId).single()
    if (bem) {
      if (p.tipo === 'equipe') {
        await notificar(createAdminClient(), {
          workspaceId: context.workspace.id, para: [p.pessoa], atorId: context.user.id, categoria: 'patrimonio',
          titulo: 'Um bem da filial está com você', mensagem: `${bem.nome} (${bem.plaqueta}). Confira e aceite o termo de responsabilidade.`,
          link: '/patrimonio/comigo', botao: 'Ver e aceitar',
        })
      } else {
        const { data: v } = await createAdminClient().from('participantes').select('nome,nome_social,email').eq('id', p.pessoa).maybeSingle()
        if (v?.email) await enviarAoVoluntario(v.email, emailDeBemEntregue({ nome: v.nome_social || v.nome, bem: bem.nome as string, plaqueta: bem.plaqueta as string, url: `${urlBase()}/membro/perfil#bens` }))
      }
    }
    revalidar(bemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a entrega.') }
  }
}

export async function devolverBem(bemId: string, cautelaId: string, p: { estado: string; local_id: string; observacao: string }): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoPatrimonio()
    if (!ehEstado(p.estado)) throw new Error('Diga em que estado o bem voltou.')
    const { error } = await supabase.rpc('patrimonio_devolver', { p_cautela_id: cautelaId, p: { estado: p.estado, local_id: ehUuid(p.local_id) ? p.local_id : '', observacao: p.observacao.slice(0, 1000) } })
    if (error) erroDoBanco(error, 'Não foi possível registrar a devolução.')
    revalidar(bemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a devolução.') }
  }
}

export async function aceitarTermo(cautelaId: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoPatrimonio()
    const { error } = await supabase.rpc('patrimonio_aceitar_termo', { p_cautela_id: cautelaId })
    if (error) erroDoBanco(error, 'Não foi possível aceitar o termo.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível aceitar o termo.') }
  }
}

export async function registrarManutencao(bemId: string, p: { id?: string; tipo: string; descricao: string; prevista_para: string; realizada_em: string; fornecedor: string; custo: string }): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoPatrimonio()
    if (!ehTipoDeManutencao(p.tipo)) throw new Error('Escolha o tipo de manutenção.')
    if (p.descricao.trim().length < 2) throw new Error('Descreva a manutenção.')
    if (!p.prevista_para && !p.realizada_em) throw new Error('Informe quando está prevista ou quando foi feita.')
    const custo = lerValor(p.custo)
    if (custo !== null && Number.isNaN(custo)) throw new Error('Custo inválido.')
    const { error } = await supabase.rpc('patrimonio_manutencao', {
      p_bem_id: bemId,
      p: { id: p.id ?? '', tipo: p.tipo, descricao: p.descricao.trim().slice(0, 600), prevista_para: p.prevista_para, realizada_em: p.realizada_em, fornecedor: p.fornecedor.slice(0, 160), custo: custo ?? '' },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a manutenção.')
    revalidar(bemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a manutenção.') }
  }
}

export async function excluirManutencao(bemId: string, id: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoPatrimonio()
    const { error } = await supabase.rpc('patrimonio_excluir_manutencao', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    revalidar(bemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}

export async function baixarBem(bemId: string, p: { destino: string; motivo: string; data: string }): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoPatrimonio()
    if (!ehDestinoDeBaixa(p.destino)) throw new Error('Escolha o destino da baixa.')
    const { error } = await supabase.rpc('patrimonio_baixar', { p_bem_id: bemId, p_destino: p.destino, p_motivo: p.motivo.trim(), p_data: p.data || null })
    if (error) erroDoBanco(error, 'Não foi possível dar baixa.')
    revalidar(bemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível dar baixa.') }
  }
}

// ---------------------------------------------------------------- inventário

export async function iniciarInventario(nome: string): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (nome.trim().length < 2) throw new Error('Dê um nome ao inventário (ex.: "Inventário anual 2026").')
    const { error } = await supabase.rpc('patrimonio_iniciar_inventario', { p_workspace_id: context.workspace.id, p_nome: nome.trim() })
    if (error) erroDoBanco(error, 'Não foi possível abrir o inventário.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o inventário.') }
  }
}

export async function conferirBem(bemId: string, p: { local_id: string; estado: string; observacao: string }): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoPatrimonio()
    const { error } = await supabase.rpc('patrimonio_conferir', {
      p_bem_id: bemId, p: { local_id: ehUuid(p.local_id) ? p.local_id : '', estado: ehEstado(p.estado) ? p.estado : '', observacao: p.observacao.slice(0, 600) },
    })
    if (error) erroDoBanco(error, 'Não foi possível conferir.')
    revalidar(bemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conferir.') }
  }
}

export async function concluirInventario(): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const { error } = await supabase.rpc('patrimonio_concluir_inventario', { p_workspace_id: context.workspace.id })
    if (error) erroDoBanco(error, 'Não foi possível concluir.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível concluir.') }
  }
}

// ---------------------------------------------------------------- cadastros

export async function salvarCadastroDoPatrimonio(tabela: 'categoria' | 'local' | 'config', id: string | null, _anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const t = (k: string, max = 200) => String(formData.get(k) ?? '').trim().slice(0, max)
    let p: Record<string, unknown>
    if (tabela === 'config') {
      p = { prefixo: t('prefixo', 8).toUpperCase(), termo_padrao: t('termo_padrao', 4000) }
      if (!/^[A-Z0-9]{1,8}$/.test(p.prefixo as string)) throw new Error('Prefixo: só letras e números, até 8.')
      if ((p.termo_padrao as string).length < 20) throw new Error('Escreva o texto do termo de responsabilidade.')
    } else {
      const nome = t('nome', 80)
      if (nome.length < 2) throw new Error('Informe o nome.')
      p = tabela === 'local'
        ? { nome, descricao: t('descricao', 300), ativo: formData.get('ativo') !== 'nao' }
        : { nome, vida_util_meses: t('vida_util_meses', 4), residual_pct: t('residual_pct', 6).replace(',', '.'), conta_contabil: t('conta_contabil', 40), manutencao_meses: t('manutencao_meses', 4), ativa: formData.get('ativa') !== 'nao' }
      if (tabela === 'categoria') {
        for (const [k, max] of [['vida_util_meses', 1200], ['manutencao_meses', 120]] as const) {
          const v = p[k] as string
          if (v && (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max)) throw new Error(k === 'vida_util_meses' ? 'Vida útil: de 1 a 1.200 meses.' : 'Manutenção: de 1 a 120 meses.')
        }
        const r = p.residual_pct as string
        if (r && (Number.isNaN(Number(r)) || Number(r) < 0 || Number(r) > 100)) throw new Error('Valor residual: de 0 a 100%.')
      }
      if (id) p.id = id
    }
    const { error } = await supabase.rpc('patrimonio_salvar_cadastro', { p_workspace_id: context.workspace.id, p_tabela: tabela, p })
    if (error) erroDoBanco(error, 'Não foi possível salvar.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

export async function definirAcessoDoPatrimonio(userId: string, nivel: NomeDoNivel | null): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (nivel !== null && !ehNomeDoNivel(nivel)) throw new Error('Nível inválido.')
    const { error } = await supabase.rpc('patrimonio_definir_acesso', { p_workspace_id: context.workspace.id, p_user_id: userId, p_nivel: nivel })
    if (error) erroDoBanco(error, 'Não foi possível mudar o acesso.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o acesso.') }
  }
}
