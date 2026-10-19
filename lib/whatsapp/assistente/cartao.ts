import type { ModoDoAssistente } from './regras'

/**
 * O cartão "Assistente" de Configurações → WhatsApp: o que ele grava em whatsapp_ia_config e a conferência do que
 * veio da tela. Módulo puro e sem dependência do Node (a tela usa os rótulos e as faixas) — conferido por
 * `npx tsx scripts/conferir-assistente.ts`. Quem grava é a action (app/actions/whatsapp.ts), que confere a
 * permissão (integracoes.configurar) e que as pessoas do piloto são da equipe do espaço.
 */

export const MODOS_DO_CARTAO: { valor: ModoDoAssistente; rotulo: string; ajuda: string }[] = [
  { valor: 'desligado', rotulo: 'Desligado', ajuda: 'O bot responde como sempre, só aos comandos do menu.' },
  { valor: 'piloto', rotulo: 'Piloto', ajuda: 'Só as pessoas escolhidas abaixo.' },
  { valor: 'admins', rotulo: 'Administradores', ajuda: 'Quem administra o espaço.' },
  { valor: 'equipe', rotulo: 'Toda a equipe', ajuda: 'Todo mundo com o WhatsApp confirmado (a equipe da escola fica de fora).' },
]

/** O que o cartão "Assistente" (Configurações → WhatsApp) grava em whatsapp_ia_config. */
export type ConfigDoCartao = {
  modo: ModoDoAssistente; piloto: string[]; escrita: boolean
  teto_usd_dia: number; teto_usd_pessoa_dia: number; turnos_pessoa_hora: number; turnos_pessoa_dia: number; leituras_detalhe_dia: number; mensagens_dia: number
}

/** As faixas de cada teto (as mesmas dos CHECK da migração, um pouco mais apertadas onde o banco deixa demais). */
export const FAIXAS_DO_CARTAO: Record<Exclude<keyof ConfigDoCartao, 'modo' | 'piloto' | 'escrita'>, { min: number; max: number; inteiro: boolean }> = {
  teto_usd_dia: { min: 0, max: 1000, inteiro: false },
  teto_usd_pessoa_dia: { min: 0, max: 100, inteiro: false },
  turnos_pessoa_hora: { min: 0, max: 200, inteiro: true },
  turnos_pessoa_dia: { min: 0, max: 1000, inteiro: true },
  leituras_detalhe_dia: { min: 0, max: 500, inteiro: true },
  mensagens_dia: { min: 0, max: 50, inteiro: true },
}

/** Até tantas pessoas no piloto (o CHECK da migração). */
export const PILOTO_MAXIMO = 50

const UUID_DO_PILOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Confere o que veio do cartão antes de gravar: o modo da lista, o piloto só com uuids (até PILOTO_MAXIMO, sem
 * repetir; que são do espaço, a action confere), a escrita booleana e cada teto na faixa, com até 2 casas nos
 * dólares. O erro é uma frase para a tela.
 */
export function lerConfigDoCartao(e: unknown): { ok: true; valor: ConfigDoCartao } | { ok: false; erro: string } {
  const x = e && typeof e === 'object' && !Array.isArray(e) ? e as Record<string, unknown> : null
  if (!x) return { ok: false, erro: 'Configuração inválida.' }
  const modo = String(x.modo ?? '')
  if (!['desligado', 'piloto', 'admins', 'equipe'].includes(modo)) return { ok: false, erro: 'Escolha um dos modos.' }
  const piloto = Array.isArray(x.piloto) ? [...new Set(x.piloto.map((p) => String(p).toLowerCase()))] : []
  if (piloto.some((p) => !UUID_DO_PILOTO.test(p))) return { ok: false, erro: 'Pessoa do piloto inválida.' }
  if (piloto.length > PILOTO_MAXIMO) return { ok: false, erro: `O piloto vai até ${PILOTO_MAXIMO} pessoas.` }
  if (modo === 'piloto' && !piloto.length) return { ok: false, erro: 'Escolha quem entra no piloto (ou outro modo).' }
  const valor: Record<string, unknown> = { modo, piloto, escrita: x.escrita === true }
  for (const [campo, faixa] of Object.entries(FAIXAS_DO_CARTAO)) {
    const n = Number(String(x[campo] ?? '').replace(',', '.'))
    if (!Number.isFinite(n) || n < faixa.min || n > faixa.max || (faixa.inteiro && !Number.isInteger(n))) {
      return { ok: false, erro: `${ROTULO_DO_TETO[campo as keyof typeof FAIXAS_DO_CARTAO]}: de ${faixa.min} a ${faixa.max.toLocaleString('pt-BR')}${faixa.inteiro ? '' : ', com até 2 casas'}.` }
    }
    valor[campo] = faixa.inteiro ? n : Math.round(n * 100) / 100
  }
  return { ok: true, valor: valor as ConfigDoCartao }
}

/** Os nomes dos tetos na tela (e no erro). */
export const ROTULO_DO_TETO: Record<keyof typeof FAIXAS_DO_CARTAO, string> = {
  teto_usd_dia: 'Gasto do espaço por dia (US$)',
  teto_usd_pessoa_dia: 'Gasto por pessoa por dia (US$)',
  turnos_pessoa_hora: 'Conversas por pessoa por hora',
  turnos_pessoa_dia: 'Conversas por pessoa por dia',
  leituras_detalhe_dia: 'Consultas detalhadas por pessoa por dia',
  mensagens_dia: 'Mensagens diretas por pessoa por dia',
}

