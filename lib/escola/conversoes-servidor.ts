import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { obterChave } from '@/lib/integracoes/chaves'
import { destinoDoProduto, type Classificacao } from './cursos'
import { mensagemDoErroDoMeta } from './meta'
import { contaComoRecebido, type TransacaoLida } from './unicopag'
import {
  EVENTOS_POR_LOTE, PRAZO_DO_EVENTO_DIAS, TENTATIVAS, categoriaDoProduto, fraseDoEnvio, lerRespostaDeEventos, montarEvento, motivoParaNaoEnviar, qualidadeDoEvento,
  type EventoDaMeta,
} from './conversoes'

/**
 * O lado do servidor do aviso à Meta (lib/escola/conversoes.ts): depois de
 * cada leitura das transações da Únicopag, as vendas pagas que ainda não
 * foram avisadas viram eventos `Purchase` na API de Conversões. Os dados da
 * pessoa só saem com hash SHA-256, e nada deles fica no banco.
 */

/** v25.0 vale até jul/2028; META_GRAPH_VERSION troca sem deploy. META_GRAPH_URL só para teste local. */
const versao = () => (process.env.META_GRAPH_VERSION?.trim().match(/^v\d{2}\.0$/)?.[0] ?? 'v25.0')
const graphUrl = () => process.env.META_GRAPH_URL?.trim() || 'https://graph.facebook.com'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

class ErroDasConversoes extends Error {}

async function chamar(token: string, caminho: string, init: RequestInit): Promise<Record<string, unknown>> {
  let r: Response
  try {
    r = await fetch(`${graphUrl()}/${versao()}/${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.headers ?? {}) }, cache: 'no-store', signal: AbortSignal.timeout(25_000) })
  } catch {
    throw new ErroDasConversoes('Não foi possível falar com a Meta (sem resposta).')
  }
  const corpo = await r.json().catch(() => null)
  if (!r.ok || !corpo || (corpo as { error?: unknown }).error) throw new ErroDasConversoes(mensagemDoErroDoMeta(r.status, corpo, token))
  return corpo as Record<string, unknown>
}

/** POST /{pixel}/events: devolve quantos eventos a Meta recebeu. */
async function postarEventos(token: string, pixelId: string, eventos: EventoDaMeta[], codigoDeTeste?: string): Promise<{ recebidos: number; rastro: string | null }> {
  const corpo = await chamar(token, `${pixelId}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: eventos, ...(codigoDeTeste ? { test_event_code: codigoDeTeste } : {}) }),
  })
  const lido = lerRespostaDeEventos(corpo)
  if (!lido) throw new ErroDasConversoes('A Meta respondeu algo inesperado ao receber os eventos.')
  return lido
}

/** O token da API de Conversões; na falta, o do Meta Ads (um usuário do sistema com acesso ao pixel também serve). */
export async function tokenDasConversoes(workspaceId: string): Promise<string | null> {
  return (await obterChave(workspaceId, 'meta_conversoes')) ?? (await obterChave(workspaceId, 'meta_ads'))
}

/** Confere token e pixel antes de guardar: devolve o nome do pixel ou o erro. */
export async function testarPixel(token: string, pixelId: string): Promise<{ nome: string } | { erro: string }> {
  try {
    const c = await chamar(token, `${pixelId}?fields=id,name`, { method: 'GET' })
    return { nome: typeof c.name === 'string' ? c.name.slice(0, 120) : pixelId }
  } catch (e) {
    return { erro: e instanceof ErroDasConversoes ? e.message : 'Não foi possível testar o pixel.' }
  }
}

/**
 * Um evento de teste, que aparece em "Testar eventos" do Gerenciador de
 * Eventos com o código informado. Dados de uma pessoa inventada; não grava nada.
 */
export async function enviarEventoDeTeste(token: string, pixelId: string, codigoDeTeste: string, pagina: string | null): Promise<{ recebidos: number } | { erro: string }> {
  try {
    const agora = new Date()
    const evento = montarEvento(
      { hash: `teste-${agora.getTime()}`, situacao: 'pago', valor: 100, produto: 'Taxa de inscrição — Evento de teste', paga_em: agora.toISOString(), pessoa: { nome: 'Teste Palácio', email: 'teste@exemplo.invalid', telefone: '21999990000', documento: null } },
      { categoria: 'taxa_de_inscricao', curso: 'Evento de teste', pagina, hash: sha },
    )
    const r = await postarEventos(token, pixelId, [evento], codigoDeTeste)
    return { recebidos: r.recebidos }
  } catch (e) {
    return { erro: e instanceof ErroDasConversoes ? e.message : 'Não foi possível enviar o evento de teste.' }
  }
}

type Registro = { hash: string; categoria: string; curso_id: string | null; curso: string; valor: number; paga_em: string; qualidade: string; enviado_em: string | null; rastro: string | null; erro: string | null }

