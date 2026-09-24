'use server'

import { revalidatePath } from 'next/cache'
import { obterWorkspace, requirePermissao } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { ehPapel, PAPEIS, PAPEL } from '@/lib/permissoes'

/**
 * Verificação em duas etapas (app autenticador).
 *
 * Cadastrar, confirmar e remover o PRÓPRIO app acontece no navegador, direto
 * com o Supabase Auth (`auth.mfa.*`): o segredo do QR Code nunca passa por
 * este servidor. Aqui ficam só o registro disso na auditoria e o que é de
 * administrador — tirar o app de quem perdeu o celular e decidir que papéis
 * são obrigados a usar.
 */

type Resultado = { erro?: string; recado?: string }

async function fatoresVerificados(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId })
  if (error) throw new Error('Não foi possível consultar a verificação em duas etapas.')
  return (data?.factors ?? []).filter((f) => f.status === 'verified')
}

/**
 * A própria pessoa avisa que ativou ou removeu um aparelho. O servidor não
 * acredita no aviso: confere no Auth quantos aparelhos existem de fato e é
 * isso que vai para a auditoria.
 */
export async function registrarMudancaNaVerificacao(acao: 'ativada' | 'removida'): Promise<Resultado> {
  try {
    if (acao !== 'ativada' && acao !== 'removida') throw new Error('Ação desconhecida.')
    const context = await obterWorkspace()
    if (!context) throw new Error('Sessão expirada. Entre de novo.')
    const admin = createAdminClient()
    const fatores = await fatoresVerificados(admin, context.user.id)
    const { error } = await admin.from('auditoria_de_acesso').insert({
      workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: context.user.id,
      acao: acao === 'ativada' ? 'verificacao_ativada' : 'verificacao_removida',
      detalhes: { aparelhos: fatores.length },
    })
    if (error) console.error('[verificacao] auditoria não gravada:', error.message)
    revalidatePath('/perfil')
    revalidatePath('/usuarios')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a mudança.') }
  }
}

/**
 * Administrador tira o app autenticador de alguém — o caso de quem perdeu ou
 * trocou de celular. As sessões abertas caem junto: se o celular foi
 * perdido, quem estiver com ele não deve continuar dentro.
 */
export async function removerVerificacaoDoUsuario(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('usuarios.gerenciar')
    const userId = String(formData.get('userId') ?? '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Usuário não encontrado.')
    if (userId === context.user.id) throw new Error('Para os seus aparelhos, use Meu perfil → Segurança.')

    const admin = createAdminClient()
    const { data: vinculo } = await admin.from('workspace_members')
      .select('user_id, profiles(full_name)').eq('workspace_id', context.workspace.id).eq('user_id', userId).maybeSingle()
    if (!vinculo) throw new Error('Usuário não encontrado neste espaço.')
    const nome = ((Array.isArray(vinculo.profiles) ? vinculo.profiles[0] : vinculo.profiles) as { full_name?: string } | null)?.full_name ?? 'A pessoa'

    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId })
    if (error) throw new Error('Não foi possível consultar a verificação em duas etapas.')
    const fatores = data?.factors ?? []
    if (!fatores.length) return { recado: `${nome} não tinha verificação em duas etapas.` }
    for (const f of fatores) {
      const { error: erroApagar } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId })
      if (erroApagar) throw new Error('Não foi possível remover um dos aparelhos. Tente de novo.')
    }
    const { error: erroSessoes } = await admin.rpc('encerrar_sessoes_do_usuario', { p_user_id: userId })
    if (erroSessoes) console.error('[verificacao] sessões não encerradas:', erroSessoes.message)

    await admin.from('auditoria_de_acesso').insert({
      workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: userId,
      acao: 'verificacao_removida_pelo_admin', detalhes: { aparelhos: fatores.length, sessoes_encerradas: !erroSessoes },
    })
    revalidatePath('/usuarios')
    return { recado: `Verificação em duas etapas de ${nome} removida. As sessões abertas foram encerradas; no próximo acesso, a pessoa cadastra o app no aparelho novo.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover a verificação.') }
  }
}

/** Quais papéis são obrigados a usar o app. Vazio = opcional para todos. */
export async function definirVerificacaoObrigatoria(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('usuarios.gerenciar')
    const escolhidos = [...new Set(formData.getAll('papeis').map(String))]
    if (!escolhidos.every(ehPapel)) throw new Error('Papel desconhecido.')
    const papeis = PAPEIS.filter((p) => escolhidos.includes(p))

    const admin = createAdminClient()
    const { data: atual } = await admin.from('workspaces').select('mfa_obrigatorio_para').eq('id', context.workspace.id).single()
    const antes = (atual?.mfa_obrigatorio_para ?? []) as string[]
    const { error } = await admin.from('workspaces').update({ mfa_obrigatorio_para: papeis }).eq('id', context.workspace.id)
    if (error) throw new Error('Não foi possível salvar a exigência.')

    await admin.from('auditoria_de_acesso').insert({
      workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: null,
      acao: 'verificacao_exigencia_alterada', detalhes: { de: antes, para: papeis },
    })
    revalidatePath('/', 'layout')
    return {
      recado: papeis.length
        ? `Verificação em duas etapas obrigatória para: ${papeis.map((p) => PAPEL[p].rotulo.toLowerCase()).join(', ')}. Quem ainda não cadastrou será levado a cadastrar no próximo acesso.`
        : 'Verificação em duas etapas opcional para todos.',
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a exigência.') }
  }
}
