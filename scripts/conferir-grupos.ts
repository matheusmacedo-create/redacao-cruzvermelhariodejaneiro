/**
 * Confere a troca do apelido de um setor por um grupo do Google (lib/google/grupos-regras.ts) contra um Google de
 * mentira, em memória, sem rede: `npx tsx scripts/conferir-grupos.ts`.
 *
 *  - o que é o endereço: grupo, apelido (de quem), caixa real, livre;
 *  - a troca que dá certo: o apelido sai, o grupo nasce, liberado para receber de fora, e a caixa antiga entra como membro;
 *  - cada falha no meio devolve tudo: criar o grupo, liberar o recebimento, pôr a caixa no grupo — o apelido volta e o
 *    grupo some, e o e-mail do setor chega como antes;
 *  - o grupo que o Google ainda não mostra (404 passageiro) é esperado, não vira falha;
 *  - caixa real (contato@) nunca é convertida; grupo que já existe não é mexido;
 *  - o papel: gerente entra como gerente, membro como membro, membro que vira gerente é promovido e o gerente nunca é rebaixado;
 *  - o aviso da confirmação.
 * Sai com código 1 se algo estiver errado.
 */
import {
  ErroDeGrupo, assinaturaDoPlano, avisoDaCaixaDoSetor, criarCaixasDosSetores, planoDasCaixas, precisaDeCaixa, redefinirSenhaDaCaixa, restaurarApelido, avisoDaConversao, criarCaixaDoSetor, colocarSeForGrupo, removerApelidos, sondarAcesso, colocarNoGrupo, configurarGrupoDoSetor, consultarEndereco, converterEmGrupo, type Chamar, type Resposta,
} from '../lib/google/grupos-regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!String(texto).includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }

// ------------------------------------------------------------------ o Google de mentira

type Grupo = { membros: Map<string, string>; config: Record<string, unknown> | null }
/** `lancar`: a chamada estoura (timeout, queda de rede) em vez de responder. `aplicar`: o Google faz a mudança E ENTÃO a resposta se perde. */
type Falha = { quando: (api: string, metodo: string, caminho: string) => boolean; status: number; vezes?: number; mensagem?: string; reason?: string; lancar?: boolean; aplicar?: boolean; aposAplicar?: () => void }

function novoGoogle() {
  const usuarios = new Map<string, { principal: string; apelidos: Set<string>; ultimoAcesso?: string }>()
  // Leitura atrasada: GET /users/<endereço> devolve `resposta` mais `n` vezes, mesmo depois de a mudança ter sido aplicada.
  const leiturasVelhas = new Map<string, { n: number; resposta: () => Resposta }>()
  // Endereços para os quais o Google recusa a criação com 400 (dado inválido só deste setor).
  const recusaCriar = new Set<string>()
  const grupos = new Map<string, Grupo>()
  const falhasPlanejadas: Falha[] = []
  const chamadas: string[] = []
  const corposEnviados: { rota: string; corpo: Record<string, unknown> }[] = []
  // O grupo recém-criado só aparece para as configurações na N-ésima tentativa (a propagação do Google).
  let configuracoesQueNaoAchamAinda = 0
  // Logo depois de tirar o apelido, a criação do grupo ainda responde 409 por alguns instantes.
  let demoraNaCriacao = 0
  const donoDe = (e: string) => [...usuarios.values()].find((u) => u.principal === e || u.apelidos.has(e))
  const ok = (dados: Record<string, unknown> = {}): Resposta => ({ ok: true, status: 200, dados })
  const erro = (status: number, message = 'erro do Google', reason?: string): Resposta => ({ ok: false, status, dados: { error: { message, ...(reason ? { errors: [{ reason }] } : {}) } } })

  const chamar: Chamar = async (api, caminho, init) => {
    const metodo = init?.method ?? 'GET'
    chamadas.push(`${metodo} ${api}:${caminho}`)
    const f = falhasPlanejadas.find((x) => x.quando(api, metodo, caminho) && (x.vezes ?? 1) > 0)
    if (f) {
      f.vezes = (f.vezes ?? 1) - 1
      if (f.aplicar) { await executar(api, caminho, init); f.aposAplicar?.() }
      if (f.lancar) throw new Error(f.mensagem ?? 'The operation was aborted due to timeout')
      return erro(f.status, f.mensagem, f.reason)
    }
    return executar(api, caminho, init)
  }
  const executar: Chamar = async (api, caminho, init) => {
    const metodo = init?.method ?? 'GET'
    const corpo = (init?.corpo ?? {}) as Record<string, string>
    if (init?.corpo !== undefined) corposEnviados.push({ rota: `${metodo} ${caminho}`, corpo: init.corpo as Record<string, unknown> })
    const dec = decodeURIComponent
    let m: RegExpMatchArray | null
    if (api === 'configuracoes') {
      m = caminho.match(/^\/groups\/v1\/groups\/([^?]+)\?alt=json$/)
      if (!m || (metodo !== 'PATCH' && metodo !== 'GET')) return erro(400, 'caminho sem alt=json')
      const g = grupos.get(dec(m[1]))
      if (!g) return erro(404)
      if (metodo === 'GET') return ok({})
      if (configuracoesQueNaoAchamAinda > 0) { configuracoesQueNaoAchamAinda--; return erro(404) }
      g.config = corpo
      return ok()
    }
    if (caminho === '/users' && metodo === 'POST') {
      const e = corpo.primaryEmail
      if (recusaCriar.has(e)) return erro(400, 'Invalid Given Name')
      if (donoDe(e) || grupos.has(e)) return erro(409, 'Entity already exists.')
      usuarios.set(e, { principal: e, apelidos: new Set() })
      return ok({ id: 'u1', primaryEmail: e })
    }
    if (caminho.startsWith('/users?')) return ok({ users: [] })
    if (caminho.startsWith('/groups?')) return ok({ groups: [] })
    if ((m = caminho.match(/^\/groups\/([^/]+)$/))) {
      const e = dec(m[1])
      // O Google de verdade responde 403 (e não 404) a groups.get de um endereço que é apelido/caixa de um usuário.
      if (metodo === 'GET') return grupos.has(e) ? ok({ email: e }) : donoDe(e) ? erro(403, 'Not Authorized to access this resource/api') : erro(404)
      if (metodo === 'DELETE') { grupos.delete(e); return ok() }
    }
    if (caminho === '/groups' && metodo === 'POST') {
      const e = corpo.email
      if (demoraNaCriacao > 0) { demoraNaCriacao--; return erro(409, 'Entity already exists.') }
      if (grupos.has(e) || donoDe(e)) return erro(409, 'Entity already exists.')
      grupos.set(e, { membros: new Map(), config: null })
      return ok({ email: e })
    }
    if ((m = caminho.match(/^\/users\/([^/]+)$/)) && metodo === 'PATCH') return usuarios.has(dec(m[1])) ? ok() : erro(404)
    if ((m = caminho.match(/^\/users\/([^/]+)$/)) && metodo === 'GET') {
      const velha = leiturasVelhas.get(dec(m[1]))
      if (velha && velha.n > 0) { velha.n--; return velha.resposta() }
      const u = donoDe(dec(m[1]))
      return u ? ok({ primaryEmail: u.principal, lastLoginTime: u.ultimoAcesso ?? '1970-01-01T00:00:00.000Z' }) : erro(404)
    }
    if ((m = caminho.match(/^\/users\/([^/]+)\/aliases$/)) && metodo === 'GET') {
      const u = usuarios.get(dec(m[1]))
      return u ? ok({ aliases: [...u.apelidos].map((alias) => ({ alias, primaryEmail: u.principal })) }) : erro(404)
    }
    if ((m = caminho.match(/^\/users\/([^/]+)\/aliases\/([^/]+)$/)) && metodo === 'DELETE') {
      const u = usuarios.get(dec(m[1]))
      if (!u || !u.apelidos.delete(dec(m[2]))) return erro(404)
      return ok()
    }
    if ((m = caminho.match(/^\/users\/([^/]+)\/aliases$/)) && metodo === 'POST') {
      const u = usuarios.get(dec(m[1]))
      if (!u) return erro(404)
      if (donoDe(corpo.alias) || grupos.has(corpo.alias)) return erro(409, 'Entity already exists.')
      u.apelidos.add(corpo.alias)
      return ok()
    }
    if ((m = caminho.match(/^\/groups\/([^/]+)\/members$/)) && metodo === 'POST') {
      const g = grupos.get(dec(m[1]))
      if (!g) return donoDe(dec(m[1])) ? erro(403, 'Not Authorized to access this resource/api') : erro(404)
      if (g.membros.has(corpo.email)) return erro(409, 'Member already exists.')
      g.membros.set(corpo.email, corpo.role)
      return ok()
    }
    if ((m = caminho.match(/^\/groups\/([^/]+)\/members\/([^/]+)$/))) {
      const g = grupos.get(dec(m[1]))
      const e = dec(m[2])
      if (!g || !g.membros.has(e)) return erro(404)
      if (metodo === 'GET') return ok({ email: e, role: g.membros.get(e) })
      if (metodo === 'PUT') { g.membros.set(e, corpo.role); return ok() }
    }
    return erro(400, `rota que o teste não conhece: ${metodo} ${caminho}`)
  }
  return {
    chamar, usuarios, grupos, falhasPlanejadas, chamadas, corposEnviados,
    comApelido: (dono: string, apelido: string) => { const u = usuarios.get(dono) ?? { principal: dono, apelidos: new Set<string>() }; u.apelidos.add(apelido); usuarios.set(dono, u) },
    comCaixa: (e: string) => usuarios.set(e, { principal: e, apelidos: new Set() }),
    leituraVelha: (endereco: string, n: number, resposta: () => Resposta) => { leiturasVelhas.set(endereco, { n, resposta }) },
    recusaCriar,
    respostas: { ok, erro },
    comAcesso: (e: string, quando: string) => { const u = usuarios.get(e); if (u) u.ultimoAcesso = quando },
    demoraNasConfiguracoes: (n: number) => { configuracoesQueNaoAchamAinda = n },
    demoraNaCriacaoDoGrupo: (n: number) => { demoraNaCriacao = n },
  }
}
const semEspera = async () => undefined
const tenta = async <T>(f: () => Promise<T>): Promise<T | ErroDeGrupo> => { try { return await f() } catch (e) { return e as ErroDeGrupo } }

