/**
 * Legendas de foto propostas por IA — a parte pura.
 *
 * O modelo recebe as fotos DE VERDADE (visão), não os nomes de arquivo: é
 * olhando a imagem, no contexto da matéria, que sai uma legenda que presta.
 * Este módulo monta o pedido e lê a resposta; quem fala com cada provedor
 * são os conectores.
 *
 * A legenda proposta preenche só campo vazio, nunca o que uma pessoa
 * escreveu — e continua editável no rodapé das fotos, onde também vira o
 * alt e o nome SEO do arquivo na página.
 */

/** Teto de fotos por chamada: mais que isso encarece e o modelo se perde. */
export const TETO_DE_FOTOS = 6

/** A legenda vai para alt, rodapé e nome de arquivo: curta por natureza. */
const TETO_DA_LEGENDA = 200

export function montarPedidoDeLegendas(dados: {
  titulo?: string
  resumo: string
  quantidade: number
}): { system: string; texto: string } {
  const system = [
    'Você escreve legendas de fotos para o site da Cruz Vermelha Brasileira — Rio de Janeiro, em português do Brasil.',
    'Para cada foto recebida, escreva UMA legenda factual: o que a foto mostra, dito no contexto da matéria.',
    'Até 140 caracteres por legenda. Sem "foto de", "imagem de" ou "na foto".',
    'Não invente nome de pessoa: quem aparece é descrito pelo papel — "voluntários", "a equipe", "representantes das instituições".',
    'Se a foto for arte gráfica (cartaz, card), a legenda diz do que a peça trata.',
    `Responda com exatamente ${dados.quantidade} linha(s), na ordem das fotos, no formato "N: legenda" — nada antes, nada depois.`,
  ].join('\n')

  const texto = [
    dados.titulo?.trim() ? `Matéria: ${dados.titulo.trim()}` : '',
    dados.resumo.trim() ? `Resumo da matéria:\n${dados.resumo.trim()}` : '',
    `As ${dados.quantidade} foto(s) desta matéria estão anexas, na ordem 1 a ${dados.quantidade}.`,
  ].filter(Boolean).join('\n\n')

  return { system, texto }
}

/**
 * Lê as legendas da resposta, uma por índice.
 *
 * Modelo devolve "1: x", "1 - x", "1. x", com ou sem aspas — tudo isso
 * conta. Índice que não vier volta vazio: legenda faltando é campo que
 * continua em branco, nunca a legenda da foto errada.
 */
export function parsearLegendas(bruto: string, quantidade: number): string[] {
  const porIndice = new Map<number, string>()
  for (const linha of bruto.split('\n')) {
    const m = /^\s*(\d+)\s*[:.\-–—)]\s*(.+)$/.exec(linha)
    if (!m) continue
    const indice = Number(m[1])
    if (indice < 1 || indice > quantidade || porIndice.has(indice)) continue
    const legenda = m[2].trim().replace(/^["“']|["”']$/g, '').trim().slice(0, TETO_DA_LEGENDA)
    if (legenda) porIndice.set(indice, legenda)
  }
  return Array.from({ length: quantidade }, (_, i) => porIndice.get(i + 1) ?? '')
}
