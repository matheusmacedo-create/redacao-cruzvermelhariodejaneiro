'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDaEquipe } from '@/lib/rh/acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { PESSOAS_DA_EQUIPE, chaveDoNome } from '@/lib/equipe'
import {
  CATEGORIAS_DE_ARQUIVO, TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO, conteudoConfere, ehCategoria, ehMotivo, ehTipoAceito, faltamNaEquipe, formatarCpf, lerArquivo,
  lerBeneficios, lerFormulario, lerValor, type NomeDoNivel,
} from '@/lib/rh/regras'
import { nomesDosSetores } from '@/lib/setores'

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
    // O setor que a ficha já tem vale, mesmo que tenha saído da lista.
    const setores = await nomesDosSetores(supabase, context.workspace.id)
    if (id) {
      const { data: atual } = await supabase.from('equipe_membros').select('setor').eq('id', id).maybeSingle()
      if (atual?.setor) setores.push(atual.setor as string)
    }
    const { dados, erros } = lerFormulario(formData, hojeEmSaoPaulo(), setores)
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

// ---------------------------------------------------------------- arquivos

const BUCKET_DE_ARQUIVOS = 'equipe-arquivos'

/**
 * Primeiro passo do envio: confere o nível para a categoria e devolve um link
 * de envio de uso único. O arquivo vai do navegador direto ao Storage — sem
 * passar pelo servidor, que limita o corpo da requisição a poucos MB.
 */
export async function prepararEnvioDeArquivo(membroId: string, categoria: string, tipo: string, tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDaEquipe()
    if (!ehCategoria(categoria)) throw new Error('Escolha a categoria.')
    if (nivel < CATEGORIAS_DE_ARQUIVO[categoria].nivel) throw new Error('Você não tem acesso para guardar este tipo de arquivo.')
    if (!ehTipoAceito(tipo)) throw new Error('Envie PDF, JPG, PNG ou WEBP.')
    if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO) throw new Error('O arquivo pode ter até 20 MB.')
    const { data: m } = await supabase.from('equipe_membros').select('id').eq('id', membroId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!m) throw new Error('Pessoa não encontrada.')
    const caminho = `${context.workspace.id}/${membroId}/${randomUUID()}.${TIPOS_DE_ARQUIVO[tipo]}`
    const { data, error } = await createAdminClient().storage.from(BUCKET_DE_ARQUIVOS).createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

/**
 * Segundo passo: registra o arquivo já enviado. O banco confere nível,
 * caminho e existência; aqui o servidor lê o arquivo, confere que o conteúdo
 * é mesmo do tipo declarado e grava a impressão digital (SHA-256). Arquivo
 * que não confere é apagado.
 */
export async function registrarArquivo(membroId: string, caminho: string, nomeOriginal: string, formData: FormData): Promise<Resultado> {
  const admin = createAdminClient()
  try {
    const { supabase } = await contextoDaEquipe()
    const { dados, erros } = lerArquivo(formData, hojeEmSaoPaulo())
    // O caminho vem do navegador: só se apaga no Storage depois de o banco
    // confirmar que ele é desta pessoa (abaixo). O formulário é conferido na
    // tela antes do envio, então aqui um erro é raro e deixa só um órfão.
    if (!dados) throw new Error(erros.join(' '))
    const { data: id, error } = await supabase.rpc('registrar_arquivo_equipe', {
      p_membro_id: membroId, p_caminho: caminho, p: { ...dados, nome_original: nomeOriginal.slice(0, 200) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar o arquivo.')
    const { data: blob, error: e2 } = await admin.storage.from(BUCKET_DE_ARQUIVOS).download(caminho)
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null
    const tipo = blob?.type ?? ''
    if (e2 || !bytes || !conteudoConfere(tipo, bytes)) {
      await supabase.rpc('excluir_arquivo_equipe', { p_id: id, p_motivo: 'Conteúdo não confere com o tipo do arquivo (recusado no envio).' })
      await admin.storage.from(BUCKET_DE_ARQUIVOS).remove([caminho]).catch(() => undefined)
      throw new Error('O conteúdo do arquivo não confere com o tipo (PDF, JPG, PNG ou WEBP). Envie o arquivo original.')
    }
    await admin.rpc('selar_arquivo_equipe', { p_id: id, p_sha256: createHash('sha256').update(bytes).digest('hex') })
    revalidar(membroId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o arquivo.') }
  }
}

export async function excluirArquivo(membroId: string, id: string, motivo: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDaEquipe()
    const { data: caminho, error } = await supabase.rpc('excluir_arquivo_equipe', { p_id: id, p_motivo: motivo.trim().slice(0, 600) })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    if (caminho) await createAdminClient().storage.from(BUCKET_DE_ARQUIVOS).remove([String(caminho)]).catch(() => undefined)
    revalidar(membroId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}
