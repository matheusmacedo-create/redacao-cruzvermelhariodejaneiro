/**
 * Confere o cadastro de contas: `npx tsx scripts/conferir-cadastro.ts`.
 *
 *  - as regras puras (lib/contas/cadastro-regras.ts): o pedido de uma pessoa conferido na ordem e com as mensagens
 *    de sempre da tela (nome, e-mail, WhatsApp, nenhum canal, papel, administrador recusado pelo WhatsApp, sem
 *    coordenação, cargo), o usuário livre, o papel sugerido pelo setor, o e-mail da ficha, como o convite saiu, a
 *    linha da tela, o e-mail e o número mascarados, o resumo e o texto do resultado;
 *  - o núcleo do servidor (lib/contas/cadastro.ts, cadastrar) contra um banco de mentira, sem rede: a conta em modo
 *    convite, o vínculo pela sessão, a ficha do RH ligada ou criada (pela sessão), a auditoria, o usuário escolhido
 *    na confirmação, o "já existe" e o desfazer quando o vínculo falha;
 *  - o código: as regras são puras, o núcleo é só do servidor, a tela usa o núcleo, e a migração tira do banco as
 *    mesmas chaves de contato que as regras dizem (CHAVES_DE_CONTATO).
 * Sai com código 1 se algo estiver errado.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Module from 'node:module'
import {
  CHAVES_DE_CONTATO, DOMINIO_DA_INSTITUICAO, ERRO_DO_ADMIN, USUARIO_VALIDO, baseDoUsuario, campoDoEmailNaFicha, comoSaiu, comoSaiuMascarado, conferirCadastro,
  linhasDoCadastro, mascararEmail, mensagemDoCadastro, modoDoConvite, papelSugerido, problemaDoUsuario, rotuloDaCoordenacao, saiu, textoDoResultadoDoCadastro,
  usuarioLivreEntre, type CadastroConferido, type CanaisLigados, type EnvioDoConvite, type PedidoDeCadastro,
} from '../lib/contas/cadastro-regras'
import { TEXTO_DA_ESPERA_DA_COTA } from '../lib/whatsapp/regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!texto.includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }
const naoContem = (texto: string, trecho: string, caso: string) => { if (texto.includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  com "${trecho}" em ${JSON.stringify(texto)}`) } }

// ------------------------------------------------------------------ o pedido conferido

const SETORES = ['Comunicação Social', 'Voluntariado', 'Tecnologia da Informação']
const LIGADOS: CanaisLigados = { whatsapp: true, email: true }
const pedido = (m: Partial<PedidoDeCadastro> = {}): PedidoDeCadastro => ({ nome: 'Ana Paula Lima', email: 'Ana.Lima@Exemplo.org', whatsapp: '(21) 98765-4321', papel: 'colaborador', coordenacao: 'Voluntariado', cargo: '  Assistente  ', ...m })
const erro = (p: PedidoDeCadastro, canais: CanaisLigados = LIGADOS, semAdmin = false) => {
  const r = conferirCadastro(p, { setores: SETORES, canais, semAdmin })
  return r.ok ? null : r.erro
}
const ok = conferirCadastro(pedido(), { setores: SETORES, canais: LIGADOS })
igual(ok.ok ? ok.cadastro : null, {
  nome: 'Ana Paula Lima', email: 'ana.lima@exemplo.org', numero: '5521987654321', numeroDoConvite: '5521987654321', papel: 'colaborador', coordenacao: 'Voluntariado',
  cargo: 'Assistente', fichaId: null, criarFicha: false, pedirFicha: false,
}, 'pedido certo: e-mail em minúsculas, número canônico, cargo aparado')
igual(erro(pedido({ nome: 'Ana' })), 'informe nome e sobrenome', 'nome sem sobrenome')
igual(erro(pedido({ nome: '  Ana    Lima  ' })), null, 'espaços sobrando no nome passam')
igual(conferirCadastro(pedido({ nome: '  Ana    Lima  ' }), { setores: SETORES, canais: LIGADOS }).ok && (conferirCadastro(pedido({ nome: '  Ana    Lima  ' }), { setores: SETORES, canais: LIGADOS }) as { cadastro: CadastroConferido }).cadastro.nome, 'Ana Lima', 'o nome sai com um espaço só')
igual(erro(pedido({ nome: `Ana ${'x'.repeat(120)}` })), 'informe nome e sobrenome', 'nome comprido demais')
igual(erro(pedido({ email: 'ana@' })), 'e-mail inválido', 'e-mail sem domínio')
igual(erro(pedido({ email: 'ana.lima@usuarios.cvrj.local' })), 'e-mail inválido', 'o e-mail interno de login não serve')
igual(erro(pedido({ whatsapp: '1234' })), 'WhatsApp inválido (use DDD e número)', 'telefone curto')
igual(erro(pedido({ whatsapp: '(00) 98765-4321' })), 'WhatsApp inválido (use DDD e número)', 'DDD que não existe')
igual(erro(pedido({ email: '', whatsapp: '' })), 'informe o e-mail ou o WhatsApp', 'nenhum canal')
igual(erro(pedido({ email: '   ', whatsapp: '  ' })), 'informe o e-mail ou o WhatsApp', 'nenhum canal (só espaços)')
igual(erro(pedido({ email: '' }), { whatsapp: false, email: true }), 'o WhatsApp do Palácio não está ligado: informe o e-mail', 'só WhatsApp, com o WhatsApp do Palácio desligado')
igual(erro(pedido({ whatsapp: '' }), { whatsapp: true, email: false }), 'o envio de e-mail não está configurado: informe o WhatsApp', 'só e-mail, sem o envio de e-mail')
igual(erro(pedido({ whatsapp: '' }), { whatsapp: false, email: false }), 'nem o e-mail nem o WhatsApp do Palácio estão ligados', 'nada ligado')
igual(erro(pedido({ email: '' }), { whatsapp: true, email: false }), null, 'só WhatsApp, com ele ligado: passa')
const semZap = conferirCadastro(pedido(), { setores: SETORES, canais: { whatsapp: false, email: true } })
igual(semZap.ok ? [semZap.cadastro.numero, semZap.cadastro.numeroDoConvite] : null, ['5521987654321', null], 'WhatsApp do Palácio desligado: o número vai para a ficha, o convite não sai por ele')
igual(erro(pedido({ papel: 'dono' })), 'papel inválido', 'papel fora da lista')
igual(erro(pedido({ papel: 'admin' })), null, 'administrador pela tela: vale')
igual(erro(pedido({ papel: 'admin' }), LIGADOS, true), ERRO_DO_ADMIN, 'administrador pelo WhatsApp: recusado')
igual(erro(pedido({ papel: 'editor' }), LIGADOS, true), null, 'editor pelo WhatsApp: vale')
igual(erro(pedido({ coordenacao: 'Diretoria Paralela' })), 'escolha um setor da lista', 'coordenação fora da lista')
igual(erro(pedido({ coordenacao: '' })), null, 'sem coordenação: vale')
igual(erro(pedido({ nome: 'Ana', email: 'x' })), 'informe nome e sobrenome', 'a ordem das conferências é a de sempre (o nome primeiro)')
igual(erro(pedido({ email: 'x', whatsapp: '1' })), 'e-mail inválido', 'o e-mail antes do WhatsApp')
igual(erro(pedido({ email: '', whatsapp: '', papel: 'dono' })), 'informe o e-mail ou o WhatsApp', 'o canal antes do papel')
const comprido = conferirCadastro(pedido({ cargo: 'c'.repeat(200) }), { setores: SETORES, canais: LIGADOS })
igual(comprido.ok ? comprido.cadastro.cargo.length : 0, 120, 'cargo cortado em 120')
const FICHA = '00000000-0000-4000-8000-0000000000f1'
const comFicha = conferirCadastro(pedido({ fichaId: FICHA, criarFicha: true, pedirFicha: true }), { setores: SETORES, canais: LIGADOS })
igual(comFicha.ok ? [comFicha.cadastro.fichaId, comFicha.cadastro.criarFicha, comFicha.cadastro.pedirFicha] : null, [FICHA, false, true], 'com ficha: liga a que existe, não cria outra')
const fichaTorta = conferirCadastro(pedido({ fichaId: 'nao-e-uuid', criarFicha: true }), { setores: SETORES, canais: LIGADOS })
igual(fichaTorta.ok ? [fichaTorta.cadastro.fichaId, fichaTorta.cadastro.criarFicha] : null, [null, true], 'ficha num formato que não é id: ignorada (cria, se pedido)')
const falhou = conferirCadastro(pedido({ nome: '  Só  ' }), { setores: SETORES, canais: LIGADOS })
igual(falhou.ok ? null : falhou.nome, 'Só', 'na falha, o nome volta limpo para a linha da tela')

// ------------------------------------------------------------------ usuário e papel

igual(problemaDoUsuario('ana.lima'), null, 'usuário no formato')
igual(problemaDoUsuario('Ana'), 'O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.', 'usuário com maiúscula')
igual(problemaDoUsuario('ab'), problemaDoUsuario('Ana'), 'usuário curto')
igual(USUARIO_VALIDO.test('a'.repeat(41)), false, 'usuário de 41 letras')
igual(baseDoUsuario('Éder Hipólito'), 'eder.hipolito', 'base: nome.sobrenome sem acento')
igual(baseDoUsuario('Maria da Silva Souza'), 'maria.souza', 'base: primeiro e último nome')
igual(baseDoUsuario('!!!'), 'pessoa', 'base sem letras: "pessoa"')
igual(baseDoUsuario(`${'a'.repeat(30)} ${'b'.repeat(30)}`).length, 36, 'base com folga para o número (36)')
igual(usuarioLivreEntre('ana.lima', new Set()), 'ana.lima', 'livre: a base')
igual(usuarioLivreEntre('ana.lima', new Set(['ana.lima', 'ana.lima2'])), 'ana.lima3', 'ocupada: o próximo número')
igual(usuarioLivreEntre('li', new Set()), 'li2', 'base curta: ganha o número')
igual(usuarioLivreEntre('x.y', new Set(['x.y', ...Array.from({ length: 98 }, (_, i) => `x.y${i + 2}`)])), null, 'nenhum livre até 99')
igual(papelSugerido('Comunicação Social'), 'editor', 'papel sugerido pelo setor')
igual(papelSugerido('Tecnologia da Informação'), 'admin', 'TI sugere administrador na tela')
igual(papelSugerido('Tecnologia da Informação', { semAdmin: true }), 'colaborador', 'pelo WhatsApp, o setor que sugere administrador cai em colaborador')
igual(papelSugerido('Setor Novo'), 'colaborador', 'setor fora da lista: colaborador')
igual(papelSugerido(''), 'colaborador', 'sem setor: colaborador')
igual(campoDoEmailNaFicha(`ana${DOMINIO_DA_INSTITUICAO}`), 'email_trabalho', 'e-mail da instituição vai para o de trabalho')
igual(campoDoEmailNaFicha('ana@gmail.com'), 'email_pessoal', 'o resto, para o pessoal')
igual(rotuloDaCoordenacao(''), 'Sem coordenação', 'coordenação vazia')

// ------------------------------------------------------------------ o convite e a linha da tela (os textos de sempre)

const ZAP = '5521987654321'
const EMAIL = 'ana.lima@exemplo.org'
const so = (m: Partial<EnvioDoConvite>): EnvioDoConvite => ({ email: false, whatsapp: null, ...m })
igual(saiu(so({ email: true })), true, 'saiu por e-mail')
igual(saiu(so({ whatsapp: 'na_fila' })), true, 'na fila conta como saído (sai sozinho)')
igual(saiu(so({ whatsapp: 'falhou' })), false, 'falhou: não saiu')
igual(comoSaiu(so({ email: true, whatsapp: 'enviada' }), EMAIL, ZAP), 'por e-mail (ana.lima@exemplo.org) e pelo WhatsApp (+55 (21) 98765-4321)', 'como saiu: os dois')
igual(comoSaiu(so({ whatsapp: 'na_fila' }), null, ZAP), 'pelo WhatsApp (+55 (21) 98765-4321, assim que a fila andar; de 22h às 7h, de manhã)', 'como saiu: na fila')
igual(comoSaiu(so({ whatsapp: 'na_fila', pelaCota: true }), null, ZAP), `pelo WhatsApp (+55 (21) 98765-4321, ${TEXTO_DA_ESPERA_DA_COTA}; o link de senha conta as horas desde agora)`, 'como saiu: pela cota')
igual(modoDoConvite(EMAIL, ZAP), 'convite_por_email_e_whatsapp', 'auditoria: os dois')
igual(modoDoConvite(null, ZAP), 'convite_por_whatsapp', 'auditoria: só WhatsApp')
igual(modoDoConvite(EMAIL, null), 'convite_por_email', 'auditoria: só e-mail')
igual(mensagemDoCadastro({ envio: so({ email: true }), email: EMAIL, numeroDoConvite: null, usuario: 'ana.lima', sobreAFicha: 'ficha do RH criada' }),
  'convite enviado por e-mail (ana.lima@exemplo.org) (usuário @ana.lima); ficha do RH criada', 'linha da tela: saiu')
igual(mensagemDoCadastro({ envio: so({ whatsapp: 'falhou', erroDoWhatsapp: 'Número sem WhatsApp.' }), email: null, numeroDoConvite: ZAP, usuario: 'ana.lima', sobreAFicha: '' }),
  'conta @ana.lima criada, mas o convite não saiu (Número sem WhatsApp.): use "Reenviar"', 'linha da tela: não saiu')

// ------------------------------------------------------------------ o que vai ao WhatsApp e ao sino: mascarado

igual(mascararEmail('ana.lima@exemplo.org'), 'a•••a@exemplo.org', 'e-mail mascarado')
igual(mascararEmail('ab@x.org'), 'a•••@x.org', 'e-mail curto mascarado')
igual(mascararEmail('sem-arroba'), '—', 'sem arroba')
igual(mascararEmail(null), '—', 'sem e-mail')
igual(comoSaiuMascarado(so({ email: true, whatsapp: 'enviada' }), EMAIL, ZAP), ['convite por e-mail (a•••a@exemplo.org)', 'convite pelo WhatsApp (+55 21 9••••-4321)'], 'mascarado: os dois')
igual(comoSaiuMascarado(so({ whatsapp: 'na_fila', pelaCota: true }), null, ZAP), [`convite pelo WhatsApp (+55 21 9••••-4321) na fila: sai ${TEXTO_DA_ESPERA_DA_COTA}`], 'mascarado: na fila pela cota')
igual(comoSaiuMascarado(so({}), EMAIL, null), ['o e-mail (a•••a@exemplo.org) não saiu'], 'mascarado: o e-mail que não saiu')
const resultado = textoDoResultadoDoCadastro({ nome: 'Ana Paula Lima', usuario: 'ana.lima', envio: so({ email: true, whatsapp: 'enviada' }), email: EMAIL, numeroDoConvite: ZAP, sobreAFicha: 'ficha do RH criada' })
contem(resultado, 'Conta de *Ana Paula Lima* criada, usuário *@ana.lima*; convite por e-mail (a•••a@exemplo.org); convite pelo WhatsApp (+55 21 9••••-4321).', 'resultado: a conta, o usuário e os canais')
contem(resultado, 'Ficha do RH: ficha do RH criada.', 'resultado: a ficha')
naoContem(resultado, EMAIL, 'resultado: nunca o e-mail inteiro')
naoContem(resultado, '98765-4321', 'resultado: nunca o número inteiro')
naoContem(resultado, 'NÃO saiu', 'resultado que saiu não fala em falha')
naoContem(resultado, 'cadastre o e-mail', 'com e-mail, nada de recomendar o e-mail')
const soZapNaFila = textoDoResultadoDoCadastro({ nome: 'Ana Paula Lima', usuario: 'ana.lima', envio: so({ whatsapp: 'na_fila' }), email: null, numeroDoConvite: ZAP, sobreAFicha: '' })
contem(soZapNaFila, 'na fila: sai assim que a fila andar', 'resultado: o WhatsApp na fila, dito como está')
contem(soZapNaFila, 'Sem e-mail, o convite depende só do WhatsApp', 'sem e-mail e sem o WhatsApp entregue: recomenda o e-mail')
contem(soZapNaFila, '“Enviar convite de primeiro acesso”', 'a recomendação aponta o botão que manda pelo e-mail')
naoContem(soZapNaFila, 'Ficha do RH', 'sem nada da ficha, sem a linha')
const naoSaiu = textoDoResultadoDoCadastro({ nome: 'Ana *Lima*', usuario: 'ana.lima', envio: so({ whatsapp: 'falhou', erroDoWhatsapp: 'Fora da janela de 24 h.' }), email: null, numeroDoConvite: ZAP, sobreAFicha: '' })
contem(naoSaiu, 'o WhatsApp (+55 21 9••••-4321) não saiu (Fora da janela de 24 h.)', 'resultado: o WhatsApp que falhou, com o motivo')
contem(naoSaiu, 'O convite NÃO saiu: use “Reenviar”', 'resultado: o convite que não saiu e o que fazer')
contem(naoSaiu, 'Conta de *Ana Lima* criada', 'resultado: o nome sem a marcação do WhatsApp')
const linhas = linhasDoCadastro({ ...(ok.ok ? ok.cadastro : ({} as CadastroConferido)), coordenacao: '', cargo: '', criarFicha: true, pedirFicha: true, usuario: 'ana.lima' })
igual(linhas.map((l) => `${l.rotulo}: ${l.valor}`), [
  'Nome: Ana Paula Lima', 'Usuário: @ana.lima', 'E-mail: a•••a@exemplo.org', 'WhatsApp: +55 21 9••••-4321', 'Coordenação: Sem coordenação', 'Cargo: —', 'Papel: Colaborador',
  'Ficha do RH: criada junto', 'Completar a ficha: pedido na mesma mensagem do WhatsApp',
], 'resumo: contato mascarado, sem coordenação, a ficha e o pedido')
const linhasSemZap = linhasDoCadastro({ ...(semZap.ok ? semZap.cadastro : ({} as CadastroConferido)), pedirFicha: true, criarFicha: true, usuario: 'ana.lima' })
igual(linhasSemZap.find((l) => l.rotulo === 'Completar a ficha')?.valor, 'não', 'resumo: sem o convite pelo WhatsApp, o pedido da ficha não vai')
naoContem(JSON.stringify(linhas), EMAIL, 'resumo: nunca o e-mail inteiro')

// ------------------------------------------------------------------ o código

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), 'utf8')
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*import\s+(?!type\s)[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
igual(importsDe(ler('lib/contas/cadastro-regras.ts')).filter((i) => i === 'server-only' || i.includes('supabase') || i.startsWith('node:') || i.startsWith('next/')), [], 'código: as regras do cadastro são puras')
contem(ler('lib/contas/cadastro.ts'), "import 'server-only'", 'código: o núcleo é só do servidor')
const usuarios = ler('app/actions/usuarios.ts')
contem(usuarios, 'await cadastrar(admin, supabase, ambiente, c)', 'código: "Adicionar pessoas" passa pelo núcleo')
for (const fora of ['async function criarConta', 'async function mandarConvite', 'async function usuarioLivre', 'salvar_membro_equipe', 'criarConviteDaFicha']) {
  naoContem(usuarios, fora, `código: ${fora} saiu de app/actions/usuarios.ts (mora no núcleo)`)
}
const migracao = ler('supabase/migrations/20261019050000_cvrj_whatsapp_cadastro_colaborador.sql')
contem(migracao, `- ${CHAVES_DE_CONTATO.map((c) => `'${c}'`).join(' - ')}`, 'migração: tira do banco as mesmas chaves de contato das regras')
contem(migracao, "v_novos text[] := array['cadastrar_colaborador']", 'migração: o tipo e a ação novos')
contem(migracao, 'cardinality(c.conkey) = 1', 'migração: lê só a restrição de uma coluna (a do plano também cita acao)')
naoContem(migracao.toLowerCase(), 'drop policy', 'migração: sem drop policy')
contem(ler('supabase/tests/whatsapp-cadastro-colaborador.test.sql'), 'o segundo clique não acha o link', 'teste do banco: o uso único do link')

// ------------------------------------------------------------------ o núcleo, contra um banco de mentira (sem rede)

// lib/contas/cadastro.ts começa com import 'server-only', que só existe dentro do Next: aqui vira um arquivo vazio.
const vazio = join(tmpdir(), 'server-only-vazio.js')
writeFileSync(vazio, '')
const M = Module as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string }
const resolver = M._resolveFilename
M._resolveFilename = function (pedidoDoModulo: string, ...resto: unknown[]) { return pedidoDoModulo === 'server-only' ? vazio : resolver.call(this, pedidoDoModulo, ...resto) }
// Nada aqui sai para a rede: sem chave de e-mail (o convite por e-mail "não sai"), e qualquer fetch falha alto.
for (const v of ['RESEND_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']) delete process.env[v]
globalThis.fetch = (async () => { throw new Error('rede proibida neste teste') }) as typeof fetch

type Consulta = { tabela: string; op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'; valores?: unknown; filtros: [string, string, unknown][] }
type Resposta = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number }

/** O mínimo do cliente do Supabase que o núcleo usa: cada consulta é registrada e respondida por `responder`. */
function clienteDeMentira(responder: (c: Consulta) => Resposta, extra: Record<string, unknown> = {}) {
  const consultas: Consulta[] = []
  const rpcs: { nome: string; args: Record<string, unknown> }[] = []
  const from = (tabela: string) => {
    const c: Consulta = { tabela, op: 'select', filtros: [] }
    const fim = () => { consultas.push(c); return Promise.resolve({ data: null, error: null, ...responder(c) }) }
    const q: Record<string, unknown> = {
      select: () => q, order: () => q, limit: () => q,
      insert: (v: unknown) => { c.op = 'insert'; c.valores = v; return q },
      update: (v: unknown) => { c.op = 'update'; c.valores = v; return q },
      upsert: (v: unknown) => { c.op = 'upsert'; c.valores = v; return q },
      delete: () => { c.op = 'delete'; return q },
      eq: (k: string, v: unknown) => { c.filtros.push(['eq', k, v]); return q },
      neq: (k: string, v: unknown) => { c.filtros.push(['neq', k, v]); return q },
      like: (k: string, v: unknown) => { c.filtros.push(['like', k, v]); return q },
      is: (k: string, v: unknown) => { c.filtros.push(['is', k, v]); return q },
      in: (k: string, v: unknown) => { c.filtros.push(['in', k, v]); return q },
      maybeSingle: fim, single: fim,
      then: (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => fim().then(ok, falha),
    }
    return q
  }
  const rpc = async (nome: string, args: Record<string, unknown>) => { rpcs.push({ nome, args }); return { data: null, error: null, ...responder({ tabela: `rpc:${nome}`, op: 'select', valores: args, filtros: [] }) } }
  return { cliente: { from, rpc, ...extra }, consultas, rpcs }
}

const filtro = (c: Consulta, k: string, op = 'eq') => c.filtros.find((f) => f[0] === op && f[1] === k)?.[2]

async function nucleo() {
  const { cadastrar } = await import('../lib/contas/cadastro')
  const WS = '00000000-0000-4000-8000-000000000001'
  const ADMIN = '00000000-0000-4000-8000-0000000000a1'
  const NOVO = '00000000-0000-4000-8000-0000000000c1'
  const NOVA_FICHA = '00000000-0000-4000-8000-0000000000f2'
  const ambiente = (canais: CanaisLigados = { whatsapp: false, email: true }) => ({ workspaceId: WS, adminId: ADMIN, convidadoPor: 'Quem Cadastra', setores: SETORES, canais, reservados: new Set<string>() })

  /** Um espaço de mentira: `usados` são os usuários que já existem; `emails`, os e-mails em uso; `vinculoFalha`, o RLS recusando. */
  function espaco(o: { usados?: string[]; emails?: string[]; vinculoFalha?: boolean; ficha?: { id: string; user_id: string | null } | null; rhFalha?: boolean } = {}) {
    const apagados: string[] = []
    const criados: Record<string, unknown>[] = []
    const auth = { admin: {
      createUser: async (d: Record<string, unknown>) => { criados.push(d); return { data: { user: { id: NOVO } }, error: null } },
      deleteUser: async (id: string) => { apagados.push(id); return { data: null, error: null } },
    } }
    const admin = clienteDeMentira((c) => {
      if (c.tabela === 'profiles' && c.op === 'select' && filtro(c, 'username') !== undefined) return { data: (o.usados ?? []).includes(String(filtro(c, 'username'))) ? { id: 'x' } : null }
      if (c.tabela === 'profiles' && c.op === 'select' && filtro(c, 'email') !== undefined) return { data: (o.emails ?? []).includes(String(filtro(c, 'email'))) ? { id: 'y' } : null }
      if (c.tabela === 'profiles' && c.op === 'select') return { data: (o.usados ?? []).map((username) => ({ username })) }
      if (c.tabela === 'setores') return { data: [{ id: 's1', nome: 'Voluntariado' }] }
      if (c.tabela === 'equipe_membros') return { data: o.ficha ?? null }
      if (c.tabela === 'equipe_pessoais') return { data: { telefone_pessoal: '' } }
      return {}
    }, { auth })
    const sessao = clienteDeMentira((c) => {
      if (c.tabela === 'workspace_members' && o.vinculoFalha) return { error: { code: '42501', message: 'RLS' } }
      if (c.tabela === 'rpc:salvar_membro_equipe') return o.rhFalha ? { error: { code: 'P0001', message: 'Setor inválido no RH.' } } : { data: NOVA_FICHA }
      return {}
    })
    return { admin, sessao, apagados, criados }
  }

  // 1) Só e-mail, sem a chave do Resend: a conta nasce em modo convite, a ficha é criada pela sessão, e a linha diz que o convite não saiu.
  {
    const e = espaco()
    const r = await cadastrar(e.admin.cliente as never, e.sessao.cliente as never, ambiente(), pedido({ whatsapp: '', criarFicha: true, pedirFicha: true }))
    igual([r.ok, r.nome, r.conta?.usuario, r.conta?.userId, r.conta?.fichaId], [false, 'Ana Paula Lima', 'ana.lima', NOVO, NOVA_FICHA], 'núcleo: conta criada, ficha criada')
    igual(r.mensagem, 'conta @ana.lima criada, mas o convite não saiu: use "Reenviar"; ficha do RH criada', 'núcleo: a linha de sempre quando o e-mail não sai')
    igual(e.criados[0]?.email, 'ana.lima@usuarios.cvrj.local', 'núcleo: o Auth com o e-mail interno do usuário')
    const perfil = e.admin.consultas.find((c) => c.tabela === 'profiles' && c.op === 'insert')?.valores as Record<string, unknown>
    igual([perfil?.username, perfil?.trocar_senha, perfil?.email, perfil?.job_title, perfil?.initials], ['ana.lima', false, 'ana.lima@exemplo.org', 'Assistente', 'AP'], 'núcleo: o perfil em modo convite (sem senha provisória)')
    const vinculo = e.sessao.consultas.find((c) => c.tabela === 'workspace_members')?.valores as Record<string, unknown>
    igual(vinculo, { workspace_id: WS, user_id: NOVO, role: 'colaborador', coordination: 'Voluntariado' }, 'núcleo: o vínculo vai pela sessão (o RLS confere o admin)')
    igual(e.admin.consultas.some((c) => c.tabela === 'workspace_members'), false, 'núcleo: o vínculo nunca pelo service role')
    igual(e.admin.consultas.some((c) => c.tabela === 'setor_membros' && c.op === 'upsert'), true, 'núcleo: o setor do Correio acompanha a coordenação')
    const rh = e.sessao.rpcs.find((x) => x.nome === 'salvar_membro_equipe')
    igual(rh?.args, { p_workspace_id: WS, p_id: null, p: { nome: 'Ana Paula Lima', cargo: 'Assistente', setor: 'Voluntariado', user_id: NOVO, vinculo: 'outro', email_pessoal: 'ana.lima@exemplo.org' } }, 'núcleo: a ficha nova pela função do RH, pela sessão')
    const token = e.admin.consultas.find((c) => c.tabela === 'tokens_de_conta' && c.op === 'insert')?.valores as Record<string, unknown>
    igual([token?.finalidade, token?.email, token?.criado_por], ['definir_senha', null, ADMIN], 'núcleo: o link de senha marcado como só e-mail')
    const auditoria = e.admin.consultas.find((c) => c.tabela === 'auditoria_de_acesso')?.valores as Record<string, unknown>
    igual(auditoria, {
      workspace_id: WS, ator_id: ADMIN, alvo_id: NOVO, acao: 'usuario_criado',
      detalhes: { usuario: 'ana.lima', papel: 'colaborador', coordenacao: 'Voluntariado', senha: 'convite_por_email', email_enviado: false, whatsapp: null, ficha: 'ficha do RH criada' },
    }, 'núcleo: a auditoria de sempre')
    naoContem(JSON.stringify(auditoria), 'exemplo.org', 'núcleo: a auditoria não leva o contato')
  }

  // 2) A ficha que já existe ganha o login; o usuário escolhido na confirmação vale; sem coordenação.
  {
    const e = espaco({ ficha: { id: FICHA, user_id: null } })
    const r = await cadastrar(e.admin.cliente as never, e.sessao.cliente as never, ambiente(), pedido({ whatsapp: '', coordenacao: '', fichaId: FICHA }), { usuario: ' Ana.P ' })
    igual([r.conta?.usuario, r.conta?.fichaId], ['ana.p', FICHA], 'núcleo: o usuário escolhido (minúsculo, aparado) e a ficha ligada')
    igual(e.sessao.rpcs[0]?.args, { p_workspace_id: WS, p_id: FICHA, p: { user_id: NOVO } }, 'núcleo: liga a ficha que existia, sem telefone novo (sem WhatsApp)')
    igual((e.sessao.consultas.find((c) => c.tabela === 'workspace_members')?.valores as Record<string, unknown>)?.coordination, null, 'núcleo: sem coordenação vira nulo no vínculo')
    contem(r.mensagem, 'ficha do RH ligada', 'núcleo: a linha diz que a ficha foi ligada')
  }

  // 3) A ficha já ligada a outro login não é tomada; o RH que recusa não desfaz a conta.
  {
    const e = espaco({ ficha: { id: FICHA, user_id: 'outro' } })
    const r = await cadastrar(e.admin.cliente as never, e.sessao.cliente as never, ambiente(), pedido({ whatsapp: '', fichaId: FICHA }))
    contem(r.mensagem, 'a ficha do RH já estava ligada a outro login: confira em Recursos humanos', 'núcleo: ficha de outro login fica como está')
    igual(e.sessao.rpcs.length, 0, 'núcleo: nada é gravado no RH')
    const f = espaco({ rhFalha: true })
    const r2 = await cadastrar(f.admin.cliente as never, f.sessao.cliente as never, ambiente(), pedido({ whatsapp: '', criarFicha: true }))
    igual([Boolean(r2.conta), f.apagados.length], [true, 0], 'núcleo: o RH que recusa não desfaz a conta')
    contem(r2.mensagem, 'a ficha do RH não saiu (Setor inválido no RH.): cadastre em Recursos humanos', 'núcleo: a linha diz o que faltou na ficha')
  }

  // 4) Usuário ocupado ganha número; o escolhido que já existe para; e-mail em uso para; o vínculo recusado desfaz a conta.
  {
    const e = espaco({ usados: ['ana.lima'] })
    const r = await cadastrar(e.admin.cliente as never, e.sessao.cliente as never, ambiente(), pedido({ whatsapp: '' }))
    igual(r.conta?.usuario, 'ana.lima2', 'núcleo: usuário ocupado ganha o número')
    const amb = ambiente()
    const a = espaco()
    await cadastrar(a.admin.cliente as never, a.sessao.cliente as never, amb, pedido({ whatsapp: '' }))
    const b = espaco()
    const r2 = await cadastrar(b.admin.cliente as never, b.sessao.cliente as never, amb, pedido({ whatsapp: '', email: 'outra@exemplo.org' }))
    igual(r2.conta?.usuario, 'ana.lima2', 'núcleo: dois de mesmo nome na mesma leva não disputam o usuário')
    const c = espaco({ usados: ['ana.p'] })
    const r3 = await cadastrar(c.admin.cliente as never, c.sessao.cliente as never, ambiente(), pedido({ whatsapp: '' }), { usuario: 'ana.p' })
    igual([r3.ok, r3.mensagem, Boolean(r3.conta), c.criados.length], [false, 'O usuário @ana.p já existe.', false, 0], 'núcleo: o usuário escolhido que já existe não cria nada')
    const d = espaco()
    const r4 = await cadastrar(d.admin.cliente as never, d.sessao.cliente as never, ambiente(), pedido({ whatsapp: '' }), { usuario: 'A' })
    igual([r4.ok, r4.mensagem, d.criados.length], [false, problemaDoUsuario('A'), 0], 'núcleo: o usuário escolhido fora do formato não cria nada')
    const f = espaco({ emails: ['ana.lima@exemplo.org'] })
    const r5 = await cadastrar(f.admin.cliente as never, f.sessao.cliente as never, ambiente(), pedido({ whatsapp: '' }))
    igual([r5.mensagem, f.criados.length], ['Este e-mail já está em uso por outra conta.', 0], 'núcleo: e-mail em uso não cria nada')
    const g = espaco({ vinculoFalha: true })
    const r6 = await cadastrar(g.admin.cliente as never, g.sessao.cliente as never, ambiente(), pedido({ whatsapp: '' }))
    igual([r6.ok, r6.mensagem, g.apagados], [false, 'Não foi possível vincular a pessoa ao espaço.', [NOVO]], 'núcleo: o vínculo recusado desfaz a conta no Auth')
  }

  // 5) O pedido que não passa nem chega ao banco; o administrador pelo WhatsApp é recusado aqui também.
  {
    const e = espaco()
    const r = await cadastrar(e.admin.cliente as never, e.sessao.cliente as never, ambiente(), pedido({ papel: 'admin', whatsapp: '' }), { semAdmin: true })
    igual([r.ok, r.mensagem, e.admin.consultas.length, e.criados.length], [false, ERRO_DO_ADMIN, 0, 0], 'núcleo: administrador pelo WhatsApp, nada criado')
    const r2 = await cadastrar(e.admin.cliente as never, e.sessao.cliente as never, ambiente(), pedido({ nome: '', whatsapp: '' }))
    igual([r2.nome, r2.mensagem], ['(sem nome)', 'informe nome e sobrenome'], 'núcleo: sem nome, a linha de sempre')
  }
}

nucleo().catch((causa) => { falhas++; console.log('FALHOU: o núcleo lançou', causa) }).finally(() => {
  if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
  console.log('Cadastro de contas: tudo certo.')
})
