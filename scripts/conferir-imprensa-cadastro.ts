/**
 * Confere as regras puras do cadastro de imprensa, sem rede nem banco:
 * o vocabulário (lib/imprensa/vocabulario.ts), as listas e os avisos de envio
 * (lib/imprensa/listas.ts), as colunas novas da importação (lib/imprensa/importacao.ts) e as marcas da
 * ficha do contato (lib/imprensa/ficha.ts).
 * O lado do banco (gatilhos do veículo, listas, importação) está em supabase/tests/veiculos-e-listas.test.sql.
 *
 *   npx tsx scripts/conferir-imprensa-cadastro.ts
 */
import {
  baseLegalDaOrigem, chave, comoBaseLegal, comoCanal, comoRelevancia, comoTipoDeContato, comoTipoDeVeiculo, lerEditorias, lerPraca, limparNome,
  linkDeLigacao, linkDoWhatsApp, MAXIMO_DE_EDITORIAS, rotuloDoTipoDeVeiculo, tipoDeVeiculoDaPlanilha, TIPOS_DE_VEICULO,
} from '../lib/imprensa/vocabulario'
import {
  A_CLASSIFICAR, atendeAoCriterio, avisosDoEnvio, contatosDaLista, criterioEstaVazio, criterioVazio, lerCriterio, ordenarListas,
  pracaDoContato, resumoDoCriterio, SELECAO_LARGA, type ContatoParaFiltro, type VeiculoParaFiltro,
} from '../lib/imprensa/listas'
import { lerCsv, linhasParaContatos, mapearColunas } from '../lib/imprensa/importacao'
import { comoEntrou, marcasDoEnvio, resumoDaLeitura, type EnvioNaFicha } from '../lib/imprensa/ficha'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${ok ? '' : `\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`}`)
}

// ---------------------------------------------------------------- vocabulário

confere('chave: sem acento, sem caixa, um espaço só', chave('  Região   SERRANA '), 'regiao serrana')
confere('nome limpo: sem pontas nem espaço dobrado', limparNome('  O   Globo  '), 'O Globo')
confere('nome limpo: o corte não deixa espaço na ponta', limparNome(`${'a'.repeat(199)} bcd`), 'a'.repeat(199))
confere('nome limpo: quebra de linha vira espaço', limparNome('TV\nRio'), 'TV Rio')

confere('editorias: minúsculas e sem repetir', lerEditorias('Saúde, saude , CIDADES'), ['saúde', 'cidades'])
confere('editorias: a grafia da sugerida vale', lerEditorias('Politica; Educacao'), ['política', 'educação'])
confere('editorias: os separadores de planilha', lerEditorias('Saúde/Cidades|Geral\nCultura'), ['saúde', 'cidades', 'geral', 'cultura'])
confere('editorias: nomes que a planilha usa', lerEditorias('Cidade, Esporte, Mundo, Opinião, ONGs, Pauteiro'), ['cidades', 'esportes', 'internacional', 'colunas', 'terceiro setor', 'pauta'])
confere('editorias: a que não é sugerida entra como foi escrita', lerEditorias('Turismo  Religioso'), ['turismo religioso'])
confere('editorias: lista também serve', lerEditorias(['Saúde', 'Geral, Cidades']), ['saúde', 'geral', 'cidades'])
confere('editorias: vazio dá lista vazia', lerEditorias(' , ; '), [])
confere('editorias: no máximo doze', lerEditorias(Array.from({ length: 30 }, (_, i) => `tema ${i}`).join(',')).length, MAXIMO_DE_EDITORIAS)
confere('editorias: cada uma com 60 letras no máximo', lerEditorias('x'.repeat(80))[0].length, 60)

confere('praça: a grafia da sugerida vale', lerPraca('baixada fluminense'), 'Baixada Fluminense')
confere('praça: sem acento e sem parênteses também', lerPraca('RIO DE JANEIRO capital'), 'Rio de Janeiro (capital)')
confere('praça: apelido conhecido', lerPraca('Rio'), 'Rio de Janeiro (capital)')
confere('praça: Niterói sozinha entra na região', lerPraca('niteroi'), 'Niterói e São Gonçalo')
confere('praça: cidade fica como foi escrita', lerPraca('  Petrópolis '), 'Petrópolis')
confere('praça: vazia', lerPraca('   '), '')

confere('tipo da planilha: TV', tipoDeVeiculoDaPlanilha('Emissora de TV'), 'tv')
confere('tipo da planilha: televisão', tipoDeVeiculoDaPlanilha('Televisão'), 'tv')
confere('tipo da planilha: rádio FM', tipoDeVeiculoDaPlanilha('Rádio FM'), 'radio')
confere('tipo da planilha: rádio comunitária é comunitário', tipoDeVeiculoDaPlanilha('Rádio comunitária'), 'comunitario')
confere('tipo da planilha: jornal online é portal', tipoDeVeiculoDaPlanilha('Jornal online'), 'portal')
confere('tipo da planilha: jornal é impresso', tipoDeVeiculoDaPlanilha('Jornal'), 'impresso')
confere('tipo da planilha: revista', tipoDeVeiculoDaPlanilha('REVISTA'), 'impresso')
confere('tipo da planilha: blog', tipoDeVeiculoDaPlanilha('Blog'), 'portal')
confere('tipo da planilha: agência', tipoDeVeiculoDaPlanilha('Agência de notícias'), 'agencia')
confere('tipo da planilha: podcast', tipoDeVeiculoDaPlanilha('podcast'), 'podcast')
confere('tipo da planilha: prefeitura não é imprensa', tipoDeVeiculoDaPlanilha('Prefeitura'), 'organizacao')
confere('tipo da planilha: "radialista" não é rádio', tipoDeVeiculoDaPlanilha('Radialista'), '')
confere('tipo da planilha: o que não dá para saber fica a classificar', tipoDeVeiculoDaPlanilha('Jornalista'), '')
confere('tipo da planilha: vazio', tipoDeVeiculoDaPlanilha(''), '')
confere('todo tipo da planilha é um tipo do banco', ['tv', 'radio', 'impresso', 'portal', 'agencia', 'podcast', 'comunitario', 'outro', 'organizacao']
  .every((t) => TIPOS_DE_VEICULO.some((x) => x.id === t)), true)

confere('formulário: tipo de veículo desconhecido vira a classificar', comoTipoDeVeiculo('blog'), '')
confere('formulário: tipo de veículo conhecido passa', comoTipoDeVeiculo('radio'), 'radio')
confere('formulário: tipo de contato desconhecido vira jornalista', comoTipoDeContato('fornecedor'), 'jornalista')
confere('formulário: canal desconhecido vira e-mail', comoCanal('fax'), 'email')
confere('formulário: relevância desconhecida vira média', comoRelevancia(''), 'media')
confere('formulário: base legal só muda com consentimento', [comoBaseLegal('consentimento'), comoBaseLegal('x'), comoBaseLegal(undefined)], ['consentimento', 'legitimo_interesse', 'legitimo_interesse'])
confere('rótulo do veículo sem tipo', rotuloDoTipoDeVeiculo(''), 'A classificar')
confere('base legal: quem pediu para receber consentiu', [baseLegalDaOrigem('Pediu para receber'), baseLegalDaOrigem(' pediu  PARA receber ')], ['consentimento', 'consentimento'])
confere('base legal: as outras origens são legítimo interesse', [baseLegalDaOrigem('Hunter.io'), baseLegalDaOrigem('Lista de terceiros'), baseLegalDaOrigem('')],
  ['legitimo_interesse', 'legitimo_interesse', 'legitimo_interesse'])

confere('WhatsApp: celular com DDD ganha o 55', linkDoWhatsApp('(21) 99876-5432'), 'https://wa.me/5521998765432')
confere('WhatsApp: já com 55 não dobra', linkDoWhatsApp('+55 21 99876-5432'), 'https://wa.me/5521998765432')
confere('WhatsApp: fixo com DDD também abre', linkDoWhatsApp('21 2534-0000'), 'https://wa.me/552125340000')
confere('WhatsApp: sem DDD não dá', linkDoWhatsApp('99876-5432'), null)
confere('WhatsApp: vazio não dá', linkDoWhatsApp(''), null)
confere('ligação: com DDD', linkDeLigacao('(21) 2534-0000'), 'tel:+552125340000')
confere('ligação: zero na frente do DDD sai', linkDeLigacao('021 99876-5432'), 'tel:+5521998765432')
confere('ligação: sem DDD disca como está', linkDeLigacao('2534-0000'), 'tel:25340000')
confere('ligação: texto que não é telefone', linkDeLigacao('ramal 12'), null)
// O campo é texto livre: dois números, ramal, número de fora e 0800 não podem virar um número que não existe.
confere('telefone com dois números: vale o primeiro', [linkDeLigacao('(21) 2534-0000 / (21) 99876-5432'), linkDoWhatsApp('(21) 2534-0000 / (21) 99876-5432')],
  ['tel:+552125340000', 'https://wa.me/552125340000'])
confere('telefone com "ou" e com "e": vale o primeiro', [linkDeLigacao('21 2534-0000 ou 21 99876-5432'), linkDeLigacao('21 2534-0000 e 21 99876-5432')], ['tel:+552125340000', 'tel:+552125340000'])
confere('telefone com ramal: o ramal fica de fora', [linkDeLigacao('(21) 2534-0000 ramal 123'), linkDeLigacao('(21) 2534-0000 r. 123')], ['tel:+552125340000', 'tel:+552125340000'])
confere('número de fora, escrito com +, não ganha o 55', [linkDeLigacao('+1 212 555 0100'), linkDoWhatsApp('+1 212 555 0100')], ['tel:+12125550100', 'https://wa.me/12125550100'])
confere('0800 disca como foi escrito e não tem WhatsApp', [linkDeLigacao('0800 123 4567'), linkDoWhatsApp('0800 123 4567')], ['tel:08001234567', null])
confere('dois números colados sem separador que dê para ler: melhor não discar', [linkDeLigacao('(21) 2534-0000 - (21) 99876-5432'), linkDoWhatsApp('(21) 2534-0000 - (21) 99876-5432')], [null, null])

// ---------------------------------------------------------------- critério e listas

const globo: VeiculoParaFiltro = { tipo: 'impresso', praca: 'Rio de Janeiro (capital)', relevancia: 'alta' }
const radio: VeiculoParaFiltro = { tipo: 'radio', praca: 'Baixada Fluminense', relevancia: 'media' }
const novo: VeiculoParaFiltro = { tipo: '', praca: '', relevancia: 'media' }
const veiculos = new Map<string, VeiculoParaFiltro>([['v-globo', globo], ['v-radio', radio], ['v-novo', novo]])

const ana: ContatoParaFiltro = { id: 'ana', veiculoId: 'v-globo', editorias: ['saúde', 'cidades'], praca: '', tipoDeContato: 'jornalista', tags: ['mailing-2026'] }
const beto: ContatoParaFiltro = { id: 'beto', veiculoId: 'v-radio', editorias: ['geral'], praca: 'Niterói e São Gonçalo', tipoDeContato: 'jornalista', tags: [] }
const caio: ContatoParaFiltro = { id: 'caio', veiculoId: null, editorias: ['saúde'], praca: '', tipoDeContato: 'parceiro', tags: ['plantao'] }
const dani: ContatoParaFiltro = { id: 'dani', veiculoId: 'v-novo', editorias: [], praca: '', tipoDeContato: 'jornalista', tags: [] }
const todos = [ana, beto, caio, dani]
const atendem = (bruto: unknown) => {
  const criterio = lerCriterio(bruto)
  return todos.filter((c) => atendeAoCriterio(c, c.veiculoId ? veiculos.get(c.veiculoId) : undefined, criterio)).map((c) => c.id)
}

confere('praça do contato: a dele vale', pracaDoContato(beto, radio), 'Niterói e São Gonçalo')
confere('praça do contato: sem a dele, a do veículo', pracaDoContato(ana, globo), 'Rio de Janeiro (capital)')
confere('praça do contato: sem nenhuma', pracaDoContato(caio, undefined), '')

confere('critério vazio não filtra ninguém', atendem({}), ['ana', 'beto', 'caio', 'dani'])
confere('critério vazio está vazio', criterioEstaVazio(criterioVazio()), true)
confere('editoria: qualquer uma das escolhidas', atendem({ editorias: ['geral', 'Saude'] }), ['ana', 'beto', 'caio'])
confere('praça: vale a do contato, e a do veículo quando ele não tem', atendem({ pracas: ['Rio de Janeiro (capital)'] }), ['ana'])
confere('praça: a do contato manda sobre a do veículo', atendem({ pracas: ['Baixada Fluminense'] }), [])
confere('praça: escrita de outro jeito ainda acha', atendem({ pracas: ['niteroi'] }), ['beto'])
confere('tipo de veículo: quem não tem veículo fica de fora', atendem({ tiposDeVeiculo: ['impresso', 'radio'] }), ['ana', 'beto'])
confere('tipo de veículo: a classificar', atendem({ tiposDeVeiculo: [A_CLASSIFICAR] }), ['dani'])
confere('relevância do veículo', atendem({ relevancias: ['alta'] }), ['ana'])
confere('tipo de contato', atendem({ tiposDeContato: ['parceiro'] }), ['caio'])
confere('etiqueta', atendem({ etiquetas: ['plantao', 'mailing-2026'] }), ['ana', 'caio'])
confere('campos diferentes se somam (e)', atendem({ editorias: ['saúde'], tiposDeContato: ['jornalista'] }), ['ana'])

confere('critério lido: só os campos conhecidos, só valores que existem', lerCriterio({
  editorias: ['Saude', 'saúde', 5], pracas: ['rio', ''], tiposDeVeiculo: ['tv', 'blog', A_CLASSIFICAR], tiposDeContato: ['jornalista', 'astronauta'],
  etiquetas: [' Plantao '], relevancias: ['alta', 'altíssima'], apagarTudo: true,
}), { editorias: ['saúde'], pracas: ['Rio de Janeiro (capital)'], tiposDeVeiculo: ['tv', A_CLASSIFICAR], tiposDeContato: ['jornalista'], etiquetas: ['plantao'], relevancias: ['alta'] })
confere('critério lido: lixo vira critério vazio', [lerCriterio(null), lerCriterio('x'), lerCriterio([1])].every(criterioEstaVazio), true)
// A etiqueta do contato é comparada inteira e com acento: o critério não pode cortá-la nem juntá-la com a parecida.
const comprida = 'convidados-da-coletiva-de-lancamento-da-campanha-do-agasalho-2026'
confere('critério lido: etiqueta comprida não é cortada', lerCriterio({ etiquetas: [comprida] }).etiquetas, [comprida])
confere('critério lido: "saude" e "saúde" são duas etiquetas', lerCriterio({ etiquetas: ['saude', 'saúde', 'Saude'] }).etiquetas, ['saude', 'saúde'])
confere('etiqueta comprida acha o contato que a tem', atendeAoCriterio({ ...caio, tags: [comprida] }, undefined, lerCriterio({ etiquetas: [comprida] })), true)

confere('resumo do critério', resumoDoCriterio(lerCriterio({ editorias: ['saúde', 'cidades', 'geral'], pracas: ['Baixada Fluminense'], tiposDeVeiculo: ['tv', A_CLASSIFICAR], relevancias: ['alta'] })),
  'Editoria: Saúde, Cidades ou Geral · Praça: Baixada Fluminense · Veículo: TV ou A classificar · Relevância: Alta')
confere('resumo do critério vazio', resumoDoCriterio(criterioVazio()), '')

const membros = new Map<string, Set<string>>([['l-plantao', new Set(['caio', 'beto', 'sumiu'])]])
const ids = (lista: { id: string; tipo: 'fixa' | 'filtro'; criterio: unknown }) =>
  contatosDaLista({ ...lista, criterio: lerCriterio(lista.criterio) }, todos, veiculos, membros).map((c) => c.id)
confere('lista fixa: quem foi posto nela, na ordem dos contatos, sem quem já foi apagado', ids({ id: 'l-plantao', tipo: 'fixa', criterio: {} }), ['beto', 'caio'])
confere('lista fixa sem ninguém', ids({ id: 'l-outra', tipo: 'fixa', criterio: {} }), [])
confere('lista fixa ignora critério', ids({ id: 'l-plantao', tipo: 'fixa', criterio: { editorias: ['geral'] } }), ['beto', 'caio'])
confere('lista por filtro: quem atende hoje', ids({ id: 'l-saude', tipo: 'filtro', criterio: { editorias: ['saúde'] } }), ['ana', 'caio'])
confere('lista por filtro sem critério é vazia, e não o banco inteiro', ids({ id: 'l-vazia', tipo: 'filtro', criterio: {} }), [])

confere('listas na tela: plantão primeiro, depois por nome', ordenarListas([
  { nome: 'Saúde', plantao: false }, { nome: 'Plantão TV', plantao: true }, { nome: 'Árvore', plantao: false }, { nome: 'Plantão rádio', plantao: true },
]).map((l) => l.nome), ['Plantão rádio', 'Plantão TV', 'Árvore', 'Saúde'])

// ---------------------------------------------------------------- avisos do envio

const gente = (jornalistas: number, parceiros = 0, autoridades = 0) => [
  ...Array.from({ length: jornalistas }, () => ({ tipoDeContato: 'jornalista' })),
  ...Array.from({ length: parceiros }, () => ({ tipoDeContato: 'parceiro' })),
  ...Array.from({ length: autoridades }, () => ({ tipoDeContato: 'autoridade' })),
]
confere('lista pequena, de um tipo só: sem aviso', avisosDoEnvio(gente(12), { semRecorte: false }), [])
confere('mistura de tipos avisa, com as contas', avisosDoEnvio(gente(3, 1, 2), { semRecorte: false }),
  ['Esta seleção mistura tipos de contato: 3 jornalistas, 1 parceiro e 2 autoridades. Release é para imprensa; para os demais, vale um texto próprio.'])
confere('banco inteiro avisa a partir do limite', avisosDoEnvio(gente(SELECAO_LARGA), { semRecorte: true }).length, 1)
confere('banco inteiro pequeno não avisa', avisosDoEnvio(gente(SELECAO_LARGA - 1), { semRecorte: true }), [])
confere('lista grande escolhida de propósito não avisa', avisosDoEnvio(gente(500), { semRecorte: false }), [])
confere('os dois avisos juntos', avisosDoEnvio(gente(40, 5), { semRecorte: true }).length, 2)

// ---------------------------------------------------------------- importação

const csv = [
  'Nome;E-mail;Veículo;Tipo de veículo;Editoria;Cidade;Tipo de contato',
  'Ana Souza;ana@globo.teste.invalid;O Globo;Jornal;Saúde, Cidades;Rio de Janeiro;Jornalista',
  'Beto Lima;beto@radio.teste.invalid;Rádio Baixada;Rádio comunitária;Geral;Nova Iguaçu;Jornalista',
  'Caio;caio@tv.teste.invalid;TV Serra;Emissora;;;',
].join('\n')
const lido = linhasParaContatos(lerCsv(csv))
confere('importação: acha as colunas novas pelo nome', [lido.mapa.praca, lido.mapa.editorias, lido.mapa.tipoDeVeiculo], [5, 4, 3])
confere('importação: "Tipo de contato" não vira coluna do veículo', lido.mapa.veiculo, 2)
confere('importação: editorias, praça e tipo já na grafia do banco', lido.contatos.map((c) => [c.editorias, c.praca, c.tipoDeVeiculo]), [
  [['saúde', 'cidades'], 'Rio de Janeiro (capital)', 'impresso'],
  [['geral'], 'Nova Iguaçu', 'comunitario'],
  [[], '', ''],
])
confere('importação: planilha antiga, sem as colunas novas, continua valendo', (() => {
  const r = linhasParaContatos(lerCsv('nome,email,empresa\nAna,ana@x.teste.invalid,Jornal X'))
  return [r.contatos.length, r.contatos[0].veiculo, r.contatos[0].editorias, r.contatos[0].praca, r.contatos[0].tipoDeVeiculo, r.mapa.praca, r.mapa.tipoDeVeiculo]
})(), [1, 'Jornal X', [], '', '', -1, -1])
confere('importação: coluna "Tipo" sozinha é o tipo do veículo', mapearColunas(['Nome', 'Email', 'Mídia', 'Tipo']).tipoDeVeiculo, 3)
confere('importação: "Meio ambiente" não é o meio', mapearColunas(['Nome', 'Email', 'Meio ambiente']).tipoDeVeiculo, -1)
confere('importação: "Editoria principal" serve', mapearColunas(['Nome', 'Email', 'Editoria principal']).editorias, 2)
confere('importação: "Cidade/UF" serve de praça', mapearColunas(['Nome', 'Email', 'Cidade/UF']).praca, 2)
confere('importação: sem cabeçalho, as colunas novas ficam de fora', (() => {
  const r = linhasParaContatos(lerCsv('ana@x.teste.invalid;Ana\nbeto@x.teste.invalid;Beto'))
  return [r.contatos.length, r.mapa.praca, r.mapa.editorias, r.mapa.tipoDeVeiculo]
})(), [2, -1, -1, -1])

// ---------------------------------------------------------------- ficha do contato

const envio = (parte: Partial<EnvioNaFicha>): EnvioNaFicha => ({
  id: 'e', assunto: 'Release', estado: 'enviado', quando: '2026-11-05T13:00:00Z', agendadaPara: null, entregueEm: null,
  abertoEm: null, aberturas: 0, clicadoEm: null, devolvidoEm: null, denunciouEm: null, descadastrouEm: null, ...parte,
})
const rotulos = (parte: Partial<EnvioNaFicha>) => marcasDoEnvio(envio(parte)).map((m) => m.rotulo)
confere('ficha: saiu e ainda não há notícia de entrega', rotulos({}), ['Enviada'])
confere('ficha: entregue', rotulos({ entregueEm: '2026-11-05T13:00:05Z' }), ['Entregue'])
confere('ficha: abriu uma vez e clicou', rotulos({ entregueEm: 'x', abertoEm: 'x', aberturas: 1, clicadoEm: 'x' }), ['Entregue', 'Abriu', 'Clicou no link'])
confere('ficha: abriu mais de uma vez', rotulos({ entregueEm: 'x', abertoEm: 'x', aberturas: 3 }), ['Entregue', 'Abriu 3 vezes'])
confere('ficha: devolveu vem no lugar de entregue', rotulos({ devolvidoEm: 'x' }), ['Devolveu'])
confere('ficha: denúncia e saída aparecem', rotulos({ entregueEm: 'x', denunciouEm: 'x', descadastrouEm: 'x' }), ['Entregue', 'Marcou como spam', 'Saiu da lista'])
confere('ficha: na fila', rotulos({ estado: 'na_fila' }), ['Na fila de envio'])
confere('ficha: agendada', rotulos({ estado: 'na_fila', agendadaPara: '2026-11-11T11:00:00Z' }), ['Agendada'])
confere('ficha: falhou não mostra abertura antiga', rotulos({ estado: 'falhou', abertoEm: 'x' }), ['Falhou no envio'])
confere('ficha: ficou de fora', rotulos({ estado: 'de_fora' }), ['Ficou de fora'])
confere('ficha: alerta é vermelho, leitura é destaque', marcasDoEnvio(envio({ devolvidoEm: 'x', abertoEm: 'x', aberturas: 1 })).map((m) => m.tom), ['alerta', 'destaque'])
confere('ficha: resumo sem envios', resumoDaLeitura(0, 0), 'Ainda não recebeu nenhuma campanha.')
confere('ficha: resumo de quem abre parte', resumoDaLeitura(5, 3), 'Recebeu 5 campanhas e abriu 3.')
confere('ficha: resumo de quem abre tudo', resumoDaLeitura(2, 2), 'Recebeu 2 campanhas e abriu todas.')
confere('ficha: resumo de quem não abre', resumoDaLeitura(4, 0), 'Recebeu 4 campanhas e não abriu nenhuma.')
confere('ficha: resumo de um envio só', [resumoDaLeitura(1, 1), resumoDaLeitura(1, 0)], ['Recebeu 1 campanha e abriu a mensagem.', 'Recebeu 1 campanha e não abriu a mensagem.'])
confere('ficha: como entrou', ['manual', 'importado', 'hunter_dominio', 'hunter_email_finder', 'outro'].map(comoEntrou), [
  'Cadastrado à mão', 'Importado de uma planilha', 'Encontrado pela Hunter.io, na busca por domínio', 'Encontrado pela Hunter.io, pelo nome', 'Cadastrado à mão',
])

console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo conferido.')
process.exit(falhas ? 1 : 0)
