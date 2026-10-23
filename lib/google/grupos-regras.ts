/**
 * A troca do endereço de um setor — hoje um APELIDO de uma caixa (contato@) — por um GRUPO do Google, e o lugar de cada
 * pessoa nele. Conferido por script avulso contra um Google de mentira: `npx tsx scripts/conferir-grupos.ts`.
 *
 * É puro de propósito: nada aqui toca em banco, token ou rede. Quem chama passa `chamar`, a função que fala com o
 * Google (lib/google/diretorio.ts liga a de verdade). Isso permite provar, antes de mexer no e-mail de um setor de
 * verdade, cada caminho — inclusive as falhas no meio e a volta atrás.
 *
 * O que a troca mexe, e por quê é feita com cuidado: um endereço de setor (ti@, comunicacao@…) recebe mensagens de fora.
 *  - Apelido e grupo não convivem com o mesmo endereço: é preciso tirar o apelido antes de criar o grupo. Nesse
 *    instante o endereço não existe; por isso o grupo é criado logo em seguida, e qualquer falha DEVOLVE o apelido.
 *  - Um grupo novo só aceita mensagens de quem é do domínio. Sem liberar (`whoCanPostMessage: ANYONE_CAN_POST`), o
 *    endereço público do setor deixaria de receber e-mail de fora. Se a liberação falha, tudo volta ao que era.
 *  - A caixa que era dona do apelido entra no grupo como membro: o e-mail continua chegando onde chegava.
 *  - Caixa REAL (o endereço é o principal de um usuário, como contato@) nunca é convertida.
 */

export type Resposta = { ok: boolean; status: number; dados: Record<string, unknown> }

/** `api`: "diretorio" (Admin SDK Directory) ou "configuracoes" (Groups Settings). */
export type Chamar = (api: 'diretorio' | 'configuracoes', caminho: string, init?: { method?: string; corpo?: unknown }) => Promise<Resposta>

export type PapelNoGrupo = 'MEMBER' | 'MANAGER'

export type EstadoDoEndereco =
  | { tipo: 'grupo' }
  /** O endereço é apelido de `dono` (o usuário principal): é o caso a converter. */
  | { tipo: 'apelido'; dono: string }
  /** O endereço é o principal de um usuário: caixa real, nunca se converte. */
  | { tipo: 'caixa_real' }
  | { tipo: 'livre' }

const enc = encodeURIComponent
const msg = (r: Resposta) => String((r.dados.error as { message?: string } | undefined)?.message ?? `HTTP ${r.status}`)

/** Uma falha do Google que não é "não achei": quem chama decide o texto. */
export class ErroDeGrupo extends Error {
  constructor(message: string, public status = 0) {
    super(message)
    this.name = 'ErroDeGrupo'
  }
}

const falha = (r: Resposta, o: string): never => {
  if (r.status === 401) throw new ErroDeGrupo('O Google recusou a autorização de administrador. Reconecte em Configurações → E-mail dos setores.', 401)
  // O texto do Google já vem com o diagnóstico da conexão (lib/google/diretorio.ts, dicaDeAcessoNegado): o que o token tem e o que falta.
  if (r.status === 403) throw new ErroDeGrupo(`${o}: o Google negou o acesso. ${msg(r)}`, 403)
  throw new ErroDeGrupo(`${o}: ${msg(r)}`, r.status)
}

/** O que é este endereço no Google: um grupo, um apelido (de quem), uma caixa real, ou nada. */
export async function consultarEndereco(chamar: Chamar, email: string): Promise<EstadoDoEndereco> {
  const g = await chamar('diretorio', `/groups/${enc(email)}`)
  if (g.ok) return { tipo: 'grupo' }
  if (g.status !== 404) falha(g, 'Não foi possível consultar o grupo')
  const u = await chamar('diretorio', `/users/${enc(email)}`)
  if (u.status === 404) return { tipo: 'livre' }
  if (!u.ok) falha(u, 'Não foi possível consultar o endereço')
  const principal = String(u.dados.primaryEmail ?? '').toLowerCase()
  return principal && principal !== email.toLowerCase() ? { tipo: 'apelido', dono: principal } : { tipo: 'caixa_real' }
}

/** Pôs a pessoa no grupo com o papel; se já estava, ajusta o papel. false = o grupo não existe. */
export async function colocarNoGrupo(chamar: Chamar, grupo: string, email: string, papel: PapelNoGrupo): Promise<boolean> {
  const r = await chamar('diretorio', `/groups/${enc(grupo)}/members`, { method: 'POST', corpo: { email, role: papel } })
  if (r.ok) return true
  if (r.status === 404) return false
  if (r.status === 409) {
    // Já é membro: só o papel muda. O papel de dono/gerente nunca é rebaixado por quem entra como membro.
    const atual = await chamar('diretorio', `/groups/${enc(grupo)}/members/${enc(email)}`)
    if (atual.ok && atual.dados.role !== 'MEMBER') return true
    const p = await chamar('diretorio', `/groups/${enc(grupo)}/members/${enc(email)}`, { method: 'PUT', corpo: { email, role: papel } })
    if (!p.ok) falha(p, 'O Google não mudou o papel da pessoa no grupo')
    return true
  }
  return falha(r, 'O Google não pôs a pessoa no grupo')
}

