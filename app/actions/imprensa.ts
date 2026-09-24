'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { ehControleDoNext, mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import {
  buscarPorDominio, contaHunter, encontrarEmail, explicarErroDaHunter,
  HunterConfigError, verificarEmail,
} from '@/lib/imprensa/hunter'
import { obterChave } from '@/lib/integracoes/chaves'
import { comoBalde } from '@/lib/imprensa/email-status'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, emLotes, enviarLote, semChave, type Mensagem } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import {
  emailDaCampanha, linkValido, motivoDeFora, TETO_DE_DESTINATARIOS,
} from '@/lib/imprensa/campanha'
import { comoEtiqueta, extrairEmail, LOTE_DE_IMPORTACAO } from '@/lib/imprensa/importacao'

/** Divide ids para filtros `in`: a lista vai na URL, e URL tem limite. */
function emPedacos<T>(itens: T[], tamanho = 200): T[][] {
  const pedacos: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) pedacos.push(itens.slice(i, i + tamanho))
  return pedacos
}

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

/** Erro de uma ação que fala com a Hunter: traduzido, e sem engolir o redirect do Next. */
function erroDaHunter(causa: unknown): { erro: string } {
  if (ehControleDoNext(causa)) throw causa
  return { erro: explicarErroDaHunter(causa).slice(0, 500) }
}

