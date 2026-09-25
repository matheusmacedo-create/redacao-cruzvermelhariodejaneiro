'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { lerObjeto } from '@/lib/armazenamento/r2'
import { transcreverAudio, TAMANHO_MAXIMO_DE_AUDIO, iaConfigurada } from '@/lib/ia/openai'
import { garantirBaseNoSite } from '@/app/actions/pacotes'
import { armazenamento, avaliaEnvios } from '@/lib/envios/servidor'
import { copiarParaBiblioteca, type ArquivoDoEnvio } from '@/lib/envios/avaliacao'
import { descricaoDaPauta, linkDoWhatsapp, mensagemDePublicacao, type Autorizacao } from '@/lib/envios/regras'

/**
 * O que quem avalia faz com um envio da equipe (docs/envio-de-acoes.md §5).
 * Tudo começa conferindo, no servidor, que a pessoa está em envios_avaliadores.
 */

type Resultado = { erro?: string; aviso?: string; destino?: string; texto?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function contexto() {
  const context = await requireWorkspace()
  if (!(await avaliaEnvios(context.user.id, context.workspace.id))) throw new Error('Só quem avalia os envios da equipe pode fazer isso.')
  return { context, admin: createAdminClient() }
}

type EnvioCompleto = {
  id: string; workspace_id: string; protocolo: string; estado: string; nome: string; setor: string | null; whatsapp: string | null; email: string | null
  titulo: string; data_da_acao: string | null; local: string | null; pessoas_atendidas: number | null; parceiros: string | null
  relato: string | null; transcricao: string | null; autorizacao_imagem: Autorizacao; pauta_id: string | null; pacote_id: string | null
}

async function envioDoEspaco(admin: ReturnType<typeof createAdminClient>, id: string, workspaceId: string): Promise<EnvioCompleto> {
  if (!UUID.test(id)) throw new Error('Envio não encontrado.')
  const { data } = await admin.from('envios')
    .select('id,workspace_id,protocolo,estado,nome,setor,whatsapp,email,titulo,data_da_acao,local,pessoas_atendidas,parceiros,relato,transcricao,autorizacao_imagem,pauta_id,pacote_id')
    .eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
  if (!data) throw new Error('Envio não encontrado.')
  return data as EnvioCompleto
}

/** Transcreve os áudios do envio (os gravados na hora e os mandados como arquivo). */
export async function transcreverEnvio(envioId: string): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    if (!iaConfigurada()) throw new Error('A transcrição usa a OpenAI, e a chave OPENAI_API_KEY não está configurada na Vercel.')
    const envio = await envioDoEspaco(admin, envioId, context.workspace.id)
    const r2 = armazenamento()
    if (!r2) throw new Error('O armazenamento do acervo não está configurado.')
    const { data: audios } = await admin.from('envio_arquivos').select('id,chave,nome,tipo_mime,tamanho')
      .eq('envio_id', envio.id).eq('categoria', 'audio').eq('estado', 'recebido').order('criado_em')
    const lista = (audios ?? []) as { id: string; chave: string; nome: string; tipo_mime: string | null; tamanho: number }[]
    if (!lista.length) throw new Error('Este envio não tem áudio.')
    const partes: string[] = []
    const pulados: string[] = []
    for (const a of lista) {
      if (a.tamanho > TAMANHO_MAXIMO_DE_AUDIO) { pulados.push(`${a.nome} (passa de 25 MB)`); continue }
      const bytes = await lerObjeto(r2.config, r2.bucket, a.chave)
      if (!bytes) { pulados.push(`${a.nome} (não encontrado)`); continue }
      const texto = await transcreverAudio(bytes, a.nome, a.tipo_mime ?? '')
      partes.push(lista.length > 1 ? `[${a.nome}]\n${texto}` : texto)
    }
    const transcricao = partes.join('\n\n').slice(0, 60000)
    if (transcricao) {
      await admin.from('envios').update({ transcricao, transcricao_em: new Date().toISOString() }).eq('id', envio.id)
    }
    revalidatePath(`/envios/${envio.id}`)
    return { texto: transcricao, aviso: pulados.length ? `Ficaram de fora: ${pulados.join(', ')}.` : undefined }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível transcrever o áudio.') }
  }
}

/**
 * Transforma o envio em trabalho: cria a pauta e, se pedido, a matéria com o
 * pacote multicanal (site + redes) já com as fotos escolhidas na Biblioteca.
 */
