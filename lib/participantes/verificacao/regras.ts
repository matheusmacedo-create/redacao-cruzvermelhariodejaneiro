/**
 * A verificação do candidato a voluntário ("KYC do Voluntariado"): o
 * vocabulário, os prazos e as regras que a tela, as actions, o link do
 * candidato e o parecer em PDF compartilham. Puro — conferido em
 * scripts/conferir-verificacao.ts. O banco (migração 20261002000000) aplica
 * as mesmas regras de novo: prazos do atestado, trava da aprovação, restrição
 * obrigatória.
 *
 * Base legal: Lei 14.811/2024 (art. 59-A do ECA — certidão de antecedentes de
 * todo colaborador, inclusive voluntário, renovada a cada 6 meses); IFRC
 * Child Safeguarding Policy (checagem policial e/ou duas referências); LGPD
 * (dado sensível: finalidade, acesso restrito, decisão humana — art. 20).
 * Decisão do projeto: sem biometria facial — quem confere compara a foto do
 * crachá com a do documento a olho. Docs: docs/verificacao-de-voluntarios.md.
 */

// ---------------------------------------------------------------- vocabulário

export const ITENS = {
  identidade: { rotulo: 'Identidade', nivel: 3, descricao: 'Documento com foto lido e comparado com o cadastro e com a foto do crachá.' },
  antecedentes: { rotulo: 'Antecedentes criminais', nivel: 3, descricao: 'Atestado da Polícia Civil (ou certidão da PF) emitido nos últimos 90 dias, com o código validado no site.' },
  sancoes: { rotulo: 'Sanções e pessoa exposta', nivel: 2, descricao: 'CEIS, CNEP, CEAF e PEP, pelo Portal da Transparência (CGU).' },
  registro_profissional: { rotulo: 'Registro profissional', nivel: 2, descricao: 'Quando a pessoa declara conselho (COREN, CRM, CRP…): número conferido no site do conselho.' },
  referencias: { rotulo: 'Referências', nivel: 2, descricao: 'Duas pessoas fora da família, contatadas pela coordenação.' },
  entrevista: { rotulo: 'Entrevista', nivel: 2, descricao: 'Conversa presencial ou por vídeo, com a data e uma nota.' },
} as const
export type NomeDoItem = keyof typeof ITENS
export const NOMES_DOS_ITENS = Object.keys(ITENS) as NomeDoItem[]
export const ehItem = (s: unknown): s is NomeDoItem => typeof s === 'string' && Object.hasOwn(ITENS, s)

export const SITUACOES_DO_ITEM = {
  pendente: 'Pendente',
  conferido: 'Conferido',
  divergente: 'Divergente',
  dispensado: 'Dispensado',
} as const
export type SituacaoDoItem = keyof typeof SITUACOES_DO_ITEM
export const ehSituacaoDoItem = (s: unknown): s is SituacaoDoItem => typeof s === 'string' && Object.hasOwn(SITUACOES_DO_ITEM, s)

export const PARECERES = {
  apto: 'Apto',
  apto_com_restricao: 'Apto com restrição',
  nao_apto: 'Não apto',
} as const
export type Parecer = keyof typeof PARECERES
export const ehParecer = (s: unknown): s is Parecer => typeof s === 'string' && Object.hasOwn(PARECERES, s)

/** As restrições de atuação. A primeira é a obrigatória quando identidade ou antecedentes não foram conferidos (Lei 14.811). */
export const RESTRICOES = {
  sem_criancas_adolescentes: { rotulo: 'Não atua com crianças e adolescentes', curto: 'Sem crianças e adolescentes' },
  sem_acao_externa_sem_supervisao: { rotulo: 'Não atua em ação externa sem supervisão', curto: 'Só com supervisão' },
  sem_valores: { rotulo: 'Não lida com dinheiro, doações ou valores', curto: 'Sem valores' },
  sem_dados_de_assistidos: { rotulo: 'Não acessa dados pessoais de assistidos', curto: 'Sem dados de assistidos' },
} as const
export type Restricao = keyof typeof RESTRICOES
export const RESTRICAO_OBRIGATORIA: Restricao = 'sem_criancas_adolescentes'
export const ehRestricao = (s: unknown): s is Restricao => typeof s === 'string' && Object.hasOwn(RESTRICOES, s)

export const ESTADOS = {
  aberta: 'Aguardando documentos',
  enviada: 'Documentos recebidos',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
} as const
export type Estado = keyof typeof ESTADOS

export const ESCOPOS = { completa: 'Verificação completa', renovacao: 'Renovação do atestado' } as const
export type Escopo = keyof typeof ESCOPOS

/** Por onde o link do candidato sai: e-mail, WhatsApp ou só copiado pela coordenação. */
export type CanalDoPedido = 'email' | 'whatsapp' | 'link'