/** A chave da Hunter para este espaço — quem chama já passou por requireWorkspace. */
async function chaveDaHunter(workspaceId: string): Promise<string> {
  const chave = await obterChave(workspaceId, 'hunter')
  if (!chave) throw new HunterConfigError()
  return chave
}

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
  fonte: 'manual' | 'hunter_dominio' | 'hunter_email_finder' | 'importado'
  verificadoEm: string | null
  criadoPor: string | null
  atualizadoEm: string
  descadastradoEm: string | null
  ultimoEnvioEm: string | null
  ultimaAberturaEm: string | null
  enviosSemAbertura: number
  totalEnvios: number
  totalAberturas: number
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
    const context = await requireWorkspace()
    const chave = await chaveDaHunter(context.workspace.id)
    const supabase = await createClient()
    const dominio = texto(formData, 'dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!dominio || !dominio.includes('.')) throw new Error('Informe um domínio válido, como oglobo.globo.com.')

    const [resultado, conta, existentes] = await Promise.all([
      buscarPorDominio(chave, { dominio }),
      contaHunter(chave).catch(() => null),
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
    return erroDaHunter(causa)
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
    const context = await requireWorkspace()
    const chave = await chaveDaHunter(context.workspace.id)
    const supabase = await createClient()

    const nome = texto(formData, 'nome')
    const sobrenome = texto(formData, 'sobrenome')
    const dominio = texto(formData, 'dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!nome || !sobrenome) throw new Error('Informe nome e sobrenome — a Hunter.io precisa dos dois para procurar.')
    if (!dominio || !dominio.includes('.')) throw new Error('Informe um domínio válido, como oglobo.globo.com.')

    const achado = await encontrarEmail(chave, { dominio, nome, sobrenome })
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
    return erroDaHunter(causa)
  }
}

/** Confirma se um e-mail já cadastrado existe de verdade. Consome 1
 * verificação da cota. */
export async function verificarEmailDoContato(formData: FormData): Promise<{ erro?: string }> {
  try {
    const context = await requireWorkspace()
    const chave = await chaveDaHunter(context.workspace.id)
    const supabase = await createClient()
    const id = texto(formData, 'id')

    const { data: contato } = await supabase.from('press_contacts')
      .select('email').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!contato?.email) throw new Error('Este contato não tem e-mail cadastrado para verificar.')

    const resultado = await verificarEmail(chave, contato.email)

    const { error } = await supabase.from('press_contacts').update({
      email_status: comoBalde(resultado.status),
      confianca: resultado.confianca !== null ? Math.round(resultado.confianca) : null,
      verificado_em: new Date().toISOString(),
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('A verificação funcionou, mas não foi possível salvar o resultado.')

    revalidatePath('/imprensa')
    return {}
  } catch (causa) {
    return erroDaHunter(causa)
  }
}

/** Remove vários contatos de uma vez — o "tirar quem não lê". Mesma regra de
 * RLS da remoção individual: admin, ou quem cadastrou. */
export async function excluirContatos(formData: FormData): Promise<{ erro?: string; removidos?: number }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    let ids: string[]
    try { ids = JSON.parse(texto(formData, 'ids') || '[]') } catch { ids = [] }
    ids = Array.isArray(ids) ? ids.filter((i) => typeof i === 'string').slice(0, 1000) : []
    if (!ids.length) throw new Error('Nenhum contato selecionado.')

    let removidos = 0
    for (const pedaco of emPedacos(ids)) {
      const { data, error } = await supabase.from('press_contacts')
        .delete().in('id', pedaco).eq('workspace_id', context.workspace.id).select('id')
      if (error) throw new Error(removidos ? `Removidos ${removidos}; o resto falhou.` : 'Não foi possível remover os contatos.')
      removidos += data?.length ?? 0
    }
    if (!removidos) throw new Error('Nenhum contato removido. Só administradores ou quem cadastrou podem remover.')

    await createAdminClient().from('activity_log').insert({
      workspace_id: context.workspace.id,
      actor_id: context.user.id,
      action: 'contatos_removidos',
      entity_type: 'press_contacts',
      metadata: { quantos: removidos },
    })

    revalidatePath('/imprensa')
    return { removidos }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível remover os contatos.')
  }
}

// ---------------------------------------------------------------- campanhas

const REMETENTE_PADRAO = 'Cruz Vermelha RJ — Comunicação <imprensa@noticias.cruzvermelhariodejaneiro.org>'
const remetenteDaCampanha = () => process.env.IMPRENSA_REMETENTE?.trim() || REMETENTE_PADRAO
const respostaDaCampanha = () => process.env.IMPRENSA_RESPONDER_PARA?.trim() || undefined

const urlDoPixel = (token: string) => `${urlBase()}/api/comunicados/abertura/${token}`
const urlDoClique = (token: string) => `${urlBase()}/api/comunicados/clique/${token}`
// c = o destinatário: diz qual campanha fez a pessoa sair.
const urlDeSaidaDoContato = (token: string, c: string) => `${urlBase()}/comunicados/sair?t=${token}&c=${c}`
const urlDeSaidaEmUmCliqueDoContato = (token: string, c: string) => `${urlBase()}/api/comunicados/sair?t=${token}&c=${c}`

type Rascunho = { assunto: string; corpo: string; linkUrl: string; linkRotulo: string }

function lerRascunho(formData: FormData): Rascunho {
  const r = {
    assunto: texto(formData, 'assunto'),
    corpo: String(formData.get('corpo') ?? '').trim(),
    linkUrl: texto(formData, 'linkUrl'),
    linkRotulo: texto(formData, 'linkRotulo'),
  }
  if (r.assunto.length > 200) throw new Error('Assunto longo demais (máximo 200 caracteres).')
  if (!linkValido(r.linkUrl)) throw new Error('O link precisa começar com https://')
  return r
}

/** Guarda a campanha sem enviar. Os destinatários se escolhem no envio. */
export async function salvarRascunho(formData: FormData): Promise<{ erro?: string; id?: string }> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'imprensa.campanhas')) throw new Error('Campanhas são para administradores e editores.')
    const r = lerRascunho(formData)
    if (!r.assunto && !r.corpo) throw new Error('Escreva ao menos o assunto ou o texto.')
    const id = texto(formData, 'campanhaId')
    const admin = createAdminClient()
    const linha = {
      assunto: r.assunto, corpo: r.corpo, link_url: r.linkUrl, link_rotulo: r.linkRotulo,
      atualizada_em: new Date().toISOString(),
    }
    if (id) {
      const { data, error } = await admin.from('press_campanhas').update(linha)
        .eq('id', id).eq('workspace_id', context.workspace.id).eq('estado', 'rascunho').select('id')
      if (error || !data?.length) throw new Error('Este rascunho não existe mais ou já foi enviado.')
      revalidatePath('/imprensa')
      return { id }
    }
    const { data, error } = await admin.from('press_campanhas').insert({
      ...linha, workspace_id: context.workspace.id, estado: 'rascunho', enviada_por: context.user.id,
    }).select('id').single()
    if (error || !data) throw new Error('Não foi possível guardar o rascunho.')
    revalidatePath('/imprensa')
    return { id: data.id }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível guardar o rascunho.')
  }
}

