import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { modeloDoAssistente, traduzirErro } from '@/lib/ia/anthropic'
import { IaError } from '@/lib/ia/openai'
import type { Interativo, MensagemRecebida } from '../regras'
import type { Entrega } from '../fila'
import type { Pessoa } from '../acoes'
import { chamarClaude, paramsDoAssistente } from './claude'
import { criarExecutar, criarRascunho, rodarTurno, type Desfecho, type Handlers, type PerguntaPronta } from './laco'
import { criarLeitor, dadosDoContexto, novoTurnoDeLeitura, quadroDePessoas, rotulosDasOpcoes, type TurnoDeLeitura } from './leituras'
import { esperarAVez, gravarMemoria, hashDoTexto, lerMemoria, soltarVez, textoRepetido, type ListaGuardada } from './memoria'
import { entregaFalhou, fecharPergunta, guardarPergunta, guardarPlano, marcarEmRevisao, marcarEntrega, rearmar, type AbertoDaPessoa } from './plano'
import type { PlanoGuardado } from './fluxo'
import { criarPreparador } from './preparos'
import { fonteDoSupabase } from './executores'
import { montarContexto, textoDaSituacao } from './prompt'
import {
  LIMITES, TETOS_PADRAO, TEXTOS_FIXOS, acoesPermitidas, decidirTeto, marcadoresNaResposta, planoSensivel, posProcessarResposta, quantidadePedida, textoDaPergunta,
  textoDoPlano, unirPermitidas, validarRascunho, type Passo, type TipoDeAcao,
} from './regras'
import {
  ERROS_DE_FORA, alertarAdmins, contarTurnos, criarRegistroDoUso, gastoDeHoje, leiturasDeHoje, pausarPorConfiguracao, registrarFalha, zerarFalhas,
  type Disponibilidade, type RegistroDoUso,
} from './uso'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Um turno do assistente do WhatsApp (ARQUITETURA §8.5): a mensagem que o bot de comandos não entende vira uma
 * conversa curta com o Claude, que consulta o Palácio com as permissões da pessoa e responde no WhatsApp.
 *
 *  0. revisão: com um plano aberto, ele vira "em revisão" ANTES de qualquer espera (um "confirmo" em paralelo
 *     não executa) e, no fim, se nada o substituiu, volta a "aberto" com o lembrete na mesma resposta;
 *  1. cotas (turnos da pessoa por hora e por dia, US$ da pessoa e do espaço desde a meia-noite de Brasília): batido
 *     um teto, o texto fixo — o da pessoa barra só ela; aos 80% e aos 100% do espaço, a administração é avisada;
 *  2. a vez da pessoa (um turno por vez), esperando de 1 em 1 s até 15 s;
 *  3. a mesma mensagem há menos de 10 min: o texto fixo, sem modelo;
 *  4. o contexto, lido no banco agora (nada da conversa fica guardado), e o portão de intenção (só da mensagem);
 *  5. o laço (laco.ts) com as leituras desta pessoa e os preparos (preparos.ts: com a escrita ligada para ela, cada
 *     preparar_* confere tudo no banco e acrescenta um passo ao rascunho; nada é feito aqui);
 *  6. o desfecho: o plano (validado, guardado com o hash e mostrado pelo código — o texto do modelo é descartado; o
 *     plano em revisão é substituído), a resposta pós-processada (sem URL do modelo, marcadores trocados por nomes e
 *     links do código), a pergunta escrita pelo código, ou um texto fixo (recusa, teto, prazo, fora do ar);
 *  7. a memória (só marcadores e o HMAC do texto), o registro do uso (sem texto) e a vez solta.
 *
 * Toda resposta sai sem fila (`semFila`): o assistente nunca deixa texto esperando em whatsapp_fila — só o aviso curto
 * "não consegui mandar o plano", que não traz dado nenhum, pode esperar nela. Nunca lança.
 */

export type Responder = (texto: string, extra?: { interativo?: Interativo | null; comando?: string; categoria?: string; semFila?: boolean }) => Promise<Entrega>

