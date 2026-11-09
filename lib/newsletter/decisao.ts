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

/**
 * Janela em que um convite não é repetido para o mesmo endereço. Longa o
 * bastante para o formulário não virar ferramenta de encher a caixa de alguém.
 */
export const MINUTOS_ENTRE_CONVITES = 30

/**
 * Janela em que um material (a lista do kit de emergência, lib/newsletter/materiais.ts) não é entregue de novo a quem
 * JÁ ESTÁ na lista. Um dia: quem perdeu a mensagem consegue pedir outra amanhã, e ninguém consegue usar a caixa das
 * matérias para mandar mais de uma mensagem por dia ao endereço de outra pessoa.
 */
export const HORAS_ENTRE_ENTREGAS = 24

export type InscritoExistente = {
  id: string
  estado: 'pendente' | 'confirmado' | 'descadastrado' | 'invalido'
  updated_at: string | null
} | null

export type Decisao =
  /** Grava (inserindo ou atualizando) e manda o convite. */
  | { acao: 'gravar'; atualizar: string | null }
  /**
   * Já está na lista e pediu um material: recebe só o material. Nada do registro dela muda (nem o aceite, nem a
   * origem): a rota apenas marca a hora da entrega, para a janela de HORAS_ENTRE_ENTREGAS valer no próximo pedido.
   */
  | { acao: 'entregar'; inscrito: string }
  /**
   * Não faz nada, e responde exatamente como se tivesse feito.
   *
   * O `porque` existe só para o log e para os testes: ele NUNCA pode chegar a
   * quem chamou a rota. Se a resposta variasse conforme o motivo, qualquer um
   * descobriria quem está na lista testando endereços um a um — e a lista de
   * quem apoia uma instituição humanitária não é informação pública.
   */
  | { acao: 'silenciar'; porque: 'ja-confirmado' | 'convite-recente' | 'limite-de-ip' | 'entrega-recente' }

export function decidirInscricao(entrada: {
  existente: InscritoExistente
  inscricoesDoIpNaHora: number
  /** O pedido veio da caixa de um material (a lista do kit), e não do formulário de inscrição. */
  pedeMaterial?: boolean
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
  //
  // O MATERIAL é outra coisa (09/11/2026): quem já está na lista e pede a lista
  // do kit espera recebê-la, e no primeiro pedido de verdade foi exatamente
  // isso que faltou: a caixa disse "a lista vai para o seu e-mail" a um
  // inscrito antigo, e nada chegou. Ele recebe o material, no máximo uma vez a
  // cada HORAS_ENTRE_ENTREGAS: a hora da última mudança da linha (updated_at)
  // é o relógio, e a rota a atualiza a cada entrega. É menos do que o
  // formulário já permite com quem NÃO está na lista (um convite a cada 30
  // minutos), e a mensagem vai para quem escolheu receber mensagens da filial.
  //
  // O relógio é a última MUDANÇA, e não só a última entrega, porque a tabela
  // não tem coluna para a entrega. Erra para o lado de não enviar: quem
  // confirmou a inscrição há menos de um dia também espera. Para quem
  // confirmou pela própria mensagem da lista está certo (acabou de baixar);
  // para quem confirmou pelo formulário da home e pede a lista no mesmo dia,
  // não, e o caminho dela é o link do guia que a caixa mostra. Se isso pesar,
  // o conserto é uma coluna só da entrega, numa migração.
  if (existente.estado === 'confirmado') {
    if (!entrada.pedeMaterial) return { acao: 'silenciar', porque: 'ja-confirmado' }
    const desdeAUltima = existente.updated_at ? agora - new Date(existente.updated_at).getTime() : Number.POSITIVE_INFINITY
    if (desdeAUltima >= 0 && desdeAUltima < HORAS_ENTRE_ENTREGAS * 3600_000) {
      return { acao: 'silenciar', porque: 'entrega-recente' }
    }
    return { acao: 'entregar', inscrito: existente.id }
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