export const CATEGORIAS_DE_DOCUMENTO = {
  documento_identidade: { rotulo: 'Documento com foto', nivel: 3, dica: 'RG, CNH ou RNE: frente e verso, ou o PDF da CNH Digital.' },
  antecedentes_pcerj: { rotulo: 'Atestado de antecedentes (Polícia Civil RJ)', nivel: 3, dica: 'Gratuito, emitido na hora no site da Polícia Civil. Vale 90 dias.' },
  antecedentes_pf: { rotulo: 'Certidão de antecedentes (Polícia Federal)', nivel: 3, dica: 'Opcional, gratuita, emitida no site da PF.' },
  comprovante_residencia: { rotulo: 'Comprovante de residência', nivel: 2, dica: 'Opcional: conta de luz, água ou telefone recente.' },
  registro_profissional: { rotulo: 'Registro profissional', nivel: 2, dica: 'A carteira do conselho (COREN, CRM, CRP, CREFITO…), se tiver.' },
  outro: { rotulo: 'Outro', nivel: 2, dica: '' },
} as const
export type CategoriaDeDocumento = keyof typeof CATEGORIAS_DE_DOCUMENTO
export const ehCategoriaDeDocumento = (s: unknown): s is CategoriaDeDocumento => typeof s === 'string' && Object.hasOwn(CATEGORIAS_DE_DOCUMENTO, s)
export const ehAntecedentes = (c: string) => c === 'antecedentes_pcerj' || c === 'antecedentes_pf'

export const LADOS = { frente: 'Frente', verso: 'Verso', unico: 'Documento inteiro' } as const
export type Lado = keyof typeof LADOS

export const BASES_DA_CGU = {
  ceis: { sigla: 'CEIS', rotulo: 'Empresas e pessoas inidôneas ou suspensas', caminho: 'ceis', parametro: 'codigoSancionado' },
  cnep: { sigla: 'CNEP', rotulo: 'Punidas pela Lei Anticorrupção', caminho: 'cnep', parametro: 'codigoSancionado' },
  ceaf: { sigla: 'CEAF', rotulo: 'Expulsos da administração federal', caminho: 'ceaf', parametro: 'cpfSancionado' },
  peps: { sigla: 'PEP', rotulo: 'Pessoas expostas politicamente', caminho: 'peps', parametro: 'cpf' },
} as const
export type BaseDaCgu = keyof typeof BASES_DA_CGU
export const NOMES_DAS_BASES = Object.keys(BASES_DA_CGU) as BaseDaCgu[]

/** Onde o candidato emite e a coordenação valida (sem automação: todos têm captcha ou exigem cadastro). */
export const LINKS = {
  atestadoPcerj: 'https://www.policiacivilrj.net.br/atestado_de_antecedentes.php',
  validarPcerj: 'https://certidaocacciifppcerj.detran.rj.gov.br',
  certidaoPf: 'https://servicos.pf.gov.br/epol-sinic-publico',
  bnmp: 'https://portalbnmp.cnj.jus.br',
  coren: 'https://sigen.cofen.gov.br/profissional/consultar',
  cfp: 'https://cadastro.cfp.org.br',
  crefito: 'https://www.crefito2.gov.br',
  cremerj: 'https://www.cremerj.org.br/busca-medicos',
  chaveDaCgu: 'https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email',
} as const

// ---------------------------------------------------------------- prazos e limites

/** Versão do termo que o candidato aceita no link (muda quando o texto mudar). */
export const VERIFICACAO_TERMO_VERSAO = '2026-10-v1'
export const DIAS_DO_LINK = 14
export const DIAS_ENTRE_LEMBRETES = 5
export const LEMBRETES_NO_MAXIMO = 2
/** O atestado da Polícia Civil vale 90 dias a partir da emissão. */
export const DIAS_DE_VALIDADE_DO_ATESTADO = 90
/** Lei 14.811/2024: a certidão é renovada a cada 6 meses. */
export const MESES_PARA_RENOVAR = 6
export const DIAS_DE_AVISO_DA_RENOVACAO = 15
export const ARQUIVOS_NO_MAXIMO = 10
export const REFERENCIAS_MINIMAS = 2
export const REFERENCIAS_MAXIMAS = 3

// ---------------------------------------------------------------- tipos

export type ItemDoChecklist = {
  situacao: SituacaoDoItem
  nota?: string | null
  por?: string | null
  por_nome?: string | null
  em?: string | null
  /** Antecedentes: o atestado que fechou o item. */
  arquivo?: string | null
  emitido_em?: string | null
  vale_ate?: string | null
  renovar_ate?: string | null
  codigo?: string | null
  /** Entrevista. */
  data?: string | null
}
export type Itens = Partial<Record<NomeDoItem, ItemDoChecklist>>

export type Comparacao = 'confere' | 'parecido' | 'diverge' | 'nao_lido'

/** O que fica guardado da leitura: sem o CPF, com o número mascarado. */
export type DocumentoLido = {
  legivel: boolean
  tipo: string | null
  nome: string | null
  data_nascimento: string | null
  numero: string | null
  orgao_emissor: string | null
  uf: string | null
  validade: string | null
  comparacao: { nome: Comparacao; nascimento: Comparacao; cpf: Comparacao }
  divergencias: string[]
  em?: string | null
  por_nome?: string | null
}

