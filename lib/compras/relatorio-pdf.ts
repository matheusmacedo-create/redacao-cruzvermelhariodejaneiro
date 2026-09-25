import { Folha, dataPorExtenso, iniciar, reais } from '@/lib/pdf/folha'

/**
 * O relatório público de compras do mês, para o portal de transparência: cada
 * compra aprovada, com o vencedor, o valor, a fonte do dinheiro e TODAS as
 * propostas recebidas (o mapa comparativo), e a justificativa quando a escolha
 * não foi a mais barata ou vieram menos propostas que o exigido. Fornecedor
 * pessoa física aparece sem nome nem CPF.
 */
export type CompraNoRelatorio = {
  codigo: string; objeto: string; aprovadaEm: string; valor: number; fonte: string | null; diretoria: boolean
  propostasExigidas: number; justificativa: string | null
  propostas: { fornecedor: string; total: number; completa: boolean; escolhida: boolean }[]
}
export type DadosDoRelatorio = { empresa: string; mes: string; mesPorExtenso: string; geradoEm: string; compras: CompraNoRelatorio[] }

const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export async function relatorioDeCompras(d: DadosDoRelatorio): Promise<Uint8Array> {
  const { pdf, f } = await iniciar(`Compras e contratações — ${d.mesPorExtenso}`)
  const folha = new Folha(pdf, f, 'COMPRAS E CONTRATAÇÕES', d.mes)
  const total = Math.round(d.compras.reduce((s, c) => s + c.valor * 100, 0)) / 100
  folha.paragrafo(`${d.empresa} · compras aprovadas em ${d.mesPorExtenso}.`, 10, true, 2)
  folha.paragrafo(
    'Cada compra passa por cotação com fornecedores e aprovação do Financeiro (e da Diretoria acima do limite), conforme as regras de compra da filial. ' +
    'Abaixo, o resumo do mês e, para cada compra, todas as propostas recebidas. Fornecedores pessoa física aparecem sem identificação.', 8.5, false, 10)
  if (!d.compras.length) {
    folha.paragrafo('Nenhuma compra aprovada neste mês.', 10, false, 8)
  } else {
    folha.tabela(
      [{ titulo: 'Compra', largura: 80 }, { titulo: 'Objeto', largura: 190 }, { titulo: 'Fornecedor', largura: 140 }, { titulo: 'Valor', largura: 85, direita: true }],
      d.compras.map((c) => [c.codigo, c.objeto, c.propostas.find((p) => p.escolhida)?.fornecedor ?? '—', reais(c.valor)]),
      [`${d.compras.length} ${d.compras.length === 1 ? 'compra' : 'compras'}`, '', '', reais(total)],
    )
    for (const c of d.compras) {
      folha.garantir(90)
      folha.paragrafo(`${c.codigo} — ${c.objeto}`, 10, true, 2)
      const completas = c.propostas.filter((p) => p.completa).length
      folha.paragrafo([
        `Aprovada em ${curta(c.aprovadaEm)}`, c.fonte ? `Recursos: ${c.fonte}` : null,
        `Propostas: ${completas} (exigidas: ${c.propostasExigidas})`, c.diretoria ? 'Aprovada também pela Diretoria' : null,
      ].filter(Boolean).join(' · '), 8.5, false, 4)
      folha.tabela(
        [{ titulo: 'Proposta', largura: 330 }, { titulo: 'Total', largura: 90, direita: true }, { titulo: '', largura: 75 }],
        c.propostas.map((p) => [p.fornecedor, reais(p.total), p.escolhida ? 'escolhida' : p.completa ? '' : 'incompleta']),
      )
      if (c.justificativa) folha.paragrafo(`Justificativa da escolha: ${c.justificativa}`, 8.5, false, 6)
    }
  }
  folha.paragrafo(`Rio de Janeiro, ${dataPorExtenso(d.geradoEm.slice(0, 10))}.`, 9, false, 0)
  folha.rodapes(`Compras e contratações · ${d.mesPorExtenso} · ${d.empresa}`)
  return pdf.save()
}
