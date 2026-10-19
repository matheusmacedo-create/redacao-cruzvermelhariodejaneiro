import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { configDoWhatsapp, enviarTexto, registrar, type ConfigDoWhatsapp, type OpcoesDoEnvio } from './servidor'
import { registrarEstado } from './estado'
import { redigirVencidos } from './assistente/faxina'
import { redigirCadastrosEncerrados } from './colaborador-faxina'
import {
  BOTAO_DO_NAO_FUI_EU, INTERVALO_ENTRE_ENVIOS_MS, MARCA_DO_NAO_FUI_EU, TETO_POR_MINUTO, emSilencio, esperaPelaCota, falhaDerrubaConexao, falhaMereceReenvio,
  fimDaEsperaDaCota, fimDoSilencio, interativoDoAviso, limiteDaCota, ofereceNaoFuiEu, prioridadeNaCota, proximaTentativa, silencioSeAplica,
  type CotaDoNumero, type EsperaNaFila, type Interativo, type MotivoDaFalha,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A entrega das mensagens do Palácio pelo WhatsApp, com quatro proteções:
 *
 *  - horário de silêncio (22h–7h): o aviso comum espera e sai às 7h;
 *  - volume: no máximo TETO_POR_MINUTO mensagens por minuto, com espera fixa
 *    entre uma e outra; o que passar espera na fila;
 *  - cota diária: a Meta limita quantas pessoas diferentes o número procura
 *    por dia fora da janela de 24 h (regras.ts, COTA_DE_CONVERSAS). Perto do
 *    teto, o que pode esperar (avisos comuns, anúncios, convites) fica para o
 *    dia seguinte, e a reserva vai para segurança, código, portaria, alertas
 *    e respostas do bot (prioridadeNaCota);
 *  - queda: o que falhou por a Kapso estar fora (rede, 5xx, chave ou
 *    número) volta para a fila com espera crescente e sai quando a
 *    conexão voltar. O que pode já ter saído (tempo esgotado) não é repetido.
 *
 * A fila (whatsapp_fila) anda quando: alguém escreve para o número (rota
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
  /**
   * Botões ou lista junto do texto (regras.ts, Interativo). A fila guarda só o texto: o que espera nela sai sem
   * eles — menos o aviso da visita na portaria, que monta os botões de novo pelo link, e o aviso de segurança com o
   * "Não fui eu", que monta o botão pelo texto (enviarAgora).
   */
  interativo?: Interativo | null
  /**
   * A marca no registro da saída (LinhaDoRegistro.comando): "menu" para a lista do menu do bot; o aviso de segurança
   * com o "Não fui eu" ganha a dele sozinho (enviarAgora), e é por ela que a resposta acha o aviso.
   */
  comando?: string | null
  /**
   * O modelo da situação para fora da janela de 24 h, no lugar do modelo da finalidade (servidor.ts, OpcoesDoEnvio): a
   * ficha da visita (lib/portaria/servidor.ts). A fila não o guarda — o que espera nela sai como o aviso de sempre.
   */
  modeloForaDaJanela?: OpcoesDoEnvio['modeloForaDaJanela']
}

/** Por que a mensagem espera na fila (whatsapp_fila.motivo). "cota": ficou para o dia seguinte pela cota diária. */
export type MotivoNaFila = 'silencio' | 'volume' | 'falha' | 'cota'

export type Entrega =
  | { situacao: 'enviada'; id: string | null }
  | { situacao: 'na_fila'; motivo: MotivoNaFila }
  | { situacao: 'falhou'; erro: string; motivo: MotivoDaFalha }

const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms))

/** Com o teto do minuto batido, espera tanto e confere de novo. */
const ESPERA_DO_TETO_MS = 5_000

/** Folga para um envio no pior caso (a Kapso tem até 30 s para confirmar, e o modelo pode ser uma 2ª tentativa): sem ela, não começa outro. */
const FOLGA_POR_ENVIO_MS = 42_000

/** Mensagens que saíram no último minuto (todo o espaço), para o teto de volume. */
async function saidasNoUltimoMinuto(admin: Admin, workspaceId: string): Promise<number> {
  const { count } = await admin.from('whatsapp_mensagens').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('situacao', 'enviada').gte('criado_em', new Date(Date.now() - 60_000).toISOString())
  return count ?? 0
}

