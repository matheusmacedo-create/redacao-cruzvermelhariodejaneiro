'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import {
  buscarPorDominio, contaHunter, encontrarEmail, explicarErroDaHunter,
  hunterConfigurado, verificarEmail,
} from '@/lib/imprensa/hunter'
import { comoBalde } from '@/lib/imprensa/email-status'

/**
 * Contatos de imprensa: encontrar (Hunter.io), verificar e guardar num lugar
 * só. Não dispara e-mail — ver a nota na migração sobre por que essa
 * responsabilidade fica de fora desta primeira versão.
 *
 * Todas devolvem { erro } em vez de lançar, como o resto da Redação: o Next
 * apaga a mensagem de uma exceção de server action em produção.
 */

const texto = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const comoErro = (causa: unknown, padrao: string): { erro: string } => ({ erro: mensagemDoErro(causa, padrao) })

export type ContatoDeImprensa = {
  id: string
  nome: string
  veiculo: string
  cargo: string
  dominio: string
  email: string | null
  emailStatus: 'nao_verificado' | 'valido' | 'arriscado' | 'invalido'
  confianca: number | null
  telefone: string
  tags: string[]
  notas: string
  fonte: 'manual' | 'hunter_dominio' | 'hunter_email_finder'
  verificadoEm: string | null
  criadoPor: string | null
  atualizadoEm: string
}

function lerTags(bruto: string): string[] {
  return bruto.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10)
}

/** Cadastro manual — quando o contato já se conhece e não precisa de busca. */
export async function criarContatoManual(formData: FormData): Promise<{ erro?: string; id?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()

    const nome = texto(formData, 'nome')
    const email = texto(formData, 'email')
    if (!nome && !email) throw new Error('Informe ao menos o nome ou o e-mail do contato.')
    if (email && !email.includes('@')) throw new Error('O e-mail informado não parece válido.')

    const { data, error } = await supabase.from('press_contacts').insert({
      workspace_id: context.workspace.id,
      nome,
      veiculo: texto(formData, 'veiculo'),
      cargo: texto(formData, 'cargo'),
      dominio: texto(formData, 'dominio').toLowerCase(),
      email: email || null,
      telefone: texto(formData, 'telefone'),
      tags: lerTags(texto(formData, 'tags')),
      notas: texto(formData, 'notas'),
      fonte: 'manual',
      created_by: context.user.id,
    }).select('id').single()

    if (error) {
      if (error.code === '23505') throw new Error('Já existe um contato com este e-mail neste espaço.')
      throw new Error('Não foi possível salvar o contato.')
    }

    revalidatePath('/imprensa')
    return { id: data.id }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar o contato.')
  }
}

export async function atualizarContato(formData: FormData): Promise<{ erro?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    if (!id) throw new Error('Contato não informado.')

    const email = texto(formData, 'email')
    if (email && !email.includes('@')) throw new Error('O e-mail informado não parece válido.')

    const { error } = await supabase.from('press_contacts').update({
      nome: texto(formData, 'nome'),
      veiculo: texto(formData, 'veiculo'),
      cargo: texto(formData, 'cargo'),
      dominio: texto(formData, 'dominio').toLowerCase(),
      email: email || null,
      telefone: texto(formData, 'telefone'),
      tags: lerTags(texto(formData, 'tags')),
      notas: texto(formData, 'notas'),
    }).eq('id', id).eq('workspace_id', context.workspace.id)

    if (error) {
      if (error.code === '23505') throw new Error('Já existe um contato com este e-mail neste espaço.')
      throw new Error('Não foi possível salvar as alterações.')
    }

    revalidatePath('/imprensa')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar as alterações.')
  }
}

export async function excluirContato(formData: FormData): Promise<{ erro?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    const { error } = await supabase.from('press_contacts')
      .delete().eq('id', id).eq('workspace_id', context.workspace.id)
    // RLS recusa em silêncio (0 linhas) quem não é admin nem dono do contato;
    // sem erro de banco, a mensagem genérica é o que sobra para explicar.
    if (error) throw new Error('Não foi possível remover o contato.')

    revalidatePath('/imprensa')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível remover o contato.')
  }
}

