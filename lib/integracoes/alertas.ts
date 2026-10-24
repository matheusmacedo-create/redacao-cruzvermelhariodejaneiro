import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { alertaDeIntegracaoSai, alertasResolvidosPelaConexao, textoDoAlertaDeIntegracao, type ConexaoDoGoogle, type IntegracaoAlertada, type MotivoDoAlerta } from './alertas-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O alerta à administração quando uma integração para (as regras e os textos
 * estão em ./alertas-regras.ts): categoria "integracoes", no sino, no e-mail
 * e no WhatsApp dos administradores do espaço, como qualquer aviso de
 * notificar(). Quem chama:
 *
 *  - lib/google/gmail.ts, diretorio.ts e drive.ts: a autorização passou de
 *    "ativa" a "expirada" (só na troca, não a cada leitura que falha), o
 *    cliente OAuth recusado e o Drive sem espaço;
 *  - lib/newsletter/resend.ts: a chave ou o domínio recusados, o Resend fora
 *    do ar ou no limite do plano;
 *  - lib/armazenamento/r2.ts: a gravação que falhou por credencial, bucket ou
 *    R2 fora do ar.
 *
 * O Resend e o R2 são da hospedagem, não do espaço: sem `workspaceId`, o
 * alerta vai ao espaço principal (o de produção).
 *
 * Um alerta por integração a cada 6 h, sem migração: a memória fica em
 * activity_log (entity_type "integracao", sem ator), como os alertas da
 * rotina do WhatsApp (lib/whatsapp/estado.ts), com a mesma ressalva — a
 * leitura ignora data futura, e um membro do espaço ainda consegue gravar um
 * marco com a data de agora e calar o alerta por 6 h. Numa enxurrada de
 * falhas (um lote de e-mails com a chave recusada), a mesma instância do
 * servidor só reconfere a cada RECONFERIR_APOS_MS: o próprio alerta manda
 * e-mail pelo Resend, e a falha dele não pode virar outro alerta.
 *
 * Nunca lança: o alerta é consequência de algo que já falhou.
 */

const MARCO = 'integracao_alertada'
/** A integração voltou (a reconexão que deu certo): encerra o episódio — os avisos dele e a janela de 6 h. */
const MARCO_NORMALIZADA = 'integracao_normalizada'
const RECONFERIR_APOS_MS = 10 * 60_000
const conferidoEm = new Map<string, number>()

async function espacoPrincipal(admin: Admin): Promise<string | null> {
  const { data } = await admin.from('workspaces').select('id, kind').order('created_at').limit(5)
  const lista = (data ?? []) as { id: string; kind: string }[]
  return (lista.find((w) => w.kind === 'production') ?? lista[0])?.id ?? null
}

