'use server'

import { revalidatePath } from 'next/cache'
import { requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { criarCampanha, esquecerTokenDoAds } from '@/lib/google/ads'
import { idDaCampanha, idDaConta, idDaContaNoPainel, linkDaCampanha, planoPorId } from '@/lib/google/ads-regras'

/**
 * A conexão do Google Ads (lib/google/ads.ts): conectar é a rota /api/google/conectar-ads (o consentimento do Google);
 * aqui ficam escolher a conta de anúncios, conferir e criar a campanha de cada plano (uma por página, o id vem do
 * botão em `plano`), e desconectar. Só quem configura as
 * integrações (integracoes.configurar), conferido na action e não só na tela. A campanha nasce PAUSADA: ligar é no
 * painel do Google Ads, por uma pessoa, depois de olhar.
 */

type Resultado = { erro?: string; recado?: string; link?: string }

const caminho = '/configuracoes/email'

export async function escolherContaDoAds(dados: FormData): Promise<Resultado> {
  try {
    const ctx = await requirePermissao('integracoes.configurar')
    const id = idDaConta(String(dados.get('customer_id') ?? ''))
    if (!id) return { erro: 'Informe o id da conta de anúncios: 10 dígitos, como 123-456-7890.' }
    const admin = createAdminClient()
    const { data: conexao } = await admin.from('google_ads_conexao').select('contas_acessiveis').eq('workspace_id', ctx.workspace.id).maybeSingle()
    if (!conexao) return { erro: 'Conecte o Google Ads antes de escolher a conta.' }
    const acessiveis = (conexao.contas_acessiveis as string[] | null) ?? []
    if (acessiveis.length && !acessiveis.includes(id)) return { erro: `A conta Google conectada não alcança ${idDaContaNoPainel(id)}. As que ela alcança: ${acessiveis.map(idDaContaNoPainel).join(', ')}.` }
    // O registro das campanhas criadas é por conta de anúncios (activity_log): trocar de conta mostra só as da nova.
    const { error } = await admin.from('google_ads_conexao').update({ customer_id: id }).eq('workspace_id', ctx.workspace.id)
    if (error) throw new Error('Não foi possível guardar a conta escolhida.')
    revalidatePath(caminho)
    return { recado: `Conta de anúncios ${idDaContaNoPainel(id)} escolhida.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível escolher a conta.') }
  }
}

/** O mesmo pedido da criação, com validateOnly: o Google confere tudo e não grava nada. */
export async function validarCampanhaDoGrants(dados: FormData): Promise<Resultado> {
  try {
    const ctx = await requirePermissao('integracoes.configurar')
    const plano = planoPorId(String(dados.get('plano') ?? ''))
    if (!plano) return { erro: 'Plano de campanha desconhecido.' }
    const r = await criarCampanha(ctx.workspace.id, { validar: true, planoId: plano.id, atorId: ctx.user.id })
    if (!r.ok) return { erro: r.erro }
    return { recado: `O Google aceitou "${plano.nome}" sem ressalvas. Nada foi criado ainda: toque em "Criar campanha (pausada)" quando quiser.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível validar a campanha.') }
  }
}

export async function criarCampanhaDoGrants(dados: FormData): Promise<Resultado> {
  try {
    const ctx = await requirePermissao('integracoes.configurar')
    const plano = planoPorId(String(dados.get('plano') ?? ''))
    if (!plano) return { erro: 'Plano de campanha desconhecido.' }
    // O registro da campanha (activity_log) é gravado por criarCampanha, junto com a criação.
    const r = await criarCampanha(ctx.workspace.id, { validar: false, planoId: plano.id, atorId: ctx.user.id })
    if (!r.ok) return { erro: r.erro }
    if (r.validada) return { erro: 'O pedido voltou como validação, sem criar. Tente de novo.' }
    const { data: conexao } = await createAdminClient().from('google_ads_conexao').select('customer_id').eq('workspace_id', ctx.workspace.id).maybeSingle()
    const customerId = idDaConta((conexao?.customer_id as string | null) ?? null) ?? ''
    const campanhaId = idDaCampanha(r.recurso) ?? r.campanhaId
    revalidatePath(caminho)
    return {
      recado: r.adotada
        ? `A campanha "${plano.nome}" já estava no Google (a resposta da criação anterior não tinha chegado) e agora está registrada aqui. Nada foi criado de novo. Revise no painel e ative por lá.`
        : `Campanha "${plano.nome}" criada, pausada. Revise no painel do Google Ads (grupos, palavras, anúncios e sitelinks) e ative por lá quando estiver de acordo.`,
      link: customerId ? linkDaCampanha(customerId, campanhaId) : undefined,
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar a campanha.') }
  }
}

export async function desconectarGoogleAds(): Promise<Resultado> {
  try {
    const ctx = await requirePermissao('integracoes.configurar')
    const supabase = await createClient()
    const { error } = await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: ctx.workspace.id, p_servico: 'google_ads' })
    if (error) throw new Error('Não foi possível remover a autorização.')
    esquecerTokenDoAds(ctx.workspace.id)
    const admin = createAdminClient()
    await admin.from('google_ads_conexao').delete().eq('workspace_id', ctx.workspace.id)
    await admin.from('activity_log').insert({
      workspace_id: ctx.workspace.id, actor_id: ctx.user.id, action: 'google_ads_desconectado', entity_type: 'integracao', metadata: {},
    })
    revalidatePath(caminho)
    return {
      recado: 'Google Ads desconectado. As campanhas que já existem continuam como estão no Google; o Palácio só deixa de mexer nelas. '
        + 'Não revogue o acesso em myaccount.google.com/permissions se o e-mail dos setores usa a mesma conta: lá a revogação vale para todas as conexões do Palácio.',
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desconectar.') }
  }
}
