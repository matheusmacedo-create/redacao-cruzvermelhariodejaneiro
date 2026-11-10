'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
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
import { emailConfigurado, enviarEmail, semChave } from '@/lib/newsletter/resend'
import {
  emailDaCampanha, ENVIO_NA_HORA, lerAgendamento, linkValido, TETO_DE_DESTINATARIOS,
} from '@/lib/imprensa/campanha'
import {
  processarFila, remetenteDaCampanha, respostaDaCampanha, urlDeSaidaDoContato,
  urlDeSaidaEmUmCliqueDoContato, urlDoPixel,
} from '@/lib/imprensa/fila'
import { comoEtiqueta, extrairEmail, LOTE_DE_IMPORTACAO } from '@/lib/imprensa/importacao'
import {
  baseLegalDaOrigem, comoCanal, comoTipoDeContato, comoTipoDeVeiculo, lerEditorias, lerPraca, limparNome,
  type BaseLegal, type Canal, type TipoDeContato,
} from '@/lib/imprensa/vocabulario'

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
  /** O provedor devolveu uma mensagem em definitivo (webhook do Resend). */
  devolvidoEm: string | null
  motivoDaDevolucao: string
  ultimoEnvioEm: string | null
  ultimaAberturaEm: string | null
  enviosSemAbertura: number
  totalEnvios: number
  totalAberturas: number
  /** O veículo do cadastro (press_veiculos). O banco o acha, ou cria, pelo texto de `veiculo`. */
  veiculoId: string | null
  editorias: string[]
  /** Vazia: vale a praça do veículo. */
  praca: string
  tipoDeContato: TipoDeContato
  canalPreferido: Canal
  /** Só quando é outro número, diferente do telefone. */
  whatsapp: string
  origemDoDado: string
  baseLegal: BaseLegal
}

function lerTags(bruto: string): string[] {
  return bruto.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10)
}

/**
 * Os campos da fase 1 que o formulário mandou. Só entra o que veio: um
 * formulário que não conhece o campo não o apaga do contato.
 */
function camposDoCadastro(formData: FormData) {
  const campos: {
    editorias?: string[]; praca?: string; tipo_de_contato?: TipoDeContato; canal_preferido?: Canal
    whatsapp?: string; origem_do_dado?: string; base_legal?: BaseLegal
  } = {}
  if (formData.has('editorias')) campos.editorias = lerEditorias(texto(formData, 'editorias'))
  if (formData.has('praca')) campos.praca = lerPraca(texto(formData, 'praca'))
  if (formData.has('tipoDeContato')) campos.tipo_de_contato = comoTipoDeContato(texto(formData, 'tipoDeContato'))
  if (formData.has('canalPreferido')) campos.canal_preferido = comoCanal(texto(formData, 'canalPreferido'))
  if (formData.has('whatsapp')) campos.whatsapp = texto(formData, 'whatsapp').slice(0, 60)
  if (formData.has('origemDoDado')) {
    campos.origem_do_dado = texto(formData, 'origemDoDado').slice(0, 200)
    campos.base_legal = baseLegalDaOrigem(campos.origem_do_dado)
  }
  return campos
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
      // O banco acha o veículo por este texto, ou cria (gatilho press_contacts_liga_veiculo).
      veiculo: limparNome(texto(formData, 'veiculo')),
      cargo: texto(formData, 'cargo'),
      dominio: texto(formData, 'dominio').toLowerCase(),
      email: email || null,
      telefone: texto(formData, 'telefone'),
      tags: lerTags(texto(formData, 'tags')),
      notas: texto(formData, 'notas'),
      fonte: 'manual',
      created_by: context.user.id,
      ...camposDoCadastro(formData),
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

    // O veículo só entra na gravação quando a pessoa mexeu nele. O formulário pode ter sido
    // aberto antes de alguém juntar ou renomear o veículo: mandar o texto antigo de volta
    // faria o banco recriar o veículo que acabou de sumir e desfazer a junção deste contato.
    const veiculo = limparNome(texto(formData, 'veiculo'))
    const veiculoMudou = !formData.has('veiculoAnterior') || limparNome(texto(formData, 'veiculoAnterior')) !== veiculo

    const { error } = await supabase.from('press_contacts').update({
      nome: texto(formData, 'nome'),
      ...(veiculoMudou ? { veiculo } : {}),
      cargo: texto(formData, 'cargo'),
      dominio: texto(formData, 'dominio').toLowerCase(),
      email: email || null,
      telefone: texto(formData, 'telefone'),
      tags: lerTags(texto(formData, 'tags')),
      notas: texto(formData, 'notas'),
      ...camposDoCadastro(formData),
    }).eq('id', id).eq('workspace_id', context.workspace.id)

    if (error) {
      if (error.code === '23505') throw new Error('Já existe um contato com este e-mail neste espaço.')
      throw new Error('Não foi possível salvar as alterações.')
    }

    revalidatePath('/imprensa')
    revalidatePath(`/imprensa/contatos/${id}`)
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
    // O campo chega como foi digitado; a busca usou o domínio limpo, e é ele que fica gravado.
    const dominio = texto(formData, 'dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
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
    let veiculoId: string | null = null
    for (const c of candidatos.slice(0, 50)) {
      const email = typeof c.email === 'string' ? c.email.trim() : ''
      if (!email || !email.includes('@')) continue
      const { data: gravado, error } = await supabase.from('press_contacts').insert({
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
        origem_do_dado: 'Hunter.io',
        created_by: context.user.id,
      }).select('veiculo_id').single()
      if (error) { if (error.code === '23505') repetidos++; continue }
      veiculoId = veiculoId ?? gravado?.veiculo_id ?? null
      adicionados++
    }

    if (!adicionados) throw new Error(repetidos ? 'Todos os contatos selecionados já estavam cadastrados.' : 'Não foi possível salvar os contatos.')

    // A busca foi pelo domínio do veículo: o cadastro dele guarda esse domínio, se ainda não tinha um.
    if (veiculoId && dominio) {
      await createAdminClient().from('press_veiculos').update({ dominio: dominio.slice(0, 200) })
        .eq('id', veiculoId).eq('workspace_id', context.workspace.id).eq('dominio', '')
    }

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
      origem_do_dado: 'Hunter.io',
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

// O remetente e os endereços rastreados moram em lib/imprensa/fila.ts: quem
// monta a mensagem de verdade é a fila, e o teste usa os mesmos.

const quandoPorExtenso = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})

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

