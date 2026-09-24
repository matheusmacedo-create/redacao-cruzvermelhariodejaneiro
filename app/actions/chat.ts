'use server'

import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { contextoDoChat } from '@/lib/chat/servidor'
import {
  ARQUIVOS_POR_MENSAGEM, chamaTodos, COLUNAS_DA_MENSAGEM, nomeParaCaminho, POR_PAGINA, REACOES, TAMANHO_MAXIMO, TAMANHO_MAXIMO_DO_ARQUIVO, textoDoAviso,
  type MensagemDoChat,
} from '@/lib/chat/regras'

/**
 * O chat. Toda escrita passa pelas funções do banco (chat_*), que conferem
 * quem pode; aqui só se traduz o erro e se dispara o aviso.
 *
 * Aviso (sino + e-mail pelas preferências de cada um, via notificar):
 *  - conversa direta: todo mundo dela, a cada mensagem;
 *  - canal: quem foi mencionado (ou todos, com @canal) e quem escolheu
 *    "toda mensagem" naquele canal. O resto entra no resumo diário;
 *  - resposta em fio: quem escreveu a principal, quem já respondeu e quem
 *    foi mencionado (numa direta, todo mundo dela).
 * O notificar já segura a enxurrada: quem está com a Redação aberta não
 * recebe e-mail, e a mesma conversa manda no máximo um e-mail a cada 15 min.
 */

type Resultado<T = unknown> = { erro?: string } & T
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  throw new Error(padrao)
}

async function avisarSobreMensagem(workspaceId: string, canalId: string, autorId: string, m: MensagemDoChat) {
  const admin = createAdminClient()
  const [{ data: canal }, { data: membros }, { data: autor }] = await Promise.all([
    admin.from('chat_canais').select('tipo, nome').eq('id', canalId).single(),
    admin.from('chat_membros').select('user_id, avisar').eq('canal_id', canalId),
    admin.from('profiles').select('full_name, username').eq('id', autorId).single(),
  ])
  if (!canal) return
  const quem = autor?.full_name || autor?.username || 'Alguém'
  const outros = (membros ?? []).filter((x) => x.user_id !== autorId && x.avisar !== 'nada')
  const base = { workspaceId, atorId: autorId, categoria: 'chat' as const, link: `/chat/${canalId}`, citacao: textoDoAviso(m, 400), botao: 'Abrir a conversa', mensagem: textoDoAviso(m) }
  if (m.resposta_de) {
    const { data: pai } = await admin.from('chat_mensagens').select('autor_id, respondentes').eq('id', m.resposta_de).single()
    const noFio = new Set<string>([pai?.autor_id as string, ...((pai?.respondentes as string[]) ?? []), ...m.mencoes].filter(Boolean))
    const para = outros.filter((x) => canal.tipo === 'direta' || m.menciona_todos || noFio.has(x.user_id as string)).map((x) => x.user_id as string)
    if (para.length) {
      await notificar(admin, {
        ...base, link: `/chat/${canalId}?fio=${m.resposta_de}`, botao: 'Abrir o fio', para,
        titulo: canal.tipo === 'canal' ? `${quem} respondeu no fio em #${canal.nome}` : `${quem} respondeu no fio da conversa`,
      })
    }
    return
  }
  if (canal.tipo === 'direta') {
    const grupo = (membros ?? []).length > 2
    await notificar(admin, { ...base, para: outros.map((x) => x.user_id as string), titulo: grupo ? `${quem} escreveu na conversa em grupo` : `Mensagem de ${quem}` })
    return
  }
  const chamados = new Set(outros.filter((x) => m.menciona_todos || m.mencoes.includes(x.user_id as string)).map((x) => x.user_id as string))
  if (chamados.size) await notificar(admin, { ...base, para: [...chamados], titulo: `${quem} mencionou ${m.menciona_todos ? 'o canal' : 'você'} em #${canal.nome}` })
  const todas = outros.filter((x) => x.avisar === 'tudo' && !chamados.has(x.user_id as string)).map((x) => x.user_id as string)
  if (todas.length) await notificar(admin, { ...base, para: todas, titulo: `Nova mensagem de ${quem} em #${canal.nome}` })
}

export type ArquivoEnviado = { caminho: string; nome: string; duracao?: number | null }

