import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ROTULO_DO_ESTADO, ROTULO_DO_TIPO, contextoLegivel, lerContexto, type EstadoDoRetorno, type TipoDeRetorno } from '@/lib/ajuda/retornos'

export const dynamic = 'force-dynamic'

const celula = (v: unknown) => {
  const t = String(v ?? '').replace(/\r?\n/g, ' ')
  // Fórmula no começo vira texto (evita executar algo ao abrir no Excel).
  const seguro = /^[=+\-@]/.test(t) ? `'${t}` : t
  return /[";,]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

/** A planilha dos retornos do beta (últimos 365 dias), só para a administração. */
export async function GET() {
  const context = await obterWorkspace()
  if (!context || context.role !== 'admin') return new Response('Não autorizado.', { status: 403 })
  const supabase = await createClient()
  const { data, error } = await supabase.from('ajuda_retornos')
    .select('created_at,tipo,caminho,area,pergunta_id,nota,util,texto,contexto,estado,resposta,autor_id')
    .eq('workspace_id', context.workspace.id).gte('created_at', new Date(Date.now() - 365 * 86400000).toISOString())
    .order('created_at', { ascending: false }).limit(10000)
  if (error) return new Response('Não foi possível ler os retornos.', { status: 500 })
  const ids = [...new Set((data ?? []).map((r) => r.autor_id).filter(Boolean))] as string[]
  const { data: perfis } = ids.length ? await supabase.from('profiles').select('id,full_name').in('id', ids) : { data: [] as { id: string; full_name: string }[] }
  const nomeDe = new Map((perfis ?? []).map((p) => [p.id as string, p.full_name as string]))
  const linhas = [['Quando', 'Pessoa', 'Tipo', 'Tela', 'Pergunta da ajuda', 'Nota', 'Ajudou?', 'Texto', 'Aparelho', 'Situação', 'Resposta']]
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    linhas.push([
      new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(r.created_at as string)),
      nomeDe.get(String(r.autor_id ?? '')) ?? '', ROTULO_DO_TIPO[r.tipo as TipoDeRetorno] ?? String(r.tipo), String(r.caminho ?? ''),
      r.pergunta_id ? `${r.area ?? ''}#${r.pergunta_id}` : '', r.nota == null ? '' : String(r.nota), r.util == null ? '' : r.util ? 'sim' : 'não',
      String(r.texto ?? ''), contextoLegivel(lerContexto(r.contexto)), ROTULO_DO_ESTADO[r.estado as EstadoDoRetorno] ?? '', String(r.resposta ?? ''),
    ])
  }
  const csv = '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n')
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="retornos-do-beta.csv"', 'cache-control': 'no-store' } })
}