/** O que um grupo de endereço de setor precisa: receber de fora, entrar só por convite. Tenta de novo (o grupo novo leva segundos para aparecer). */
export async function configurarGrupoDoSetor(chamar: Chamar, grupo: string, tentativas = 5, espera: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<void> {
  const corpo = { whoCanPostMessage: 'ANYONE_CAN_POST', whoCanJoin: 'INVITED_CAN_JOIN', whoCanContactOwner: 'ANYONE_CAN_CONTACT', allowExternalMembers: 'false' }
  let ultima: Resposta | null = null
  for (let i = 0; i < tentativas; i++) {
    // alt=json: sem isso a API de configurações responde em Atom/XML.
    ultima = await chamar('configuracoes', `/groups/v1/groups/${enc(grupo)}?alt=json`, { method: 'PATCH', corpo })
    if (ultima.ok) return
    if (ultima.status !== 404 && ultima.status < 500) break
    await espera(1500 * (i + 1))
  }
  falha(ultima as Resposta, 'O Google não liberou o grupo para receber e-mail de fora')
}

export type Conversao =
  | { feito: 'ja_era_grupo' }
  | { feito: 'convertido'; dono: string }
  | { feito: 'criado' }
  /** Não mexeu em nada, e por quê. */
  | { feito: 'nao_converteu'; motivo: 'caixa_real' }

/**
 * Faz do endereço do setor um grupo, sem perder o e-mail que chega nele. Qualquer falha desfaz o que já foi feito
 * (grupo criado e apelido tirado) e relança: o endereço fica como estava. `ErroDeGrupo` traz o motivo.
 */
export async function converterEmGrupo(chamar: Chamar, p: { endereco: string; nome: string; espera?: (ms: number) => Promise<void> }): Promise<Conversao> {
  const estado = await consultarEndereco(chamar, p.endereco)
  if (estado.tipo === 'grupo') return { feito: 'ja_era_grupo' }
  if (estado.tipo === 'caixa_real') return { feito: 'nao_converteu', motivo: 'caixa_real' }

  const dono = estado.tipo === 'apelido' ? estado.dono : null
  let apelidoTirado = false
  let grupoCriado = false
  const desfazer = async () => {
    // Melhor esforço, na ordem inversa: sem o grupo, o apelido volta e o e-mail do setor chega como antes.
    if (grupoCriado) await chamar('diretorio', `/groups/${enc(p.endereco)}`, { method: 'DELETE' }).catch(() => undefined)
    if (apelidoTirado && dono) await chamar('diretorio', `/users/${enc(dono)}/aliases`, { method: 'POST', corpo: { alias: p.endereco } }).catch(() => undefined)
  }

  try {
    if (dono) {
      const t = await chamar('diretorio', `/users/${enc(dono)}/aliases/${enc(p.endereco)}`, { method: 'DELETE' })
      if (!t.ok) falha(t, 'O Google não tirou o apelido do endereço')
      apelidoTirado = true
    }
    const c = await chamar('diretorio', '/groups', { method: 'POST', corpo: { email: p.endereco, name: p.nome, description: `Endereço do setor ${p.nome} (criado pelo Palácio Virtual)` } })
    if (!c.ok) falha(c, 'O Google não criou o grupo')
    grupoCriado = true
    await configurarGrupoDoSetor(chamar, p.endereco, 5, p.espera)
    // A caixa que recebia por apelido segue recebendo: entra como membro.
    if (dono && !(await colocarNoGrupo(chamar, p.endereco, dono, 'MEMBER'))) throw new ErroDeGrupo('O Google não pôs a caixa do setor no grupo novo.')
  } catch (causa) {
    await desfazer()
    throw causa
  }
  return dono ? { feito: 'convertido', dono } : { feito: 'criado' }
}

/** Texto de uma linha sobre o que vai mudar, para a confirmação de quem aprova. null = nada muda. */
export function avisoDaConversao(estado: EstadoDoEndereco, endereco: string): string | null {
  if (estado.tipo === 'apelido') return `⚠️ O endereço *${endereco}* hoje é apelido de ${estado.dono}. Ao confirmar, ele vira um *grupo do Google*: as mensagens continuam chegando em ${estado.dono}, e a equipe passa a ser membro do grupo. O envio pelo Palácio como ${endereco} pode precisar ser reverificado no Gmail.`
  if (estado.tipo === 'livre') return `O endereço *${endereco}* ainda não existe no Google: será criado como grupo do setor.`
  return null
}
