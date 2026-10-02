/**
 * O vocabulário e as regras do cadastro do Voluntariado. Puro: a tela, as
 * actions e o formulário público usam as mesmas listas e validações, e o
 * banco confere tudo de novo (CPF, tipo sanguíneo, vínculo, menores).
 */

import { SETORES } from '@/lib/equipe'

// Só o voluntariado. Quem tem vínculo de trabalho com a filial (funcionários,
// coordenadores, administrativo, diretoria) fica na Equipe, com outros dados
// e outros acessos.
export const VINCULOS = {
  voluntario: { rotulo: 'Voluntário', plural: 'Voluntários' },
  jovem: { rotulo: 'Juventude', plural: 'Juventude' },
  instrutor: { rotulo: 'Instrutor voluntário', plural: 'Instrutores voluntários' },
} as const
export type Vinculo = keyof typeof VINCULOS
export const ehVinculo = (s: unknown): s is Vinculo => typeof s === 'string' && Object.hasOwn(VINCULOS, s)

export const SITUACOES = {
  candidato: { rotulo: 'Inscrição pendente' },
  ativo: { rotulo: 'Ativo' },
  inativo: { rotulo: 'Inativo' },
  desligado: { rotulo: 'Desligado' },
} as const
export type Situacao = keyof typeof SITUACOES
export const ehSituacao = (s: unknown): s is Situacao => typeof s === 'string' && Object.hasOwn(SITUACOES, s)

export const NOMES_DOS_SETORES = SETORES.map((s) => s.nome)

export const DISPONIBILIDADES = ['Manhãs em dias úteis', 'Tardes em dias úteis', 'Noites em dias úteis', 'Sábados', 'Domingos e feriados', 'Emergências (sob chamado)'] as const
export const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

export type Nivel = 0 | 1 | 2 | 3
export const NIVEIS = {
  ver: { valor: 1, rotulo: 'Ver a lista', descricao: 'Nome, vínculo, setores e contatos.' },
  gerenciar: { valor: 2, rotulo: 'Gerenciar', descricao: 'Cadastrar, editar, pedir documentos e conduzir a verificação do candidato (sanções, referências, decisão), aprovar inscrições, registrar horas e formações, exportar.' },
  sensiveis: { valor: 3, rotulo: 'Dados sensíveis', descricao: 'Tudo acima, mais abrir CPF e dados de saúde, abrir o documento e o atestado do candidato (e conferir identidade e antecedentes) e anonimizar a pedido do titular.' },
} as const
export type NomeDoNivel = keyof typeof NIVEIS
export const nivelDoNome = (n: string | null | undefined): Nivel => (n && Object.hasOwn(NIVEIS, n) ? NIVEIS[n as NomeDoNivel].valor : 0) as Nivel

/** Versão do termo de tratamento de dados que a pessoa aceita no formulário. */
export const TERMO_VERSAO = '2026-10-v1'

export const somenteDigitos = (s: string) => s.replace(/\D/g, '')

export function cpfValido(cpf: string): boolean {
  const d = somenteDigitos(cpf)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function formatarCpf(cpf: string): string {
  const d = somenteDigitos(cpf)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf
}

/** Idade completa em anos numa data (AAAA-MM-DD). */
export function idade(nascimento: string | null, hoje: string): number | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null
  const [a, m, d] = nascimento.split('-').map(Number)
  const [ha, hm, hd] = hoje.split('-').map(Number)
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0)
}

export const ehMenor = (nascimento: string | null, hoje: string) => {
  const i = idade(nascimento, hoje)
  return i !== null && i < 18
}

export type SituacaoDaFormacao = 'valida' | 'vence_logo' | 'vencida' | 'sem_validade'

