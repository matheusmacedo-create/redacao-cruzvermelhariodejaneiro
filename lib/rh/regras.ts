/**
 * O vocabulário e as regras da Equipe (funcionários, coordenadores,
 * administrativo e diretoria). Puro: a tela e as actions usam as mesmas listas
 * e validações, e o banco confere tudo de novo.
 *
 * Folha de pagamento, eSocial e ponto ficam de fora: são da contabilidade.
 */

import { NOMES_DOS_SETORES, chaveDoNome } from '@/lib/equipe'
import { cpfValido, situacaoDaFormacao, somenteDigitos, UFS, type SituacaoDaFormacao } from '@/lib/participantes/regras'

export { NOMES_DOS_SETORES }
export { cpfValido, formatarCpf, UFS } from '@/lib/participantes/regras'

export const VINCULOS = {
  clt: { rotulo: 'CLT' },
  estagio: { rotulo: 'Estágio' },
  pj: { rotulo: 'Prestador (PJ)' },
  temporario: { rotulo: 'Temporário' },
  cedido: { rotulo: 'Cedido por outro órgão' },
  estatutario: { rotulo: 'Estatutário (diretoria eleita)' },
  outro: { rotulo: 'Outro / a definir' },
} as const
export type Vinculo = keyof typeof VINCULOS
export const ehVinculo = (s: unknown): s is Vinculo => typeof s === 'string' && Object.hasOwn(VINCULOS, s)
export const rotuloDoVinculo = (s: string) => (ehVinculo(s) ? VINCULOS[s].rotulo : s)

export const SITUACOES = {
  ativo: { rotulo: 'Ativo' },
  afastado: { rotulo: 'Afastado' },
  desligado: { rotulo: 'Desligado' },
} as const
export type Situacao = keyof typeof SITUACOES
export const ehSituacao = (s: unknown): s is Situacao => typeof s === 'string' && Object.hasOwn(SITUACOES, s)

export type Nivel = 0 | 1 | 2 | 3 | 4
export const NIVEIS = {
  ver: { valor: 1, rotulo: 'Ver a equipe', descricao: 'Nome, cargo, setor, gestor e contato de trabalho.' },
  gerenciar: { valor: 2, rotulo: 'Gerenciar', descricao: 'Cadastrar e editar; ver dados pessoais, contrato, histórico e arquivos (contratos, certificados, termos).' },
  documentos: { valor: 3, rotulo: 'Documentos', descricao: 'Tudo acima, mais CPF, RG, PIS, CTPS e demais documentos, e os arquivos de saúde (ASO e atestados).' },
  remuneracao: { valor: 4, rotulo: 'Remuneração e banco', descricao: 'Tudo acima, mais salários, benefícios e dados bancários.' },
} as const
export type NomeDoNivel = keyof typeof NIVEIS
export const nivelDoNome = (n: string | null | undefined): Nivel => (n && Object.hasOwn(NIVEIS, n) ? NIVEIS[n as NomeDoNivel].valor : 0) as Nivel

export const MOTIVOS = {
  admissao: 'Admissão',
  reajuste: 'Reajuste',
  promocao: 'Promoção',
  dissidio: 'Dissídio',
  ajuste: 'Correção',
  outro: 'Outro',
} as const
export type Motivo = keyof typeof MOTIVOS
export const ehMotivo = (s: unknown): s is Motivo => typeof s === 'string' && Object.hasOwn(MOTIVOS, s)

export const MOVIMENTACOES: Record<string, string> = {
  admissao: 'Admissão',
  cargo: 'Cargo',
  setor: 'Setor',
  gestor: 'Gestor',
  vinculo: 'Vínculo',
  jornada: 'Jornada semanal',
  afastamento: 'Afastamento',
  retorno: 'Retorno',
  desligamento: 'Desligamento',
  reativacao: 'Reativação',
}

/** Os documentos que a ficha guarda, cifrados, num único objeto. */
export const DOCUMENTOS = [
  { campo: 'cpf', rotulo: 'CPF' },
  { campo: 'rg', rotulo: 'RG' },
  { campo: 'rg_orgao', rotulo: 'Órgão emissor do RG' },
  { campo: 'pis', rotulo: 'PIS/PASEP/NIS' },
  { campo: 'ctps', rotulo: 'CTPS (número e série)' },
  { campo: 'titulo_eleitor', rotulo: 'Título de eleitor' },
  { campo: 'cnh', rotulo: 'CNH (número e categoria)' },
  { campo: 'reservista', rotulo: 'Certificado de reservista' },
] as const

