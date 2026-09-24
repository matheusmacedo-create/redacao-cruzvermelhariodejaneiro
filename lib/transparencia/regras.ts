/**
 * Regras do portal de transparência e da página de canais oficiais
 * (docs/auditoria-publica.md §5). Módulo puro: a tela usa para conferir antes
 * de enviar, a action confere de novo, e o banco tem as mesmas listas em CHECK
 * (supabase/migrations/20260925201000_cvrj_transparencia.sql).
 */

export const CATEGORIAS = [
  'estatuto', 'dirigentes', 'atas', 'demonstracoes', 'parecer', 'relatorio_anual', 'campanhas', 'certidoes', 'politicas', 'outros',
] as const
export type Categoria = (typeof CATEGORIAS)[number]

/** Rótulo e explicação de cada seção do portal, na ordem em que aparecem. */
export const ROTULO_DA_CATEGORIA: Record<Categoria, { nome: string; ajuda: string }> = {
  estatuto: { nome: 'Estatuto e regimento', ajuda: 'Estatuto social registrado e regimento interno em vigor.' },
  dirigentes: { nome: 'Diretoria e conselhos', ajuda: 'Composição da diretoria e dos conselhos, com mandato.' },
  atas: { nome: 'Atas', ajuda: 'Atas de eleição, posse e assembleias.' },
  demonstracoes: { nome: 'Demonstrações contábeis', ajuda: 'Balanço patrimonial, DRE/DSP, fluxo de caixa e notas explicativas.' },
  parecer: { nome: 'Pareceres', ajuda: 'Parecer do conselho fiscal e da auditoria independente, quando houver.' },
  relatorio_anual: { nome: 'Relatórios de atividades', ajuda: 'Relatório anual de atividades e de impacto.' },
  campanhas: { nome: 'Campanhas e doações', ajuda: 'Prestação de contas de campanhas de arrecadação.' },
  certidoes: { nome: 'Certidões e títulos', ajuda: 'Certidões negativas, CNPJ, títulos e registros.' },
  politicas: { nome: 'Políticas e códigos', ajuda: 'Código de conduta, políticas de integridade, privacidade e compras.' },
  outros: { nome: 'Outros documentos', ajuda: 'O que não cabe nas seções acima.' },
}

export const INSTRUMENTOS = ['termo_de_colaboracao', 'termo_de_fomento', 'acordo_de_cooperacao', 'convenio', 'contrato_de_gestao', 'outro'] as const
export type Instrumento = (typeof INSTRUMENTOS)[number]
export const ROTULO_DO_INSTRUMENTO: Record<Instrumento, string> = {
  termo_de_colaboracao: 'Termo de colaboração',
  termo_de_fomento: 'Termo de fomento',
  acordo_de_cooperacao: 'Acordo de cooperação',
  convenio: 'Convênio',
  contrato_de_gestao: 'Contrato de gestão',
  outro: 'Outro instrumento',
}

export const SITUACOES_DA_PRESTACAO = ['em_execucao', 'prestacao_apresentada', 'aprovada', 'aprovada_com_ressalvas', 'rejeitada'] as const
export type SituacaoDaPrestacao = (typeof SITUACOES_DA_PRESTACAO)[number]
export const ROTULO_DA_SITUACAO: Record<SituacaoDaPrestacao, string> = {
  em_execucao: 'Em execução',
  prestacao_apresentada: 'Prestação de contas apresentada',
  aprovada: 'Contas aprovadas',
  aprovada_com_ressalvas: 'Contas aprovadas com ressalvas',
  rejeitada: 'Contas rejeitadas',
}

export const TAMANHO_MAXIMO = 20 * 1024 * 1024

const ehDe = <T extends string>(lista: readonly T[]) => (v: unknown): v is T => typeof v === 'string' && (lista as readonly string[]).includes(v)
export const ehCategoria = ehDe(CATEGORIAS)
export const ehInstrumento = ehDe(INSTRUMENTOS)
export const ehSituacao = ehDe(SITUACOES_DA_PRESTACAO)

const texto = (f: FormData, nome: string) => String(f.get(nome) ?? '').trim()
const DATA = /^\d{4}-\d{2}-\d{2}$/

/** "1.234,56", "80.000", "1234.56" ou "1234,5" → "1234.56"; vazio → null; inválido → undefined. */
export function lerValor(bruto: string): string | null | undefined {
  const v = bruto.replace(/\s|R\$/g, '')
  if (!v) return null
  let normal: string
  if (v.includes(',')) normal = /^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : ''
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) normal = v.replace(/\./g, '') // ponto de milhar: 80.000
  else normal = v
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normal)) return undefined
  return Number(normal).toFixed(2)
}

