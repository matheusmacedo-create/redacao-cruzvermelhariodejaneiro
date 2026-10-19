import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { clienteDoClaude, esforcoDoAssistente, modeloDoAssistente, ttlDoCacheDoAssistente } from '@/lib/ia/anthropic'
import { montarParams, semMensagemDeSistema } from './prompt'
import { LIMITES } from './regras'
import type { CorpoDaChamada, ParamsDaChamada } from './laco'

/**
 * A chamada do assistente do WhatsApp à API da Anthropic, com a mesma chave do resto do Palácio
 * (lib/ia/anthropic.ts: ANTHROPIC_API_KEY ou CLAUDE_API). Sem chave, o assistente nem fica disponível (uso.ts).
 *
 *  - os parâmetros são fixos por rota (prompt.ts, montarParams): modelo, esforço e TTL vêm do ambiente
 *    (WHATSAPP_IA_MODELO, WHATSAPP_IA_ESFORCO, WHATSAPP_IA_CACHE_TTL) e valem para todo mundo;
 *  - o SDK não repete sozinho (maxRetries 0): a repetição é daqui e é UMA — em 529, 5xx, conexão ou tempo, se
 *    ainda sobram LIMITES.repetirComMs do prazo do turno. 429, chave, modelo e pedido inválido não se repetem;
 *  - a primeira BadRequestError de uma chamada com mensagem `role: "system"` repete UMA vez no formato
 *    alternativo (a situação no turno do usuário); se der certo, a instância passa a usar esse formato.
 *
 * Os erros saem como as classes do SDK (Anthropic.RateLimitError, AuthenticationError…): quem decide o texto à
 * pessoa e o disjuntor é index.ts, pela classe — nunca pela mensagem.
 */

/** O modelo desta instância não aceita `role: "system"` no meio das mensagens (aprendido na primeira recusa). */
let semRoleSystem = false

export const paramsDoAssistente = (): ParamsDaChamada =>
  montarParams({ modelo: modeloDoAssistente(), esforco: esforcoDoAssistente(), ttl: ttlDoCacheDoAssistente() })

/** Erro de quem está do outro lado e pode passar logo (529, 5xx, conexão, tempo): vale uma repetição. */
export const erroPassageiro = (causa: unknown): boolean => causa instanceof Anthropic.InternalServerError || causa instanceof Anthropic.APIConnectionError

export async function chamarClaude(corpo: CorpoDaChamada, opcoes: { timeoutMs: number; prazo: number }): Promise<Anthropic.Beta.BetaMessage> {
  const cliente = clienteDoClaude({ timeoutMs: LIMITES.chamadaMs, maxRetries: 0 })
  const comSistema = corpo.messages.some((m) => m.role === 'system')
  let atual = semRoleSystem ? semMensagemDeSistema(corpo) : corpo
  let trocouFormato = false
  let repetiu = false
  for (;;) {
    const tempo = Math.max(1_000, Math.min(opcoes.timeoutMs, LIMITES.chamadaMs, opcoes.prazo - Date.now()))
    try {
      const resposta = await cliente.beta.messages.create(atual, { timeout: tempo })
      if (trocouFormato) semRoleSystem = true
      return resposta
    } catch (causa) {
      if (causa instanceof Anthropic.BadRequestError && comSistema && !semRoleSystem && !trocouFormato) {
        trocouFormato = true
        atual = semMensagemDeSistema(corpo)
        continue
      }
      if (erroPassageiro(causa) && !repetiu && opcoes.prazo - Date.now() >= LIMITES.repetirComMs) {
        repetiu = true
        continue
      }
      throw causa
    }
  }
}
