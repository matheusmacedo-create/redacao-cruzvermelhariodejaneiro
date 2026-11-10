/**
 * O vocabulário do cadastro de imprensa: tipos de veículo e de contato, canais,
 * editorias e praças.
 *
 * Módulo puro, lido pela tela, pelas ações do servidor e pela importação: é
 * aqui que "Radio", "rádio" e "RÁDIO FM" viram a mesma coisa. Os ids dos tipos
 * são os mesmos do CHECK das tabelas (migração cvrj_veiculos_e_listas): mudou
 * lá, muda aqui.
 */

export const TIPOS_DE_VEICULO = [
  { id: 'tv', rotulo: 'TV' },
  { id: 'radio', rotulo: 'Rádio' },
  { id: 'impresso', rotulo: 'Jornal ou revista' },
  { id: 'portal', rotulo: 'Site ou portal' },
  { id: 'agencia', rotulo: 'Agência de notícias' },
  { id: 'podcast', rotulo: 'Podcast' },
  { id: 'comunitario', rotulo: 'Comunitário' },
  { id: 'outro', rotulo: 'Outro veículo' },
  { id: 'organizacao', rotulo: 'Não é imprensa' },
] as const

/** '' é o veículo ainda sem classificação. */
export type TipoDeVeiculo = (typeof TIPOS_DE_VEICULO)[number]['id'] | ''

export const RELEVANCIAS = [
  { id: 'alta', rotulo: 'Alta' },
  { id: 'media', rotulo: 'Média' },
  { id: 'baixa', rotulo: 'Baixa' },
] as const

export type Relevancia = (typeof RELEVANCIAS)[number]['id']

export const TIPOS_DE_CONTATO = [
  { id: 'jornalista', rotulo: 'Jornalista', plural: 'jornalistas' },
  { id: 'influenciador', rotulo: 'Influenciador', plural: 'influenciadores' },
  { id: 'parceiro', rotulo: 'Parceiro', plural: 'parceiros' },
  { id: 'autoridade', rotulo: 'Autoridade', plural: 'autoridades' },
  { id: 'outro', rotulo: 'Outro', plural: 'outros contatos' },
] as const

export type TipoDeContato = (typeof TIPOS_DE_CONTATO)[number]['id']

export const CANAIS = [
  { id: 'email', rotulo: 'E-mail' },
  { id: 'whatsapp', rotulo: 'WhatsApp' },
  { id: 'telefone', rotulo: 'Ligação' },
] as const

export type Canal = (typeof CANAIS)[number]['id']

export type BaseLegal = 'legitimo_interesse' | 'consentimento'

/** Guardadas em minúsculas, como as etiquetas. A tela põe a maiúscula. */
export const EDITORIAS_SUGERIDAS = [
  'saúde', 'cidades', 'geral', 'emergências', 'terceiro setor', 'educação', 'meio ambiente',
  'política', 'economia', 'cultura', 'esportes', 'internacional', 'colunas', 'pauta',
] as const

export const PRACAS_SUGERIDAS = [
  'Rio de Janeiro (capital)', 'Baixada Fluminense', 'Niterói e São Gonçalo', 'Região Serrana', 'Região dos Lagos',
  'Norte Fluminense', 'Noroeste Fluminense', 'Sul Fluminense', 'Costa Verde', 'Nacional', 'Internacional',
] as const

/** De onde veio o contato. A primeira vira base legal "consentimento". */
export const ORIGEM_PEDIU = 'Pediu para receber'
export const ORIGENS_SUGERIDAS = [
  ORIGEM_PEDIU,
  'Contato direto com a Comunicação',
  'Expediente ou site do veículo',
  'Indicação',
  'Planilha antiga da Comunicação',
  'Lista de terceiros',
  'Hunter.io',
] as const

export const MAXIMO_DE_EDITORIAS = 12

/** Sem acento, sem caixa e com um espaço só: a forma de comparar texto digitado. */
export function chave(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Um espaço só e sem pontas, como o banco exige do nome do veículo. */
export function limparNome(texto: string, maximo = 200): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, maximo).trim()
}

/**
 * As opções de uma escolha: as sugeridas, na ordem delas, e depois as que o
 * banco já usa, em ordem alfabética. Acento e caixa não criam opção repetida.
 */
export function opcoesComAsEmUso(sugeridas: readonly string[], emUso: readonly string[]): string[] {
  const vistas = new Set(sugeridas.map(chave))
  const extras = emUso.filter((e) => {
    const k = chave(e)
    if (!k || vistas.has(k)) return false
    vistas.add(k)
    return true
  })
  return [...sugeridas, ...extras.sort((a, b) => a.localeCompare(b, 'pt-BR'))]
}

