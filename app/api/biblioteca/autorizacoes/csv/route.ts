import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { paraCsv } from '@/lib/participantes/regras'
import { buscarAutorizacoes, tituloDaColeta } from '@/lib/imagem/consulta'
import { USOS, VINCULOS, ehUso, ehVinculo } from '@/lib/imagem/regras'

export const dynamic = 'force-dynamic'

const quando = (iso: string | null) => iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : ''

/** A planilha do banco de autorizações de imagem, com os filtros da tela. */
export async function GET(request: Request) {
  const context = await requireWorkspace()
  const p = new URL(request.url).searchParams
  const linhas = await buscarAutorizacoes(await createClient(), context.workspace.id, {
    q: p.get('q') ?? '', situacao: p.get('situacao') ?? '', uso: p.get('uso') ?? '', vinculo: p.get('vinculo') ?? '', coleta: p.get('coleta') ?? '',
  }, 5000)
  const csv = paraCsv(
    ['Código', 'Ação (link)', 'Nome', 'Relação', 'Menor', 'Responsável', 'Parentesco', 'Contato', 'Usos autorizados', 'Fotos', 'Assinado em', 'Aparelho', 'IP', 'Versão do termo', 'Hash do documento', 'Situação', 'Revogada em', 'Revogada por', 'Motivo da revogação'],
    linhas.map((l) => [
      l.codigo, tituloDaColeta(l), l.nome, ehVinculo(l.vinculo) ? VINCULOS[l.vinculo] : l.vinculo, l.menor ? 'Sim' : 'Não', l.responsavel_nome, l.responsavel_parentesco, l.contato,
      l.usos.map((u) => (ehUso(u) ? USOS[u].rotulo : u)).join(', '), l.file_ids.length, quando(l.assinado_em), l.aparelho, l.ip, l.termo_versao, l.documento_hash,
      l.revogada_em ? 'Revogada' : 'Válida', quando(l.revogada_em), l.revogada_por === 'titular' ? 'A própria pessoa' : l.revogada_por === 'equipe' ? 'Equipe' : '', l.revogacao_motivo,
    ]),
  )
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="autorizacoes-de-imagem-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
