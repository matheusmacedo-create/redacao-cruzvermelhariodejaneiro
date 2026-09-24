import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { paraCsv, SITUACOES, VINCULOS, ehSituacao, ehVinculo } from '@/lib/participantes/regras'

export const dynamic = 'force-dynamic'

/**
 * A planilha do cadastro (CSV para Excel), com os filtros da tela. Sem CPF
 * e sem saúde: dado sensível não sai em planilha. Cada exportação fica na
 * auditoria.
 */
export async function GET(request: Request) {
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) return new Response('Sem acesso.', { status: 403 })
  const url = new URL(request.url)
  const situacao = url.searchParams.get('situacao')
  const vinculo = url.searchParams.get('vinculo')
  const setor = url.searchParams.get('setor')
  const linhas = []
  for (let de = 0; de < 20000; de += 1000) {
    let q = supabase.from('participantes')
      .select('nome,nome_social,vinculo,situacao,setores,funcao,email,telefone,data_nascimento,cidade,uf,habilidades,disponibilidade,created_at')
      .eq('workspace_id', context.workspace.id).is('anonimizado_em', null).order('nome').range(de, de + 999)
    if (situacao && ehSituacao(situacao)) q = q.eq('situacao', situacao)
    if (vinculo && ehVinculo(vinculo)) q = q.eq('vinculo', vinculo)
    if (setor) q = q.contains('setores', [setor])
    const { data } = await q
    linhas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  await supabase.rpc('auditar_exportacao_participantes', { p_workspace_id: context.workspace.id, p_quantidade: linhas.length, p_filtros: { situacao, vinculo, setor } })
  const csv = paraCsv(
    ['Nome', 'Nome social', 'Vínculo', 'Situação', 'Setores', 'Função', 'E-mail', 'Telefone', 'Nascimento', 'Cidade', 'UF', 'Habilidades', 'Disponibilidade', 'Cadastrado em'],
    linhas.map((p) => [
      p.nome, p.nome_social, VINCULOS[p.vinculo as keyof typeof VINCULOS]?.rotulo ?? p.vinculo, SITUACOES[p.situacao as keyof typeof SITUACOES]?.rotulo ?? p.situacao,
      (p.setores ?? []).join(', '), p.funcao, p.email, p.telefone, p.data_nascimento, p.cidade, p.uf,
      (p.habilidades ?? []).join(', '), (p.disponibilidade ?? []).join(', '), String(p.created_at).slice(0, 10),
    ]),
  )
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="voluntariado-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