export type ResultadoDaBase = { situacao: 'ok' | 'falha'; ocorrencias: number; detalhes: string[]; erro?: string | null }
export type ResultadoDasSancoes = 'nada_consta' | 'ocorrencias' | 'incompleto'
export type Sancoes = { resultado: ResultadoDasSancoes; bases: Record<BaseDaCgu, ResultadoDaBase>; em?: string | null; por_nome?: string | null }

export type RegistroProfissional = { tem: boolean; conselho: string | null; numero: string | null; uf: string | null }

export type Verificacao = {
  id: string
  escopo: Escopo
  estado: Estado
  link_expira_em: string | null
  link_enviado_para: string | null
  termo_aceito_em: string | null
  enviado_em: string | null
  itens: Itens
  documento_lido: DocumentoLido | null
  sancoes: Sancoes | null
  registro_profissional: RegistroProfissional | null
  parecer: Parecer | null
  restricoes: string[]
  motivo: string | null
  decidido_por: string | null
  decidido_em: string | null
  created_at: string
}

export type ArquivoDoVoluntario = {
  id: string
  categoria: CategoriaDeDocumento
  lado: Lado | null
  data_documento: string | null
  validade: string | null
  vence_em: string | null
  codigo_autenticacao: string | null
  observacao: string | null
  nome_original: string
  tipo: string
  tamanho: number
  sha256: string | null
  pelo_candidato: boolean
  enviado_por: string | null
  created_at: string
  excluido_em: string | null
  motivo_exclusao: string | null
}

export type Referencia = {
  id: string
  nome: string
  relacao: string
  telefone: string | null
  email: string | null
  informado_pelo_candidato: boolean
  contatado_em: string | null
  contatado_por_nome: string | null
  parecer: 'favoravel' | 'desfavoravel' | 'nao_localizada' | null
  nota: string | null
}
export const PARECERES_DA_REFERENCIA = { favoravel: 'Favorável', desfavoravel: 'Desfavorável', nao_localizada: 'Não localizada' } as const

// ---------------------------------------------------------------- datas

const aData = (d: string) => new Date(`${d}T12:00:00Z`)
const aTexto = (d: Date) => d.toISOString().slice(0, 10)

export function somarDias(data: string, dias: number): string {
  const d = aData(data)
  d.setUTCDate(d.getUTCDate() + dias)
  return aTexto(d)
}

/** Soma meses como o Postgres (`date + interval 'n months'`): 31/08 + 6 meses = 28/02 (ou 29). */
export function somarMeses(data: string, meses: number): string {
  const d = aData(data)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + meses)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return aTexto(d)
}

export const diferencaEmDias = (de: string, ate: string) => Math.round((aData(ate).getTime() - aData(de).getTime()) / 86_400_000)

export const validadeDoAtestado = (emitidoEm: string) => somarDias(emitidoEm, DIAS_DE_VALIDADE_DO_ATESTADO)
export const renovacaoDoAtestado = (emitidoEm: string) => somarMeses(emitidoEm, MESES_PARA_RENOVAR)

/** O atestado serve? Nem futuro, nem com mais de 90 dias. */
export function atestadoAceitavel(emitidoEm: string, hoje: string): { ok: true } | { ok: false; erro: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emitidoEm) || Number.isNaN(aData(emitidoEm).getTime())) return { ok: false, erro: 'Informe a data de emissão do atestado.' }
  const dias = diferencaEmDias(emitidoEm, hoje)
  if (dias < 0) return { ok: false, erro: 'A data de emissão não pode ser no futuro.' }
  if (dias > DIAS_DE_VALIDADE_DO_ATESTADO) return { ok: false, erro: 'Este atestado foi emitido há mais de 90 dias e não vale mais. Emita um novo (é gratuito) e envie.' }
  return { ok: true }
}

export type SituacaoDaRenovacao = 'em_dia' | 'vence_logo' | 'vencido'
/** Renovação (6 meses): em dia, vence nos próximos 15 dias ou vencido. */
export function situacaoDaRenovacao(renovarAte: string | null | undefined, hoje: string): SituacaoDaRenovacao | null {
  if (!renovarAte) return null
  const dias = diferencaEmDias(hoje, renovarAte)
  return dias < 0 ? 'vencido' : dias <= DIAS_DE_AVISO_DA_RENOVACAO ? 'vence_logo' : 'em_dia'
}

/** O atestado mais novo guardado (não excluído), para o selo e a renovação. */
export function atestadoMaisNovo(arquivos: ArquivoDoVoluntario[]): ArquivoDoVoluntario | null {
  return arquivos
    .filter((a) => !a.excluido_em && ehAntecedentes(a.categoria) && a.data_documento)
    .sort((a, b) => (b.data_documento ?? '').localeCompare(a.data_documento ?? '') || b.created_at.localeCompare(a.created_at))[0] ?? null
}

