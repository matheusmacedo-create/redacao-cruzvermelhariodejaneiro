import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { configDoWhatsapp, enviarTexto, registrar, type ConfigDoWhatsapp } from './servidor'
import { registrarEstado } from './estado'
import {
  INTERVALO_ENTRE_ENVIOS_MS, TETO_POR_MINUTO, emSilencio, falhaDerrubaConexao, falhaMereceReenvio, fimDoSilencio, proximaTentativa,
  silencioSeAplica, type MotivoDaFalha,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A entrega das mensagens do Palácio pelo WhatsApp, com três proteções:
 *
 *  - horário de silêncio (22h–7h): o aviso comum espera e sai às 7h;
 *  - volume: no máximo TETO_POR_MINUTO mensagens por minuto, com espera fixa
 *    entre uma e outra; o que passar espera na fila;
 *  - queda: o que falhou por o servidor estar fora (rede, 5xx, chave ou
 *    instância) volta para a fila com espera crescente e sai quando a
 *    conexão voltar. O que pode já ter saído (tempo esgotado) não é repetido.
 *
 * A fila (whatsapp_fila) anda quando: a Evolution avisa que reconectou (rota
 * do webhook), um aviso novo acaba de sair (notificar), a rotina diária roda
 * (/api/whatsapp/rotina, às 7h05) e alguém toca em "Enviar a fila agora".
 *
 * Nunca lança. Sem a tabela (migração ainda não aplicada), a entrega vira
 * envio direto, como era antes.
 */

export type TipoNaFila = 'aviso' | 'seguranca' | 'bot' | 'teste'

export type Mensagem = {
  numero: string
  texto: string
  tipo: TipoNaFila
  userId?: string | null
  notificacaoId?: string | null
  categoria?: string | null
  link?: string | null
}

export type Entrega =
  | { situacao: 'enviada'; id: string | null }
  | { situacao: 'na_fila'; motivo: 'silencio' | 'volume' | 'falha' }
  | { situacao: 'falhou'; erro: string; motivo: MotivoDaFalha }

const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms))

/** Folga para um envio no pior caso (a Evolution tem até 40 s para confirmar): sem ela, não começa outro. */
const FOLGA_POR_ENVIO_MS = 42_000

/** Mensagens que saíram no último minuto (todo o espaço), para o teto de volume. */
async function saidasNoUltimoMinuto(admin: Admin, workspaceId: string): Promise<number> {
  const { count } = await admin.from('whatsapp_mensagens').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('situacao', 'enviada').gte('criado_em', new Date(Date.now() - 60_000).toISOString())
  return count ?? 0
}

/** Põe na fila. Não repete um aviso do mesmo link que já espera para a mesma pessoa. false = sem fila (tabela ausente). */
export async function enfileirar(admin: Admin, workspaceId: string, m: Mensagem, p: {
  motivo: 'silencio' | 'volume' | 'falha'; enviarApos: Date; tentativas?: number; erro?: string | null
}): Promise<boolean> {
  try {
    if (m.tipo === 'aviso' && m.userId && m.link && p.motivo !== 'falha') {
      const { data: igual, error: semTabela } = await admin.from('whatsapp_fila').select('id').eq('user_id', m.userId).eq('link', m.link)
        .eq('situacao', 'pendente').limit(1).maybeSingle()
      if (semTabela) return false
      if (igual) return true
    }
    const { error } = await admin.from('whatsapp_fila').insert({
      workspace_id: workspaceId, user_id: m.userId ?? null, numero: m.numero, texto: m.texto.slice(0, 4000), tipo: m.tipo,
      categoria: m.categoria?.slice(0, 40) ?? null, link: m.link?.slice(0, 500) ?? null, notificacao_id: m.notificacaoId ?? null,
      motivo: p.motivo, enviar_apos: p.enviarApos.toISOString(), tentativas: p.tentativas ?? 0, ultimo_erro: p.erro?.slice(0, 500) ?? null,
    })
    if (error) { console.error('[whatsapp] não entrou na fila:', error.message); return false }
    return true
  } catch (causa) {
    console.error('[whatsapp] não entrou na fila:', causa instanceof Error ? causa.message : causa)
    return false
  }
}

/** Envia agora e registra; atualiza o estado da conexão pelo resultado. */
async function enviarAgora(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, m: Mensagem) {
  const envio = await enviarTexto(config, m.numero, m.texto)
  await registrar(admin, {
    workspaceId, direcao: 'saida', tipo: m.tipo, situacao: envio.ok ? 'enviada' : 'falhou', numero: m.numero,
    userId: m.userId, mensagemId: envio.ok ? envio.id : null, notificacaoId: m.notificacaoId, erro: envio.ok ? null : envio.erro,
  })
  if (envio.ok) await registrarEstado(admin, workspaceId, 'conectado')
  else if (falhaDerrubaConexao(envio.motivo)) await registrarEstado(admin, workspaceId, envio.motivo === 'instancia' ? 'sem_instancia' : 'erro')
  return envio
}