export async function enviarMensagem(canalId: string, corpo: string, mencoes: string[], opcoes: { respostaDe?: string | null; anexos?: ArquivoEnviado[] } = {}): Promise<Resultado<{ mensagem?: MensagemDoChat }>> {
  try {
    if (!uuid(canalId) || (opcoes.respostaDe && !uuid(opcoes.respostaDe))) throw new Error('Conversa inválida.')
    const texto = String(corpo ?? '').trim()
    const anexos = (opcoes.anexos ?? []).slice(0, ARQUIVOS_POR_MENSAGEM + 1).map((a) => ({
      caminho: String(a.caminho ?? ''), nome: String(a.nome ?? '').slice(0, 200), duracao: Number.isFinite(a.duracao) ? Number(a.duracao) : null,
    }))
    if (!texto && !anexos.length) throw new Error('Escreva a mensagem.')
    if (texto.length > TAMANHO_MAXIMO) throw new Error('A mensagem pode ter até 8.000 caracteres.')
    const { context, supabase } = await contextoDoChat()
    const { data, error } = await supabase.rpc('chat_enviar', {
      p_canal_id: canalId, p_corpo: texto, p_mencoes: (mencoes ?? []).filter(uuid).slice(0, 50), p_todos: chamaTodos(texto),
      p_resposta_de: opcoes.respostaDe ?? null, p_anexos: anexos,
    })
    if (error || !data) erroDoBanco(error, 'Não foi possível enviar.')
    const { data: mensagem } = await supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('id', (data as { id: string }).id).single()
    if (mensagem) {
      const m = mensagem as MensagemDoChat
      after(() => avisarSobreMensagem(context.workspace.id, canalId, context.user.id, m))
    }
    return { mensagem: (mensagem ?? undefined) as MensagemDoChat | undefined }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar.') }
  }
}

export async function editarMensagem(id: string, corpo: string): Promise<Resultado> {
  try {
    if (!uuid(id)) throw new Error('Mensagem inválida.')
    const { supabase } = await contextoDoChat()
    const { error } = await supabase.rpc('chat_editar', { p_id: id, p_corpo: String(corpo ?? '') })
    if (error) erroDoBanco(error, 'Não foi possível editar.')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível editar.') }
  }
}

export async function apagarMensagem(id: string): Promise<Resultado> {
  try {
    if (!uuid(id)) throw new Error('Mensagem inválida.')
    const { supabase } = await contextoDoChat()
    const { error } = await supabase.rpc('chat_apagar', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível apagar.')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível apagar.') }
  }
}

/** As mensagens de antes (rolando para cima). */
export async function carregarAnteriores(canalId: string, antesDe: string): Promise<Resultado<{ mensagens?: MensagemDoChat[]; temMais?: boolean }>> {
  try {
    if (!uuid(canalId) || Number.isNaN(Date.parse(antesDe))) throw new Error('Pedido inválido.')
    const { supabase } = await contextoDoChat()
    const { data } = await supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('canal_id', canalId).is('resposta_de', null).lt('created_at', antesDe)
      .order('created_at', { ascending: false }).limit(POR_PAGINA + 1)
    const lista = (data ?? []) as MensagemDoChat[]
    return { mensagens: lista.slice(0, POR_PAGINA).reverse(), temMais: lista.length > POR_PAGINA }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível carregar.') }
  }
}

export async function criarCanal(p: { nome: string; descricao: string; privado: boolean; pessoas: string[] }): Promise<Resultado<{ id?: string }>> {
  try {
    const { context, supabase } = await contextoDoChat()
    const { data, error } = await supabase.rpc('chat_criar_canal', {
      p_workspace_id: context.workspace.id, p_nome: String(p.nome ?? '').slice(0, 80), p_descricao: String(p.descricao ?? '').slice(0, 300),
      p_privado: Boolean(p.privado), p_membros: (p.pessoas ?? []).filter(uuid),
    })
    if (error || !data) erroDoBanco(error, 'Não foi possível criar o canal.')
    revalidatePath('/chat', 'layout')
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o canal.') }
  }
}

export async function abrirDireta(pessoas: string[]): Promise<Resultado<{ id?: string }>> {
  try {
    const { context, supabase } = await contextoDoChat()
    const { data, error } = await supabase.rpc('chat_abrir_direta', { p_workspace_id: context.workspace.id, p_pessoas: (pessoas ?? []).filter(uuid) })
    if (error || !data) erroDoBanco(error, 'Não foi possível abrir a conversa.')
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir a conversa.') }
  }
}

async function simples(rpc: string, args: Record<string, unknown>, padrao: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoChat()
    const { error } = await supabase.rpc(rpc, args)
    if (error) erroDoBanco(error, padrao)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, padrao) }
  }
}