export type EntradaDoAssistente = {
  admin: Admin
  workspaceId: string
  pessoa: Pessoa
  m: MensagemRecebida
  base: string
  /** A hora-limite deste turno (ms), dada pela rota do webhook. */
  prazo: number
  ia: Disponibilidade
  aberto: AbertoDaPessoa | null
  responder: Responder
  /** A opção que a pessoa escolheu na pergunta aberta ("2" ou o toque), já lida pelo código. */
  escolha?: string | null
}

/** A classe do erro, pelas classes do SDK (nunca pela mensagem): é o que vai ao registro e ao log. */
export function classeDoErro(causa: unknown): string {
  if (causa === 'pause_turn') return 'pause_turn'
  if (causa instanceof Anthropic.APIConnectionTimeoutError) return 'APIConnectionTimeoutError'
  if (causa instanceof Anthropic.APIConnectionError) return 'APIConnectionError'
  if (causa instanceof Anthropic.RateLimitError) return 'RateLimitError'
  if (causa instanceof Anthropic.AuthenticationError) return 'AuthenticationError'
  if (causa instanceof Anthropic.PermissionDeniedError) return 'PermissionDeniedError'
  if (causa instanceof Anthropic.NotFoundError) return 'NotFoundError'
  if (causa instanceof Anthropic.BadRequestError) return 'BadRequestError'
  if (causa instanceof Anthropic.InternalServerError) return 'InternalServerError'
  if (causa instanceof Anthropic.APIError) return 'APIError'
  if (causa instanceof IaError) return 'SemChave'
  return 'Outro'
}

/** Os tipos de ação dos passos de um plano (o portão do turno soma os do plano em revisão). */
const TIPO_DO_PASSO: Record<Passo['acao'], TipoDeAcao> = {
  votar: 'voto', mensagem_direta: 'mensagem', comentar_chamado: 'comentario', responder_chat: 'chat', abrir_chamado: 'chamado', responder_visita: 'visita', marcar_lidos: 'lidos',
}

/** A pergunta do modelo vira a do código: só opções que o código mostrou, com os rótulos relidos no banco. */
async function montarPergunta(t: TurnoDeLeitura, e: Record<string, unknown>): Promise<{ ok: true; pergunta: PerguntaPronta } | { ok: false; erro: string }> {
  const opcoes = (e.opcoes as string[]) ?? []
  if (opcoes.some((o) => !t.tabela.tipoDe(o))) return { ok: false, erro: TEXTOS_FIXOS.pergunta_desconhecida }
  const rotulos = await rotulosDasOpcoes(t, opcoes)
  if (rotulos.length !== opcoes.length) return { ok: false, erro: TEXTOS_FIXOS.pergunta_desconhecida }
  return { ok: true, pergunta: { pergunta: String(e.pergunta ?? ''), opcoes, rotulos: rotulos.map((r) => r.rotulo), pedidoEmAberto: String(e.pedido_em_aberto ?? '') } }
}