// ---------------------------------------------------------------- nomes e números

/** Sem acento, minúsculas, um espaço só: "José da Silva" e "JOSE DA SILVA" viram iguais. */
export const normalizarNome = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const tokens = (s: string) => normalizarNome(s).split(' ').filter((t) => t && !PARTICULAS.has(t))

/**
 * Compara o nome do documento com o do cadastro: igual = confere; mesmo
 * primeiro e último nome, ou um contido no outro (abreviação, nome do meio a
 * mais) = parecido; senão diverge.
 */
export function compararNomes(documento: string | null | undefined, cadastro: string | null | undefined): Comparacao {
  const a = tokens(documento ?? '')
  const b = tokens(cadastro ?? '')
  if (!a.length) return 'nao_lido'
  if (!b.length) return 'diverge'
  if (a.join(' ') === b.join(' ')) return 'confere'
  const contido = (x: string[], y: string[]) => x.every((t) => y.includes(t))
  if (contido(a, b) || contido(b, a)) return 'parecido'
  if (a[0] === b[0] && a[a.length - 1] === b[b.length - 1]) return 'parecido'
  return 'diverge'
}

/** O número do documento com só os três últimos caracteres à mostra: "12.345.678-9" → "**.***.*78-9". */
export function mascararNumeroDoDocumento(numero: string | null | undefined): string | null {
  const n = String(numero ?? '').trim()
  if (!n) return null
  const alfanumericos = n.replace(/[^0-9A-Za-z]/g, '').length
  if (alfanumericos <= 3) return n.replace(/[0-9A-Za-z]/g, '*')
  let vistos = 0
  const visiveis = 3
  const saida: string[] = []
  for (let i = n.length - 1; i >= 0; i--) {
    const c = n[i]
    if (/[0-9A-Za-z]/.test(c)) { saida.unshift(vistos < visiveis ? c : '*'); vistos++ } else saida.unshift(c)
  }
  return saida.join('')
}

export type DocumentoExtraido = {
  legivel: boolean
  tipo: string | null
  nome: string | null
  data_nascimento: string | null
  cpf: string | null
  numero: string | null
  orgao_emissor: string | null
  uf: string | null
  validade: string | null
}

/**
 * O que fica da leitura: a comparação com o cadastro e a lista de
 * divergências em português. O CPF do documento entra só como "confere ou
 * não" (cpfConfere vem do banco, por HMAC) e NUNCA sai daqui.
 */
export function compararComCadastro(extraido: DocumentoExtraido, cadastro: { nome: string; data_nascimento: string | null }, cpfConfere: 'confere' | 'diverge' | 'sem_cpf' | 'nao_lido'): DocumentoLido {
  const nome = extraido.legivel ? compararNomes(extraido.nome, cadastro.nome) : 'nao_lido'
  const nascimento: Comparacao = !extraido.legivel || !extraido.data_nascimento ? 'nao_lido' : !cadastro.data_nascimento ? 'diverge' : extraido.data_nascimento === cadastro.data_nascimento ? 'confere' : 'diverge'
  const cpf: Comparacao = cpfConfere === 'confere' ? 'confere' : cpfConfere === 'diverge' ? 'diverge' : 'nao_lido'
  const divergencias: string[] = []
  if (!extraido.legivel) divergencias.push('O Claude não conseguiu ler o documento: confira manualmente.')
  if (nome === 'diverge') divergencias.push(`O nome no documento (${extraido.nome}) não bate com o do cadastro (${cadastro.nome}).`)
  if (nome === 'parecido') divergencias.push(`O nome no documento (${extraido.nome}) é parecido, mas não igual, ao do cadastro (${cadastro.nome}).`)
  if (nascimento === 'diverge') divergencias.push(cadastro.data_nascimento ? `A data de nascimento no documento (${dataCurta(extraido.data_nascimento)}) não bate com a do cadastro (${dataCurta(cadastro.data_nascimento)}).` : `O cadastro não tem data de nascimento; no documento consta ${dataCurta(extraido.data_nascimento)}.`)
  if (cpf === 'diverge') divergencias.push('O CPF impresso no documento não é o do cadastro.')
  if (cpfConfere === 'sem_cpf') divergencias.push('O cadastro não tem CPF guardado; o candidato informa o dele ao aceitar o termo.')
  if (extraido.legivel && !extraido.cpf) divergencias.push('O documento não traz o CPF (ou ele não ficou legível).')
  if (extraido.validade && extraido.validade < hojeIso()) divergencias.push(`O documento está vencido desde ${dataCurta(extraido.validade)}.`)
  return {
    legivel: extraido.legivel,
    tipo: extraido.tipo,
    nome: extraido.nome,
    data_nascimento: extraido.data_nascimento,
    numero: mascararNumeroDoDocumento(extraido.numero),
    orgao_emissor: extraido.orgao_emissor,
    uf: extraido.uf,
    validade: extraido.validade,
    comparacao: { nome, nascimento, cpf },
    divergencias,
  }
}

const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const dataCurta = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d ?? '—')

