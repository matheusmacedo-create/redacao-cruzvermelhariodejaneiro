import { gerarSlug } from '@/lib/site/slug'

/**
 * O nome de arquivo de uma mídia na página publicada.
 *
 * Era `midia-1.jpg` — nome que não diz nada a buscador nenhum. O nome agora
 * nasce da LEGENDA da foto: é o mesmo texto que vira o alt, e buscador
 * gosta exatamente dessa coerência (nome do arquivo dizendo o que o alt
 * diz). Editar a legenda no editor é editar o nome — um campo governa os
 * dois. Sem legenda, o nome cai para o título da matéria com o índice, e só
 * em último caso para o `midia-N` de antes.
 */

const TETO_DO_NOME = 60

export function nomeSeoDaMidia(dados: {
  legenda: string
  tituloDaMateria: string
  indice: number
  extensao: string
  /** Nomes já usados nesta página — colisão ganha sufixo, nunca sobrescreve. */
  usados: Set<string>
}): string {
  const daLegenda = gerarSlug(dados.legenda).slice(0, TETO_DO_NOME).replace(/-+$/, '')
  const doTitulo = gerarSlug(dados.tituloDaMateria).slice(0, TETO_DO_NOME - 3).replace(/-+$/, '')
  const base = daLegenda || (doTitulo ? `${doTitulo}-${dados.indice}` : `midia-${dados.indice}`)

  let nome = `${base}${dados.extensao}`
  let sufixo = 2
  while (dados.usados.has(nome)) nome = `${base}-${sufixo++}${dados.extensao}`
  dados.usados.add(nome)
  return nome
}