/** Follow-up: os contatos que receberam a campanha e não abriram (quem devolveu não recebeu). */
export async function naoAbriramDaCampanha(formData: FormData): Promise<{ erro?: string; ids?: string[] }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const ids: string[] = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('press_campanha_destinatarios')
        .select('contato_id')
        .eq('workspace_id', context.workspace.id).eq('campanha_id', texto(formData, 'id'))
        .eq('estado', 'enviado').is('aberto_em', null).is('devolvido_em', null).not('contato_id', 'is', null)
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
 * Põe uma campanha na fila para os contatos escolhidos — para sair agora ou
 * na hora marcada (`agendarPara`).
 *
 * A campanha e os destinatários são gravados de uma vez pelo banco
 * (enfileirar_campanha): ou tudo entra, ou nada. Quem não pode receber (sem
 * e-mail, inválido, saiu da lista, na supressão) é filtrado LÁ, com o dado do
 * banco — não pela seleção da tela. O envio em si é da fila
 * (lib/imprensa/fila.ts): a campanha pequena sai antes de esta action
 * responder; a grande segue depois da resposta e, se não couber, o relógio do
 * banco continua de minuto em minuto. O histórico é visível a toda a equipe.
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
    const agendamento = lerAgendamento(texto(formData, 'agendarPara'))
    if ('erro' in agendamento) throw new Error(agendamento.erro)

    let ids: string[]
    try { ids = JSON.parse(texto(formData, 'ids') || '[]') } catch { ids = [] }
    ids = Array.isArray(ids) ? [...new Set(ids.filter((i) => typeof i === 'string'))] : []
    if (!ids.length) throw new Error('Selecione ao menos um contato.')
    if (ids.length > TETO_DE_DESTINATARIOS) throw new Error(`No máximo ${TETO_DE_DESTINATARIOS} contatos por campanha.`)

    const admin = createAdminClient()
    const workspaceId = context.workspace.id
    // A lista é só o registro de para quem a campanha saiu: os destinatários
    // são os ids, que a tela resolveu e o banco confere um a um.
    const listaId = /^[0-9a-f-]{36}$/i.test(texto(formData, 'listaId')) ? texto(formData, 'listaId') : null

    const { data: entrada, error: erroDaFila } = await admin.rpc('enfileirar_campanha', {
      p_workspace_id: workspaceId,
      p_autor: context.user.id,
      p_rascunho_id: rascunhoId || null,
      p_assunto: assunto,
      p_corpo: corpo,
      p_link_url: linkUrl,
      p_link_rotulo: linkRotulo,
      p_contatos: ids,
      p_agendar_para: agendamento.quando,
    })
    if (erroDaFila) {
      throw new Error(/rascunho_indisponivel/.test(erroDaFila.message)
        ? 'Este rascunho já foi enviado ou não existe mais.'
        : 'Não foi possível registrar a campanha.')
    }
    const linha = (Array.isArray(entrada) ? entrada[0] : entrada) as { id_da_campanha?: string; total?: number } | null
    if (!linha?.id_da_campanha) {
      throw new Error('Nenhum dos contatos selecionados pode receber: sem e-mail, e-mail inválido ou devolvido, ou saíram da lista.')
    }
    const campanhaId = linha.id_da_campanha
    const total = Number(linha.total) || 0
    const deFora = ids.length - total
    // Lista de outro espaço ou já apagada: a chave estrangeira recusa, e a
    // campanha segue sem o registro. Rascunho reenviado troca a lista antiga.
    await admin.from('press_campanhas').update({ lista_id: listaId }).eq('id', campanhaId).eq('workspace_id', workspaceId)
    const foraTexto = deFora > 0 ? ` ${deFora} ficaram de fora (sem e-mail, inválidos ou devolvidos, ou saíram da lista).` : ''

    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_id: context.user.id,
      action: agendamento.quando ? 'campanha_agendada' : 'campanha_enviada',
      entity_type: 'press_campanha',
      entity_id: campanhaId,
      metadata: { assunto, enviados: total, deFora, ...(agendamento.quando ? { agendadaPara: agendamento.quando } : {}) },
    })
    revalidatePath('/imprensa')

    if (agendamento.quando) {
      return { recado: `Campanha agendada para ${quandoPorExtenso.format(new Date(agendamento.quando))} (horário de Brasília): ${total} contato(s).${foraTexto} Até lá, dá para cancelar na aba Campanhas.` }
    }

    if (total > ENVIO_NA_HORA) {
      // Lista grande: a resposta não espera. O que não couber aqui, o relógio
      // do banco continua (/api/comunicados/fila).
      after(async () => { await processarFila(30_000) })
      return { recado: `A campanha entrou na fila de envio: ${total} contato(s).${foraTexto} A aba Campanhas mostra o andamento.` }
    }

    await processarFila(25_000)
    const { data: final } = await admin.from('press_campanhas')
      .select('estado, total_enviados, total_falhas').eq('id', campanhaId).single()
    if (!final || final.estado === 'enviando') {
      // Outra campanha estava com a vez da fila; esta sai em seguida.
      return { recado: `A campanha entrou na fila de envio: ${total} contato(s).${foraTexto} A aba Campanhas mostra o andamento.` }
    }
    const enviados = final.total_enviados ?? 0
    const falhas = final.total_falhas ?? 0
    let motivo = ''
    if (falhas) {
      const { data: falha } = await admin.from('press_campanha_destinatarios')
        .select('erro').eq('campanha_id', campanhaId).eq('estado', 'falhou').not('erro', 'is', null).limit(1).maybeSingle()
      motivo = semChave(falha?.erro ?? '')
    }
    if (!enviados) return { erro: `A campanha não saiu: ${motivo || 'o provedor recusou.'}` }
    if (falhas) return { erro: `Saíram ${enviados} de ${enviados + falhas} mensagens. Motivo das falhas: ${motivo || 'o provedor recusou.'}${foraTexto}` }
    return { recado: `Campanha enviada para ${enviados} contato(s).${foraTexto}` }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível enviar a campanha.')) }
  }
}

