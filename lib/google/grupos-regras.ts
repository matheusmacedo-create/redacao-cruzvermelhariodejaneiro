/**
 * HOJE (24/10/2026) o que vale aqui é a CAIXA PRÓPRIA do setor — `planoDasCaixas`, `criarCaixasDosSetores`,
 * `criarCaixaDoSetor`, `redefinirSenhaDaCaixa`, `restaurarApelido`, `removerApelidos` —, abaixo do meio do arquivo. Tudo
 * o que fala de GRUPO (a troca de apelido por grupo, `converterEmGrupo`, `colocarNoGrupo`…) foi desligado por decisão do
 * responsável e nada o chama; fica testado, à mão, caso volte.
 *
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

import { createHash } from 'node:crypto'

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
/** A mensagem do Google com o `reason` (forbidden, accessNotConfigured, insufficientPermissions…): é ele que separa as causas de um 403. */
const msg = (r: Resposta) => {
  const e = r.dados.error as { message?: string; errors?: { reason?: string }[]; status?: string } | undefined
  const reason = e?.errors?.[0]?.reason ?? e?.status
  return `${e?.message ?? `HTTP ${r.status}`}${reason ? ` (reason: ${reason})` : ''}`
}

/** Uma falha do Google que não é "não achei": quem chama decide o texto. */
export class ErroDeGrupo extends Error {
  /** Só quando a volta atrás falhou: o que o administrador precisa restaurar à mão. Nunca fica em silêncio. */
  restauracaoFalhou: string | null = null
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

/**
 * O que é este endereço no Google: um grupo, um apelido (de quem), uma caixa real, ou nada.
 *
 * Pergunta primeiro pelo USUÁRIO, e só depois pelo grupo: com o endereço de um apelido, o Google responde 403 ("Not
 * Authorized to access this resource/api") a `groups.get`, e não 404 como se esperaria — foi o que travou a primeira
 * tentativa de troca (a leitura de usuários e a de grupos funcionavam; só o `groups.get` do apelido caía). Pelo usuário
 * o apelido aparece (`primaryEmail` diferente do endereço) e nem se chega a perguntar pelo grupo.
 */
export async function consultarEndereco(chamar: Chamar, email: string): Promise<EstadoDoEndereco> {
  const u = await chamar('diretorio', `/users/${enc(email)}`)
  if (u.ok) {
    const principal = String(u.dados.primaryEmail ?? '').toLowerCase()
    return principal && principal !== email.toLowerCase() ? { tipo: 'apelido', dono: principal } : { tipo: 'caixa_real' }
  }
  const g = await chamar('diretorio', `/groups/${enc(email)}`)
  if (g.ok) return { tipo: 'grupo' }
  if (u.status === 404 && g.status === 404) return { tipo: 'livre' }
  // Qualquer outra combinação é falha de verdade (token, permissão, serviço fora): mostra a que não foi "não achei".
  return falha(u.status !== 404 ? u : g, 'Não foi possível consultar o endereço')
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

/**
 * Pôs a pessoa no grupo do setor SÓ se o endereço já é grupo: apelido e caixa real devolvem 'nao_e_grupo' sem tocar em
 * nada (a chamada direta ao grupo de um apelido dá 403, não 404). É o caminho de quem não converte (o coordenador).
 */
export async function colocarSeForGrupo(chamar: Chamar, endereco: string, email: string, papel: PapelNoGrupo): Promise<'ok' | 'nao_e_grupo'> {
  const estado = await consultarEndereco(chamar, endereco)
  if (estado.tipo !== 'grupo') return 'nao_e_grupo'
  return (await colocarNoGrupo(chamar, endereco, email, papel)) ? 'ok' : 'nao_e_grupo'
}

/** O que um grupo de endereço de setor precisa: receber de fora, entrar só por convite. Tenta de novo (o grupo novo leva segundos para aparecer). */
export async function configurarGrupoDoSetor(chamar: Chamar, grupo: string, tentativas = 5, espera: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<void> {
  // Receber de fora (ANYONE_CAN_POST), entrar só por convite — e FECHADO por dentro: um endereço de setor (Psicologia,
  // Jurídico, Ouvidoria…) recebe mensagens sensíveis, e o padrão da organização deixaria "todos os usuários" verem e
  // encontrarem o grupo. Só os membros veem e descobrem.
  const corpo = {
    whoCanPostMessage: 'ANYONE_CAN_POST', whoCanJoin: 'INVITED_CAN_JOIN', whoCanContactOwner: 'ANYONE_CAN_CONTACT', allowExternalMembers: 'false',
    whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW', whoCanDiscoverGroup: 'ALL_MEMBERS_CAN_DISCOVER',
  }
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

  // Só leitura, ANTES de mexer no apelido: se o Google nega a leitura de grupos ou a API de configurações ainda não está
  // ligada (ou propagando), aborta sem tocar no e-mail do setor — em vez de tirar o apelido e descobrir depois.
  await verificarAntesDeConverter(chamar, p.endereco)

  const dono = estado.tipo === 'apelido' ? estado.dono : null
  const espera = p.espera ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let apelidoTirado = false
  let grupoCriado = false

  // A volta atrás é a parte que não pode falhar em silêncio: o apelido tirado e não devolvido deixa o endereço do setor
  // sem existir. Cada passo é conferido (o Google devolve { ok: false }, não lança), o apelido é tentado de novo, e o
  // que importa é o resultado: o endereço voltou a ser apelido do dono? Devolve o que ficou por fazer, ou null.
  const desfazer = async (): Promise<string | null> => {
    const ficou: string[] = []
    if (grupoCriado) {
      const d = await chamar('diretorio', `/groups/${enc(p.endereco)}`, { method: 'DELETE' }).catch(() => null)
      if (!d || (!d.ok && d.status !== 404)) ficou.push(`apagar o grupo ${p.endereco}`)
    }
    if (apelidoTirado && dono) {
      let voltou = false
      for (let i = 0; i < 6 && !voltou; i++) {
        await chamar('diretorio', `/users/${enc(dono)}/aliases`, { method: 'POST', corpo: { alias: p.endereco } }).catch(() => null)
        const e = await consultarEndereco(chamar, p.endereco).catch(() => null)
        voltou = e?.tipo === 'apelido' && e.dono === dono
        if (!voltou) await espera(1500 * (i + 1))
      }
      if (!voltou) ficou.push(`devolver o apelido ${p.endereco} a ${dono}`)
    }
    return ficou.length ? ficou.join(' e ') : null
  }

  try {
    if (dono) {
      const t = await chamar('diretorio', `/users/${enc(dono)}/aliases/${enc(p.endereco)}`, { method: 'DELETE' })
      if (!t.ok) falha(t, 'O Google não tirou o apelido do endereço')
      apelidoTirado = true
    }
    // Logo depois de tirar o apelido, o Google ainda pode responder 409 ("já existe") por alguns segundos: espera e tenta de novo.
    let c: Resposta | null = null
    for (let i = 0; i < 6; i++) {
      c = await chamar('diretorio', '/groups', { method: 'POST', corpo: { email: p.endereco, name: p.nome, description: `Endereço do setor ${p.nome} (criado pelo Palácio Virtual)` } })
      if (c.ok || c.status !== 409) break
      await espera(1500 * (i + 1))
    }
    if (!c?.ok) falha(c as Resposta, 'O Google não criou o grupo')
    grupoCriado = true
    await configurarGrupoDoSetor(chamar, p.endereco, 5, p.espera)
    // A caixa que recebia por apelido segue recebendo: entra como membro.
    if (dono && !(await colocarNoGrupo(chamar, p.endereco, dono, 'MEMBER'))) throw new ErroDeGrupo('O Google não pôs a caixa do setor no grupo novo.')
  } catch (causa) {
    const erro = causa instanceof ErroDeGrupo ? causa : new ErroDeGrupo(`Falha ao falar com o Google: ${causa instanceof Error ? causa.message : 'erro'}`)
    const ficou = await desfazer()
    if (ficou) {
      erro.restauracaoFalhou = ficou
      erro.message = `${erro.message} 🚨 ATENÇÃO: não consegui ${ficou}. Restaure à mão no Admin do Google${dono ? ` (Usuários → ${dono} → Apelidos de e-mail)` : ''}.`
    }
    throw erro
  }
  return dono ? { feito: 'convertido', dono } : { feito: 'criado' }
}

/**
 * A checagem que vem ANTES de qualquer mudança: lê os grupos e olha se a API de configurações de grupo responde. O
 * endereço de sonda não existe no Google; com a API ligada e autorizada a resposta é 404 (ou 200), nunca 401/403.
 * Só 401 e o 403 de "API não ligada / ainda propagando" abortam; outros 403 seguem (a volta atrás cobre o resto).
 */
export async function verificarAntesDeConverter(chamar: Chamar, endereco: string): Promise<void> {
  const lista = await chamar('diretorio', '/groups?customer=my_customer&maxResults=1')
  if (!lista.ok) falha(lista, 'O Google não deixou ler os grupos (nada foi alterado)')
  const dominio = endereco.split('@')[1] ?? ''
  const cfg = await chamar('configuracoes', `/groups/v1/groups/${enc(`palacio-sonda-inexistente@${dominio}`)}?alt=json`)
  if (cfg.status === 401 || (cfg.status === 403 && /not been used|disabled|accessNotConfigured|SERVICE_DISABLED|not enabled/i.test(msg(cfg)))) {
    falha(cfg, 'A API de configurações de grupo ainda não está liberada, e pode estar propagando (nada foi alterado; tente de novo em alguns minutos)')
  }
}

/**
 * A sonda do comando "grupos": separa "o serviço de grupos inteiro nega o acesso" de "só este endereço". Pede uma
 * página de usuários e uma de grupos (só leitura). Se usuários vai e grupos não, o problema é do serviço de Grupos na
 * organização (Admin Console → Apps → Google Workspace → Grupos para empresas), não do token nem da conta.
 */
export async function sondarAcesso(chamar: Chamar, dominio = 'example.org'): Promise<string[]> {
  const um = async (rotulo: string, caminho: string): Promise<{ linha: string; ok: boolean }> => {
    try {
      const r = await chamar('diretorio', caminho)
      return r.ok ? { linha: `✅ ${rotulo}`, ok: true } : { linha: `❌ ${rotulo} (HTTP ${r.status}: ${msg(r).slice(0, 120)})`, ok: false }
    } catch (causa) {
      return { linha: `❌ ${rotulo} (${causa instanceof Error ? causa.message.slice(0, 120) : 'erro'})`, ok: false }
    }
  }
  const usuarios = await um('Ler usuários', '/users?customer=my_customer&maxResults=1')
  const grupos = await um('Ler grupos', '/groups?customer=my_customer&maxResults=1')
  // A API de configurações de grupo (a que libera o recebimento de fora): endereço inexistente responde 404 se ela está ligada e autorizada.
  let configuracoes: { linha: string; ok: boolean }
  try {
    const r = await chamar('configuracoes', `/groups/v1/groups/${enc(`palacio-sonda-inexistente@${dominio}`)}?alt=json`)
    configuracoes = r.ok || r.status === 404
      ? { linha: '✅ API de configurações de grupo', ok: true }
      : { linha: `❌ API de configurações de grupo (HTTP ${r.status}: ${msg(r).slice(0, 120)})`, ok: false }
  } catch (causa) {
    configuracoes = { linha: `❌ API de configurações de grupo (${causa instanceof Error ? causa.message.slice(0, 120) : 'erro'})`, ok: false }
  }
  const linhas = [usuarios.linha, grupos.linha, configuracoes.linha]
  if (!configuracoes.ok) linhas.push('→ Ligue a *Groups Settings API* no projeto do Google Cloud (e espere alguns minutos): sem ela a troca de apelido por grupo não libera o recebimento de e-mail de fora.')
  if (usuarios.ok && !grupos.ok) linhas.push('→ Usuários funcionam e grupos não: o serviço *Grupos para empresas* provavelmente está desativado na organização (Admin Console → Apps → Google Workspace → Grupos para empresas → Status do serviço).')
  return linhas
}

export type ItemDeEndereco = { nome: string; endereco: string }
export type ResultadoDoApelido = { nome: string; endereco: string; resultado: 'removido' | 'nao_era_apelido' | 'falhou'; dono?: string; motivo?: string }

/** O que o endereço de um setor é hoje no Google (`dono`: só quando é apelido, de quem). */
export type PlanoDaCaixa = ItemDeEndereco & { estado: EstadoDoEndereco['tipo']; dono?: string }

/**
 * Só leitura: o que é hoje o endereço de cada setor — apelido (de quem), livre, caixa real ou grupo. É a prévia do comando
 * "caixas dos setores": o administrador vê, setor por setor, o que vai acontecer antes de confirmar.
 */
export async function planoDasCaixas(chamar: Chamar, itens: ItemDeEndereco[]): Promise<PlanoDaCaixa[]> {
  const plano: PlanoDaCaixa[] = []
  for (const it of itens) {
    const e = await consultarEndereco(chamar, it.endereco)
    plano.push({ ...it, estado: e.tipo, ...(e.tipo === 'apelido' ? { dono: e.dono } : {}) })
  }
  return plano
}

/** Precisa de caixa nova: o endereço é apelido (apaga e cria) ou está livre (cria). Caixa real e grupo ficam como estão. */
export const precisaDeCaixa = (p: PlanoDaCaixa) => p.estado === 'apelido' || p.estado === 'livre'

/**
 * Uma impressão do que a confirmação vai fazer (SHA-256 truncado, em hexadecimal): os endereços que precisam de caixa, em que
 * estado estão, de quem são apelido e quem receberá a senha de cada um (`destinatarios`: endereço → números dos
 * coordenadores). Vai dentro do id do botão: se algo mudou entre a prévia e o toque — outro apelido que surgiu, uma caixa que
 * já foi criada, um coordenador que entrou ou saiu —, a impressão não bate e nada é feito. É também o que impede o segundo
 * toque depois de um lote concluído: o plano já é outro.
 */
export function assinaturaDoPlano(plano: PlanoDaCaixa[], destinatarios: Record<string, string[]> = {}): string {
  const texto = plano.filter(precisaDeCaixa)
    .map((p) => `${p.endereco.toLowerCase()}>${p.estado}>${(p.dono ?? '').toLowerCase()}>${[...(destinatarios[p.endereco.toLowerCase()] ?? [])].sort().join(',')}`)
    .sort().join('\n')
  return createHash('sha256').update(texto, 'utf8').digest('hex').slice(0, 12)
}

/**
 * Apaga o APELIDO de cada endereço, e só ele: confere de novo, na hora, que o endereço ainda é apelido de alguém — caixa
 * real (contato@), grupo e endereço que não existe nunca são tocados. Um item que falha não impede os outros; o resultado
 * diz o que houve em cada um. Apagar o apelido não apaga e-mail nenhum: o histórico fica na caixa do dono; só deixa de
 * chegar nela o que for enviado a esse endereço depois (até alguém criar a caixa própria do setor).
 */
export async function removerApelidos(chamar: Chamar, itens: ItemDeEndereco[]): Promise<ResultadoDoApelido[]> {
  const saida: ResultadoDoApelido[] = []
  for (const it of itens) {
    try {
      const e = await consultarEndereco(chamar, it.endereco)
      if (e.tipo !== 'apelido') { saida.push({ ...it, resultado: 'nao_era_apelido' }); continue }
      const r = await chamar('diretorio', `/users/${enc(e.dono)}/aliases/${enc(it.endereco)}`, { method: 'DELETE' })
      if (r.ok) saida.push({ ...it, resultado: 'removido', dono: e.dono })
      // 404: o apelido já não existe (outro toque, outro administrador) — não fomos nós que o apagamos, e dizer que sim engana.
      else if (r.status === 404) saida.push({ ...it, resultado: 'nao_era_apelido' })
      else saida.push({ ...it, resultado: 'falhou', dono: e.dono, motivo: msg(r).slice(0, 160) })
    } catch (causa) {
      saida.push({ ...it, resultado: 'falhou', motivo: (causa instanceof Error ? causa.message : 'erro').slice(0, 160) })
    }
  }
  return saida
}

export type CaixaDoSetor =
  | { feito: 'criada' }
  /** Não criou nada, e por quê: o endereço ainda é apelido (apague os apelidos antes), já é caixa real ou já é grupo. */
  | { feito: 'nao_criada'; motivo: 'apelido' | 'caixa_real' | 'grupo'; dono?: string }

/**
 * A CAIXA PRÓPRIA do setor: uma conta de verdade (usuário) no endereço do setor, privada, com senha provisória que o
 * Google obriga a trocar no primeiro acesso. Só cria se o endereço está LIVRE: apelido, caixa real e grupo nunca são
 * tocados (apelido e conta não convivem com o mesmo endereço: apague os apelidos antes). Quem chama passa a senha e as
 * formas de recuperação (o e-mail e o celular de quem vai cuidar da caixa).
 */
export async function criarCaixaDoSetor(chamar: Chamar, p: { endereco: string; nome: string; senha: string; recuperacaoEmail?: string; recuperacaoCelular?: string; espera?: (ms: number) => Promise<void>; semConsulta?: boolean; tentativas409?: number }): Promise<CaixaDoSetor> {
  // `semConsulta`: quem chama acabou de consultar (ou de apagar o apelido) e o POST é a palavra final — responde 409 se o endereço
  // existe. Uma segunda consulta logo depois de apagar o apelido pode ainda enxergá-lo (leitura atrasada) e recusar à toa.
  const estado: EstadoDoEndereco = p.semConsulta ? { tipo: 'livre' } : await consultarEndereco(chamar, p.endereco)
  if (estado.tipo === 'apelido') return { feito: 'nao_criada', motivo: 'apelido', dono: estado.dono }
  if (estado.tipo === 'caixa_real') return { feito: 'nao_criada', motivo: 'caixa_real' }
  if (estado.tipo === 'grupo') return { feito: 'nao_criada', motivo: 'grupo' }
  const corpo: Record<string, unknown> = {
    primaryEmail: p.endereco,
    // O Google exige nome e sobrenome: o setor é o nome, "Cruz Vermelha RJ" o sobrenome.
    name: { givenName: p.nome, familyName: 'Cruz Vermelha RJ' },
    password: p.senha,
    changePasswordAtNextLogin: true,
    orgUnitPath: '/',
    organizations: [{ department: p.nome, primary: true }],
  }
  if (p.recuperacaoEmail) corpo.recoveryEmail = p.recuperacaoEmail
  if (p.recuperacaoCelular) corpo.recoveryPhone = p.recuperacaoCelular
  const espera = p.espera ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let r = await chamar('diretorio', '/users', { method: 'POST', corpo })
  // Logo depois de apagar o apelido, o Google ainda pode dizer 409 ("já existe") por alguns segundos, mesmo com a consulta
  // acima dizendo "livre": espera e tenta de novo, como a troca por grupo já fazia. Um 409 que não passa é o endereço ocupado de verdade.
  for (let i = 0; i < (p.tentativas409 ?? 3) && r.status === 409; i++) {
    await espera(1500 * (i + 1))
    r = await chamar('diretorio', '/users', { method: 'POST', corpo })
  }
  if (r.ok) return { feito: 'criada' }
  if (r.status === 409) throw new ErroDeGrupo(`O Google ainda diz que ${p.endereco} existe (liberar um apelido pode levar um minuto). Tente de novo em instantes com *caixas dos setores*; se continuar, mande *grupos* para ver o que o Google mostra.`, 409)
  if (r.status === 412 || /limit|licens/i.test(msg(r))) throw new ErroDeGrupo('O Google não deixou criar mais contas: a filial chegou ao limite de usuários do Workspace.', r.status)
  return falha(r, 'O Google não criou a caixa do setor')
}

/**
 * O que a confirmação do administrador diz sobre a caixa do setor (só quando quem entra é coordenador(a)). null = nada a dizer.
 * `semDono`: a caixa já existe (criada por "caixas dos setores") e ninguém a coordena ainda — é a que será entregue.
 */
export function avisoDaCaixaDoSetor(estado: EstadoDoEndereco, p: { endereco: string; nome: string; quem: string; semDono?: boolean }): string | null {
  if (estado.tipo === 'livre') return `Por ser coordenador(a), também será criada a *caixa do setor ${p.nome}* (${p.endereco}): conta própria, caixa privada, com a senha para ${p.quem}.`
  if (estado.tipo === 'apelido') return `⚠️ O endereço *${p.endereco}* ainda é apelido de ${estado.dono}: a caixa do setor *não* será entregue agora. Mande *caixas dos setores* (apaga o apelido e cria a caixa) e só depois aprove.`
  if (estado.tipo === 'caixa_real' && p.semDono) return `A *caixa do setor ${p.nome}* (${p.endereco}) já existe e ainda não tem responsável: ao confirmar, ela é entregue a ${p.quem} — a senha é redefinida (uma nova vai por WhatsApp) e a recuperação passa a ser a dele(a).`
  if (estado.tipo === 'caixa_real') return `${p.endereco} já é uma caixa real (com responsável, ou que o Palácio não criou): nada será mudado nela.`
  return `${p.endereco} é um grupo do Google: nada será criado para o setor.`
}

/**
 * Redefine a senha de uma caixa que já existe (e a recuperação, se vier) e obriga a trocar no primeiro acesso. É o "entregar"
 * a caixa de um setor que foi criada sem dono: a senha de quando nasceu não foi guardada por ninguém. Só mexe se o endereço é
 * caixa real E ninguém jamais entrou nela (`lastLoginTime` = 1970-01-01 no Directory; sem o campo, não se mexe): uma caixa que já
 * teve acesso está em uso e a senha dela não se troca por aqui, mesmo que o nosso registro diga que não tem responsável. Quem chama garante o resto
 * (que a caixa é uma das nossas e ainda não foi entregue); o contato@ nunca passa por aqui.
 * 'nao_e_caixa': o endereço não é caixa real, nada foi feito. 'em_uso': já houve acesso, nada foi feito.
 */
export async function redefinirSenhaDaCaixa(chamar: Chamar, p: { endereco: string; senha: string; recuperacaoEmail?: string; recuperacaoCelular?: string }): Promise<'redefinida' | 'nao_e_caixa' | 'em_uso'> {
  const u = await chamar('diretorio', `/users/${enc(p.endereco)}`)
  if (!u.ok) return u.status === 404 ? 'nao_e_caixa' : falha(u, 'Não foi possível consultar a caixa do setor')
  const principal = String(u.dados.primaryEmail ?? '').toLowerCase()
  if (!principal || principal !== p.endereco.toLowerCase()) return 'nao_e_caixa'
  // Falha FECHADA: só redefine com a prova de que ninguém nunca entrou (1970-01-01). Se o Google não informou o último acesso,
  // não há prova — 'em_uso' manda redefinir no Admin do Google, que é lento mas não derruba quem usa a caixa.
  const ultimo = u.dados.lastLoginTime
  if (typeof ultimo !== 'string' || !ultimo.startsWith('1970-01-01')) return 'em_uso'
  const corpo: Record<string, unknown> = { password: p.senha, changePasswordAtNextLogin: true }
  if (p.recuperacaoEmail) corpo.recoveryEmail = p.recuperacaoEmail
  if (p.recuperacaoCelular) corpo.recoveryPhone = p.recuperacaoCelular
  const r = await chamar('diretorio', `/users/${enc(p.endereco)}`, { method: 'PATCH', corpo })
  if (!r.ok) falha(r, 'O Google não redefiniu a senha da caixa do setor')
  return 'redefinida'
}

/**
 * O apelido `endereco` está na lista de apelidos de `dono`? Usa a lista do dono (GET /users/{dono}/aliases), que é a palavra
 * final, e não GET /users/{endereco}, que logo depois de uma mudança pode ainda responder o estado velho. null = não consegui ler.
 */
export async function apelidoEstaNoDono(chamar: Chamar, dono: string, endereco: string): Promise<boolean | null> {
  try {
    const r = await chamar('diretorio', `/users/${enc(dono)}/aliases`)
    if (!r.ok) return null
    const lista = (r.dados.aliases as { alias?: string }[] | undefined) ?? []
    return lista.some((a) => String(a.alias ?? '').toLowerCase() === endereco.toLowerCase())
  } catch {
    return null
  }
}

/**
 * Devolve o apelido `endereco` à caixa `dono`: a volta atrás quando a caixa do setor não nasceu depois de o apelido ser apagado.
 * Só diz que voltou se a LISTA do dono tem o apelido — nunca pela resposta do POST sozinha (a resposta pode se perder com o
 * apelido já gravado, e um 409 pode ser o endereço ocupado por outra coisa) nem pela leitura do endereço (pode estar atrasada).
 * Uma exceção (timeout, queda de rede) não interrompe as tentativas.
 */
export async function restaurarApelido(chamar: Chamar, dono: string, endereco: string, espera: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await chamar('diretorio', `/users/${enc(dono)}/aliases`, { method: 'POST', corpo: { alias: endereco } })
      if (r.ok) return true
    } catch {
      // timeout ou queda: não diz se gravou — a lista abaixo diz
    }
    if ((await apelidoEstaNoDono(chamar, dono, endereco)) === true) return true
    if (i < 3) await espera(1500 * (i + 1))
  }
  return (await apelidoEstaNoDono(chamar, dono, endereco)) === true
}

export type ResultadoDaCaixa = ItemDeEndereco & {
  resultado: 'criada' | 'ja_existe' | 'e_grupo' | 'falhou' | 'adiada'
  /** O endereço era apelido e o apelido foi apagado para a caixa nascer. */
  apelidoApagado?: boolean
  /** A caixa não nasceu depois de o apelido ser apagado: se o apelido voltou ao lugar. */
  apelidoDevolvido?: boolean
  /** O Google não respondeu e não dá para saber como o endereço ficou: confira no Admin do Google. */
  incerto?: boolean
  motivo?: string
  /** Preenchidos por quem chama, em `aoCriar` (o registro no banco e a entrega da senha). */
  entrega?: 'enviada' | 'na_fila' | 'falhou' | 'sem_coordenador'
  registro?: 'ok' | 'falhou'
}

/** Um erro que vale para TODOS os setores (permissão, limite de contas, token): insistir só repetiria o estrago. */
const erroQueAtingeTodos = (causa: unknown) => causa instanceof ErroDeGrupo && (causa.status === 401 || causa.status === 403 || causa.status === 412 || /limite de usu/i.test(causa.message))

async function estadoAgora(chamar: Chamar, endereco: string): Promise<EstadoDoEndereco | null> {
  try { return await consultarEndereco(chamar, endereco) } catch { return null }
}

/**
 * Cria a caixa própria de cada setor de uma vez. Por setor, em sequência (nunca em paralelo: a volta atrás de um não pode
 * atropelar o outro), começando pelos endereços LIVRES — nada é apagado neles — e só depois pelos que são apelido:
 *  - apelido → apaga o apelido e cria a conta logo em seguida (o POST é a palavra final: 409 = o Google ainda mostra o
 *    endereço, espera e repete); se a criação falha, DEVOLVE o apelido (o e-mail do setor não fica sem destino por erro
 *    nosso) e diz se a devolução deu certo. Se o DELETE não responde, o estado é reconsultado antes de afirmar qualquer coisa
 *    ("continua como estava" só quando se confirma que ainda é apelido); se nem isso responde, o resultado diz que NÃO SABE;
 *  - livre → cria a conta;
 *  - caixa real ou grupo → não mexe.
 * Se o POST dá erro sem resposta (timeout, 5xx), a conta pode ter nascido: o endereço é reconsultado e, se já é caixa real,
 * conta como criada. Um setor que falha não impede os outros — exceto quando o erro vale para todos (permissão, limite de
 * contas) ou quando dois setores seguidos falham: aí o resto fica `adiada`, para não repetir apagar-falhar-devolver em cada um.
 * `ate`: depois desse instante (ms) nenhum setor novo começa (`adiada`) — o webhook tem prazo, e é melhor parar entre um setor
 * e outro do que no meio de um. `aoCriar`: chamado logo depois de cada conta criada, antes do setor seguinte (é onde quem chama
 * registra a conta e entrega a senha: se o processo for cortado depois, a conta não fica sem registro). Cada item traz a senha
 * provisória (gerada por quem chama; sai uma vez e não é gravada). Puro: nada aqui toca em banco.
 */
export async function criarCaixasDosSetores(chamar: Chamar, itens: (ItemDeEndereco & { senha: string })[], opcoes: { espera?: (ms: number) => Promise<void>; ate?: number; agora?: () => number; aoCriar?: (r: ResultadoDaCaixa) => Promise<Partial<ResultadoDaCaixa>> } = {}): Promise<ResultadoDaCaixa[]> {
  const agora = opcoes.agora ?? Date.now
  const espera = opcoes.espera ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const estados: (EstadoDoEndereco | Error)[] = []
  for (const it of itens) {
    try { estados.push(await consultarEndereco(chamar, it.endereco)) } catch (causa) { estados.push(causa instanceof Error ? causa : new Error('erro')) }
  }
  const peso = (e: EstadoDoEndereco | Error) => (e instanceof Error ? 3 : e.tipo === 'livre' ? 0 : e.tipo === 'apelido' ? 1 : 2)
  const ordem = itens.map((_, i) => i).sort((a, b) => peso(estados[a]) - peso(estados[b]) || a - b)
  const saida: ResultadoDaCaixa[] = new Array(itens.length)
  let parar: string | null = null
  let falhasSeguidas = 0

  for (const i of ordem) {
    const it = itens[i]
    const base = { nome: it.nome, endereco: it.endereco }
    const e = estados[i]
    if (e instanceof Error) { saida[i] = { ...base, resultado: 'falhou', motivo: e.message.slice(0, 200) }; continue }
    if (e.tipo === 'caixa_real') { saida[i] = { ...base, resultado: 'ja_existe' }; continue }
    if (e.tipo === 'grupo') { saida[i] = { ...base, resultado: 'e_grupo' }; continue }
    if (parar) { saida[i] = { ...base, resultado: 'adiada', motivo: parar }; continue }
    if (opcoes.ate !== undefined && agora() > opcoes.ate) { saida[i] = { ...base, resultado: 'adiada' }; continue }

    const dono = e.tipo === 'apelido' ? e.dono : undefined
    let apagado = false
    if (e.tipo === 'apelido') {
      const [r] = await removerApelidos(chamar, [base])
      if (r.resultado === 'removido') apagado = true
      else if (r.resultado === 'falhou') {
        // O DELETE pode ter sido aplicado mesmo sem resposta (timeout, 5xx): olha como o endereço ficou antes de afirmar qualquer coisa.
        const depois = await estadoAgora(chamar, it.endereco)
        if (depois?.tipo === 'livre') apagado = true
        else if (depois?.tipo === 'apelido') { saida[i] = { ...base, resultado: 'falhou', motivo: `não consegui apagar o apelido (${r.motivo ?? 'erro'}); ele continua como estava` }; continue }
        else if (depois?.tipo === 'caixa_real') { saida[i] = { ...base, resultado: 'ja_existe' }; continue }
        else if (depois?.tipo === 'grupo') { saida[i] = { ...base, resultado: 'e_grupo' }; continue }
        else { saida[i] = { ...base, resultado: 'falhou', incerto: true, motivo: `o Google não respondeu ao apagar o apelido (${r.motivo ?? 'erro'}) e não consegui conferir como o endereço ficou` }; continue }
      }
      // 'nao_era_apelido': já não era (outro toque, outro administrador); o POST abaixo decide, e 409 diz se está ocupado.
    }

    try {
      await criarCaixaDoSetor(chamar, { endereco: it.endereco, nome: it.nome, senha: it.senha, espera, semConsulta: true, tentativas409: 6 })
      falhasSeguidas = 0
      let criada: ResultadoDaCaixa = { ...base, resultado: 'criada', ...(apagado ? { apelidoApagado: true } : {}) }
      if (opcoes.aoCriar) {
        try { criada = { ...criada, ...(await opcoes.aoCriar(criada)) } } catch { criada = { ...criada, registro: 'falhou' } }
      }
      saida[i] = criada
    } catch (causa) {
      const motivo = (causa instanceof Error ? causa.message : 'erro').slice(0, 200)
      const explicito409 = causa instanceof ErroDeGrupo && causa.status === 409
      // Sem resposta (timeout, 5xx, queda): a conta pode ter nascido mesmo assim.
      const depois = explicito409 ? null : await estadoAgora(chamar, it.endereco)
      if (depois?.tipo === 'caixa_real') {
        falhasSeguidas = 0
        let criada: ResultadoDaCaixa = { ...base, resultado: 'criada', motivo: 'o Google deu erro, mas a conta existe', ...(apagado ? { apelidoApagado: true } : {}) }
        if (opcoes.aoCriar) {
          try { criada = { ...criada, ...(await opcoes.aoCriar(criada)) } } catch { criada = { ...criada, registro: 'falhou' } }
        }
        saida[i] = criada
        continue
      }
      const devolvido = apagado && dono ? await restaurarApelido(chamar, dono, it.endereco, espera) : undefined
      saida[i] = { ...base, resultado: 'falhou', motivo, ...(apagado ? { apelidoApagado: true, apelidoDevolvido: devolvido === true } : {}), ...(depois === null && !explicito409 ? { incerto: true } : {}) }
      falhasSeguidas++
      if (erroQueAtingeTodos(causa)) parar = `parei: o Google recusou a criação (${motivo}) e o mesmo vale para os outros setores`
      else if (falhasSeguidas >= 2) parar = 'parei: dois setores seguidos falharam; confira o motivo antes de tentar de novo'
    }
  }
  return saida
}

/** Texto de uma linha sobre o que vai mudar, para a confirmação de quem aprova. null = nada muda. */
export function avisoDaConversao(estado: EstadoDoEndereco, endereco: string): string | null {
  if (estado.tipo === 'apelido') return `⚠️ O endereço *${endereco}* hoje é apelido de ${estado.dono}. Ao confirmar, ele vira um *grupo do Google*: as mensagens continuam chegando em ${estado.dono}, e a equipe passa a ser membro do grupo. O envio pelo Palácio como ${endereco} pode precisar ser reverificado no Gmail.`
  if (estado.tipo === 'livre') return `O endereço *${endereco}* ainda não existe no Google: será criado como grupo do setor.`
  return null
}
