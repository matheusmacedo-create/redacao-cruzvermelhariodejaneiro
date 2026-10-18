import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ALERTA_A_CADA_HORAS, FALHAS_SEM_MODELO_PARA_ALERTAR, decidirAlerta, type EstadoDaConexao, type EstadoDoWebhook, type FalhaDeEnvio } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O estado da conexão do WhatsApp do Palácio, e o alerta à administração
 * quando ele cai ou volta.
 *
 * Se a chave da Kapso for recusada, os créditos acabarem ou o número sair da
 * conta, os avisos param em silêncio. Quem descobre isso primeiro é o
 * Palácio — por um envio que falhou ou pela checagem diária (/api/whatsapp/rotina) — e é daqui que sai o aviso no sino
 * e no e-mail dos administradores. Nunca pelo WhatsApp: é justamente o que
 * caiu (categoria "sistema", fora do WhatsApp em lib/whatsapp/regras.ts).
 *
 * A checagem diária também confere o recebimento (o webhook na Kapso: sem
 * ele, o bot fica mudo e o código mandado ao Palácio não confirma ninguém) e
 * as falhas por falta de modelo nas últimas 24 h. Esses dois alertas seguem a
 * regra do de queda — uma vez por episódio, nunca de novo antes de
 * ALERTA_A_CADA_HORAS — e, sem migração, guardam a memória em activity_log
 * (os marcos abaixo), onde a tela de conexão já registra "recebimento ligado".
 *
 * Nunca lança. Antes da migração da fila, a tabela não existe e nada acontece.
 */

const FORA: EstadoDaConexao[] = ['desconectado', 'sem_instancia', 'erro']

const TEXTO_DA_QUEDA: Record<string, string> = {
  desconectado: 'O número do Palácio saiu do WhatsApp (desconectado). Os avisos por WhatsApp estão parados até reconectar no painel da Kapso.',
  sem_instancia: 'A Kapso não acha mais o número do WhatsApp (confira o Phone number ID em Integrações). Os avisos por WhatsApp estão parados.',
  erro: 'O Palácio não consegue falar com a Kapso (chave recusada, sem créditos ou a Kapso fora do ar). Os avisos por WhatsApp estão parados e ficam na fila até voltar.',
}

export async function registrarEstado(admin: Admin, workspaceId: string, estado: EstadoDaConexao): Promise<void> {
  try {
    const agora = new Date()
    const { data: atual, error } = await admin.from('whatsapp_estado').select('estado, desde, alertado_em').eq('workspace_id', workspaceId).maybeSingle()
    if (error) return
    if (atual?.estado === estado) {
      await admin.from('whatsapp_estado').update({ verificado_em: agora.toISOString() }).eq('workspace_id', workspaceId)
      return
    }
    const caiu = FORA.includes(estado) && (!atual || !FORA.includes(atual.estado as EstadoDaConexao))
    const voltou = estado === 'conectado' && Boolean(atual?.alertado_em)
    const ultimoAlerta = atual?.alertado_em ? new Date(atual.alertado_em as string).getTime() : 0
    const alertar = caiu && agora.getTime() - ultimoAlerta > ALERTA_A_CADA_HORAS * 3_600_000

    await admin.from('whatsapp_estado').upsert({
      workspace_id: workspaceId, estado, desde: agora.toISOString(), verificado_em: agora.toISOString(),
      alertado_em: alertar ? agora.toISOString() : voltou ? null : atual?.alertado_em ?? null,
    }, { onConflict: 'workspace_id' })

    if (alertar) await avisarAdministracao(admin, workspaceId, 'O WhatsApp do Palácio caiu', TEXTO_DA_QUEDA[estado] ?? TEXTO_DA_QUEDA.erro)
    if (voltou) await avisarAdministracao(admin, workspaceId, 'O WhatsApp do Palácio voltou', 'A conexão voltou. O que ficou na fila começa a sair agora.')
  } catch (causa) {
    console.error('[whatsapp] estado não registrado:', causa instanceof Error ? causa.message : causa)
  }
}

