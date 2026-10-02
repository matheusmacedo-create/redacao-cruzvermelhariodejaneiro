'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { obterChave } from '@/lib/integracoes/chaves'
import { IaError } from '@/lib/ia/openai'
import { boasVindas } from '@/lib/membro/comunicacao'
import { pedirDocumentos, type CanalDoPedido } from '@/lib/participantes/verificacao/link'
import { baixarArquivo, conferirESelar, prepararEnvio, removerDoStorage } from '@/lib/participantes/verificacao/arquivos'
import { consultarCgu } from '@/lib/participantes/verificacao/cgu'
import { ErroDaLeitura, anexoDoArquivo, lerDocumento } from '@/lib/participantes/verificacao/documento'
import {
  lerChaveDaCgu,
  CATEGORIAS_DE_DOCUMENTO, ITENS, atestadoAceitavel, compararComCadastro, ehAntecedentes, ehCategoriaDeDocumento, ehItem, ehSituacaoDoItem, lerDecisao,
  type DocumentoLido, type Escopo, type Sancoes,
} from '@/lib/participantes/verificacao/regras'
import { mudarSituacao, recusarCandidato } from './participantes'

/**
 * A verificação do candidato, pelo lado da coordenação. Toda gravação passa
 * pelas funções do banco (migração 20261002000000), que conferem o nível
 * (2 para gerenciar; 3 para identidade e antecedentes, que trazem o CPF) e
 * registram auditoria. Aqui fica o que o banco não faz: mandar o link, ler o
 * documento com o Claude, consultar a CGU, mexer no Storage.
 */

type Resultado = { erro?: string }

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '42883' || error?.code === 'PGRST202' || error?.code === '42P01' || error?.code === 'PGRST205') throw new Error('A verificação ainda não está pronta no banco. Avise a administração.')
  throw new Error(padrao)
}

function revalidar(id: string) {
  revalidatePath('/voluntariado')
  revalidatePath(`/voluntariado/${id}`)
}

const ehId = (s: string) => /^[0-9a-f-]{36}$/.test(s)

export async function pedirDocumentosAoCandidato(id: string, escopo: Escopo, canal: CanalDoPedido): Promise<Resultado & { link?: string | null; recado?: string }> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para pedir documentos.')
    const r = await pedirDocumentos(supabase, { workspaceId: context.workspace.id, participanteId: id, escopo: escopo === 'renovacao' ? 'renovacao' : 'completa', canal })
    revalidar(id)
    return { link: r.link, recado: r.recado }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível pedir os documentos.') }
  }
}

/**
 * Lê os arquivos de identidade com o Claude, compara com o cadastro e guarda
 * só o resultado saneado. O CPF que o modelo transcrever vai ao banco só
 * como pergunta ("é o do cadastro?") e morre aqui.
 */
export async function lerDocumentoDoCandidato(id: string): Promise<Resultado & { leitura?: DocumentoLido }> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 3) throw new Error('Só quem tem acesso a dados sensíveis lê o documento.')
    const [{ data: p }, { data: arquivos }] = await Promise.all([
      supabase.from('participantes').select('nome, data_nascimento, anonimizado_em').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
      supabase.from('participantes_arquivos').select('id, tipo, lado, created_at').eq('participante_id', id).eq('categoria', 'documento_identidade').is('excluido_em', null).order('created_at').limit(4),
    ])
    if (!p || p.anonimizado_em) throw new Error('Participante não encontrado.')
    if (!arquivos?.length) throw new Error('Nenhum documento com foto guardado ainda.')
    // Abrir cada arquivo passa pelo banco (nível + auditoria) e devolve o caminho; o servidor baixa.
    const anexos = []
    for (const a of arquivos.slice(0, 3)) {
      const { data, error } = await supabase.rpc('abrir_arquivo_participante', { p_id: a.id })
      const linha = (Array.isArray(data) ? data[0] : data) as { caminho: string; tipo: string } | undefined
      if (error || !linha) erroDoBanco(error, 'Não foi possível abrir o documento.')
      const { bytes, tipo } = await baixarArquivo(linha.caminho)
      anexos.push(await anexoDoArquivo(bytes, tipo || linha.tipo))
    }
    const { extraido } = await lerDocumento(anexos)
    let cpfConfere: 'confere' | 'diverge' | 'sem_cpf' | 'nao_lido' = 'nao_lido'
    if (extraido.cpf) {
      const { data } = await supabase.rpc('cpf_confere', { p_participante_id: id, p_cpf: extraido.cpf })
      cpfConfere = data === 'confere' || data === 'diverge' || data === 'sem_cpf' ? data : 'nao_lido'
    }
    const leitura = compararComCadastro(extraido, { nome: p.nome as string, data_nascimento: (p.data_nascimento as string | null) ?? null }, cpfConfere)
    const { error } = await supabase.rpc('registrar_leitura_do_documento', { p_participante_id: id, p: leitura })
    if (error) erroDoBanco(error, 'Não foi possível guardar a leitura.')
    revalidar(id)
    return { leitura }
  } catch (causa) {
    if (causa instanceof IaError) return { erro: causa.message }
    if (causa instanceof ErroDaLeitura) return { erro: causa.message }
    return { erro: mensagemDoErro(causa, 'Não foi possível ler o documento.') }
  }
}

