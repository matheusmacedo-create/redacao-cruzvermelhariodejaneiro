/**
 * Os filtros do Gmail que levam e-mails à caixa de um setor: o que é puro
 * (sem rede), para a tela, a action e scripts/conferir-caixa-de-entrada.ts.
 *
 * Os setores são apelidos de uma conta só (contato@): encaminhar de um para
 * o outro não funciona, então o "encaminhamento" é a etiqueta. Um filtro do
 * Gmail põe a etiqueta da caixa no que chega, e a caixa mostra o que tem a
 * etiqueta (lib/correio/leitura.ts → consultaDaPasta e mensagensDaCaixa).
 */

export type Criterio = { de?: string; para?: string; assunto?: string; palavras?: string }

const CAMPOS: (keyof Criterio)[] = ['de', 'para', 'assunto', 'palavras']
const TETO = 200

/** Lê e confere o critério vindo da tela. Lança Error com a mensagem para a pessoa. */
export function lerCriterio(bruto: Partial<Record<keyof Criterio, unknown>>): Criterio {
  const c: Criterio = {}
  for (const k of CAMPOS) {
    const v = String(bruto[k] ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (v.length > TETO) throw new Error(`Cada campo do filtro pode ter até ${TETO} caracteres.`)
    if (v) c[k] = v
  }
  if (!Object.keys(c).length) throw new Error('Preencha ao menos um campo do filtro (de, para, assunto ou palavras).')
  return c
}

/** O mesmo critério como busca do Gmail, para etiquetar o que já está na conta. */
export function buscaDoFiltro(c: Criterio): string {
  const grupo = (v: string) => /\s/.test(v) ? `(${v})` : v
  return [
    c.de && `from:${grupo(c.de)}`,
    c.para && `to:${grupo(c.para)}`,
    c.assunto && `subject:${grupo(c.assunto)}`,
    c.palavras,
  ].filter(Boolean).join(' ')
}

/** "Assunto contém “voluntariado” · de @gmail.com" — para a lista de filtros da tela. */
export function descricaoDoFiltro(c: Criterio): string {
  return [
    c.de && `de “${c.de}”`,
    c.para && `para “${c.para}”`,
    c.assunto && `assunto contém “${c.assunto}”`,
    c.palavras && `tem as palavras “${c.palavras}”`,
  ].filter(Boolean).join(' · ') || '(sem critério)'
}
