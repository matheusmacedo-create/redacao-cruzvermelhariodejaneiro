'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { obterWorkspaceSemVerificacao } from '@/lib/session'
import {
  avisarResultadoPeloWhatsapp, consumirConfirmacao, lerConfirmacao, registrarResultado, situacaoDaConfirmacao,
} from '@/lib/whatsapp/confirmacoes'
import { executar, faltaNaConferencia, foraDoAcessoDaEscola, linkDaConfirmacao } from '@/lib/whatsapp/confirmar-no-palacio'

export type ResultadoDaConfirmacao = { erro?: string; feito?: string; link?: string }

/**
 * "Confirmar" na tela do link (app/confirmar/[token]): só quem pediu pelo
 * WhatsApp, logado, com a verificação das telas em dia (o mesmo portão de
 * requireWorkspace), dentro dos 15 minutos e uma vez só. Gasta o link antes
 * de executar (dois cliques: só um passa) e executa pela função da tela de
 * cada área; grava o resultado, deixa a linha no histórico e responde pelo
 * WhatsApp. A conferência do voto é conferida antes de gastar o link.
 */
export async function confirmarNoPalacio(token: string, conferidos: string[] = []): Promise<ResultadoDaConfirmacao> {
  try {
    const context = await obterWorkspaceSemVerificacao()
    if (!context || context.profile?.trocar_senha || context.verificacao !== 'em_dia') return { erro: 'A sua sessão não está em dia. Entre no Palácio e abra o link de novo.' }
    const supabase = await createClient()
    const c = await lerConfirmacao(supabase, String(token ?? ''))
    // A policy só deixa o dono ler: o link de outra pessoa é como o que não existe.
    if (!c || c.userId !== context.user.id || c.workspaceId !== context.workspace.id) return { erro: 'Este link não vale para a sua conta.' }
    const situacao = situacaoDaConfirmacao(c)
    if (situacao !== 'valida') return { erro: situacao === 'usada' ? 'Este link já foi usado.' : 'Este link venceu. Peça de novo pelo WhatsApp.' }
    const link = linkDaConfirmacao(c)
    if (foraDoAcessoDaEscola(c, context.role)) return { erro: 'Isto fica fora do seu acesso no Palácio.', link }
    const quem = { userId: context.user.id, workspaceId: context.workspace.id, papel: context.role, nome: (context.profile?.full_name as string | null) ?? null }
    const conferencia = (Array.isArray(conferidos) ? conferidos : []).map(String).slice(0, 50)
    const falta = await faltaNaConferencia(supabase, c, quem, conferencia)
    if (falta) return { erro: falta }

    const admin = createAdminClient()
    if (!await consumirConfirmacao(admin, c.id, context.user.id)) return { erro: 'Este link já foi usado ou venceu.' }
    const r = await executar(supabase, c, quem, conferencia)
    await registrarResultado(admin, c.id, `${r.ok ? 'Feito' : 'Recusado'}: ${r.mensagem}`)
    // No diário do espaço, como as outras ações (o painel não mostra esta linha: fraseDaAtividade não a conhece).
    const { error } = await admin.from('activity_log').insert({
      workspace_id: c.workspaceId, actor_id: context.user.id, action: r.ok ? 'whatsapp_confirmado' : 'whatsapp_confirmacao_recusada',
      entity_type: 'whatsapp_confirmacao', entity_id: c.id, metadata: { acao: c.acao, alvo_id: c.alvoId, resultado: r.mensagem.slice(0, 300) },
    })
    if (error) console.error('[confirmar] histórico não gravado:', error.message)
    await avisarResultadoPeloWhatsapp(admin, c.workspaceId, context.user.id,
      r.ok ? `Feito no Palácio: ${r.mensagem}\n\n${urlBase()}${link}` : `Não deu para confirmar no Palácio: ${r.mensagem}\n\n${urlBase()}${link}`)
    return r.ok ? { feito: r.mensagem, link } : { erro: r.mensagem, link }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível confirmar.') }
  }
}
