'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerAula, lerCurso, lerQuestao } from '@/lib/cursos/regras'

/**
 * Cursos, apostilas e certificados — o lado da equipe. Escrita direto nas
 * tabelas, sob as políticas do nível do Voluntariado (gerenciar); o banco
 * confere de novo e mantém módulo, aula e questão no curso certo.
 */

type Resultado = { erro?: string }
const UUID = /^[0-9a-f-]{36}$/
const TIPOS_DE_CAPA = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const

async function gerente() {
  const c = await contextoDeParticipantes()
  if (c.nivel < 2) throw new Error('Você não tem acesso para editar cursos.')
  return c
}

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo está fora do formato permitido.')
  if (error?.code === '42501') throw new Error('Você não tem acesso para esta alteração.')
  throw new Error(padrao)
}

function revalidar(cursoId?: string) {
  revalidatePath('/voluntariado/cursos')
  if (cursoId) revalidatePath(`/voluntariado/cursos/${cursoId}`)
  revalidatePath('/membro', 'layout')
}

// ---------------------------------------------------------------- curso

export async function criarCurso(_anterior: Resultado, formData: FormData): Promise<Resultado> {
  let id = ''
  try {
    const { context, supabase } = await gerente()
    const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 160)
    if (titulo.length < 3) throw new Error('Dê um título ao curso.')
    const { data, error } = await supabase.from('cursos').insert({ workspace_id: context.workspace.id, titulo, criado_por: context.user.id }).select('id').single()
    if (error || !data) erroDoBanco(error, 'Não foi possível criar o curso.')
    id = data.id
    revalidar()
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o curso.') }
  }
  redirect(`/voluntariado/cursos/${id}`)
}

export async function salvarCurso(id: string, _anterior: Resultado & { ok?: boolean }, formData: FormData): Promise<Resultado & { ok?: boolean }> {
  try {
    const { supabase } = await gerente()
    const { dados, erros } = lerCurso(formData)
    if (!dados) throw new Error(erros.join(' '))
    const { error } = await supabase.from('cursos').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível salvar o curso.')
    revalidar(id)
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o curso.') }
  }
}

export async function publicarCurso(id: string, publicado: boolean): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    if (publicado) {
      const { count } = await supabase.from('curso_aulas').select('id', { count: 'exact', head: true }).eq('curso_id', id)
      if (!count) throw new Error('Adicione pelo menos uma aula antes de publicar.')
      const { data: c } = await supabase.from('cursos').select('nota_minima').eq('id', id).single()
      if (c?.nota_minima) {
        const { count: q } = await supabase.from('curso_questoes').select('id', { count: 'exact', head: true }).eq('curso_id', id)
        if (!q) throw new Error('O curso tem nota mínima, mas a prova não tem questões. Crie as questões ou apague a nota mínima.')
      }
    }
    const { error } = await supabase.from('cursos').update({ publicado, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível mudar a publicação.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar a publicação.') }
  }
}

export async function excluirCurso(id: string): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { count } = await supabase.from('certificados').select('id', { count: 'exact', head: true }).eq('curso_id', id)
    if (count) throw new Error('Este curso já emitiu certificados. Em vez de excluir, despublique: os certificados continuam válidos.')
    const { data: c } = await supabase.from('cursos').select('capa_caminho').eq('id', id).single()
    const { error } = await supabase.from('cursos').delete().eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível excluir o curso.')
    if (c?.capa_caminho) await createAdminClient().storage.from('cursos-capas').remove([c.capa_caminho]).catch(() => undefined)
    revalidar()
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir o curso.') }
  }
  redirect('/voluntariado/cursos')
}

