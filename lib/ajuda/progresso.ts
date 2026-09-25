/**
 * O que cada pessoa já viu da ajuda: as boas-vindas e os tours de cada tela.
 *
 * Mora em `user_metadata.ajuda` do Supabase Auth — e não numa tabela — porque
 * é estado de interface da própria pessoa: não decide acesso a nada, vale em
 * qualquer aparelho e não pede migração. O user_metadata é editável pelo
 * próprio usuário, então nada aqui pode virar permissão. Como o metadata vai
 * dentro do token de sessão, a lista é curta (só chaves conhecidas, com teto).
 *
 * A Área do Voluntário não tem conta no Auth: lá o mesmo formato fica no
 * localStorage do aparelho (components/membro/ajuda.tsx).
 *
 * Módulo puro, conferido com script (npx tsx).
 */

export type Progresso = {
  /** Quando viu (ou dispensou) as boas-vindas, em ISO; null = nunca. */
  boasVindas: string | null
  /** Tours concluídos ou dispensados: o href da área ou o caminho da tela ('/pautas/[id]'). */
  vistos: string[]
}

export const PROGRESSO_VAZIO: Progresso = { boasVindas: null, vistos: [] }

/** Teto de chaves guardadas: o metadata viaja no token de toda requisição. */
export const MAXIMO_DE_VISTOS = 120

/** Lê o que estiver gravado, desconfiando de tudo (o metadata é editável pela pessoa). */
export function lerProgresso(bruto: unknown): Progresso {
  if (!bruto || typeof bruto !== 'object') return PROGRESSO_VAZIO
  const { boasVindas, vistos } = bruto as Record<string, unknown>
  return {
    boasVindas: typeof boasVindas === 'string' && boasVindas.length <= 40 ? boasVindas : null,
    vistos: Array.isArray(vistos)
      ? [...new Set(vistos.filter((v): v is string => typeof v === 'string' && v.startsWith('/') && v.length <= 120))].slice(-MAXIMO_DE_VISTOS)
      : [],
  }
}

export function comBoasVindas(p: Progresso, quando: string): Progresso {
  return { ...p, boasVindas: p.boasVindas ?? quando }
}

export function comTourVisto(p: Progresso, chave: string): Progresso {
  if (p.vistos.includes(chave)) return p
  return { ...p, vistos: [...p.vistos, chave].slice(-MAXIMO_DE_VISTOS) }
}

export function viuTour(p: Progresso, chave: string): boolean {
  return p.vistos.includes(chave)
}

/** Recomeçar do zero (botão "Rever as boas-vindas e os tours" na Central). */
export function progressoZerado(): Progresso {
  return { boasVindas: null, vistos: [] }
}
