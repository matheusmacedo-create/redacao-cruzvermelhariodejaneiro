import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { configDoWhatsapp, situacaoDaConexao } from '@/lib/whatsapp/servidor'
import { registrarEstado } from '@/lib/whatsapp/estado'
import { processarFila } from '@/lib/whatsapp/fila'
import { concluirEsquecidos } from '@/lib/whatsapp/envio'
import { lembrarFichas } from '@/lib/rh/convites'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Rotina diária do WhatsApp (vercel.json, 10h05 UTC = 7h05 em Brasília):
 * confere se o número do Palácio está conectado (alerta a administração se
 * não estiver) e faz a fila andar — é aqui que saem os avisos que esperaram o
 * fim do horário de silêncio e os reenvios do que falhou de madrugada.
 *
 * Protegida por CRON_SECRET, como /api/notificacoes/resumo.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: espacos } = await admin.from('workspaces').select('id')
  const conexoes: Record<string, string> = {}
  for (const { id } of espacos ?? []) {
    const config = await configDoWhatsapp(id as string)
    if (!config) continue
    const { estado } = await situacaoDaConexao(config)
    conexoes[id as string] = estado
    if (estado !== 'conectando') await registrarEstado(admin, id as string, estado)
  }
  // Fotos mandadas pelo WhatsApp num envio que a pessoa não fechou: vão para a caixa como estão.
  const enviosFechados = await concluirEsquecidos(admin)
  // Ficha da Equipe pedida pelo WhatsApp e ainda não preenchida: lembra (com link novo), no máximo 2 vezes.
  const fichasLembradas = await lembrarFichas(admin)
  const fila = await processarFila(admin, null, { orcamentoMs: 240_000, limite: 200 })
  return Response.json({ ok: true, conexoes, fila, enviosFechados, fichasLembradas })
}
