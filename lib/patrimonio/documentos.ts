import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { Folha, dataPorExtenso, iniciar, reais } from '@/lib/pdf/folha'
import { documentoFormatado, valorPorExtenso } from './doacoes'
import { quantidade } from './estoque'

/**
 * Os documentos das doações, em PDF A4: o recibo que vai ao doador e o
 * termo de entrega que o beneficiário assina. Fonte padrão do PDF
 * (Helvetica), que desenha acentos do português.
 */

export type DadosDoRecibo = {
  codigo: string; data: string; doador: string; documento: string | null; campanha: string | null; observacao: string | null; recebidoPor: string; geradoEm: string
  itens: { descricao: string; quantidade: number; unidade: string; valor_unitario: number; valor_total: number }[]
}

export async function reciboDeDoacao(d: DadosDoRecibo): Promise<Uint8Array> {
  const { pdf, f } = await iniciar(`Recibo de doação ${d.codigo}`)
  const folha = new Folha(pdf, f, 'RECIBO DE DOAÇÃO', d.codigo)
  const total = Math.round(d.itens.reduce((s, i) => s + i.valor_total * 100, 0)) / 100
  const anonimo = !d.documento && d.doador === 'Doador anônimo'
  folha.paragrafo(
    `Recebemos ${anonimo ? 'de doador anônimo' : `de ${d.doador}${d.documento ? `, ${d.documento.length === 14 ? 'CNPJ' : 'CPF'} ${documentoFormatado(d.documento)}` : ''}`}, ` +
    `em ${dataPorExtenso(d.data)}, a doação dos itens abaixo, sem contrapartida, destinados às ações humanitárias da ${DADOS_DA_FILIAL.nome}` +
    `${d.campanha ? `, na campanha "${d.campanha}"` : ''}. Os itens foram avaliados pelo valor de mercado, no total de ${reais(total)} (${valorPorExtenso(total)}).`,
    10.5, false, 10,
  )
  folha.tabela(
    [{ titulo: 'Item', largura: 235 }, { titulo: 'Quantidade', largura: 80, direita: true }, { titulo: 'Valor unitário', largura: 90, direita: true }, { titulo: 'Total', largura: 90, direita: true }],
    d.itens.map((i) => [i.descricao, quantidade(i.quantidade, i.unidade), reais(i.valor_unitario), reais(i.valor_total)]),
    ['Total', '', '', reais(total)],
  )
  if (d.observacao) folha.paragrafo(`Observação: ${d.observacao}`, 9, false, 8)
  folha.paragrafo('Valor de mercado conforme a ITG 2002 (R1) — Entidade sem Finalidade de Lucros. Este recibo não se refere a doação em dinheiro.', 8, false, 6)
  folha.paragrafo(`Rio de Janeiro, ${dataPorExtenso(d.data)}.`, 10, false, 0)
  folha.assinaturas([{ linha1: d.recebidoPor, linha2: `Pela ${DADOS_DA_FILIAL.nome}` }])
  folha.rodapes(`${d.codigo} · emitido pelo Redação em ${d.geradoEm}`)
  return pdf.save()
}

export type DadosDoTermo = {
  codigo: string; data: string; beneficiario: string; tipo: string; documento: string | null; responsavel: string | null; pessoas: number | null
  municipio: string | null; bairro: string | null; campanha: string | null; observacao: string | null; entreguePor: string; geradoEm: string
  itens: { descricao: string; quantidade: number; unidade: string }[]
}

export async function termoDeEntrega(d: DadosDoTermo): Promise<Uint8Array> {
  const { pdf, f } = await iniciar(`Termo de entrega ${d.codigo}`)
  const folha = new Folha(pdf, f, 'TERMO DE ENTREGA DE DOAÇÃO', d.codigo)
  const onde = [d.bairro, d.municipio].filter(Boolean).join(', ')
  folha.paragrafo(`Beneficiário: ${d.beneficiario} (${d.tipo})${d.documento ? ` · documento ${d.documento}` : ''}`, 10, true, 0)
  if (d.responsavel) folha.paragrafo(`Responsável pelo recebimento: ${d.responsavel}`, 10, false, 0)
  folha.paragrafo([onde ? `Local: ${onde}` : null, d.pessoas ? `Pessoas atendidas: ${d.pessoas}` : null, d.campanha ? `Campanha: ${d.campanha}` : null].filter(Boolean).join(' · ') || ' ', 10, false, 10)
  folha.paragrafo(
    `Declaro que recebi da ${DADOS_DA_FILIAL.nome}, em ${dataPorExtenso(d.data)}, de forma gratuita, os itens abaixo, ` +
    'que serão usados em benefício das pessoas atendidas e não serão vendidos.', 10.5, false, 10,
  )
  folha.tabela([{ titulo: 'Item', largura: 380 }, { titulo: 'Quantidade', largura: 115, direita: true }], d.itens.map((i) => [i.descricao, quantidade(i.quantidade, i.unidade)]))
  if (d.observacao) folha.paragrafo(`Observação: ${d.observacao}`, 9, false, 8)
  folha.paragrafo(`Rio de Janeiro, ${dataPorExtenso(d.data)}.`, 10, false, 0)
  folha.assinaturas([
    { linha1: d.responsavel || d.beneficiario, linha2: 'Quem recebeu (nome e assinatura)' },
    { linha1: d.entreguePor, linha2: `Pela ${DADOS_DA_FILIAL.nome}` },
  ])
  folha.rodapes(`${d.codigo} · emitido pelo Redação em ${d.geradoEm}`)
  return pdf.save()
}
