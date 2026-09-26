'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requirePermissao, requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { lerCamadas } from '@/lib/agenda/camadas'
import { camadasPermitidasNoIcs } from '@/lib/agenda/fontes'
import { CATEGORIAS_DE_DATA, ocorrenciaNoAno, type DataComemorativa } from '@/lib/agenda/datas'

/**
 * As escritas da Agenda (docs/calendario-inteligente.md). As tabelas novas não
 * aceitam escrita direta de ninguém (RLS): tudo passa por aqui, conferindo a
 * sessão, e grava com o cliente de serviço sempre filtrando por espaço e pessoa.
 */

type Resultado = { erro?: string; token?: string; id?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex')

async function gravarPreferencias(workspaceId: string, userId: string, campos: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.from('agenda_preferencias')
    .upsert({ workspace_id: workspaceId, user_id: userId, ...campos, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,user_id' })
  if (error) {
    // Banco sem a migração da Agenda: a tela funciona, só não guarda a escolha.
    if (error.code === '42P01' || /agenda_preferencias/.test(error.message)) throw new Error('A agenda ainda não foi instalada no banco. A escolha vale só até recarregar a página.')
    throw new Error('Não foi possível salvar a preferência.')
  }
}

/** Liga/desliga camadas, como os calendários do Google. A tela já mudou; aqui só guarda. */
export async function salvarCamadasOcultas(camadas: string[]): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    await gravarPreferencias(context.workspace.id, context.user.id, { camadas_ocultas: lerCamadas(camadas) })
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar as camadas.') }
  }
}

/** Resumo semanal por e-mail: só vai para quem ligar. */
export async function definirResumoSemanal(ligado: boolean): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    await gravarPreferencias(context.workspace.id, context.user.id, { resumo_semanal: ligado === true })
    revalidatePath('/calendario')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o resumo semanal.') }
  }
}

/**
 * Cria (ou troca) o link secreto de assinatura. O token aparece uma vez só, na
 * tela de quem gerou; o banco guarda o hash. Leva as camadas que a pessoa está
 * vendo agora, menos as que não podem sair sem sessão (financeiro, frota,
 * chamados, aniversários) — a rota confere de novo a cada leitura.
 */
export async function gerarLinkDaAgenda(camadasVisiveis: string[]): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const admin = createAdminClient()
    const permitidas = await camadasPermitidasNoIcs(admin, context.workspace.id, context.user.id, context.role)
    const pedidas = lerCamadas(camadasVisiveis)
    const camadas = permitidas.filter((c) => pedidas.includes(c))
    if (!camadas.length) throw new Error('Nenhuma das camadas ligadas pode ir para o link. Ligue Publicações, Pautas, Datas ou Feriados.')
    const token = randomBytes(24).toString('base64url')
    await gravarPreferencias(context.workspace.id, context.user.id, {
      ics_token_hash: hashDoToken(token), ics_camadas: camadas, ics_criado_em: new Date().toISOString(),
    })
    revalidatePath('/calendario')
    return { token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível gerar o link.') }
  }
}

/** Desliga o link: quem assinou deixa de receber atualizações na próxima sincronização. */
export async function revogarLinkDaAgenda(): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    await gravarPreferencias(context.workspace.id, context.user.id, { ics_token_hash: null, ics_camadas: [], ics_criado_em: null })
    revalidatePath('/calendario')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desligar o link.') }
  }
}

// ── Datas comemorativas ─────────────────────────────────────────────────────

const inteiro = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === '' ? null : Number(v))