export async function entrarNoCanal(canalId: string) { return uuid(canalId) ? simples('chat_entrar', { p_canal_id: canalId }, 'Não foi possível entrar.') : { erro: 'Canal inválido.' } }
export async function sairDoCanal(canalId: string) { return uuid(canalId) ? simples('chat_sair', { p_canal_id: canalId }, 'Não foi possível sair.') : { erro: 'Canal inválido.' } }
export async function marcarLido(canalId: string) { return uuid(canalId) ? simples('chat_ler', { p_canal_id: canalId }, 'Não foi possível marcar como lido.') : { erro: 'Canal inválido.' } }
export async function mudarAvisos(canalId: string, avisar: 'tudo' | 'mencoes' | 'nada') {
  return uuid(canalId) ? simples('chat_avisos', { p_canal_id: canalId, p_avisar: avisar }, 'Não foi possível mudar os avisos.') : { erro: 'Canal inválido.' }
}
export async function editarCanal(canalId: string, descricao: string, arquivado: boolean) {
  return uuid(canalId) ? simples('chat_editar_canal', { p_canal_id: canalId, p_descricao: String(descricao ?? '').slice(0, 300), p_arquivado: arquivado }, 'Não foi possível salvar o canal.') : { erro: 'Canal inválido.' }
}
export async function removerDoCanal(canalId: string, pessoa: string) {
  return uuid(canalId) && uuid(pessoa) ? simples('chat_remover', { p_canal_id: canalId, p_pessoa: pessoa }, 'Não foi possível tirar a pessoa.') : { erro: 'Pedido inválido.' }
}

export async function adicionarAoCanal(canalId: string, pessoas: string[]): Promise<Resultado<{ quantas?: number }>> {
  try {
    if (!uuid(canalId)) throw new Error('Canal inválido.')
    const { context, supabase } = await contextoDoChat()
    const { data, error } = await supabase.rpc('chat_adicionar', { p_canal_id: canalId, p_pessoas: (pessoas ?? []).filter(uuid) })
    if (error) erroDoBanco(error, 'Não foi possível chamar as pessoas.')
    const { data: canal } = await supabase.from('chat_canais').select('nome').eq('id', canalId).single()
    if (canal && (data as number) > 0) {
      const { data: eu } = await supabase.from('profiles').select('full_name').eq('id', context.user.id).single()
      after(() => notificar(createAdminClient(), {
        workspaceId: context.workspace.id, para: pessoas, atorId: context.user.id, categoria: 'chat',
        titulo: `${eu?.full_name ?? 'Alguém'} chamou você para #${canal.nome}`, mensagem: 'Você agora faz parte do canal.', link: `/chat/${canalId}`, botao: 'Abrir o canal',
      }))
    }
    return { quantas: data as number }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível chamar as pessoas.') }
  }
}

/** Para o aviso ao vivo: o que é esta conversa para quem está logado (nova, ainda fora da lista). */
export async function infoDoCanal(canalId: string): Promise<{ tipo?: string; nome?: string | null; avisar?: string; membro?: boolean }> {
  if (!uuid(canalId)) return {}
  const { context, supabase } = await contextoDoChat()
  const [{ data: canal }, { data: eu }] = await Promise.all([
    supabase.from('chat_canais').select('tipo, nome').eq('id', canalId).maybeSingle(),
    supabase.from('chat_membros').select('avisar').eq('canal_id', canalId).eq('user_id', context.user.id).maybeSingle(),
  ])
  return canal ? { tipo: canal.tipo, nome: canal.nome, avisar: eu?.avisar ?? 'mencoes', membro: Boolean(eu) } : {}
}

// ---------------------------------------------------------------- arquivos

/**
 * Primeiro passo do envio de arquivos: um link de uso único para cada um,
 * direto do navegador ao Storage. O caminho leva espaço, conversa e quem
 * envia; o banco confere tudo de novo ao registrar a mensagem.
 */