export type ResultadoDaBusca = {
  erro?: string
  dominio?: string
  organizacao?: string
  candidatos?: CandidatoDeContato[]
  aviso?: string
}

/** Um e-mail que a Hunter.io já viu naquele domínio — client-safe: não importa
 * nada de lib/imprensa/hunter.ts (que é 'server-only'), só espelha a forma. */
export type CandidatoDeContato = {
  email: string
  tipo: 'personal' | 'generic' | null
  confianca: number | null
  nome: string
  sobrenome: string
  cargo: string
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown' | null
  jaCadastrado: boolean
}

/**
 * Todo mundo que a Hunter já viu naquele domínio — não salva nada sozinho, a
 * pessoa escolhe quem entra no banco. Consome 1 busca da cota do plano.
 */
export async function buscarContatosPorDominio(formData: FormData): Promise<ResultadoDaBusca> {
  try {
    if (!hunterConfigurado()) throw new Error('A Hunter.io não está configurada. Cadastre HUNTER_API_KEY na Vercel.')
    const context = await requireWorkspace()
    const supabase = await createClient()
    const dominio = texto(formData, 'dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!dominio || !dominio.includes('.')) throw new Error('Informe um domínio válido, como oglobo.globo.com.')

    const [resultado, conta, existentes] = await Promise.all([
      buscarPorDominio({ dominio }),
      contaHunter().catch(() => null),
      supabase.from('press_contacts').select('email').eq('workspace_id', context.workspace.id).not('email', 'is', null),
    ])

    const jaTem = new Set((existentes.data ?? []).map((c) => (c.email ?? '').toLowerCase()))
    const candidatos = resultado.contatos.map((c) => ({ ...c, jaCadastrado: jaTem.has(c.email.toLowerCase()) }))

    // Aviso de cota baixa: gasto real, então quem está buscando merece saber
    // antes de torrar o que sobrou do mês num domínio que pode nem servir.
    let aviso: string | undefined
    if (conta?.buscas && conta.buscas.disponiveis - conta.buscas.usadas <= 3) {
      aviso = `Restam ${Math.max(0, conta.buscas.disponiveis - conta.buscas.usadas)} buscas no plano da Hunter.io este mês.`
    }
    if (!candidatos.length) aviso = [aviso, 'Nenhum contato encontrado para este domínio.'].filter(Boolean).join(' ')

    return { dominio: resultado.dominio, organizacao: resultado.organizacao, candidatos, aviso }
  } catch (causa) {
    return { erro: explicarErroDaHunter(causa) }
  }
}

/** Grava os candidatos que a pessoa marcou na busca por domínio. */
export async function adicionarContatosDaBusca(formData: FormData): Promise<{ erro?: string; adicionados?: number; repetidos?: number }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const dominio = texto(formData, 'dominio').toLowerCase()
    const veiculo = texto(formData, 'veiculo')

    let candidatos: CandidatoDeContato[]
    try {
      candidatos = JSON.parse(texto(formData, 'candidatos') || '[]')
    } catch {
      throw new Error('A lista de contatos chegou corrompida. Busque de novo.')
    }
    if (!Array.isArray(candidatos) || !candidatos.length) throw new Error('Nenhum contato selecionado.')

    let adicionados = 0
    let repetidos = 0
    for (const c of candidatos.slice(0, 50)) {
      const email = typeof c.email === 'string' ? c.email.trim() : ''
      if (!email || !email.includes('@')) continue
      const { error } = await supabase.from('press_contacts').insert({
        workspace_id: context.workspace.id,
        nome: [c.nome, c.sobrenome].filter(Boolean).join(' ').trim(),
        veiculo,
        cargo: c.cargo ?? '',
        dominio,
        email,
        email_status: comoBalde(c.status),
        confianca: typeof c.confianca === 'number' ? Math.round(c.confianca) : null,
        verificado_em: c.status ? new Date().toISOString() : null,
        fonte: 'hunter_dominio',
        created_by: context.user.id,
      })
      if (error) { if (error.code === '23505') repetidos++; continue }
      adicionados++
    }

    if (!adicionados) throw new Error(repetidos ? 'Todos os contatos selecionados já estavam cadastrados.' : 'Não foi possível salvar os contatos.')

    revalidatePath('/imprensa')
    return { adicionados, repetidos }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar os contatos.')
  }
}

