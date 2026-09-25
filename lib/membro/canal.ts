import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATEGORIAS_DA_CONVERSA, SITUACOES_DA_CONVERSA, avisoAtivo, novaParaOMembro, ordenarAvisos, type CategoriaDaConversa } from '@/lib/canal/regras'
import { dataCurta, diasEntre } from './regras'
import type { Membro } from './sessao'

/**
 * Conversas e avisos vistos pelo voluntário. Só as conversas dele; da equipe,
 * só o primeiro nome de quem respondeu.
 */

export type ConversaDoMembro = { id: string; assunto: string; categoria: string; situacao: string; atualizada_em: string; lida_pelo_membro_em: string | null; lida_pela_equipe_em: string | null }
export type MensagemDaConversa = { id: string; autor: 'membro' | 'equipe'; nome: string | null; texto: string; created_at: string }

const COLUNAS = 'id,assunto,categoria,situacao,atualizada_em,lida_pelo_membro_em,lida_pela_equipe_em'

export async function conversasDoMembro(m: Membro): Promise<ConversaDoMembro[]> {
  const { data } = await createAdminClient().from('membro_conversas').select(COLUNAS).eq('participante_id', m.participanteId).order('atualizada_em', { ascending: false }).limit(200)
  return (data ?? []) as ConversaDoMembro[]
}

export async function naoLidasDoMembro(m: Membro): Promise<number> {
  const { count } = await createAdminClient().from('membro_conversas').select('id', { count: 'exact', head: true })
    .eq('participante_id', m.participanteId).eq('situacao', 'respondida').is('lida_pelo_membro_em', null)
  return count ?? 0
}

export async function conversaDoMembro(m: Membro, id: string): Promise<{ conversa: ConversaDoMembro; mensagens: MensagemDaConversa[] } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const admin = createAdminClient()
  const { data: c } = await admin.from('membro_conversas').select(COLUNAS).eq('id', id).eq('participante_id', m.participanteId).maybeSingle()
  if (!c) return null
  const { data: msgs } = await admin.from('membro_mensagens').select('id,autor,texto,created_at,profiles:autor_user_id(full_name)').eq('conversa_id', id).order('created_at')
  return {
    conversa: c as ConversaDoMembro,
    mensagens: (msgs ?? []).map((x) => {
      const p = (Array.isArray(x.profiles) ? x.profiles[0] : x.profiles) as { full_name?: string } | null
      return { id: x.id as string, autor: x.autor as 'membro' | 'equipe', texto: x.texto as string, created_at: x.created_at as string, nome: p?.full_name ? p.full_name.trim().split(/\s+/)[0] : null }
    }),
  }
}

export type AvisoDoMembro = { id: string; titulo: string; texto: string; fixado: boolean; created_at: string; visto: boolean }

/**
 * Em `cache`: o layout (contador) e o Início ou a página Avisos pedem os
 * mesmos avisos na mesma requisição; `m` vem da sessão em cache, então a
 * chave bate.
 */
export const avisosDoMembro = cache(async (m: Membro, hoje: string): Promise<AvisoDoMembro[]> => {
  const admin = createAdminClient()
  const [{ data: avisos }, { data: vistos }] = await Promise.all([
    admin.from('membro_avisos').select('id,titulo,texto,fixado,created_at,expira_em').eq('workspace_id', m.workspaceId).order('created_at', { ascending: false }).limit(100),
    admin.from('membro_avisos_vistos').select('aviso_id').eq('participante_id', m.participanteId),
  ])
  const ja = new Set((vistos ?? []).map((v) => v.aviso_id as string))
  return ordenarAvisos((avisos ?? []).filter((a) => avisoAtivo(a as { expira_em: string | null }, hoje)).map((a) => ({
    id: a.id as string, titulo: a.titulo as string, texto: a.texto as string, fixado: a.fixado as boolean, created_at: a.created_at as string, visto: ja.has(a.id as string),
  })))
})

// ---------------------------------------------------------------- textos das telas (puro)
//
// Ficam aqui, e não num módulo puro à parte, porque este é o arquivo do lote
// de Mensagens; não tocam no banco e são conferidos com `npx tsx` (com um
// stub para o 'server-only').