export async function prepararArquivos(canalId: string, arquivos: { nome: string; tipo: string; tamanho: number }[]): Promise<Resultado<{ envios?: { caminho: string; token: string }[] }>> {
  try {
    if (!uuid(canalId)) throw new Error('Conversa inválida.')
    const lista = arquivos ?? []
    if (!lista.length) throw new Error('Escolha um arquivo.')
    if (lista.length > ARQUIVOS_POR_MENSAGEM) throw new Error(`Até ${ARQUIVOS_POR_MENSAGEM} arquivos por mensagem.`)
    for (const a of lista) {
      if (!Number.isFinite(a.tamanho) || a.tamanho <= 0) throw new Error(`O arquivo ${String(a.nome).slice(0, 60)} está vazio.`)
      if (a.tamanho > TAMANHO_MAXIMO_DO_ARQUIVO) throw new Error(`${String(a.nome).slice(0, 60)} passa de 50 MB.`)
    }
    const { context, supabase } = await contextoDoChat()
    // O RLS só mostra a conversa a quem pode vê-la.
    const { data: canal } = await supabase.from('chat_canais').select('id, arquivado').eq('id', canalId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!canal) throw new Error('Conversa não encontrada.')
    if (canal.arquivado) throw new Error('Este canal foi arquivado: dá para ler, não para escrever.')
    const admin = createAdminClient()
    const envios = await Promise.all(lista.map(async (a) => {
      const caminho = `${context.workspace.id}/${canalId}/${context.user.id}/${randomUUID()}-${nomeParaCaminho(String(a.nome ?? ''))}`
      const { data, error } = await admin.storage.from('chat-arquivos').createSignedUploadUrl(caminho)
      if (error || !data) throw new Error('Não foi possível preparar o envio.')
      return { caminho, token: data.token }
    }))
    return { envios }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

// ---------------------------------------------------------------- reações, fio, busca e histórico

export async function reagir(mensagemId: string, emoji: string): Promise<Resultado<{ reacoes?: MensagemDoChat['reacoes'] }>> {
  try {
    if (!uuid(mensagemId)) throw new Error('Mensagem inválida.')
    if (!REACOES.includes(emoji)) throw new Error('Reação inválida.')
    const { supabase } = await contextoDoChat()
    const { data, error } = await supabase.rpc('chat_reagir', { p_id: mensagemId, p_emoji: emoji })
    if (error) erroDoBanco(error, 'Não foi possível reagir.')
    return { reacoes: (data ?? []) as MensagemDoChat['reacoes'] }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível reagir.') }
  }
}

/** Um fio: a mensagem principal e as respostas, em ordem. */
export async function carregarFio(paiId: string): Promise<Resultado<{ pai?: MensagemDoChat; respostas?: MensagemDoChat[] }>> {
  try {
    if (!uuid(paiId)) throw new Error('Mensagem inválida.')
    const { supabase } = await contextoDoChat()
    const [{ data: pai }, { data: respostas }] = await Promise.all([
      supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('id', paiId).maybeSingle(),
      supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('resposta_de', paiId).order('created_at').limit(500),
    ])
    if (!pai) throw new Error('Mensagem não encontrada.')
    return { pai: pai as MensagemDoChat, respostas: (respostas ?? []) as MensagemDoChat[] }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o fio.') }
  }
}

export type ResultadoDaBusca = Pick<MensagemDoChat, 'id' | 'canal_id' | 'autor_id' | 'corpo' | 'created_at' | 'resposta_de' | 'anexos'> & {
  canal_tipo: 'canal' | 'direta'; canal_nome: string | null; pessoas: string[] | null
}

export async function buscarNoChat(f: { texto: string; canalId?: string | null; autorId?: string | null; soMencoes?: boolean; comArquivos?: boolean }): Promise<Resultado<{ resultados?: ResultadoDaBusca[] }>> {
  try {
    if ((f.canalId && !uuid(f.canalId)) || (f.autorId && !uuid(f.autorId))) throw new Error('Filtro inválido.')
    const { context, supabase } = await contextoDoChat()
    const { data, error } = await supabase.rpc('chat_buscar', {
      p_workspace_id: context.workspace.id, p_texto: String(f.texto ?? '').slice(0, 200), p_canal_id: f.canalId || null, p_autor_id: f.autorId || null,
      p_so_mencoes: Boolean(f.soMencoes), p_com_arquivos: Boolean(f.comArquivos), p_limite: 60,
    })
    if (error) erroDoBanco(error, 'Não foi possível buscar.')
    return { resultados: (data ?? []) as ResultadoDaBusca[] }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível buscar.') }
  }
}

export type VersaoDaMensagem = { acao: 'edicao' | 'apagada'; corpo: string; por: string | null; created_at: string; anexos: MensagemDoChat['anexos'] | null }

/** O que a mensagem já foi (só administrador: o RLS devolve vazio para os outros). */
export async function historicoDaMensagem(id: string): Promise<Resultado<{ versoes?: VersaoDaMensagem[] }>> {
  try {
    if (!uuid(id)) throw new Error('Mensagem inválida.')
    const { context, supabase } = await contextoDoChat()
    if (context.role !== 'admin') throw new Error('Só a administração vê o histórico.')
    const { data } = await supabase.from('chat_versoes').select('acao, corpo, por, created_at, anexos').eq('mensagem_id', id).order('created_at')
    return { versoes: (data ?? []) as VersaoDaMensagem[] }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o histórico.') }
  }
}