export async function excluirRascunho(formData: FormData): Promise<{ erro?: string }> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'imprensa.campanhas')) throw new Error('Campanhas são para administradores e editores.')
    const { error } = await createAdminClient().from('press_campanhas').delete()
      .eq('id', texto(formData, 'id')).eq('workspace_id', context.workspace.id).eq('estado', 'rascunho')
    if (error) throw new Error('Não foi possível apagar o rascunho.')
    revalidatePath('/imprensa')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível apagar o rascunho.')
  }
}

/** Follow-up: os contatos que receberam a campanha e não abriram. */
export async function naoAbriramDaCampanha(formData: FormData): Promise<{ erro?: string; ids?: string[] }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const ids: string[] = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('press_campanha_destinatarios')
        .select('contato_id')
        .eq('workspace_id', context.workspace.id).eq('campanha_id', texto(formData, 'id'))
        .eq('estado', 'enviado').is('aberto_em', null).not('contato_id', 'is', null)
        .range(de, de + 999)
      if (error) throw new Error('Não foi possível ler quem não abriu.')
      ids.push(...(data ?? []).map((d) => d.contato_id as string))
      if (!data || data.length < 1000) break
    }
    return { ids }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível ler quem não abriu.')
  }
}

/**
 * Dispara uma campanha para os contatos escolhidos.
 *
 * Tudo fica registrado antes de sair: a campanha e cada destinatário (com o
 * token do pixel que vai dentro da mensagem). Depois de cada lote, o
 * resultado; no fim, concluir_campanha fecha os totais e atualiza a
 * sequência "sem abertura" de cada contato. O histórico é visível a toda a
 * equipe.
 *
 * Quem não pode receber (sem e-mail, inválido, saiu da lista) é filtrado
 * AQUI, no servidor, com o dado do banco — não pela seleção da tela.
 */
