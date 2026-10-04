'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { lerPixelId } from '@/lib/escola/conversoes'
import { enviarEventoDeTeste, testarPixel, tokenDasConversoes } from '@/lib/escola/conversoes-servidor'
import { obterChave } from '@/lib/integracoes/chaves'

/**
 * O pixel da Meta ligado aos pagamentos da Escola (API de Conversões). Ligar,
 * trocar o token e desligar é de admin (o banco confere de novo); o evento de
 * teste, de quem trabalha no marketing. O token nunca volta na resposta.
 */

type Estado = { erro?: string; recado?: string; ok?: number }

const revalidar = () => { for (const c of ['/escola/configuracoes', '/escola/vendas/transacoes', '/configuracoes']) revalidatePath(c) }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** As contas da Únicopag marcadas para mandar as vendas à Meta: só ids no formato uuid, sem repetição. O banco confere se são do espaço. */
function lerContas(formData: FormData): string[] {
  const ids = formData.getAll('contas').filter((v): v is string => typeof v === 'string').map((v) => v.trim().toLowerCase())
  return [...new Set(ids.filter((v) => UUID.test(v)))]
}

const MIGRACAO_PENDENTE = 'Aplique a migração 20261004170000 antes de ligar o pixel: sem ela, as contas marcadas não ficam guardadas.'

function erroDoBanco(error: { code?: string; message?: string } | null, padrao: string): never {
  throw new Error(error?.code === 'P0001' && error.message ? error.message : padrao)
}

/** Liga (ou muda) o pixel. O token é testado contra o pixel antes de ir para o cofre; sem token novo, testa com o que já está guardado. */
export async function ligarConversoes(_anterior: Estado, formData: FormData): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 3) throw new Error('Só um admin liga o pixel da Meta.')
    // Sem a coluna `contas` (migração 20261004170000), o banco ignoraria as contas marcadas e gravaria o pixel ligado: recusa antes.
    const { error: semContas } = await supabase.from('escola_conversoes').select('contas').eq('workspace_id', context.workspace.id).limit(1)
    if (semContas) throw new Error(MIGRACAO_PENDENTE)
    const pixel = lerPixelId(String(formData.get('pixel_id') ?? ''))
    if (!pixel) throw new Error('O ID do pixel (conjunto de dados) é um número. Ele aparece no Gerenciador de Eventos, abaixo do nome.')
    const ativa = formData.get('ativa') !== 'nao'
    const contas = lerContas(formData)
    if (ativa && !contas.length) throw new Error('Marque ao menos uma conta da Únicopag para enviar à Meta.')
    const token = String(formData.get('token') ?? '').trim()
    if (token && (token.length < 40 || /\s/.test(token))) throw new Error('O token parece incompleto. Cole o token inteiro, sem espaços.')
    const usar = token || (await tokenDasConversoes(context.workspace.id))
    if (!usar) throw new Error('Cole o token da API de Conversões (Gerenciador de Eventos → Configurações → Gerar token de acesso).')
    const teste = await testarPixel(usar, pixel)
    if ('erro' in teste) throw new Error(teste.erro)
    const pagina = String(formData.get('pagina_padrao') ?? '').trim().slice(0, 500)
    if (pagina && !/^https:\/\/[^\s]+$/.test(pagina)) throw new Error('A página padrão precisa começar com https://.')
    const { error } = await supabase.rpc('escola_conversoes_salvar', { p_workspace_id: context.workspace.id, p: { pixel_id: pixel, pagina_padrao: pagina, ativa, contas } })
    if (error) erroDoBanco(error, 'Não foi possível ligar o pixel.')
    if (token) {
      const { error: e2 } = await supabase.rpc('definir_chave_de_integracao', { p_workspace_id: context.workspace.id, p_servico: 'meta_conversoes', p_valor: token })
      if (e2) throw new Error('O pixel foi ligado, mas não foi possível guardar o token no cofre. Tente de novo.')
      await createAdminClient().from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'integracao_chave_definida', entity_type: 'integracao', metadata: { servico: 'meta_conversoes' } })
    }
    revalidar()
    return { ok: Date.now(), recado: `Pixel “${teste.nome}” ligado. A partir da próxima leitura das transações, cada venda paga das contas marcadas vira um evento Purchase.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ligar o pixel.') }
  }
}

export async function desligarConversoes(): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 3) throw new Error('Só um admin desliga o pixel da Meta.')
    const { error } = await supabase.rpc('escola_conversoes_excluir', { p_workspace_id: context.workspace.id })
    if (error) erroDoBanco(error, 'Não foi possível desligar.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desligar.') }
  }
}

/** Manda um Purchase de teste com o código de "Testar eventos" do Gerenciador: a Meta mostra na hora se o caminho funciona. */
export async function testarEventoDaMeta(_anterior: Estado, formData: FormData): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    const codigo = String(formData.get('codigo') ?? '').trim().toUpperCase()
    if (!/^TEST[0-9]{3,12}$/.test(codigo)) throw new Error('O código de teste é como TEST12345: está em Gerenciador de Eventos → Testar eventos.')
    const { data: cfg } = await supabase.from('escola_conversoes').select('pixel_id,pagina_padrao').eq('workspace_id', context.workspace.id).maybeSingle()
    if (!cfg) throw new Error('Ligue o pixel antes de testar.')
    const token = await tokenDasConversoes(context.workspace.id)
    if (!token) throw new Error('Sem token da API de Conversões no cofre.')
    const r = await enviarEventoDeTeste(token, cfg.pixel_id as string, codigo, (cfg.pagina_padrao as string | null) ?? null)
    if ('erro' in r) throw new Error(r.erro)
    return { ok: Date.now(), recado: r.recebidos ? `A Meta recebeu o evento de teste. Veja em Testar eventos: um Purchase de R$ 1,00 com content_category “taxa_de_inscricao”.` : 'A Meta respondeu, mas não contou o evento. Confira o código de teste.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar o evento de teste.') }
  }
}

/** Para a tela: há token da API de Conversões (no cofre ou no ambiente)? E o do Meta Ads, que serve de reserva? */
export async function situacaoDoToken(workspaceId: string): Promise<{ proprio: boolean; reserva: boolean }> {
  return { proprio: Boolean(await obterChave(workspaceId, 'meta_conversoes')), reserva: Boolean(await obterChave(workspaceId, 'meta_ads')) }
}