const FUSO = 'America/Sao_Paulo'
/** AAAA-MM-DD no calendário de São Paulo. */
const diaEmSaoPaulo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d)
/** "14:32" no relógio de São Paulo. */
const horaEmSaoPaulo = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
/** "12/09", ou "12/09/2025" quando não é do ano de `agora` (em São Paulo). */
const diaLegivel = (iso: string, d: Date, agora: Date) => dataCurta(iso, { ano: diaEmSaoPaulo(d).slice(0, 4) !== diaEmSaoPaulo(agora).slice(0, 4) })

/**
 * Quando foi, na lista de conversas: relativo até uma semana ("agora", "há 5
 * min", "há 3 h", "ontem", "há 4 dias") e depois a data ("12/09"). "Ontem" e
 * "há N dias" contam dias do calendário de São Paulo, não blocos de 24 h: uma
 * mensagem das 22h vista à 1h da manhã é de ontem, não "há 3 h".
 */
export function quandoFoi(iso: string, agora: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const s = (agora.getTime() - d.getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  const dias = diasEntre(diaEmSaoPaulo(d), diaEmSaoPaulo(agora))
  if (dias <= 0) return `há ${Math.floor(s / 3600)} h`
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  return diaLegivel(iso, d, agora)
}

/** Dentro da conversa: "hoje às 14:32", "ontem às 09:10", "12/09 às 14:32". */
export function horaDaMensagem(iso: string, agora: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dias = diasEntre(diaEmSaoPaulo(d), diaEmSaoPaulo(agora))
  return `${dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : diaLegivel(iso, d, agora)} às ${horaEmSaoPaulo(d)}`
}

/** Data e hora completas, para o `title` de um `<time>`: "25/09/2026 às 14:32". */
export function dataEHora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${dataCurta(iso)} às ${horaEmSaoPaulo(d)}`
}

export type ChaveDaSituacao = 'nova' | 'aberta' | 'respondida' | 'encerrada'

/**
 * O selo de situação. Na lista, resposta ainda não aberta vira "Resposta
 * nova"; dentro da própria conversa, não — abrir já conta como leitura.
 */
export function situacaoDaConversa(c: Pick<ConversaDoMembro, 'situacao' | 'lida_pelo_membro_em' | 'lida_pela_equipe_em'>, { naLista }: { naLista: boolean }): { chave: ChaveDaSituacao; texto: string } {
  if (naLista && novaParaOMembro(c)) return { chave: 'nova', texto: 'Resposta nova' }
  if (c.situacao === 'respondida' || c.situacao === 'encerrada') return { chave: c.situacao, texto: SITUACOES_DA_CONVERSA[c.situacao] }
  return { chave: 'aberta', texto: SITUACOES_DA_CONVERSA.aberta }
}

/** O nome da categoria. `Object.hasOwn`: "toString" e afins não são categoria. */
export const categoriaLegivel = (c: string) => Object.hasOwn(CATEGORIAS_DA_CONVERSA, c) ? CATEGORIAS_DA_CONVERSA[c as CategoriaDaConversa] : CATEGORIAS_DA_CONVERSA.outro

/**
 * `?nova=<categoria>` (ex.: o "Pedir correção" do Perfil manda `documentos`):
 * abre a nova mensagem já com a categoria. Sem o parâmetro → null (formulário
 * fechado); vazio ou categoria desconhecida → abre com "Dúvida".
 */
export function categoriaDaUrl(v: unknown): CategoriaDaConversa | null {
  const bruto = Array.isArray(v) ? v[0] : v
  if (typeof bruto !== 'string') return null
  return Object.hasOwn(CATEGORIAS_DA_CONVERSA, bruto) ? (bruto as CategoriaDaConversa) : 'duvida'
}

/** "Você", ou o primeiro nome de quem respondeu com o papel: "Ana · Coordenação". */
export const autorDaMensagem = (x: Pick<MensagemDaConversa, 'autor' | 'nome'>) => (x.autor === 'membro' ? 'Você' : x.nome ? `${x.nome} · Coordenação` : 'Coordenação')
