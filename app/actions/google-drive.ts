'use server'

import { revalidatePath } from 'next/cache'
import { requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { esquecerTokenDoDrive } from '@/lib/google/drive'

/**
 * A conexão do Google Drive (lib/google/drive.ts): conectar é a rota /api/google/conectar-drive (o consentimento do
 * Google); desconectar é aqui. Só quem configura as integrações (integracoes.configurar), conferido na action e não
 * só na tela. Desconectar tira a autorização do cofre e a linha da conexão: a cópia dos envios e o guardar pelo
 * WhatsApp param, e os arquivos que já estão no Drive continuam lá.
 */

type Resultado = { erro?: string; recado?: string }

export async function desconectarGoogleDrive(): Promise<Resultado> {
  try {
    const ctx = await requirePermissao('integracoes.configurar')
    const supabase = await createClient()
    const { error } = await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: ctx.workspace.id, p_servico: 'google_drive' })
    if (error) throw new Error('Não foi possível remover a autorização.')
    esquecerTokenDoDrive(ctx.workspace.id)
    const admin = createAdminClient()
    await admin.from('google_drive_conexao').delete().eq('workspace_id', ctx.workspace.id)
    await admin.from('activity_log').insert({
      workspace_id: ctx.workspace.id, actor_id: ctx.user.id, action: 'google_drive_desconectado', entity_type: 'integracao', metadata: {},
    })
    revalidatePath('/configuracoes/email')
    return {
      recado: 'Google Drive desconectado. A cópia dos envios e o guardar pelo WhatsApp param até reconectar; os arquivos que já estão no Drive continuam lá. '
        + 'Não revogue o acesso em myaccount.google.com/permissions se o e-mail dos setores usa a mesma conta: lá a revogação vale para todas as conexões do Palácio.',
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desconectar.') }
  }
}