export async function responderComAssistente(e: EntradaDoAssistente): Promise<void> {
  const { admin, workspaceId, pessoa, m, ia } = e
  const registro = criarRegistroDoUso(admin, workspaceId, pessoa.id)
  const plano0 = e.aberto?.plano ?? null
  let emRevisao: PlanoGuardado | null = null
  let substituido = false
  let mensagemDaResposta: string | null = null
  let temAVez = false

  /** Toda resposta do assistente: sem fila; com o plano em revisão de pé, o lembrete na mesma mensagem. */
  const responder = async (texto: string): Promise<Entrega> => {
    const comLembrete = emRevisao && !substituido ? `${texto}\n\n${TEXTOS_FIXOS.lembrete}` : texto
    const entrega = await e.responder(comLembrete, { categoria: 'assistente', semFila: true })
    if (entrega.situacao === 'enviada') mensagemDaResposta = entrega.id
    return entrega
  }
  const fixo = async (texto: string, desfecho: Parameters<RegistroDoUso['fechar']>[0], extra: Parameters<RegistroDoUso['fechar']>[1] = {}) => {
    await responder(texto)
    await registro.fechar(desfecho, extra)
  }

  try {
    // 0. A revisão vem antes de qualquer espera.
    if (plano0?.situacao === 'aberto') emRevisao = await marcarEmRevisao(admin, plano0.id)
    if (e.prazo - Date.now() < LIMITES.turnoMinimoMs) return await fixo(TEXTOS_FIXOS.sem_tempo, 'prazo')

    // 1. Cotas.
    const config = ia.config
    const [turnos, gastoDoEspaco, gastoDaPessoa, detalheDeHoje] = await Promise.all([
      contarTurnos(admin, pessoa.id), gastoDeHoje(admin, workspaceId), gastoDeHoje(admin, workspaceId, { userId: pessoa.id }), leiturasDeHoje(admin, pessoa.id),
    ])
    if (config && gastoDoEspaco !== null) await avisarDoGasto(admin, workspaceId, gastoDoEspaco, Number(config.teto_usd_dia))
    const teto = config ? decidirTeto({ config, turnosNaHora: turnos?.hora ?? 0, turnosNoDia: turnos?.dia ?? 0, gastoDoEspaco: gastoDoEspaco ?? 0, gastoDaPessoa: gastoDaPessoa ?? 0 }) : null
    if (teto) return await fixo(TEXTOS_FIXOS.cota, 'cota', { erro: `teto_${teto}` })

    // 2. A vez da pessoa.
    temAVez = await esperarAVez(admin, workspaceId, pessoa.id, e.prazo)
    if (!temAVez) return await fixo(TEXTOS_FIXOS.ocupado, 'ocupado')

    // 3. A mesma mensagem de novo (a escolha "2" não conta: a pergunta é outra).
    const memoria = await lerMemoria(admin, pessoa.id)
    const hash = hashDoTexto(m.texto)
    if (!e.escolha && textoRepetido(memoria, m.texto)) return await fixo(TEXTOS_FIXOS.repetida, 'repetida')

    // 4. O contexto e o portão.
    const turno = novoTurnoDeLeitura({
      admin, workspaceId, pessoa, nivel: ia.nivel, tabela: memoria.tabela, aoDetalhe: () => registro.detalhe(),
      detalhe: { hoje: detalheDeHoje ?? 0, teto: config?.leituras_detalhe_dia ?? TETOS_PADRAO.leituras_detalhe_dia },
    })
    const atual = emRevisao ?? (plano0?.situacao === 'pergunta' ? plano0 : null)
    const dados = await dadosDoContexto(turno, {
      texto: m.texto, citada: m.citada, memoria, escolha: e.escolha ?? null,
      plano: atual ? { situacao: atual.situacao, passos: atual.passos, opcoes: atual.opcoes, pedidoEmAberto: atual.pedidoEmAberto } : null,
    })
    const permitidas = unirPermitidas(
      acoesPermitidas(m.texto),
      atual?.situacao === 'pergunta' ? atual.permitidas : null,
      emRevisao ? emRevisao.passos.map((p) => TIPO_DO_PASSO[p.acao]) : null,
    )

    // 5. As mensagens, escritas pelo código: o contexto e a mensagem no turno do usuário; a situação depois.
    const { contexto, citada, mensagem } = montarContexto(dados)
    const situacao = textoDaSituacao({
      agora: new Date(), papel: pessoa.papel, nivel: ia.nivel, podeAgir: ia.podeAgir, confirmacaoNoPalacio: false, escrita: ia.escrita,
    })
    const rascunho = criarRascunho()
    // Os preparos: a escrita ligada para a pessoa (e o número recente), as conferências no banco e os limites do dia.
    const preparador = criarPreparador({
      fonte: fonteDoSupabase(admin, workspaceId, pessoa, { quadro: () => quadroDePessoas(turno) }),
      tabela: memoria.tabela, rascunho, pessoaId: pessoa.id, podeAgir: ia.podeAgir, escrita: ia.escrita, recente: ia.recente, base: e.base,
      mensagensDia: config?.mensagens_dia ?? TETOS_PADRAO.mensagens_dia, rotuloDe: (m) => turno.itens[m]?.rotulo ?? null,
    })
    const handlers: Handlers = {
      ler: criarLeitor(turno),
      preparar: preparador.preparar,
      perguntar: (entrada) => montarPergunta(turno, entrada),
    }
    const desfecho: Desfecho = await rodarTurno({
      chamar: chamarClaude,
      executar: criarExecutar({ handlers, permitidas, quantidade: quantidadePedida(m.texto), rascunho, aoUsar: (nome) => registro.usar(nome) }),
      relogio: Date.now,
      params: paramsDoAssistente(),
      inicial: [
        { role: 'user', content: [{ type: 'text', text: contexto }, ...(citada ? [{ type: 'text' as const, text: citada }] : []), { type: 'text', text: mensagem }] },
        { role: 'system', content: situacao },
      ],
      uso: registro,
      rascunho,
      prazo: e.prazo,
    })

    // 6. O desfecho.
    let lista: ListaGuardada | null = null
    if (desfecho.tipo === 'pergunta') {
      const p = desfecho.pergunta
      const guardada = m.numero
        ? await guardarPergunta(admin, { workspaceId, userId: pessoa.id, numero: m.numero, papel: pessoa.papel, opcoes: p.opcoes, pedidoEmAberto: p.pedidoEmAberto || null, permitidas })
        : null
      if (!guardada) {
        await fixo(TEXTOS_FIXOS.sem_tempo, 'erro', { erro: 'pergunta_nao_guardada' })
      } else {
        substituido = true
        const entrega = await responder(textoDaPergunta({ pergunta: p.pergunta, opcoes: p.rotulos, pedidoEmAberto: p.pedidoEmAberto || null }))
        if (entrega.situacao === 'enviada') {
          await marcarEntrega(admin, guardada.id, entrega.id)
          lista = entrega.id ? { m: entrega.id, r: p.opcoes } : null
        } else {
          await entregaFalhou(admin, guardada.id)
        }
        await registro.fechar('pergunta', { planoId: guardada.id })
        await zerarFalhas(admin, workspaceId, config)
      }
    } else if (desfecho.tipo === 'plano') {
      // O texto do modelo é descartado: quem escreve o plano é o código, a partir do banco.
      const sensivel = planoSensivel(rascunho.passos, ia.podeAgir)
      const valido = validarRascunho(rascunho.passos, { ficouDeFora: rascunho.ficouDeFora, sensivel })
      // [etapa 4] O plano sensível vai ao Palácio; até lá, os preparos nem deixam nascer um (por garantia, nada é guardado).
      if (!valido.ok || sensivel || !m.numero) {
        await fixo(!valido.ok ? valido.erro : TEXTOS_FIXOS.sem_confirmacao_no_palacio, 'plano', { erro: 'plano_recusado' })
      } else {
        const guardado = await guardarPlano(admin, { workspaceId, userId: pessoa.id, numero: m.numero, papel: pessoa.papel, passos: valido.passos, permitidas, sensivel })
        // O plano em revisão já foi substituído (e redigido) ao guardar o novo, mesmo se o banco recusou a linha nova.
        substituido = true
        if (!guardado) {
          await fixo(TEXTOS_FIXOS.sem_tempo, 'erro', { erro: 'plano_nao_guardado' })
        } else {
          const entrega = await responder(textoDoPlano({ passos: valido.passos, ficouDeFora: rascunho.ficouDeFora, sensivel }).texto)
          if (entrega.situacao === 'enviada') {
            await marcarEntrega(admin, guardado.id, entrega.id)
          } else {
            // O plano nunca espera na fila: não saiu, cancelado e redigido; o aviso curto, sem dados, vai pela fila normal.
            await entregaFalhou(admin, guardado.id)
            await e.responder(TEXTOS_FIXOS.plano_nao_saiu, { categoria: 'assistente' })
          }
          await registro.fechar('plano', { planoId: guardado.id })
          await zerarFalhas(admin, workspaceId, config)
        }
      }
    } else if (desfecho.tipo === 'resposta') {
      // Os links do Palácio do que ficou de fora (o voto, a mensagem ou o comentário de quem usa a verificação em duas etapas) vão junto.
      const links = [...turno.ajuda, ...preparador.links]
      const texto = desfecho.fixo ? desfecho.texto : posProcessarResposta(desfecho.texto, { itens: turno.itens, ajuda: links, urlBase: e.base })
      const entrega = await responder(texto)
      const citados = desfecho.fixo ? [] : marcadoresNaResposta(desfecho.texto, turno.itens)
      if (entrega.situacao === 'enviada' && entrega.id && citados.length >= 2) lista = { m: entrega.id, r: citados }
      // Um turno sem plano e sem pergunta nova fecha a pergunta aberta (o plano em revisão rearma no finally).
      if (atual?.situacao === 'pergunta') await fecharPergunta(admin, pessoa.id)
      await registro.fechar('resposta')
      await zerarFalhas(admin, workspaceId, config)
    } else if (desfecho.tipo === 'recusa') {
      await fixo(TEXTOS_FIXOS.recusa, 'recusa', { categoriaRecusa: desfecho.categoria })
    } else if (desfecho.tipo === 'teto' || desfecho.tipo === 'prazo') {
      await fixo(TEXTOS_FIXOS.sem_tempo, desfecho.tipo)
    } else {
      await tratarErro(e, desfecho.causa, fixo)
    }

    // 7. A memória: os marcadores desta vez, a lista que saiu e o HMAC do texto.
    await gravarMemoria(admin, workspaceId, pessoa.id, memoria, { lista, ultimoTexto: hash })
  } catch (causa) {
    // Só ids e a classe: a mensagem do erro pode trazer pedaço do que a pessoa escreveu.
    console.error('[whatsapp] assistente: turno falhou:', pessoa.id, classeDoErro(causa), causa instanceof Error ? causa.name : '')
    await registro.fechar('erro', { erro: 'turno' })
    await responder(TEXTOS_FIXOS.fora_do_ar).catch(() => undefined)
  } finally {
    if (emRevisao && !substituido) await rearmar(admin, emRevisao.id, mensagemDaResposta)
    if (temAVez) await soltarVez(admin, pessoa.id)
  }
}

