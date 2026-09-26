/**
 * O Diretório: a equipe inteira num lugar só — quem tem conta na Redação,
 * quem está na Equipe (RH) sem conta e quem está na lista oficial dos setores
 * e ainda não foi cadastrado. Puro: dá para conferir com tsx.
 */

import { chaveDoNome } from '@/lib/equipe'

export type Acesso = 'ativo' | 'convite' | 'desativado' | 'sem_acesso'
export const ACESSOS: Record<Acesso, { rotulo: string; classe: string; ajuda: string }> = {
  ativo: { rotulo: 'Com acesso', classe: 'bg-success/15 text-success', ajuda: 'Já entrou no Palácio Virtual.' },
  convite: { rotulo: 'Convite pendente', classe: 'bg-warning/20 text-warning-foreground', ajuda: 'Tem conta, mas ainda não fez o primeiro acesso.' },
  desativado: { rotulo: 'Desativado', classe: 'bg-muted text-muted-foreground', ajuda: 'A conta foi desativada.' },
  sem_acesso: { rotulo: 'Sem acesso', classe: 'bg-muted text-muted-foreground', ajuda: 'Está na equipe, mas não tem login no Palácio Virtual.' },
}

/** Uma linha de public.diretorio (conta ou ficha da Equipe sem conta). */
export type LinhaDoDiretorio = {
  tipo: 'conta' | 'ficha'; user_id: string | null; ficha_id: string | null; nome: string; cargo: string | null; setor: string | null; email: string | null; telefone: string | null
  avatar_path: string | null; iniciais: string | null; cor: string | null; papel: string | null; acesso: Acesso; gestor: string | null; visto_em: string | null; criado_em: string | null
}
export type PessoaDaLista = { nome: string; cargo: string; setor: string }

export type PessoaDoDiretorio = LinhaDoDiretorio & {
  chave: string; origem: 'conta' | 'ficha' | 'lista'
  /** Ficha da Equipe com o mesmo nome da conta, mas não ligada a ela (o admin liga na ficha). */
  fichaSolta?: string
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du'])

/** "daniel lamim" → "Daniel Lamim" (só quando o nome veio todo em minúsculas; não mexe em "Maria da Silva"). */
export function nomeExibido(nome: string): string {
  const n = nome.trim().replace(/\s+/g, ' ')
  if (n !== n.toLowerCase()) return n
  return n.split(' ').map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ')
}

export function iniciaisDe(nome: string): string {
  const partes = nomeExibido(nome).split(/[\s.]+/).filter((p) => p && !MINUSCULAS.has(p.toLowerCase()))
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?'
}

/** O que falta no cadastro de uma pessoa (o admin vê, para completar). */
export function pendencias(p: Pick<PessoaDoDiretorio, 'nome' | 'cargo' | 'setor' | 'email'>): string[] {
  const r: string[] = []
  const n = p.nome.trim()
  if (!n.includes(' ') || /[._@]/.test(n)) r.push('nome completo')
  if (!p.cargo) r.push('cargo')
  if (!p.setor) r.push('setor')
  if (!p.email) r.push('e-mail')
  return r
}

/**
 * Junta contas, fichas e a lista oficial sem repetir ninguém: conta e ficha
 * já vêm unidas pelo banco; da lista oficial entra só quem não aparece (pelo
 * nome, sem acento nem caixa).
 */
export function montarDiretorio(linhas: LinhaDoDiretorio[], lista: PessoaDaLista[]): PessoaDoDiretorio[] {
  const contas = new Map(linhas.filter((l) => l.tipo === 'conta').map((l) => [chaveDoNome(l.nome), l]))
  const r: PessoaDoDiretorio[] = []
  for (const l of linhas) {
    // Ficha sem login com o nome de uma conta: é a mesma pessoa, com o vínculo faltando.
    const dona = l.tipo === 'ficha' ? contas.get(chaveDoNome(l.nome)) : undefined
    if (dona) continue
    r.push({ ...l, chave: l.user_id ?? `ficha:${l.ficha_id}`, origem: l.tipo })
  }
  for (const l of linhas) {
    const dona = l.tipo === 'ficha' ? contas.get(chaveDoNome(l.nome)) : undefined
    const p = dona && r.find((x) => x.user_id === dona.user_id)
    if (p && !p.ficha_id && l.ficha_id) p.fichaSolta = l.ficha_id
  }
  const nomes = new Set(r.map((p) => chaveDoNome(p.nome)))
  for (const p of lista) {
    if (nomes.has(chaveDoNome(p.nome))) continue
    nomes.add(chaveDoNome(p.nome))
    r.push({
      tipo: 'ficha', user_id: null, ficha_id: null, nome: p.nome, cargo: p.cargo || null, setor: p.setor, email: null, telefone: null, avatar_path: null, iniciais: null, cor: null,
      papel: null, acesso: 'sem_acesso', gestor: null, visto_em: null, criado_em: null, chave: `lista:${chaveDoNome(p.nome)}`, origem: 'lista',
    })
  }
  return r.sort((a, b) => nomeExibido(a.nome).localeCompare(nomeExibido(b.nome), 'pt-BR'))
}

export type Filtro = { q?: string; setor?: string; acesso?: Acesso | 'todos' }

export function filtrar(pessoas: PessoaDoDiretorio[], f: Filtro): PessoaDoDiretorio[] {
  const termo = chaveDoNome(f.q ?? '')
  return pessoas.filter((p) =>
    (!f.setor || (f.setor === '__sem' ? !p.setor : p.setor === f.setor)) &&
    (!f.acesso || f.acesso === 'todos' || p.acesso === f.acesso) &&
    (!termo || chaveDoNome([p.nome, p.cargo, p.setor, p.email, p.telefone].filter(Boolean).join(' ')).includes(termo)))
}

/** Pessoas por setor, na ordem do cadastro; quem não tem setor (ou tem um que saiu da lista) fica no fim. */
export function porSetor(pessoas: PessoaDoDiretorio[], setores: string[]): { setor: string | null; pessoas: PessoaDoDiretorio[] }[] {
  const grupos = setores.map((s) => ({ setor: s as string | null, pessoas: pessoas.filter((p) => p.setor === s) }))
  const fora = pessoas.filter((p) => !p.setor || !setores.includes(p.setor))
  const outros = [...new Set(fora.map((p) => p.setor).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return [...grupos, ...outros.map((s) => ({ setor: s, pessoas: fora.filter((p) => p.setor === s) })), { setor: null, pessoas: fora.filter((p) => !p.setor) }]
    .filter((g) => g.pessoas.length)
}

/**
 * Admins demais: o papel admin cria contas, muda papéis e vê tudo. O
 * recomendado é ter 1 ou 2 — um titular e um reserva.
 */
export function adminsDemais(pessoas: Pick<PessoaDoDiretorio, 'papel' | 'acesso'>[]): { admins: number; contas: number; alerta: boolean } {
  const contas = pessoas.filter((p) => p.papel && p.acesso !== 'desativado')
  const admins = contas.filter((p) => p.papel === 'admin').length
  return { admins, contas: contas.length, alerta: admins > 2 || (contas.length >= 3 && admins === contas.length) }
}

/** Link de WhatsApp para celular brasileiro (11 dígitos com DDD, ou com 55 na frente). */
export function whatsapp(telefone: string | null): string | null {
  if (!telefone) return null
  let d = telefone.replace(/\D/g, '')
  if (d.length === 11 && d[2] === '9') d = `55${d}`
  return /^55\d{2}9\d{8}$/.test(d) ? `https://wa.me/${d}` : null
}
