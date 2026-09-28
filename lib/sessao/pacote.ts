/**
 * O pacote da sessão: o que a função `palacio_sessao()` (migração
 * 20260929170000) devolve numa ida só ao banco, lido e conferido aqui. Puro:
 * `npx tsx scripts/conferir-sessao.ts` testa as regras.
 *
 * Tudo aqui é da própria pessoa (perfil, vínculos, níveis de acesso, sino)
 * ou o que ela já enxergava (as empresas do Financeiro, as pessoas do chat).
 * Quando o pacote não vem (migração ainda não aplicada, função falhou), quem
 * usa volta às leituras de antes: por isso cada campo é opcional na origem e
 * o pacote inteiro é `null` se o essencial faltar.
 */

export type VinculoDaSessao = {
  role: string
  coordination: string | null
  workspaces: { id: string; name: string; slug: string; kind: 'demo' | 'production'; mfa_obrigatorio_para: string[] | null }
}

export type EmpresaDaSessao = {
  id: string; nome: string; razao_social: string | null; cnpj: string | null; tipo: string; principal: boolean; fechado_ate: string | null
}

export type NotificacaoDaSessao = { id: string; title: string; message: string | null; link: string | null; read_at: string | null; created_at: string }

export type PessoaDaSessao = {
  user_id: string
  profiles: { full_name: string | null; username: string | null; initials: string | null; color: string | null; avatar_path: string | null; active: boolean | null } | null
}

export type PacoteDaSessao = {
  profile: Record<string, unknown>
  memberships: VinculoDaSessao[]
  workspaceId: string | null
  acessos: {
    financeiro: { nivel: string; entidade_id: string | null } | null
    patrimonio: string | null
    participantes: string | null
    equipe: string | null
  }
  leitorDeAcessos: boolean
  avaliadorDeEnvios: boolean
  escolaTemEntidade: boolean
  entidades: EmpresaDaSessao[]
  notificacoes: NotificacaoDaSessao[]
  naoLidas: number
  aprovacoesPendentes: number
  /** As linhas de chat_painel, como o RPC devolve. */
  chat: Record<string, unknown>[]
  pessoas: PessoaDaSessao[]
  /** Os blocos do Início (jsonb cru); null sem preferência guardada. */
  inicio: unknown
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : 0)

/** Lê o que o banco devolveu. `null` quando não é um pacote (sem a migração, erro, sem sessão). */
export function lerPacoteDaSessao(bruto: unknown): PacoteDaSessao | null {
  const p = objeto(bruto)
  const profile = objeto(p?.profile)
  if (!p || !profile || !Array.isArray(p.memberships)) return null
  const memberships = lista(p.memberships).flatMap((m) => {
    const o = objeto(m); const w = objeto(o?.workspaces)
    if (!o || !w || typeof o.role !== 'string' || typeof w.id !== 'string') return []
    return [{
      role: o.role, coordination: texto(o.coordination),
      workspaces: { id: w.id, name: String(w.name ?? ''), slug: String(w.slug ?? ''), kind: w.kind === 'demo' ? 'demo' : 'production', mfa_obrigatorio_para: Array.isArray(w.mfa_obrigatorio_para) ? w.mfa_obrigatorio_para.filter((x): x is string => typeof x === 'string') : null },
    } satisfies VinculoDaSessao]
  })
  const acessos = objeto(p.acessos) ?? {}
  const fin = objeto(acessos.financeiro)
  return {
    profile,
    memberships,
    workspaceId: texto(p.workspace_id),
    acessos: {
      financeiro: fin && typeof fin.nivel === 'string' ? { nivel: fin.nivel, entidade_id: texto(fin.entidade_id) } : null,
      patrimonio: texto(acessos.patrimonio),
      participantes: texto(acessos.participantes),
      equipe: texto(acessos.equipe),
    },
    leitorDeAcessos: p.leitor_de_acessos === true,
    avaliadorDeEnvios: p.avaliador_de_envios === true,
    escolaTemEntidade: p.escola_tem_entidade === true,
    entidades: lista(p.entidades).flatMap((e) => { const o = objeto(e); return o && typeof o.id === 'string' ? [o as unknown as EmpresaDaSessao] : [] }),
    notificacoes: lista(p.notificacoes).flatMap((n) => { const o = objeto(n); return o && typeof o.id === 'string' ? [o as unknown as NotificacaoDaSessao] : [] }),
    naoLidas: numero(p.nao_lidas),
    aprovacoesPendentes: numero(p.aprovacoes_pendentes),
    chat: lista(p.chat).flatMap((c) => { const o = objeto(c); return o ? [o] : [] }),
    pessoas: lista(p.pessoas).flatMap((x) => { const o = objeto(x); return o && typeof o.user_id === 'string' ? [{ user_id: o.user_id, profiles: objeto(o.profiles) as PessoaDaSessao['profiles'] }] : [] }),
    inicio: p.inicio ?? null,
  }
}

/** O painel do chat que veio no pacote serve se tem o canal geral; senão o layout prepara o chat como antes. */
export const chatDoPacotePronto = (pacote: PacoteDaSessao | null): boolean => Boolean(pacote?.chat.some((c) => c.geral === true))
