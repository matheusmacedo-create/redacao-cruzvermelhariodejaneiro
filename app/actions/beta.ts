'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { notificar } from '@/lib/notificacoes/servidor'
import { ESTADOS_DO_RETORNO, NOTAS, ROTULO_DO_TIPO, avisaNaHora, lerRetorno, type EstadoDoRetorno } from '@/lib/ajuda/retornos'

/**
 * O beta com a equipe (docs/AJUDA.md §10): mandar a opinião sobre uma tela,
 * votar numa pergunta da ajuda, perguntar à equipe, relatar problema ou
 * sugestão — e, para os administradores, responder. O RLS de ajuda_retornos
 * confere de novo quem manda e quem vê.
 */

type Resultado = { erro?: string; id?: string }
const SEM_MIGRACAO = 'O beta ainda não está ligado no banco (migração 20260929010000). Avise a administração.'
const faltaTabela = (code?: string) => code === '42P01' || code === 'PGRST205'

/** Quem administra o espaço: recebe no sino o que precisa de resposta. */
async function administradores(workspaceId: string): Promise<string[]> {
  const { data } = await createAdminClient().from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin')
  return (data ?? []).map((x) => x.user_id as string)
}

export async function enviarRetorno(bruto: Record<string, unknown>): Promise<Resultado> {
  try {
    const context = await requireWorkspace({ escola: true })
    const lido = lerRetorno(bruto)
    if (!lido.retorno) throw new Error(lido.erro)
    const r = lido.retorno
    const supabase = await createClient()
    const { data, error } = await supabase.from('ajuda_retornos')
      .insert({ ...r, workspace_id: context.workspace.id, autor_id: context.user.id })
      .select('id').single()
    if (error || !data) throw new Error(faltaTabela(error?.code) ? SEM_MIGRACAO : 'Não foi possível enviar agora. Tente de novo.')
    if (avisaNaHora(r)) {
      const nome = context.profile?.full_name?.split(' ')[0] ?? 'Alguém'
      const nota = r.nota ? NOTAS[r.nota - 1] : null
      after(async () => notificar(createAdminClient(), {
        workspaceId: context.workspace.id, para: await administradores(context.workspace.id), atorId: context.user.id, categoria: 'chamados',
        titulo: `Beta: ${ROTULO_DO_TIPO[r.tipo].toLowerCase()} de ${nome}${nota ? ` (${nota.rotulo.toLowerCase()})` : ''}`,
        mensagem: `${r.caminho}${r.texto ? ` — ${r.texto}` : ''}`.slice(0, 280),
        link: `/ajuda/retornos#retorno-${data.id}`, botao: 'Ver o retorno',
      }))
    }
    revalidatePath('/ajuda/retornos')
    return { id: data.id as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar agora. Tente de novo.') }
  }
}

/** "Isso ajudou?": um voto por pessoa e pergunta (votar de novo troca o voto). */
export async function votarPergunta(dados: { pergunta_id: string; area: string | null; caminho: string; util: boolean; texto?: string; contexto?: unknown }): Promise<Resultado> {
  try {
    const context = await requireWorkspace({ escola: true })
    const lido = lerRetorno({ ...dados, tipo: 'pergunta' })
    if (!lido.retorno) throw new Error(lido.erro)
    const supabase = await createClient()
    const { error: e1 } = await supabase.from('ajuda_retornos').delete()
      .eq('workspace_id', context.workspace.id).eq('autor_id', context.user.id).eq('tipo', 'pergunta').eq('pergunta_id', lido.retorno.pergunta_id!)
    if (e1 && faltaTabela(e1.code)) throw new Error(SEM_MIGRACAO)
    return enviarRetorno({ ...lido.retorno })
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o voto.') }
  }
}

/** O administrador muda a situação e, se escrever, responde — quem mandou recebe no sino. */
export async function responderRetorno(id: string, estado: EstadoDoRetorno, resposta: string): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    if (context.role !== 'admin') throw new Error('Só a administração responde os retornos.')
    if (!/^[0-9a-f-]{36}$/.test(id) || !ESTADOS_DO_RETORNO.includes(estado)) throw new Error('Retorno inválido.')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('ajuda_responder_retorno', { p_id: id, p_estado: estado, p_resposta: resposta })
    if (error || !data) throw new Error(error?.code === 'P0001' ? error.message : 'Não foi possível salvar.')
    const r = data as { autor_id: string | null; tipo: keyof typeof ROTULO_DO_TIPO; caminho: string }
    if (resposta.trim() && r.autor_id && r.autor_id !== context.user.id) {
      after(() => notificar(createAdminClient(), {
        workspaceId: context.workspace.id, para: [r.autor_id], atorId: context.user.id, categoria: 'chamados',
        titulo: 'A equipe respondeu o seu retorno do beta',
        mensagem: resposta.trim().slice(0, 280),
        link: `/ajuda#meus-retornos`, botao: 'Ver a resposta',
      }))
    }
    revalidatePath('/ajuda/retornos')
    revalidatePath('/ajuda')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}