/**
 * Depois de uma leitura: as vendas pagas desta conta que ainda não foram
 * avisadas (ou falharam menos de TENTATIVAS vezes) vão à Meta em lotes.
 * Só as contas marcadas na configuração mandam (`contas`): a do checkout do
 * site fica de fora, porque o site já manda a compra, com o consentimento da
 * pessoa. Falha fechada: sem a lista (ou se a leitura der erro), nada sai.
 * Nunca derruba a sincronização: devolve o trecho da mensagem.
 */
export async function enviarConversoes(admin: SupabaseClient, workspaceId: string, contaId: string, transacoes: TransacaoLida[]): Promise<string> {
  try {
    const { data: cfg, error: erroDaConfiguracao } = await admin.from('escola_conversoes').select('pixel_id,pagina_padrao,ativa,contas').eq('workspace_id', workspaceId).maybeSingle()
    if (erroDaConfiguracao || !cfg || !cfg.ativa) return ''
    if (!Array.isArray(cfg.contas) || !(cfg.contas as unknown[]).includes(contaId)) return ''
    const agora = new Date()
    const limite = agora.getTime() - PRAZO_DO_EVENTO_DIAS * 86_400_000
    const candidatas = transacoes.filter((t) => contaComoRecebido(t.situacao) && t.paga_em && Date.parse(t.paga_em) >= limite && t.valor > 0)
    if (!candidatas.length) return ''
    const { data: pendentes } = await admin.rpc('escola_conversoes_pendentes', { p_conta_id: contaId, p_hashes: candidatas.map((t) => t.hash), p_max_tentativas: TENTATIVAS })
    const faltam = new Set((pendentes ?? []) as string[])
    const lote = candidatas.filter((t) => faltam.has(t.hash))
    if (!lote.length) return ''

    const token = await tokenDasConversoes(workspaceId)
    if (!token) {
      await admin.rpc('escola_conversoes_registrar', { p_workspace_id: workspaceId, p_conta_id: contaId, p_envios: null, p_erro: 'Sem token da API de Conversões no cofre.' })
      return ' A Meta não foi avisada: falta o token da API de Conversões em Integrações.'
    }
    const [{ data: cursos }, { data: produtos }] = await Promise.all([
      admin.from('escola_cursos').select('id,nome,pagina_url').eq('workspace_id', workspaceId),
      admin.from('escola_produtos').select('produto,curso_id,ignorado').eq('workspace_id', workspaceId),
    ])
    const catalogo = (cursos ?? []) as { id: string; nome: string; pagina_url: string | null }[]
    const classificacoes = new Map(((produtos ?? []) as Classificacao[]).map((c) => [c.produto, c]))

    const itens: { evento: EventoDaMeta; registro: Registro }[] = []
    for (const t of lote) {
      const destino = destinoDoProduto(t.produto ?? '', catalogo, classificacoes)
      if (motivoParaNaoEnviar(t, destino, agora)) continue
      const curso = destino.tipo === 'curso' ? catalogo.find((c) => c.id === destino.cursoId) ?? null : null
      const nome = curso?.nome ?? t.produto ?? 'Curso'
      const evento = montarEvento(t, { categoria: categoriaDoProduto(t.produto), curso: nome, pagina: curso?.pagina_url ?? (cfg.pagina_padrao as string | null) ?? null, hash: sha })
      itens.push({ evento, registro: { hash: t.hash, categoria: evento.custom_data.content_category, curso_id: curso?.id ?? null, curso: nome, valor: t.valor, paga_em: t.paga_em as string, qualidade: qualidadeDoEvento(evento), enviado_em: null, rastro: null, erro: null } })
    }
    if (!itens.length) return ''

    let enviados = 0, falhas = 0, semPessoa = 0, erroGeral: string | null = null
    const registros: Registro[] = []
    for (let i = 0; i < itens.length; i += EVENTOS_POR_LOTE) {
      const parte = itens.slice(i, i + EVENTOS_POR_LOTE)
      try {
        const r = await postarEventos(token, cfg.pixel_id as string, parte.map((x) => x.evento))
        const quando = new Date().toISOString()
        for (const x of parte) { registros.push({ ...x.registro, enviado_em: quando, rastro: r.rastro }); enviados++; if (x.registro.qualidade !== 'boa') semPessoa++ }
      } catch (e) {
        erroGeral = e instanceof ErroDasConversoes ? e.message : 'Falha inesperada ao falar com a Meta.'
        for (const x of parte) { registros.push({ ...x.registro, erro: erroGeral }); falhas++ }
      }
    }
    await admin.rpc('escola_conversoes_registrar', { p_workspace_id: workspaceId, p_conta_id: contaId, p_envios: registros, p_erro: erroGeral })
    return fraseDoEnvio({ enviados, falhas, semPessoa })
  } catch (causa) {
    console.error('[conversões da Meta]', causa instanceof Error ? causa.message : causa)
    return ' A Meta não foi avisada desta vez (falha inesperada); a próxima leitura tenta de novo.'
  }
}