/**
 * Desfaz um agendamento: a campanha volta a ser rascunho, com o texto como
 * estava, e a lista de destinatários é escolhida de novo no próximo envio.
 * Só vale enquanto ela espera — depois que começou a sair, não há o que desfazer.
 */
export async function cancelarAgendamento(formData: FormData): Promise<{ erro?: string; recado?: string }> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'imprensa.campanhas')) throw new Error('Campanhas são para administradores e editores.')
    const id = texto(formData, 'id')
    const admin = createAdminClient()
    // O filtro por estado decide a corrida com o relógio: se a campanha já
    // passou a "enviando", nenhuma linha muda e o cancelamento é recusado.
    const { data, error } = await admin.from('press_campanhas')
      .update({ estado: 'rascunho', em_fila: false, agendada_para: null, total_destinatarios: 0, atualizada_em: new Date().toISOString() })
      .eq('id', id).eq('workspace_id', context.workspace.id).eq('estado', 'agendada').select('id, assunto')
    if (error) throw new Error('Não foi possível cancelar o agendamento.')
    if (!data?.length) throw new Error('Esta campanha já começou a sair ou não está mais agendada.')
    // Rascunho não tem destinatário. Se este delete falhar, enfileirar_campanha
    // limpa a sobra quando o rascunho for enviado de novo.
    await admin.from('press_campanha_destinatarios').delete().eq('campanha_id', id).eq('estado', 'na_fila')

    await admin.from('activity_log').insert({
      workspace_id: context.workspace.id,
      actor_id: context.user.id,
      action: 'campanha_desagendada',
      entity_type: 'press_campanha',
      entity_id: id,
      metadata: { assunto: data[0].assunto },
    })
    revalidatePath('/imprensa')
    return { recado: 'Agendamento cancelado. A campanha voltou para os rascunhos.' }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível cancelar o agendamento.')
  }
}