/** Avisa a administração, se ainda não avisou desta integração nas últimas 6 h. true = o alerta saiu. */
export async function alertarIntegracao(p: { integracao: IntegracaoAlertada; workspaceId?: string | null; conta?: string | null; motivo?: MotivoDoAlerta | null }): Promise<boolean> {
  const chave = `${p.workspaceId ?? '*'}:${p.integracao}`
  const antes = conferidoEm.get(chave)
  if (antes && Date.now() - antes < RECONFERIR_APOS_MS) return false
  conferidoEm.set(chave, Date.now())
  try {
    const admin = createAdminClient()
    const workspaceId = p.workspaceId ?? await espacoPrincipal(admin)
    if (!workspaceId) return false
    const agora = new Date()
    const ultimoMarco = (acao: string) => admin.from('activity_log').select('created_at').eq('workspace_id', workspaceId).eq('entity_type', 'integracao')
      .eq('action', acao).eq('metadata->>servico', p.integracao).lte('created_at', agora.toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    const [{ data: ultimo, error }, { data: normalizada }] = await Promise.all([ultimoMarco(MARCO), ultimoMarco(MARCO_NORMALIZADA)])
    if (error || !alertaDeIntegracaoSai({
      ultimoAlertaEm: (ultimo?.created_at as string | undefined) ?? null, agora, normalizadaEm: (normalizada?.created_at as string | undefined) ?? null,
    })) return false
    // O marco antes do aviso: sem ele, cada falha seguinte alertaria de novo.
    const { error: semMarco } = await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: null, action: MARCO, entity_type: 'integracao', metadata: { servico: p.integracao, motivo: p.motivo ?? null },
    })
    if (semMarco) { console.error('[integracoes] marco do alerta não gravado:', semMarco.message); return false }
    const { data: admins } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin')
    if (!admins?.length) return false
    // Import tardio: notificar() manda e-mail pelo Resend, e o Resend avisa por aqui.
    const { notificar } = await import('@/lib/notificacoes/servidor')
    await notificar(admin, {
      workspaceId, para: admins.map((a) => a.user_id as string), atorId: null, categoria: 'integracoes',
      ...textoDoAlertaDeIntegracao(p.integracao, { conta: p.conta, motivo: p.motivo }),
    })
    return true
  } catch (causa) {
    console.error('[integracoes] alerta não enviado:', causa instanceof Error ? causa.message : causa)
    return false
  }
}

/**
 * A reconexão do Google deu certo (app/api/google/retorno): os alertas que ela resolve (alertasResolvidosPelaConexao)
 * deixam de valer. Os avisos ainda não lidos desses alertas, de todos os administradores, viram lidos — o sino para de
 * mostrar um problema que já passou, e o assistente do WhatsApp para de citá-lo —, e o marco "normalizada" encerra a
 * janela de 6 h: uma falha nova avisa na hora. Só os dos últimos 14 dias. Nunca lança.
 */
export async function encerrarAlertasDaConexao(p: { workspaceId: string; conexao: ConexaoDoGoogle; usouClienteDoGmail: boolean; atorId: string | null }): Promise<number> {
  try {
    const admin = createAdminClient()
    const { integracoes, titulos } = alertasResolvidosPelaConexao(p.conexao, p.usouClienteDoGmail)
    const agora = new Date()
    const { data: lidos } = await admin.from('notifications').update({ read_at: agora.toISOString() })
      .eq('workspace_id', p.workspaceId).eq('categoria', 'integracoes').in('title', titulos).is('read_at', null)
      .gte('created_at', new Date(agora.getTime() - 14 * 86_400_000).toISOString()).select('id')
    await admin.from('activity_log').insert(integracoes.map((servico) => ({
      workspace_id: p.workspaceId, actor_id: p.atorId, action: MARCO_NORMALIZADA, entity_type: 'integracao', metadata: { servico, conexao: p.conexao },
    })))
    return lidos?.length ?? 0
  } catch (causa) {
    console.error('[integracoes] alertas não encerrados:', causa instanceof Error ? causa.message : causa)
    return 0
  }
}

/** Os alertas de integração já encerrados (o marco "normalizada" depois do aviso), para o assistente não citá-los. Nunca lança. */
export async function normalizacoesRecentes(admin: Admin, workspaceId: string, desde: Date): Promise<Map<IntegracaoAlertada, number>> {
  const saida = new Map<IntegracaoAlertada, number>()
  try {
    const { data } = await admin.from('activity_log').select('created_at, metadata').eq('workspace_id', workspaceId).eq('entity_type', 'integracao')
      .eq('action', MARCO_NORMALIZADA).gte('created_at', desde.toISOString()).lte('created_at', new Date().toISOString()).limit(50)
    for (const l of data ?? []) {
      const servico = (l.metadata as { servico?: string } | null)?.servico as IntegracaoAlertada | undefined
      const quando = new Date(l.created_at as string).getTime()
      if (servico && Number.isFinite(quando)) saida.set(servico, Math.max(saida.get(servico) ?? 0, quando))
    }
  } catch { /* sem a leitura, nada é escondido */ }
  return saida
}
