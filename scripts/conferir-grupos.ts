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
  ErroDeGrupo, avisoDaConversao, sondarAcesso, colocarNoGrupo, configurarGrupoDoSetor, consultarEndereco, converterEmGrupo, type Chamar, type Resposta,
} from '../lib/google/grupos-regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!String(texto).includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }

// ------------------------------------------------------------------ o Google de mentira

type Grupo = { membros: Map<string, string>; config: Record<string, unknown> | null }
type Falha = { quando: (api: string, metodo: string, caminho: string) => boolean; status: number; vezes?: number }

function novoGoogle() {
  const usuarios = new Map<string, { principal: string; apelidos: Set<string> }>()
  const grupos = new Map<string, Grupo>()
  const falhasPlanejadas: Falha[] = []
  const chamadas: string[] = []
  // O grupo recém-criado só aparece para as configurações na N-ésima tentativa (a propagação do Google).
  let configuracoesQueNaoAchamAinda = 0
  const donoDe = (e: string) => [...usuarios.values()].find((u) => u.principal === e || u.apelidos.has(e))
  const ok = (dados: Record<string, unknown> = {}): Resposta => ({ ok: true, status: 200, dados })
  const erro = (status: number, message = 'erro do Google'): Resposta => ({ ok: false, status, dados: { error: { message } } })

  const chamar: Chamar = async (api, caminho, init) => {
    const metodo = init?.method ?? 'GET'
    chamadas.push(`${metodo} ${api}:${caminho}`)
    const f = falhasPlanejadas.find((x) => x.quando(api, metodo, caminho) && (x.vezes ?? 1) > 0)
    if (f) { f.vezes = (f.vezes ?? 1) - 1; return erro(f.status) }
    const corpo = (init?.corpo ?? {}) as Record<string, string>
    const dec = decodeURIComponent
    let m: RegExpMatchArray | null
    if (api === 'configuracoes') {
      m = caminho.match(/^\/groups\/v1\/groups\/([^?]+)\?alt=json$/)
      if (!m || metodo !== 'PATCH') return erro(400, 'caminho sem alt=json')
      const g = grupos.get(dec(m[1]))
      if (!g) return erro(404)
      if (configuracoesQueNaoAchamAinda > 0) { configuracoesQueNaoAchamAinda--; return erro(404) }
      g.config = corpo
      return ok()
    }
    if (caminho.startsWith('/users?')) return ok({ users: [] })
    if (caminho.startsWith('/groups?')) return ok({ groups: [] })
    if ((m = caminho.match(/^\/groups\/([^/]+)$/))) {
      const e = dec(m[1])
      if (metodo === 'GET') return grupos.has(e) ? ok({ email: e }) : erro(404)
      if (metodo === 'DELETE') { grupos.delete(e); return ok() }
    }
    if (caminho === '/groups' && metodo === 'POST') {
      const e = corpo.email
      if (grupos.has(e) || donoDe(e)) return erro(409, 'Entity already exists.')
      grupos.set(e, { membros: new Map(), config: null })
      return ok({ email: e })
    }
    if ((m = caminho.match(/^\/users\/([^/]+)$/)) && metodo === 'GET') {
      const u = donoDe(dec(m[1]))
      return u ? ok({ primaryEmail: u.principal }) : erro(404)
    }
    if ((m = caminho.match(/^\/users\/([^/]+)\/aliases\/([^/]+)$/)) && metodo === 'DELETE') {
      const u = usuarios.get(dec(m[1]))
      if (!u || !u.apelidos.delete(dec(m[2]))) return erro(404)
      return ok()
    }
    if ((m = caminho.match(/^\/users\/([^/]+)\/aliases$/)) && metodo === 'POST') {
      const u = usuarios.get(dec(m[1]))
      if (!u) return erro(404)
      u.apelidos.add(corpo.alias)
      return ok()
    }
    if ((m = caminho.match(/^\/groups\/([^/]+)\/members$/)) && metodo === 'POST') {
      const g = grupos.get(dec(m[1]))
      if (!g) return erro(404)
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
    chamar, usuarios, grupos, falhasPlanejadas, chamadas,
    comApelido: (dono: string, apelido: string) => { const u = usuarios.get(dono) ?? { principal: dono, apelidos: new Set<string>() }; u.apelidos.add(apelido); usuarios.set(dono, u) },
    comCaixa: (e: string) => usuarios.set(e, { principal: e, apelidos: new Set() }),
    demoraNasConfiguracoes: (n: number) => { configuracoesQueNaoAchamAinda = n },
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
    igual(tudo.length, 2, 'sonda: tudo certo, duas linhas')
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

  // o aviso da confirmação
  contem(avisoDaConversao({ tipo: 'apelido', dono: CONTATO }, TI) ?? '', 'vira um *grupo do Google*', 'aviso: apelido vira grupo')
  contem(avisoDaConversao({ tipo: 'apelido', dono: CONTATO }, TI) ?? '', CONTATO, 'aviso: diz quem continua recebendo')
  contem(avisoDaConversao({ tipo: 'livre' }, TI) ?? '', 'será criado como grupo', 'aviso: endereço livre')
  igual(avisoDaConversao({ tipo: 'grupo' }, TI), null, 'aviso: grupo existente não avisa nada')
  igual(avisoDaConversao({ tipo: 'caixa_real' }, TI), null, 'aviso: caixa real não avisa nada')

  console.log(falhas ? `${falhas} falha(s).` : 'Tudo certo.')
  process.exit(falhas ? 1 : 0)
}
void main()