/**
 * Entrega uma mensagem com as regras de silêncio, volume e queda. "teste" nunca
 * vai para a fila: quem tocou no botão quer a resposta agora.
 */
export async function entregar(admin: Admin, workspaceId: string, m: Mensagem, opcoes: { config?: ConfigDoWhatsapp | null } = {}): Promise<Entrega> {
  try {
    const agora = new Date()
    if (silencioSeAplica(m) && emSilencio(agora) && await enfileirar(admin, workspaceId, m, { motivo: 'silencio', enviarApos: fimDoSilencio(agora) })) {
      return { situacao: 'na_fila', motivo: 'silencio' }
    }
    if (m.tipo !== 'teste' && await saidasNoUltimoMinuto(admin, workspaceId) >= TETO_POR_MINUTO
      && await enfileirar(admin, workspaceId, m, { motivo: 'volume', enviarApos: new Date(agora.getTime() + 60_000) })) {
      return { situacao: 'na_fila', motivo: 'volume' }
    }
    const config = opcoes.config ?? await configDoWhatsapp(workspaceId)
    if (!config) return { situacao: 'falhou', erro: 'O WhatsApp do Palácio Virtual não está configurado.', motivo: 'chave' }
    const envio = await enviarAgora(admin, workspaceId, config, m)
    if (envio.ok) return { situacao: 'enviada', id: envio.id }
    const quando = proximaTentativa(1, new Date())
    if (m.tipo !== 'teste' && quando && falhaMereceReenvio(envio.motivo)
      && await enfileirar(admin, workspaceId, m, { motivo: 'falha', enviarApos: quando, tentativas: 1, erro: envio.erro })) {
      return { situacao: 'na_fila', motivo: 'falha' }
    }
    return { situacao: 'falhou', erro: envio.erro, motivo: envio.motivo }
  } catch (causa) {
    console.error('[whatsapp] entrega falhou:', causa instanceof Error ? causa.message : causa)
    return { situacao: 'falhou', erro: 'Erro inesperado na entrega.', motivo: 'outro' }
  }
}

export type ResultadoDaFila = { enviadas: number; adiadas: number; desistiu: number; restam: number }

type Item = {
  id: number; workspace_id: string; user_id: string | null; numero: string; texto: string; tipo: TipoNaFila
  categoria: string | null; link: string | null; notificacao_id: string | null; tentativas: number
}

/**
 * Faz a fila andar: o que já pode sair (enviar_apos vencido), respeitando o
 * silêncio, o teto por minuto e o tempo disponível. Sem `workspaceId`, todos
 * os espaços (rotina diária).
 */