async function avisarAdministracao(admin: Admin, workspaceId: string, titulo: string, mensagem: string) {
  const { data: admins } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin')
  if (!admins?.length) return
  // Import tardio: notificar() usa o WhatsApp, e o WhatsApp avisa por notificar().
  const { notificar } = await import('@/lib/notificacoes/servidor')
  await notificar(admin, {
    workspaceId, para: admins.map((a) => a.user_id as string), atorId: null, categoria: 'sistema',
    titulo, mensagem, link: '/configuracoes/whatsapp', botao: 'Ver a conexão do WhatsApp',
  })
}

// ------------------------------------------------------------------ recebimento e modelos (a rotina diária)

/**
 * Os marcos de cada alerta em activity_log (entity_type "integracao", sem ator). O alerta abre o
 * episódio; qualquer um dos "resolvido" fecha. "whatsapp_webhook_ligado" é o que a tela grava quando
 * alguém toca em "Ligar o recebimento de mensagens" (app/actions/whatsapp.ts), com o administrador
 * como ator — por isso a leitura não filtra pelo ator.
 *
 * activity_log aceita inserção de qualquer membro do espaço (RLS), com a data que ele quiser: a
 * leitura ignora linha com data futura, senão um marco "para 2099" calaria o alerta para sempre (e
 * inventaria a "Rotina diária" do status). Um membro ainda consegue abrir um episódio com a data de
 * agora, que vale até o próximo "resolvido". A memória definitiva vai para colunas em whatsapp_estado
 * (só o service role escreve) numa migração futura.
 */
const MARCOS = {
  webhook: { alerta: 'whatsapp_webhook_alertado', resolvido: ['whatsapp_webhook_voltou', 'whatsapp_webhook_ligado'] },
  modelos: { alerta: 'whatsapp_modelos_alertado', resolvido: ['whatsapp_modelos_em_dia'] },
} as const

/** A execução da rotina diária, por espaço: é o que o "status" mostra como "Rotina diária". */
const ROTINA = 'whatsapp_rotina'

