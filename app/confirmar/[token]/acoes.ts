'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { obterWorkspaceSemVerificacao } from '@/lib/session'
import {
  avisarResultadoPeloWhatsapp, consumirConfirmacao, lerConfirmacao, registrarResultado, situacaoDaConfirmacao,
} from '@/lib/whatsapp/confirmacoes'
import { executar, faltaNaConferencia, foraDoAcessoDaEscola, linkDaConfirmacao, type QuemConfirma } from '@/lib/whatsapp/confirmar-no-palacio'
import { executarPlanoNoPalacio as executarPlano } from '@/lib/whatsapp/assistente/palacio'
import type { Confirmacao } from '@/lib/whatsapp/confirmacoes'
import type { AjustesDoCadastro } from '@/lib/whatsapp/colaborador-regras'

export type ResultadoDaConfirmacao = { erro?: string; feito?: string; link?: string }

/** O recibo na tela: o mesmo texto do WhatsApp, sem a marcação de negrito. */
const paraATela = (texto: string) => texto.replace(/\*/g, '')

/**
 * "Confirmar" na tela do link (app/confirmar/[token]): só quem pediu pelo
 * WhatsApp, logado, com a verificação das telas em dia (o mesmo portão de
 * requireWorkspace), dentro dos 15 minutos e uma vez só. Gasta o link antes
 * de executar (dois cliques: só um passa) e executa pela função da tela de
 * cada área; grava o resultado, deixa a linha no histórico e responde pelo
 * WhatsApp. A conferência do voto é conferida antes de gastar o link; no
 * cadastro de colaborador, o pedido com o usuário e o papel escolhidos na tela
 * (`ajustes`) também — o que não serve volta sem gastar o link.
 */
export async function confirmarNoPalacio(token: string, conferidos: string[] = [], ajustes: AjustesDoCadastro | null = null): Promise<ResultadoDaConfirmacao> {
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
    // O plano do assistente tem o caminho dele: os passos pela sessão, começando pela transição atômica do plano.
    if (c.acao === 'plano') return executarPlanoNoPalacio(supabase, c, quem, conferencia)
    // Só o usuário e o papel, como texto (o resto do pedido vem do link, nunca do navegador).
    const escolha: AjustesDoCadastro | null = c.acao === 'cadastrar_colaborador' && ajustes && typeof ajustes === 'object'
      ? { usuario: typeof ajustes.usuario === 'string' ? ajustes.usuario.slice(0, 60) : undefined, papel: typeof ajustes.papel === 'string' ? ajustes.papel.slice(0, 30) : undefined }
      : null
    const falta = await faltaNaConferencia(supabase, c, quem, conferencia, escolha)
    if (falta) return { erro: falta }

    const admin = createAdminClient()
    // `c` (com os dados do link) foi lido antes: ao gastar, o banco tira o contato do cadastro de colaborador da linha.
    if (!await consumirConfirmacao(admin, c.id, context.user.id)) return { erro: 'Este link já foi usado ou venceu.' }
    const r = await executar(supabase, c, quem, conferencia, escolha)
    await registrarResultado(admin, c.id, `${r.ok ? 'Feito' : 'Recusado'}: ${paraATela(r.mensagem)}`)
    // No diário do espaço, como as outras ações (o painel não mostra esta linha: fraseDaAtividade não a conhece).
    const { error } = await admin.from('activity_log').insert({
      workspace_id: c.workspaceId, actor_id: context.user.id, action: r.ok ? 'whatsapp_confirmado' : 'whatsapp_confirmacao_recusada',
      entity_type: 'whatsapp_confirmacao', entity_id: c.id, metadata: { acao: c.acao, alvo_id: c.alvoId, resultado: paraATela(r.mensagem).slice(0, 300) },
    })
    if (error) console.error('[confirmar] histórico não gravado:', error.message)
    await avisarResultadoPeloWhatsapp(admin, c.workspaceId, context.user.id,
      r.ok ? `Feito no Palácio: ${r.mensagem}\n\n${urlBase()}${link}` : `Não deu para confirmar no Palácio: ${r.mensagem}\n\n${urlBase()}${link}`)
    return r.ok ? { feito: paraATela(r.mensagem), link } : { erro: paraATela(r.mensagem), link }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível confirmar.') }
  }
}

/**
 * O "Confirmar" do plano do assistente (lib/whatsapp/assistente/palacio.ts): a conferência do setor antes de tudo;
 * depois, a transição atômica do plano (no_palacio → executando: dois cliques ou duas abas não executam duas vezes),
 * os passos pela sessão e o recibo — na tela, no histórico da confirmação e no WhatsApp de quem pediu. O link só marca
 * o uso (consumirConfirmacao), depois da transição.
 */
async function executarPlanoNoPalacio(supabase: Awaited<ReturnType<typeof createClient>>, c: Confirmacao, quem: QuemConfirma, conferidos: string[]): Promise<ResultadoDaConfirmacao> {
  const admin = createAdminClient()
  const link = linkDaConfirmacao(c)
  const r = await executarPlano({ supabase, admin, c, quem, conferidos })
  if ('erro' in r) return { erro: r.erro }
  const { desfecho } = r
  // O plano já não esperava o Palácio (confirmado em outra aba, cancelado, vencido): nada foi feito agora.
  if (desfecho.tipo === 'nada' || desfecho.tipo === 'no_palacio') return { erro: desfecho.tipo === 'nada' ? desfecho.texto : 'Este plano ainda espera a confirmação.', link }
  await consumirConfirmacao(admin, c.id, quem.userId)
  const feito = desfecho.tipo === 'executado'
  // O recibo já começa por "Feito:", "Feito em parte:" ou "Nada foi feito:".
  await registrarResultado(admin, c.id, paraATela(desfecho.texto))
  const { error } = await admin.from('activity_log').insert({
    workspace_id: c.workspaceId, actor_id: quem.userId, action: feito ? 'whatsapp_confirmado' : 'whatsapp_confirmacao_recusada',
    entity_type: 'whatsapp_confirmacao', entity_id: c.id, metadata: { acao: c.acao, alvo_id: c.alvoId, plano_id: c.alvoId, via: 'assistente', resultado: desfecho.tipo },
  })
  if (error) console.error('[confirmar] histórico do plano não gravado:', error.message)
  // O recibo também vai ao WhatsApp de quem pediu (sem textos de ação: só o que foi feito e os links).
  await avisarResultadoPeloWhatsapp(admin, c.workspaceId, quem.userId, `Confirmado no Palácio.\n\n${desfecho.texto}`)
  return feito ? { feito: paraATela(desfecho.texto), link } : { erro: paraATela(desfecho.texto), link }
}
