import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIMITES, redigirPassos, type Passo, type ResultadoDoPasso } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A faxina dos planos do assistente do WhatsApp: os textos de ação (mensagem, nota, relato, recado, local, pedido
 * em aberto) não ficam no banco depois que o plano sai de "aberto". O fluxo já redige na hora em toda saída
 * (fluxo.ts); aqui fica o que sobra:
 *  1. o que passou de expira_em (pergunta, aberto, em revisão ou esperando o Palácio) vira "vencido";
 *  2. os encerrados ainda não redigidos são redigidos, até `limite` por vez;
 *  3. o que ficou "executando" por mais de LIMITES.executandoMin (a função caiu no meio) vira "falhou", e a
 *     pessoa é avisada no sino e no e-mail;
 *  4. o uso que ficou "andamento" por mais de 10 min (a função caiu antes de fechar o turno) vira "erro".
 *
 * Roda em todo tráfego do WhatsApp: no início de processarFila (que roda a cada aviso emitido em qualquer parte
 * do Palácio; a geral, no máximo a cada 30 s por instância), em guardarPendencia e, com o assistente, no webhook e
 * no acesso ao plano (só os da pessoa, sempre). Por isso não depende de fila.ts (que a chama): o aviso do item 3 é
 * import tardio.
 *
 * Nunca lança. Sem a tabela (migração do assistente ainda não aplicada), não faz nada — e não pergunta de novo
 * por 5 minutos nesta instância.
 */

const SITUACOES_A_REDIGIR = ['vencido', 'cancelado', 'substituido', 'falhou', 'executado', 'parcial']

/** Até quando esta instância não pergunta pela tabela (ela não existia na última vez). */
let semTabelaAte = 0
const SEM_TABELA_MS = 5 * 60_000

/** A faxina geral (sem `userId`) roda no máximo a cada tantos ms por instância: a fila anda a cada aviso emitido. */
const INTERVALO_DA_GERAL_MS = 30_000
let ultimaGeral = 0

const tabelaAusente = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' || error?.code === '42P01' || /does not exist|schema cache/i.test(error?.message ?? '')

export type ResultadoDaFaxina = { vencidos: number; redigidos: number; presos: number; usoEncerrado: number }

/** `userId`: só os planos desta pessoa (no acesso dela ao plano). `forcar`: a geral sem o intervalo (a rotina diária). */
export async function redigirVencidos(admin: Admin, opcoes: { limite: number; userId?: string | null; forcar?: boolean }): Promise<ResultadoDaFaxina> {
  const r: ResultadoDaFaxina = { vencidos: 0, redigidos: 0, presos: 0, usoEncerrado: 0 }
  if (Date.now() < semTabelaAte) return r
  if (!opcoes.userId && !opcoes.forcar) {
    if (Date.now() - ultimaGeral < INTERVALO_DA_GERAL_MS) return r
    ultimaGeral = Date.now()
  }
  try {
    const agora = new Date()
    const iso = agora.toISOString()

    let vencer = admin.from('whatsapp_ia_planos').update({ situacao: 'vencido', atualizado_em: iso })
      .in('situacao', ['pergunta', 'aberto', 'em_revisao', 'no_palacio']).lt('expira_em', iso)
    if (opcoes.userId) vencer = vencer.eq('user_id', opcoes.userId)
    const { data: vencidos, error } = await vencer.select('id')
    if (error) {
      if (tabelaAusente(error)) semTabelaAte = Date.now() + SEM_TABELA_MS
      else console.error('[whatsapp] assistente: faxina não venceu os planos:', error.code)
      return r
    }
    r.vencidos = vencidos?.length ?? 0

    let aRedigir = admin.from('whatsapp_ia_planos').select('id, passos').in('situacao', SITUACOES_A_REDIGIR).is('redigido_em', null)
      .order('atualizado_em', { ascending: true }).limit(opcoes.limite)
    if (opcoes.userId) aRedigir = aRedigir.eq('user_id', opcoes.userId)
    const { data: linhas } = await aRedigir
    const redigidos = await Promise.all((linhas ?? []).map(async (l) => {
      const { passos } = redigirPassos(Array.isArray(l.passos) ? (l.passos as Passo[]) : [])
      const { data } = await admin.from('whatsapp_ia_planos').update({ passos, pedido_em_aberto: null, redigido_em: iso })
        .eq('id', l.id as string).is('redigido_em', null).select('id').maybeSingle()
      return Boolean(data)
    }))
    r.redigidos = redigidos.filter(Boolean).length

    const limiteDoPreso = new Date(agora.getTime() - LIMITES.executandoMin * 60_000).toISOString()
    let soltar = admin.from('whatsapp_ia_planos').update({ situacao: 'falhou', atualizado_em: iso })
      .eq('situacao', 'executando').lt('atualizado_em', limiteDoPreso)
    if (opcoes.userId) soltar = soltar.eq('user_id', opcoes.userId)
    const { data: presos } = await soltar.select('id, workspace_id, user_id, passos, resultado')
    r.presos = presos?.length ?? 0
    for (const p of presos ?? []) {
      const { passos } = redigirPassos(Array.isArray(p.passos) ? (p.passos as Passo[]) : [])
      await admin.from('whatsapp_ia_planos').update({ passos, pedido_em_aberto: null, redigido_em: iso }).eq('id', p.id as string)
      const feitos = (Array.isArray(p.resultado) ? (p.resultado as ResultadoDoPasso[]) : []).filter((x) => x.ok).length
      // Import tardio: notificar põe o aviso na fila, e a fila chama esta faxina.
      const { notificar } = await import('@/lib/notificacoes/servidor')
      await notificar(admin, {
        workspaceId: p.workspace_id as string, para: [p.user_id as string], atorId: null, categoria: 'sistema',
        titulo: 'Um plano do WhatsApp parou no meio', mensagem: `O plano parou no passo ${feitos + 1}; confira no Palácio.`, link: '/notificacoes',
      })
    }

    const limiteDoUso = new Date(agora.getTime() - 10 * 60_000).toISOString()
    const { data: usos } = await admin.from('whatsapp_ia_uso').update({ desfecho: 'erro', erro: 'sem_desfecho' })
      .eq('desfecho', 'andamento').lt('criado_em', limiteDoUso).select('id')
    r.usoEncerrado = usos?.length ?? 0
  } catch (causa) {
    console.error('[whatsapp] assistente: faxina falhou:', causa instanceof Error ? causa.message : causa)
  }
  return r
}
