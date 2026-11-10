/**
 * Listas salvas da Imprensa: quem está em cada uma e o que a tela avisa antes
 * de um envio.
 *
 * Uma lista é 'fixa' (as pessoas que alguém escolheu) ou 'filtro' (um critério:
 * quem for cadastrado depois e atender a ele entra sozinho). O critério é o
 * mesmo que os filtros da aba Contatos montam. Módulo puro: a tela resolve a
 * lista no navegador, com os contatos que já carregou, e o script
 * scripts/conferir-imprensa-cadastro.ts confere as regras.
 */
import {
  chave, lerEditorias, lerPraca, RELEVANCIAS, rotuloDaRelevancia, rotuloDoTipoDeContato, rotuloDoTipoDeVeiculo,
  comMaiuscula, TIPOS_DE_CONTATO, TIPOS_DE_VEICULO,
} from './vocabulario'

/** Dentro de um campo vale "qualquer um destes"; entre campos, "todos". Campo vazio não filtra. */
export type CriterioDaLista = {
  editorias: string[]
  pracas: string[]
  /** Ids de TIPOS_DE_VEICULO, ou 'a_classificar' para o veículo ainda sem tipo. */
  tiposDeVeiculo: string[]
  tiposDeContato: string[]
  etiquetas: string[]
  relevancias: string[]
}

export const A_CLASSIFICAR = 'a_classificar'

export const criterioVazio = (): CriterioDaLista => ({
  editorias: [], pracas: [], tiposDeVeiculo: [], tiposDeContato: [], etiquetas: [], relevancias: [],
})

const CAMPOS = ['editorias', 'pracas', 'tiposDeVeiculo', 'tiposDeContato', 'etiquetas', 'relevancias'] as const
const MAXIMO_POR_CAMPO = 20

function textos(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return []
  return bruto.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean).slice(0, MAXIMO_POR_CAMPO)
}

const semRepetir = (itens: string[]) => {
  const vistos = new Set<string>()
  return itens.filter((i) => { const k = chave(i); if (vistos.has(k)) return false; vistos.add(k); return true })
}

/** O critério vindo do banco ou de um formulário: só os campos conhecidos, só valores que existem. */
export function lerCriterio(bruto: unknown): CriterioDaLista {
  const o = (typeof bruto === 'object' && bruto !== null ? bruto : {}) as Record<string, unknown>
  return {
    editorias: lerEditorias(textos(o.editorias)),
    pracas: semRepetir(textos(o.pracas).map(lerPraca).filter(Boolean)),
    tiposDeVeiculo: semRepetir(textos(o.tiposDeVeiculo).filter((t) => t === A_CLASSIFICAR || TIPOS_DE_VEICULO.some((x) => x.id === t))),
    tiposDeContato: semRepetir(textos(o.tiposDeContato).filter((t) => TIPOS_DE_CONTATO.some((x) => x.id === t))),
    // A etiqueta do contato é comparada inteira e com acento: aqui ela não é cortada nem juntada com a parecida.
    etiquetas: [...new Set(textos(o.etiquetas).map((t) => t.toLowerCase()))],
    relevancias: semRepetir(textos(o.relevancias).filter((t) => RELEVANCIAS.some((x) => x.id === t))),
  }
}

export const criterioEstaVazio = (c: CriterioDaLista): boolean => CAMPOS.every((campo) => c[campo].length === 0)

/** O que o filtro precisa saber de um contato e do veículo dele. */
export type ContatoParaFiltro = {
  id: string
  veiculoId: string | null
  editorias: string[]
  praca: string
  tipoDeContato: string
  tags: string[]
}
export type VeiculoParaFiltro = { tipo: string; praca: string; relevancia: string }

/** A praça que vale para o contato: a dele; sem ela, a do veículo. */
export function pracaDoContato(contato: Pick<ContatoParaFiltro, 'praca'>, veiculo: Pick<VeiculoParaFiltro, 'praca'> | undefined): string {
  return contato.praca || veiculo?.praca || ''
}

export function atendeAoCriterio(contato: ContatoParaFiltro, veiculo: VeiculoParaFiltro | undefined, criterio: CriterioDaLista): boolean {
  if (criterio.editorias.length) {
    const cobre = new Set(contato.editorias.map(chave))
    if (!criterio.editorias.some((e) => cobre.has(chave(e)))) return false
  }
  if (criterio.pracas.length) {
    const praca = chave(pracaDoContato(contato, veiculo))
    if (!praca || !criterio.pracas.some((p) => chave(p) === praca)) return false
  }
  if (criterio.tiposDeVeiculo.length) {
    // Contato sem veículo não tem tipo de veículo: fica de fora de qualquer filtro por tipo.
    if (!veiculo) return false
    const tipo = veiculo.tipo || A_CLASSIFICAR
    if (!criterio.tiposDeVeiculo.includes(tipo)) return false
  }
  if (criterio.relevancias.length && (!veiculo || !criterio.relevancias.includes(veiculo.relevancia))) return false
  if (criterio.tiposDeContato.length && !criterio.tiposDeContato.includes(contato.tipoDeContato)) return false
  if (criterio.etiquetas.length && !criterio.etiquetas.some((e) => contato.tags.includes(e))) return false
  return true
}

