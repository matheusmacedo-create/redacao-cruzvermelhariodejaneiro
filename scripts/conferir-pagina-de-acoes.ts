/**
 * Confere a página "Nossas ações" (/acoes/): a marca do pacote, a seleção e a página.
 *   npx tsx scripts/conferir-pagina-de-acoes.ts
 */
import {
  acoesDoSite, dataDaAcaoLegivel, diaValido, lerAcao, paginaDeAcoes, sugestaoDaPauta, validarAcao, type AcaoDoMestre,
} from '../lib/site/acoes'
import { gerarSitemap } from '../lib/site/sitemap'
import type { NoticiaDoIndice } from '../lib/site/indice-noticias'
import { validarImportacao } from '../lib/publicacao/importar-pacote'

let falhas = 0
function confere(nome: string, ok: boolean, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`)
}
const erroDe = (r: ReturnType<typeof validarAcao>) => ('erro' in r ? r.erro : '')

// 1. Datas: só dia que existe.
confere('2026-10-12 é um dia', diaValido('2026-10-12'))
confere('2026-02-31 não existe', !diaValido('2026-02-31'))
confere('2024-02-29 existe (bissexto)', diaValido('2024-02-29'))
confere('2026-02-29 não existe', !diaValido('2026-02-29'))
confere('12/10/2026 não é o formato', !diaValido('12/10/2026'))
confere('texto vazio não é dia', !diaValido(''))

// 2. O que a pessoa preenche.
const HOJE = '2026-11-21'
confere('sem data: pede o dia', /Informe o dia/.test(erroDe(validarAcao({ data: '', local: 'Centro' }, HOJE))))
confere('data impossível: recusa', /não existe/.test(erroDe(validarAcao({ data: '2026-02-31' }, HOJE))))
confere('amanhã: recusa (é histórico)', /futuro/.test(erroDe(validarAcao({ data: '2026-11-22' }, HOJE))))
confere('hoje: aceita', 'acao' in validarAcao({ data: HOJE }, HOJE))
confere('antes de 1908: recusa', /1908/.test(erroDe(validarAcao({ data: '1899-01-01' }, HOJE))))
const boa = validarAcao({ data: '2026-10-12', local: '  Praça   da Cruz Vermelha,\n Centro ' }, HOJE)
confere('local: espaços e quebras viram um espaço', 'acao' in boa && boa.acao.local === 'Praça da Cruz Vermelha, Centro')
const longa = validarAcao({ data: '2026-10-12', local: 'x'.repeat(500) }, HOJE)
confere('local: no máximo 120 caracteres', 'acao' in longa && longa.acao.local.length === 120)
confere('local em branco: aceita', 'acao' in validarAcao({ data: '2026-10-12', local: undefined }, HOJE))

// 3. A marca no mestre.
confere('mestre sem a chave: nulo', lerAcao({ corpo: 'x' }) === null)
confere('mestre nulo: nulo', lerAcao(null) === null)
confere('data quebrada no mestre: nulo', lerAcao({ acao: { data: '2026-13-01', local: 'x' } }) === null)
confere('acao que não é objeto: nulo', lerAcao({ acao: 'sim' }) === null)
confere('marca boa: lida', lerAcao({ acao: { data: '2026-10-12', local: 'Centro' } })?.local === 'Centro')
confere('marca sem local: local vazio', lerAcao({ acao: { data: '2026-10-12' } })?.local === '')

// 4. A sugestão da pauta.
confere('pauta de Ação: sugere dia e local', sugestaoDaPauta({ tags: ['Ação'], data_inicio: '2026-09-26', details: { local: 'Maré' } })?.local === 'Maré')
confere('pauta de Evento sem início: usa o prazo', sugestaoDaPauta({ tags: ['Evento'], data_inicio: null, due_date: '2026-09-30' })?.data === '2026-09-30')
confere('pauta de Material: não sugere', sugestaoDaPauta({ tags: ['Material'], data_inicio: '2026-09-26' }) === null)
confere('pauta de Ação sem data: não sugere', sugestaoDaPauta({ tags: ['Ação'] }) === null)
confere('sem pauta: não sugere', sugestaoDaPauta(null) === null)

// 5. A seleção: só matéria no ar com marca, na ordem em que a ação ACONTECEU.
const base = 'https://cruzvermelhariodejaneiro.org/noticias'
const noticia = (id: string, titulo: string, publicada: string, capa = true): NoticiaDoIndice & { id: string } => ({
  id, titulo, descricao: `Resumo de ${titulo}.`, url: `${base}/${id}/`, publicadaEm: new Date(publicada),
  ...(capa ? { capa: `${base}/${id}/foto.jpg`, capaLargura: 1600, capaAltura: 1200, capaVersoes: [{ largura: 480, url: `${base}/${id}/foto-480.webp` }] } : {}),
})
const noticias = [
  noticia('a', 'Mutirão de pintura na Maré', '2026-11-20'),
  noticia('b', 'Como montar um kit de emergência', '2026-11-19'),
  noticia('c', 'Apoio à corrida de rua <Centro> & arredores', '2026-11-18', false),
  noticia('d', 'Campanha do Agasalho 2025', '2026-11-17'),
  noticia('e', 'Aula de primeiros socorros na escola', '2026-11-16'),
]
const marcas = new Map<string, AcaoDoMestre>([
  ['a', { data: '2026-03-08', local: 'Maré, Rio de Janeiro' }],
  ['c', { data: '2026-10-12', local: '' }],
  ['d', { data: '2025-07-01', local: 'Sede, Centro' }],
  ['e', { data: '2026-10-12', local: 'Tijuca' }],
  ['z', { data: '2026-01-01', local: 'matéria que não está no ar' }],
])
const acoes = acoesDoSite(noticias, marcas)
confere('entram só as 4 marcadas e no ar', acoes.length === 4, String(acoes.length))
confere('matéria de serviço fica fora', !acoes.some((a) => a.url.endsWith('/b/')))
// c e e são do mesmo dia: desempata o título ("Apoio" antes de "Aula").
confere('ordem: a data da ação, não a da publicação', acoes.map((a) => a.url.slice(-2, -1)).join('') === 'cead', acoes.map((a) => a.url.slice(-2, -1)).join(''))
confere('a mesma matéria duas vezes entra uma só', acoesDoSite([...noticias, noticias[0]], marcas).length === 4)
confere('sem marca nenhuma: lista vazia', acoesDoSite(noticias, new Map()).length === 0)

// 6. A data na página.
confere('data por extenso', dataDaAcaoLegivel('2026-10-12') === '12 de outubro de 2026', dataDaAcaoLegivel('2026-10-12'))
confere('o dia 1º não vira o dia anterior (fuso)', dataDaAcaoLegivel('2026-01-01') === '1 de janeiro de 2026', dataDaAcaoLegivel('2026-01-01'))

// 7. A página.
const agora = new Date('2026-11-21T12:00:00Z')
const html = paginaDeAcoes(acoes, agora, '')
confere('um <h1>', (html.match(/<h1/g) ?? []).length === 1)
confere('canônica em /acoes/', html.includes('<link rel="canonical" href="https://cruzvermelhariodejaneiro.org/acoes/">'))
confere('com ação: indexável', html.includes('content="index, follow'))
confere('um cartão por ação', (html.match(/class="acao"/g) ?? []).length === 4)
confere('seções por ano, do mais novo ao mais antigo', html.indexOf('id="ano-2026"') > 0 && html.indexOf('id="ano-2026"') < html.indexOf('id="ano-2025"'))
confere('atalho dos anos quando há mais de um', html.includes('href="#ano-2025"'))
confere('conta as ações e o período', html.includes('4 ações registradas, de 2025 a 2026.'))
confere('singular no ano com uma ação', html.includes('<span>1 ação</span>'))
confere('título com < e & sai escapado', html.includes('Apoio à corrida de rua &lt;Centro&gt; &amp; arredores') && !html.includes('<Centro>'))
confere('ação sem foto: bloco no lugar da imagem', (html.match(/class="sem-foto"/g) ?? []).length === 1)
confere('ação sem local: sem linha de local vazia', (html.match(/class="onde"/g) ?? []).length === 3)
confere('só a primeira foto vem com prioridade', (html.match(/fetchpriority="high" decoding/g) ?? []).length === 1)
const miolo = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
confere('as demais fotos esperam a rolagem', (miolo.match(/loading="lazy"/g) ?? []).length === 2)
confere('fotos com as versões WebP', html.includes('foto-480.webp 480w'))
confere('fotos com largura e altura', html.includes('width="1600" height="1200"'))
confere('convite a empresas e a voluntários', html.includes('/empresas-e-orgaos-publicos/') && html.includes('/voluntariado/'))
confere('sem convite a doar no miolo', !html.slice(html.indexOf('<main'), html.indexOf('</main>')).includes('/doe/'))
const ld = JSON.parse(/<script type="application\/ld\+json">([^]*?)<\/script>/.exec(html)![1])
const colecao = ld['@graph'][0]
confere('JSON-LD: coleção com as 4 ações', colecao['@type'] === 'CollectionPage' && colecao.mainEntity.numberOfItems === 4)
confere('JSON-LD: trilha Início › Nossas ações', ld['@graph'][1].itemListElement[1].name === 'Nossas ações')

const vazia = paginaDeAcoes([], agora, '')
confere('sem ação: página sai com noindex', vazia.includes('content="noindex'))
confere('sem ação: aviso com o Instagram', vazia.includes('class="acoes-vazio"') && vazia.includes('instagram.com/cruzvermelhabrasileirarj'))
confere('sem ação: nenhuma seção de ano', !vazia.includes('class="acoes-ano"'))
const umAno = paginaDeAcoes(acoes.filter((a) => a.data.startsWith('2026')), agora, '')
confere('um ano só: sem atalho de anos', !umAno.includes('class="acoes-anos"') && umAno.includes('3 ações registradas em 2026.'))

// 8. O mapa: /acoes/ aparece uma vez.
const mapa = gerarSitemap([{ url: 'https://cruzvermelhariodejaneiro.org/acoes/' }, { url: 'https://cruzvermelhariodejaneiro.org/acoes/' }])
confere('sitemap: /acoes/ uma vez só', (mapa.match(/\/acoes\//g) ?? []).length === 1)

// 9. O arquivo de importação pode trazer a marca (é como as ações antigas entram).
const arquivo = (acao: unknown) => JSON.stringify({
  versao: 1, origem: 'livre', tituloInterno: 'Ação', mestre: { titulo: 'Mutirão na Maré', corpo: 'Texto.', ...(acao === undefined ? {} : { acao }) }, midias: [],
})
const importada = validarImportacao(arquivo({ data: '2026-03-08', local: ' Maré ' }))
confere('importação com a marca: aceita e limpa o local', importada.problemas.length === 0 && importada.pacote?.mestre.acao?.local === 'Maré', JSON.stringify(importada.problemas))
confere('importação sem a marca: segue como antes', validarImportacao(arquivo(undefined)).pacote?.mestre.acao === undefined && validarImportacao(arquivo(undefined)).problemas.length === 0)
confere('importação com data impossível: problema no campo', validarImportacao(arquivo({ data: '2026-02-31' })).problemas.some((p) => p.campo === 'mestre.acao.data'))
confere('importação com data no futuro: problema', validarImportacao(arquivo({ data: '2999-01-01' })).problemas.some((p) => p.campo === 'mestre.acao.data'))
confere('importação com acao que não é objeto: problema', validarImportacao(arquivo('sim')).problemas.some((p) => p.campo === 'mestre.acao'))
confere('importação com local longo demais: problema, sem cortar calado', validarImportacao(arquivo({ data: '2026-03-08', local: 'x'.repeat(121) })).problemas.some((p) => p.campo === 'mestre.acao.local'))

console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