export async function virarPauta(envioId: string, arquivoIds: string[], criarMateria: boolean): Promise<Resultado> {
  let destino = ''
  try {
    const { context, admin } = await contexto()
    const ws = context.workspace.id
    const envio = await envioDoEspaco(admin, envioId, ws)
    if (envio.pauta_id) throw new Error('Este envio já virou pauta.')
    const supabase = await createClient()

    const { data: pauta, error: erroPauta } = await supabase.from('pautas').insert({
      workspace_id: ws, title: envio.titulo.slice(0, 200),
      description: descricaoDaPauta(envio),
      details: Object.fromEntries(Object.entries({
        local: envio.local, participantsCount: envio.pessoas_atendidas !== null ? String(envio.pessoas_atendidas) : null,
        story: envio.relato, contact: [envio.nome, envio.whatsapp, envio.email].filter(Boolean).join(' · '),
        notes: `${envio.protocolo}${envio.parceiros ? ` · Parceiros: ${envio.parceiros}` : ''}`,
      }).filter(([, v]) => v)),
      status: 'incoming', priority: 'medium', coordination: envio.setor ?? '', data_inicio: envio.data_da_acao,
      created_by: context.user.id, owner_id: context.user.id, tags: ['Ação'],
    }).select('id').single()
    if (erroPauta || !pauta) throw new Error('Não foi possível criar a pauta.')

    // Só o que foi escolhido vai para a Biblioteca (a cota dela é pequena); o resto fica no acervo.
    const avisos: string[] = []
    const fileIds: string[] = []
    const escolhidos = criarMateria ? [...new Set(arquivoIds.filter((id) => UUID.test(id)))].slice(0, 30) : []
    if (escolhidos.length) {
      const { data: arquivos } = await admin.from('envio_arquivos').select('id,chave,nome,tipo_mime,tamanho,categoria,file_id')
        .eq('envio_id', envio.id).eq('estado', 'recebido').in('id', escolhidos)
      const { data: uso } = await admin.from('files').select('size_bytes').eq('workspace_id', ws).neq('status', 'deleted')
      const usado = { bytes: (uso ?? []).reduce((s, r) => s + Number(r.size_bytes ?? 0), 0) }
      for (const arquivo of (arquivos ?? []) as ArquivoDoEnvio[]) {
        // Um arquivo que falha não derruba o resto: vira aviso, e a pauta segue.
        const r = await copiarParaBiblioteca(admin, {
          arquivo, workspaceId: ws, usuarioId: context.user.id, autorizacao: envio.autorizacao_imagem, credito: `${envio.nome}/CVB-RJ`, usado,
        }).catch((causa) => ({ fileId: undefined, motivo: `${arquivo.nome}: a cópia para a Biblioteca falhou (${causa instanceof Error ? causa.message.slice(0, 120) : 'erro'}).` }))
        if (r.fileId) fileIds.push(r.fileId)
        else if (r.motivo) avisos.push(r.motivo)
      }
    }

    let pacoteId: string | null = null
    if (criarMateria) {
      const corpo = [envio.relato, envio.transcricao ? `Relato em áudio (transcrição):\n${envio.transcricao}` : null].filter(Boolean).join('\n\n')
      const { data: peca, error: erroPeca } = await supabase.from('content_pieces').insert({
        workspace_id: ws, pauta_id: pauta.id, title: envio.titulo.slice(0, 200), body: corpo || null,
        format: 'Matéria editorial', status: 'draft', responsible_id: context.user.id, created_by: context.user.id,
      }).select('id').single()
      if (erroPeca || !peca) throw new Error('A pauta foi criada, mas não a matéria.')
      // O crédito de cada foto já vem preenchido: quem mandou é quem fotografou.
      const legendas = Object.fromEntries(fileIds.map((id) => [id, { legenda: '', credito: `${envio.nome}/CVB-RJ` }]))
      const { data: pacote, error: erroPacote } = await supabase.from('social_packages').insert({
        workspace_id: ws, titulo_interno: envio.titulo.slice(0, 200), origem_tipo: 'materia', origem_id: peca.id,
        mestre: { corpo, titulo: envio.titulo, subtitulo: '', legendas }, mestre_file_ids: fileIds, created_by: context.user.id,
      }).select('id').single()
      if (erroPacote || !pacote) throw new Error('A pauta e a matéria foram criadas, mas não o pacote de publicação.')
      pacoteId = pacote.id as string
      await garantirBaseNoSite(pacoteId, ws)
    }

    await admin.from('envios').update({
      estado: 'virou_pauta', pauta_id: pauta.id, pacote_id: pacoteId, avaliado_por: context.user.id, avaliado_em: new Date().toISOString(),
    }).eq('id', envio.id)
    revalidatePath('/envios')
    revalidatePath(`/envios/${envio.id}`)
    destino = pacoteId ? `/redes/${pacoteId}` : `/pautas/${pauta.id}`
    if (avisos.length) return { destino, aviso: avisos.join(' ') }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível transformar o envio.') }
  }
  return { destino }
}

/** Abrir o envio tira de "novo" (só nesse caso). */
export async function marcarEmAvaliacao(envioId: string): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    if (!UUID.test(envioId)) return {}
    await admin.from('envios').update({ estado: 'em_avaliacao' }).eq('id', envioId).eq('workspace_id', context.workspace.id).eq('estado', 'novo')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o envio.') }
  }
}

export async function arquivarEnvio(envioId: string, arquivar: boolean): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    const envio = await envioDoEspaco(admin, envioId, context.workspace.id)
    const estado = arquivar ? 'arquivado' : envio.pauta_id ? 'virou_pauta' : 'em_avaliacao'
    await admin.from('envios').update({ estado, avaliado_por: context.user.id, avaliado_em: new Date().toISOString() }).eq('id', envio.id)
    revalidatePath('/envios')
    revalidatePath(`/envios/${envio.id}`)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o envio.') }
  }
}

export async function salvarNotasDoEnvio(envioId: string, notas: string): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    const envio = await envioDoEspaco(admin, envioId, context.workspace.id)
    await admin.from('envios').update({ notas: notas.trim().slice(0, 4000) || null }).eq('id', envio.id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar as notas.') }
  }
}

/** Abre o WhatsApp com a mensagem pronta e marca que quem enviou foi avisado. */
export async function avisarPeloWhatsapp(formData: FormData) {
  const envioId = String(formData.get('envioId') ?? '')
  const url = String(formData.get('url') ?? '')
  const { context, admin } = await contexto()
  const envio = await envioDoEspaco(admin, envioId, context.workspace.id)
  if (!envio.whatsapp || !/^https:\/\//.test(url)) throw new Error('Sem WhatsApp ou sem endereço da matéria.')
  await admin.from('envios').update({ avisado_em: new Date().toISOString() }).eq('id', envio.id)
  redirect(linkDoWhatsapp(envio.whatsapp, mensagemDePublicacao(envio.nome, envio.titulo, url)))
}
