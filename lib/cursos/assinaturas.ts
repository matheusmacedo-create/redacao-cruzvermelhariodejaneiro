/**
 * Quem assina o Diploma de Reconhecimento: de uma a três pessoas (a
 * presidência e, se a filial quiser, a vice-presidência e a coordenação do
 * Voluntariado). Puro: a área de Diplomas, a action e o PDF usam as mesmas
 * regras. Quem grava é o banco (definir_assinaturas_do_diploma, migração
 * 20260929150000), que também copia a lista para cada diploma emitido —
 * assim um diploma continua com quem assinava no dia, mesmo que a diretoria
 * mude depois.
 *
 * Conferência: npx tsx scripts/conferir-diplomas.ts
 */
import { SETORES } from '@/lib/equipe'

export type Assinatura = { nome: string; cargo: string }

export const MAXIMO_DE_ASSINATURAS = 3

const cargoDe = (cargo: string) => SETORES.flatMap((s) => s.pessoas).find((p) => p.cargo === cargo)
const doSetor = (setor: string) => SETORES.find((s) => s.nome === setor)?.pessoas[0]

/** A assinatura de sempre: a presidência da filial (lib/equipe.ts). */
export function assinaturaDaPresidencia(): Assinatura {
  const p = cargoDe('Presidente')
  return p ? { nome: p.nome, cargo: 'Presidente' } : { nome: 'Cruz Vermelha Brasileira – RJ', cargo: 'Presidência' }
}

/** Sugestões para a área de Diplomas, na ordem do diploma: presidência, vice e a coordenação do Voluntariado. */
export function assinaturasSugeridas(): Assinatura[] {
  const vice = cargoDe('Vice-Presidente')
  const voluntariado = doSetor('Voluntariado')
  return [
    assinaturaDaPresidencia(),
    ...(vice ? [{ nome: vice.nome, cargo: 'Vice-Presidente' }] : []),
    ...(voluntariado ? [{ nome: voluntariado.nome, cargo: 'Coordenação de Voluntariado' }] : []),
  ]
}

const limpo = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** A lista vinda da tela ou do banco: de 1 a 3, cada uma com nome (3 a 80 letras) e cargo (2 a 60). */
export function lerAssinaturas(bruto: unknown): { assinaturas: Assinatura[]; erro?: string } {
  const lista = (Array.isArray(bruto) ? bruto : [])
    .map((a) => ({ nome: limpo((a as Assinatura)?.nome), cargo: limpo((a as Assinatura)?.cargo) }))
    .filter((a) => a.nome || a.cargo)
  if (!lista.length) return { assinaturas: [], erro: 'O diploma precisa de pelo menos uma assinatura.' }
  if (lista.length > MAXIMO_DE_ASSINATURAS) return { assinaturas: [], erro: `No máximo ${MAXIMO_DE_ASSINATURAS} assinaturas: mais do que isso não cabe no diploma.` }
  for (const a of lista) {
    if (a.nome.length < 3 || a.nome.length > 80) return { assinaturas: [], erro: 'Escreva o nome de quem assina (de 3 a 80 letras).' }
    if (a.cargo.length < 2 || a.cargo.length > 60) return { assinaturas: [], erro: `Escreva o cargo de ${a.nome} (de 2 a 60 letras).` }
  }
  return { assinaturas: lista }
}

/**
 * Quem aparece num diploma: a lista gravada nele na emissão; se ele é de antes
 * da escolha existir, a lista atual da filial; sem nenhuma, a presidência.
 */
export function assinaturasDoDiploma(doDiploma: unknown, daFilial: unknown): Assinatura[] {
  for (const fonte of [doDiploma, daFilial]) {
    const { assinaturas, erro } = lerAssinaturas(fonte)
    if (!erro) return assinaturas
  }
  return [assinaturaDaPresidencia()]
}

/** O centro de cada assinatura na largura útil do diploma (entre as cantoneiras): uma no meio, duas ou três distribuídas. */
export function centrosDasAssinaturas(n: number, inicio: number, fim: number): number[] {
  const largura = fim - inicio
  return Array.from({ length: n }, (_v, i) => inicio + (largura * (i + 0.5)) / n)
}
