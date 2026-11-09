/**
 * Confere o veredito do "Conferir envio" da Newsletter (lib/newsletter/diagnostico.ts), sem rede nem banco:
 *   npx tsx scripts/conferir-newsletter-diagnostico.ts
 *
 * O caso que motivou o módulo (09/11/2026): a chave do Resend em produção é do tipo "só de envio", o Resend recusa a
 * listagem de domínios com 401 "restricted_api_key", e o diagnóstico respondia que o domínio não estava verificado,
 * com o envio funcionando. A regra conferida aqui: o diagnóstico só afirma o que conferiu.
 */
import { recusaDeChaveSoDeEnvio, vereditoDoEnvio, type ListagemDeDominios } from '../lib/newsletter/diagnostico'

let falhas = 0
const ok = (cond: boolean, msg: string) => { if (!cond) { falhas++; console.error('✗', msg) } else console.log('✓', msg) }

const DOMINIO = 'noticias.cruzvermelhariodejaneiro.org'
const lista = (...dominios: [string, string][]): ListagemDeDominios => ({ tipo: 'lista', dominios: dominios.map(([nome, estado]) => ({ nome, estado })) })
const base = { configurado: true, dominioDoRemetente: DOMINIO, temRespostaPara: true, formularioDaHome: 'ligado', lista: { confirmados: 3, pendentes: 1 } }
const tudo = (v: { veredito: string; oQueFazer: string[] }) => [v.veredito, ...v.oQueFazer].join('\n')

// ---------------------------------------------------------------- a recusa da chave só de envio
// O corpo é o que o Resend devolveu em produção, em 09/11/2026, ao GET /domains.
ok(recusaDeChaveSoDeEnvio(401, { name: 'restricted_api_key', message: 'This API key is restricted to only send emails', statusCode: 401 }), '401 restricted_api_key: é a chave só de envio')
ok(recusaDeChaveSoDeEnvio(401, { message: 'This API key is restricted to only send emails' }), 'sem o nome, a mensagem do Resend ainda identifica a chave só de envio')
ok(!recusaDeChaveSoDeEnvio(401, { name: 'missing_api_key', message: 'Missing API key in the authorization header' }), '401 sem chave nenhuma não é "só de envio"')
ok(!recusaDeChaveSoDeEnvio(403, { name: 'invalid_api_key', message: 'API key is invalid' }) && !recusaDeChaveSoDeEnvio(403, { name: 'restricted_api_key' }), 'chave inválida (403) não é "só de envio", nem com o nome trocado')
ok(!recusaDeChaveSoDeEnvio(401, { name: 'outro_erro', message: 'This API key is restricted to only send emails' }), 'nome diferente manda mais que a mensagem')
ok([null, undefined, '', 'restricted_api_key', 42, []].every((corpo) => !recusaDeChaveSoDeEnvio(401, corpo)) && !recusaDeChaveSoDeEnvio(200, { name: 'restricted_api_key' }) && !recusaDeChaveSoDeEnvio(500, { name: 'restricted_api_key' }),
  'corpo vazio, texto solto ou outro status: não')

// ---------------------------------------------------------------- chave só de envio: não acusa o domínio
const soEnvio = vereditoDoEnvio({ ...base, listagem: { tipo: 'chave-so-de-envio' } })
ok(soEnvio.tom === 'neutro' && soEnvio.dominioVerificado === null, 'chave só de envio: tom neutro, e o domínio fica "não sei" (nem verificado, nem não verificado)')
ok(!/não está verificado|não está cadastrado|volta 403/.test(tudo(soEnvio)), 'e nenhuma frase diz que o domínio está com problema')
ok(soEnvio.veredito.includes('Envio configurado') && soEnvio.veredito.includes('só de envio') && soEnvio.veredito.includes('não consegue consultar'), 'o veredito diz que o envio está configurado, que a chave só envia e o que ela não deixa consultar')
ok(soEnvio.oQueFazer.some((f) => f.includes('Não é defeito') && f.includes('não precisa trocar a chave')) && soEnvio.oQueFazer.some((f) => f.includes('painel do Resend') && f.includes('Domains') && f.includes(DOMINIO)),
  'e explica que não é defeito, que não precisa trocar a chave e onde ver o domínio, pelo nome')
ok(!tudo(soEnvio).includes('Não deu para listar'), 'sem a frase de erro de listagem: a recusa da chave só de envio não é erro')