/** Formação com validade: vencida, vencendo nos próximos 60 dias, ou em dia. */
export function situacaoDaFormacao(validoAte: string | null, hoje: string): SituacaoDaFormacao {
  if (!validoAte) return 'sem_validade'
  if (validoAte < hoje) return 'vencida'
  const dias = Math.round((Date.parse(`${validoAte}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000)
  return dias <= 60 ? 'vence_logo' : 'valida'
}

/**
 * Redes sociais do voluntário: o cadastro guarda só endereços https, um por
 * rede (participantes.redes, jsonb). A pessoa digita como quiser (`@fulana`,
 * `instagram.com/fulana`, o link inteiro) e `normalizarRede` transforma no
 * endereço; o banco confere de novo que é um link https de até 300 caracteres.
 */
export const REDES = {
  instagram: { rotulo: 'Instagram', host: 'instagram.com', perfil: 'https://www.instagram.com/', dica: '@usuário ou o link' },
  linkedin: { rotulo: 'LinkedIn', host: 'linkedin.com', perfil: 'https://www.linkedin.com/in/', dica: 'O link do perfil' },
  facebook: { rotulo: 'Facebook', host: 'facebook.com', perfil: 'https://www.facebook.com/', dica: 'O link do perfil' },
  outro: { rotulo: 'Outro link', host: null, perfil: null, dica: 'Site, portfólio, TikTok, YouTube…' },
} as const
export type Rede = keyof typeof REDES
export const CHAVES_DAS_REDES = Object.keys(REDES) as Rede[]
export const ehRede = (s: unknown): s is Rede => typeof s === 'string' && Object.hasOwn(REDES, s)
export type Redes = Partial<Record<Rede, string>>
export const TAMANHO_DO_LINK = 300

const USUARIO = /^[A-Za-z0-9._-]{1,100}$/

/**
 * O que a pessoa digitou → o endereço https da rede, ou a mensagem de erro.
 * Vazio devolve null (campo não preenchido). Instagram, LinkedIn e Facebook
 * aceitam `@usuário` (vira o link do perfil) e só links do próprio site; o
 * "outro" aceita qualquer endereço http(s) com domínio.
 */
export function normalizarRede(rede: Rede, valor: string): { url: string } | { erro: string } | null {
  const r = REDES[rede]
  let texto = valor.trim()
  if (!texto) return null
  const invalido = { erro: rede === 'outro' ? 'Link inválido. Informe o endereço completo, como https://exemplo.com.br.' : `Link do ${r.rotulo} inválido. Cole o endereço do perfil${rede === 'instagram' ? ' ou informe o @usuário' : ''}.` }
  if (r.perfil) {
    // `@fulana.rj` ou `fulana.rj` (sem barra e sem o site) é o usuário; o resto é link.
    const comArroba = texto.startsWith('@')
    if (comArroba) texto = texto.slice(1)
    if (comArroba || (!texto.includes('/') && !texto.toLowerCase().includes(r.host))) return USUARIO.test(texto) ? { url: r.perfil + texto } : invalido
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) texto = 'https://' + texto
  let u: URL
  try { u = new URL(texto) } catch { return invalido }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return invalido
  if (u.username || u.password) return invalido
  const host = u.hostname.toLowerCase()
  if (r.host ? (host !== r.host && !host.endsWith('.' + r.host)) || u.pathname.length < 2 : !host.includes('.')) return invalido
  u.protocol = 'https:'
  u.hash = ''
  const url = u.toString().replace(/\/$/, '')
  if (url.length > TAMANHO_DO_LINK) return { erro: `Link do ${r.rotulo} longo demais (até ${TAMANHO_DO_LINK} caracteres).` }
  return { url }
}

/** Como o link aparece na tela: sem `https://www.`, e `@usuário` no Instagram. */
export function textoDaRede(rede: Rede, url: string): string {
  const m = rede === 'instagram' ? /^https:\/\/(?:www\.)?instagram\.com\/([^/?#]+)\/?$/.exec(url) : null
  if (m) return '@' + decodeURIComponent(m[1])
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/** Os links que o cadastro guarda, na ordem das redes e só os válidos. */
export function lerRedesGuardadas(bruto: unknown): [Rede, string][] {
  if (!bruto || typeof bruto !== 'object') return []
  const o = bruto as Record<string, unknown>
  return CHAVES_DAS_REDES.flatMap((k) => (typeof o[k] === 'string' && /^https?:\/\//.test(o[k] as string) ? [[k, o[k] as string] as [Rede, string]] : []))
}

/**
 * Os campos `rede_<nome>` do formulário. Só entra quando ao menos um deles
 * veio (formulário que não tem os campos não mexe nas redes guardadas); um
 * campo vazio tira aquele link.
 */
export function lerRedes(f: FormData): { redes: Redes; erros: string[] } | null {
  const presentes = CHAVES_DAS_REDES.filter((k) => f.has(`rede_${k}`))
  if (!presentes.length) return null
  const redes: Redes = {}
  const erros: string[] = []
  for (const k of presentes) {
    const r = normalizarRede(k, String(f.get(`rede_${k}`) ?? '').slice(0, 1000))
    if (!r) continue
    if ('erro' in r) erros.push(r.erro)
    else redes[k] = r.url
  }
  return { redes, erros }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Lista separada por vírgula ou linha → itens limpos, sem repetição. */
export function lerLista(texto: string, max = 20): string[] {
  return [...new Set(texto.split(/[,\n;]/).map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, max)
}

export type DadosDoParticipante = Record<string, string | string[] | boolean | Redes | null>

/**
 * Lê o formulário (da equipe ou público) nos campos que o banco entende.
 * Só entra no objeto o campo que veio no formulário — o banco só mexe no
 * que recebe. Devolve os erros que dá para apontar antes de ir ao banco.
 */
export function lerFormulario(f: FormData, hoje: string, o: { publico?: boolean; setores?: readonly string[] } = {}): { dados: DadosDoParticipante; erros: string[] } {
  const erros: string[] = []
  const dados: DadosDoParticipante = {}
  const texto = (k: string, max: number) => {
    if (!f.has(k)) return
    dados[k] = String(f.get(k) ?? '').trim().slice(0, max)
  }
  ;([
    ['nome', 200], ['nome_social', 200], ['telefone', 40], ['funcao', 120], ['cep', 12], ['logradouro', 200], ['numero', 20],
    ['complemento', 120], ['bairro', 120], ['cidade', 120], ['emergencia_nome', 200], ['emergencia_telefone', 40],
    ['emergencia_parentesco', 60], ['responsavel_nome', 200], ['responsavel_telefone', 40], ['observacoes', 4000],
  ] as const).forEach(([k, max]) => texto(k, max))

  if (f.has('email')) {
    const e = String(f.get('email') ?? '').trim().toLowerCase()
    if (e && !EMAIL.test(e)) erros.push('E-mail inválido.')
    dados.email = e
  }
  if (f.has('uf')) {
    const uf = String(f.get('uf') ?? '').trim().toUpperCase()
    if (uf && !(UFS as readonly string[]).includes(uf)) erros.push('UF inválida.')
    dados.uf = uf
  }
  if (f.has('data_nascimento')) {
    const d = String(f.get('data_nascimento') ?? '').trim()
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > hoje || d < '1900-01-01')) erros.push('Data de nascimento inválida.')
    dados.data_nascimento = d
  }
  if (f.has('vinculo')) {
    const v = String(f.get('vinculo') ?? '')
    if (!ehVinculo(v)) erros.push('Escolha o vínculo.')
    dados.vinculo = v
  }
  if (f.has('cpf')) {
    const c = somenteDigitos(String(f.get('cpf') ?? ''))
    if (c && !cpfValido(c)) erros.push('CPF inválido.')
    dados.cpf = c
  }
  // Saúde só vai quando a pessoa mexeu: sem os campos, o banco mantém o que havia.
  if (f.has('tipo_sanguineo') || f.has('restricoes_saude')) {
    const t = String(f.get('tipo_sanguineo') ?? '').trim()
    if (t && !(TIPOS_SANGUINEOS as readonly string[]).includes(t)) erros.push('Tipo sanguíneo inválido.')
    dados.tipo_sanguineo = t
    dados.restricoes_saude = String(f.get('restricoes_saude') ?? '').trim().slice(0, 2000)
  }
  if (f.has('setores')) { const validos = o.setores ?? NOMES_DOS_SETORES; dados.setores = f.getAll('setores').map(String).filter((s) => validos.includes(s)) }
  if (f.has('disponibilidade')) dados.disponibilidade = f.getAll('disponibilidade').map(String).filter((s) => (DISPONIBILIDADES as readonly string[]).includes(s))
  if (f.has('habilidades')) dados.habilidades = lerLista(String(f.get('habilidades') ?? ''))
  if (f.has('idiomas')) dados.idiomas = lerLista(String(f.get('idiomas') ?? ''), 10)
  const redes = lerRedes(f)
  if (redes) { erros.push(...redes.erros); dados.redes = redes.redes }

  if (!String(dados.nome ?? '').trim() && (o.publico || f.has('nome'))) erros.push('Informe o nome.')
  if (o.publico) {
    if (!dados.email) erros.push('Informe o e-mail.')
    if (!dados.data_nascimento) erros.push('Informe a data de nascimento.')
    if (ehMenor(String(dados.data_nascimento || ''), hoje) && (!dados.responsavel_nome || !dados.responsavel_telefone)) {
      erros.push('Para menores de 18 anos, informe o nome e o telefone do responsável.')
    }
    if (f.get('consentimento') !== 'sim') erros.push('É preciso aceitar o termo de tratamento de dados.')
    dados.consentimento = f.get('consentimento') === 'sim'
  }
  return { dados, erros }
}

/** CSV para Excel em português: ponto e vírgula, BOM e aspas quando preciso. */
export function paraCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const celula = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v)
    // Planilha não executa fórmula vinda do cadastro.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n')
}