const juntar = (itens: string[], ultimo: string) =>
  (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} ${ultimo} ${itens[itens.length - 1]}`)
const ou = (itens: string[]) => juntar(itens, 'ou')

/** O critério em palavras: "Editoria: Saúde ou Cidades · Praça: Baixada Fluminense". */
export function resumoDoCriterio(c: CriterioDaLista): string {
  const partes: string[] = []
  if (c.editorias.length) partes.push(`Editoria: ${ou(c.editorias.map(comMaiuscula))}`)
  if (c.pracas.length) partes.push(`Praça: ${ou(c.pracas)}`)
  if (c.tiposDeVeiculo.length) partes.push(`Veículo: ${ou(c.tiposDeVeiculo.map((t) => (t === A_CLASSIFICAR ? 'A classificar' : rotuloDoTipoDeVeiculo(t))))}`)
  if (c.relevancias.length) partes.push(`Relevância: ${ou(c.relevancias.map(rotuloDaRelevancia))}`)
  if (c.tiposDeContato.length) partes.push(`Tipo de contato: ${ou(c.tiposDeContato.map(rotuloDoTipoDeContato))}`)
  if (c.etiquetas.length) partes.push(`Etiqueta: ${ou(c.etiquetas)}`)
  return partes.join(' · ')
}

export type ListaDeImprensa = {
  id: string
  nome: string
  descricao: string
  tipo: 'fixa' | 'filtro'
  criterio: CriterioDaLista
  plantao: boolean
  criadaPor: string | null
  atualizadaEm: string
}

/**
 * Quem está na lista agora. `membros` traz, por lista fixa, os ids postos nela;
 * a lista por filtro é resolvida contra os contatos de hoje.
 */
export function contatosDaLista<C extends ContatoParaFiltro>(
  lista: Pick<ListaDeImprensa, 'id' | 'tipo' | 'criterio'>,
  contatos: readonly C[],
  veiculos: ReadonlyMap<string, VeiculoParaFiltro>,
  membros: ReadonlyMap<string, ReadonlySet<string>>,
): C[] {
  if (lista.tipo === 'fixa') {
    const ids = membros.get(lista.id)
    return ids ? contatos.filter((c) => ids.has(c.id)) : []
  }
  // Lista por filtro sem critério não é "todo mundo": é uma lista vazia, para ninguém disparar para o banco inteiro sem querer.
  if (criterioEstaVazio(lista.criterio)) return []
  return contatos.filter((c) => atendeAoCriterio(c, c.veiculoId ? veiculos.get(c.veiculoId) : undefined, lista.criterio))
}

/** As listas na ordem da tela: as de plantão primeiro, depois por nome. */
export function ordenarListas<L extends Pick<ListaDeImprensa, 'nome' | 'plantao'>>(listas: readonly L[]): L[] {
  return [...listas].sort((a, b) => Number(b.plantao) - Number(a.plantao) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** A partir de quantos destinatários, sem lista nem recorte, a tela sugere escolher melhor. */
export const SELECAO_LARGA = 30

/**
 * O que a tela avisa antes de um envio. São avisos, e não travas: quem envia
 * decide. `semRecorte` é o envio para "todos que podem receber", sem lista,
 * sem etiqueta e sem seleção à mão.
 */
export function avisosDoEnvio(destinatarios: readonly { tipoDeContato: string }[], opcoes: { semRecorte: boolean }): string[] {
  const avisos: string[] = []
  const porTipo = new Map<string, number>()
  for (const d of destinatarios) porTipo.set(d.tipoDeContato, (porTipo.get(d.tipoDeContato) ?? 0) + 1)
  if (porTipo.size > 1) {
    const partes = TIPOS_DE_CONTATO.filter((t) => porTipo.has(t.id)).map((t) => {
      const n = porTipo.get(t.id) ?? 0
      return `${n} ${n === 1 ? t.rotulo.toLowerCase() : t.plural}`
    })
    avisos.push(`Esta seleção mistura tipos de contato: ${juntar(partes, 'e')}. Release é para imprensa; para os demais, vale um texto próprio.`)
  }
  if (opcoes.semRecorte && destinatarios.length >= SELECAO_LARGA) {
    avisos.push(`São ${destinatarios.length} contatos, o banco inteiro. O envio rende mais quando vai só para quem cobre o assunto: escolha uma lista.`)
  }
  return avisos
}
