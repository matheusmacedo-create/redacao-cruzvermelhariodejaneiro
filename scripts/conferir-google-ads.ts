/**
 * Confere o Google Ads do Palácio: `npx tsx scripts/conferir-google-ads.ts`. Sem banco e sem rede: só o que é puro —
 * o plano da campanha do Ad Grants contra os limites do anúncio responsivo e as regras do programa, a montagem do
 * pedido único (ids temporários, tudo pausado, só pesquisa, teto de lance), as consultas, a leitura das respostas e das
 * falhas, e a escolha da conta. Por fim, o código e a migração: o módulo de regras é puro, o servidor é só do servidor,
 * conectar e desconectar conferem a permissão, a migração só acrescenta. Sai com código 1 se algo estiver errado.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ANUNCIOS_POR_GRUPO_MIN, API_DO_ADS, DESCRICAO_MAX, ESCOPOS_ADS, GRUPOS_MIN, LANCE_MAXIMO_MICROS, ORCAMENTO_DIARIO_MICROS, PLANOS_DO_GRANTS, TITULO_MAX, consultaDoLocal,
  contaEscolhida, idDaCampanha, idDaConta, idDaContaNoPainel, lerCampanhaCriada, lerContasAcessiveis, linkDaCampanha, motivoDaFalhaDoAds, operacoesDaCampanha,
  pedidoDeConsulta, pedidoDeMutacao, planoPorId, problemaDoLocal, problemasDoPlano, resumoDoPlano, type Plano,
} from '../lib/google/ads-regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
function contem(texto: string, trecho: string, caso: string) {
  if (!texto.includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  esperava encontrar ${JSON.stringify(trecho)}`) }
}
function verdade(valor: boolean, caso: string) {
  if (!valor) { falhas++; console.log(`FALHOU: ${caso}`) }
}

// ---------------------------------------------------------------- o plano

// Uma campanha por página, cada uma com US$ 5 por dia.
igual(PLANOS_DO_GRANTS.map((p) => p.id), ['guia-primeiros-socorros', 'guia-lei-lucas'], 'planos: um por guia')
igual(new Set(PLANOS_DO_GRANTS.map((p) => p.nome)).size, PLANOS_DO_GRANTS.length, 'planos: nomes de campanha diferentes (é pelo nome que a campanha é reconhecida)')
for (const pl of PLANOS_DO_GRANTS) {
  igual(problemasDoPlano(pl), [], `${pl.id}: passa na conferência inteira`)
  igual(pl.orcamentoDiarioMicros, 5_000_000, `${pl.id}: US$ 5 por dia`)
  verdade(pl.grupos.length >= GRUPOS_MIN, `${pl.id}: grupos suficientes para o Grants`)
  verdade(pl.grupos.every((g) => g.anuncios.length >= ANUNCIOS_POR_GRUPO_MIN), `${pl.id}: dois anúncios por grupo`)
  verdade(pl.sitelinks.length >= 2, `${pl.id}: ao menos dois sitelinks`)
  verdade(pl.lanceMaximoMicros <= LANCE_MAXIMO_MICROS, `${pl.id}: lance dentro do teto do Grants`)
  verdade(pl.destino.startsWith('https://cruzvermelhariodejaneiro.org/noticias/'), `${pl.id}: leva a um guia do site`)
  verdade(pl.grupos.every((g) => g.anuncios.every((a) => a.url === pl.destino)), `${pl.id}: todo anúncio leva à página da campanha`)
  verdade(![pl.destino, ...pl.sitelinks.map((s) => s.url)].some((u) => u.includes('matricula')), `${pl.id}: nada leva à página de matrícula`)
  igual(planoPorId(pl.id), pl, `${pl.id}: achado pelo id`)
}
igual(ORCAMENTO_DIARIO_MICROS, 5_000_000, 'orçamento padrão: US$ 5')
igual(planoPorId('nao-existe'), null, 'plano desconhecido: null')
const plano = PLANOS_DO_GRANTS[0]
verdade(['cachorro', 'gato', 'pdf'].every((n) => plano.negativas.includes(n)), 'primeiros socorros: pets e material de estudo ficam de fora')

// O que a conferência pega.
const quebrado: Plano = {
  ...plano,
  lanceMaximoMicros: 3_000_000,
  grupos: [
    { nome: 'Um', palavras: ['doação', 'primeiros socorros pdf'], anuncios: [{ url: 'http://x', titulos: ['a', 'b'], descricoes: ['c'], caminho2: 'x' }] },
  ],
  sitelinks: [{ texto: 'Um sitelink com texto comprido demais', descricao1: 'ok', descricao2: 'ok', url: 'https://x' }],
}
const problemas = problemasDoPlano(quebrado)
contem(problemas.join('\n'), 'teto do Ad Grants', 'conferência: lance acima do teto')
contem(problemas.join('\n'), `pelo menos ${GRUPOS_MIN} grupos`, 'conferência: poucos grupos')
contem(problemas.join('\n'), `pelo menos ${ANUNCIOS_POR_GRUPO_MIN} anúncios`, 'conferência: poucos anúncios')
contem(problemas.join('\n'), 'uma palavra só', 'conferência: palavra-chave de uma palavra')
contem(problemas.join('\n'), 'palavra negativa', 'conferência: palavra-chave que a negativa derruba')
contem(problemas.join('\n'), 'https://', 'conferência: URL sem https')
contem(problemas.join('\n'), 'menos de 3 títulos', 'conferência: poucos títulos')
contem(problemas.join('\n'), 'menos de 2 descrições', 'conferência: poucas descrições')
contem(problemas.join('\n'), 'caminho 2 sem o caminho 1', 'conferência: caminho 2 solto')
contem(problemas.join('\n'), 'texto com mais de', 'conferência: sitelink comprido')
contem(problemas.join('\n'), 'pelo menos 2 sitelinks', 'conferência: um sitelink só')
contem(problemas.join('\n'), 'fora da página da campanha', 'conferência: anúncio levando a outra página')
contem(problemasDoPlano({ ...plano, sitelinks: [] }).join('\n'), 'pelo menos 2 sitelinks', 'conferência: campanha sem sitelink')
const longo: Plano = { ...plano, grupos: plano.grupos.map((g) => ({ ...g, anuncios: g.anuncios.map((a) => ({ ...a, titulos: [...a.titulos.slice(0, 2), 'x'.repeat(TITULO_MAX + 1)], descricoes: [...a.descricoes.slice(0, 1), 'y'.repeat(DESCRICAO_MAX + 1)] })) })) }
contem(problemasDoPlano(longo).join('\n'), `máximo ${TITULO_MAX}`, 'conferência: título comprido')
contem(problemasDoPlano(longo).join('\n'), `máximo ${DESCRICAO_MAX}`, 'conferência: descrição comprida')
const comTelefone: Plano = { ...plano, grupos: plano.grupos.map((g, i) => (i ? g : { ...g, anuncios: g.anuncios.map((a, j) => (j ? a : { ...a, descricoes: [...a.descricoes, 'Ligue (21) 97036-0264 e saiba mais.'] })) })) }
contem(problemasDoPlano(comTelefone).join('\n'), 'telefone no texto', 'conferência: telefone no texto do anúncio')
const sitelinkRepetido: Plano = { ...plano, sitelinks: [{ ...plano.sitelinks[0], descricao1: plano.grupos[0].anuncios[0].titulos[1] }, ...plano.sitelinks.slice(1)] }
contem(problemasDoPlano(sitelinkRepetido).join('\n'), 'repete o texto de um anúncio', 'conferência: sitelink que repete título')
contem(problemasDoPlano({ ...plano, negativas: [...plano.negativas, 'PDF'] }).join('\n'), 'negativa repetida', 'conferência: negativa repetida')

// ---------------------------------------------------------------- o pedido

const alvos = { local: plano.local.constante }
igual(plano.local.constante, 'geoTargetConstants/1001655', 'local: a cidade do Rio (1001655), não a localidade 9198038')
const ops = operacoesDaCampanha({ customerId: '6304775709', plano, alvos })
const tipos = ops.map((o) => Object.keys(o)[0])
igual(tipos[0], 'campaignBudgetOperation', 'pedido: o orçamento vem primeiro')
igual(tipos[1], 'campaignOperation', 'pedido: a campanha vem logo depois')
const campanha = (ops[1].campaignOperation as { create: Record<string, unknown> }).create
igual(campanha.status, 'PAUSED', 'pedido: a campanha nasce pausada')
igual(campanha.advertisingChannelType, 'SEARCH', 'pedido: rede de pesquisa')
igual(campanha.networkSettings, { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false }, 'pedido: só a pesquisa do Google')
igual(campanha.targetSpend, { cpcBidCeilingMicros: String(LANCE_MAXIMO_MICROS) }, 'pedido: maximizar cliques com teto de US$ 2')
igual(campanha.campaignBudget, 'customers/6304775709/campaignBudgets/-1', 'pedido: a campanha aponta para o orçamento temporário')
igual(campanha.resourceName, 'customers/6304775709/campaigns/-2', 'pedido: id temporário da campanha')
contem(String(campanha.finalUrlSuffix), 'utm_campaign=grants-guia-primeiros-socorros', 'pedido: as UTMs no sufixo da URL')
const criterios = ops.filter((o) => 'campaignCriterionOperation' in o).map((o) => (o.campaignCriterionOperation as { create: Record<string, unknown> }).create)
igual(criterios[0], { campaign: 'customers/6304775709/campaigns/-2', location: { geoTargetConstant: alvos.local } }, 'pedido: a cidade')
verdade(!criterios.some((c) => 'language' in c), 'pedido: sem critério de idioma (recusado em campanha de pesquisa)')
// Agrupado por tipo, pai antes de filho: oito blocos contíguos, um por tipo.
const blocos = tipos.filter((t, i) => t !== tipos[i - 1])
igual(blocos, ['campaignBudgetOperation', 'campaignOperation', 'campaignCriterionOperation', 'assetOperation', 'campaignAssetOperation', 'adGroupOperation', 'adGroupCriterionOperation', 'adGroupAdOperation'], 'pedido: operações agrupadas por tipo, na ordem pai → filho')
const definidos = new Set<string>()
let referenciaAntes = false
for (const o of ops) {
  const c = (Object.values(o)[0] as { create: Record<string, unknown> }).create
  for (const v of Object.values(c)) if (typeof v === 'string' && /\/-\d+$/.test(v) && !definidos.has(v) && v !== c.resourceName) referenciaAntes = true
  if (typeof c.resourceName === 'string') definidos.add(c.resourceName)
}
verdade(!referenciaAntes, 'pedido: nenhum nome temporário usado antes de ser definido')
igual(criterios.filter((c) => c.negative === true).length, plano.negativas.length, 'pedido: uma negativa por palavra')
igual(ops.filter((o) => 'assetOperation' in o).length, plano.sitelinks.length, 'pedido: um asset por sitelink')
igual(ops.filter((o) => 'campaignAssetOperation' in o).length, plano.sitelinks.length, 'pedido: cada sitelink ligado à campanha')
igual(ops.filter((o) => 'adGroupOperation' in o).length, plano.grupos.length, 'pedido: um grupo por grupo do plano')
igual(ops.filter((o) => 'adGroupCriterionOperation' in o).length, resumoDoPlano(plano).palavras, 'pedido: uma palavra-chave por palavra do plano')
const anuncios = ops.filter((o) => 'adGroupAdOperation' in o).map((o) => (o.adGroupAdOperation as { create: Record<string, unknown> }).create)
igual(anuncios.length, resumoDoPlano(plano).anuncios, 'pedido: um anúncio por anúncio do plano')
verdade(anuncios.every((a) => a.status === 'PAUSED'), 'pedido: todo anúncio nasce pausado')
const primeiroAnuncio = anuncios[0].ad as { finalUrls: string[]; responsiveSearchAd: { headlines: { text: string }[]; path1?: string } }
igual(primeiroAnuncio.finalUrls, [plano.destino], 'pedido: a URL final do primeiro anúncio')
igual(primeiroAnuncio.responsiveSearchAd.headlines[0], { text: plano.grupos[0].anuncios[0].titulos[0] }, 'pedido: o primeiro título')
igual(primeiroAnuncio.responsiveSearchAd.path1, 'socorros', 'pedido: o caminho 1')
const orcamentoNoPedido = (ops[0].campaignBudgetOperation as { create: { amountMicros: string } }).create.amountMicros
igual(orcamentoNoPedido, '5000000', 'pedido: orçamento de US$ 5 por dia')
const grupos = ops.filter((o) => 'adGroupOperation' in o).map((o) => (o.adGroupOperation as { create: Record<string, unknown> }).create)
verdade(grupos.every((g) => g.status === 'PAUSED' && g.type === 'SEARCH_STANDARD' && g.campaign === 'customers/6304775709/campaigns/-2'), 'pedido: grupos pausados, de pesquisa, na campanha')
const temporarios = ops.flatMap((o) => { const c = (Object.values(o)[0] as { create: { resourceName?: string } }).create; return c.resourceName ? [c.resourceName] : [] })
igual(new Set(temporarios).size, temporarios.length, 'pedido: ids temporários únicos')
verdade(temporarios.every((t) => /\/-\d+$/.test(t)), 'pedido: ids temporários negativos')

const mutacao = pedidoDeMutacao('6304775709', ops, true)
igual(mutacao.url, `${API_DO_ADS}/customers/6304775709/googleAds:mutate`, 'pedido: o endereço do mutate')
igual(mutacao.corpo.validateOnly, true, 'pedido: validateOnly quando é só conferir')
igual(mutacao.corpo.partialFailure, false, 'pedido: ou tudo ou nada')
igual(pedidoDeMutacao('6304775709', ops, false).corpo.validateOnly, false, 'pedido: sem validateOnly na criação')
igual(pedidoDeConsulta('6304775709', 'SELECT customer.id FROM customer'), { url: `${API_DO_ADS}/customers/6304775709/googleAds:search`, corpo: { query: 'SELECT customer.id FROM customer' } }, 'pedido: a consulta')
contem(consultaDoLocal(plano.local), "geo_target_constant.resource_name = 'geoTargetConstants/1001655'", 'consulta: a constante fixa da cidade')
igual(problemaDoLocal(plano.local, { resourceName: 'geoTargetConstants/1001655', canonicalName: 'Rio de Janeiro,State of Rio de Janeiro,Brazil', status: 'ENABLED' }), null, 'local: a constante bate')
contem(String(problemaDoLocal(plano.local, { resourceName: 'geoTargetConstants/1001655', canonicalName: 'Ribeirao Pires,State of Sao Paulo,Brazil', status: 'ENABLED' })), 'confira o local', 'local: nome canônico diferente é recusado')
contem(String(problemaDoLocal(plano.local, { resourceName: 'geoTargetConstants/1001655', canonicalName: plano.local.canonico, status: 'REMOVAL_PLANNED' })), 'não está ativa', 'local: constante inativa é recusada')
contem(String(problemaDoLocal(plano.local, undefined)), 'não achou', 'local: sem resposta é recusado')
igual(ESCOPOS_ADS[0], 'https://www.googleapis.com/auth/adwords', 'escopo: o do Google Ads')
verdade(ESCOPOS_ADS.includes('openid'), 'escopo: openid, para saber a conta')

// ---------------------------------------------------------------- as respostas

igual(idDaConta('630-477-5709'), '6304775709', 'conta: com traços')
igual(idDaConta(' 6304775709 '), '6304775709', 'conta: com espaços')
igual(idDaConta('123'), null, 'conta: curta demais')
igual(idDaConta(undefined), null, 'conta: vazia')
igual(idDaContaNoPainel('6304775709'), '630-477-5709', 'conta: de volta com traços')
igual(lerContasAcessiveis({ resourceNames: ['customers/6304775709', 'customers/5552286564', 'lixo'] }), ['6304775709', '5552286564'], 'contas: a lista do Google')
igual(lerContasAcessiveis({}), [], 'contas: resposta vazia')
igual(contaEscolhida({ acessiveis: ['6304775709'], preferida: null }), '6304775709', 'escolha: a única')
igual(contaEscolhida({ acessiveis: ['6304775709', '5552286564'], preferida: '6304775709' }), '6304775709', 'escolha: a preferida, se alcançada')
igual(contaEscolhida({ acessiveis: ['6304775709', '5552286564'], preferida: null }), null, 'escolha: duas sem preferida — ninguém')
igual(contaEscolhida({ acessiveis: ['5552286564'], preferida: '6304775709' }), '5552286564', 'escolha: a preferida fora da lista não vale; sobra a única')
igual(lerCampanhaCriada({ mutateOperationResponses: [{ campaignBudgetResult: { resourceName: 'customers/1/campaignBudgets/2' } }, { campaignResult: { resourceName: 'customers/6304775709/campaigns/99' } }] }), 'customers/6304775709/campaigns/99', 'resposta: a campanha criada')
igual(lerCampanhaCriada({}), null, 'resposta: sem campanha')
igual(idDaCampanha('customers/6304775709/campaigns/99'), '99', 'resposta: o id da campanha')
contem(linkDaCampanha('6304775709', '99'), 'campaignId=99', 'link: a campanha no painel')

// ---------------------------------------------------------------- as falhas

const erroDaApi = (codigo: Record<string, string>, mensagem: string) => ({ error: { message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT', details: [{ errors: [{ errorCode: codigo, message: mensagem }] }] } })
igual(motivoDaFalhaDoAds(401, {}).motivo, 'reconectar', 'falha: 401 pede reconexão')
igual(motivoDaFalhaDoAds(403, erroDaApi({ authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' }, 'x')).motivo, 'acesso', 'falha: acesso do projeto')
contem(motivoDaFalhaDoAds(403, erroDaApi({ authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' }, 'x')).texto, 'Explorer', 'falha: aponta o nível Explorer')
igual(motivoDaFalhaDoAds(403, erroDaApi({ authorizationError: 'USER_PERMISSION_DENIED' }, 'sem acesso')).motivo, 'conta', 'falha: a conta não alcança')
const pedidoRecusado = motivoDaFalhaDoAds(400, erroDaApi({ adError: 'LINE_TOO_WIDE' }, 'Headline too long'))
igual(pedidoRecusado.motivo, 'pedido', 'falha: o pedido recusado')
contem(pedidoRecusado.texto, 'Headline too long (adError: LINE_TOO_WIDE)', 'falha: a mensagem e o código')
igual(motivoDaFalhaDoAds(503, {}).motivo, 'servico', 'falha: o Google fora do ar')
igual(motivoDaFalhaDoAds(0, {}).motivo, 'servico', 'falha: sem resposta')
igual(motivoDaFalhaDoAds(418, { error: { message: 'chá' } }), { motivo: 'outro', texto: 'O Google Ads recusou (418): chá' }, 'falha: outra')

// ---------------------------------------------------------------- o código e a migração

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), 'utf8')
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*import\s+(?!type\s)[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
igual(importsDe(ler('lib/google/ads-regras.ts')), [], 'código: ads-regras.ts é puro, sem import nenhum')
contem(ler('lib/google/ads.ts'), "import 'server-only'", 'código: o Ads é só do servidor')
contem(ler('app/api/google/conectar-ads/route.ts'), "requirePermissao('integracoes.configurar')", 'código: conectar o Ads exige quem configura as integrações')
contem(ler('app/api/google/conectar-ads/route.ts'), '{ somenteEstes: true }', 'código: a autorização do Ads não soma os escopos do Gmail')
contem(ler('app/api/google/conectar-ads/route.ts'), "`ads.${", 'código: o state começa com "ads."')
contem(ler('app/api/google/retorno/route.ts'), "estado.startsWith('ads.')", 'código: a volta reconhece o Ads')
for (const acao of ['escolherContaDoAds', 'validarCampanhaDoGrants', 'criarCampanhaDoGrants', 'desconectarGoogleAds']) {
  const corpo = ler('app/actions/google-ads.ts').split(`export async function ${acao}`)[1]?.split('export async function')[0] ?? ''
  contem(corpo, "requirePermissao('integracoes.configurar')", `código: ${acao} confere a permissão na action`)
}
contem(ler('lib/integracoes/chaves.ts'), "google_ads: { nome: 'Autorização do Google Ads', variavel: 'GOOGLE_ADS_REFRESH', painel: '', oculto: true }", 'código: a chave do Ads é oculta (fora da tela de Integrações)')
contem(ler('lib/integracoes/alertas-regras.ts'), "'google_ads'", 'código: o Ads alerta quando expira')
contem(ler('lib/integracoes/chaves.ts'), "google_ads_oauth: {", 'código: o Ads pode ter cliente OAuth próprio')
contem(ler('app/api/google/conectar-ads/route.ts'), 'await clienteDoAds(workspaceId)', 'código: a conexão do Ads começa com o cliente do Ads')
contem(ler('app/api/google/retorno/route.ts'), 'doAds ? await clienteDoAds(workspaceId) : undefined', 'código: a volta do Ads troca o código com o mesmo cliente')
contem(ler('lib/google/ads.ts'), 'cliente = await clienteDoAds(workspaceId)', 'código: a renovação do token usa o cliente do Ads')
contem(ler('components/admin/ads-google.tsx'), 'data-ajuda="configuracoes.google-ads"', 'código: o cartão tem a âncora da ajuda')
verdade(!/developer-token/i.test(ler('lib/google/ads.ts')), 'código: sem developer token (aposentado em 9/9/2026)')

const migracao = ler('supabase/migrations/20261022135046_cvrj_google_ads.sql')
contem(migracao, 'create table if not exists public.google_ads_conexao', 'migração: a tabela da conexão')
contem(migracao, 'enable row level security', 'migração: RLS ligada')
contem(migracao, 'force row level security', 'migração: RLS forçada')
contem(migracao, 'revoke all on table public.google_ads_conexao from anon', 'migração: nada para anon')
verdade(!/drop (table|policy|column)/i.test(migracao), 'migração: só acrescenta')
verdade(!/\bdrop\b/i.test(migracao), 'migração: nenhum drop')

if (falhas) { console.log(`\n${falhas} conferência(s) falharam.`); process.exit(1) }
console.log('Google Ads: tudo certo.')