/** "saúde" → "Saúde": a editoria na tela. */
export function comMaiuscula(texto: string): string {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto
}

const ehUm = <T extends readonly { id: string }[]>(lista: T, valor: unknown): valor is T[number]['id'] =>
  typeof valor === 'string' && lista.some((i) => i.id === valor)

export const comoTipoDeContato = (valor: unknown): TipoDeContato => (ehUm(TIPOS_DE_CONTATO, valor) ? valor : 'jornalista')
export const comoCanal = (valor: unknown): Canal => (ehUm(CANAIS, valor) ? valor : 'email')
export const comoRelevancia = (valor: unknown): Relevancia => (ehUm(RELEVANCIAS, valor) ? valor : 'media')
export const comoBaseLegal = (valor: unknown): BaseLegal => (valor === 'consentimento' ? 'consentimento' : 'legitimo_interesse')
/**
 * A base legal sai da origem do dado: quem pediu para receber consentiu; para
 * os demais vale o legítimo interesse. Uma pergunta só no formulário, sem jargão.
 */
export const baseLegalDaOrigem = (origem: string): BaseLegal => (chave(origem) === chave(ORIGEM_PEDIU) ? 'consentimento' : 'legitimo_interesse')
/** O tipo de veículo vindo de um formulário: só os ids da lista, ou ''. */
export const comoTipoDeVeiculo = (valor: unknown): TipoDeVeiculo => (ehUm(TIPOS_DE_VEICULO, valor) ? valor : '')

export const rotuloDoTipoDeVeiculo = (tipo: string): string =>
  TIPOS_DE_VEICULO.find((t) => t.id === tipo)?.rotulo ?? 'A classificar'
export const rotuloDoTipoDeContato = (tipo: string): string =>
  TIPOS_DE_CONTATO.find((t) => t.id === tipo)?.rotulo ?? 'Jornalista'
export const rotuloDoCanal = (canal: string): string => CANAIS.find((c) => c.id === canal)?.rotulo ?? 'E-mail'
export const rotuloDaRelevancia = (relevancia: string): string =>
  RELEVANCIAS.find((r) => r.id === relevancia)?.rotulo ?? 'Média'

// Como a editoria costuma vir escrita numa planilha.
const OUTROS_NOMES_DE_EDITORIA: Record<string, string> = {
  cidade: 'cidades', rio: 'cidades', local: 'cidades', metropole: 'cidades',
  esporte: 'esportes', ambiente: 'meio ambiente', 'meio-ambiente': 'meio ambiente', sustentabilidade: 'meio ambiente',
  mundo: 'internacional', coluna: 'colunas', colunista: 'colunas', opiniao: 'colunas',
  ongs: 'terceiro setor', ong: 'terceiro setor', 'terceiro-setor': 'terceiro setor', solidariedade: 'terceiro setor',
  emergencia: 'emergências', desastres: 'emergências', 'defesa civil': 'emergências',
  pauteiro: 'pauta', pauteira: 'pauta', 'chefia de reportagem': 'pauta', negocios: 'economia',
}

/**
 * As editorias como o banco guarda: minúsculas, sem repetição (acento e caixa
 * não diferenciam), no máximo doze. O que bate com uma sugerida fica com a
 * grafia dela ("Saude" vira "saúde").
 */
export function lerEditorias(bruto: string | readonly string[]): string[] {
  const pedacos = (typeof bruto === 'string' ? [bruto] : [...bruto]).flatMap((t) => String(t).split(/[,;/|\n]/))
  const vistas = new Set<string>()
  const editorias: string[] = []
  for (const pedaco of pedacos) {
    const k = chave(pedaco)
    if (!k) continue
    const conhecida = EDITORIAS_SUGERIDAS.find((e) => chave(e) === k) ?? OUTROS_NOMES_DE_EDITORIA[k]
    const editoria = (conhecida ?? pedaco.toLowerCase().replace(/\s+/g, ' ').trim()).slice(0, 60)
    const unica = chave(editoria)
    if (vistas.has(unica)) continue
    vistas.add(unica)
    editorias.push(editoria)
    if (editorias.length === MAXIMO_DE_EDITORIAS) break
  }
  return editorias
}