async function main() {
  const TI = 'ti@cruzvermelhariodejaneiro.org'
  const CONTATO = 'contato@cruzvermelhariodejaneiro.org'

  // o que é o endereço
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.grupos.set('juridico@x.org', { membros: new Map(), config: null })
    igual(await consultarEndereco(g.chamar, TI), { tipo: 'apelido', dono: CONTATO }, 'consulta: apelido de contato@')
    igual(await consultarEndereco(g.chamar, CONTATO), { tipo: 'caixa_real' }, 'consulta: contato@ é caixa real')
    igual(await consultarEndereco(g.chamar, 'juridico@x.org'), { tipo: 'grupo' }, 'consulta: grupo')
    igual(await consultarEndereco(g.chamar, 'ninguem@x.org'), { tipo: 'livre' }, 'consulta: livre')
  }

  // a troca que dá certo
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    const r = await converterEmGrupo(g.chamar, { endereco: TI, nome: 'Tecnologia da Informação', espera: semEspera })
    igual(r, { feito: 'convertido', dono: CONTATO }, 'troca: convertido')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), false, 'troca: o apelido saiu')
    igual(g.grupos.has(TI), true, 'troca: o grupo nasceu')
    igual((g.grupos.get(TI)?.config as { whoCanPostMessage?: string } | null)?.whoCanPostMessage, 'ANYONE_CAN_POST', 'troca: grupo libera mensagens de fora')
    igual((g.grupos.get(TI)?.config as { whoCanJoin?: string } | null)?.whoCanJoin, 'INVITED_CAN_JOIN', 'troca: só entra por convite')
    igual((g.grupos.get(TI)?.config as { whoCanViewGroup?: string } | null)?.whoCanViewGroup, 'ALL_MEMBERS_CAN_VIEW', 'troca: só os membros veem as conversas (setor sensível)')
    igual((g.grupos.get(TI)?.config as { whoCanDiscoverGroup?: string } | null)?.whoCanDiscoverGroup, 'ALL_MEMBERS_CAN_DISCOVER', 'troca: só os membros encontram o grupo')
    igual(g.grupos.get(TI)?.membros.get(CONTATO), 'MEMBER', 'troca: a caixa antiga continua recebendo (membro)')
    igual(g.chamadas.findIndex((c) => c.startsWith('DELETE diretorio:/users')) < g.chamadas.findIndex((c) => c.startsWith('POST diretorio:/groups')), true, 'troca: tira o apelido ANTES de criar o grupo')
  }

  // livre: cria, sem apelido a tirar
  {
    const g = novoGoogle()
    const r = await converterEmGrupo(g.chamar, { endereco: 'novo@x.org', nome: 'Novo', espera: semEspera })
    igual(r, { feito: 'criado' }, 'livre: criado')
    igual(g.grupos.get('novo@x.org')?.membros.size, 0, 'livre: sem caixa antiga, sem membros')
  }

  // o grupo ainda não aparece nas configurações: espera, não falha
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.demoraNasConfiguracoes(2)
    const r = await converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera })
    igual(r, { feito: 'convertido', dono: CONTATO }, 'propagação: espera e conclui')
    igual((g.grupos.get(TI)?.config as { whoCanPostMessage?: string } | null)?.whoCanPostMessage, 'ANYONE_CAN_POST', 'propagação: configurado no fim')
  }

  // o 403 do Google ao consultar o grupo de um apelido (a causa do primeiro teste de verdade) não derruba a consulta
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    const sondaDireta = await g.chamar('diretorio', `/groups/${encodeURIComponent(TI)}`)
    igual(sondaDireta.status, 403, 'o Google de mentira imita o 403 de groups.get num apelido')
    igual(await consultarEndereco(g.chamar, TI), { tipo: 'apelido', dono: CONTATO }, 'consulta: apelido apesar do 403 em groups.get')
    igual(g.chamadas.filter((c) => c.includes('/groups/')).length, 1, 'consulta: nem perguntou pelo grupo do apelido (só a sonda direta acima)')
  }

  // logo depois de tirar o apelido o Google ainda responde 409 por alguns instantes: espera e conclui
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.demoraNaCriacaoDoGrupo(3)
    const r = await converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera })
    igual(r, { feito: 'convertido', dono: CONTATO }, 'propagação do apelido: tenta de novo e conclui')
    igual(g.grupos.has(TI), true, 'propagação do apelido: o grupo nasceu')
  }
  // ... e se nunca libera, desiste e devolve o apelido
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.demoraNaCriacaoDoGrupo(99)
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'propagação que não vem: lança')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), true, 'propagação que não vem: o apelido VOLTA')
    igual(g.grupos.has(TI), false, 'propagação que não vem: nenhum grupo')
  }

  // quem não converte (coordenador): só entra se o endereço já é grupo; apelido não é tocado
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    igual(await colocarSeForGrupo(g.chamar, TI, 'ana@x.org', 'MEMBER'), 'nao_e_grupo', 'coordenador: apelido não vira grupo nem recebe membro')
    igual(g.chamadas.some((c) => c.startsWith('POST') || c.startsWith('DELETE')), false, 'coordenador: não mexeu em nada no apelido')
    g.grupos.set('juridico@x.org', { membros: new Map(), config: null })
    igual(await colocarSeForGrupo(g.chamar, 'juridico@x.org', 'ana@x.org', 'MEMBER'), 'ok', 'coordenador: grupo que já existe recebe o membro')
    igual(g.grupos.get('juridico@x.org')?.membros.get('ana@x.org'), 'MEMBER', 'coordenador: entrou como membro')
    g.comCaixa(CONTATO)
    igual(await colocarSeForGrupo(g.chamar, CONTATO, 'ana@x.org', 'MEMBER'), 'nao_e_grupo', 'coordenador: caixa real não é grupo')
  }

  // a checagem prévia aborta ANTES de tocar no apelido
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m, c) => a === 'configuracoes' && m === 'GET', status: 403, mensagem: 'Groups Settings API has not been used in project 123 before or it is disabled.', reason: 'accessNotConfigured' })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'prévia: API de configurações fora: aborta')
    contem((r as ErroDeGrupo).message, 'nada foi alterado', 'prévia: diz que nada foi alterado')
    contem((r as ErroDeGrupo).message, 'accessNotConfigured', 'prévia: mostra o reason do Google')
    igual(g.chamadas.some((c) => c.startsWith('DELETE') || (c.startsWith('POST') && c.includes('/groups'))), false, 'prévia: não tirou o apelido nem criou grupo')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), true, 'prévia: o apelido continua no lugar')
  }
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m, c) => c.startsWith('/groups?'), status: 403 })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'prévia: leitura de grupos negada: aborta')
    igual(g.chamadas.some((c) => c.startsWith('DELETE')), false, 'prévia: leitura negada, o apelido nem foi tocado')
  }
  // 403 comum das configurações (sem ser "API não ligada") NÃO bloqueia a prévia: a volta atrás cobre
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m) => a === 'configuracoes' && m === 'GET', status: 403, mensagem: 'Forbidden' })
    const r = await converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera })
    igual(r, { feito: 'convertido', dono: CONTATO }, 'prévia: um 403 qualquer na sonda das configurações não bloqueia a troca')
  }

  // a volta atrás confere o resultado e tenta de novo
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/groups', status: 500 })
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/aliases'), status: 500, vezes: 2 })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'volta atrás com falhas passageiras: a troca falha')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), true, 'volta atrás com falhas passageiras: o apelido VOLTA mesmo assim')
    igual((r as ErroDeGrupo).restauracaoFalhou, null, 'volta atrás com falhas passageiras: nada a restaurar à mão')
  }
  // ... e quando a volta atrás NÃO consegue, o aviso é alto e diz o que restaurar
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/groups', status: 500 })
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/aliases'), status: 500, vezes: 99 })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera })) as ErroDeGrupo
    igual(r instanceof ErroDeGrupo, true, 'volta atrás impossível: lança')
    contem(r.restauracaoFalhou ?? '', `devolver o apelido ${TI}`, 'volta atrás impossível: guarda o que ficou por fazer')
    contem(r.message, 'ATENÇÃO', 'volta atrás impossível: mensagem com destaque')
    contem(r.message, 'Apelidos de e-mail', 'volta atrás impossível: diz onde restaurar à mão')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), false, 'volta atrás impossível: o teste confirma que de fato ficou sem apelido')
  }

  // a sonda também olha a API de configurações
  {
    const g = novoGoogle()
    const ok3 = await sondarAcesso(g.chamar, 'x.org')
    igual(ok3.length, 3, 'sonda: três linhas (usuários, grupos, configurações)')
    igual(ok3.every((l) => l.startsWith('✅')), true, 'sonda: as três ok')
    const g2 = novoGoogle()
    g2.falhasPlanejadas.push({ quando: (a) => a === 'configuracoes', status: 403, mensagem: 'API has not been used', reason: 'accessNotConfigured' })
    const sem = await sondarAcesso(g2.chamar, 'x.org')
    igual(sem[2].startsWith('❌'), true, 'sonda: configurações negadas')
    contem(sem.join('\n'), 'Groups Settings API', 'sonda: manda ligar a Groups Settings API')
  }

  // falha ao criar o grupo: o apelido volta
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m, c) => a === 'diretorio' && m === 'POST' && c === '/groups', status: 500 })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'falha ao criar o grupo: lança')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), true, 'falha ao criar o grupo: o apelido VOLTA')
    igual(g.grupos.has(TI), false, 'falha ao criar o grupo: nada de grupo')
  }

  // falha em liberar o recebimento: grupo some e apelido volta (senão o setor deixaria de receber de fora)
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a) => a === 'configuracoes', status: 403, vezes: 99 })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'falha nas configurações: lança')
    contem((r as ErroDeGrupo).message, 'o Google negou o acesso', 'falha nas configurações: mensagem de acesso negado')
    igual(g.grupos.has(TI), false, 'falha nas configurações: o grupo é desfeito')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), true, 'falha nas configurações: o apelido VOLTA')
  }

  // falha ao pôr a caixa antiga no grupo: tudo volta
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/members'), status: 500 })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'falha ao pôr a caixa: lança')
    igual(g.grupos.has(TI), false, 'falha ao pôr a caixa: o grupo é desfeito')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), true, 'falha ao pôr a caixa: o apelido VOLTA')
  }

  // falha ao tirar o apelido: nada mudou
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'DELETE' && c.includes('/aliases/'), status: 500 })
    const r = await tenta(() => converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera }))
    igual(r instanceof ErroDeGrupo, true, 'falha ao tirar o apelido: lança')
    igual(g.usuarios.get(CONTATO)?.apelidos.has(TI), true, 'falha ao tirar o apelido: continua apelido')
    igual(g.grupos.has(TI), false, 'falha ao tirar o apelido: nenhum grupo')
  }

  // caixa real nunca é convertida
  {
    const g = novoGoogle()
    g.comCaixa(CONTATO)
    const r = await converterEmGrupo(g.chamar, { endereco: CONTATO, nome: 'Atendimento', espera: semEspera })
    igual(r, { feito: 'nao_converteu', motivo: 'caixa_real' }, 'caixa real: não converte')
    igual(g.chamadas.some((c) => c.startsWith('DELETE') || c.startsWith('POST')), false, 'caixa real: não mexeu em nada')
    igual(g.usuarios.has(CONTATO) && !g.grupos.has(CONTATO), true, 'caixa real: segue caixa')
  }

  // grupo que já existe não é mexido
  {
    const g = novoGoogle()
    g.grupos.set(TI, { membros: new Map([['a@x.org', 'MEMBER']]), config: { whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST' } })
    const r = await converterEmGrupo(g.chamar, { endereco: TI, nome: 'TI', espera: semEspera })
    igual(r, { feito: 'ja_era_grupo' }, 'grupo existente: não converte')
    igual((g.grupos.get(TI)?.config as { whoCanPostMessage?: string }).whoCanPostMessage, 'ALL_IN_DOMAIN_CAN_POST', 'grupo existente: configuração intocada')
  }

  // papéis
  {
    const g = novoGoogle()
    g.grupos.set(TI, { membros: new Map(), config: null })
    igual(await colocarNoGrupo(g.chamar, TI, 'ana@x.org', 'MEMBER'), true, 'papel: membro entra')
    igual(g.grupos.get(TI)?.membros.get('ana@x.org'), 'MEMBER', 'papel: como membro')
    igual(await colocarNoGrupo(g.chamar, TI, 'bia@x.org', 'MANAGER'), true, 'papel: coordenador entra')
    igual(g.grupos.get(TI)?.membros.get('bia@x.org'), 'MANAGER', 'papel: como gerente')
    igual(await colocarNoGrupo(g.chamar, TI, 'ana@x.org', 'MANAGER'), true, 'papel: membro que vira coordenador')
    igual(g.grupos.get(TI)?.membros.get('ana@x.org'), 'MANAGER', 'papel: foi promovido a gerente')
    g.grupos.get(TI)?.membros.set('chefe@x.org', 'OWNER')
    igual(await colocarNoGrupo(g.chamar, TI, 'chefe@x.org', 'MEMBER'), true, 'papel: dono que reentra')
    igual(g.grupos.get(TI)?.membros.get('chefe@x.org'), 'OWNER', 'papel: dono nunca é rebaixado')
    igual(await colocarNoGrupo(g.chamar, 'inexistente@x.org', 'x@x.org', 'MEMBER'), false, 'papel: grupo que não existe devolve false')
  }

  // o caminho das configurações leva alt=json
  {
    const g = novoGoogle()
    g.grupos.set(TI, { membros: new Map(), config: null })
    await configurarGrupoDoSetor(g.chamar, TI, 1, semEspera)
    igual(g.chamadas.some((c) => c.includes('?alt=json')), true, 'configurações: pede JSON (sem alt=json a API responde XML)')
  }

  // a sonda: separa o serviço de grupos negado de um endereço
  {
    const g = novoGoogle()
    const tudo = await sondarAcesso(g.chamar)
    igual(tudo.length, 3, 'sonda: tudo certo, três linhas')
    igual(tudo.every((l) => l.startsWith('✅')), true, 'sonda: usuários e grupos ok')
    const g2 = novoGoogle()
    g2.falhasPlanejadas.push({ quando: (a, m, c) => c.startsWith('/groups?'), status: 403 })
    const semGrupos = await sondarAcesso(g2.chamar)
    igual(semGrupos[0].startsWith('✅'), true, 'sonda: usuários ok')
    igual(semGrupos[1].startsWith('❌'), true, 'sonda: grupos negados')
    contem(semGrupos.join('\n'), 'Grupos para empresas', 'sonda: aponta o serviço de Grupos')
    const g3 = novoGoogle()
    g3.falhasPlanejadas.push({ quando: (a, m, c) => c.startsWith('/users?'), status: 403 })
    igual(!(await sondarAcesso(g3.chamar)).join('\n').includes('Grupos para empresas'), true, 'sonda: sem usuários, não culpa o serviço de grupos')
  }

  // apagar os apelidos dos setores: só apelido, e só o apelido
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, 'comunicacao@cruzvermelhariodejaneiro.org')
    g.comApelido(CONTATO, 'ti@cruzvermelhariodejaneiro.org')
    g.comApelido(CONTATO, 'juridico@cruzvermelhariodejaneiro.org')
    g.grupos.set('ouvidoria@cruzvermelhariodejaneiro.org', { membros: new Map(), config: null })
    const itens = [
      { nome: 'Atendimento', endereco: CONTATO },
      { nome: 'Comunicação', endereco: 'comunicacao@cruzvermelhariodejaneiro.org' },
      { nome: 'TI', endereco: 'ti@cruzvermelhariodejaneiro.org' },
      { nome: 'Jurídico', endereco: 'juridico@cruzvermelhariodejaneiro.org' },
      { nome: 'Ouvidoria', endereco: 'ouvidoria@cruzvermelhariodejaneiro.org' },
      { nome: 'Esportes', endereco: 'esportes@cruzvermelhariodejaneiro.org' },
    ]
    const plano = await planoDasCaixas(g.chamar, itens)
    igual(plano.map((p) => `${p.nome}:${p.estado}`), ['Atendimento:caixa_real', 'Comunicação:apelido', 'TI:apelido', 'Jurídico:apelido', 'Ouvidoria:grupo', 'Esportes:livre'], 'plano: o estado de cada setor')
    igual(plano.filter((p) => p.estado === 'apelido').every((p) => p.dono === CONTATO), true, 'plano: diz de quem é cada apelido')
    igual(plano.filter(precisaDeCaixa).map((p) => p.nome), ['Comunicação', 'TI', 'Jurídico', 'Esportes'], 'plano: precisa de caixa quem é apelido ou está livre (caixa real e grupo não)')
    igual(g.chamadas.some((c) => c.startsWith('DELETE') || c.startsWith('POST') || c.startsWith('PUT') || c.startsWith('PATCH')), false, 'plano: a prévia não altera nada')
    // a impressão do plano: vai no botão e é o que impede o segundo toque e o toque numa prévia que já não vale
    const a1 = assinaturaDoPlano(plano)
    igual(/^[0-9a-f]{12}$/.test(a1), true, 'assinatura: 12 caracteres hexadecimais (SHA-256 truncado) — cabe no id do botão')
    igual(assinaturaDoPlano([...plano].reverse()), a1, 'assinatura: não depende da ordem')
    igual(assinaturaDoPlano(plano.map((p) => (p.nome === 'TI' ? { ...p, estado: 'livre' as const } : p))) === a1, false, 'assinatura: muda se o estado de um setor mudou')
    igual(assinaturaDoPlano(plano.filter((p) => p.nome !== 'Esportes')) === a1, false, 'assinatura: muda se um setor a criar saiu do plano')
    igual(assinaturaDoPlano(plano.map((p) => (p.nome === 'TI' ? { ...p, dono: 'outro@x.org' } : p))) === a1, false, 'assinatura: muda se o dono do apelido mudou')
    igual(assinaturaDoPlano(plano, { 'ti@cruzvermelhariodejaneiro.org': ['5548999990000'] }) === a1, false, 'assinatura: muda se entrou um coordenador (quem recebe a senha)')
    igual(assinaturaDoPlano(plano, { 'ti@cruzvermelhariodejaneiro.org': ['5548999990000', '5521988887777'] }), assinaturaDoPlano(plano, { 'ti@cruzvermelhariodejaneiro.org': ['5521988887777', '5548999990000'] }), 'assinatura: a ordem dos coordenadores não importa')
    igual(assinaturaDoPlano(plano, { 'contato@cruzvermelhariodejaneiro.org': ['5548999990000'] }), a1, 'assinatura: coordenador de setor que não precisa de caixa não entra')
    igual(assinaturaDoPlano(plano.map((p) => (p.nome === 'Atendimento' ? { ...p, nome: 'Outro' } : p))), a1, 'assinatura: caixa real e grupo não entram')
    igual(assinaturaDoPlano([]), assinaturaDoPlano([{ nome: 'A', endereco: 'a@x.org', estado: 'caixa_real' }]), 'assinatura: sem nada a criar é sempre a mesma (depois de feito, o botão velho não bate)')

    const r = await removerApelidos(g.chamar, itens)
    igual(r.map((x) => `${x.nome}:${x.resultado}`), ['Atendimento:nao_era_apelido', 'Comunicação:removido', 'TI:removido', 'Jurídico:removido', 'Ouvidoria:nao_era_apelido', 'Esportes:nao_era_apelido'], 'apelidos: remove só os apelidos')
    igual([...(g.usuarios.get(CONTATO)?.apelidos ?? [])], [], 'apelidos: nenhum apelido sobra no contato@')
    igual(g.usuarios.has(CONTATO), true, 'apelidos: contato@ (a caixa real) continua existindo')
    igual(g.grupos.has('ouvidoria@cruzvermelhariodejaneiro.org'), true, 'apelidos: o grupo existente não foi tocado')
    igual(g.chamadas.filter((c) => c.startsWith('DELETE')).length, 3, 'apelidos: exatamente 3 DELETEs, um por apelido')
    igual(g.chamadas.some((c) => c.startsWith('DELETE') && c.includes(encodeURIComponent(CONTATO) + '/aliases/' + encodeURIComponent(CONTATO))), false, 'apelidos: nunca tenta apagar o contato@ como apelido')
    igual((await consultarEndereco(g.chamar, 'comunicacao@cruzvermelhariodejaneiro.org')).tipo, 'livre', 'apelidos: depois de apagado o endereço fica livre')

    const de_novo = await removerApelidos(g.chamar, itens)
    igual(de_novo.every((x) => x.resultado === 'nao_era_apelido'), true, 'apelidos: rodar de novo não faz nada (idempotente)')
  }
  // um item que falha não impede os outros
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, 'a@x.org')
    g.comApelido(CONTATO, 'b@x.org')
    g.comApelido(CONTATO, 'c@x.org')
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'DELETE' && c.endsWith(encodeURIComponent('b@x.org')), status: 500, mensagem: 'Internal error', reason: 'backendError' })
    const r = await removerApelidos(g.chamar, [{ nome: 'A', endereco: 'a@x.org' }, { nome: 'B', endereco: 'b@x.org' }, { nome: 'C', endereco: 'c@x.org' }])
    igual(r.map((x) => `${x.nome}:${x.resultado}`), ['A:removido', 'B:falhou', 'C:removido'], 'apelidos: a falha de um não derruba os outros')
    contem(r[1].motivo ?? '', 'backendError', 'apelidos: a falha traz o motivo do Google')
    igual(g.usuarios.get(CONTATO)?.apelidos.has('b@x.org'), true, 'apelidos: o que falhou continua apelido')
  }

  // a caixa própria do setor: conta real, só se o endereço está livre
  {
    const g = novoGoogle()
    const r = await criarCaixaDoSetor(g.chamar, { endereco: 'comunicacao@cruzvermelhariodejaneiro.org', nome: 'Comunicação Social', senha: 'Tmp#Senha-1', recuperacaoEmail: 'ana@gmail.com', recuperacaoCelular: '+5521988887777' })
    igual(r, { feito: 'criada' }, 'caixa do setor: endereço livre vira conta')
    igual(g.usuarios.get('comunicacao@cruzvermelhariodejaneiro.org')?.principal, 'comunicacao@cruzvermelhariodejaneiro.org', 'caixa do setor: é um usuário de verdade (não apelido)')
    igual((await consultarEndereco(g.chamar, 'comunicacao@cruzvermelhariodejaneiro.org')).tipo, 'caixa_real', 'caixa do setor: depois de criada é caixa real')
    const corpo = g.corposEnviados.find((c) => c.rota === 'POST /users')?.corpo as { changePasswordAtNextLogin?: boolean; recoveryEmail?: string; recoveryPhone?: string; name?: { givenName?: string; familyName?: string } }
    igual(corpo?.changePasswordAtNextLogin, true, 'caixa do setor: obriga a trocar a senha no primeiro acesso')
    igual(corpo?.recoveryEmail, 'ana@gmail.com', 'caixa do setor: recuperação pelo e-mail de quem cuida')
    igual(corpo?.recoveryPhone, '+5521988887777', 'caixa do setor: recuperação pelo celular de quem cuida')
    igual(corpo?.name?.givenName, 'Comunicação Social', 'caixa do setor: o nome é o do setor')
    igual(Boolean(corpo?.name?.familyName), true, 'caixa do setor: sobrenome preenchido (o Google exige)')
  }
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, TI)
    const r = await criarCaixaDoSetor(g.chamar, { endereco: TI, nome: 'TI', senha: 'x' })
    igual(r, { feito: 'nao_criada', motivo: 'apelido', dono: CONTATO }, 'caixa do setor: apelido NÃO vira conta (apague o apelido antes)')
    igual(g.chamadas.some((c) => c.startsWith('POST') || c.startsWith('DELETE')), false, 'caixa do setor: apelido não é tocado')
    const real = novoGoogle()
    real.comCaixa(CONTATO)
    igual((await criarCaixaDoSetor(real.chamar, { endereco: CONTATO, nome: 'Atendimento', senha: 'x' })).feito, 'nao_criada', 'caixa do setor: caixa real não é recriada')
    igual(real.chamadas.some((c) => c.startsWith('POST')), false, 'caixa do setor: caixa real intocada')
    const gr = novoGoogle()
    gr.grupos.set('ouvidoria@x.org', { membros: new Map(), config: null })
    igual(await criarCaixaDoSetor(gr.chamar, { endereco: 'ouvidoria@x.org', nome: 'Ouvidoria', senha: 'x' }), { feito: 'nao_criada', motivo: 'grupo' }, 'caixa do setor: grupo não vira conta')
    const limite = novoGoogle()
    limite.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 412, mensagem: 'Domain user limit reached' })
    const lim = await tenta(() => criarCaixaDoSetor(limite.chamar, { endereco: 'novo@x.org', nome: 'Novo', senha: 'x' }))
    igual(lim instanceof ErroDeGrupo, true, 'caixa do setor: limite de usuários vira erro claro')
    contem((lim as ErroDeGrupo).message, 'limite de usuários', 'caixa do setor: mensagem do limite')
  }
  // logo depois de apagar o apelido o Google ainda diz 409 por alguns segundos: espera e tenta de novo; se não passa, erro claro
  {
    const esperas: number[] = []
    const passageiro = novoGoogle()
    passageiro.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 409, mensagem: 'Entity already exists.', vezes: 2 })
    const r = await criarCaixaDoSetor(passageiro.chamar, { endereco: 'novo@x.org', nome: 'Novo', senha: 'x', espera: async (ms) => { esperas.push(ms) } })
    igual(r, { feito: 'criada' }, 'caixa do setor: 409 passageiro (propagação do apelido) é repetido até passar')
    igual(esperas, [1500, 3000], 'caixa do setor: espera cada vez mais entre as tentativas')
    igual(passageiro.usuarios.has('novo@x.org'), true, 'caixa do setor: a conta existe depois da nova tentativa')
    const duradouro = novoGoogle()
    duradouro.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 409, mensagem: 'Entity already exists.', vezes: 99 })
    const tentativas: number[] = []
    const erroDuradouro = await tenta(() => criarCaixaDoSetor(duradouro.chamar, { endereco: 'novo@x.org', nome: 'Novo', senha: 'x', espera: async (ms) => { tentativas.push(ms) } }))
    igual(erroDuradouro instanceof ErroDeGrupo, true, 'caixa do setor: 409 que não passa vira erro')
    igual(tentativas.length, 3, 'caixa do setor: desiste depois de três esperas')
    contem((erroDuradouro as ErroDeGrupo).message, 'caixas dos setores', 'caixa do setor: a mensagem diz o comando para tentar de novo')
  }
  // criar a caixa de todos os setores de uma vez: apelido → apaga e cria; livre → cria; caixa real e grupo ficam como estão
  {
    const mundo = () => {
      const g = novoGoogle()
      g.comApelido(CONTATO, 'comunicacao@cruzvermelhariodejaneiro.org')
      g.comApelido(CONTATO, 'ti@cruzvermelhariodejaneiro.org')
      g.grupos.set('ouvidoria@cruzvermelhariodejaneiro.org', { membros: new Map(), config: null })
      return g
    }
    const itens = [
      { nome: 'Atendimento', endereco: CONTATO },
      { nome: 'Comunicação', endereco: 'comunicacao@cruzvermelhariodejaneiro.org' },
      { nome: 'TI', endereco: 'ti@cruzvermelhariodejaneiro.org' },
      { nome: 'Ouvidoria', endereco: 'ouvidoria@cruzvermelhariodejaneiro.org' },
      { nome: 'Esportes', endereco: 'esportes@cruzvermelhariodejaneiro.org' },
    ]
    const comSenha = itens.map((i) => ({ ...i, senha: `Senha#${i.nome}-1` }))
    const so = (...nomes: string[]) => comSenha.filter((i) => nomes.includes(i.nome))
    const APELIDO_TI = 'ti@cruzvermelhariodejaneiro.org'
    const APELIDO_COM = 'comunicacao@cruzvermelhariodejaneiro.org'

    const g = mundo()
    const r = await criarCaixasDosSetores(g.chamar, comSenha, { espera: semEspera })
    igual(r.map((x) => `${x.nome}:${x.resultado}`), ['Atendimento:ja_existe', 'Comunicação:criada', 'TI:criada', 'Ouvidoria:e_grupo', 'Esportes:criada'], 'caixas: cria só o que é apelido ou livre (e devolve na ordem pedida)')
    igual(r.filter((x) => x.apelidoApagado).map((x) => x.nome), ['Comunicação', 'TI'], 'caixas: diz de quais o apelido foi apagado')
    igual((await planoDasCaixas(g.chamar, itens)).map((p) => p.estado), ['caixa_real', 'caixa_real', 'caixa_real', 'grupo', 'caixa_real'], 'caixas: depois de feito, cada setor tem caixa própria (e o grupo ficou grupo)')
    igual([...(g.usuarios.get(CONTATO)?.apelidos ?? [])], [], 'caixas: nenhum apelido sobra no contato@')
    igual(g.usuarios.has(CONTATO), true, 'caixas: o contato@ continua existindo')
    igual(g.grupos.has('ouvidoria@cruzvermelhariodejaneiro.org'), true, 'caixas: o grupo não foi tocado')
    igual(g.chamadas.filter((c) => c === 'POST diretorio:/users').length, 3, 'caixas: exatamente 3 contas criadas')
    igual(g.chamadas.filter((c) => c.startsWith('DELETE')).length, 2, 'caixas: exatamente 2 apelidos apagados')
    igual(g.chamadas.some((c) => c.startsWith('DELETE') && c.includes(encodeURIComponent(CONTATO) + '/aliases/' + encodeURIComponent(CONTATO))), false, 'caixas: nunca apaga o contato@ como apelido')
    const posts = g.corposEnviados.filter((c) => c.rota === 'POST /users').map((c) => c.corpo as { primaryEmail: string; password: string; changePasswordAtNextLogin: boolean })
    igual(posts.map((c) => c.password), ['Senha#Esportes-1', 'Senha#Comunicação-1', 'Senha#TI-1'], 'caixas: cada caixa nasce com a senha própria que foi passada (os livres primeiro)')
    igual(posts.every((c) => c.changePasswordAtNextLogin === true), true, 'caixas: todas obrigam a trocar a senha no primeiro acesso')
    // o POST é a palavra final: depois de apagar o apelido não há consulta no meio (uma leitura atrasada recusaria à toa)
    const iDelete = g.chamadas.findIndex((c) => c.startsWith('DELETE') && c.includes(encodeURIComponent(APELIDO_COM)))
    const iPost = g.chamadas.findIndex((c, k) => k > iDelete && c === 'POST diretorio:/users')
    igual(g.chamadas.slice(iDelete + 1, iPost).length, 0, 'caixas: entre apagar o apelido e criar a conta não há consulta nenhuma')

    // os livres vêm primeiro: nada é apagado antes de saber que criar funciona
    const ord = mundo()
    await criarCaixasDosSetores(ord.chamar, so('TI', 'Esportes'), { espera: semEspera })
    igual(ord.chamadas.findIndex((c) => c === 'POST diretorio:/users') < ord.chamadas.findIndex((c) => c.startsWith('DELETE')), true, 'caixas: o setor livre é criado antes de qualquer apelido ser apagado')

    // rodar de novo não faz nada
    const de_novo = await criarCaixasDosSetores(g.chamar, comSenha, { espera: semEspera })
    igual(de_novo.map((x) => x.resultado), ['ja_existe', 'ja_existe', 'ja_existe', 'e_grupo', 'ja_existe'], 'caixas: rodar de novo é idempotente')
    igual(g.chamadas.filter((c) => c === 'POST diretorio:/users').length, 3, 'caixas: rodar de novo não cria conta nenhuma')

    // a criação falha DEPOIS de o apelido ser apagado: o apelido volta
    const f = mundo()
    f.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 500, mensagem: 'Internal error', vezes: 1 })
    const rf = await criarCaixasDosSetores(f.chamar, so('TI', 'Comunicação'), { espera: semEspera })
    igual(rf.map((x) => `${x.nome}:${x.resultado}`), ['Comunicação:falhou', 'TI:criada'], 'caixas: a falha de um setor não impede o seguinte')
    igual(rf[0].apelidoApagado === true && rf[0].apelidoDevolvido === true, true, 'caixas: falhou depois de apagar → o apelido foi devolvido')
    igual(f.usuarios.get(CONTATO)?.apelidos.has(APELIDO_COM), true, 'caixas: o apelido do que falhou voltou ao contato@')
    igual((await consultarEndereco(f.chamar, APELIDO_COM)).tipo, 'apelido', 'caixas: o e-mail do setor que falhou continua chegando onde chegava')
    contem(rf[0].motivo ?? '', 'Internal error', 'caixas: o motivo do Google aparece')

    // e se nem o apelido volta: o resultado diz, nunca em silêncio
    const ff = mundo()
    ff.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 500, mensagem: 'Internal error', vezes: 99 })
    ff.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/aliases'), status: 500, mensagem: 'Backend error', vezes: 99 })
    const rff = await criarCaixasDosSetores(ff.chamar, so('TI'), { espera: semEspera })
    igual(rff[0].resultado === 'falhou' && rff[0].apelidoApagado === true && rff[0].apelidoDevolvido === false, true, 'caixas: se o apelido não volta, o resultado diz que NÃO voltou')
    // a restauração que ESTOURA (timeout) não apaga o aviso nem interrompe as tentativas
    const fl = mundo()
    fl.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 500, mensagem: 'Internal error', vezes: 99 })
    fl.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/aliases'), status: 0, lancar: true, vezes: 99 })
    const rfl = await criarCaixasDosSetores(fl.chamar, so('TI'), { espera: semEspera })
    igual(rfl[0].resultado === 'falhou' && rfl[0].apelidoApagado === true && rfl[0].apelidoDevolvido === false, true, 'caixas: restauração que estoura → o resultado ainda diz "apagado e NÃO voltou"')
    igual(fl.chamadas.filter((c) => c.startsWith('POST') && c.includes('/aliases')).length, 4, 'caixas: a restauração tenta quatro vezes mesmo com exceção')
    // a primeira tentativa de restaurar estoura, a segunda funciona
    const fl2 = mundo()
    fl2.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 500, mensagem: 'Internal error', vezes: 99 })
    fl2.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/aliases'), status: 0, lancar: true, vezes: 1 })
    const rfl2 = await criarCaixasDosSetores(fl2.chamar, so('TI'), { espera: semEspera })
    igual(rfl2[0].apelidoDevolvido, true, 'caixas: depois de uma exceção, a restauração tenta de novo e devolve')
    // a resposta do POST do apelido se perde COM o apelido gravado: a lista do dono é que decide
    const fl3 = mundo()
    fl3.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 500, mensagem: 'Internal error', vezes: 99 })
    fl3.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/aliases'), status: 0, lancar: true, aplicar: true, vezes: 1 })
    igual((await criarCaixasDosSetores(fl3.chamar, so('TI'), { espera: semEspera }))[0].apelidoDevolvido, true, 'caixas: resposta perdida com o apelido gravado → conta como devolvido (pela lista do dono)')
    // 409 no apelido sem o apelido estar na lista (o endereço foi tomado por outra coisa): NÃO é "voltou"
    const f409a = novoGoogle()
    f409a.comCaixa(CONTATO)
    igual(await restaurarApelido(f409a.chamar, CONTATO, 'ti@x.org', semEspera), true, 'restaurar: apelido volta quando o endereço está livre')
    const tomado = novoGoogle()
    tomado.comCaixa(CONTATO)
    tomado.comCaixa('ti@x.org')
    igual(await restaurarApelido(tomado.chamar, CONTATO, 'ti@x.org', semEspera), false, 'restaurar: endereço tomado por uma conta não conta como devolvido (409 sem o apelido na lista)')

    // o DELETE estoura mas JÁ foi aplicado no Google: o resultado não pode dizer "continua como estava"
    const dp = mundo()
    dp.falhasPlanejadas.push({ quando: (a, m) => m === 'DELETE', status: 0, lancar: true, aplicar: true, vezes: 1 })
    const rdp = await criarCaixasDosSetores(dp.chamar, so('TI'), { espera: semEspera })
    igual(rdp[0].resultado === 'criada' && rdp[0].apelidoApagado === true, true, 'caixas: DELETE aplicado com resposta perdida → reconsulta, vê livre e cria a caixa')
    // o DELETE estoura e NÃO foi aplicado: continua apelido, e o resultado diz isso
    const dn = mundo()
    dn.falhasPlanejadas.push({ quando: (a, m) => m === 'DELETE', status: 0, lancar: true, vezes: 99 })
    const rdn = await criarCaixasDosSetores(dn.chamar, so('TI'), { espera: semEspera })
    igual(rdn[0].resultado, 'falhou', 'caixas: DELETE que estoura sem aplicar → falhou')
    contem(rdn[0].motivo ?? '', 'continua como estava', 'caixas: confirmado que ainda é apelido → "continua como estava"')
    igual(dn.chamadas.some((c) => c === 'POST diretorio:/users'), false, 'caixas: apelido que não saiu → nem tenta criar a conta')
    // o DELETE estoura e nem a lista do dono nem a releitura respondem: o resultado diz que NÃO SABE — e o lote PARA
    const semResposta = () => {
      const g2 = mundo()
      g2.falhasPlanejadas.push({ quando: (a, m) => m === 'DELETE', status: 0, lancar: true, aplicar: true, vezes: 1 })
      g2.falhasPlanejadas.push({ quando: (a, m, c) => m === 'GET' && c.endsWith('/aliases'), status: 0, lancar: true, vezes: 99 })
      // a leitura de GET /users/ti só quebra a partir da TERCEIRA vez (a prévia e a conferência de removerApelidos ainda respondem)
      let leituras = 0
      g2.falhasPlanejadas.push({ quando: (a, m, c) => { if (m === 'GET' && c === `/users/${encodeURIComponent(APELIDO_TI)}`) { leituras++; return leituras > 2 } return false }, status: 0, lancar: true, vezes: 99 })
      return g2
    }
    const du = semResposta()
    const itemTI = comSenha.filter((i) => i.nome === 'TI')
    const rdu = await criarCaixasDosSetores(du.chamar, itemTI, { espera: semEspera })
    igual(rdu[0].resultado === 'falhou' && rdu[0].incerto === true, true, 'caixas: não sei como o endereço ficou → falhou com incerto, nunca "continua como estava"')
    contem(rdu[0].motivo ?? '', 'não consegui conferir', 'caixas: o motivo diz que não deu para conferir')
    const du2 = semResposta()
    const rdu2 = await criarCaixasDosSetores(du2.chamar, [...itemTI, ...comSenha.filter((i) => i.nome === 'Comunicação')], { espera: semEspera })
    igual(rdu2.map((x) => x.resultado), ['falhou', 'adiada'], 'caixas: resultado incerto → o lote PARA e o apelido do setor seguinte não é apagado')
    igual(du2.chamadas.filter((c) => c.startsWith('DELETE')).length, 1, 'caixas: incerto → só um DELETE saiu')

    // DELETE aplicado + resposta perdida + LEITURA ATRASADA (GET /users ainda mostra o apelido): a lista do dono é a palavra final
    const e1 = mundo()
    e1.falhasPlanejadas.push({ quando: (a, m) => m === 'DELETE', status: 0, lancar: true, aplicar: true, vezes: 1, aposAplicar: () => e1.leituraVelha(APELIDO_TI, 2, () => e1.respostas.ok({ primaryEmail: CONTATO, lastLoginTime: '1970-01-01T00:00:00.000Z' })) })
    const re1 = await criarCaixasDosSetores(e1.chamar, so('TI'), { espera: semEspera })
    igual(re1[0].resultado === 'criada' && re1[0].apelidoApagado === true, true, 'caixas: DELETE aplicado + leitura atrasada → pela lista do dono vê que saiu e cria a caixa')
    // o mesmo em quatro setores: nenhum "continua como estava" falso, nenhum apelido perdido sem caixa
    const e3 = mundo()
    for (const nome of ['juridico', 'esportes2', 'gestao']) e3.comApelido(CONTATO, `${nome}@cruzvermelhariodejaneiro.org`)
    e3.falhasPlanejadas.push({ quando: (a, m) => m === 'DELETE', status: 0, lancar: true, aplicar: true, vezes: 99, aposAplicar: () => { for (const t of ['ti', 'comunicacao', 'juridico', 'esportes2', 'gestao']) e3.leituraVelha(`${t}@cruzvermelhariodejaneiro.org`, 1, () => e3.respostas.ok({ primaryEmail: CONTATO, lastLoginTime: '1970-01-01T00:00:00.000Z' })) } })
    const re3 = await criarCaixasDosSetores(e3.chamar, ['ti', 'comunicacao', 'juridico', 'esportes2', 'gestao'].map((t) => ({ nome: t, endereco: `${t}@cruzvermelhariodejaneiro.org`, senha: 'x' })), { espera: semEspera })
    igual(re3.map((x) => x.resultado), ['criada', 'criada', 'criada', 'criada', 'criada'], 'caixas: DELETE perdido + leitura atrasada em vários setores → todas as caixas nascem')
    igual(re3.some((x) => /continua como estava/.test(x.motivo ?? '')), false, 'caixas: nenhum "continua como estava" falso')
    // POST aplicado + resposta perdida + leitura atrasada: a conta existe — não é "apelido NÃO voltou"
    const e2 = mundo()
    e2.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 0, lancar: true, aplicar: true, vezes: 1, aposAplicar: () => e2.leituraVelha(APELIDO_TI, 1, () => e2.respostas.erro(404)) })
    const re2 = await criarCaixasDosSetores(e2.chamar, so('TI'), { espera: semEspera })
    igual(re2[0].resultado, 'criada', 'caixas: POST aplicado + resposta perdida + leitura atrasada → relê e conta como criada')
    igual(e2.chamadas.some((c) => c.startsWith('POST') && c.includes('/aliases')), false, 'caixas: ... e não tenta devolver o apelido por cima da conta')
    // 4xx definitivo NÃO é "em dúvida": nada nasceu, a conta que apareça depois não é nossa
    const e4xx = mundo()
    e4xx.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 403, mensagem: 'Not Authorized', vezes: 99 })
    const re4xx = await criarCaixasDosSetores(e4xx.chamar, so('TI'), { espera: semEspera })
    igual(re4xx[0].resultado === 'falhou' && re4xx[0].apelidoDevolvido === true, true, 'caixas: 403 definitivo → falhou e o apelido voltou (sem inferir "criada")')
    // 4xx definitivo com uma conta que apareceu por OUTRO caminho: não é "criada por nós" (a senha entregue não seria a dela)
    const e4xxa = mundo()
    e4xxa.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 403, mensagem: 'Not Authorized', vezes: 99, aplicar: true })
    const re4xxa = await criarCaixasDosSetores(e4xxa.chamar, so('TI'), { espera: semEspera })
    igual(re4xxa[0].resultado, 'falhou', 'caixas: 403 definitivo + conta que apareceu por outro caminho → NÃO conta como criada por nós')
    // a restauração que falha PARA o lote: só o primeiro setor serve de canário destrutivo
    const e5 = mundo()
    e5.comApelido(CONTATO, 'juridico@cruzvermelhariodejaneiro.org')
    e5.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 500, mensagem: 'Internal error', vezes: 99 })
    e5.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c.endsWith('/aliases'), status: 500, mensagem: 'Backend error', vezes: 99 })
    const re5 = await criarCaixasDosSetores(e5.chamar, [...so('TI', 'Comunicação'), { nome: 'Jurídico', endereco: 'juridico@cruzvermelhariodejaneiro.org', senha: 'x' }], { espera: semEspera })
    igual(re5.map((x) => x.resultado), ['falhou', 'adiada', 'adiada'], 'caixas: apelido que não voltou → o lote para (só um endereço fica sem destino)')
    contem(re5[1].motivo ?? '', 'não voltou', 'caixas: o adiado diz que parou porque um apelido não voltou')
    igual(e5.chamadas.filter((c) => c.startsWith('DELETE')).length, 1, 'caixas: apelido que não voltou → só um DELETE saiu')
    // dois setores livres com dado inválido (400) não travam os apelidos saudáveis
    const e4 = mundo()
    e4.recusaCriar.add('l1@cruzvermelhariodejaneiro.org')
    e4.recusaCriar.add('l2@cruzvermelhariodejaneiro.org')
    const re4 = await criarCaixasDosSetores(e4.chamar, [{ nome: 'L1', endereco: 'l1@cruzvermelhariodejaneiro.org', senha: 'x' }, { nome: 'L2', endereco: 'l2@cruzvermelhariodejaneiro.org', senha: 'x' }, ...so('TI', 'Comunicação')], { espera: semEspera })
    igual(re4.map((x) => x.resultado), ['falhou', 'falhou', 'criada', 'criada'], 'caixas: dois setores com dado inválido (400) não impedem os apelidos saudáveis')
    // "Rate Limit Exceeded" (403) não é "limite de usuários"
    const rl = novoGoogle()
    rl.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 403, mensagem: 'Rate Limit Exceeded', vezes: 99 })
    const erroRl = await tenta(() => criarCaixaDoSetor(rl.chamar, { endereco: 'novo@x.org', nome: 'Novo', senha: 'x', semConsulta: true, espera: semEspera }))
    igual(erroRl instanceof ErroDeGrupo && !/limite de usu/i.test(erroRl.message), true, 'caixa do setor: cota transitória (Rate Limit Exceeded) não vira "limite de usuários do Workspace"')

    // o POST estoura DEPOIS de o Google criar a conta: reconsulta e conta como criada
    const pc = mundo()
    pc.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 0, lancar: true, aplicar: true, vezes: 1 })
    const rpc = await criarCaixasDosSetores(pc.chamar, so('TI'), { espera: semEspera })
    igual(rpc[0].resultado, 'criada', 'caixas: POST estourou mas a conta existe → conta como criada')
    igual(rpc[0].apelidoApagado, true, 'caixas: ... e o apelido consta como apagado')
    igual(pc.chamadas.some((c) => c.startsWith('POST') && c.includes('/aliases')), false, 'caixas: ... e o apelido NÃO é restaurado por cima da conta que nasceu')
    // 409 explícito não é "criou": é o Google dizendo que o endereço está ocupado
    const p409 = mundo()
    p409.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 409, mensagem: 'Entity already exists.', vezes: 99 })
    const rp409 = await criarCaixasDosSetores(p409.chamar, so('TI'), { espera: semEspera })
    igual(rp409[0].resultado === 'falhou' && rp409[0].apelidoDevolvido === true, true, 'caixas: 409 que não passa → falhou e o apelido volta')

    // o Google ainda diz 409 por alguns segundos depois de apagar o apelido: espera e cria
    const f409 = mundo()
    f409.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 409, mensagem: 'Entity already exists.', vezes: 2 })
    const r409 = await criarCaixasDosSetores(f409.chamar, so('TI'), { espera: semEspera })
    igual(r409[0].resultado, 'criada', 'caixas: 409 passageiro depois de apagar o apelido não impede a caixa')

    // erro que vale para todos (permissão/limite): para no primeiro e não repete o estrago nos outros
    const sis = mundo()
    sis.comApelido(CONTATO, 'juridico@cruzvermelhariodejaneiro.org')
    sis.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 403, mensagem: 'Not Authorized', vezes: 99 })
    const rs = await criarCaixasDosSetores(sis.chamar, [...so('TI', 'Comunicação'), { nome: 'Jurídico', endereco: 'juridico@cruzvermelhariodejaneiro.org', senha: 'x' }], { espera: semEspera })
    igual(rs.map((x) => x.resultado), ['falhou', 'adiada', 'adiada'], 'caixas: erro de permissão → o primeiro falha e o resto fica adiado')
    contem(rs[1].motivo ?? '', 'parei', 'caixas: o adiado diz por que parou')
    igual(sis.chamadas.filter((c) => c.startsWith('DELETE')).length, 1, 'caixas: erro que vale para todos → só UM apelido foi apagado (e devolvido)')
    igual([...(sis.usuarios.get(CONTATO)?.apelidos ?? [])].sort(), ['comunicacao@cruzvermelhariodejaneiro.org', 'juridico@cruzvermelhariodejaneiro.org', 'ti@cruzvermelhariodejaneiro.org'], 'caixas: erro que vale para todos → nenhum apelido se perdeu')
    // criar não funciona nem para um setor LIVRE: nenhum apelido chega a ser apagado
    const sl = mundo()
    sl.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 412, mensagem: 'Domain user limit reached', vezes: 99 })
    const rsl = await criarCaixasDosSetores(sl.chamar, so('TI', 'Comunicação', 'Esportes'), { espera: semEspera })
    igual(sl.chamadas.some((c) => c.startsWith('DELETE')), false, 'caixas: se nem o setor livre consegue criar, nenhum apelido é apagado')
    igual(rsl.map((x) => x.resultado), ['adiada', 'adiada', 'falhou'], 'caixas: limite de contas → o livre falha e os apelidos ficam adiados')
    // dois setores seguidos falham (sem ser um erro sistêmico): para
    const dois = mundo()
    dois.comApelido(CONTATO, 'juridico@cruzvermelhariodejaneiro.org')
    dois.falhasPlanejadas.push({ quando: (a, m, c) => m === 'POST' && c === '/users', status: 500, mensagem: 'Internal error', vezes: 99 })
    const rdois = await criarCaixasDosSetores(dois.chamar, [...so('TI', 'Comunicação'), { nome: 'Jurídico', endereco: 'juridico@cruzvermelhariodejaneiro.org', senha: 'x' }], { espera: semEspera })
    igual(rdois.map((x) => x.resultado), ['falhou', 'falhou', 'adiada'], 'caixas: dois seguidos falham → o terceiro não é nem tentado')

    // aoCriar: roda logo depois de cada conta, antes do setor seguinte; o que ele devolve entra no resultado; se estoura, o registro falhou
    const ac = mundo()
    const vistos: string[] = []
    const rac = await criarCaixasDosSetores(ac.chamar, so('Comunicação', 'TI'), {
      espera: semEspera,
      aoCriar: async (x) => { vistos.push(x.nome); ac.chamadas.push(`AOCRIAR ${x.nome}`); if (x.nome === 'TI') throw new Error('banco fora'); return { entrega: 'sem_coordenador', registro: 'ok' } },
    })
    igual(vistos, ['Comunicação', 'TI'], 'caixas: aoCriar roda uma vez por conta criada')
    igual(rac[0].entrega === 'sem_coordenador' && rac[0].registro === 'ok', true, 'caixas: o que aoCriar devolve entra no resultado')
    igual(rac[1].resultado === 'criada' && rac[1].registro === 'falhou', true, 'caixas: aoCriar que estoura → a conta consta criada e o registro, falhado')
    igual(ac.chamadas.indexOf('AOCRIAR Comunicação') < ac.chamadas.findIndex((c) => c.startsWith('DELETE') && c.includes(encodeURIComponent(APELIDO_TI))), true, 'caixas: o registro da primeira conta acontece ANTES de o apelido do setor seguinte ser apagado')
    const semAc = await criarCaixasDosSetores(mundo().chamar, so('Ouvidoria', 'Atendimento'), { espera: semEspera, aoCriar: async () => { throw new Error('não devia ser chamado') } })
    igual(semAc.map((x) => x.resultado).sort(), ['e_grupo', 'ja_existe'], 'caixas: aoCriar só roda para conta criada')

    // o apelido não pôde ser apagado: nada é criado e o apelido fica como estava
    const fd = mundo()
    fd.falhasPlanejadas.push({ quando: (a, m) => m === 'DELETE', status: 500, mensagem: 'Backend error', vezes: 99 })
    const rd = await criarCaixasDosSetores(fd.chamar, so('TI'), { espera: semEspera })
    igual(rd[0].resultado, 'falhou', 'caixas: não apagou o apelido → falhou')
    igual(fd.chamadas.some((c) => c === 'POST diretorio:/users'), false, 'caixas: sem apagar o apelido, nem tenta criar a conta')
    igual(fd.usuarios.get(CONTATO)?.apelidos.has(APELIDO_TI), true, 'caixas: o apelido segue como estava')

    // o prazo: depois dele nenhum setor novo começa, e nada é mexido
    const fp = mundo()
    const rp = await criarCaixasDosSetores(fp.chamar, comSenha, { espera: semEspera, ate: 50, agora: () => 100 })
    igual(rp.map((x) => x.resultado), ['ja_existe', 'adiada', 'adiada', 'e_grupo', 'adiada'], 'caixas: passou do prazo → o que precisava de caixa fica adiado')
    igual(fp.chamadas.some((c) => c.startsWith('POST') || c.startsWith('DELETE')), false, 'caixas: passou do prazo → nada é criado nem apagado')
    let relogio = 0
    const rm = await criarCaixasDosSetores(mundo().chamar, so('Comunicação', 'TI', 'Ouvidoria', 'Esportes'), { espera: semEspera, ate: 0, agora: () => relogio++ })
    igual(rm.map((x) => x.resultado), ['adiada', 'adiada', 'e_grupo', 'criada'], 'caixas: o prazo estoura no meio: o setor em curso termina, os seguintes ficam adiados')
  }

  // entregar a caixa que já existe sem dono: redefine a senha (e a recuperação) — e só se for caixa real que NINGUÉM usou
  {
    const g = novoGoogle()
    g.comCaixa('comunicacao@x.org')
    igual(await redefinirSenhaDaCaixa(g.chamar, { endereco: 'comunicacao@x.org', senha: 'Nova#Senha-1', recuperacaoEmail: 'ana@gmail.com', recuperacaoCelular: '+5521988887777' }), 'redefinida', 'redefinir: caixa real que ninguém usou é redefinida')
    const corpo = g.corposEnviados.find((c) => c.rota === 'PATCH /users/comunicacao%40x.org')?.corpo as { password?: string; changePasswordAtNextLogin?: boolean; recoveryEmail?: string; recoveryPhone?: string }
    igual(corpo?.password, 'Nova#Senha-1', 'redefinir: a senha nova vai ao Google')
    igual(corpo?.changePasswordAtNextLogin, true, 'redefinir: obriga a trocar no primeiro acesso')
    igual(corpo?.recoveryEmail, 'ana@gmail.com', 'redefinir: a recuperação passa a ser a de quem recebe (e-mail)')
    igual(corpo?.recoveryPhone, '+5521988887777', 'redefinir: a recuperação passa a ser a de quem recebe (celular)')
    // caixa que já teve acesso: está em uso, a senha não se troca por aqui (protege o contato@ e qualquer caixa usada)
    const uso = novoGoogle()
    uso.comCaixa(CONTATO)
    uso.comAcesso(CONTATO, '2026-10-23T18:30:00.000Z')
    igual(await redefinirSenhaDaCaixa(uso.chamar, { endereco: CONTATO, senha: 'x' }), 'em_uso', 'redefinir: caixa com acesso (contato@) NUNCA é redefinida')
    igual(uso.chamadas.some((c) => c.startsWith('PATCH')), false, 'redefinir: em uso → nenhum PATCH sai')
    // sem o último acesso na resposta do Google não há prova de que ninguém entrou: falha FECHADA
    const sem = novoGoogle()
    sem.comCaixa('comunicacao@x.org')
    sem.falhasPlanejadas.push({ quando: () => false, status: 0 })
    const chamarSem: Chamar = async (a, c, i) => { const r = await sem.chamar(a, c, i); if (a === 'diretorio' && (i?.method ?? 'GET') === 'GET' && /^\/users\/[^/]+$/.test(c)) { const { lastLoginTime: _ignorado, ...resto } = r.dados; void _ignorado; return { ...r, dados: resto } } return r }
    igual(await redefinirSenhaDaCaixa(chamarSem, { endereco: 'comunicacao@x.org', senha: 'x' }), 'em_uso', 'redefinir: sem o último acesso na resposta, não redefine (falha fechada)')
    igual(sem.chamadas.some((c) => c.startsWith('PATCH')), false, 'redefinir: sem o último acesso nenhum PATCH sai')
    const ap = novoGoogle()
    ap.comApelido('contato@x.org', 'ti@x.org')
    igual(await redefinirSenhaDaCaixa(ap.chamar, { endereco: 'ti@x.org', senha: 'x' }), 'nao_e_caixa', 'redefinir: apelido não é redefinido')
    igual(await redefinirSenhaDaCaixa(novoGoogle().chamar, { endereco: 'nada@x.org', senha: 'x' }), 'nao_e_caixa', 'redefinir: endereço livre não é redefinido')
    const gr = novoGoogle()
    gr.grupos.set('ouvidoria@x.org', { membros: new Map(), config: null })
    igual(await redefinirSenhaDaCaixa(gr.chamar, { endereco: 'ouvidoria@x.org', senha: 'x' }), 'nao_e_caixa', 'redefinir: grupo não é redefinido')
    igual([ap, gr].some((x) => x.chamadas.some((c) => c.startsWith('PATCH'))), false, 'redefinir: fora da caixa real nenhum PATCH sai')
    const neg = novoGoogle()
    neg.comCaixa('a@x.org')
    neg.falhasPlanejadas.push({ quando: (a, m) => m === 'PATCH', status: 403, mensagem: 'Not Authorized' })
    igual((await tenta(() => redefinirSenhaDaCaixa(neg.chamar, { endereco: 'a@x.org', senha: 'x' }))) instanceof ErroDeGrupo, true, 'redefinir: negado pelo Google vira erro claro')
    // devolver um apelido
    const rest = novoGoogle()
    rest.comCaixa('contato@x.org')
    igual(await restaurarApelido(rest.chamar, 'contato@x.org', 'ti@x.org', semEspera), true, 'restaurar: o apelido volta')
    igual(rest.usuarios.get('contato@x.org')?.apelidos.has('ti@x.org'), true, 'restaurar: o contato@ tem o apelido de novo')
    igual(await restaurarApelido(rest.chamar, 'contato@x.org', 'ti@x.org', semEspera), true, 'restaurar: se já voltou, também é sucesso')
  }
  // 404 ao apagar: o apelido já não existia (outro toque, outro administrador) — não é "removido" por nós
  {
    const g = novoGoogle()
    g.comApelido(CONTATO, 'a@x.org')
    g.falhasPlanejadas.push({ quando: (a, m, c) => m === 'DELETE' && c.endsWith(encodeURIComponent('a@x.org')), status: 404, mensagem: 'Resource Not Found: alias' })
    const r = await removerApelidos(g.chamar, [{ nome: 'A', endereco: 'a@x.org' }])
    igual(r.map((x) => x.resultado), ['nao_era_apelido'], 'apelidos: 404 ao apagar não conta como removido')
  }
  // o aviso da confirmação
  contem(avisoDaCaixaDoSetor({ tipo: 'livre' }, { endereco: 'ti@x.org', nome: 'TI', quem: 'Ana' }) ?? '', 'caixa do setor TI', 'aviso da caixa: endereço livre será criado')
  contem(avisoDaCaixaDoSetor({ tipo: 'apelido', dono: 'contato@x.org' }, { endereco: 'ti@x.org', nome: 'TI', quem: 'Ana' }) ?? '', 'não* será entregue', 'aviso da caixa: apelido bloqueia a entrega')
  contem(avisoDaCaixaDoSetor({ tipo: 'apelido', dono: 'contato@x.org' }, { endereco: 'ti@x.org', nome: 'TI', quem: 'Ana' }) ?? '', 'caixas dos setores', 'aviso da caixa: manda criar as caixas dos setores')
  contem(avisoDaCaixaDoSetor({ tipo: 'caixa_real' }, { endereco: 'ti@x.org', nome: 'TI', quem: 'Ana' }) ?? '', 'com responsável', 'aviso da caixa: já tem responsável, nada muda')
  contem(avisoDaCaixaDoSetor({ tipo: 'caixa_real' }, { endereco: 'ti@x.org', nome: 'TI', quem: 'Ana', semDono: true }) ?? '', 'ainda não tem responsável', 'aviso da caixa: sem dono será entregue')
  contem(avisoDaCaixaDoSetor({ tipo: 'caixa_real' }, { endereco: 'ti@x.org', nome: 'TI', quem: 'Ana', semDono: true }) ?? '', 'redefinida', 'aviso da caixa: avisa que a senha é redefinida')

  contem(avisoDaConversao({ tipo: 'apelido', dono: CONTATO }, TI) ?? '', 'vira um *grupo do Google*', 'aviso: apelido vira grupo')
  contem(avisoDaConversao({ tipo: 'apelido', dono: CONTATO }, TI) ?? '', CONTATO, 'aviso: diz quem continua recebendo')
  contem(avisoDaConversao({ tipo: 'livre' }, TI) ?? '', 'será criado como grupo', 'aviso: endereço livre')
  igual(avisoDaConversao({ tipo: 'grupo' }, TI), null, 'aviso: grupo existente não avisa nada')
  igual(avisoDaConversao({ tipo: 'caixa_real' }, TI), null, 'aviso: caixa real não avisa nada')

  console.log(falhas ? `${falhas} falha(s).` : 'Tudo certo.')
  process.exit(falhas ? 1 : 0)
}
void main()