export const BANCO = [
  { campo: 'banco', rotulo: 'Banco' },
  { campo: 'agencia', rotulo: 'Agência' },
  { campo: 'conta', rotulo: 'Conta' },
  { campo: 'tipo_conta', rotulo: 'Tipo de conta' },
  { campo: 'pix', rotulo: 'Chave Pix' },
] as const

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type DadosDoMembro = Record<string, string | Record<string, string>>

/**
 * Lê o formulário da ficha nos campos que o banco entende. Só entra o que veio
 * no formulário: o banco só mexe no que recebe. Documentos e banco só vão
 * quando a seção foi aberta para edição (o campo `documentos_abertos` /
 * `banco_aberto` marca isso) — assim, salvar a ficha não apaga o que está
 * guardado e que a pessoa nem viu.
 */
export function lerFormulario(f: FormData, hoje: string, setores: readonly string[] = NOMES_DOS_SETORES): { dados: DadosDoMembro; erros: string[] } {
  const erros: string[] = []
  const dados: DadosDoMembro = {}
  const texto = (k: string, max: number) => {
    if (f.has(k)) dados[k] = String(f.get(k) ?? '').trim().slice(0, max)
  }
  ;([
    ['nome', 200], ['nome_social', 200], ['telefone_trabalho', 40], ['cargo', 120], ['horario', 120], ['local_trabalho', 120],
    ['observacoes', 4000], ['telefone_pessoal', 40], ['cep', 12], ['logradouro', 200], ['numero', 20], ['complemento', 120],
    ['bairro', 120], ['cidade', 120], ['emergencia_nome', 200], ['emergencia_telefone', 40], ['emergencia_parentesco', 60],
    ['observacao_da_mudanca', 600],
  ] as const).forEach(([k, max]) => texto(k, max))

  for (const k of ['email_trabalho', 'email_pessoal']) {
    if (!f.has(k)) continue
    const e = String(f.get(k) ?? '').trim().toLowerCase()
    if (e && !EMAIL.test(e)) erros.push(k === 'email_trabalho' ? 'E-mail de trabalho inválido.' : 'E-mail pessoal inválido.')
    dados[k] = e
  }
  if (f.has('setor')) {
    const s = String(f.get('setor') ?? '').trim()
    if (s && !setores.includes(s)) erros.push('Setor inválido.')
    dados.setor = s
  }
  if (f.has('uf')) {
    const uf = String(f.get('uf') ?? '').trim().toUpperCase()
    if (uf && !(UFS as readonly string[]).includes(uf)) erros.push('UF inválida.')
    dados.uf = uf
  }
  if (f.has('vinculo')) {
    const v = String(f.get('vinculo') ?? '')
    if (!ehVinculo(v)) erros.push('Escolha o vínculo.')
    dados.vinculo = v
  }
  if (f.has('data_nascimento')) {
    const d = String(f.get('data_nascimento') ?? '').trim()
    if (d && (!DATA.test(d) || d > hoje || d < '1900-01-01')) erros.push('Data de nascimento inválida.')
    dados.data_nascimento = d
  }
  if (f.has('admissao')) {
    const d = String(f.get('admissao') ?? '').trim()
    if (d && (!DATA.test(d) || d < '1950-01-01')) erros.push('Data de admissão inválida.')
    dados.admissao = d
  }
  if (f.has('vigencia')) {
    const d = String(f.get('vigencia') ?? '').trim()
    if (d && (!DATA.test(d) || d < '1950-01-01')) erros.push('Data de vigência inválida.')
    if (d) dados.vigencia = d
  }
  if (f.has('jornada_semanal')) {
    const j = String(f.get('jornada_semanal') ?? '').trim().replace(',', '.')
    if (j && (!Number.isFinite(Number(j)) || Number(j) <= 0 || Number(j) > 60)) erros.push('Jornada semanal deve ser de 1 a 60 horas.')
    dados.jornada_semanal = j
  }
  for (const k of ['gestor_id', 'user_id']) {
    if (!f.has(k)) continue
    const v = String(f.get(k) ?? '').trim()
    if (v && !UUID.test(v)) erros.push('Seleção inválida.')
    dados[k] = v
  }
  if (f.get('documentos_abertos') === 'sim') {
    const docs: Record<string, string> = {}
    for (const { campo } of DOCUMENTOS) docs[campo] = String(f.get(`doc_${campo}`) ?? '').trim().slice(0, 60)
    docs.cpf = somenteDigitos(docs.cpf)
    if (docs.cpf && !cpfValido(docs.cpf)) erros.push('CPF inválido.')
    dados.documentos = docs
  }
  if (f.get('banco_aberto') === 'sim') {
    const banco: Record<string, string> = {}
    for (const { campo } of BANCO) banco[campo] = String(f.get(`banco_${campo}`) ?? '').trim().slice(0, 80)
    dados.banco = banco
  }
  if (f.has('nome') && String(dados.nome ?? '').length < 2) erros.push('Informe o nome.')
  return { dados, erros }
}

