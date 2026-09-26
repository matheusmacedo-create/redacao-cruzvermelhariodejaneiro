/**
 * Pendente, respondida ou resolvida: a situação de cada item do Direct das
 * redes, igual para toda a equipe. Módulo puro — conferido por
 * scripts/conferir-direct.ts.
 *
 * Duas fontes se somam:
 *  - a rede: numa conversa, se a última palavra foi nossa, ela está em dia
 *    (vale também para o que foi respondido direto no aplicativo);
 *  - o registro da equipe (direct_atendimentos): respondida por aqui, ou
 *    "resolvida" — não precisa de resposta (um obrigado, uma figurinha).
 *
 * Numa conversa, mensagem nova do público DEPOIS do registro reabre: quem
 * resolveu ontem não resolveu a pergunta de hoje. Comentário é um item só, e
 * o registro vale para sempre (até alguém reabrir).
 */
import type { Mensagem } from './normalizar'

export type Registro = { situacao: 'respondida' | 'resolvida'; por: string | null; nome?: string | null; em: string }
export type Situacao = 'pendente' | 'respondida' | 'resolvida' | 'em_dia'

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  pendente: 'Pendente',
  respondida: 'Respondida',
  resolvida: 'Resolvida',
  em_dia: 'Em dia',
}

/** Quando o público falou pela última vez numa conversa (ISO), ou '' se não dá para saber. */
export function ultimaDoPublico(m: Mensagem): string {
  const falas = m.conversa ?? []
  for (let i = falas.length - 1; i >= 0; i--) if (!falas[i].nossa) return falas[i].quando
  return m.origem === 'comentario' ? m.quando : ''
}

export function situacaoDe(m: Mensagem, registro: Registro | undefined): Situacao {
  if (m.origem === 'comentario') return registro ? registro.situacao : 'pendente'
  // O registro vale se veio depois da última fala do público (sem data dela, vale: não dá para provar que é mais nova).
  const publico = ultimaDoPublico(m)
  const registroVale = Boolean(registro) && (!publico || new Date(publico).getTime() <= new Date(registro!.em).getTime())
  if (registroVale) return registro!.situacao
  // Sem registro valendo: a rede diz se a última palavra foi nossa (respondida no próprio aplicativo).
  return m.aguardandoResposta === false ? 'em_dia' : 'pendente'
}

export const estaPendente = (m: Mensagem, registro: Registro | undefined) => situacaoDe(m, registro) === 'pendente'
