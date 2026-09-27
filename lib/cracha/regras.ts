import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * O crachá funcional (Manual de Identidade Institucional da CVB, p. 28) em
 * versão virtual: frente com logotipo, foto, faixa vermelha com o nome e a
 * função; verso com nome completo, CPF, admissão, fator RH e a faixa do
 * vínculo. O QR do verso leva a /cracha/<código>, onde qualquer pessoa confere
 * se o portador está ativo — sem CPF, sem saúde, sem contato.
 *
 * Os contatos impressos no modelo do manual são antigos: o crachá usa os da
 * filial (DADOS_DA_FILIAL, lib/site/juridico.ts).
 *
 * Módulo puro (só node:crypto): conferido por scripts/conferir-cracha.ts.
 */

/** De onde vem a pessoa: RH (equipe contratada), Voluntários (participantes) ou só a conta do Palácio. */
export type Origem = 'equipe' | 'voluntario' | 'conta'
const LETRA: Record<Origem, string> = { equipe: 'e', voluntario: 'v', conta: 'c' }
const DA_LETRA: Record<string, Origem> = { e: 'equipe', v: 'voluntario', c: 'conta' }

export type Cracha = {
  origem: Origem
  id: string
  /** O nome grande da frente: nome social, ou primeiro e último nome. */
  nomeDeDestaque: string
  nomeCompleto: string
  funcao: string | null
  setor: string | null
  /** "COLABORADOR" (quem tem vínculo com a filial) ou "COLABORADOR VOLUNTÁRIO" (manual: quem não tem vínculo empregatício). */
  faixa: string
  cpf: string | null
  /** "03/2024": admissão (RH), aprovação (voluntário) ou entrada na conta. */
  desde: string | null
  /** Só no crachá da própria pessoa; nunca na verificação pública. */
  fatorRh: string | null
  foto: string | null
  ativo: boolean
  /** Só no crachá do voluntário: a foto precisa da aprovação do Voluntariado. */
  situacaoDaFoto?: SituacaoDaFoto
  /** Por que o Voluntariado recusou a foto (só para a própria pessoa). */
  motivoDaFoto?: string | null
}

/**
 * A foto do crachá do voluntário (migração 20260929050000): vale só a que o
 * Voluntariado aprovou. Foto trocada depois da aprovação volta a aguardar.
 */
export type SituacaoDaFoto = 'sem_foto' | 'aprovada' | 'aguardando' | 'recusada'

export function situacaoDaFotoDoCracha(f: { foto: string | null; aprovada: string | null; recusada: string | null }): SituacaoDaFoto {
  if (!f.foto) return 'sem_foto'
  if (f.foto === f.aprovada) return 'aprovada'
  if (f.foto === f.recusada) return 'recusada'
  return 'aguardando'
}

/** Faixa do verso. O manual (p. 28): "COLABORADOR VOLUNTÁRIO" é para todos que não possuem vínculo empregatício. */
export function faixaDoVinculo(origem: Origem): string {
  return origem === 'voluntario' ? 'COLABORADOR VOLUNTÁRIO' : 'COLABORADOR'
}

const PARTICULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])

/**
 * O nome da faixa vermelha: o nome social, se houver; senão o primeiro e o
 * último nome ("Maria Eduarda da Silva Neves" → "Maria Neves"). Nomes muito
 * longos ficam só com o primeiro.
 */
export function nomeDeDestaque(nome: string, nomeSocial?: string | null): string {
  const base = (nomeSocial?.trim() || nome.trim()).replace(/\s+/g, ' ')
  if (nomeSocial?.trim()) return base
  const partes = base.split(' ').filter((p) => !PARTICULAS.has(p.toLowerCase()))
  if (partes.length <= 1) return base
  const dois = `${partes[0]} ${partes[partes.length - 1]}`
  return dois.length <= 22 ? dois : partes[0]
}

/** "2024-03-15" ou ISO → "03/2024" (o campo "Admissão" do modelo). */
export function mesAno(data: string | null | undefined): string | null {
  if (!data) return null
  const m = /^(\d{4})-(\d{2})/.exec(data)
  return m ? `${m[2]}/${m[1]}` : null
}

/** "A+", "o-", "AB POSITIVO" → "A POSITIVO" como no modelo; o que não reconhece, null. */
export function fatorRhPorExtenso(tipo: string | null | undefined): string | null {
  const t = (tipo ?? '').toUpperCase().replace(/\s+/g, '')
  const m = /^(AB|A|B|O)(\+|-|POSITIVO|NEGATIVO)$/.exec(t)
  if (!m) return null
  return `${m[1]} ${m[2] === '+' || m[2] === 'POSITIVO' ? 'POSITIVO' : 'NEGATIVO'}`
}

// ---------------------------------------------------------------- o código do QR

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TAMANHO_DA_ASSINATURA = 16

function assinatura(corpo: string, segredo: string): string {
  return createHmac('sha256', segredo).update(`cracha:${corpo}`).digest('base64url').slice(0, TAMANHO_DA_ASSINATURA)
}

/**
 * "v" + o id em base64url + "." + 16 caracteres de HMAC: ninguém fabrica o
 * código de outra pessoa nem descobre os de todo mundo. O código não muda
 * enquanto a pessoa existir; quem sai da filial passa a aparecer "inativo".
 */
export function codigoDoCracha(origem: Origem, id: string, segredo: string): string {
  if (!UUID.test(id)) throw new Error('Id inválido para o crachá.')
  const corpo = LETRA[origem] + Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url')
  return `${corpo}.${assinatura(corpo, segredo)}`
}

/** Lê e confere o código; devolve null se for inválido ou adulterado. */
export function lerCodigoDoCracha(codigo: string, segredo: string): { origem: Origem; id: string } | null {
  const m = /^([evc])([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{16})$/.exec(codigo.trim())
  if (!m) return null
  const corpo = m[1] + m[2]
  const esperado = Buffer.from(assinatura(corpo, segredo))
  const recebido = Buffer.from(m[3])
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
  const hex = Buffer.from(m[2], 'base64url').toString('hex')
  if (hex.length !== 32) return null
  return { origem: DA_LETRA[m[1]], id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` }
}
