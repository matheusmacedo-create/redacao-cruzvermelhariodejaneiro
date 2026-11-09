import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { obterChave } from '@/lib/integracoes/chaves'
import { contaHunter, explicarErroDaHunter } from '@/lib/imprensa/hunter'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diz, numa resposta, se o módulo de Imprensa está de pé — mesmo espírito do
 * /api/admin/ia-check: variável cadastrada na Vercel só entra em build novo,
 * e "o botão não aparece" é sintoma que ninguém liga à causa sem isto.
 *
 * Nunca devolve a chave — nem inteira, nem em pedaço. A consulta de saldo não
 * consome cota (a própria Hunter documenta o endpoint /account como gratuito).
 *
 * `envio` diz se a fila das campanhas e o webhook do Resend têm o que precisam
 * (ARQUITETURA §7.39): só sim ou não por variável, e a data do último evento
 * que o webhook gravou — a prova de que ele funciona de ponta a ponta.
 */
async function situacaoDoEnvio(workspaceId: string) {
  const webhook = Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim())
  const relogio = Boolean(process.env.CRON_SECRET?.trim())
  const email = emailConfigurado()
  let ultimaEntregaConfirmada: string | null = null
  try {
    const { data } = await (await createClient()).from('press_campanha_destinatarios')
      .select('entregue_em').eq('workspace_id', workspaceId).not('entregue_em', 'is', null)
      .order('entregue_em', { ascending: false }).limit(1).maybeSingle()
    ultimaEntregaConfirmada = data?.entregue_em ?? null
  } catch { /* antes da migração 20261109120000 a coluna não existe: fica nulo */ }
  const oQueFalta = [
    ...(email ? [] : ['Falta RESEND_API_KEY: nenhuma campanha sai.']),
    ...(webhook ? [] : ['Falta RESEND_WEBHOOK_SECRET: devolução e denúncia de spam não chegam ao Palácio. Crie o webhook no painel do Resend para /api/webhooks/resend e cadastre o segredo de assinatura na Vercel.']),
    ...(relogio ? [] : ['Falta CRON_SECRET: campanha agendada não sai, e campanha grande para no meio.']),
    ...(webhook && !ultimaEntregaConfirmada ? ['O webhook ainda não gravou nenhuma entrega. Depois da próxima campanha, se continuar assim, confira o endereço e os eventos do webhook no painel do Resend.'] : []),
  ]
  return { emailConfigurado: email, webhookDoResend: webhook, segredoDoRelogio: relogio, ultimaEntregaConfirmada, oQueFalta }
}

export async function GET() {
  let workspaceId: string
  try { workspaceId = (await requirePermissao('diagnosticos.executar')).workspace.id } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  const envio = await situacaoDoEnvio(workspaceId)
  const chave = await obterChave(workspaceId, 'hunter')
  if (!chave) {
    return NextResponse.json({
      envio,
      configurado: false,
      veredito: 'Nenhuma chave da Hunter.io configurada.',
      oQueFazer: 'Cole a chave em Configurações → Integrações (vale na hora, sem republicar).',
    })
  }

  try {
    const conta = await contaHunter(chave)
    return NextResponse.json({
      envio,
      configurado: true,
      chaveValida: true,
      email: conta.email,
      plano: conta.plano,
      buscas: conta.buscas,
      verificacoes: conta.verificacoes,
      veredito: `Chave válida, conta ${conta.email || '(sem e-mail na resposta)'}, plano ${conta.plano || '(desconhecido)'}.`,
    })
  } catch (causa) {
    return NextResponse.json({
      envio,
      configurado: true,
      chaveValida: false,
      erro: explicarErroDaHunter(causa),
      veredito: 'A chave chegou, mas a Hunter.io recusou.',
    })
  }
}
