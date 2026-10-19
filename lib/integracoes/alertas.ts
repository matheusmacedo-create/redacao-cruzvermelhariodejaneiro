import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { alertaDeIntegracaoSai, textoDoAlertaDeIntegracao, type IntegracaoAlertada, type MotivoDoAlerta } from './alertas-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O alerta à administração quando uma integração para (as regras e os textos
 * estão em ./alertas-regras.ts): categoria "integracoes", no sino, no e-mail
 * e no WhatsApp dos administradores do espaço, como qualquer aviso de
 * notificar(). Quem chama:
 *
 *  - lib/google/gmail.ts e diretorio.ts: a autorização passou de "ativa" a
 *    "expirada" (só na troca, não a cada leitura que falha) e o cliente OAuth
 *    recusado;
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
    const { data: ultimo, error } = await admin.from('activity_log').select('created_at').eq('workspace_id', workspaceId).eq('entity_type', 'integracao')
      .eq('action', MARCO).eq('metadata->>servico', p.integracao).lte('created_at', agora.toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !alertaDeIntegracaoSai({ ultimoAlertaEm: (ultimo?.created_at as string | undefined) ?? null, agora })) return false
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