// Só o que não deixa dúvida. Cidade fica como foi escrita: "Petrópolis" não vira "Região Serrana".
const OUTROS_NOMES_DE_PRACA: Record<string, string> = {
  rio: 'Rio de Janeiro (capital)', 'rio de janeiro': 'Rio de Janeiro (capital)', capital: 'Rio de Janeiro (capital)',
  'rio de janeiro capital': 'Rio de Janeiro (capital)', 'rio de janeiro rj': 'Rio de Janeiro (capital)',
  baixada: 'Baixada Fluminense', serrana: 'Região Serrana', lagos: 'Região dos Lagos',
  niteroi: 'Niterói e São Gonçalo', 'sao goncalo': 'Niterói e São Gonçalo', brasil: 'Nacional',
}

/** A praça como o banco guarda: a grafia da sugerida quando bate com uma; senão, o texto limpo. */
export function lerPraca(bruto: string): string {
  const limpa = limparNome(bruto, 120)
  const k = chave(limpa).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!k) return ''
  return PRACAS_SUGERIDAS.find((p) => chave(p).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() === k)
    ?? OUTROS_NOMES_DE_PRACA[k]
    ?? limpa
}

/**
 * O tipo de veículo como vem numa planilha ("Emissora de TV", "Jornal online",
 * "Rádio comunitária"). '' quando não dá para saber: melhor ficar a classificar
 * do que classificar errado.
 */
export function tipoDeVeiculoDaPlanilha(bruto: string): TipoDeVeiculo {
  const k = chave(bruto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!k) return ''
  const tem = (...palavras: string[]) => palavras.some((p) => new RegExp(`(^| )${p}( |$)`).test(k))
  if (tem('comunitario', 'comunitaria')) return 'comunitario'
  if (tem('podcast', 'podcasts', 'videocast')) return 'podcast'
  if (tem('agencia', 'agencias')) return 'agencia'
  if (tem('tv', 'tvs', 'televisao', 'emissora de tv')) return 'tv'
  if (tem('radio', 'radios', 'am', 'fm')) return 'radio'
  if (tem('site', 'sites', 'portal', 'portais', 'blog', 'blogs', 'online', 'on line', 'digital', 'web', 'internet')) return 'portal'
  if (tem('jornal', 'jornais', 'revista', 'revistas', 'impresso', 'impressa', 'impressos')) return 'impresso'
  if (tem('orgao', 'governo', 'prefeitura', 'secretaria', 'empresa', 'ong', 'instituicao', 'organizacao', 'nao e imprensa')) return 'organizacao'
  if (tem('outro', 'outros', 'outra')) return 'outro'
  return ''
}

/**
 * O primeiro número de um campo de telefone. O campo é texto livre e costuma
 * trazer mais de um ("2534-0000 / 99876-5432") ou um ramal: juntar todos os
 * dígitos daria um número que não existe.
 */
function primeiroNumero(texto: string): { digitos: string; deFora: boolean } {
  const primeiro = texto.split(/[/;,|]|\bramal\b|\br\.|\bou\b|\be\b/i)[0] ?? ''
  return { digitos: primeiro.replace(/\D/g, ''), deFora: primeiro.trim().startsWith('+') }
}

/** Os dígitos com o código do país na frente, ou null quando não dá para ter certeza do número. */
function comDdi(numero: string): string | null {
  const { digitos, deFora } = primeiroNumero(numero)
  // Escrito com "+": já vem com o código do país, seja o 55 ou outro.
  if (deFora) return digitos.length >= 8 && digitos.length <= 15 ? digitos : null
  // 0800 e 0300 não têm DDD nem WhatsApp.
  if (/^0[38]00/.test(digitos)) return null
  const d = digitos.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return null
}

/** O endereço que abre a conversa no WhatsApp, ou null sem número que sirva. */
export function linkDoWhatsApp(numero: string): string | null {
  const d = comDdi(numero)
  return d ? `https://wa.me/${d}` : null
}

/** O endereço que disca do celular, ou null sem número que sirva. */
export function linkDeLigacao(numero: string): string | null {
  const d = comDdi(numero)
  if (d) return `tel:+${d}`
  // 0800 e número sem DDD: disca como foi escrito. Mais de 13 dígitos são dois números colados: melhor não discar.
  const { digitos } = primeiroNumero(numero)
  return digitos.length >= 8 && digitos.length <= 13 ? `tel:${digitos}` : null
}

/** O veículo do cadastro, como as telas o leem. */
export type VeiculoDeImprensa = {
  id: string
  nome: string
  tipo: TipoDeVeiculo
  praca: string
  dominio: string
  relevancia: Relevancia
  notas: string
  criadoPor: string | null
  atualizadoEm: string
}