/**
 * As conversas que o Palácio iniciou nas últimas 24 h e, com `numero`, se ele está com a janela aberta ou já foi
 * contado (regras.ts, CotaDoNumero), pela função whatsapp_cota_de_conversas. null = não deu para contar: antes
 * da migração da cota, a função não existe e nada espera por ela.
 */
export async function cotaDeConversas(admin: Admin, workspaceId: string, numero?: string | null): Promise<CotaDoNumero | null> {
  try {
    const { data, error } = await admin.rpc('whatsapp_cota_de_conversas', { p_workspace_id: workspaceId, p_numero: numero ?? null })
    if (error || !data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    const usadas = Number(d.usadas)
    if (!Number.isFinite(usadas)) return null
    return { usadas, janelaAberta: d.janela_aberta === true, jaContado: d.ja_contado === true }
  } catch {
    return null
  }
}

/** Põe na fila. Não repete um aviso do mesmo link que já espera para a mesma pessoa. false = sem fila (tabela ausente). */
export async function enfileirar(admin: Admin, workspaceId: string, m: Mensagem, p: {
  motivo: MotivoNaFila; enviarApos: Date; tentativas?: number; erro?: string | null
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
  // O tipo é a finalidade: escolhe o modelo fora da janela de 24 h (a resposta do bot nunca vai por modelo). O aviso
  // da visita na portaria leva os botões pelo link, saia agora ou da fila; fora da janela, vai pelo modelo, sem eles.
  // O aviso de segurança que ensina o "NÃO FUI EU" leva o botão e a marca no registro, pelo texto (a fila guarda só ele).
  const naoFuiEu = m.tipo === 'seguranca' && ofereceNaoFuiEu(m.texto)
  const interativo = m.interativo ?? (m.tipo === 'aviso' ? interativoDoAviso(m.link) : naoFuiEu ? BOTAO_DO_NAO_FUI_EU : null)
  const envio = await enviarTexto(config, m.numero, m.texto, { finalidade: m.tipo, interativo, modeloForaDaJanela: m.modeloForaDaJanela })
  await registrar(admin, {
    workspaceId, direcao: 'saida', tipo: m.tipo, situacao: envio.ok ? 'enviada' : 'falhou', numero: m.numero, userId: m.userId,
    mensagemId: envio.ok ? envio.id : null, comando: m.comando ?? (naoFuiEu ? MARCA_DO_NAO_FUI_EU : null), notificacaoId: m.notificacaoId, erro: envio.ok ? null : envio.erro,
  })
  if (envio.ok) await registrarEstado(admin, workspaceId, 'conectado')
  else if (falhaDerrubaConexao(envio.motivo)) await registrarEstado(admin, workspaceId, envio.motivo === 'instancia' ? 'sem_instancia' : 'erro')
  return envio
}

/**
 * Entrega uma mensagem com as regras de silêncio, cota diária, volume e queda.
 * "teste" nunca vai para a fila: quem tocou no botão quer a resposta agora.
 * `semFila`: nunca enfileira — nem pelo teto de volume (a resposta já tem o teto de respostas por número), nem
 * para reenviar a falha (devolve "falhou"). É o caso das respostas do assistente (lib/whatsapp/assistente): o
 * plano que não saiu na hora é cancelado, e o texto dele nunca espera na fila.
 */
export async function entregar(admin: Admin, workspaceId: string, m: Mensagem, opcoes: { config?: ConfigDoWhatsapp | null; semFila?: boolean } = {}): Promise<Entrega> {
  try {
    const agora = new Date()
    if (silencioSeAplica(m) && emSilencio(agora) && await enfileirar(admin, workspaceId, m, { motivo: 'silencio', enviarApos: fimDoSilencio(agora) })) {
      return { situacao: 'na_fila', motivo: 'silencio' }
    }
    // Só o que pode esperar pergunta pela cota (uma consulta): o resto nem conta.
    if (prioridadeNaCota(m) === 'baixa') {
      const cota = await cotaDeConversas(admin, workspaceId, m.numero)
      if (cota && esperaPelaCota({ prioridade: 'baixa', ...cota }) && await enfileirar(admin, workspaceId, m, { motivo: 'cota', enviarApos: fimDaEsperaDaCota(agora) })) {
        return { situacao: 'na_fila', motivo: 'cota' }
      }
    }
    if (m.tipo !== 'teste' && !opcoes.semFila && await saidasNoUltimoMinuto(admin, workspaceId) >= TETO_POR_MINUTO
      && await enfileirar(admin, workspaceId, m, { motivo: 'volume', enviarApos: new Date(agora.getTime() + 60_000) })) {
      return { situacao: 'na_fila', motivo: 'volume' }
    }
    const config = opcoes.config ?? await configDoWhatsapp(workspaceId)
    if (!config) return { situacao: 'falhou', erro: 'O WhatsApp do Palácio Virtual não está configurado.', motivo: 'chave' }
    const envio = await enviarAgora(admin, workspaceId, config, m)
    if (envio.ok) return { situacao: 'enviada', id: envio.id }
    const quando = proximaTentativa(1, new Date())
    if (m.tipo !== 'teste' && !opcoes.semFila && quando && falhaMereceReenvio(envio.motivo)
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
 * silêncio, a cota diária, o teto por minuto e o tempo disponível. Sem
 * `workspaceId`, todos os espaços (rotina diária).
 */
export async function processarFila(admin: Admin, workspaceId?: string | null, opcoes: { orcamentoMs?: number; limite?: number } = {}): Promise<ResultadoDaFila> {
  const resultado: ResultadoDaFila = { enviadas: 0, adiadas: 0, desistiu: 0, restam: 0 }
  const fim = Date.now() + (opcoes.orcamentoMs ?? 60_000)
  try {
    // A faxina dos planos do assistente vem junto (os textos de ação vencidos saem do banco): a fila anda a cada aviso
    // emitido em qualquer parte do Palácio, e isso basta para nenhum plano abandonado esperar a rotina do dia.
    await redigirVencidos(admin, { limite: 20 })
    // E a do cadastro de colaborador pelo WhatsApp: o contato da pessoa nova não espera o próximo cadastro para sair
    // da pergunta ou do link que venceu (no máximo a cada 30 s por instância).
    await redigirCadastrosEncerrados(admin, { geral: true })

    // Quem ficou "processando" por mais de 10 min (a função caiu no meio) volta para a fila.
    await admin.from('whatsapp_fila').update({ situacao: 'pendente', atualizado_em: new Date().toISOString() })
      .eq('situacao', 'processando').lt('atualizado_em', new Date(Date.now() - 10 * 60_000).toISOString())

    // O anúncio aos voluntários (lista grande) vai por último: resposta do bot, aviso de
    // segurança e aviso da equipe não esperam atrás dele.
    const buscar = (anuncio: boolean) => {
      let consulta = admin.from('whatsapp_fila')
        .select('id, workspace_id, user_id, numero, texto, tipo, categoria, link, notificacao_id, tentativas')
        .eq('situacao', 'pendente').lte('enviar_apos', new Date().toISOString())
        .order('enviar_apos', { ascending: true }).limit(opcoes.limite ?? 60)
      consulta = anuncio ? consulta.eq('categoria', 'voluntariado') : consulta.or('categoria.is.null,categoria.neq.voluntariado')
      return workspaceId ? consulta.eq('workspace_id', workspaceId) : consulta
    }
    const [urgentes, anuncios] = await Promise.all([buscar(false), buscar(true)])
    if (urgentes.error) return resultado
    const itens = [...(urgentes.data ?? []), ...(anuncios.data ?? [])].slice(0, opcoes.limite ?? 60)
    if (!itens.length) return resultado

    const configs = new Map<string, ConfigDoWhatsapp | null>()
    // A cota de cada espaço, lida uma vez por rodada e somada a cada envio (por cima: quem tinha a janela aberta
    // não conta de verdade). No limite, cada número é conferido de novo, e a conferência traz a conta certa.
    const cotas = new Map<string, number | null>()
    const derrubados = new Set<string>()
    let enviouAntes = false

    for (const item of itens as Item[]) {
      if (Date.now() + FOLGA_POR_ENVIO_MS > fim || derrubados.has(item.workspace_id)) { resultado.restam++; continue }
      // Teto do minuto batido: espera a janela abrir enquanto houver orçamento (antes, pulava tudo).
      let noTeto = await saidasNoUltimoMinuto(admin, item.workspace_id) >= TETO_POR_MINUTO
      while (noTeto && Date.now() + ESPERA_DO_TETO_MS + FOLGA_POR_ENVIO_MS <= fim) {
        await dormir(ESPERA_DO_TETO_MS)
        noTeto = await saidasNoUltimoMinuto(admin, item.workspace_id) >= TETO_POR_MINUTO
      }
      if (noTeto) { resultado.restam++; continue }

      const { data: pego } = await admin.from('whatsapp_fila').update({ situacao: 'processando', atualizado_em: new Date().toISOString() })
        .eq('id', item.id).eq('situacao', 'pendente').select('id').maybeSingle()
      if (!pego) continue

      const agora = new Date()
      // O link da ficha da Equipe, o convite de acesso e o link de confirmar no Palácio que a resposta do bot leva
      // (lib/whatsapp/confirmacoes.ts, caminhoDaConfirmacao) carregam token: saiu (ou desistiu), o texto não fica guardado.
      // A resposta do assistente (o recibo, a única que pode esperar aqui) também não: o Palácio não guarda a conversa.
      const semSegredo = (campos: Record<string, unknown>) =>
        (item.categoria === 'equipe' || item.categoria === 'conta' || item.categoria === 'assistente' || (item.tipo === 'bot' && item.texto.includes('/confirmar/')))
          && (campos.situacao === 'enviada' || campos.situacao === 'desistiu')
          ? { ...campos, texto: '[link apagado depois do envio]' } : campos
      const devolver = (campos: Record<string, unknown>) =>
        admin.from('whatsapp_fila').update({ ...semSegredo(campos), atualizado_em: new Date().toISOString() }).eq('id', item.id)

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
      if (prioridadeNaCota(item) === 'baixa') {
        if (!cotas.has(item.workspace_id)) cotas.set(item.workspace_id, (await cotaDeConversas(admin, item.workspace_id))?.usadas ?? null)
        const usadas = cotas.get(item.workspace_id) ?? null
        if (usadas !== null && usadas >= limiteDaCota()) {
          const doNumero = await cotaDeConversas(admin, item.workspace_id, item.numero)
          if (doNumero) cotas.set(item.workspace_id, doNumero.usadas)
          if (doNumero && esperaPelaCota({ prioridade: 'baixa', ...doNumero })) {
            await devolver({ situacao: 'pendente', motivo: 'cota', enviar_apos: fimDaEsperaDaCota(agora).toISOString() })
            resultado.adiadas++
            continue
          }
        }
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
        const usadas = cotas.get(item.workspace_id)
        if (typeof usadas === 'number' && item.tipo !== 'bot') cotas.set(item.workspace_id, usadas + 1)
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
 * pausou ou tirou o número. Nesses casos a mensagem não sai mais — menos o
 * aviso de segurança da conta, que vai ao número a que foi endereçado, com ou
 * sem pausa: o recado da troca ou remoção do número vai justamente ao número
 * antigo (lib/contas/servidor.ts, avisarPorWhatsapp). Só não sai se, enquanto
 * isso, o número foi confirmado em outra conta: ali já é de outra pessoa.
 */
async function desistirAntes(admin: Admin, item: Item): Promise<string | null> {
  if (item.user_id && item.tipo === 'seguranca') {
    // Só whatsapp_contas: a mesma pessoa pode ter o número também como voluntária.
    const { data: dono } = await admin.from('whatsapp_contas').select('user_id').eq('numero', item.numero).maybeSingle()
    if (dono && dono.user_id !== item.user_id) return 'O número passou para outra conta.'
  }
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
  if (item.user_id && item.tipo !== 'teste' && item.tipo !== 'seguranca') {
    const { data: conta } = await admin.from('whatsapp_contas').select('numero, pausado_em').eq('user_id', item.user_id).maybeSingle()
    if (!conta || conta.numero !== item.numero) return 'O número não está mais confirmado.'
    if (conta.pausado_em && item.tipo === 'aviso') return 'A pessoa pausou os avisos por WhatsApp.'
  }
  return null
}

/** Quantas mensagens esperam na fila, por motivo (para a tela de conexão). */
export async function resumoDaFila(admin: Admin, workspaceId: string): Promise<EsperaNaFila | null> {
  try {
    const { data, error } = await admin.from('whatsapp_fila').select('motivo').eq('workspace_id', workspaceId).eq('situacao', 'pendente').limit(1000)
    if (error) return null
    const r: EsperaNaFila = { silencio: 0, volume: 0, falha: 0, cota: 0 }
    for (const l of data ?? []) if (l.motivo === 'silencio' || l.motivo === 'volume' || l.motivo === 'falha' || l.motivo === 'cota') r[l.motivo as keyof EsperaNaFila]++
    return r
  } catch {
    return null
  }
}