async function marcoDoAlerta(admin: Admin, workspaceId: string, qual: keyof typeof MARCOS): Promise<{ aberto: boolean; ultimoAlertaEm: string | null } | null> {
  const m = MARCOS[qual]
  const { data, error } = await admin.from('activity_log').select('action, created_at').eq('workspace_id', workspaceId).eq('entity_type', 'integracao')
    .in('action', [m.alerta, ...m.resolvido]).lte('created_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(20)
  if (error) return null
  const linhas = data ?? []
  return { aberto: linhas[0]?.action === m.alerta, ultimoAlertaEm: (linhas.find((l) => l.action === m.alerta)?.created_at as string | undefined) ?? null }
}

async function marcar(admin: Admin, workspaceId: string, acao: string, detalhes: Record<string, unknown>) {
  const { error } = await admin.from('activity_log').insert({ workspace_id: workspaceId, actor_id: null, action: acao, entity_type: 'integracao', metadata: { servico: 'kapso', ...detalhes } })
  if (error) console.error('[whatsapp] marco não gravado:', error.message)
}

// O notificar() corta a mensagem em 280 letras: estes textos cabem.
const TEXTO_DO_WEBHOOK: Record<'desligado' | 'outro_endereco', string> = {
  desligado: 'O recebimento de mensagens está desligado na Kapso: o bot não responde e o código mandado ao Palácio não confirma ninguém. Abra a conexão e toque em “Ligar o recebimento de mensagens”.',
  outro_endereco: 'O webhook do número na Kapso aponta para outro endereço (ou está sem a senha do Palácio): o bot não recebe nada. Abra a conexão e toque em “Ligar o recebimento de mensagens”.',
}

/** O recebimento, conferido pela rotina: desligado ou com outro endereço, alerta uma vez; se voltou sem ninguém tocar no botão, avisa. */
export async function conferirWebhook(admin: Admin, workspaceId: string, webhook: EstadoDoWebhook): Promise<'alertado' | 'voltou' | null> {
  try {
    // "desconhecido" é a Kapso que não respondeu: não dá para saber (a queda tem o alerta dela).
    if (webhook === 'desconhecido') return null
    const marco = await marcoDoAlerta(admin, workspaceId, 'webhook')
    if (!marco) return null
    const decisao = decidirAlerta({ problema: webhook !== 'ligado', ...marco, agora: new Date() })
    if (decisao === 'alertar' && webhook !== 'ligado') {
      await marcar(admin, workspaceId, MARCOS.webhook.alerta, { webhook })
      await avisarAdministracao(admin, workspaceId, 'O WhatsApp do Palácio parou de receber mensagens', TEXTO_DO_WEBHOOK[webhook])
      return 'alertado'
    }
    if (decisao === 'resolvido') {
      await marcar(admin, workspaceId, MARCOS.webhook.resolvido[0], { webhook })
      await avisarAdministracao(admin, workspaceId, 'O WhatsApp do Palácio voltou a receber mensagens', 'O recebimento de mensagens está ligado de novo na Kapso: o bot volta a responder.')
      return 'voltou'
    }
    return null
  } catch (causa) {
    console.error('[whatsapp] recebimento não conferido:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/**
 * As falhas por falta de modelo nas últimas 24 h (regras.ts, falhasSemModelo), conferidas pela rotina:
 * a partir de FALHAS_SEM_MODELO_PARA_ALERTAR, alerta uma vez; abaixo disso, o episódio fecha sem aviso.
 */
export async function conferirFalhasSemModelo(admin: Admin, workspaceId: string, quantas: number): Promise<'alertado' | null> {
  try {
    const marco = await marcoDoAlerta(admin, workspaceId, 'modelos')
    if (!marco) return null
    const decisao = decidirAlerta({ problema: quantas >= FALHAS_SEM_MODELO_PARA_ALERTAR, ...marco, agora: new Date() })
    if (decisao === 'resolvido') await marcar(admin, workspaceId, MARCOS.modelos.resolvido[0], { quantas })
    if (decisao !== 'alertar') return null
    await marcar(admin, workspaceId, MARCOS.modelos.alerta, { quantas })
    await avisarAdministracao(admin, workspaceId, 'Mensagens do WhatsApp sem modelo aprovado',
      `${quantas} mensagens não saíram nas últimas 24 horas por estarem fora da janela de 24 horas do WhatsApp ou por recusa do modelo. Aprove os modelos na Kapso e informe os nomes em Configurações → Integrações.`)
    return 'alertado'
  } catch (causa) {
    console.error('[whatsapp] falhas sem modelo não conferidas:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/**
 * O erro e o tipo das mensagens que falharam nas últimas 24 h (até 1000; `total` conta todas). O tipo
 * separa a resposta do bot, que nunca vai por modelo (regras.ts, tipoDaFalha). null = não deu para ler.
 */
export async function falhasRecentes(admin: Admin, workspaceId: string): Promise<{ total: number; falhas: FalhaDeEnvio[] } | null> {
  try {
    const desde = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const { data, count, error } = await admin.from('whatsapp_mensagens').select('tipo, erro', { count: 'exact' })
      .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('situacao', 'falhou').gte('criado_em', desde)
      .order('criado_em', { ascending: false }).limit(1000)
    if (error) return null
    const falhas = (data ?? []).map((l) => ({ erro: (l.erro as string | null) ?? null, tipo: (l.tipo as string | null) ?? null }))
    return { total: count ?? falhas.length, falhas }
  } catch {
    return null
  }
}

/** Grava o fim da rotina diária em cada espaço conferido (o que ela viu vai junto, sem dado de ninguém). */
export async function registrarRotina(admin: Admin, conferidos: { workspaceId: string; detalhes: Record<string, unknown> }[]): Promise<void> {
  if (!conferidos.length) return
  try {
    const { error } = await admin.from('activity_log').insert(conferidos.map((c) => ({
      workspace_id: c.workspaceId, actor_id: null, action: ROTINA, entity_type: 'integracao', metadata: { servico: 'kapso', ...c.detalhes },
    })))
    if (error) console.error('[whatsapp] rotina não registrada:', error.message)
  } catch (causa) {
    console.error('[whatsapp] rotina não registrada:', causa instanceof Error ? causa.message : causa)
  }
}

/** Quando a rotina diária terminou pela última vez neste espaço; null sem registro. */
export async function ultimaRotina(admin: Admin, workspaceId: string): Promise<string | null> {
  try {
    // Sem data futura (MARCOS, acima): uma linha "para 2099" não vira a última rotina.
    const { data } = await admin.from('activity_log').select('created_at').eq('workspace_id', workspaceId).eq('entity_type', 'integracao').eq('action', ROTINA)
      .lte('created_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return (data?.created_at as string | undefined) ?? null
  } catch {
    return null
  }
}
