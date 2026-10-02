import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { VINCULOS, SITUACOES } from '@/lib/participantes/regras'
import { parecerDaVerificacao } from '@/lib/participantes/verificacao/parecer'
import { codigoDoParecer, type ArquivoDoVoluntario, type Referencia, type Verificacao } from '@/lib/participantes/verificacao/regras'

export const dynamic = 'force-dynamic'

/**
 * O parecer da verificação em PDF (nível 2 ou acima). Só de verificação
 * concluída; a geração fica na trilha (auditar_parecer_verificacao). Lê sob
 * o RLS da pessoa logada: quem não vê os documentos de identidade também
 * não os vê listados aqui.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado.', { status: 404 })
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) return new Response('Sem acesso.', { status: 403 })
  const [{ data: p }, { data: v }, { data: arquivos }, { data: referencias }] = await Promise.all([
    supabase.from('participantes').select('nome, nome_social, cpf_mascara, vinculo, situacao, data_nascimento, anonimizado_em').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('participantes_verificacoes').select('id, escopo, estado, link_expira_em, link_enviado_para, termo_aceito_em, enviado_em, itens, documento_lido, sancoes, registro_profissional, parecer, restricoes, motivo, decidido_por, decidido_em, created_at')
      .eq('participante_id', id).eq('estado', 'concluida').order('decidido_em', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('participantes_arquivos').select('id, categoria, lado, data_documento, validade, vence_em, codigo_autenticacao, observacao, nome_original, tipo, tamanho, sha256, pelo_candidato, enviado_por, created_at, excluido_em, motivo_exclusao').eq('participante_id', id).order('created_at'),
    supabase.from('participantes_referencias').select('id, nome, relacao, telefone, email, informado_pelo_candidato, contatado_em, contatado_por_nome, parecer, nota').eq('participante_id', id).order('created_at'),
  ])
  if (!p || p.anonimizado_em) return new Response('Não encontrado.', { status: 404 })
  if (!v) return new Response('A verificação ainda não foi concluída.', { status: 404 })
  const { error } = await supabase.rpc('auditar_parecer_verificacao', { p_participante_id: id })
  if (error) return new Response('Sem acesso.', { status: 403 })
  const { data: quem } = v.decidido_por ? await supabase.from('profiles').select('full_name').eq('id', v.decidido_por).maybeSingle() : { data: null }
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
  const pdf = await parecerDaVerificacao({
    verificacao: v as unknown as Verificacao, arquivos: (arquivos ?? []) as ArquivoDoVoluntario[], referencias: (referencias ?? []) as Referencia[],
    candidato: {
      nome: p.nome as string, nomeSocial: (p.nome_social as string | null) ?? null, cpfMascara: (p.cpf_mascara as string | null) ?? null,
      vinculo: VINCULOS[p.vinculo as keyof typeof VINCULOS]?.rotulo ?? String(p.vinculo), situacao: SITUACOES[p.situacao as keyof typeof SITUACOES]?.rotulo ?? String(p.situacao),
      nascimento: (p.data_nascimento as string | null) ?? null,
    },
    decididoPor: ((quem as { full_name?: string } | null)?.full_name) ?? null,
    geradoPor: (context.profile?.full_name as string | undefined) ?? 'Equipe', geradoEm: agora,
  })
  const codigo = codigoDoParecer(v.id as string, (v.decidido_em as string | null) ?? null)
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="parecer-${codigo}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
