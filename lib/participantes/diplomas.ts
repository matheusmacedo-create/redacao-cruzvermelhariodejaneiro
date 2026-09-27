/**
 * A área de Diplomas do Voluntariado (/voluntariado/diplomas). Puro: a tela,
 * a action de emitir em lote e a rota do PDF em lote usam as mesmas regras.
 * Quem grava é o banco (conceder_diploma, migração 20260929040000); o
 * desenho do diploma é o modelo oficial aprovado (lib/cursos/diploma-pdf.ts).
 *
 * Conferência: npx tsx scripts/conferir-diplomas.ts
 */
import { CODIGO_DE_CERTIFICADO, normalizarCodigo } from '@/lib/cursos/regras'

export const MARCOS_DE_HORAS = [100, 500, 1000] as const

/** Quantos diplomas se emitem de uma vez (cada um é uma chamada ao banco). */
export const MAXIMO_POR_EMISSAO = 100
/** Quantos diplomas cabem num PDF só (A3; as fontes vão uma vez só: 60 dão cerca de 600 kB e 2 s). */
export const MAXIMO_POR_PDF = 60

/**
 * O próximo marco de horas e quanto falta. Null depois dos 1.000. Serve
 * para a lista "Perto do próximo diploma".
 */
export function proximoMarco(total: number): { marco: number; faltam: number } | null {
  const marco = MARCOS_DE_HORAS.find((m) => total < m)
  if (!marco) return null
  return { marco, faltam: Math.round((marco - total) * 10) / 10 }
}

/** Perto do marco: já passou de 80% do caminho desde o marco anterior. */
export function pertoDoMarco(total: number): boolean {
  const p = proximoMarco(total)
  if (!p) return false
  const anterior = [0, ...MARCOS_DE_HORAS].filter((m) => m < p.marco).at(-1) ?? 0
  return total >= anterior + 0.8 * (p.marco - anterior)
}

/** Os códigos pedidos para o PDF em lote: normalizados, válidos, sem repetição e no máximo 60. */
export function lerCodigos(bruto: string | null | undefined): string[] {
  const vistos = new Set<string>()
  for (const parte of (bruto ?? '').split(/[\s,;]+/)) {
    const c = normalizarCodigo(parte)
    if (CODIGO_DE_CERTIFICADO.test(c)) vistos.add(c)
    if (vistos.size >= MAXIMO_POR_PDF) break
  }
  return [...vistos]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Os voluntários escolhidos para a emissão: ids válidos, sem repetição. Erro se vazio ou acima do limite. */
export function lerEscolhidos(ids: unknown): { ids: string[]; erro?: string } {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === 'string' && UUID.test(x)))]
  if (!lista.length) return { ids: [], erro: 'Escolha pelo menos um voluntário.' }
  if (lista.length > MAXIMO_POR_EMISSAO) return { ids: [], erro: `No máximo ${MAXIMO_POR_EMISSAO} voluntários por vez.` }
  return { ids: lista }
}

/** O motivo do reconhecimento: as mesmas regras do banco (10 a 600 letras). */
export function lerMotivo(texto: unknown): { motivo: string; erro?: string } {
  const motivo = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (motivo.length < 10) return { motivo, erro: 'Escreva o motivo do reconhecimento (pelo menos 10 letras).' }
  if (motivo.length > 600) return { motivo, erro: 'O motivo tem no máximo 600 letras.' }
  return { motivo }
}

export type FiltroDeDiplomas = { q: string; tipo: '' | 'horas' | 'coordenacao'; situacao: 'validos' | 'cancelados' | 'todos' }

export function lerFiltro(sp: Record<string, string | string[] | undefined>): FiltroDeDiplomas {
  const v = (k: string) => { const x = sp[k]; return (Array.isArray(x) ? x[0] : x) ?? '' }
  const tipo = v('tipo')
  const situacao = v('situacao')
  return {
    q: v('q').trim().slice(0, 100),
    tipo: tipo === 'horas' || tipo === 'coordenacao' ? tipo : '',
    situacao: situacao === 'cancelados' || situacao === 'todos' ? situacao : 'validos',
  }
}

type ParaFiltrar = { nome: string; codigo: string; motivo: string; texto: string | null; revogado_em: string | null }

/** Aplica o filtro da lista: nome, código ou motivo; tipo; válidos ou cancelados. */
export function filtrarDiplomas<T extends ParaFiltrar>(lista: T[], f: FiltroDeDiplomas): T[] {
  const termo = semAcento(f.q)
  return lista
    .filter((d) => !f.tipo || d.motivo === f.tipo)
    .filter((d) => f.situacao === 'todos' || (f.situacao === 'cancelados') === Boolean(d.revogado_em))
    .filter((d) => !termo || semAcento(`${d.nome} ${d.codigo} ${d.texto ?? ''}`).includes(termo))
}

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