/**
 * O erro da chamada, pela classe: o texto fixo à pessoa (o mesmo em todos), o registro com a classe e o efeito no
 * disjuntor — falha de fora conta (3 em 10 min pausam por 10 min); chave recusada ou modelo inexistente pausam
 * por mais tempo e avisam a administração.
 */
async function tratarErro(e: EntradaDoAssistente, causa: unknown, fixo: (texto: string, d: 'erro', x: { erro: string }) => Promise<void>): Promise<void> {
  const classe = classeDoErro(causa)
  console.error('[whatsapp] assistente: chamada falhou:', e.pessoa.id, classe)
  await fixo(TEXTOS_FIXOS.fora_do_ar, 'erro', { erro: classe })
  if (classe === 'AuthenticationError' || classe === 'PermissionDeniedError' || classe === 'SemChave') {
    await pausarPorConfiguracao(e.admin, e.workspaceId, 'chave', traduzirErro(causa).message)
  } else if (classe === 'NotFoundError') {
    await pausarPorConfiguracao(e.admin, e.workspaceId, 'modelo', traduzirErro(causa, { modelo: modeloDoAssistente(), variavel: 'WHATSAPP_IA_MODELO' }).message)
  } else if ((ERROS_DE_FORA as readonly string[]).includes(classe)) {
    await registrarFalha(e.admin, e.workspaceId, e.ia.config)
  }
}

/** Aos 80% e aos 100% do teto do espaço, a administração é avisada (uma vez por dia cada, no sino e no e-mail). */
async function avisarDoGasto(admin: Admin, workspaceId: string, gasto: number, teto: number): Promise<void> {
  if (!(teto > 0)) return
  const valor = (n: number) => `US$ ${n.toFixed(2).replace('.', ',')}`
  if (gasto >= teto) {
    await alertarAdmins(admin, workspaceId, {
      titulo: 'O assistente do WhatsApp chegou ao teto de hoje',
      mensagem: `O gasto de hoje chegou a ${valor(gasto)} de ${valor(teto)}. O assistente fica desligado até a meia-noite; o bot de comandos continua respondendo. O teto muda em Configurações → WhatsApp.`,
    })
  } else if (gasto >= teto * 0.8) {
    await alertarAdmins(admin, workspaceId, {
      titulo: 'O assistente do WhatsApp passou de 80% do teto de hoje',
      mensagem: `O gasto de hoje está em ${valor(gasto)} de ${valor(teto)}. Ao chegar no teto, o assistente desliga até a meia-noite. O teto muda em Configurações → WhatsApp.`,
    })
  }
}