export type FichaDoDocumento = { categoria: Categoria; titulo: string; descricao: string; periodo: string; ordem: number }

export function lerDocumento(f: FormData): { dados?: FichaDoDocumento; erros: string[] } {
  const erros: string[] = []
  const categoria = texto(f, 'categoria')
  const titulo = texto(f, 'titulo')
  const descricao = texto(f, 'descricao')
  const periodo = texto(f, 'periodo')
  const ordem = Number(texto(f, 'ordem') || 0)
  if (!ehCategoria(categoria)) erros.push('Escolha a seção do portal.')
  if (titulo.length < 3 || titulo.length > 200) erros.push('O título precisa ter de 3 a 200 caracteres.')
  if (descricao.length > 1000) erros.push('A descrição pode ter até 1.000 caracteres.')
  if (periodo.length > 60) erros.push('O período pode ter até 60 caracteres.')
  if (!Number.isInteger(ordem) || ordem < -1000 || ordem > 1000) erros.push('Ordem inválida.')
  if (erros.length) return { erros }
  return { dados: { categoria: categoria as Categoria, titulo, descricao, periodo, ordem }, erros }
}

export type Parceria = {
  instrumento: Instrumento; numero: string; orgao: string; orgao_cnpj: string; objeto: string
  data_assinatura: string; vigencia_inicio: string; vigencia_fim: string
  valor_total: string | null; valor_liberado: string | null
  situacao_prestacao: SituacaoDaPrestacao; prestacao_final_em: string
  equipe: { funcao: string; remuneracao: string }[]; observacao: string
}

/**
 * A ficha da parceria (Lei 13.019/2014, art. 11). A equipe entra como pares
 * funcao_N / remuneracao_N: só função e valor, nunca nome.
 */
export function lerParceria(f: FormData): { dados?: Parceria; erros: string[] } {
  const erros: string[] = []
  const instrumento = texto(f, 'instrumento')
  const situacao = texto(f, 'situacao_prestacao') || 'em_execucao'
  const cnpj = texto(f, 'orgao_cnpj').replace(/\D/g, '')
  const datas = ['data_assinatura', 'vigencia_inicio', 'vigencia_fim', 'prestacao_final_em'].map((n) => [n, texto(f, n)] as const)
  const valorTotal = lerValor(texto(f, 'valor_total'))
  const valorLiberado = lerValor(texto(f, 'valor_liberado'))
  const equipe: { funcao: string; remuneracao: string }[] = []
  for (let i = 0; i < 50; i++) {
    const funcao = texto(f, `funcao_${i}`)
    const remuneracao = texto(f, `remuneracao_${i}`)
    if (!funcao && !remuneracao) continue
    const valor = lerValor(remuneracao)
    if (!funcao || funcao.length > 120) erros.push(`Informe a função da linha ${i + 1} da equipe (até 120 caracteres).`)
    if (!valor) erros.push(`Informe a remuneração da linha ${i + 1} da equipe.`)
    else equipe.push({ funcao, remuneracao: valor })
  }
  if (!ehInstrumento(instrumento)) erros.push('Escolha o tipo de instrumento.')
  if (!ehSituacao(situacao)) erros.push('Situação da prestação de contas inválida.')
  if (texto(f, 'orgao').length < 3) erros.push('Informe o órgão ou a entidade parceira.')
  if (cnpj && cnpj.length !== 14) erros.push('O CNPJ do órgão precisa ter 14 dígitos.')
  if (texto(f, 'objeto').length < 5) erros.push('Descreva o objeto da parceria.')
  if (texto(f, 'objeto').length > 2000) erros.push('O objeto pode ter até 2.000 caracteres.')
  for (const [nome, v] of datas) if (v && !DATA.test(v)) erros.push(`Data inválida em ${nome.replace(/_/g, ' ')}.`)
  const inicio = texto(f, 'vigencia_inicio')
  const fim = texto(f, 'vigencia_fim')
  if (inicio && fim && fim < inicio) erros.push('O fim da vigência vem antes do início.')
  if (valorTotal === undefined) erros.push('Valor total inválido.')
  if (valorLiberado === undefined) erros.push('Valor liberado inválido.')
  if (texto(f, 'observacao').length > 1000) erros.push('A observação pode ter até 1.000 caracteres.')
  if (erros.length) return { erros }
  return {
    dados: {
      instrumento: instrumento as Instrumento, numero: texto(f, 'numero').slice(0, 80), orgao: texto(f, 'orgao').slice(0, 200), orgao_cnpj: cnpj,
      objeto: texto(f, 'objeto'), data_assinatura: datas[0][1], vigencia_inicio: inicio, vigencia_fim: fim,
      valor_total: valorTotal ?? null, valor_liberado: valorLiberado ?? null,
      situacao_prestacao: situacao as SituacaoDaPrestacao, prestacao_final_em: datas[3][1], equipe, observacao: texto(f, 'observacao'),
    },
    erros,
  }
}

