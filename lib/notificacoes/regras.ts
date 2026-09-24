/**
 * Regras das notificações, sem banco nem rede — dá para conferir com tsx.
 *
 * Todo aviso aparece no sino. O e-mail (no endereço de recuperação
 * confirmado) segue o modelo das redes sociais:
 *  - cada pessoa escolhe, por assunto, receber na hora, num resumo diário
 *    ou nunca;
 *  - quem está com a Redação aberta agora não recebe e-mail do que está
 *    vendo no sino; se não abrir o aviso, ele vai no resumo do dia;
 *  - uma conversa movimentada não vira uma enxurrada: no mesmo link, sai
 *    no máximo um e-mail a cada INTERVALO_NO_MESMO_LINK_MIN minutos.
 *
 * Avisos de segurança da conta (senha, 2FA, e-mail trocado) não passam por
 * aqui: esses saem sempre (lib/contas/servidor.ts).
 */

export const CATEGORIAS = ['aprovacoes', 'mensagens', 'pautas', 'chamados', 'oficios'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const MODOS = ['imediato', 'resumo', 'nunca'] as const
export type Modo = (typeof MODOS)[number]

export const ROTULO_DA_CATEGORIA: Record<Categoria, { nome: string; exemplos: string }> = {
  aprovacoes: { nome: 'Aprovações', exemplos: 'Pedidos para você aprovar e as decisões sobre o que você enviou.' },
  mensagens: { nome: 'Mensagens', exemplos: 'Mensagens diretas e conversas nas pautas de que você participa.' },
  pautas: { nome: 'Pautas e conteúdos', exemplos: 'Quando você entra numa pauta, vira responsável por um cartão ou recebe comentário num conteúdo.' },
  chamados: { nome: 'Chamados', exemplos: 'Respostas, mudanças de situação e atribuições nos chamados de TI e Manutenção.' },
  oficios: { nome: 'Ofícios', exemplos: 'Pedidos de assinatura, recusas, cancelamentos e ofícios concluídos.' },
}

export const ROTULO_DO_MODO: Record<Modo, string> = {
  imediato: 'Na hora',
  resumo: 'Resumo diário',
  nunca: 'Só no sino',
}

export const MODO_PADRAO: Modo = 'imediato'

/** Se a pessoa abriu a Redação há menos que isto, está "online". */
export const ONLINE_MIN = 3
/** No mesmo link, no máximo um e-mail neste intervalo. */
export const INTERVALO_NO_MESMO_LINK_MIN = 15
/** O resumo só pega avisos com pelo menos esta idade (quem estava online teve tempo de ver). */
export const RESUMO_IDADE_MINIMA_MIN = 30
/** Avisos mais velhos que isto não entram no resumo: já perderam a graça. */
export const RESUMO_JANELA_DIAS = 3
/** Itens listados no e-mail de resumo; o resto vira "e mais N". */
export const RESUMO_MAXIMO_DE_ITENS = 12

export const ehCategoria = (valor: unknown): valor is Categoria => CATEGORIAS.includes(valor as Categoria)
export const ehModo = (valor: unknown): valor is Modo => MODOS.includes(valor as Modo)

/** Lê o jsonb de preferências, ignorando o que não for categoria/modo válido. */
export function lerModos(valor: unknown): Record<Categoria, Modo> {
  const bruto = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {}
  return Object.fromEntries(CATEGORIAS.map((c) => [c, ehModo(bruto[c]) ? bruto[c] : MODO_PADRAO])) as Record<Categoria, Modo>
}

export type DecisaoDeEmail = 'agora' | 'resumo' | 'nao'

/**
 * O que fazer com o e-mail de um aviso que acabou de ser criado.
 * 'resumo' = não envia agora; o resumo diário pega se continuar não lido.
 */
export function decidirEmail(p: {
  modo: Modo
  temEmailConfirmado: boolean
  vistoEm: string | null | undefined
  ultimoEmailNoMesmoLink: string | null | undefined
  agora: Date
}): DecisaoDeEmail {
  if (!p.temEmailConfirmado || p.modo === 'nunca') return 'nao'
  if (p.modo === 'resumo') return 'resumo'
  const agora = p.agora.getTime()
  const visto = p.vistoEm ? new Date(p.vistoEm).getTime() : NaN
  if (Number.isFinite(visto) && agora - visto < ONLINE_MIN * 60_000) return 'resumo'
  const ultimo = p.ultimoEmailNoMesmoLink ? new Date(p.ultimoEmailNoMesmoLink).getTime() : NaN
  if (Number.isFinite(ultimo) && agora - ultimo < INTERVALO_NO_MESMO_LINK_MIN * 60_000) return 'resumo'
  return 'agora'
}

/** Só caminhos internos viram link (no sino e no e-mail). */
export function linkInterno(link: string | null | undefined): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null
  return link.slice(0, 500)
}
