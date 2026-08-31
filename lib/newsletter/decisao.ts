/**
 * O que fazer com um pedido de inscrição.
 *
 * Separado da rota de propósito. Aqui moram as regras que protegem a lista —
 * não reenviar convite a quem já está dentro, não repetir convite recente, não
 * deixar um IP encher a base — e regra de segurança que só dá para conferir
 * com um banco na frente é regra que ninguém confere. Como função pura, cada
 * caminho tem um teste.
 *
 * A rota fica com o que é entrada e saída: ler o formulário, consultar,
 * gravar, mandar o e-mail.
 */

/** Quantas inscrições um mesmo endereço de IP pode originar por hora. */
export const LIMITE_POR_IP = 5

/** Janela em que um convite não é repetido para o mesmo endereço. */
export const MINUTOS_ENTRE_CONVITES = 5

export type InscritoExistente = {
  id: string
  estado: 'pendente' | 'confirmado' | 'descadastrado' | 'invalido'
  updated_at: string | null
} | null

export type Decisao =
  /** Grava (inserindo ou atualizando) e manda o convite. */
  | { acao: 'gravar'; atualizar: string | null }
  /**
   * Não faz nada, e responde exatamente como se tivesse feito.
   *
   * O `porque` existe só para o log e para os testes: ele NUNCA pode chegar a
   * quem chamou a rota. Se a resposta variasse conforme o motivo, qualquer um
   * descobriria quem está na lista testando endereços um a um — e a lista de
   * quem apoia uma instituição humanitária não é informação pública.
   */
  | { acao: 'silenciar'; porque: 'ja-confirmado' | 'convite-recente' | 'limite-de-ip' }

export function decidirInscricao(entrada: {
  existente: InscritoExistente
  inscricoesDoIpNaHora: number
  agora?: number
}): Decisao {
  const agora = entrada.agora ?? Date.now()

  // O limite de IP vem antes de tudo: é a defesa contra o robô, e ela não pode
  // depender de o endereço já existir ou não na base.
  if (entrada.inscricoesDoIpNaHora >= LIMITE_POR_IP) {
    return { acao: 'silenciar', porque: 'limite-de-ip' }
  }

  const existente = entrada.existente
  if (!existente) return { acao: 'gravar', atualizar: null }

  // Quem já confirmou não recebe convite de novo. Além de inútil, seria o
  // caminho por onde um formulário público vira ferramenta de importunar
  // alguém: bastaria reenviar o endereço da vítima sem parar.
  if (existente.estado === 'confirmado') {
    return { acao: 'silenciar', porque: 'ja-confirmado' }
  }

  // Pendente e recém-convidado: não repetir. Sem isto, o mesmo endereço
  // receberia um convite por clique.
  if (existente.estado === 'pendente' && existente.updated_at) {
    const desdeOConvite = agora - new Date(existente.updated_at).getTime()
    if (desdeOConvite >= 0 && desdeOConvite < MINUTOS_ENTRE_CONVITES * 60_000) {
      return { acao: 'silenciar', porque: 'convite-recente' }
    }
  }

  // Descadastrado que volta é atualizado, não bloqueado: a pessoa pediu, e a
  // confirmação em duas etapas prova que é ela. Bloquear para sempre quem um
  // dia saiu transformaria um "não quero agora" num "nunca mais".
  return { acao: 'gravar', atualizar: existente.id }
}
