import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { contaHunter, explicarErroDaHunter, hunterConfigurado } from '@/lib/imprensa/hunter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diz, numa resposta, se o módulo de Imprensa está de pé — mesmo espírito do
 * /api/admin/ia-check: variável cadastrada na Vercel só entra em build novo,
 * e "o botão não aparece" é sintoma que ninguém liga à causa sem isto.
 *
 * Nunca devolve a chave — nem inteira, nem em pedaço. A consulta de saldo não
 * consome cota (a própria Hunter documenta o endpoint /account como gratuito).
 */
export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  if (!hunterConfigurado()) {
    return NextResponse.json({
      configurado: false,
      veredito: 'A chave não chegou a esta versão publicada.',
      oQueFazer: 'Cadastre HUNTER_API_KEY nas variáveis de ambiente da Vercel — nunca com o prefixo NEXT_PUBLIC_ — '
        + 'e republique: variável nova só entra em build novo (Deployments → o mais recente → ⋯ → Redeploy).',
    })
  }

  try {
    const conta = await contaHunter()
    return NextResponse.json({
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
      configurado: true,
      chaveValida: false,
      erro: explicarErroDaHunter(causa),
      veredito: 'A chave chegou, mas a Hunter.io recusou.',
    })
  }
}
