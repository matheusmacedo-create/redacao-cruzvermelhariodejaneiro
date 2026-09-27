import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { contarMensagens, lerConversa, listarConversas } from '@/lib/google/gmail'
import { caixasQuePodeUsar } from './enviar'
import { consultaDaPasta, envolveOEndereco, lerEnderecos, lerMensagem, cabecalho, decodificarEntidades, decodificarPalavras, type MensagemLida, type Pasta } from './leitura'
import type { Papel } from '@/lib/permissoes'

/**
 * A caixa de entrada do E-mail do setor, lida direto do Gmail a cada vez
 * (nada do conteúdo é guardado no banco). Quem vê o quê: as caixas por onde
 * a pessoa pode enviar (as do setor dela; todas, para quem tem
 * "correio.todas_as_caixas"), e de cada uma só o que envolve o endereço.
 */

type Contexto = { workspace: { id: string }; user: { id: string }; role: Papel }
export type CaixaVisivel = { id: string; email: string; nome: string; setor: string; assinatura: string }
export type ConversaNaLista = {
  id: string
  assunto: string
  /** Quem aparece na linha: os remetentes da conversa, como no Gmail ("Ana, eu (3)"). */
  quem: string
  resumo: string
  quando: string | null
  naoLida: boolean
  mensagens: number
  temAnexo: boolean
}

/** As caixas que esta pessoa vê, com o nome do setor e a assinatura (para responder). */
export async function caixasVisiveis(context: Contexto): Promise<CaixaVisivel[]> {
  const permitidas = await caixasQuePodeUsar(context)
  if (!permitidas.length) return []
  const admin = createAdminClient()
  const [{ data: caixas }, { data: setores }] = await Promise.all([
    admin.from('caixas_de_email').select('id,email,nome_exibicao,nome_remetente,assinatura_html,setor_id').in('id', permitidas.map((c) => c.id)),
    admin.from('setores').select('id,nome').eq('workspace_id', context.workspace.id),
  ])
  const setor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]))
  return (caixas ?? [])
    .map((c) => ({
      id: c.id as string, email: c.email as string, nome: (c.nome_remetente || c.nome_exibicao || '') as string,
      setor: setor.get(c.setor_id as string) ?? '', assinatura: (c.assinatura_html ?? '') as string,
    }))
    .sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR') || a.email.localeCompare(b.email))
}

/** Roda no máximo `n` de cada vez: a cota do Gmail é por segundo. */
async function emLotes<T, R>(itens: T[], n: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; saida[k] = await f(itens[k]) }
  }))
  return saida
}

const primeiroNome = (nome: string, email: string) => (nome.split(/\s+/)[0] || email.split('@')[0])

/** Uma página de conversas de uma pasta do setor. */
export async function conversasDaPasta(workspaceId: string, caixa: CaixaVisivel, pasta: Pasta, busca: string, pagina: string | null): Promise<{ conversas: ConversaNaLista[]; proxima: string | null }> {
  const { conversas, proxima } = await listarConversas(workspaceId, consultaDaPasta(caixa.email, pasta, busca), pagina, 25)
  const lidas = await emLotes(conversas, 8, async (c): Promise<ConversaNaLista | null> => {
    const { messages } = await lerConversa(workspaceId, c.id, 'metadata')
    // Só as mensagens que envolvem o endereço do setor contam (e aparecem).
    const doSetor = messages.filter((m) => envolveOEndereco(m.payload, caixa.email))
    if (!doSetor.length) return null
    const ultima = doSetor[doSetor.length - 1]
    const remetentes: string[] = []
    for (const m of doSetor) {
      const de = lerEnderecos(cabecalho(m.payload, 'From'))[0]
      const rotulo = !de ? '' : de.email === caixa.email.toLowerCase() ? 'eu' : primeiroNome(de.nome, de.email)
      if (rotulo && !remetentes.includes(rotulo)) remetentes.push(rotulo)
    }
    return {
      id: c.id,
      assunto: decodificarPalavras(cabecalho(doSetor[0].payload, 'Subject')).trim() || '(sem assunto)',
      quem: `${remetentes.slice(-3).join(', ')}${doSetor.length > 1 ? ` (${doSetor.length})` : ''}`,
      resumo: decodificarEntidades(ultima.snippet ?? ''),
      quando: ultima.internalDate ? new Date(Number(ultima.internalDate)).toISOString() : null,
      naoLida: doSetor.some((m) => (m.labelIds ?? []).includes('UNREAD')),
      mensagens: doSetor.length,
      temAnexo: doSetor.some((m) => /multipart\/mixed/i.test(cabecalho(m.payload, 'Content-Type'))),
    }
  })
  return { conversas: lidas.filter((c): c is ConversaNaLista => c !== null), proxima }
}

/** Quantas não lidas há na caixa de entrada de cada endereço (estimativa do Gmail). */
export async function naoLidasPorCaixa(workspaceId: string, caixas: CaixaVisivel[]): Promise<Record<string, number>> {
  const contas = await emLotes(caixas, 6, async (c) => {
    try { return await contarMensagens(workspaceId, `${consultaDaPasta(c.email, 'entrada')} is:unread`) } catch { return 0 }
  })
  return Object.fromEntries(caixas.map((c, i) => [c.id, contas[i]]))
}

/**
 * Uma conversa aberta: só as mensagens que envolvem o endereço do setor.
 * Null se nenhuma envolve (id de conversa de outro setor, digitado à mão).
 */
export async function abrirConversa(workspaceId: string, caixa: CaixaVisivel, threadId: string): Promise<MensagemLida[] | null> {
  if (!/^[0-9a-f]{6,32}$/i.test(threadId)) return null
  const { messages } = await lerConversa(workspaceId, threadId, 'full')
  const doSetor = messages.filter((m) => envolveOEndereco(m.payload, caixa.email))
  return doSetor.length ? doSetor.map(lerMensagem) : null
}