// ---------------------------------------------------------------- conferido e certo
const certo = vereditoDoEnvio({ ...base, listagem: lista(['info.cruzvermelhariodejaneiro.org', 'verified'], [DOMINIO, 'verified']) })
ok(certo.tom === 'ok' && certo.dominioVerificado === true && certo.veredito === `Envio pronto: chave válida, domínio "${DOMINIO}" verificado, 3 inscrito(s) confirmado(s).` && certo.oQueFazer.length === 0,
  'domínio na lista e verificado: "Envio pronto", com a contagem, e nada a fazer')
ok(vereditoDoEnvio({ ...base, lista: null, listagem: lista([DOMINIO, 'verified']) }).veredito === `Envio pronto: chave válida, domínio "${DOMINIO}" verificado.`, 'sem a contagem da lista, o mesmo veredito sem o número')

// ---------------------------------------------------------------- conferido e errado
const foraDaConta = vereditoDoEnvio({ ...base, listagem: lista(['info.cruzvermelhariodejaneiro.org', 'verified']) })
ok(foraDaConta.tom === 'atencao' && foraDaConta.dominioVerificado === false && foraDaConta.veredito.includes('ainda não está verificado') && foraDaConta.oQueFazer[0].includes('não está cadastrado no Resend'),
  'o Resend listou e o domínio não está lá: aí sim, "não está verificado" e "não está cadastrado"')
const pendente = vereditoDoEnvio({ ...base, listagem: lista([DOMINIO, 'pending']) })
ok(pendente.tom === 'atencao' && pendente.dominioVerificado === false && pendente.oQueFazer[0].includes('cadastrado como "pending"') && pendente.oQueFazer[0].includes('volta 403'),
  'cadastrado e ainda "pending": atenção, com o estado que o Resend informou')
ok(vereditoDoEnvio({ ...base, listagem: lista(['cruzvermelhariodejaneiro.org', 'verified']) }).dominioVerificado === false, 'a raiz verificada não vale pelo subdomínio: para o Resend são domínios diferentes')

// ---------------------------------------------------------------- não deu para conferir
const fora = vereditoDoEnvio({ ...base, listagem: { tipo: 'erro', mensagem: 'o Resend não respondeu a tempo.' } })
ok(fora.tom === 'atencao' && fora.dominioVerificado === null && !fora.veredito.includes('não está verificado') && fora.veredito.includes('Não deu para conferir'),
  'listagem que falhou: "não deu para conferir", e não "não está verificado"')
ok(fora.oQueFazer[0] === 'Não deu para listar os domínios do Resend: o Resend não respondeu a tempo.', 'com o motivo da falha logo abaixo')
ok(vereditoDoEnvio({ ...base, listagem: null }).dominioVerificado === null, 'listagem que nem foi feita: também "não sei"')

const semChave = vereditoDoEnvio({ ...base, configurado: false, listagem: null })
ok(semChave.veredito === 'Falta a chave do Resend.' && semChave.tom === 'atencao' && semChave.oQueFazer[0].startsWith('Cadastre RESEND_API_KEY'), 'sem chave: o veredito e a instrução de sempre')
ok(vereditoDoEnvio({ ...base, configurado: false, listagem: { tipo: 'chave-so-de-envio' } }).veredito === 'Falta a chave do Resend.', 'sem chave, o que veio na listagem não importa')

// ---------------------------------------------------------------- os outros avisos continuam
const comErro = vereditoDoEnvio({ ...base, listagem: { tipo: 'chave-so-de-envio' }, erroDaLista: 'tempo esgotado' })
ok(comErro.tom === 'atencao' && comErro.veredito === 'Veja oQueFazer.' && comErro.oQueFazer.includes('Não deu para contar a lista: tempo esgotado'), 'chave só de envio COM outro erro: atenção, e o erro aparece')
ok(vereditoDoEnvio({ ...base, listagem: lista([DOMINIO, 'verified']), erroDoEspaco: 'Há dois espaços de Produção.' }).tom === 'atencao', 'domínio verificado com erro no espaço: atenção')
const avisos = vereditoDoEnvio({ ...base, listagem: { tipo: 'chave-so-de-envio' }, temRespostaPara: false, formularioDaHome: 'DECORATIVO — o formulário existe na home mas não envia para lugar nenhum', lista: { confirmados: 0, pendentes: 4 } })
ok(avisos.oQueFazer.some((f) => f.includes('NEWSLETTER_RESPONDER_PARA')) && avisos.oQueFazer.some((f) => f.includes('decorativo')) && avisos.oQueFazer.some((f) => f.includes('4 inscrição(ões) pendente(s)')),
  'endereço de resposta, formulário decorativo e convites que não chegam continuam avisados')
ok(!vereditoDoEnvio({ ...base, listagem: { tipo: 'chave-so-de-envio' } }).oQueFazer.some((f) => f.includes('pendente')), 'com gente confirmada, pendente não é sinal de problema')

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
