'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { emailConfigurado, enviarEmailDeConta } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { emailDeConvite as emailDeConviteDoMembro } from '@/lib/membro/emails'
import { REMETENTE_DO_VOLUNTARIADO, boasVindas } from '@/lib/membro/comunicacao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { lerFormulario, formatarCpf, type NomeDoNivel } from '@/lib/participantes/regras'
import { nomesDosSetores } from '@/lib/setores'
import { apagarFoto } from '@/lib/membro/foto-servidor'
import { removerPastaDoParticipante } from '@/lib/participantes/verificacao/arquivos'
import { aprovarNoSite, buscarFichasDoSite, chaveDoSite, recusarNoSite } from '@/lib/voluntariado/fichas-do-site'

/**
 * Participantes. Tudo o que grava dado pessoal passa por funções do banco,
 * que conferem o nível de acesso, cifram CPF e saúde e registram auditoria.
 * Horas e formações vão direto à tabela, sob as políticas do nível.
 */

type Resultado = { erro?: string }

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  // Cadastro de antes da Equipe (colaborador, coordenador, diretoria): a regra
  // do vínculo vale em toda gravação, e nada nele salva até trocar o vínculo.
  if (error?.code === '23514' && error.message?.includes('participantes_vinculo_check')) {
    throw new Error('Este cadastro tem um vínculo que não existe mais no Voluntariado. Em “Editar cadastro”, escolha Voluntário, Juventude ou Instrutor e salve; depois tente de novo.')
  }
  if (error?.code === '23514') throw new Error('Algum campo passou do tamanho permitido.')
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/voluntariado')
  if (id) revalidatePath(`/voluntariado/${id}`)
}

export async function salvarParticipante(id: string | null, _anterior: Resultado, formData: FormData): Promise<Resultado> {
  let novoId: string | null = null
  try {
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para editar participantes.')
    // Os setores que a ficha já tem valem, mesmo que tenham saído da lista:
    // senão salvar (para corrigir um telefone) apagaria o setor desativado.
    const setores = await nomesDosSetores(supabase, context.workspace.id)
    if (id) {
      const { data: atual } = await supabase.from('participantes').select('setores').eq('id', id).maybeSingle()
      for (const s of (atual?.setores as string[] | null) ?? []) if (!setores.includes(s)) setores.push(s)
    }
    const { dados, erros } = lerFormulario(formData, hojeEmSaoPaulo(), { setores })
    if (erros.length) return { erro: erros.join(' ') }
    const { data, error } = await supabase.rpc('salvar_participante', { p_workspace_id: context.workspace.id, p_id: id, p: dados })
    if (error) erroDoBanco(error, 'Não foi possível salvar o cadastro.')
    novoId = String(data)
    revalidar(novoId)
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o cadastro.') }
  }
  redirect(`/voluntariado/${novoId}`)
}

export async function mudarSituacao(id: string, situacao: 'ativo' | 'inativo' | 'desligado', motivo?: string): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDeParticipantes()
    const { data: antes } = await supabase.from('participantes').select('situacao').eq('id', id).maybeSingle()
    const { error } = await supabase.rpc('mudar_situacao_participante', { p_id: id, p_situacao: situacao, p_motivo: motivo ?? null })
    if (error) erroDoBanco(error, 'Não foi possível mudar a situação.')
    // Inscrição aprovada: a pessoa fica sabendo e já recebe o caminho da Área do Voluntário.
    if (situacao === 'ativo' && antes?.situacao === 'candidato') {
      await boasVindas(id)
      // Veio do cadastro do site: o site aceita a ficha e devolve o código de aprovação (QR na ficha).
      const site = await aprovarNoSite(context.workspace.id, id, context.user.email ?? context.user.id)
      revalidar(id)
      if (site && 'erro' in site) return { erro: `Aprovado na Redação, mas o site não gerou o código: ${site.erro} Na ficha, use “Gerar código no site”.` }
      return {}
    }
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar a situação.') }
  }
}