/**
 * Encontra o e-mail de UMA pessoa específica (nome + domínio do veículo) e já
 * cadastra o contato. Consome 1 busca da cota, ache ou não o e-mail.
 */
export async function encontrarEEcadastrarContato(formData: FormData): Promise<{ erro?: string; id?: string; aviso?: string }> {
  try {
    if (!hunterConfigurado()) throw new Error('A Hunter.io não está configurada. Cadastre HUNTER_API_KEY na Vercel.')
    const context = await requireWorkspace()
    const supabase = await createClient()

    const nome = texto(formData, 'nome')
    const sobrenome = texto(formData, 'sobrenome')
    const dominio = texto(formData, 'dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!nome || !sobrenome) throw new Error('Informe nome e sobrenome — a Hunter.io precisa dos dois para procurar.')
    if (!dominio || !dominio.includes('.')) throw new Error('Informe um domínio válido, como oglobo.globo.com.')

    const achado = await encontrarEmail({ dominio, nome, sobrenome })
    if (!achado.email) {
      return { erro: `A Hunter.io não encontrou um e-mail para ${nome} ${sobrenome} em ${dominio}. Cadastre manualmente, se souber o e-mail por outra via.` }
    }

    const { data, error } = await supabase.from('press_contacts').insert({
      workspace_id: context.workspace.id,
      nome: `${nome} ${sobrenome}`.trim(),
      veiculo: texto(formData, 'veiculo'),
      cargo: achado.cargo || texto(formData, 'cargo'),
      dominio,
      email: achado.email,
      email_status: comoBalde(achado.status),
      confianca: achado.confianca !== null ? Math.round(achado.confianca) : null,
      verificado_em: new Date().toISOString(),
      telefone: texto(formData, 'telefone'),
      notas: texto(formData, 'notas'),
      fonte: 'hunter_email_finder',
      created_by: context.user.id,
    }).select('id').single()

    if (error) {
      if (error.code === '23505') throw new Error(`A Hunter.io encontrou ${achado.email}, mas este e-mail já está cadastrado.`)
      throw new Error('O e-mail foi encontrado, mas não foi possível salvar o contato.')
    }

    revalidatePath('/imprensa')
    return {
      id: data.id,
      aviso: achado.status !== 'valid' ? `E-mail encontrado com confiança ${achado.confianca ?? '?'}%. Vale conferir antes de usar para algo importante.` : undefined,
    }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível encontrar o e-mail.')
  }
}

/** Confirma se um e-mail já cadastrado existe de verdade. Consome 1
 * verificação da cota. */
export async function verificarEmailDoContato(formData: FormData): Promise<{ erro?: string }> {
  try {
    if (!hunterConfigurado()) throw new Error('A Hunter.io não está configurada. Cadastre HUNTER_API_KEY na Vercel.')
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')

    const { data: contato } = await supabase.from('press_contacts')
      .select('email').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!contato?.email) throw new Error('Este contato não tem e-mail cadastrado para verificar.')

    const resultado = await verificarEmail(contato.email)

    const { error } = await supabase.from('press_contacts').update({
      email_status: comoBalde(resultado.status),
      confianca: resultado.confianca !== null ? Math.round(resultado.confianca) : null,
      verificado_em: new Date().toISOString(),
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('A verificação funcionou, mas não foi possível salvar o resultado.')

    revalidatePath('/imprensa')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível verificar o e-mail.')
  }
}
