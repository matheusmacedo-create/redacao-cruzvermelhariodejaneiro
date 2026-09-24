import { contextoDaEquipe } from '@/lib/rh/acesso'
import { paraCsv } from '@/lib/participantes/regras'
import { SITUACOES, ehSituacao, ehVinculo, rotuloDoVinculo } from '@/lib/rh/regras'

export const dynamic = 'force-dynamic'

/**
 * A planilha da equipe (CSV para Excel), com os filtros da tela. Só contrato,
 * cargo e contato de trabalho: documentos, salários e banco não saem em
 * planilha. Cada exportação fica na auditoria.
 */
export async function GET(request: Request) {
  const { context, supabase, nivel } = await contextoDaEquipe()
  if (nivel < 2) return new Response('Sem acesso.', { status: 403 })
  const url = new URL(request.url)
  const situacao = url.searchParams.get('situacao')
  const vinculo = url.searchParams.get('vinculo')
  const setor = url.searchParams.get('setor')
  let q = supabase.from('equipe_membros')
    .select('id,nome,nome_social,cargo,setor,vinculo,situacao,gestor_id,admissao,jornada_semanal,horario,local_trabalho,email_trabalho,telefone_trabalho,desligamento')
    .eq('workspace_id', context.workspace.id).order('nome').limit(5000)
  if (situacao && ehSituacao(situacao)) q = q.eq('situacao', situacao)
  else if (situacao !== 'todas') q = q.neq('situacao', 'desligado')
  if (vinculo && ehVinculo(vinculo)) q = q.eq('vinculo', vinculo)
  if (setor) q = q.eq('setor', setor)
  const { data } = await q
  const linhas = data ?? []
  const { data: todos } = await supabase.from('equipe_membros').select('id,nome').eq('workspace_id', context.workspace.id).limit(5000)
  const nome = new Map((todos ?? []).map((m) => [m.id as string, m.nome as string]))
  await supabase.rpc('auditar_exportacao_equipe', { p_workspace_id: context.workspace.id, p_quantidade: linhas.length, p_filtros: { situacao, vinculo, setor } })
  const csv = paraCsv(
    ['Nome', 'Nome social', 'Cargo', 'Setor', 'Vínculo', 'Situação', 'Gestor', 'Admissão', 'Jornada semanal', 'Horário', 'Local', 'E-mail de trabalho', 'Telefone de trabalho', 'Desligamento'],
    linhas.map((m) => [
      m.nome, m.nome_social, m.cargo, m.setor, rotuloDoVinculo(m.vinculo), SITUACOES[m.situacao as keyof typeof SITUACOES]?.rotulo ?? m.situacao,
      m.gestor_id ? nome.get(m.gestor_id) : '', m.admissao, m.jornada_semanal, m.horario, m.local_trabalho, m.email_trabalho, m.telefone_trabalho, m.desligamento,
    ]),
  )
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="equipe-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