// ---------------------------------------------------------------- CGU

type Registro = Record<string, unknown>
const texto = (o: unknown, ...caminhos: string[]): string | null => {
  for (const caminho of caminhos) {
    let atual: unknown = o
    for (const parte of caminho.split('.')) { atual = atual && typeof atual === 'object' ? (atual as Registro)[parte] : undefined }
    if (typeof atual === 'string' && atual.trim()) return atual.trim()
    if (typeof atual === 'number') return String(atual)
  }
  return null
}

/**
 * Lê a resposta de uma base da CGU (o corpo é uma lista; vazia = nada
 * consta). Guarda só um resumo por registro, nunca o JSON bruto. Status fora
 * de 200 (ou corpo que não é lista) = falha: a base não respondeu.
 */
/**
 * A chave da CGU como a pessoa colou: só os 32 caracteres (letras e números),
 * ou dentro do que o Portal mostra (`chave-api-dados: …`, o JSON
 * `[{"key":"chave-api-dados","value":"…"}]`). Devolve a chave limpa, ou null
 * quando não há uma chave reconhecível no texto.
 */
export function lerChaveDaCgu(bruto: string | null | undefined): string | null {
  const texto = (bruto ?? '').trim()
  if (/^[0-9a-f]{32}$/i.test(texto)) return texto.toLowerCase()
  const m = /(?:^|[^0-9a-z])([0-9a-f]{32})(?=$|[^0-9a-z])/i.exec(texto)
  return m ? m[1].toLowerCase() : null
}

export const CHAVE_DA_CGU_RECUSADA = 'A CGU recusou a chave. Em Configurações → Integrações, cole só os 32 caracteres da chave (ela chega por e-mail do Portal da Transparência) e salve de novo: a chave é testada na hora.'

export function lerRespostaDaCgu(base: BaseDaCgu, status: number, corpo: unknown): ResultadoDaBase {
  if (status === 200 && Array.isArray(corpo)) {
    const detalhes = corpo.slice(0, 10).map((r) => {
      if (base === 'peps') {
        return [texto(r, 'descricaoFuncao', 'funcao.descricao', 'funcao'), texto(r, 'nomeOrgao', 'orgao.nome'), texto(r, 'dataInicioExercicio') && `desde ${dataCurta(texto(r, 'dataInicioExercicio'))}`, texto(r, 'dataFimExercicio') && `até ${dataCurta(texto(r, 'dataFimExercicio'))}`].filter(Boolean).join(' · ') || 'Registro encontrado'
      }
      if (base === 'ceaf') {
        return [texto(r, 'punicao.descricao', 'tipoPunicao.descricao', 'punicao'), texto(r, 'orgaoLotacao.nome', 'orgaoLotacao'), texto(r, 'dataPublicacao') && `publicada em ${dataCurta(texto(r, 'dataPublicacao'))}`].filter(Boolean).join(' · ') || 'Registro encontrado'
      }
      return [texto(r, 'tipoSancao.descricaoResumida', 'tipoSancao.descricaoPortal', 'tipoSancao.descricao', 'tipoSancao'), texto(r, 'orgaoSancionador.nome', 'orgaoSancionador'), texto(r, 'dataInicioSancao') && `de ${dataCurta(texto(r, 'dataInicioSancao'))}`, texto(r, 'dataFimSancao') && `até ${dataCurta(texto(r, 'dataFimSancao'))}`].filter(Boolean).join(' · ') || 'Registro encontrado'
    })
    return { situacao: 'ok', ocorrencias: corpo.length, detalhes }
  }
  return { situacao: 'falha', ocorrencias: 0, detalhes: [], erro: status === 401 || status === 403 ? CHAVE_DA_CGU_RECUSADA : status === 429 ? 'Limite de consultas da CGU por minuto.' : status === 0 ? 'A CGU não respondeu.' : `A CGU respondeu ${status}.` }
}

/** Nada consta só quando TODAS as bases responderam limpas; qualquer falha é "incompleto" (nunca "nada consta" por falha). */
export function resumirSancoes(bases: Record<BaseDaCgu, ResultadoDaBase>): Sancoes {
  const lista = NOMES_DAS_BASES.map((b) => bases[b])
  const resultado: ResultadoDasSancoes = lista.some((b) => b.ocorrencias > 0) ? 'ocorrencias' : lista.some((b) => b.situacao === 'falha') ? 'incompleto' : 'nada_consta'
  return { resultado, bases }
}

// ---------------------------------------------------------------- a trava, as pendências e a decisão

export const situacaoDoItem = (v: Pick<Verificacao, 'itens'> | null | undefined, item: NomeDoItem): SituacaoDoItem => v?.itens?.[item]?.situacao ?? 'pendente'
export const itemConferido = (v: Pick<Verificacao, 'itens'> | null | undefined, item: NomeDoItem) => situacaoDoItem(v, item) === 'conferido'