// Tokens no formato certo e que não são de ninguém: o teste tem os mesmos
// links da mensagem de verdade, e abrir ou clicar em "sair" não registra nada.
const TOKEN_DE_TESTE = '0'.repeat(32)
const SAIDA_DE_TESTE = '0'.repeat(48)

/**
 * Manda a campanha, como está escrita agora, só para o e-mail de quem pediu.
 * Não grava campanha, não conta como envio e não mexe em contato nenhum:
 * serve para ver a mensagem na caixa de entrada antes de ela sair.
 */
export async function enviarTesteDaCampanha(formData: FormData): Promise<{ erro?: string; recado?: string }> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'imprensa.campanhas')) throw new Error('Campanhas são para administradores e editores.')
    if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado: falta RESEND_API_KEY.')

    const { assunto, corpo, linkUrl, linkRotulo } = lerRascunho(formData)
    if (assunto.length < 3) throw new Error('Escreva o assunto.')
    if (corpo.length < 10) throw new Error('Escreva o texto da mensagem.')
    const para = context.user.email?.trim()
    if (!para) throw new Error('Sua conta não tem um e-mail para receber o teste.')

    const email = emailDaCampanha({
      assunto, corpo, nome: context.profile?.full_name ?? '', linkUrl, linkRotulo,
      urlDoPixel: urlDoPixel(TOKEN_DE_TESTE),
      urlDeSaida: urlDeSaidaDoContato(SAIDA_DE_TESTE, TOKEN_DE_TESTE),
    })
    await enviarEmail({
      para,
      assunto: `[Teste] ${email.assunto}`,
      html: email.html,
      texto: email.texto,
      urlDeSaidaEmUmClique: urlDeSaidaEmUmCliqueDoContato(SAIDA_DE_TESTE, TOKEN_DE_TESTE),
      de: remetenteDaCampanha(),
      responderPara: respostaDaCampanha(),
    })
    return { recado: `Teste enviado para ${para}. Confira também a pasta de spam.` }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível enviar o teste.')) }
  }
}

const MAXIMO_NA_LISTA = 1000

export type DestinatarioDaCampanha = {
  email: string
  nome: string
  /** na_fila: esperando a vez. enviando: a caminho do Resend. de_fora: não
   * recebeu porque não podia (saiu da lista, endereço deixou de valer). */
  estado: 'na_fila' | 'enviando' | 'enviado' | 'falhou' | 'de_fora'
  erro: string | null
  abertoEm: string | null
  aberturas: number
  clicadoEm: string | null
  descadastrouEm: string | null
  /** O que o provedor contou depois do envio (webhook do Resend). */
  entregueEm: string | null
  devolvidoEm: string | null
  motivoDaDevolucao: string | null
  denunciouEm: string | null
}

/** Quem recebeu uma campanha e quem abriu — para o histórico. A lista mostra
 * até MAXIMO_NA_LISTA linhas (o teto de uma leitura do banco), abertos primeiro. */
