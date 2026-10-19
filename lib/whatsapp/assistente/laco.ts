import type Anthropic from '@anthropic-ai/sdk'
import {
  AVISO_NADA_FOI_FEITO, LIMITES, TEXTOS_FIXOS, afirmaQueFez, conferirIntencao, conferirQuantidade, depoisDoUltimoRecuo, ehFerramenta, jsonCanonico, paraReenviar,
  tipoDaFerramenta, validarEntrada, type FicouDeFora, type NomeDaFerramenta, type Passo, type TipoDeAcao,
} from './regras'

/**
 * O laço de um turno do assistente do WhatsApp (uma mensagem da pessoa): chama o modelo, roda as ferramentas e
 * decide o desfecho. Manual, e não o tool runner do SDK, de propósito:
 *  - o preparo é terminal: quando a resposta só traz preparar_* e todos passam, o plano está pronto e não há
 *    segunda chamada (o caso do dono custa UMA chamada);
 *  - `refusal` e `max_tokens` são tratados ANTES de qualquer ferramenta (um tool_use cortado nunca roda);
 *  - há um prazo duro (a rota do webhook tem 300 s para o lote inteiro);
 *  - o recuo da API (fallbacks): só valem os blocos depois do último `fallback`, e o que vem antes dele volta
 *    à API sem raciocínio nem tool_use (paraReenviar, regras.ts);
 *  - o cliente é injetado (`chamar`): os testes rodam com um modelo roteirizado, sem gastar nada.
 *
 * Módulo puro (os tipos do SDK são só tipos) — conferido por `npx tsx scripts/conferir-assistente.ts`. Quem
 * chama (index.ts) monta as mensagens, os handlers das ferramentas e o registro do uso.
 */

type Resposta = Anthropic.Beta.BetaMessage
type Mensagem = Anthropic.Beta.BetaMessageParam
type UsoDeFerramenta = Anthropic.Beta.BetaToolUseBlock
type ResultadoDeFerramenta = Anthropic.Beta.BetaToolResultBlockParam

/** Os parâmetros fixos da rota (claude.ts, paramsDoAssistente), sem as mensagens. */
export type ParamsDaChamada = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'messages'>
export type CorpoDaChamada = Anthropic.Beta.MessageCreateParamsNonStreaming

/** A chamada ao modelo: claude.ts (chamarClaude) no servidor; um roteiro nos testes. `prazo`: a hora-limite do turno (ms). */
export type Chamar = (corpo: CorpoDaChamada, opcoes: { timeoutMs: number; prazo: number }) => Promise<Resposta>

/** A pergunta pronta para a pessoa: as opções (marcadores) com os rótulos do banco, escritos pelo código. */
export type PerguntaPronta = { pergunta: string; opcoes: string[]; rotulos: string[]; pedidoEmAberto: string }

export type Desfecho =
  | { tipo: 'plano' }
  | { tipo: 'pergunta'; pergunta: PerguntaPronta }
  /** `fixo`: o texto é do código (o modelo insistiu em dizer que fez). */
  | { tipo: 'resposta'; texto: string; fixo?: boolean }
  | { tipo: 'recusa'; categoria: string | null }
  | { tipo: 'teto' }
  | { tipo: 'prazo' }
  | { tipo: 'erro'; causa: unknown }

// ------------------------------------------------------------------ o rascunho do plano (em memória, nunca gravado aqui)

export type Rascunho = {
  readonly passos: Passo[]
  /** O que ficou de fora no preparo: a última tentativa por alvo (o código escreve o quê e o porquê). */
  readonly ficouDeFora: FicouDeFora[]
  temPassos(): boolean
  /** Acrescenta e devolve a chave do passo (para retirar depois, se a conferência de quantidade mandar). O passo igual a um que já está não entra de novo. */
  acrescentar(passo: Passo, alvo: string): number
  retirar(chaves: number[]): void
  /** O que ficou de fora; o alvo que já está no plano não conta (a segunda tentativa recusada não apaga a primeira que passou). */
  ficou(alvo: string, f: FicouDeFora): void
  descartar(): void
}