// ---------------------------------------------------------------- canais oficiais

export const TIPOS_DE_CANAL = ['site', 'email', 'telefone', 'whatsapp', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'x', 'endereco', 'cnpj', 'pix', 'outro'] as const
export type TipoDeCanal = (typeof TIPOS_DE_CANAL)[number]
export const ROTULO_DO_CANAL: Record<TipoDeCanal, string> = {
  site: 'Site', email: 'E-mail', telefone: 'Telefone', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', x: 'X (Twitter)', endereco: 'Endereço', cnpj: 'CNPJ', pix: 'Chave PIX para doações', outro: 'Outro',
}

export type Canal = { tipo: TipoDeCanal; rotulo: string; valor: string; url: string | null }

/** Endereços de perfil aceitos por tipo: o link precisa ser do domínio da rede. */
const DOMINIOS: Partial<Record<TipoDeCanal, RegExp>> = {
  instagram: /^https:\/\/(www\.)?instagram\.com\//,
  facebook: /^https:\/\/(www\.|m\.)?facebook\.com\//,
  linkedin: /^https:\/\/(www\.)?linkedin\.com\//,
  youtube: /^https:\/\/(www\.)?youtube\.com\//,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@/,
  x: /^https:\/\/(www\.)?(x|twitter)\.com\//,
  whatsapp: /^https:\/\/(wa\.me|api\.whatsapp\.com)\//,
}

/**
 * Lê a lista vinda da tela (JSON). Recusa link fora do https e perfil de rede
 * em domínio que não é o da rede — a página existe para desmentir golpe, não
 * pode ela mesma apontar para lugar errado.
 */
export function lerCanais(bruto: unknown): { canais?: Canal[]; erros: string[] } {
  const erros: string[] = []
  if (!Array.isArray(bruto) || !bruto.length) return { erros: ['Inclua ao menos um canal.'] }
  if (bruto.length > 60) return { erros: ['São no máximo 60 canais.'] }
  const canais: Canal[] = []
  bruto.forEach((c, i) => {
    const item = (c ?? {}) as Record<string, unknown>
    const tipo = String(item.tipo ?? '')
    const rotulo = String(item.rotulo ?? '').trim()
    const valor = String(item.valor ?? '').trim()
    const url = String(item.url ?? '').trim()
    const n = i + 1
    if (!(TIPOS_DE_CANAL as readonly string[]).includes(tipo)) { erros.push(`Linha ${n}: escolha o tipo.`); return }
    if (!valor || valor.length > 200) erros.push(`Linha ${n}: informe o endereço, número ou perfil (até 200 caracteres).`)
    if (rotulo.length > 80) erros.push(`Linha ${n}: o rótulo pode ter até 80 caracteres.`)
    if (url && (!/^https:\/\/[^\s]+$/.test(url) || url.length > 300)) erros.push(`Linha ${n}: o link precisa começar com https://.`)
    const dominio = DOMINIOS[tipo as TipoDeCanal]
    if (url && dominio && !dominio.test(url)) erros.push(`Linha ${n}: o link não é de ${ROTULO_DO_CANAL[tipo as TipoDeCanal]}.`)
    if (tipo === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) erros.push(`Linha ${n}: e-mail inválido.`)
    canais.push({ tipo: tipo as TipoDeCanal, rotulo: rotulo || ROTULO_DO_CANAL[tipo as TipoDeCanal], valor, url: url || null })
  })
  if (erros.length) return { erros }
  return { canais, erros }
}

// ---------------------------------------------------------------- nomes e formatos

/** Nome público do PDF: título em minúsculas sem acento + 12 hex do SHA-256 (nunca colide, nunca é sobrescrito). */
export function nomeDoArquivoPublico(titulo: string, sha256: string): string {
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'documento'
  return `${base}-${sha256.slice(0, 12)}.pdf`
}

export const NOME_DO_ARQUIVO_PUBLICO = /^[a-z0-9][a-z0-9-]{0,60}-[0-9a-f]{12}\.pdf$/

/** O PDF começa com %PDF- (os 5 primeiros bytes). */
export const ehPdf = (bytes: Uint8Array) => bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-'

export const reais = (valor: string | number | null) =>
  valor === null || valor === '' ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor))

export const tamanhoLegivel = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

export const formatarCnpj = (cnpj: string) => cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