export async function destinatariosDaCampanha(formData: FormData): Promise<{ erro?: string; destinatarios?: DestinatarioDaCampanha[] }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data, error } = await supabase.from('press_campanha_destinatarios')
      .select('email, nome, estado, erro, aberto_em, aberturas, clicado_em, descadastrou_em, entregue_em, devolvido_em, motivo_da_devolucao, denunciou_em')
      .eq('workspace_id', context.workspace.id)
      .eq('campanha_id', texto(formData, 'id'))
      .order('aberto_em', { ascending: false, nullsFirst: false })
      .limit(MAXIMO_NA_LISTA)
    if (error) throw new Error('Não foi possível carregar os destinatários.')
    return {
      destinatarios: (data ?? []).map((d) => ({
        email: d.email, nome: d.nome, estado: d.estado, erro: d.erro, abertoEm: d.aberto_em, aberturas: d.aberturas,
        clicadoEm: d.clicado_em, descadastrouEm: d.descadastrou_em,
        entregueEm: d.entregue_em, devolvidoEm: d.devolvido_em, motivoDaDevolucao: d.motivo_da_devolucao, denunciouEm: d.denunciou_em,
      })),
    }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível carregar os destinatários.')
  }
}

/**
 * Importa um lote de contatos de uma planilha (lida no navegador). A etiqueta
 * marca de qual planilha vieram. O tipo de contato e a origem do dado valem
 * para a planilha inteira; editoria, praça e tipo de veículo vêm de cada linha.
 * Não duplica e-mail; quem já existe ganha a etiqueta nova e só tem
 * preenchido o que estava vazio; quem saiu da lista continua fora (a função
 * do banco não toca nisso).
 */
export async function importarContatos(formData: FormData): Promise<{ erro?: string; inseridos?: number; atualizados?: number; recusados?: number }> {
  try {
    const context = await requireWorkspace()
    const etiqueta = comoEtiqueta(texto(formData, 'etiqueta'))
    let linhas: unknown
    try { linhas = JSON.parse(String(formData.get('linhas') ?? '[]')) } catch { linhas = [] }
    if (!Array.isArray(linhas) || !linhas.length) throw new Error('Nenhum contato para importar.')
    if (linhas.length > LOTE_DE_IMPORTACAO) throw new Error(`No máximo ${LOTE_DE_IMPORTACAO} contatos por lote.`)

    const tipoDeContato = comoTipoDeContato(texto(formData, 'tipoDeContato'))
    const origem = texto(formData, 'origemDoDado').slice(0, 200)
    // A tela já não deixa importar sem a origem; o servidor confere de novo.
    if (!origem) throw new Error('Diga de onde veio a planilha antes de importar.')
    const baseLegal = baseLegalDaOrigem(origem)

    const campo = (l: Record<string, unknown>, k: string) => (typeof l[k] === 'string' ? (l[k] as string).trim().slice(0, 200) : '')
    const limpas = linhas
      .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
      .map((l) => ({
        email: extrairEmail(campo(l, 'email')),
        nome: campo(l, 'nome'),
        veiculo: limparNome(campo(l, 'veiculo')),
        cargo: campo(l, 'cargo'),
        telefone: campo(l, 'telefone').slice(0, 60),
        praca: lerPraca(campo(l, 'praca')),
        editorias: lerEditorias(Array.isArray(l.editorias) ? l.editorias.filter((e): e is string => typeof e === 'string') : []),
        tipo_de_veiculo: comoTipoDeVeiculo(l.tipoDeVeiculo),
      }))
      .filter((l) => l.email)
    const recusados = linhas.length - limpas.length
    if (!limpas.length) throw new Error('Nenhum e-mail válido neste lote.')

    const admin = createAdminClient()
    const { data, error } = await admin.rpc('importar_contatos_de_imprensa', {
      p_workspace_id: context.workspace.id,
      p_autor: context.user.id,
      p_linhas: limpas,
      p_tags: etiqueta ? [etiqueta] : [],
      p_tipo_de_contato: tipoDeContato,
      p_origem: origem,
      p_base_legal: baseLegal,
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
      metadata: { etiqueta, tipoDeContato, origem, baseLegal, inseridos, atualizados, recusados },
    })

    revalidatePath('/imprensa')
    return { inseridos, atualizados, recusados }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível importar os contatos.')
  }
}