export function criarRascunho(): Rascunho {
  let itens: { chave: number; passo: Passo; alvo: string }[] = []
  const fora = new Map<string, FicouDeFora>()
  let proxima = 1
  return {
    get passos() { return itens.map((i) => i.passo) },
    get ficouDeFora() { return [...fora.values()] },
    temPassos: () => itens.length > 0,
    acrescentar(passo, alvo) {
      fora.delete(alvo)
      const igual = itens.find((i) => jsonCanonico(i.passo) === jsonCanonico(passo))
      if (igual) return igual.chave
      const chave = proxima++
      itens.push({ chave, passo, alvo })
      return chave
    },
    retirar(chaves) { itens = itens.filter((i) => !chaves.includes(i.chave)) },
    ficou(alvo, f) {
      if (itens.some((i) => i.alvo === alvo)) return
      fora.delete(alvo)
      fora.set(alvo, f)
    },
    descartar() {
      itens = []
      fora.clear()
    },
  }
}

// ------------------------------------------------------------------ as ferramentas de uma resposta

export type ResultadoDaLeitura = { ok: true; conteudo: string } | { ok: false; erro: string }
/**
 * O preparo: o passo resolvido, ou o erro. `erro` vai ao modelo (is_error); `motivo` é o que a pessoa lê em "Ficou de
 * fora" (sem ele, o próprio erro); `link`: onde fazer no Palácio, quando dá (a conta com a verificação em duas etapas).
 */
export type ResultadoDoPreparo = { ok: true; passo: Passo } | { ok: false; erro: string; oQue?: string; motivo?: string; link?: string }

/** O que cada ferramenta faz de verdade (leituras.ts e preparos.ts). A entrada já vem validada. */
export type Handlers = {
  ler(nome: NomeDaFerramenta, entrada: Record<string, unknown>): Promise<ResultadoDaLeitura>
  preparar(nome: NomeDaFerramenta, entrada: Record<string, unknown>): Promise<ResultadoDoPreparo>
  perguntar(entrada: Record<string, unknown>): Promise<{ ok: true; pergunta: PerguntaPronta } | { ok: false; erro: string }>
}

export type Executar = (usos: UsoDeFerramenta[]) => Promise<{ resultados: ResultadoDeFerramenta[]; terminal: Desfecho | null }>

/** O que entra em "Ficou de fora: …" quando o preparo não diz. */
const O_QUE: Partial<Record<NomeDaFerramenta, string>> = {
  preparar_voto: 'um voto', preparar_mensagem_direta: 'uma mensagem', preparar_comentario_no_chamado: 'um comentário no chamado',
  preparar_chamado: 'abrir um chamado', preparar_resposta_a_visita: 'a resposta à portaria', preparar_marcar_avisos_lidos: 'marcar avisos como lidos',
}

/** O alvo de um preparo (a última tentativa por alvo é a que entra em "Ficou de fora"). */
function alvoDoPreparo(nome: string, entrada: unknown): string {
  const e = entrada && typeof entrada === 'object' ? entrada as Record<string, unknown> : {}
  const item = e.aprovacao ?? e.para ?? e.chamado ?? e.visita ?? e.fila ?? ''
  return `${nome}:${typeof item === 'string' ? item : ''}`
}

const ehPreparo = (nome: string) => nome.startsWith('preparar_')
const comoErro = (id: string, texto: string): ResultadoDeFerramenta => ({ type: 'tool_result', tool_use_id: id, content: texto, is_error: true })
const comoResultado = (id: string, texto: string): ResultadoDeFerramenta => ({ type: 'tool_result', tool_use_id: id, content: texto })

/** A promessa ou o erro de tempo, o que vier primeiro (o relógio do teste não espera de verdade). */
function comPrazo<T>(p: Promise<T>, ms: number): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const tempo = new Promise<never>((_, falhar) => { relogio = setTimeout(() => falhar(new Error('tempo')), ms) })
  return Promise.race([p, tempo]).finally(() => clearTimeout(relogio))
}

/**
 * As ferramentas de UMA resposta do modelo, com as regras do código:
 *  - entrada validada (regras.ts, validarEntrada) antes de tudo;
 *  - `perguntar` válido é terminal, e os preparar_* da mesma resposta são descartados;
 *  - leituras em paralelo, LIMITES.leituraMs cada, e no máximo LIMITES.leituras no turno (a seguinte é is_error);
 *  - preparar_* em ordem, cada um passando pelo portão de intenção (o que a MENSAGEM pediu) e, os votos, pela
 *    conferência de quantidade ("as duas" e três votos: os desta resposta saem e o modelo pergunta quais);
 *  - terminal quando a resposta só traz preparar_* e todos passaram: o plano está pronto.
 */
