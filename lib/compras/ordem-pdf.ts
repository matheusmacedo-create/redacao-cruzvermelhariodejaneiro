import { Folha, dataPorExtenso, iniciar, reais } from '@/lib/pdf/folha'
import { documentoFormatado } from '@/lib/patrimonio/doacoes'
import { quantidade } from '@/lib/patrimonio/estoque'
import { totalDaLinha } from './regras'

/**
 * A ordem de compra em PDF — o documento que vai ao fornecedor: quem compra
 * (a empresa do pedido, com CNPJ para faturar), quem vende, o quê, por
 * quanto, onde entregar e em que condições. Vale como pedido formal.
 */
export type DadosDaOrdem = {
  codigo: string; pedido: string; emitidaEm: string; geradoEm: string
  comprador: { nome: string; cnpj: string | null; endereco: string | null }
  fornecedor: { nome: string; documento: string | null; email: string | null; telefone: string | null }
  itens: { descricao: string; especificacao: string | null; quantidade: number; unidade: string; valor_unitario: number }[]
  frete: number; total: number
  prazoEntrega: string | null; condicaoPagamento: string | null; localEntrega: string | null; necessarioAte: string | null
  observacao: string | null; emitidaPor: string; aprovadaPor: string | null
}

const doc = (d: string | null) => (!d ? null : `${d.length === 11 ? 'CPF' : 'CNPJ'} ${documentoFormatado(d)}`)

export async function ordemDeCompra(d: DadosDaOrdem): Promise<Uint8Array> {
  const { pdf, f } = await iniciar(`Ordem de compra ${d.codigo}`)
  const folha = new Folha(pdf, f, 'ORDEM DE COMPRA', d.codigo)
  folha.paragrafo(`Emitida em ${dataPorExtenso(d.emitidaEm)} · referente ao pedido ${d.pedido}`, 9, false, 8)
  folha.paragrafo('Comprador (faturar para)', 9, true, 0)
  folha.paragrafo([d.comprador.nome, doc(d.comprador.cnpj), d.comprador.endereco].filter(Boolean).join(' · '), 9.5, false, 8)
  folha.paragrafo('Fornecedor', 9, true, 0)
  folha.paragrafo([d.fornecedor.nome, doc(d.fornecedor.documento), d.fornecedor.email, d.fornecedor.telefone].filter(Boolean).join(' · '), 9.5, false, 10)
  folha.tabela(
    [{ titulo: 'Item', largura: 245 }, { titulo: 'Quantidade', largura: 75, direita: true }, { titulo: 'Valor unitário', largura: 85, direita: true }, { titulo: 'Total', largura: 90, direita: true }],
    [
      ...d.itens.map((i) => [i.especificacao ? `${i.descricao} — ${i.especificacao}` : i.descricao, quantidade(i.quantidade, i.unidade), reais(i.valor_unitario), reais(totalDaLinha(i.quantidade, i.valor_unitario))]),
      ...(d.frete ? [['Frete', '', '', reais(d.frete)]] : []),
    ],
    ['Total', '', '', reais(d.total)],
  )
  const condicoes = [
    d.prazoEntrega && `Prazo de entrega: ${d.prazoEntrega}`,
    d.necessarioAte && `Necessário até: ${dataPorExtenso(d.necessarioAte)}`,
    d.localEntrega && `Local de entrega: ${d.localEntrega}`,
    d.condicaoPagamento && `Condição de pagamento: ${d.condicaoPagamento}`,
  ].filter(Boolean) as string[]
  if (condicoes.length) { folha.paragrafo('Condições', 9, true, 0); for (const c of condicoes) folha.paragrafo(c, 9.5, false, 0) }
  if (d.observacao) { folha.paragrafo(' ', 4, false, 0); folha.paragrafo(`Observação: ${d.observacao}`, 9.5, false, 6) }
  folha.paragrafo(' ', 4, false, 0)
  folha.paragrafo(`A nota fiscal deve ser emitida em nome do comprador acima, citando a ordem ${d.codigo}. Entregas e valores diferentes desta ordem precisam de confirmação por escrito antes.`, 8.5, false, 6)
  folha.assinaturas([
    { linha1: d.emitidaPor, linha2: 'Emitida por' },
    ...(d.aprovadaPor ? [{ linha1: d.aprovadaPor, linha2: 'Aprovada por' }] : []),
  ])
  folha.rodapes(`${d.codigo} · emitida pelo Palácio Virtual em ${d.geradoEm}`)
  return pdf.save()
}