/** Identidade e antecedentes conferidos (só antecedentes, na renovação). */
export function verificacaoCompleta(v: Pick<Verificacao, 'itens' | 'escopo'> | null | undefined): boolean {
  if (!v) return false
  return v.escopo === 'renovacao' ? itemConferido(v, 'antecedentes') : itemConferido(v, 'identidade') && itemConferido(v, 'antecedentes')
}

/** Aprovar a inscrição está travado? Só destrava uma verificação concluída como apto ou apto com restrição. */
export function travaDaAprovacao(ultima: Pick<Verificacao, 'estado' | 'parecer'> | null | undefined): { travada: boolean; motivo: string } {
  if (ultima?.estado === 'concluida' && (ultima.parecer === 'apto' || ultima.parecer === 'apto_com_restricao')) return { travada: false, motivo: '' }
  if (ultima?.estado === 'concluida' && ultima.parecer === 'nao_apto') return { travada: true, motivo: 'A verificação concluiu “não apto”. Para aprovar mesmo assim, abra uma nova verificação ou aprove com restrição e o motivo.' }
  return { travada: true, motivo: 'Conclua a verificação do candidato antes de aprovar — ou aprove com a restrição “Não atua com crianças e adolescentes” e o motivo.' }
}

/** O que falta para "apto" e o que ainda está em aberto — nunca travam, só orientam. */
export function pendencias(v: Verificacao | null, arquivos: ArquivoDoVoluntario[], referencias: Referencia[], hoje: string): string[] {
  const lista: string[] = []
  if (!v) return ['Abra a verificação e peça os documentos ao candidato.']
  const ativos = arquivos.filter((a) => !a.excluido_em)
  if (v.escopo === 'completa' && !ativos.some((a) => a.categoria === 'documento_identidade')) lista.push('Falta o documento com foto.')
  const atestado = atestadoMaisNovo(ativos)
  if (!atestado) lista.push('Falta o atestado de antecedentes.')
  else if (atestado.data_documento && !atestadoAceitavel(atestado.data_documento, hoje).ok) lista.push('O atestado guardado passou de 90 dias: peça um novo.')
  if (v.escopo === 'completa' && !itemConferido(v, 'identidade')) lista.push('Identidade ainda não conferida (quem tem acesso a dados sensíveis lê o documento e compara).')
  if (!itemConferido(v, 'antecedentes')) lista.push('Antecedentes ainda não conferidos (validar o código no site da Polícia Civil).')
  if (v.escopo === 'completa') {
    if (situacaoDoItem(v, 'sancoes') === 'pendente') lista.push('Sanções e PEP ainda não consultados.')
    if (situacaoDoItem(v, 'sancoes') === 'divergente') lista.push('Há ocorrência nas bases da CGU: leia o resultado antes de decidir.')
    if (referencias.length < REFERENCIAS_MINIMAS) lista.push(`Faltam referências (${referencias.length} de ${REFERENCIAS_MINIMAS}).`)
    else if (referencias.filter((r) => r.parecer).length < REFERENCIAS_MINIMAS) lista.push('Referências ainda não contatadas.')
    if (v.registro_profissional?.tem && situacaoDoItem(v, 'registro_profissional') === 'pendente') lista.push('Registro profissional declarado e ainda não conferido.')
    if (situacaoDoItem(v, 'entrevista') === 'pendente') lista.push('Entrevista ainda não registrada.')
  }
  if (v.documento_lido?.comparacao.nome === 'diverge' || v.documento_lido?.comparacao.cpf === 'diverge') lista.push('A leitura do documento apontou divergência com o cadastro.')
  return lista
}

/** A mesma régua do banco, para a tela avisar antes de enviar. Null = pode. */
export function problemaDaDecisao(parecer: Parecer, restricoes: string[], motivo: string, completa: boolean): string | null {
  const m = motivo.trim()
  if (parecer === 'apto') return completa ? null : 'Para “apto”, identidade e antecedentes precisam estar conferidos. Se faltar algum, aprove com restrição e o motivo.'
  if (parecer === 'apto_com_restricao') {
    if (!restricoes.length) return 'Marque ao menos uma restrição.'
    if (restricoes.some((r) => !ehRestricao(r))) return 'Restrição desconhecida.'
    if (!completa && !restricoes.includes(RESTRICAO_OBRIGATORIA)) return 'Sem identidade e antecedentes conferidos, a restrição “Não atua com crianças e adolescentes” é obrigatória (Lei 14.811/2024).'
    if (m.length < 10) return 'Escreva o motivo da restrição (ao menos 10 caracteres).'
    return null
  }
  return m.length < 10 ? 'Escreva o motivo (ao menos 10 caracteres).' : null
}

