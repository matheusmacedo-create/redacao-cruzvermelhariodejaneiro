import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { contarMensagens, lerConversa, listarConversas } from '@/lib/google/gmail'
import { caixasQuePodeUsar } from './enviar'
import { consultaDaPasta, mensagensDaCaixa, lerEnderecos, lerMensagem, cabecalho, decodificarEntidades, decodificarPalavras, type MensagemLida, type Pasta } from './leitura'
import type { Papel } from '@/lib/permissoes'

/**
 * A caixa de entrada do E-mail do setor, lida do Gmail (nada do conteúdo é
 * guardado no banco). Quem vê o quê: as caixas por onde a pessoa pode enviar
 * (as do setor dela; todas, para quem tem "correio.todas_as_caixas"), e de
 * cada uma só o que envolve o endereço.
 *
 * A cota do Gmail é por conta Google, e a conta é uma só para a filial
 * inteira: cada abertura da tela custava ~300 unidades (o contador de cada
 * caixa, a lista de 25 conversas a 10 unidades cada) e, com a equipe toda
 * abrindo e o refresh a cada conversa lida, o limite por minuto estourou
 * (ARQUITETURA §7.29). Por isso as leituras ficam guardadas na memória do
 * servidor por CACHE_SEGUNDOS, para todo mundo do espaço: mudar algo (marcar
 * lida, arquivar, enviar) e o botão "Atualizar" esquecem na hora
 * (esquecerLeituras, chamado por app/actions/correio.ts). Uma leitura em
 * andamento também é compartilhada: dez pessoas abrindo a mesma caixa no
 * mesmo segundo fazem uma ida só ao Gmail.
 *
 * É memória do processo, e não o cache de dados do Next: o comportamento é
 * o mesmo em dev e na Vercel, dá para conferir com um Map, e a leitura em
 * andamento é compartilhada. Cada instância na Vercel tem a sua; a equipe
 * cai quase sempre na mesma, e o pior caso é uma bolinha de não lida que
 * demora até um minuto para sumir em outra instância.
 */

/** Quanto tempo uma leitura do Gmail vale para todo mundo do espaço. */
const CACHE_SEGUNDOS = 60
const guardado = new Map<string, { ate: number; valor: Promise<unknown> }>()

/** Devolve a leitura guardada (ou em andamento) desta chave, ou faz e guarda. Erro não fica guardado. */
function lembrar<T>(chave: string, ler: () => Promise<T>): Promise<T> {
  const agora = Date.now()
  const g = guardado.get(chave)
  if (g && g.ate > agora) return g.valor as Promise<T>
  const valor = ler().catch((causa: unknown) => { guardado.delete(chave); throw causa })
  guardado.set(chave, { ate: agora + CACHE_SEGUNDOS * 1000, valor })
  if (guardado.size > 500) for (const [k, v] of guardado) if (v.ate <= agora) guardado.delete(k)
  return valor
}

/** Esquece as leituras guardadas de um espaço: a próxima abertura lê o Gmail de novo. */
export function esquecerLeituras(workspaceId: string): void {
  for (const k of guardado.keys()) if (k.startsWith(`${workspaceId}|`)) guardado.delete(k)
}

type Contexto = { workspace: { id: string }; user: { id: string }; role: Papel }
/** rotuloId/rotuloNome: a etiqueta do Gmail que também leva à caixa (lib/correio/leitura.ts → mensagensDaCaixa). */
export type CaixaVisivel = { id: string; email: string; nome: string; setor: string; assinatura: string; rotuloId: string | null; rotuloNome: string | null }
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
  return caixasPorId(context.workspace.id, permitidas.map((c) => c.id))
}

/**
 * As caixas destes ids, prontas para a tela. Quem chama já decidiu que a
 * pessoa pode vê-las (caixasVisiveis, no Palácio; lib/email-provisorio no app
 * de e-mail). Só as ativas, no Gmail e com setor.
 */
export async function caixasPorId(workspaceId: string, ids: string[]): Promise<CaixaVisivel[]> {
  if (!ids.length) return []
  const admin = createAdminClient()
  const [{ data: caixas }, { data: setores }] = await Promise.all([
    admin.from('caixas_de_email').select('id,email,nome_exibicao,nome_remetente,assinatura_html,setor_id,rotulo_gmail_id,rotulo_gmail_nome')
      .eq('workspace_id', workspaceId).eq('ativa', true).eq('no_gmail', true).not('setor_id', 'is', null).in('id', ids),
    admin.from('setores').select('id,nome').eq('workspace_id', workspaceId),
  ])
  const setor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]))
  return (caixas ?? [])
    .map((c) => ({
      id: c.id as string, email: c.email as string, nome: (c.nome_remetente || c.nome_exibicao || '') as string,
      setor: setor.get(c.setor_id as string) ?? '', assinatura: (c.assinatura_html ?? '') as string,
      rotuloId: (c.rotulo_gmail_id || null) as string | null, rotuloNome: (c.rotulo_gmail_nome || null) as string | null,
    }))
    .sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR') || a.email.localeCompare(b.email))
}