export function criarExecutar(c: {
  handlers: Handlers
  permitidas: readonly TipoDeAcao[]
  quantidade: number | null
  rascunho: Rascunho
  limites?: { leituras: number; leituraMs: number }
  /** Cada ferramenta chamada (o registro guarda só os nomes). */
  aoUsar?: (nome: string) => void
}): Executar {
  const limites = c.limites ?? { leituras: LIMITES.leituras, leituraMs: LIMITES.leituraMs }
  let leiturasNoTurno = 0

  return async (usos) => {
    for (const u of usos) c.aoUsar?.(u.name)
    const resultados: (ResultadoDeFerramenta | null)[] = usos.map(() => null)
    const validas = usos.map((u) => validarEntrada(u.name, u.input))

    // 1. perguntar: válido, termina a vez (o resto desta resposta não roda).
    const iPergunta = usos.findIndex((u) => u.name === 'perguntar')
    if (iPergunta >= 0) {
      const v = validas[iPergunta]
      if (v.ok) {
        const r = await c.handlers.perguntar(v.valor).catch(() => ({ ok: false as const, erro: 'Não deu para montar a pergunta agora.' }))
        if (r.ok) return { resultados: [], terminal: { tipo: 'pergunta', pergunta: r.pergunta } }
        resultados[iPergunta] = comoErro(usos[iPergunta].id, r.erro)
      } else {
        resultados[iPergunta] = comoErro(usos[iPergunta].id, v.erro)
      }
    }

    // 2. leituras, em paralelo e com teto.
    const leituras: Promise<void>[] = []
    usos.forEach((u, i) => {
      if (resultados[i] || ehPreparo(u.name) || u.name === 'perguntar') return
      const v = validas[i]
      if (!ehFerramenta(u.name) || !v.ok) { resultados[i] = comoErro(u.id, v.ok ? 'Ferramenta desconhecida.' : v.erro); return }
      if (leiturasNoTurno >= limites.leituras) { resultados[i] = comoErro(u.id, TEXTOS_FIXOS.limite_do_turno); return }
      leiturasNoTurno++
      const nome = u.name
      leituras.push(comPrazo(c.handlers.ler(nome, v.valor), limites.leituraMs)
        .then((r) => { resultados[i] = r.ok ? comoResultado(u.id, r.conteudo) : comoErro(u.id, r.erro) })
        .catch(() => { resultados[i] = comoErro(u.id, 'Não deu para consultar agora; tente de outro jeito ou siga sem isso.') }))
    })
    await Promise.all(leituras)

    // 3. preparos, em ordem.
    let todosPassaram = true
    const votosDestaResposta: { i: number; chave: number }[] = []
    for (const [i, u] of usos.entries()) {
      if (resultados[i] || !ehPreparo(u.name)) continue
      const alvo = alvoDoPreparo(u.name, u.input)
      const oQue = O_QUE[u.name as NomeDaFerramenta] ?? 'um passo'
      const v = validas[i]
      if (!ehFerramenta(u.name) || !v.ok) {
        todosPassaram = false
        resultados[i] = comoErro(u.id, v.ok ? 'Ferramenta desconhecida.' : v.erro)
        c.rascunho.ficou(alvo, { oQue, motivo: 'o pedido veio incompleto' })
        continue
      }
      if (!conferirIntencao(u.name, c.permitidas)) {
        todosPassaram = false
        resultados[i] = comoErro(u.id, TEXTOS_FIXOS.nao_pediu)
        c.rascunho.ficou(alvo, { oQue, motivo: 'você não pediu isso nesta mensagem' })
        continue
      }
      const r: ResultadoDoPreparo = await c.handlers.preparar(u.name, v.valor).catch(() => ({ ok: false as const, erro: 'Não deu para preparar agora.' }))
      if (!r.ok) {
        todosPassaram = false
        resultados[i] = comoErro(u.id, r.erro)
        c.rascunho.ficou(alvo, { oQue: r.oQue ?? oQue, motivo: r.motivo ?? r.erro, ...(r.link ? { link: r.link } : {}) })
        continue
      }
      const chave = c.rascunho.acrescentar(r.passo, alvo)
      resultados[i] = comoResultado(u.id, `passo ${c.rascunho.passos.length} preparado`)
      if (tipoDaFerramenta(u.name) === 'voto') votosDestaResposta.push({ i, chave })
    }

    // 4. a quantidade que a pessoa disse ("as duas") contra os votos do rascunho.
    if (votosDestaResposta.length) {
      const erro = conferirQuantidade(c.quantidade, c.rascunho.passos.filter((p) => p.acao === 'votar').length)
      if (erro) {
        todosPassaram = false
        c.rascunho.retirar(votosDestaResposta.map((v) => v.chave))
        for (const { i } of votosDestaResposta) resultados[i] = comoErro(usos[i].id, erro)
      }
    }

    const soPreparos = usos.length > 0 && usos.every((u) => ehPreparo(u.name))
    const terminal: Desfecho | null = soPreparos && todosPassaram && c.rascunho.temPassos() ? { tipo: 'plano' } : null
    return { resultados: resultados.map((r, i) => r ?? comoErro(usos[i].id, 'Ferramenta desconhecida.')), terminal }
  }
}

