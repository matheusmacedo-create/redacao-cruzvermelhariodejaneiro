import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { redigirVencidos } from './faxina'
import { TETOS_PADRAO, pontosDeAtencao, type LinhaDoUsoNaRotina } from './regras'
import { alertarAdmins, lerConfig } from './uso'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A parte do assistente do WhatsApp na rotina diária (/api/whatsapp/rotina, 7h05 em Brasília):
 *
 *  - apaga o que já não serve: memória vencida há mais de 1 dia, planos com mais de 90 dias (a trilha do que foi
 *    feito fica em activity_log) e uso com mais de 13 meses; e passa a faxina dos planos (faxina.ts);
 *  - olha as últimas 24 h de cada espaço com o assistente ligado e avisa a administração (sino e e-mail, uma vez
 *    por dia cada; nunca pelo WhatsApp) quando: o cache quase não é lido (mais da metade das chamadas sem leitura,
 *    com mais de 10), as recusas passam de 5%, o P95 passa de 20 s, alguém bateu o teto de consultas detalhadas ou
 *    de dólares, ou há números com o assistente parado pela troca do nome de perfil.
 *
 * Nunca lança: sem as tabelas (migração do assistente ainda não aplicada), não faz nada.
 */

export type ResultadoDaRotinaDoAssistente = {
  apagados: { memoria: number; planos: number; uso: number }
  faxina: { vencidos: number; redigidos: number; presos: number; usoEncerrado: number }
  alertas: Record<string, string[]>
}

async function apagar(admin: Admin, tabela: string, coluna: string, antesDe: Date): Promise<number> {
  try {
    const { data, error } = await admin.from(tabela).delete().lt(coluna, antesDe.toISOString()).select(tabela === 'whatsapp_ia_memoria' ? 'user_id' : 'id')
    return error ? 0 : data?.length ?? 0
  } catch {
    return 0
  }
}

export async function rotinaDoAssistente(admin: Admin): Promise<ResultadoDaRotinaDoAssistente> {
  const agora = Date.now()
  const r: ResultadoDaRotinaDoAssistente = { apagados: { memoria: 0, planos: 0, uso: 0 }, faxina: { vencidos: 0, redigidos: 0, presos: 0, usoEncerrado: 0 }, alertas: {} }
  try {
    const { data: espacos, error } = await admin.from('whatsapp_ia_config').select('workspace_id, modo')
    if (error) return r
    r.faxina = await redigirVencidos(admin, { limite: 200, forcar: true })
    r.apagados = {
      memoria: await apagar(admin, 'whatsapp_ia_memoria', 'expira_em', new Date(agora - 86_400_000)),
      planos: await apagar(admin, 'whatsapp_ia_planos', 'criado_em', new Date(agora - 90 * 86_400_000)),
      uso: await apagar(admin, 'whatsapp_ia_uso', 'criado_em', new Date(agora - 395 * 86_400_000)),
    }
    for (const e of espacos ?? []) {
      if (e.modo === 'desligado') continue
      const workspaceId = e.workspace_id as string
      const config = await lerConfig(admin, workspaceId)
      const [{ data: linhas }, { data: membros }] = await Promise.all([
        admin.from('whatsapp_ia_uso').select('user_id, chamadas, cache_lida, desfecho, ms, custo_usd, leituras_detalhe').eq('workspace_id', workspaceId)
          .gte('criado_em', new Date(agora - 86_400_000).toISOString()).limit(5000),
        admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).limit(3000),
      ])
      const ids = (membros ?? []).map((x) => x.user_id as string)
      const { count: suspensos } = ids.length
        ? await admin.from('whatsapp_contas').select('user_id', { count: 'exact', head: true }).in('user_id', ids).not('assistente_suspenso_em', 'is', null)
        : { count: 0 }
      const pontos = pontosDeAtencao((linhas ?? []) as LinhaDoUsoNaRotina[], {
        leituras_detalhe_dia: config?.leituras_detalhe_dia ?? TETOS_PADRAO.leituras_detalhe_dia, teto_usd_pessoa_dia: config?.teto_usd_pessoa_dia ?? TETOS_PADRAO.teto_usd_pessoa_dia,
      }, suspensos ?? 0)
      const enviados: string[] = []
      for (const p of pontos) if (await alertarAdmins(admin, workspaceId, p)) enviados.push(p.titulo)
      if (enviados.length) r.alertas[workspaceId] = enviados
    }
  } catch (causa) {
    console.error('[whatsapp] assistente: rotina falhou:', causa instanceof Error ? causa.message : causa)
  }
  return r
}