export async function processarFila(admin: Admin, workspaceId?: string | null, opcoes: { orcamentoMs?: number; limite?: number } = {}): Promise<ResultadoDaFila> {
  const resultado: ResultadoDaFila = { enviadas: 0, adiadas: 0, desistiu: 0, restam: 0 }
  const fim = Date.now() + (opcoes.orcamentoMs ?? 60_000)
  try {
    // Quem ficou "processando" por mais de 10 min (a função caiu no meio) volta para a fila.
    await admin.from('whatsapp_fila').update({ situacao: 'pendente', atualizado_em: new Date().toISOString() })
      .eq('situacao', 'processando').lt('atualizado_em', new Date(Date.now() - 10 * 60_000).toISOString())

    let consulta = admin.from('whatsapp_fila')
      .select('id, workspace_id, user_id, numero, texto, tipo, categoria, link, notificacao_id, tentativas')
      .eq('situacao', 'pendente').lte('enviar_apos', new Date().toISOString())
      .order('enviar_apos', { ascending: true }).limit(opcoes.limite ?? 60)
    if (workspaceId) consulta = consulta.eq('workspace_id', workspaceId)
    const { data: itens, error } = await consulta
    if (error || !itens?.length) return resultado

    const configs = new Map<string, ConfigDoWhatsapp | null>()
    const derrubados = new Set<string>()
    let enviouAntes = false

    for (const item of itens as Item[]) {
      if (Date.now() + FOLGA_POR_ENVIO_MS > fim || derrubados.has(item.workspace_id)) { resultado.restam++; continue }
      if (await saidasNoUltimoMinuto(admin, item.workspace_id) >= TETO_POR_MINUTO) { resultado.restam++; continue }

      const { data: pego } = await admin.from('whatsapp_fila').update({ situacao: 'processando', atualizado_em: new Date().toISOString() })
        .eq('id', item.id).eq('situacao', 'pendente').select('id').maybeSingle()
      if (!pego) continue

      const agora = new Date()
      const devolver = (campos: Record<string, unknown>) =>
        admin.from('whatsapp_fila').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', item.id)

      if (silencioSeAplica(item) && emSilencio(agora)) {
        await devolver({ situacao: 'pendente', enviar_apos: fimDoSilencio(agora).toISOString() })
        resultado.adiadas++
        continue
      }
      const motivoParaDesistir = await desistirAntes(admin, item)
      if (motivoParaDesistir) {
        await devolver({ situacao: 'desistiu', ultimo_erro: motivoParaDesistir })
        resultado.desistiu++
        continue
      }

      if (!configs.has(item.workspace_id)) configs.set(item.workspace_id, await configDoWhatsapp(item.workspace_id))
      const config = configs.get(item.workspace_id)
      if (!config) { await devolver({ situacao: 'pendente' }); resultado.restam++; continue }

      if (enviouAntes) await dormir(INTERVALO_ENTRE_ENVIOS_MS)
      const envio = await enviarAgora(admin, item.workspace_id, config, {
        numero: item.numero, texto: item.texto, tipo: item.tipo, userId: item.user_id, notificacaoId: item.notificacao_id, categoria: item.categoria, link: item.link,
      })
      enviouAntes = true

      if (envio.ok) {
        await devolver({ situacao: 'enviada', ultimo_erro: null })
        if (item.notificacao_id) await admin.from('notifications').update({ whatsapp_em: new Date().toISOString() }).eq('id', item.notificacao_id)
        resultado.enviadas++
        continue
      }
      const tentativas = item.tentativas + 1
      const quando = falhaMereceReenvio(envio.motivo) ? proximaTentativa(tentativas, new Date()) : null
      if (quando) {
        await devolver({ situacao: 'pendente', tentativas, enviar_apos: quando.toISOString(), ultimo_erro: envio.erro.slice(0, 500) })
        resultado.adiadas++
      } else {
        await devolver({ situacao: 'desistiu', tentativas, ultimo_erro: envio.erro.slice(0, 500) })
        resultado.desistiu++
      }
      // Servidor fora do ar: não adianta insistir com o resto agora.
      if (falhaDerrubaConexao(envio.motivo)) derrubados.add(item.workspace_id)
    }
  } catch (causa) {
    console.error('[whatsapp] fila não andou:', causa instanceof Error ? causa.message : causa)
  }
  return resultado
}

/**
 * Enquanto esperava, a situação pode ter mudado: a pessoa leu o aviso no sino,
 * pausou ou tirou o número. Nesses casos a mensagem não sai mais.
 */
async function desistirAntes(admin: Admin, item: Item): Promise<string | null> {
  if (item.notificacao_id) {
    const { data: aviso } = await admin.from('notifications').select('read_at').eq('id', item.notificacao_id).maybeSingle()
    if (aviso?.read_at) return 'O aviso já foi lido no Palácio.'
  }
  // Oportunidade para voluntário (sem conta no Palácio): confere o número dele e a oportunidade.
  if (!item.user_id && item.categoria === 'voluntariado') {
    // Import tardio: voluntarios.ts põe na fila e roda a fila.
    const { desistirDoVoluntario } = await import('./voluntarios')
    return desistirDoVoluntario(admin, item)
  }
  if (item.user_id && item.tipo !== 'teste') {
    const { data: conta } = await admin.from('whatsapp_contas').select('numero, pausado_em').eq('user_id', item.user_id).maybeSingle()
    if (!conta || conta.numero !== item.numero) return 'O número não está mais confirmado.'
    if (conta.pausado_em && item.tipo === 'aviso') return 'A pessoa pausou os avisos por WhatsApp.'
  }
  return null
}

/** Quantas mensagens esperam na fila, por motivo (para a tela de conexão). */
export async function resumoDaFila(admin: Admin, workspaceId: string): Promise<{ silencio: number; volume: number; falha: number } | null> {
  try {
    const { data, error } = await admin.from('whatsapp_fila').select('motivo').eq('workspace_id', workspaceId).eq('situacao', 'pendente').limit(1000)
    if (error) return null
    const r = { silencio: 0, volume: 0, falha: 0 }
    for (const l of data ?? []) if (l.motivo === 'silencio' || l.motivo === 'volume' || l.motivo === 'falha') r[l.motivo as keyof typeof r]++
    return r
  } catch {
    return null
  }
}