// ------------------------------------------------------------------ o turno

export type EntradaDoTurno = {
  chamar: Chamar
  executar: Executar
  relogio: () => number
  params: ParamsDaChamada
  /** [user (contexto, citada, mensagem), system (a situação)]: montadas pelo código (index.ts). */
  inicial: Mensagem[]
  /** O registro do uso, a CADA chamada (uma função cortada pelo maxDuration não esconde o gasto). */
  uso: { somar(r: Resposta): Promise<void> | void }
  rascunho: Rascunho
  /** A hora-limite que a rota deu a este turno (ms). */
  prazo: number
  limites?: { chamadas: number; prazoMs: number; folgaMs: number; chamadaMs: number }
}

/** Só os blocos de texto, pelo tipo (as notas entre ferramentas voltam em blocos thinking, que não contam). */
export function textoDe(blocos: { type: string }[]): string {
  return blocos.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('').trim()
}

export async function rodarTurno(e: EntradaDoTurno): Promise<Desfecho> {
  const limites = e.limites ?? { chamadas: LIMITES.chamadas, prazoMs: LIMITES.prazoMs, folgaMs: LIMITES.folgaMs, chamadaMs: LIMITES.chamadaMs }
  const prazo = Math.min(e.prazo, e.relogio() + limites.prazoMs)
  const messages: Mensagem[] = [...e.inicial]
  let cobrou = false
  for (let volta = 0; volta < limites.chamadas; volta++) {
    if (prazo - e.relogio() < limites.folgaMs) return e.rascunho.temPassos() ? { tipo: 'plano' } : { tipo: 'prazo' }
    let r: Resposta
    try {
      r = await e.chamar({ ...e.params, messages: [...messages] }, { timeoutMs: Math.min(limites.chamadaMs, prazo - e.relogio()), prazo })
    } catch (causa) {
      return { tipo: 'erro', causa }
    }
    await e.uso.somar(r)
    // A recusa e o teto vêm antes de ler qualquer bloco: nada da resposta roda.
    if (r.stop_reason === 'refusal') {
      e.rascunho.descartar()
      return { tipo: 'recusa', categoria: r.stop_details?.category ?? null }
    }
    if (r.stop_reason === 'max_tokens') return { tipo: 'teto' }
    if (r.stop_reason === 'pause_turn') return { tipo: 'erro', causa: 'pause_turn' }

    const vigente = depoisDoUltimoRecuo(r.content)
    const usos = vigente.filter((b): b is UsoDeFerramenta => b.type === 'tool_use')
    if (!usos.length) {
      const texto = textoDe(vigente)
      if (!e.rascunho.temPassos() && afirmaQueFez(texto)) {
        if (cobrou) return { tipo: 'resposta', texto: TEXTOS_FIXOS.nao_fiz, fixo: true }
        cobrou = true
        messages.push({ role: 'assistant', content: paraReenviar(r.content) }, { role: 'user', content: [{ type: 'text', text: AVISO_NADA_FOI_FEITO }] })
        continue
      }
      return e.rascunho.temPassos() ? { tipo: 'plano' } : { tipo: 'resposta', texto }
    }
    const { resultados, terminal } = await e.executar(usos)
    if (terminal) return terminal
    // Sem recuo, o conteúdo volta inteiro e sem mudança (os blocos thinking também: a API confere a assinatura).
    messages.push({ role: 'assistant', content: paraReenviar(r.content) })
    messages.push({ role: 'user', content: resultados })
  }
  return e.rascunho.temPassos() ? { tipo: 'plano' } : { tipo: 'teto' }
}