export async function enviarCampanha(formData: FormData): Promise<{ erro?: string; recado?: string }> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'imprensa.campanhas')) throw new Error('Disparar campanha é para administradores e editores.')
    if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado: falta RESEND_API_KEY.')

    const { assunto, corpo, linkUrl, linkRotulo } = lerRascunho(formData)
    if (assunto.length < 3) throw new Error('Escreva o assunto.')
    if (corpo.length < 10) throw new Error('Escreva o texto da mensagem.')
    const rascunhoId = texto(formData, 'campanhaId')

    let ids: string[]
    try { ids = JSON.parse(texto(formData, 'ids') || '[]') } catch { ids = [] }
    ids = Array.isArray(ids) ? [...new Set(ids.filter((i) => typeof i === 'string'))] : []
    if (!ids.length) throw new Error('Selecione ao menos um contato.')
    if (ids.length > TETO_DE_DESTINATARIOS) throw new Error(`No máximo ${TETO_DE_DESTINATARIOS} contatos por campanha.`)

    const admin = createAdminClient()
    const workspaceId = context.workspace.id

    const contatos: { id: string; nome: string; email: string | null; email_status: string; descadastrado_em: string | null; token_descadastro: string }[] = []
    for (const pedaco of emPedacos(ids)) {
      const { data, error } = await admin.from('press_contacts')
        .select('id, nome, email, email_status, descadastrado_em, token_descadastro')
        .eq('workspace_id', workspaceId).in('id', pedaco)
      if (error) throw new Error('Não foi possível ler os contatos.')
      contatos.push(...(data ?? []))
    }

    const aptos = contatos.filter((c) => !motivoDeFora({
      email: c.email, emailStatus: c.email_status, descadastradoEm: c.descadastrado_em,
    }))
    const deFora = ids.length - aptos.length
    if (!aptos.length) throw new Error('Nenhum dos contatos selecionados pode receber: sem e-mail, e-mail inválido ou saíram da lista.')

    const agora = new Date().toISOString()
    const dadosDaCampanha = {
      assunto,
      corpo,
      link_url: linkUrl,
      link_rotulo: linkRotulo,
      estado: 'enviando',
      total_destinatarios: aptos.length,
      enviada_por: context.user.id,
      enviada_em: agora,
      atualizada_em: agora,
    }
    // Rascunho que sai vira a própria campanha: some da aba de rascunhos e
    // aparece como enviada, sem cópia. O filtro por estado impede reenviar
    // uma campanha que já saiu (dois cliques rápidos, duas abas abertas).
    const { data: campanha, error: erroCampanha } = rascunhoId
      ? await admin.from('press_campanhas').update(dadosDaCampanha)
        .eq('id', rascunhoId).eq('workspace_id', workspaceId).eq('estado', 'rascunho').select('id').maybeSingle()
      : await admin.from('press_campanhas').insert({ ...dadosDaCampanha, workspace_id: workspaceId }).select('id').single()
    if (erroCampanha || !campanha) {
      throw new Error(rascunhoId ? 'Este rascunho já foi enviado ou não existe mais.' : 'Não foi possível registrar a campanha.')
    }

    const fila: { id: string; contato_id: string | null; email: string; nome: string; token_abertura: string }[] = []
    let erroFila = false
    for (const pedaco of emPedacos(aptos, 500)) {
      const { data, error } = await admin.from('press_campanha_destinatarios').insert(
        pedaco.map((c) => ({
          campanha_id: campanha.id,
          workspace_id: workspaceId,
          contato_id: c.id,
          email: c.email as string,
          nome: c.nome ?? '',
          estado: 'na_fila',
        })),
      ).select('id, contato_id, email, nome, token_abertura')
      if (error || !data) { erroFila = true; break }
      fila.push(...data)
    }
    if (erroFila) {
      await admin.from('press_campanhas').update({ estado: 'falhou', concluida_em: new Date().toISOString() }).eq('id', campanha.id)
      throw new Error('Não foi possível preparar a lista de destinatários.')
    }

    const tokenDoContato = new Map(aptos.map((c) => [c.id, c.token_descadastro as string]))
    let primeiroErro = ''

    const lotes = emLotes(fila)
    for (const [i, lote] of lotes.entries()) {
      // O Resend aceita poucas chamadas por segundo; sem pausa, o lote 3
      // volta 429 e metade da campanha falha por pressa.
      if (i > 0) await new Promise((r) => setTimeout(r, 600))
      const mensagens: Mensagem[] = lote.map((d) => {
        const tokenSaida = tokenDoContato.get(d.contato_id as string) as string
        const email = emailDaCampanha({
          assunto, corpo, nome: d.nome as string, linkUrl, linkRotulo,
          urlDoClique: urlDoClique(d.token_abertura),
          urlDoPixel: urlDoPixel(d.token_abertura),
          urlDeSaida: urlDeSaidaDoContato(tokenSaida, d.token_abertura),
        })
        return {
          para: d.email as string,
          assunto: email.assunto,
          html: email.html,
          texto: email.texto,
          urlDeSaidaEmUmClique: urlDeSaidaEmUmCliqueDoContato(tokenSaida, d.token_abertura),
          de: remetenteDaCampanha(),
          responderPara: respostaDaCampanha(),
        }
      })
      const idsDoLote = lote.map((d) => d.id as string)
      try {
        await enviarLote(mensagens)
        await admin.from('press_campanha_destinatarios')
          .update({ estado: 'enviado', enviado_em: new Date().toISOString() }).in('id', idsDoLote)
      } catch (causa) {
        const motivo = semChave(causa instanceof Error ? causa.message : String(causa)).slice(0, 500)
        primeiroErro ||= motivo
        await admin.from('press_campanha_destinatarios')
          .update({ estado: 'falhou', erro: motivo }).in('id', idsDoLote)
      }
    }

    await admin.rpc('concluir_campanha', { p_campanha_id: campanha.id })

    const { data: final } = await admin.from('press_campanhas')
      .select('total_enviados, total_falhas').eq('id', campanha.id).single()
    const enviados = final?.total_enviados ?? 0
    const falhas = final?.total_falhas ?? 0

    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_id: context.user.id,
      action: 'campanha_enviada',
      entity_type: 'press_campanha',
      entity_id: campanha.id,
      metadata: { assunto, enviados, falhas, deFora },
    })

    revalidatePath('/imprensa')
    const foraTexto = deFora ? ` ${deFora} ficaram de fora (sem e-mail, inválidos ou saíram da lista).` : ''
    if (!enviados) return { erro: `A campanha não saiu: ${primeiroErro || 'o provedor recusou.'}` }
    if (falhas) return { erro: `Saíram ${enviados} de ${enviados + falhas} mensagens. Motivo das falhas: ${primeiroErro}${foraTexto}` }
    return { recado: `Campanha enviada para ${enviados} contato(s).${foraTexto}` }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível enviar a campanha.')) }
  }
}