/** "R$ 1.234,56" → 1234.56. Aceita também "1234.56" e "1234,5". */
export function lerValor(texto: string): number | null {
  let s = texto.replace(/[R$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : null
}

export const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export type Beneficio = { nome: string; valor: number | null }

/** Uma linha por benefício: "Vale-refeição: 600" ou só "Plano de saúde". */
export function lerBeneficios(texto: string): { beneficios: Beneficio[]; erros: string[] } {
  const erros: string[] = []
  const beneficios = texto.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20).map((l) => {
    const m = l.match(/^(.*?)[:\-–]\s*(R?\$?\s*[\d.,]+)\s*$/)
    if (!m) return { nome: l.slice(0, 80), valor: null }
    const valor = lerValor(m[2])
    if (valor === null) erros.push(`Valor inválido em "${l}".`)
    return { nome: m[1].trim().slice(0, 80), valor }
  })
  return { beneficios, erros }
}

/** A remuneração em vigor numa data: a de vigência mais recente até lá. */
export function vigente<T extends { vigencia: string }>(historico: T[], hoje: string): T | null {
  return [...historico].filter((r) => r.vigencia <= hoje).sort((a, b) => b.vigencia.localeCompare(a.vigencia))[0] ?? null
}

/** "3 anos e 2 meses", "5 meses", "menos de 1 mês". */
export function tempoDeCasa(admissao: string | null, ate: string): string | null {
  if (!admissao || !DATA.test(admissao) || admissao > ate) return null
  const [a, m, d] = admissao.split('-').map(Number)
  const [ha, hm, hd] = ate.split('-').map(Number)
  let meses = (ha - a) * 12 + (hm - m) - (hd < d ? 1 : 0)
  if (meses < 1) return 'menos de 1 mês'
  const anos = Math.floor(meses / 12)
  meses %= 12
  const partes = [anos ? `${anos} ${anos === 1 ? 'ano' : 'anos'}` : '', meses ? `${meses} ${meses === 1 ? 'mês' : 'meses'}` : ''].filter(Boolean)
  return partes.join(' e ')
}

export type NoDoOrganograma<T> = { membro: T; equipe: NoDoOrganograma<T>[] }

/**
 * Monta o organograma pelo gestor de cada um. Quem não tem gestor (ou tem um
 * gestor fora da lista, como um desligado) vira raiz. O banco não deixa haver
 * ciclo; mesmo assim, um nó nunca aparece duas vezes.
 */
export function organograma<T extends { id: string; nome: string; gestor_id: string | null }>(membros: T[]): NoDoOrganograma<T>[] {
  const porId = new Map(membros.map((m) => [m.id, m]))
  const filhos = new Map<string, T[]>()
  const raizes: T[] = []
  for (const m of membros) {
    if (m.gestor_id && m.gestor_id !== m.id && porId.has(m.gestor_id)) filhos.set(m.gestor_id, [...(filhos.get(m.gestor_id) ?? []), m])
    else raizes.push(m)
  }
  const visto = new Set<string>()
  const ordenar = (l: T[]) => [...l].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const montar = (m: T): NoDoOrganograma<T> => {
    visto.add(m.id)
    return { membro: m, equipe: ordenar(filhos.get(m.id) ?? []).filter((f) => !visto.has(f.id)).map(montar) }
  }
  const arvore = ordenar(raizes).map(montar)
  // Sobra só se houver ciclo (não deveria): entra como raiz para não sumir.
  for (const m of ordenar(membros)) if (!visto.has(m.id)) arvore.push(montar(m))
  return arvore
}

/** Quem da lista de setores (lib/equipe) ainda não tem ficha, comparando nomes sem acento. */
export function faltamNaEquipe<P extends { nome: string }>(lista: P[], fichas: { nome: string }[]): P[] {
  const tem = new Set(fichas.map((f) => chaveDoNome(f.nome)))
  return lista.filter((p) => !tem.has(chaveDoNome(p.nome)))
}

/**
 * Arquivos da ficha. ASO, atestado e cópia de documento pessoal pedem o nível
 * "documentos" (saúde é dado sensível); o resto, "gerenciar". O banco aplica
 * a mesma regra (private.nivel_da_categoria).
 */
export const CATEGORIAS_DE_ARQUIVO = {
  contrato: { rotulo: 'Contrato e aditivos', nivel: 2, validade: false },
  aso: { rotulo: 'ASO (exame ocupacional)', nivel: 3, validade: true },
  atestado: { rotulo: 'Atestado médico', nivel: 3, validade: false },
  documento: { rotulo: 'Cópia de documento pessoal', nivel: 3, validade: true },
  certificado: { rotulo: 'Certificado ou formação', nivel: 2, validade: true },
  termo: { rotulo: 'Termo ou declaração assinada', nivel: 2, validade: false },
  outro: { rotulo: 'Outro', nivel: 2, validade: true },
} as const
export type CategoriaDeArquivo = keyof typeof CATEGORIAS_DE_ARQUIVO
export const ehCategoria = (s: unknown): s is CategoriaDeArquivo => typeof s === 'string' && Object.hasOwn(CATEGORIAS_DE_ARQUIVO, s)
export const categoriasDoNivel = (nivel: Nivel) => (Object.keys(CATEGORIAS_DE_ARQUIVO) as CategoriaDeArquivo[]).filter((c) => nivel >= CATEGORIAS_DE_ARQUIVO[c].nivel)

export const TIPOS_DE_ARQUIVO = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
export const TAMANHO_MAXIMO = 20 * 1024 * 1024
export const ehTipoAceito = (t: string): t is keyof typeof TIPOS_DE_ARQUIVO => Object.hasOwn(TIPOS_DE_ARQUIVO, t)

/** O conteúdo bate com o tipo declarado? Olha os primeiros bytes. */
export function conteudoConfere(tipo: string, b: Uint8Array): boolean {
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n))
  if (tipo === 'application/pdf') return ascii(0, 5) === '%PDF-'
  if (tipo === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (tipo === 'image/png') return b[0] === 0x89 && ascii(1, 3) === 'PNG'
  if (tipo === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
  return false
}

export const tamanhoLegivel = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

/** Validade de ASO, certificado ou documento: vencida, vencendo em 60 dias, em dia. */
export const situacaoDaValidade = (validade: string | null, hoje: string): SituacaoDaFormacao => situacaoDaFormacao(validade, hoje)

export type DadosDoArquivo = { categoria: CategoriaDeArquivo; titulo: string; data_documento: string; validade: string; observacao: string }

export function lerArquivo(f: FormData, hoje: string): { dados: DadosDoArquivo | null; erros: string[] } {
  const erros: string[] = []
  const categoria = String(f.get('categoria') ?? '')
  const titulo = String(f.get('titulo') ?? '').trim().slice(0, 200)
  const data = String(f.get('data_documento') ?? '').trim()
  const validade = String(f.get('validade') ?? '').trim()
  if (!ehCategoria(categoria)) erros.push('Escolha a categoria.')
  if (titulo.length < 2) erros.push('Dê um título ao arquivo.')
  if (data && (!DATA.test(data) || data > hoje || data < '1950-01-01')) erros.push('Data do documento inválida.')
  if (validade && (!DATA.test(validade) || validade < '1950-01-01')) erros.push('Validade inválida.')
  if (data && validade && validade < data) erros.push('A validade não pode ser antes da data do documento.')
  if (erros.length) return { dados: null, erros }
  return { dados: { categoria: categoria as CategoriaDeArquivo, titulo, data_documento: data, validade, observacao: String(f.get('observacao') ?? '').trim().slice(0, 600) }, erros }
}