export async function recusarCandidato(id: string): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDeParticipantes()
    const { data: antes } = await supabase.from('participantes').select('foto_path').eq('id', id).maybeSingle()
    // O protocolo do site sai antes: recusar apaga a linha. Lido à parte (sem a migração, a coluna não existe).
    const { data: doSite } = await supabase.from('participantes').select('site_protocolo').eq('id', id).maybeSingle()
    const { error } = await supabase.rpc('recusar_candidato', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível recusar a inscrição.')
    await recusarNoSite(context.workspace.id, (doSite?.site_protocolo as string | null | undefined) ?? null, context.user.email ?? context.user.id)
    // A linha saiu do banco; a foto, se a equipe tinha posto uma, sai do Blob, e os documentos da verificação, do Storage.
    await apagarFoto(antes?.foto_path as string | null | undefined)
    await removerPastaDoParticipante(context.workspace.id, id)
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível recusar a inscrição.') }
  }
}

/** "Buscar fichas do site", na aba Inscrições pendentes: a mesma busca da rotina diária, na hora. */
export async function buscarFichasDoSiteAgora(): Promise<Resultado & { mensagem?: string }> {
  try {
    const { context, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para importar inscrições.')
    if (!(await chaveDoSite(context.workspace.id))) throw new Error('A ligação com o site não está configurada: em Configurações → Integrações, preencha “Site — fichas de voluntariado”.')
    const r = await buscarFichasDoSite(context.workspace.id, Date.now() + 40_000)
    revalidar()
    if (r.erro) return { erro: `Parou no meio: ${r.erro}${r.importadas ? ` (${r.importadas} importadas antes disso)` : ''}` }
    return { mensagem: r.importadas ? `${r.importadas} ${r.importadas === 1 ? 'ficha nova importada' : 'fichas novas importadas'} do site.` : 'Nenhuma ficha nova no site.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível buscar as fichas do site.') }
  }
}

/** Ficha do site aprovada aqui sem o código (o site estava fora do ar, faltava o CPF): pede de novo. */
export async function gerarCodigoNoSite(id: string): Promise<Resultado> {
  try {
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para aprovar.')
    const { data: p } = await supabase.from('participantes').select('situacao').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (p?.situacao !== 'ativo') throw new Error('Aprove a inscrição primeiro.')
    const r = await aprovarNoSite(context.workspace.id, id, context.user.email ?? context.user.id)
    revalidar(id)
    if (!r) throw new Error('Este cadastro não veio do site.')
    if ('erro' in r) throw new Error(r.erro)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível gerar o código no site.') }
  }
}

/** Abre CPF e saúde. Cada chamada fica na auditoria. */
export async function verDadosSensiveis(id: string): Promise<Resultado & { cpf?: string | null; tipoSanguineo?: string | null; restricoes?: string | null }> {
  try {
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 3) throw new Error('Você não tem acesso aos dados sensíveis.')
    const { data, error } = await supabase.rpc('dados_sensiveis_participante', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível abrir os dados.')
    const linha = (Array.isArray(data) ? data[0] : data) as { cpf: string | null; tipo_sanguineo: string | null; restricoes_saude: string | null } | undefined
    return { cpf: linha?.cpf ? formatarCpf(linha.cpf) : null, tipoSanguineo: linha?.tipo_sanguineo ?? null, restricoes: linha?.restricoes_saude ?? null }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir os dados.') }
  }
}

export async function anonimizarParticipante(id: string, motivo: string): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDeParticipantes()
    const { data: antes } = await supabase.from('participantes').select('foto_path').eq('id', id).maybeSingle()
    const { error } = await supabase.rpc('anonimizar_participante', { p_id: id, p_motivo: motivo })
    if (error) erroDoBanco(error, 'Não foi possível anonimizar.')
    // O banco já tirou foto_path (gatilho participantes_sem_foto_ao_anonimizar) e marcou os documentos da
    // verificação como excluídos (participantes_sem_verificacao_ao_anonimizar); a foto sai do Blob e a pasta, do Storage.
    await apagarFoto(antes?.foto_path as string | null | undefined)
    await removerPastaDoParticipante(context.workspace.id, id)
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível anonimizar.') }
  }
}