export type TomDoChip = 'neutro' | 'atencao' | 'ok' | 'erro'
/** O selo curto da lista e da ficha. */
export function chipDaVerificacao(v: Pick<Verificacao, 'estado' | 'parecer' | 'restricoes' | 'link_expira_em' | 'termo_aceito_em'> | null | undefined, hoje: string): { rotulo: string; tom: TomDoChip } {
  if (!v) return { rotulo: 'Sem verificação', tom: 'neutro' }
  if (v.estado === 'concluida') {
    if (v.parecer === 'apto') return { rotulo: 'Apto', tom: 'ok' }
    if (v.parecer === 'apto_com_restricao') return { rotulo: `Apto com restrição (${v.restricoes.length})`, tom: 'atencao' }
    return { rotulo: 'Não apto', tom: 'erro' }
  }
  if (v.estado === 'enviada') return { rotulo: 'Documentos recebidos', tom: 'atencao' }
  if (v.estado === 'cancelada') return { rotulo: 'Cancelada', tom: 'neutro' }
  if (v.link_expira_em && v.link_expira_em.slice(0, 10) < hoje) return { rotulo: 'Link vencido', tom: 'erro' }
  if (v.termo_aceito_em) return { rotulo: 'Candidato enviando', tom: 'atencao' }
  return { rotulo: 'Aguardando documentos', tom: 'neutro' }
}

// ---------------------------------------------------------------- formulários

export type ReferenciaInformada = { nome: string; relacao: string; telefone: string | null; email: string | null }

/** As referências do formulário (campos ref_1_nome, ref_1_relacao, ref_1_telefone, ref_1_email…). */
export function lerReferencias(f: Record<string, unknown>, minimo = REFERENCIAS_MINIMAS): { referencias: ReferenciaInformada[]; erros: string[] } {
  const referencias: ReferenciaInformada[] = []
  const erros: string[] = []
  const campo = (k: string) => String(f[k] ?? '').trim()
  for (let i = 1; i <= REFERENCIAS_MAXIMAS; i++) {
    const nome = campo(`ref_${i}_nome`).slice(0, 120)
    const relacao = campo(`ref_${i}_relacao`).slice(0, 120)
    const telefone = campo(`ref_${i}_telefone`).slice(0, 30) || null
    const email = campo(`ref_${i}_email`).toLowerCase().slice(0, 254) || null
    if (!nome && !relacao && !telefone && !email) continue
    if (nome.length < 2 || relacao.length < 2) { erros.push(`Referência ${i}: preencha o nome e qual é a relação com você.`); continue }
    if (!telefone && !email) { erros.push(`Referência ${i}: informe telefone ou e-mail.`); continue }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { erros.push(`Referência ${i}: o e-mail não parece certo.`); continue }
    referencias.push({ nome, relacao, telefone, email })
  }
  if (!erros.length && referencias.length < minimo) erros.push(`Indique ${minimo === 2 ? 'duas' : minimo} referências fora da família (ex.: chefe, professor, colega).`)
  return { referencias, erros }
}

export function lerRegistroProfissional(f: Record<string, unknown>): { registro: RegistroProfissional; erros: string[] } {
  const tem = String(f.registro_tem ?? '') === 'sim'
  const conselho = String(f.registro_conselho ?? '').trim().toUpperCase().slice(0, 40) || null
  const numero = String(f.registro_numero ?? '').trim().slice(0, 40) || null
  const uf = String(f.registro_uf ?? '').trim().toUpperCase().slice(0, 2) || null
  const erros: string[] = []
  if (tem && (!conselho || !numero)) erros.push('Informe o conselho e o número do registro.')
  return { registro: tem ? { tem, conselho, numero, uf } : { tem: false, conselho: null, numero: null, uf: null }, erros }
}

export function lerDecisao(f: Record<string, unknown>): { parecer: Parecer | null; restricoes: Restricao[]; motivo: string; erros: string[] } {
  const parecer = ehParecer(f.parecer) ? f.parecer : null
  const brutas = Array.isArray(f.restricoes) ? f.restricoes : typeof f.restricoes === 'string' ? f.restricoes.split(',') : []
  const restricoes = [...new Set(brutas.map((r) => String(r).trim()).filter(ehRestricao))]
  const motivo = String(f.motivo ?? '').trim().slice(0, 1200)
  return { parecer, restricoes, motivo, erros: parecer ? [] : ['Escolha o parecer.'] }
}

// ---------------------------------------------------------------- textos

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

/** O pedido de documentos (WhatsApp e corpo do e-mail), com o link pessoal. */
export function textoDoPedidoDeDocumentos(p: { nome: string; url: string; renovacao?: boolean; lembrete?: boolean }): string {
  const nome = primeiroNome(p.nome)
  const abertura = p.lembrete
    ? `${nome ? `${nome}, f` : 'F'}altam os seus documentos para a verificação na Cruz Vermelha RJ.`
    : `Olá${nome ? `, ${nome}` : ''}! Para seguir com a sua ${p.renovacao ? 'atuação' : 'inscrição'} como voluntário(a) da Cruz Vermelha RJ, precisamos ${p.renovacao ? 'renovar o seu atestado de antecedentes' : 'confirmar quem você é'}.`
  const oQue = p.renovacao
    ? 'Leva poucos minutos: você emite o atestado de antecedentes (gratuito, no site da Polícia Civil) e envia pelo link.'
    : 'Leva uns 10 minutos: foto do seu documento, atestado de antecedentes (gratuito, emitido na hora no site da Polícia Civil) e duas referências.'
  return [abertura, oQue, `Seu link (pessoal, vale ${DIAS_DO_LINK} dias): ${p.url}`, '_Não repasse este link. A Cruz Vermelha nunca pede senha nem dados de banco por link._'].join('\n\n')
}

