/**
 * O vocabulário da trilha de auditoria pública (docs/auditoria-publica.md).
 * Espelho das listas fechadas da migração 20260925203000_cvrj_auditoria.sql:
 * mudou lá, muda aqui no mesmo commit.
 */

export const TIPOS = ['materia', 'comunicado', 'oficio', 'certificado', 'documento', 'parceria', 'canais'] as const
export type TipoDeItem = (typeof TIPOS)[number]

export const ROTULO_DO_TIPO: Record<TipoDeItem, string> = {
  materia: 'Matéria publicada no site',
  comunicado: 'Comunicado à imprensa',
  oficio: 'Ofício',
  certificado: 'Certificado de curso',
  documento: 'Documento do portal de transparência',
  parceria: 'Parceria com o poder público (MROSC)',
  canais: 'Página de canais oficiais',
}

/** P: público por natureza; V: verificável por quem tem o documento; C: certificado. */
export const CLASSES = ['P', 'V', 'C'] as const
export type Classe = (typeof CLASSES)[number]

export const ESTADOS = ['vigente', 'substituido', 'revogado', 'retirado'] as const
export type EstadoDoItem = (typeof ESTADOS)[number]

export const ROTULO_DO_ESTADO: Record<EstadoDoItem, string> = {
  vigente: 'Vigente',
  substituido: 'Substituído por versão mais nova',
  revogado: 'Revogado',
  retirado: 'Retirado',
}

export const ACOES = [
  'item.registrado', 'item.substituido', 'item.revogado', 'item.retirado',
  'auditoria.verificacao_ok', 'auditoria.verificacao_falhou', 'auditoria.lote_fechado',
] as const
export type Acao = (typeof ACOES)[number]

export const MOTIVOS = ['erro_material', 'decisao_administrativa', 'pedido_do_titular', 'retirado_do_ar', 'outro'] as const
export type Motivo = (typeof MOTIVOS)[number]

export const ROTULO_DO_MOTIVO: Record<Motivo, string> = {
  erro_material: 'Erro material',
  decisao_administrativa: 'Decisão administrativa',
  pedido_do_titular: 'Pedido do titular dos dados',
  retirado_do_ar: 'Retirado do ar',
  outro: 'Outro',
}

/** O código de 26 caracteres da trilha (base32 de Crockford, 128 bits). */
export const CODIGO_DA_TRILHA = /^[0-9A-HJKMNP-TV-Z]{25}[048CGMRW]$/
export const CODIGO_DE_OFICIO = /^[0-9a-f]{32}$/
export const CODIGO_DE_CERTIFICADO = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

export type CodigoLido =
  | { tipo: 'trilha'; codigo: string }
  | { tipo: 'oficio'; codigo: string }
  | { tipo: 'certificado'; codigo: string }

/**
 * Lê o que a pessoa digitou, com as mesmas regras do banco
 * (auditoria.item_por_codigo): espaços somem; no código da trilha, hífens
 * somem, O vira 0 e I e L viram 1.
 */
export function lerCodigo(bruto: unknown): CodigoLido | null {
  if (typeof bruto !== 'string' || bruto.length > 200) return null
  const v = bruto.replace(/\s+/g, '').toUpperCase()
  if (CODIGO_DE_CERTIFICADO.test(v)) return { tipo: 'certificado', codigo: v }
  if (/^[0-9A-F]{32}$/.test(v)) return { tipo: 'oficio', codigo: v.toLowerCase() }
  const t = v.replace(/-/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (CODIGO_DA_TRILHA.test(t)) return { tipo: 'trilha', codigo: t }
  return null
}

/** O código de 26 caracteres em grupos (5-5-5-5-6), para imprimir e ler em voz alta; outros códigos passam como estão. */
export const codigoEmGrupos = (codigo: string) =>
  codigo.length === 26 ? [0, 5, 10, 15].map((i) => codigo.slice(i, i + 5)).join('-') + '-' + codigo.slice(20) : codigo

/** Os fluxos em uso (F01 a F12 são do escopo da intranet, reservados). */
export const ROTULO_DO_FLUXO: Record<string, string> = {
  F13: 'Matérias no site',
  F14: 'Ofícios',
  F15: 'Certificados',
  F16: 'Portal de transparência',
  F17: 'Canais oficiais',
  F18: 'Comunicados à imprensa',
  F19: 'Conferências e lotes',
}

export const ROTULO_DA_ACAO: Record<Acao, string> = {
  'item.registrado': 'Registrado',
  'item.substituido': 'Substituído por versão nova',
  'item.revogado': 'Revogado',
  'item.retirado': 'Retirado',
  'auditoria.verificacao_ok': 'Cadeia conferida: íntegra',
  'auditoria.verificacao_falhou': 'Cadeia conferida: divergência',
  'auditoria.lote_fechado': 'Lote diário fechado',
}

/** A página pública de verificação (no site; oculta até a abertura). */
export const PAGINA_DE_VERIFICACAO = 'https://cruzvermelhariodejaneiro.org/verificar/'
export const linkDeVerificacao = (codigo: string) => `${PAGINA_DE_VERIFICACAO}?c=${encodeURIComponent(codigo)}`
