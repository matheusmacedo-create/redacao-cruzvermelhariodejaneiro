import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { obterChave } from '@/lib/integracoes/chaves'
import { contaHunter, explicarErroDaHunter } from '@/lib/imprensa/hunter'

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
  let workspaceId: string
  try { workspaceId = (await requireAdmin()).workspace.id } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  const chave = await obterChave(workspaceId, 'hunter')
  if (!chave) {
    return NextResponse.json({
      configurado: false,
      veredito: 'Nenhuma chave da Hunter.io configurada.',
      oQueFazer: 'Cole a chave em Configurações → Integrações (vale na hora, sem republicar).',
    })
  }

  try {
    const conta = await contaHunter(chave)
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
