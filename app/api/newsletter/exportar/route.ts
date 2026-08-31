import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { montarCsv, nomeDoArquivo, type LinhaExportada } from '@/lib/newsletter/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Baixa a lista em CSV.
 *
 * É rota, e não ação de servidor, porque o navegador precisa receber um
 * arquivo com nome — uma action devolveria texto para o JavaScript montar o
 * download, o que quebra sem script e complica sem ganho.
 *
 * Exige sessão do espaço. A lista de quem apoia uma instituição humanitária é
 * o dado mais sensível que este sistema guarda: um endereço vazado vira spam,
 * e o conjunto vira um mapa de quem se relaciona com a Cruz Vermelha.
 *
 * O arquivo leva o texto de consentimento e o IP de cada linha de propósito:
 * exportação que perde a prova do aceite devolve à instituição uma lista que
 * ela não consegue mais defender.
 */
export async function GET() {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('newsletter_inscritos')
    .select('email, nome, estado, origem, created_at, confirmado_em, descadastrado_em, consentimento_texto, consentimento_ip')
    .eq('workspace_id', context.workspace.id)
    .order('created_at', { ascending: true })
    // Teto alto, mas teto: sem ele, uma lista grande montaria a resposta
    // inteira em memória dentro da função e a derrubaria sem explicação.
    .limit(50_000)

  if (error) {
    return NextResponse.json({ error: 'Não foi possível montar o arquivo.' }, { status: 500 })
  }

  const csv = montarCsv((data ?? []) as LinhaExportada[])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeDoArquivo()}"`,
      // Lista de pessoas não fica em cache de proxy nenhum.
      'Cache-Control': 'no-store, private',
    },
  })
}
