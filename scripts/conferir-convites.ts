/**
 * Confere as regras de "Pedir propostas": `npx tsx scripts/conferir-convites.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import {
  dataComDia, lerPreco, lerPropostaDoFornecedor, motivoDaSugestao, prazoPadrao, resumoDosConvites, situacaoDoConvite, sugerirFornecedores,
  textoDoConvite, textoDoLembrete, totalParaOFornecedor, vespera, type Convite,
} from '../lib/compras/convites'

let falhas = 0
function igual<T>(obtido: T, esperado: T, rotulo: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++
    console.error(`✗ ${rotulo}\n   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`)
  }
}

// Preço: o ponto de milhar que todo mundo digita.
igual(lerPreco('1.500'), 1500, '"1.500" é mil e quinhentos')
igual(lerPreco('1.500,50'), 1500.5, '"1.500,50"')
igual(lerPreco('12.5'), 12.5, '"12.5" é decimal')
igual(lerPreco('12.50'), 12.5, '"12.50" é decimal')
igual(lerPreco('R$ 3,99'), 3.99, 'com R$')
igual(lerPreco('1.234.567'), 1234567, 'milhões com pontos')
igual(lerPreco('1500.555'), 1500.56, 'arredonda a centavos')
igual(lerPreco('abc'), null, 'texto não é preço')
igual(lerPreco('-3'), null, 'negativo não passa')
igual(lerPreco(''), null, 'vazio é nulo')

// Prazo: 5 dias corridos, sem cair no fim de semana.
igual(prazoPadrao('2026-09-21'), '2026-09-28', 'seg + 5 = sáb → segunda')
igual(prazoPadrao('2026-09-22'), '2026-09-28', 'ter + 5 = dom → segunda')
igual(prazoPadrao('2026-09-23'), '2026-09-28', 'qua + 5 = seg')
igual(prazoPadrao('2026-09-26'), '2026-10-01', 'sáb + 5 = qui')
igual(vespera('2026-10-01'), '2026-09-30', 'véspera')
igual(vespera('2026-03-01'), '2026-02-28', 'véspera na virada do mês')
igual(dataComDia('2026-09-29'), '29/09/2026 (terça-feira)', 'data com o dia da semana')

// Sugestões: vende + cotou primeiro; sem e-mail ou já convidado não vem marcado.
const lista = sugerirFornecedores([
  { id: 'a', nome: 'Zeta', email: 'z@z.com' },
  { id: 'b', nome: 'Alfa', email: 'a@a.com' },
  { id: 'c', nome: 'Beta', email: null },
  { id: 'd', nome: 'Gama', email: 'g@g.com' },
  { id: 'e', nome: 'Delta', email: 'd@d.com' },
], { vendem: new Set(['a', 'c', 'e']), cotacoes: new Map([['a', 2], ['d', 5]]), convidados: new Set(['e']) })
igual(lista.map((s) => s.id), ['a', 'c', 'e', 'd', 'b'], 'ordem: vende e cotou, vende, cotou, resto')
igual(lista.map((s) => s.marcado), [true, false, false, true, false], 'marcados: habitual com e-mail e ainda não convidado')
igual(motivoDaSugestao(lista[0], 'Material de escritório'), 'vende Material de escritório · cotou 2 vezes', 'motivo completo')
igual(motivoDaSugestao(lista[3], null), 'cotou 5 vezes', 'motivo só histórico')
igual(motivoDaSugestao(lista[4], null), '', 'sem motivo')

// Situação e resumo.
const base: Convite = { enviado_em: null, envio_erro: null, visto_em: null, respondido_em: null, recusado_em: null, motivo_recusa: null, cancelado_em: null, lembrete_em: null }
igual(situacaoDoConvite(base), 'link', 'sem envio: link pronto')
igual(situacaoDoConvite({ ...base, enviado_em: 'x' }), 'enviado', 'enviado')
igual(situacaoDoConvite({ ...base, enviado_em: 'x', visto_em: 'y' }), 'viu', 'abriu o link')
igual(situacaoDoConvite({ ...base, envio_erro: 'falhou' }), 'falhou', 'e-mail não saiu')
igual(situacaoDoConvite({ ...base, envio_erro: 'falhou', visto_em: 'y' }), 'viu', 'e-mail falhou mas o link foi aberto')
igual(situacaoDoConvite({ ...base, enviado_em: 'x', respondido_em: 'z', cancelado_em: 'w' }), 'cancelado', 'cancelado vale mais')
igual(situacaoDoConvite({ ...base, enviado_em: 'x', recusado_em: 'z' }), 'recusou', 'recusou')
const r = resumoDosConvites([
  { ...base, respondido_em: 'x' }, { ...base, respondido_em: 'x' }, { ...base, recusado_em: 'x' }, { ...base }, { ...base, cancelado_em: 'x' },
])
igual([r.total, r.propostas, r.responderam, r.pendentes], [4, 2, 3, 1], 'resumo ignora o cancelado')
igual(r.texto, '2 de 4 mandaram proposta · 1 não vai cotar', 'texto do resumo')

// A proposta do fornecedor.
const itens = ['i1', 'i2']
igual(lerPropostaDoFornecedor({ precos: [{ item_id: 'i1', valor_unitario: '' }] }, itens, '2026-09-26').erro !== undefined, true, 'sem preço nenhum: erro')
const ok = lerPropostaDoFornecedor({ precos: [{ item_id: 'i1', valor_unitario: '1.500' }, { item_id: 'x', valor_unitario: '9' }], frete: '', validade: '2026-10-10', prazo_entrega: ' 5 dias ' }, itens, '2026-09-26')
igual(ok.proposta?.precos, [{ item_id: 'i1', valor_unitario: 1500 }, { item_id: 'i2', valor_unitario: null }], 'item de fora é ignorado; o não cotado fica nulo')
igual([ok.proposta?.frete, ok.proposta?.prazo_entrega], [0, '5 dias'], 'frete vazio = 0; texto aparado')
igual(lerPropostaDoFornecedor({ precos: [{ item_id: 'i1', valor_unitario: '10' }], validade: '2026-09-01' }, itens, '2026-09-26').erro !== undefined, true, 'validade no passado: erro')
igual(lerPropostaDoFornecedor({ precos: [{ item_id: 'i1', valor_unitario: '10' }], frete: '-1' }, itens, '2026-09-26').erro !== undefined, true, 'frete negativo: erro')
igual(lerPropostaDoFornecedor({ precos: [{ item_id: 'i1', valor_unitario: 'dez' }] }, itens, '2026-09-26').erro !== undefined, true, 'preço em texto: erro')
igual(totalParaOFornecedor([{ id: 'i1', quantidade: 10 }, { id: 'i2', quantidade: 2.5 }], { i1: '3,50', i2: '' }, '12'), { total: 47, cotados: 1 }, 'total com frete')

// E-mails.
const convite = textoDoConvite({
  comprador: 'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro', fornecedor: 'Papelaria Centro', codigo: 'PC-2026-0001', titulo: 'Papel A4',
  prazo: '2026-10-01', link: 'https://palacio.exemplo/cotacao/abc', itens: [{ descricao: 'Papel A4', especificacao: '75 g/m²\nbranco', quantidade: 10, unidade: 'resma' }],
  localEntrega: 'Praça da Cruz Vermelha, 10', necessarioAte: '2026-10-10', recado: 'Entrega em horário comercial.',
})
igual(convite.assunto, 'Pedido de proposta PC-2026-0001 — Papel A4', 'assunto do convite')
igual(convite.corpo.includes('1. Papel A4 — 10 resma\n   75 g/m² branco'), true, 'itens com a especificação em uma linha')
igual(convite.corpo.includes('Prazo para a proposta: 01/10/2026 (quinta-feira)'), true, 'prazo com dia da semana')
igual(convite.corpo.includes('https://palacio.exemplo/cotacao/abc'), true, 'link no corpo')
igual(convite.corpo.includes('Entrega em horário comercial.'), true, 'recado entra')
igual(/estimad|valor de refer/i.test(convite.corpo), false, 'nenhum valor estimado vai ao fornecedor')
igual(textoDoLembrete({ comprador: 'X', fornecedor: 'Y', codigo: 'PC-2026-0001', titulo: 'Papel', prazo: '2026-10-01', link: 'L' }).assunto, 'Lembrete: proposta PC-2026-0001 até 01/10/2026', 'assunto do lembrete')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('Pedir propostas: tudo certo.')
