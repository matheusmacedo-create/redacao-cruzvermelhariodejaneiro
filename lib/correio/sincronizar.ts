import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarAliases } from '@/lib/google/gmail'

/**
 * Traz a lista "enviar como" do Gmail para as caixas da Redação.
 *
 * Endereço e assinatura vêm SEMPRE do Gmail — é o que garante que cada
 * setor sai com a assinatura exata que está configurada lá. O setor de cada
 * caixa e se ela está ativa são decisões da Redação e não são tocados aqui.
 * Alias que sumiu do Gmail (ou perdeu a verificação) fica marcado e não
 * envia mais, sem apagar o histórico.
 */
export async function sincronizarCaixas(workspaceId: string): Promise<{ total: number; novas: number; fora: number }> {
  const aliases = (await listarAliases(workspaceId)).filter((a) => a.verificado)
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const { data: existentes } = await admin.from('caixas_de_email').select('id, email').eq('workspace_id', workspaceId)
  const porEmail = new Map((existentes ?? []).map((c) => [String(c.email).toLowerCase(), c.id as string]))

  let novas = 0
  for (const a of aliases) {
    const dados = {
      nome_exibicao: a.nome, assinatura_html: a.assinatura, responder_para: a.responderPara,
      principal: a.principal, no_gmail: true, sincronizada_em: agora,
    }
    const id = porEmail.get(a.email)
    if (id) {
      await admin.from('caixas_de_email').update(dados).eq('id', id)
    } else {
      // Caixa nova nasce inativa e sem setor: ninguém envia por ela até um
      // administrador decidir de quem ela é.
      await admin.from('caixas_de_email').insert({ ...dados, workspace_id: workspaceId, email: a.email, ativa: false })
      novas++
    }
  }

  const noGmail = new Set(aliases.map((a) => a.email))
  const sumiram = (existentes ?? []).filter((c) => !noGmail.has(String(c.email).toLowerCase())).map((c) => c.id as string)
  if (sumiram.length) await admin.from('caixas_de_email').update({ no_gmail: false, sincronizada_em: agora }).in('id', sumiram)

  await admin.from('google_conexao').update({ sincronizada_em: agora }).eq('workspace_id', workspaceId)
  return { total: aliases.length, novas, fora: sumiram.length }
}