/** CEIS, CNEP, CEAF e PEP por CPF. O CPF é decifrado pelo banco a pedido de quem tem nível (e fica na trilha) e some depois da consulta. */
export async function consultarSancoes(id: string): Promise<Resultado & { sancoes?: Sancoes }> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para consultar.')
    const guardada = await obterChave(context.workspace.id, 'portal_transparencia')
    if (!guardada) throw new Error('Falta a chave do Portal da Transparência (Configurações → Integrações). É gratuita: peça com a conta gov.br da filial. Sem ela, dispense o item com o motivo.')
    // Chave guardada antes da conferência no salvamento pode estar com o JSON do Portal em volta.
    const chave = lerChaveDaCgu(guardada)
    if (!chave) throw new Error('A chave do Portal da Transparência guardada não está no formato da CGU (32 letras e números). Em Configurações → Integrações, cole só a chave e salve de novo.')
    const { data: cpf, error } = await createAdminClient().rpc('cpf_para_verificacao', { p_participante_id: id, p_user_id: context.user.id })
    if (error) erroDoBanco(error, 'Não foi possível ler o CPF.')
    if (!cpf) throw new Error('O cadastro não tem CPF. O candidato informa o dele ao aceitar o termo pelo link; ou cadastre em “Editar cadastro”.')
    const sancoes = await consultarCgu(chave, String(cpf))
    const { error: e2 } = await supabase.rpc('registrar_consulta_de_sancoes', { p_participante_id: id, p: sancoes })
    if (e2) erroDoBanco(e2, 'Não foi possível guardar a consulta.')
    revalidar(id)
    return { sancoes }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível consultar a CGU.') }
  }
}

/** Um item do checklist: situação, nota e, conforme o item, código do atestado ou data da entrevista. */
export async function marcarItem(id: string, item: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehId(id) || !ehItem(item)) throw new Error('Item inválido.')
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < ITENS[item].nivel) throw new Error(ITENS[item].nivel >= 3 ? 'Só quem tem acesso a dados sensíveis confere identidade e antecedentes.' : 'Você não tem acesso para registrar.')
    const situacao = String(formData.get('situacao') ?? '')
    if (!ehSituacaoDoItem(situacao)) throw new Error('Situação inválida.')
    const p = {
      situacao, nota: String(formData.get('nota') ?? '').trim().slice(0, 600) || null,
      codigo: String(formData.get('codigo') ?? '').trim().slice(0, 80) || null, data: String(formData.get('data') ?? '').trim() || null,
    }
    const { error } = await supabase.rpc('registrar_item_verificacao', { p_participante_id: id, p_item: item, p })
    if (error) erroDoBanco(error, 'Não foi possível registrar.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar.') }
  }
}

export async function prepararEnvioDeArquivoDoVoluntario(id: string, categoria: string, tipo: string, tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { context, supabase, nivel } = await contextoDeParticipantes()
    if (!ehCategoriaDeDocumento(categoria)) throw new Error('Escolha o tipo do documento.')
    if (nivel < CATEGORIAS_DE_DOCUMENTO[categoria].nivel) throw new Error('Você não tem acesso para guardar este tipo de documento.')
    const { data: p } = await supabase.from('participantes').select('id').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!p) throw new Error('Participante não encontrado.')
    return await prepararEnvio(context.workspace.id, id, tipo, tamanho)
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

export async function registrarArquivoDoVoluntario(id: string, caminho: string, nomeOriginal: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { supabase } = await contextoDeParticipantes()
    const categoria = String(formData.get('categoria') ?? '')
    if (!ehCategoriaDeDocumento(categoria)) throw new Error('Escolha o tipo do documento.')
    const dataDocumento = String(formData.get('data_documento') ?? '').trim() || null
    if (ehAntecedentes(categoria)) {
      const r = atestadoAceitavel(dataDocumento ?? '', hojeEmSaoPaulo())
      if (!r.ok) throw new Error(r.erro)
    }
    const { data: arquivoId, error } = await supabase.rpc('registrar_arquivo_participante', {
      p_participante_id: id, p_caminho: caminho,
      p: {
        categoria, lado: String(formData.get('lado') ?? '') || null, data_documento: dataDocumento, codigo_autenticacao: String(formData.get('codigo') ?? '').trim().slice(0, 80) || null,
        observacao: String(formData.get('observacao') ?? '').trim().slice(0, 600) || null, nome_original: nomeOriginal.slice(0, 200),
      },
    })
    if (error || !arquivoId) erroDoBanco(error, 'Não foi possível registrar o arquivo.')
    await conferirESelar(String(arquivoId), caminho, async () => { await supabase.rpc('excluir_arquivo_participante', { p_id: arquivoId, p_motivo: 'Conteúdo não confere com o tipo do arquivo (recusado no envio).' }) })
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o arquivo.') }
  }
}