export type DestinatarioDaCampanha = {
  email: string
  nome: string
  estado: 'na_fila' | 'enviado' | 'falhou'
  erro: string | null
  abertoEm: string | null
  aberturas: number
  clicadoEm: string | null
  descadastrouEm: string | null
}

/** Quem recebeu uma campanha e quem abriu — para o histórico. */
export async function destinatariosDaCampanha(formData: FormData): Promise<{ erro?: string; destinatarios?: DestinatarioDaCampanha[] }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data, error } = await supabase.from('press_campanha_destinatarios')
      .select('email, nome, estado, erro, aberto_em, aberturas, clicado_em, descadastrou_em')
      .eq('workspace_id', context.workspace.id)
      .eq('campanha_id', texto(formData, 'id'))
      .order('aberto_em', { ascending: false, nullsFirst: false })
      .limit(TETO_DE_DESTINATARIOS)
    if (error) throw new Error('Não foi possível carregar os destinatários.')
    return {
      destinatarios: (data ?? []).map((d) => ({
        email: d.email, nome: d.nome, estado: d.estado, erro: d.erro, abertoEm: d.aberto_em, aberturas: d.aberturas,
        clicadoEm: d.clicado_em, descadastrouEm: d.descadastrou_em,
      })),
    }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível carregar os destinatários.')
  }
}

/**
 * Importa um lote de contatos de uma planilha (lida no navegador). A etiqueta
 * marca de qual lista vieram — é o que permite, depois, segmentar por origem.
 * Não duplica e-mail; quem já existe ganha a etiqueta nova; quem saiu da lista
 * continua fora (a função do banco não toca nisso).
 */
export async function importarContatos(formData: FormData): Promise<{ erro?: string; inseridos?: number; atualizados?: number; recusados?: number }> {
  try {
    const context = await requireWorkspace()
    const etiqueta = comoEtiqueta(texto(formData, 'etiqueta'))
    let linhas: unknown
    try { linhas = JSON.parse(String(formData.get('linhas') ?? '[]')) } catch { linhas = [] }
    if (!Array.isArray(linhas) || !linhas.length) throw new Error('Nenhum contato para importar.')
    if (linhas.length > LOTE_DE_IMPORTACAO) throw new Error(`No máximo ${LOTE_DE_IMPORTACAO} contatos por lote.`)

    const campo = (l: Record<string, unknown>, k: string) => (typeof l[k] === 'string' ? (l[k] as string).trim().slice(0, 200) : '')
    const limpas = linhas
      .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
      .map((l) => ({
        email: extrairEmail(campo(l, 'email')),
        nome: campo(l, 'nome'),
        veiculo: campo(l, 'veiculo'),
        cargo: campo(l, 'cargo'),
        telefone: campo(l, 'telefone').slice(0, 60),
      }))
      .filter((l) => l.email)
    const recusados = linhas.length - limpas.length
    if (!limpas.length) throw new Error('Nenhum e-mail válido neste lote.')

    const admin = createAdminClient()
    const { data, error } = await admin.rpc('importar_contatos', {
      p_workspace_id: context.workspace.id,
      p_autor: context.user.id,
      p_linhas: limpas,
      p_tags: etiqueta ? [etiqueta] : [],
    })
    if (error) throw new Error('Não foi possível gravar os contatos.')
    const linha = (Array.isArray(data) ? data[0] : data) as { inseridos?: number; atualizados?: number } | null
    const inseridos = linha?.inseridos ?? 0
    const atualizados = linha?.atualizados ?? 0

    await admin.from('activity_log').insert({
      workspace_id: context.workspace.id,
      actor_id: context.user.id,
      action: 'contatos_importados',
      entity_type: 'press_contacts',
      metadata: { etiqueta, inseridos, atualizados, recusados },
    })

    revalidatePath('/imprensa')
    return { inseridos, atualizados, recusados }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível importar os contatos.')
  }
}