/** Capa: link de envio de uso único para o bucket público de capas. */
export async function prepararEnvioDeCapa(cursoId: string, tipo: string, tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    const { context, supabase } = await gerente()
    if (!Object.hasOwn(TIPOS_DE_CAPA, tipo)) throw new Error('Envie JPG, PNG ou WEBP.')
    if (!(tamanho > 0 && tamanho <= 5 * 1024 * 1024)) throw new Error('A capa pode ter até 5 MB.')
    const { data: c } = await supabase.from('cursos').select('id').eq('id', cursoId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!c) throw new Error('Curso não encontrado.')
    const caminho = `${context.workspace.id}/${cursoId}/${randomUUID()}.${TIPOS_DE_CAPA[tipo as keyof typeof TIPOS_DE_CAPA]}`
    const { data, error } = await createAdminClient().storage.from('cursos-capas').createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

export async function definirCapa(cursoId: string, caminho: string | null): Promise<Resultado> {
  try {
    const { context, supabase } = await gerente()
    if (caminho !== null && !new RegExp(`^${context.workspace.id}/${cursoId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(caminho)) throw new Error('Caminho inválido.')
    const { data: c } = await supabase.from('cursos').select('capa_caminho').eq('id', cursoId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!c) throw new Error('Curso não encontrado.')
    const { error } = await supabase.from('cursos').update({ capa_caminho: caminho, updated_at: new Date().toISOString() }).eq('id', cursoId)
    if (error) erroDoBanco(error, 'Não foi possível trocar a capa.')
    if (c.capa_caminho && c.capa_caminho !== caminho) await createAdminClient().storage.from('cursos-capas').remove([c.capa_caminho]).catch(() => undefined)
    revalidar(cursoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível trocar a capa.') }
  }
}

// ---------------------------------------------------------------- módulos, aulas, questões

type Tabela = 'curso_modulos' | 'curso_aulas' | 'curso_questoes'

/** Reordena irmãos: troca de lugar com o vizinho e regrava 1..n. */
async function mover(tabela: Tabela, id: string, direcao: -1 | 1) {
  const { supabase } = await gerente()
  const pai = tabela === 'curso_aulas' ? 'modulo_id' : 'curso_id'
  const { data: item } = await supabase.from(tabela).select(`id,curso_id,${pai}`).eq('id', id).single()
  if (!item) throw new Error('Item não encontrado.')
  const paiId = (item as unknown as Record<string, string>)[pai]
  const { data: irmaos } = await supabase.from(tabela).select('id').eq(pai, paiId).order('ordem').order('id')
  const lista = (irmaos ?? []).map((x) => x.id as string)
  const i = lista.indexOf(id)
  const j = i + direcao
  if (i < 0 || j < 0 || j >= lista.length) return (item as { curso_id: string }).curso_id
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  for (const [ordem, x] of lista.entries()) {
    const { error } = await supabase.from(tabela).update({ ordem: ordem + 1 }).eq('id', x)
    if (error) erroDoBanco(error, 'Não foi possível reordenar.')
  }
  return (item as { curso_id: string }).curso_id
}

export async function moverItem(tabela: Tabela, id: string, direcao: -1 | 1): Promise<Resultado> {
  try {
    if (!['curso_modulos', 'curso_aulas', 'curso_questoes'].includes(tabela) || !UUID.test(id)) throw new Error('Item inválido.')
    revalidar(await mover(tabela, id, direcao))
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível reordenar.') }
  }
}

export async function excluirItem(tabela: Tabela, id: string): Promise<Resultado> {
  try {
    if (!['curso_modulos', 'curso_aulas', 'curso_questoes'].includes(tabela) || !UUID.test(id)) throw new Error('Item inválido.')
    const { supabase } = await gerente()
    const { data: item } = await supabase.from(tabela).select('curso_id').eq('id', id).single()
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    revalidar(item?.curso_id as string | undefined)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}

async function proximaOrdem(tabela: Tabela, coluna: string, valor: string) {
  const { supabase } = await gerente()
  const { data } = await supabase.from(tabela).select('ordem').eq(coluna, valor).order('ordem', { ascending: false }).limit(1).maybeSingle()
  return ((data?.ordem as number | undefined) ?? 0) + 1
}

export async function salvarModulo(cursoId: string, id: string | null, titulo: string): Promise<Resultado> {
  try {
    const { context, supabase } = await gerente()
    const t = titulo.trim().slice(0, 160)
    if (t.length < 2) throw new Error('Dê um nome ao módulo.')
    const { error } = id
      ? await supabase.from('curso_modulos').update({ titulo: t }).eq('id', id)
      : await supabase.from('curso_modulos').insert({ workspace_id: context.workspace.id, curso_id: cursoId, titulo: t, ordem: await proximaOrdem('curso_modulos', 'curso_id', cursoId) })
    if (error) erroDoBanco(error, 'Não foi possível salvar o módulo.')
    revalidar(cursoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o módulo.') }
  }
}

export async function salvarAula(cursoId: string, moduloId: string, id: string | null, formData: FormData): Promise<Resultado> {
  try {
    const { context, supabase } = await gerente()
    const { dados, erros } = lerAula(formData)
    if (!dados) throw new Error(erros.join(' '))
    const { error } = id
      ? await supabase.from('curso_aulas').update(dados).eq('id', id)
      : await supabase.from('curso_aulas').insert({ ...dados, workspace_id: context.workspace.id, curso_id: cursoId, modulo_id: moduloId, ordem: await proximaOrdem('curso_aulas', 'modulo_id', moduloId) })
    if (error) erroDoBanco(error, 'Não foi possível salvar a aula.')
    revalidar(cursoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a aula.') }
  }
}

export async function salvarQuestao(cursoId: string, id: string | null, formData: FormData): Promise<Resultado> {
  try {
    const { context, supabase } = await gerente()
    const { dados, erros } = lerQuestao(formData)
    if (!dados) throw new Error(erros.join(' '))
    const { error } = id
      ? await supabase.from('curso_questoes').update(dados).eq('id', id)
      : await supabase.from('curso_questoes').insert({ ...dados, workspace_id: context.workspace.id, curso_id: cursoId, ordem: await proximaOrdem('curso_questoes', 'curso_id', cursoId) })
    if (error) erroDoBanco(error, 'Não foi possível salvar a questão.')
    revalidar(cursoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a questão.') }
  }
}

// ---------------------------------------------------------------- apostilas

export async function prepararEnvioDeApostila(tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    const { context } = await gerente()
    if (!(tamanho > 0 && tamanho <= 50 * 1024 * 1024)) throw new Error('A apostila pode ter até 50 MB.')
    const caminho = `${context.workspace.id}/${randomUUID()}.pdf`
    const { data, error } = await createAdminClient().storage.from('membro-materiais').createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

/** Registra a apostila enviada e confere que é mesmo um PDF. */
export async function registrarApostila(caminho: string, nomeOriginal: string, formData: FormData): Promise<Resultado> {
  try {
    const { context, supabase } = await gerente()
    const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 200)
    if (titulo.length < 2) throw new Error('Dê um título à apostila.')
    const cursoId = String(formData.get('curso_id') ?? '')
    const { data: id, error } = await supabase.rpc('registrar_material', {
      p_workspace_id: context.workspace.id, p_caminho: caminho,
      p: { titulo, descricao: String(formData.get('descricao') ?? '').slice(0, 600), curso_id: UUID.test(cursoId) ? cursoId : '', nome_original: nomeOriginal.slice(0, 200) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a apostila.')
    const admin = createAdminClient()
    const { data: blob } = await admin.storage.from('membro-materiais').download(caminho)
    const inicio = blob ? new Uint8Array(await blob.slice(0, 5).arrayBuffer()) : null
    if (!inicio || String.fromCharCode(...inicio) !== '%PDF-') {
      await supabase.from('materiais').delete().eq('id', id)
      await admin.storage.from('membro-materiais').remove([caminho]).catch(() => undefined)
      throw new Error('O arquivo não é um PDF válido.')
    }
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a apostila.') }
  }
}

export async function publicarApostila(id: string, publicado: boolean): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { error } = await supabase.from('materiais').update({ publicado }).eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível mudar a apostila.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar a apostila.') }
  }
}

export async function excluirApostila(id: string): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { data: a } = await supabase.from('materiais').select('caminho').eq('id', id).maybeSingle()
    if (!a) throw new Error('Apostila não encontrada.')
    const { error } = await supabase.from('materiais').delete().eq('id', id)
    if (error) erroDoBanco(error, 'Não foi possível excluir a apostila.')
    await createAdminClient().storage.from('membro-materiais').remove([a.caminho as string]).catch(() => undefined)
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir a apostila.') }
  }
}

/** Link assinado de 5 minutos para a equipe conferir uma apostila. */
export async function abrirApostila(id: string): Promise<Resultado & { url?: string }> {
  try {
    const { supabase } = await contextoDeParticipantes()
    const { data: a } = await supabase.from('materiais').select('caminho').eq('id', id).maybeSingle()
    if (!a) throw new Error('Apostila não encontrada.')
    const { data } = await createAdminClient().storage.from('membro-materiais').createSignedUrl(a.caminho as string, 300)
    if (!data?.signedUrl) throw new Error('Não foi possível abrir.')
    return { url: data.signedUrl }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir.') }
  }
}

// ---------------------------------------------------------------- certificados

export async function revogarCertificado(id: string, motivo: string): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { error } = await supabase.rpc('revogar_certificado', { p_id: id, p_motivo: motivo.trim().slice(0, 600) })
    if (error) erroDoBanco(error, 'Não foi possível cancelar o certificado.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível cancelar o certificado.') }
  }
}