export async function excluirArquivoDoVoluntario(id: string, arquivoId: string, motivo: string): Promise<Resultado> {
  try {
    if (!ehId(id) || !ehId(arquivoId)) throw new Error('Arquivo não encontrado.')
    const { supabase } = await contextoDeParticipantes()
    const { data: caminho, error } = await supabase.rpc('excluir_arquivo_participante', { p_id: arquivoId, p_motivo: motivo })
    if (error) erroDoBanco(error, 'Não foi possível excluir o arquivo.')
    await removerDoStorage(typeof caminho === 'string' ? caminho : null)
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir o arquivo.') }
  }
}

export async function salvarReferencia(id: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para registrar.')
    const p = { nome: String(formData.get('nome') ?? '').trim(), relacao: String(formData.get('relacao') ?? '').trim(), telefone: String(formData.get('telefone') ?? '').trim() || null, email: String(formData.get('email') ?? '').trim() || null }
    const { error } = await supabase.rpc('salvar_referencia_participante', { p_participante_id: id, p })
    if (error) erroDoBanco(error, 'Não foi possível guardar a referência.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar a referência.') }
  }
}

export async function registrarContato(id: string, referenciaId: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehId(id) || !ehId(referenciaId)) throw new Error('Referência não encontrada.')
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para registrar.')
    const p = { parecer: String(formData.get('parecer') ?? ''), contatado_em: String(formData.get('contatado_em') ?? '').trim() || null, nota: String(formData.get('nota') ?? '').trim().slice(0, 600) || null }
    const { error } = await supabase.rpc('registrar_contato_de_referencia', { p_id: referenciaId, p })
    if (error) erroDoBanco(error, 'Não foi possível registrar o contato.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o contato.') }
  }
}

export async function removerReferencia(id: string, referenciaId: string): Promise<Resultado> {
  try {
    if (!ehId(id) || !ehId(referenciaId)) throw new Error('Referência não encontrada.')
    const { supabase } = await contextoDeParticipantes()
    const { error } = await supabase.rpc('remover_referencia_participante', { p_id: referenciaId })
    if (error) erroDoBanco(error, 'Não foi possível remover.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover.') }
  }
}

/**
 * A decisão. Com "aprovar agora", a inscrição vira ativa na mesma hora (e as
 * boas-vindas saem); com "recusar agora" (não apto), o cadastro e os
 * documentos são apagados, como em qualquer recusa de inscrição.
 */
export async function concluirVerificacao(id: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para decidir.')
    const { parecer, restricoes, motivo, erros } = lerDecisao({ parecer: formData.get('parecer'), restricoes: formData.getAll('restricoes'), motivo: formData.get('motivo') })
    if (erros.length || !parecer) throw new Error(erros.join(' ') || 'Escolha o parecer.')
    const { error } = await supabase.rpc('concluir_verificacao_participante', { p_participante_id: id, p_parecer: parecer, p_restricoes: restricoes, p_motivo: motivo || null })
    if (error) erroDoBanco(error, 'Não foi possível concluir a verificação.')
    const depois = String(formData.get('depois') ?? '')
    if (depois === 'aprovar' && parecer !== 'nao_apto') {
      const r = await mudarSituacao(id, 'ativo')
      if (r.erro) throw new Error(`Verificação concluída, mas a aprovação falhou: ${r.erro}`)
    } else if (depois === 'recusar' && parecer === 'nao_apto') {
      const r = await recusarCandidato(id)
      if (r.erro) throw new Error(`Verificação concluída, mas a recusa falhou: ${r.erro}`)
    }
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível concluir a verificação.') }
  }
}

/** Da lista, sem passar pelo checklist: apto com restrição e aprovação na hora. */
export async function aprovarComRestricao(id: string, formData: FormData): Promise<Resultado> {
  try {
    if (!ehId(id)) throw new Error('Participante não encontrado.')
    const { supabase, nivel } = await contextoDeParticipantes()
    if (nivel < 2) throw new Error('Você não tem acesso para aprovar.')
    const { restricoes, motivo } = lerDecisao({ parecer: 'apto_com_restricao', restricoes: formData.getAll('restricoes'), motivo: formData.get('motivo') })
    const { error } = await supabase.rpc('aprovar_candidato_com_restricao', { p_participante_id: id, p_restricoes: restricoes, p_motivo: motivo || null })
    if (error) erroDoBanco(error, 'Não foi possível aprovar.')
    await boasVindas(id)
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível aprovar.') }
  }
}
