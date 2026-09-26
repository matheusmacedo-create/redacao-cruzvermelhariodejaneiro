import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { paraCsv } from '@/lib/participantes/regras'
import { lerRespostas, respostaLegivel, type Pergunta } from '@/lib/oportunidades/perguntas'
import { todasAsLinhas } from '@/lib/supabase/paginar'

export const dynamic = 'force-dynamic'

/**
 * As respostas de uma oportunidade em planilha (CSV para Excel): uma linha
 * por pessoa, uma coluna por pergunta; no quiz, nota e resultado. Só nome e
 * e-mail do voluntário — nada de CPF ou saúde. Nível "gerenciar".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrada.', { status: 404 })
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) return new Response('Sem acesso.', { status: 403 })
  const [{ data: o }, { data: perguntas }, { data: respostas }] = await Promise.all([
    supabase.from('oportunidades').select('titulo,tipo').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('oportunidade_perguntas').select('id,enunciado,tipo,alternativas').eq('oportunidade_id', id).order('ordem').order('id'),
    todasAsLinhas((de, ate) => supabase.from('oportunidade_respostas').select('respostas,nota,aprovado,tentativas,atualizado_em,participantes(nome,nome_social,email)')
      .eq('oportunidade_id', id).order('atualizado_em').order('id').range(de, ate)),
  ])
  if (!o) return new Response('Não encontrada.', { status: 404 })
  const lista = (perguntas ?? []).map((p) => ({ ...p, alternativas: (p.alternativas ?? []) as string[] })) as (Pick<Pergunta, 'enunciado' | 'tipo' | 'alternativas'> & { id: string })[]
  const quiz = o.tipo === 'quiz'
  const dataHora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
  const csv = paraCsv(
    ['Nome', 'E-mail', 'Respondido em', ...(quiz ? ['Nota', 'Resultado', 'Tentativas'] : []), ...lista.map((p) => p.enunciado)],
    (respostas ?? []).map((r) => {
      const p = (Array.isArray(r.participantes) ? r.participantes[0] : r.participantes) as { nome: string; nome_social: string | null; email: string | null } | null
      const rs = lerRespostas(r.respostas)
      return [
        p?.nome_social || p?.nome, p?.email, dataHora(r.atualizado_em as string),
        ...(quiz ? [r.nota as number | null, r.aprovado ? 'Aprovado' : 'Não aprovado', r.tentativas as number] : []),
        ...lista.map((q) => respostaLegivel(q, rs.find((x) => x.p === q.id))),
      ]
    }),
  )
  const nome = String(o.titulo).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() || 'respostas'
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="respostas-${nome}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