/**
 * Roda no máximo `n` de cada vez: a cota do Gmail também é por segundo (250
 * unidades numa média móvel), e uma conversa custa 10. Com 8 em paralelo a
 * lista sozinha passava disso.
 */
async function emLotes<T, R>(itens: T[], n: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; saida[k] = await f(itens[k]) }
  }))
  return saida
}

const primeiroNome = (nome: string, email: string) => (nome.split(/\s+/)[0] || email.split('@')[0])

/** Uma página de conversas de uma pasta do setor (guardada por CACHE_SEGUNDOS). */
export async function conversasDaPasta(workspaceId: string, caixa: CaixaVisivel, pasta: Pasta, busca: string, pagina: string | null): Promise<{ conversas: ConversaNaLista[]; proxima: string | null }> {
  return lembrar(`${workspaceId}|pasta|${chaveDaCaixa(caixa)}|${pasta}|${busca}|${pagina ?? ''}`, () => lerPaginaDaPasta(workspaceId, caixa, pasta, busca, pagina))
}

/** A caixa na chave do cache: o endereço e a etiqueta (trocar a etiqueta muda o que a caixa vê). */
const chaveDaCaixa = (c: Pick<CaixaVisivel, 'email' | 'rotuloId'>) => `${c.email}#${c.rotuloId ?? ''}`

async function lerPaginaDaPasta(workspaceId: string, caixa: CaixaVisivel, pasta: Pasta, busca: string, pagina: string | null): Promise<{ conversas: ConversaNaLista[]; proxima: string | null }> {
  const email = caixa.email
  const { conversas, proxima } = await listarConversas(workspaceId, consultaDaPasta(email, pasta, busca, caixa.rotuloNome), pagina, 25)
  const lidas = await emLotes(conversas, 4, async (c): Promise<ConversaNaLista | null> => {
    const { messages } = await lerConversa(workspaceId, c.id, 'metadata')
    // Só as mensagens da caixa contam (e aparecem): as do endereço, ou a conversa inteira se tem a etiqueta dela.
    const doSetor = mensagensDaCaixa(messages, caixa)
    if (!doSetor.length) return null
    const ultima = doSetor[doSetor.length - 1]
    const remetentes: string[] = []
    for (const m of doSetor) {
      const de = lerEnderecos(cabecalho(m.payload, 'From'))[0]
      const rotulo = !de ? '' : de.email === email.toLowerCase() ? 'eu' : primeiroNome(de.nome, de.email)
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

/** Quantas não lidas há na caixa de entrada de cada endereço (estimativa do Gmail; guardada por CACHE_SEGUNDOS). */
export async function naoLidasPorCaixa(workspaceId: string, caixas: CaixaVisivel[]): Promise<Record<string, number>> {
  const contas = await lembrar(`${workspaceId}|nao-lidas|${caixas.map(chaveDaCaixa).join(',')}`, () => contarNaoLidas(workspaceId, caixas))
  return Object.fromEntries(caixas.map((c, i) => [c.id, contas[i] ?? 0]))
}

async function contarNaoLidas(workspaceId: string, caixas: CaixaVisivel[]): Promise<number[]> {
  return emLotes(caixas, 4, async (c) => {
    try { return await contarMensagens(workspaceId, `${consultaDaPasta(c.email, 'entrada', '', c.rotuloNome)} is:unread`) } catch { return 0 }
  })
}

/**
 * Uma conversa aberta: só as mensagens da caixa (as do endereço, ou todas se
 * a conversa tem a etiqueta dela). Null se nenhuma é (id de conversa de outro
 * setor, digitado à mão).
 */
export async function abrirConversa(workspaceId: string, caixa: CaixaVisivel, threadId: string): Promise<MensagemLida[] | null> {
  if (!/^[0-9a-f]{6,32}$/i.test(threadId)) return null
  return lembrar(`${workspaceId}|conversa|${chaveDaCaixa(caixa)}|${threadId}`, () => lerConversaDoSetor(workspaceId, caixa, threadId))
}

async function lerConversaDoSetor(workspaceId: string, caixa: CaixaVisivel, threadId: string): Promise<MensagemLida[] | null> {
  const { messages } = await lerConversa(workspaceId, threadId, 'full')
  const doSetor = mensagensDaCaixa(messages, caixa)
  return doSetor.length ? doSetor.map(lerMensagem) : null
}