function lerData(formData: FormData) {
  const nome = String(formData.get('nome') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim() || null
  const categoria = String(formData.get('categoria') ?? 'institucional')
  const regra = String(formData.get('regra') ?? 'fixa')
  const mes = inteiro(formData.get('mes'))
  const dia = inteiro(formData.get('dia'))
  const semana = inteiro(formData.get('semana'))
  const diaDaSemana = inteiro(formData.get('dia_da_semana'))
  const antecedencia = inteiro(formData.get('antecedencia_dias')) ?? 21

  if (nome.length < 3 || nome.length > 140) throw new Error('O nome precisa ter de 3 a 140 caracteres.')
  if (descricao && descricao.length > 600) throw new Error('A descrição passa de 600 caracteres.')
  if (!Object.hasOwn(CATEGORIAS_DE_DATA, categoria)) throw new Error('Categoria inválida.')
  if (!['fixa', 'nesimo_dia_semana', 'mes'].includes(regra)) throw new Error('Regra inválida.')
  if (!mes || !Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error('Escolha o mês.')
  if (!Number.isInteger(antecedencia) || antecedencia < 0 || antecedencia > 120) throw new Error('A antecedência vai de 0 a 120 dias.')
  if (regra === 'fixa' && (!dia || !Number.isInteger(dia) || dia < 1 || dia > 31)) throw new Error('Escolha o dia.')
  if (regra === 'nesimo_dia_semana') {
    if (semana === null || ![-1, 1, 2, 3, 4, 5].includes(semana)) throw new Error('Escolha qual semana.')
    if (diaDaSemana === null || !Number.isInteger(diaDaSemana) || diaDaSemana < 0 || diaDaSemana > 6) throw new Error('Escolha o dia da semana.')
  }
  return {
    nome, descricao, categoria, regra, mes, antecedencia_dias: antecedencia,
    dia: regra === 'fixa' ? dia : null,
    semana: regra === 'nesimo_dia_semana' ? semana : null,
    dia_da_semana: regra === 'nesimo_dia_semana' ? diaDaSemana : null,
  }
}

export async function salvarDataComemorativa(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('agenda.datas')
    const dados = lerData(formData)
    const id = String(formData.get('id') ?? '')
    const admin = createAdminClient()
    const consulta = id
      ? admin.from('datas_comemorativas').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', UUID.test(id) ? id : '00000000-0000-0000-0000-000000000000').eq('workspace_id', context.workspace.id).select('id').maybeSingle()
      : admin.from('datas_comemorativas').insert({ ...dados, workspace_id: context.workspace.id, criado_por: context.user.id }).select('id').single()
    const { data, error } = await consulta
    if (error?.code === '23505') throw new Error('Já existe uma data com esse nome.')
    if (error || !data) throw new Error(id ? 'Data não encontrada.' : 'Não foi possível salvar a data.')
    revalidatePath('/calendario')
    return { id: data.id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a data.') }
  }
}

/** Desativar em vez de apagar: some da agenda, mas volta com um clique. */
export async function alternarDataComemorativa(id: string, ativa: boolean): Promise<Resultado> {
  try {
    const context = await requirePermissao('agenda.datas')
    if (!UUID.test(id)) throw new Error('Data não encontrada.')
    const { data, error } = await createAdminClient().from('datas_comemorativas')
      .update({ ativa: ativa === true, updated_at: new Date().toISOString() })
      .eq('id', id).eq('workspace_id', context.workspace.id).select('id').maybeSingle()
    if (error || !data) throw new Error('Data não encontrada.')
    revalidatePath('/calendario')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar a data.') }
  }
}

/**
 * "Criar pauta" a partir de uma data comemorativa: a pauta nasce com o prazo
 * na data e guarda de qual data e ano ela é — é assim que o alerta "sem pauta"
 * se apaga. Uma pauta por data e ano; a segunda tentativa abre a que existe.
 */
export async function criarPautaDaData(dataId: string, ano: number): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    if (!UUID.test(dataId) || !Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new Error('Data comemorativa inválida.')
    const supabase = await createClient()
    const { data: linha } = await supabase.from('datas_comemorativas')
      .select('id,nome,descricao,categoria,regra,mes,dia,semana,dia_da_semana,antecedencia_dias,ativa')
      .eq('id', dataId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!linha) throw new Error('Data comemorativa não encontrada.')
    const data = linha as DataComemorativa
    const ocorrencia = ocorrenciaNoAno(data, ano)
    if (!ocorrencia) throw new Error('Essa data não cai neste ano.')

    const { data: existente } = await supabase.from('pautas').select('id')
      .eq('workspace_id', context.workspace.id).eq('details->>data_comemorativa', data.id).eq('details->>ano', String(ano))
      .neq('status', 'archived').limit(1).maybeSingle()
    if (existente) return { id: existente.id }

    const { data: pauta, error } = await supabase.from('pautas').insert({
      workspace_id: context.workspace.id,
      title: `${data.nome} ${ano}`.slice(0, 200),
      description: [data.descricao, `Data comemorativa: ${data.nome} (${ocorrencia.ate ? 'o mês inteiro' : ocorrencia.dia.split('-').reverse().join('/')}).`].filter(Boolean).join('\n\n'),
      details: { data_comemorativa: data.id, ano: String(ano) },
      status: 'incoming', priority: 'medium',
      due_date: ocorrencia.dia,
      created_by: context.user.id, owner_id: context.user.id,
      tags: ['Data comemorativa'],
    }).select('id').single()
    if (error || !pauta) throw new Error('Não foi possível criar a pauta.')
    await supabase.from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'created', entity_type: 'pauta', entity_id: pauta.id, metadata: { title: data.nome, data_comemorativa: data.id, ano } })
    revalidatePath('/calendario'); revalidatePath('/pautas')
    return { id: pauta.id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar a pauta.') }
  }
}