export async function definirAcesso(userId: string, nivel: NomeDoNivel | null): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDeParticipantes()
    const { error } = await supabase.rpc('definir_acesso_participantes', { p_workspace_id: context.workspace.id, p_user_id: userId, p_nivel: nivel })
    if (error) erroDoBanco(error, 'Não foi possível mudar o acesso.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o acesso.') }
  }
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

export async function registrarHoras(participanteId: string, formData: FormData): Promise<Resultado> {
  try {
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para registrar horas.')
    const data = String(formData.get('data') ?? '')
    const horas = Number(String(formData.get('horas') ?? '').replace(',', '.'))
    const atividade = String(formData.get('atividade') ?? '').trim().slice(0, 200)
    if (!DATA.test(data) || data > hojeEmSaoPaulo()) throw new Error('Data inválida.')
    if (!Number.isFinite(horas) || horas <= 0 || horas > 24) throw new Error('Informe de 0,25 a 24 horas.')
    if (atividade.length < 2) throw new Error('Descreva a atividade.')
    const { error } = await supabase.from('participante_horas').insert({
      workspace_id: context.workspace.id, participante_id: participanteId, data, horas: Math.round(horas * 4) / 4, atividade, registrado_por: context.user.id,
    })
    if (error) throw new Error('Não foi possível registrar as horas.')
    revalidar(participanteId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar as horas.') }
  }
}

export async function adicionarFormacao(participanteId: string, formData: FormData): Promise<Resultado> {
  try {
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para registrar formações.')
    const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 200)
    const instituicao = String(formData.get('instituicao') ?? '').trim().slice(0, 200) || null
    const concluido = String(formData.get('concluido_em') ?? '') || null
    const validade = String(formData.get('valido_ate') ?? '') || null
    if (titulo.length < 2) throw new Error('Informe o nome da formação.')
    if ((concluido && !DATA.test(concluido)) || (validade && !DATA.test(validade))) throw new Error('Data inválida.')
    if (concluido && validade && validade < concluido) throw new Error('A validade não pode ser antes da conclusão.')
    const { error } = await supabase.from('participante_formacoes').insert({
      workspace_id: context.workspace.id, participante_id: participanteId, titulo, instituicao, concluido_em: concluido, valido_ate: validade, registrado_por: context.user.id,
    })
    if (error) throw new Error('Não foi possível registrar a formação.')
    revalidar(participanteId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a formação.') }
  }
}

export async function removerRegistro(tabela: 'participante_horas' | 'participante_formacoes', id: string, participanteId: string): Promise<Resultado> {
  try {
    if (!['participante_horas', 'participante_formacoes'].includes(tabela)) throw new Error('Registro inválido.')
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso.')
    const { error } = await supabase.from(tabela).delete().eq('id', id).eq('participante_id', participanteId)
    if (error) throw new Error('Não foi possível remover.')
    revalidar(participanteId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover.') }
  }
}

/** Manda ao voluntário o convite para a Área do Voluntário. */
export async function convidarParaAreaDoMembro(id: string): Promise<Resultado & { email?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para convidar.')
    if (!emailConfigurado()) throw new Error('O envio de e-mails não está configurado (Configurações → Integrações).')
    const { data: p } = await supabase.from('participantes').select('nome,nome_social,email,situacao,anonimizado_em').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!p || p.anonimizado_em) throw new Error('Cadastro não encontrado.')
    if (p.situacao !== 'ativo') throw new Error('Só voluntários ativos entram na área do membro.')
    if (!p.email) throw new Error('Cadastre um e-mail antes de convidar: é ele que a pessoa usa para entrar.')
    const m = emailDeConviteDoMembro({ nome: p.nome_social || p.nome, url: `${urlBase()}/membro/entrar?email=${encodeURIComponent(p.email)}`, convidadoPor: context.profile?.full_name ?? 'A coordenação do Voluntariado' })
    await enviarEmailDeConta({ para: p.email, assunto: m.assunto, html: m.html, texto: m.texto, de: process.env.VOLUNTARIADO_REMETENTE?.trim() || REMETENTE_DO_VOLUNTARIADO })
    await supabase.rpc('auditar_convite_area_do_membro', { p_id: id })
    return { email: p.email }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar o convite.') }
  }
}
