/**
 * O vocabulário de estado de uma pauta, em um lugar só.
 *
 * Estava escrito à mão em cada tela: a ação de mover validava contra uma
 * lista, o painel contava "atrasadas" excluindo outra — que incluía um `done`
 * que nunca existiu no banco. Duas listas para a mesma coisa é como um cartão
 * de alerta passa a contar errado sem ninguém notar.
 */
export const STATUS_DA_PAUTA = [
  'incoming', 'collection', 'production', 'review', 'approval', 'approved', 'archived',
] as const

export type StatusDaPauta = (typeof STATUS_DA_PAUTA)[number]

/** O que ainda depende de alguém — é sobre isto que faz sentido cobrar prazo. */
export const STATUS_EM_ABERTO: StatusDaPauta[] = [
  'incoming', 'collection', 'production', 'review', 'approval',
]