/** VER-2026-A1B2C3: ano da decisão + 6 caracteres do id. */
export function codigoDoParecer(verificacaoId: string, decididoEm: string | null): string {
  const ano = (decididoEm ?? '').slice(0, 4) || '0000'
  return `VER-${ano}-${verificacaoId.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

const quando = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null)
const porQuem = (i: ItemDoChecklist | undefined) => (i?.por_nome ? ` (${i.por_nome}${i.em ? `, ${quando(i.em)}` : ''})` : '')

/** As linhas da tabela do parecer: item, situação, detalhe. */
export function linhasDoParecer(v: Verificacao, arquivos: ArquivoDoVoluntario[], referencias: Referencia[]): string[][] {
  const ativos = arquivos.filter((a) => !a.excluido_em)
  const atestado = atestadoMaisNovo(ativos)
  const linhas: string[][] = []
  const item = (nome: NomeDoItem) => v.itens?.[nome]
  if (v.escopo === 'completa') {
    const i = item('identidade')
    const d = v.documento_lido
    const docs = ativos.filter((a) => a.categoria === 'documento_identidade').length
    linhas.push([ITENS.identidade.rotulo, SITUACOES_DO_ITEM[i?.situacao ?? 'pendente'] + porQuem(i), [
      docs ? `${docs} arquivo(s) de documento com foto` : 'Sem documento guardado',
      d ? `Leitura: ${d.tipo ?? 'documento'} ${d.numero ?? ''} · nome ${d.comparacao.nome} · nascimento ${d.comparacao.nascimento} · CPF ${d.comparacao.cpf}`.replace(/\s+/g, ' ').trim() : null,
      i?.nota,
    ].filter(Boolean).join('. ')])
  }
  {
    const i = item('antecedentes')
    linhas.push([ITENS.antecedentes.rotulo, SITUACOES_DO_ITEM[i?.situacao ?? 'pendente'] + porQuem(i), [
      atestado ? `${CATEGORIAS_DE_DOCUMENTO[atestado.categoria].rotulo}, emitido em ${dataCurta(atestado.data_documento)}, válido até ${dataCurta(atestado.validade)}, renovar até ${dataCurta(atestado.vence_em)}` : 'Sem atestado guardado',
      i?.codigo ? `Código ${i.codigo}` : atestado?.codigo_autenticacao ? `Código ${atestado.codigo_autenticacao}` : null,
      i?.nota,
    ].filter(Boolean).join('. ')])
  }
  if (v.escopo === 'completa') {
    const i = item('sancoes')
    const s = v.sancoes
    linhas.push([ITENS.sancoes.rotulo, SITUACOES_DO_ITEM[i?.situacao ?? 'pendente'] + porQuem(i), s
      ? NOMES_DAS_BASES.map((b) => `${BASES_DA_CGU[b].sigla}: ${s.bases[b]?.situacao === 'falha' ? 'não respondeu' : s.bases[b]?.ocorrencias ? `${s.bases[b].ocorrencias} ocorrência(s)` : 'nada consta'}`).join(' · ') + (s.em ? ` (${quando(s.em)})` : '')
      : 'Não consultado'])
    const r = item('registro_profissional')
    const rp = v.registro_profissional
    linhas.push([ITENS.registro_profissional.rotulo, rp?.tem ? SITUACOES_DO_ITEM[r?.situacao ?? 'pendente'] + porQuem(r) : 'Não se aplica', rp?.tem ? [`${rp.conselho ?? ''} ${rp.numero ?? ''}${rp.uf ? `/${rp.uf}` : ''}`.trim(), r?.nota].filter(Boolean).join('. ') : 'O candidato declarou não ter registro em conselho.'])
    const ref = item('referencias')
    linhas.push([ITENS.referencias.rotulo, SITUACOES_DO_ITEM[ref?.situacao ?? 'pendente'] + porQuem(ref), referencias.length
      ? referencias.map((x) => `${x.nome} (${x.relacao}): ${x.parecer ? PARECERES_DA_REFERENCIA[x.parecer] : 'não contatada'}${x.contatado_em ? ` em ${dataCurta(x.contatado_em)}` : ''}${x.nota ? ` — ${x.nota}` : ''}`).join(' · ')
      : 'Nenhuma referência'])
    const e = item('entrevista')
    linhas.push([ITENS.entrevista.rotulo, SITUACOES_DO_ITEM[e?.situacao ?? 'pendente'] + porQuem(e), [e?.data ? `Em ${dataCurta(e.data)}` : null, e?.nota].filter(Boolean).join('. ') || '—'])
  }
  return linhas
}
