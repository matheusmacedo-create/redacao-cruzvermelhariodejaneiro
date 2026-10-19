import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { configDoWhatsapp, situacaoDaConexao, situacaoDoWebhook } from '@/lib/whatsapp/servidor'
import { conferirFalhasSemModelo, conferirWebhook, falhasRecentes, registrarEstado, registrarRotina } from '@/lib/whatsapp/estado'
import { falhasSemModelo } from '@/lib/whatsapp/regras'
import { processarFila } from '@/lib/whatsapp/fila'
import { concluirEsquecidos } from '@/lib/whatsapp/envio'
import { copiarEnviosPendentes } from '@/lib/whatsapp/drive'
import { lembrarFichas } from '@/lib/rh/convites'
import { rotinaDoAssistente } from '@/lib/whatsapp/assistente/rotina'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Rotina diária do WhatsApp (vercel.json, 10h05 UTC = 7h05 em Brasília):
 * confere se o número do Palácio está conectado, se o recebimento (webhook)
 * continua ligado para cá e se as falhas por falta de modelo passaram do
 * limite nas últimas 24 h — e alerta a administração no sino e no e-mail,
 * uma vez por episódio (lib/whatsapp/estado.ts). Depois faz a fila andar — é
 * aqui que saem os avisos que esperaram o fim do horário de silêncio e os
 * reenvios do que falhou de madrugada. No fim, registra a execução em cada
 * espaço (é a "Rotina diária" do comando "status"). O assistente do WhatsApp
 * tem a parte dele: apaga o que venceu e avisa a administração do que pede
 * atenção nas últimas 24 h (lib/whatsapp/assistente/rotina.ts). E a cópia dos
 * envios no Google Drive que não terminou é retomada (lib/whatsapp/drive.ts).
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
  const recebimento: Record<string, string> = {}
  const semModelo: Record<string, number | null> = {}
  const alertas: Record<string, string[]> = {}
  const conferidos: { workspaceId: string; detalhes: Record<string, unknown> }[] = []
  for (const { id } of espacos ?? []) {
    const workspaceId = id as string
    const config = await configDoWhatsapp(workspaceId)
    if (!config) continue
    const [{ estado }, webhook] = await Promise.all([situacaoDaConexao(config), situacaoDoWebhook(config, workspaceId)])
    conexoes[workspaceId] = estado
    recebimento[workspaceId] = webhook
    if (estado !== 'conectando') await registrarEstado(admin, workspaceId, estado)
    // Desligado ou com outro endereço, o bot fica mudo sem ninguém perceber: alerta (nunca pelo WhatsApp).
    const doWebhook = await conferirWebhook(admin, workspaceId, webhook)
    // Muitas falhas por fora da janela ou recusa do modelo: falta configurar os modelos aprovados.
    // A resposta do bot fora da janela não conta: ela nunca vai por modelo (falhasSemModelo olha o tipo).
    const falhas = await falhasRecentes(admin, workspaceId)
    const quantas = falhas ? falhasSemModelo(falhas.falhas) : null
    semModelo[workspaceId] = quantas
    const dosModelos = quantas === null ? null : await conferirFalhasSemModelo(admin, workspaceId, quantas)
    alertas[workspaceId] = [doWebhook ? `recebimento_${doWebhook}` : null, dosModelos ? `modelos_${dosModelos}` : null].filter((a): a is string => a !== null)
    conferidos.push({ workspaceId, detalhes: { estado, webhook, falhasSemModelo: quantas } })
  }
  // Fotos mandadas pelo WhatsApp num envio que a pessoa não fechou: vão para a caixa como estão.
  const enviosFechados = await concluirEsquecidos(admin)
  // A cópia no Google Drive que caiu no meio (ou esperou o Drive voltar): retomada aqui, sem duplicar arquivo.
  const enviosNoDrive = await copiarEnviosPendentes(admin)
  // Ficha da Equipe pedida pelo WhatsApp e ainda não preenchida: lembra (com link novo), no máximo 2 vezes.
  const fichasLembradas = await lembrarFichas(admin)
  const fila = await processarFila(admin, null, { orcamentoMs: 240_000, limite: 200 })
  // O assistente: limpeza (memória, planos e uso vencidos) e os alertas das últimas 24 h.
  const assistente = await rotinaDoAssistente(admin)
  await registrarRotina(admin, conferidos)
  return Response.json({ ok: true, conexoes, recebimento, semModelo, alertas, fila, enviosFechados, enviosNoDrive, fichasLembradas, assistente })
}
