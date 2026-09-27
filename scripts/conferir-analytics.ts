/**
 * Confere o Google Analytics de Resultados: a chave da conta de serviço
 * (lib/google/conta-de-servico-regras.ts) e a leitura dos relatórios do GA4
 * (lib/analytics/relatorio.ts).
 * Rode com: npx tsx scripts/conferir-analytics.ts
 */
import { createVerify, generateKeyPairSync, createSign } from 'node:crypto'
import { contaDeServicoParaGuardar, lerContaDeServico } from '../lib/google/conta-de-servico-regras'
import {
  caminhoDaPagina, diasDoPeriodo, duracaoLegivel, intervalos, lerDadosDoSite, lerPeriodo, limparTitulo, pedidoDoLote, variacao, type RelatorioDoGA,
} from '../lib/analytics/relatorio'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`)
}

// A chave da conta de serviço, como o Google Cloud baixa (a chave privada com \n escapado no JSON)
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const email = 'palacio-analytics@cvrj-palacio.iam.gserviceaccount.com'
const arquivo = JSON.stringify({
  type: 'service_account', project_id: 'cvrj-palacio', private_key_id: 'abc123', private_key: pem, client_email: email,
  client_id: '1234567890', auth_uri: 'https://accounts.google.com/o/oauth2/auth', token_uri: 'https://oauth2.googleapis.com/token',
}, null, 2)

const lida = lerContaDeServico(arquivo)
confere('lê o arquivo inteiro', 'email' in lida ? lida.email : lida, email)
// Um campo de uma linha tira as quebras do arquivo colado; o JSON continua válido.
const semQuebras = lerContaDeServico(arquivo.replace(/\n/g, ''))
confere('aceita sem as quebras de linha', 'email' in semQuebras && semQuebras.chavePrivada === ('email' in lida ? lida.chavePrivada : ''), true)
if ('chavePrivada' in lida) {
  const assinatura = createSign('RSA-SHA256').update('cabecalho.corpo').sign(lida.chavePrivada, 'base64url')
  confere('a chave lida assina (RS256)', createVerify('RSA-SHA256').update('cabecalho.corpo').verify(publicKey, assinatura, 'base64url'), true)
}
// Chave com \n duplamente escapado (colada de uma variável de ambiente)
const escapada = lerContaDeServico(JSON.stringify({ type: 'service_account', client_email: email, private_key: pem.replace(/\n/g, '\\n') }))
confere('\\n escapado vira quebra de linha', 'chavePrivada' in escapada && escapada.chavePrivada.split('\n').length > 10, true)
confere('recusa texto que não é JSON', 'erro' in lerContaDeServico('AIzaSyChaveDeApiQualquer'), true)
confere('recusa outro tipo de credencial', 'erro' in lerContaDeServico(JSON.stringify({ type: 'authorized_user', client_email: email, private_key: pem })), true)
confere('recusa e-mail que não é de conta de serviço', 'erro' in lerContaDeServico(JSON.stringify({ type: 'service_account', client_email: 'fulano@gmail.com', private_key: pem })), true)
confere('recusa sem chave privada', 'erro' in lerContaDeServico(JSON.stringify({ type: 'service_account', client_email: email })), true)

const guardar = contaDeServicoParaGuardar(arquivo)
confere('o cofre guarda só tipo, e-mail e chave', typeof guardar === 'string' ? Object.keys(JSON.parse(guardar)) : guardar, ['type', 'client_email', 'private_key'])
confere('o que foi guardado se lê de novo', typeof guardar === 'string' && 'email' in lerContaDeServico(guardar), true)

// Períodos
confere('período padrão 28', lerPeriodo(undefined), 28)
confere('período 7', lerPeriodo('7'), 7)
confere('período inválido vira 28', lerPeriodo('365'), 28)
confere('intervalos de 28 dias', intervalos(28), {
  atual: { startDate: '28daysAgo', endDate: 'yesterday', name: 'atual' },
  anterior: { startDate: '56daysAgo', endDate: '29daysAgo', name: 'anterior' },
})
confere('o lote tem cinco relatórios (limite do batchRunReports)', pedidoDoLote(7).requests.length, 5)
confere('dias do período terminam ontem', diasDoPeriodo(7, '2026-03-02'), ['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01'])

// A resposta do GA4 no formato da tela
const rel = (dims: string[], mets: string[], linhas: (string | number)[][]): RelatorioDoGA => ({
  dimensionHeaders: dims.map((name) => ({ name })),
  metricHeaders: mets.map((name) => ({ name })),
  rows: linhas.map((l) => ({ dimensionValues: l.slice(0, dims.length).map((v) => ({ value: String(v) })), metricValues: l.slice(dims.length).map((v) => ({ value: String(v) })) })),
})
const lote = {
  reports: [
    // Com dois períodos, a API acrescenta a dimensão dateRange (e a ordem das linhas não é garantida).
    rel(['dateRange'], ['activeUsers', 'sessions', 'screenPageViews', 'userEngagementDuration', 'engagedSessions'], [
      ['anterior', 80, 100, 250, 4000, 50],
      ['atual', 100, 130, 300, 8300, 78],
    ]),
    rel(['date'], ['activeUsers', 'screenPageViews'], [['20260301', 20, 50], ['20260227', 10, 20]]),
    rel(['sessionDefaultChannelGroup'], ['sessions'], [['Organic Social', 90], ['Direct', 30], ['Canal Novo', 10]]),
    rel(['pagePath', 'pageTitle'], ['screenPageViews', 'activeUsers'], [['/', 'Cruz Vermelha Brasileira – RJ', 120, 70], ['/noticias/campanha-do-agasalho/', 'Campanha do agasalho | Cruz Vermelha Brasileira – RJ', 60, 40]]),
    rel(['deviceCategory'], ['activeUsers'], [['mobile', 75], ['desktop', 25]]),
  ],
}
const cidades = rel(['city'], ['activeUsers'], [['Rio de Janeiro', 60], ['(not set)', 9], ['Niterói', 12]])
const dados = lerDadosDoSite(7, lote, cidades, '2026-03-02')
confere('totais do período atual (pela dimensão dateRange)', dados.atual, { pessoas: 100, visitas: 130, paginas: 300, engajamentoPorPessoa: 83, visitasEngajadas: 78 })
confere('totais do período anterior', dados.anterior.pessoas, 80)
confere('série com um ponto por dia, zero nos dias sem visita', dados.serie.map((p) => p.pessoas), [0, 0, 0, 0, 10, 0, 20])
confere('canais em português, com fatia', dados.canais.map((c) => [c.nome, Math.round(c.fatia * 100)]), [['Redes sociais', 69], ['Direto (digitou ou favorito)', 23], ['Canal Novo', 8]])
confere('títulos sem o nome do site', dados.paginas.map((p) => p.titulo), ['Cruz Vermelha Brasileira – RJ', 'Campanha do agasalho'])
confere('aparelhos em português', dados.dispositivos.map((d) => d.nome), ['Celular', 'Computador'])
confere('cidades sem "(not set)"', dados.cidades.map((c) => c.nome), ['Rio de Janeiro', 'Niterói'])
confere('relatório vazio não quebra', lerDadosDoSite(28, {}, undefined, '2026-03-02').serie.length, 28)

// Formatação
confere('variação +25%', variacao(125, 100), 0.25)
confere('variação sem base', variacao(10, 0), null)
confere('duração 83 s', duracaoLegivel(83), '1 min 23 s')
confere('duração 45 s', duracaoLegivel(45), '45 s')
confere('duração 2 min', duracaoLegivel(120), '2 min')
confere('limpa título com hífen', limparTitulo('Doe sangue - Cruz Vermelha RJ'), 'Doe sangue')
confere('título "(not set)" vira vazio', limparTitulo('(not set)'), '')

// Casar o caminho do GA com o site_url das matérias
confere('site_url completo', caminhoDaPagina('https://cruzvermelhariodejaneiro.org/noticias/campanha-do-agasalho/'), '/noticias/campanha-do-agasalho/')
confere('sem barra no fim', caminhoDaPagina('/noticias/campanha-do-agasalho'), '/noticias/campanha-do-agasalho/')
confere('index.html', caminhoDaPagina('https://cruzvermelhariodejaneiro.org/noticias/x/index.html'), '/noticias/x/')
confere('ignora a consulta', caminhoDaPagina('/noticias/x/?utm_source=instagram'), '/noticias/x/')

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
