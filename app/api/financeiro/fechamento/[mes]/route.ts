import { randomUUID } from 'node:crypto'
import { zipSync, strToU8 } from 'fflate'
import { createAdminClient } from '@/lib/supabase/admin'
import { dadosDoMes } from '@/lib/financeiro/fechamento-servidor'
import { documentoFormatado as documentoCompleto } from '@/lib/patrimonio/doacoes'
import { csv, nomeDeArquivo } from '@/lib/financeiro/fechamento'
import { FORMAS, SITUACOES, TIPOS, TIPOS_DE_ANEXO, documentoLegivel, nomeDoMes, situacao, ultimoDia } from '@/lib/financeiro/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'financeiro-anexos'
const LIMITE_DE_ANEXOS = 150 * 1024 * 1024

/**
 * O pacote do contador (zip): o resumo, as planilhas e os comprovantes do
 * mês. Resposta de função da Vercel tem limite de tamanho; por isso o zip vai
 * para o Storage (privado) e a pessoa baixa por um link de um minuto. Só a
 * gestão baixa; cada download fica na auditoria.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ mes: string }> }) {
  const { mes } = await params
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return new Response('Mês inválido.', { status: 400 })
  const d = await dadosDoMes(mes)
  if (d.nivel < 4) return new Response('Só a gestão do Financeiro baixa o pacote do mês.', { status: 403 })
  const c = d.cadastros
  const ws = d.context.workspace.id
  const nome = {
    conta: new Map(c.contas.map((x) => [x.id, x.nome])), categoria: new Map(c.categorias.map((x) => [x.id, x])),
    fonte: new Map(c.fontes.map((x) => [x.id, x])), favorecido: new Map(c.favorecidos.map((x) => [x.id, x])), projeto: new Map(c.projetos.map((x) => [x.id, x.name])),
  }
  const fim = ultimoDia(mes)
  const inicio = `${mes}-01`
  const conciliados = new Map(d.extrato.filter((e) => e.lancamento_id).map((e) => [e.lancamento_id as string, e.data]))
  const anexosDe = new Map<string, number>()
  for (const a of d.anexos) anexosDe.set(a.lancamento_id, (anexosDe.get(a.lancamento_id) ?? 0) + 1)
  const doMes = d.lancamentos.filter((l) => (l.pago_em && l.pago_em >= inicio && l.pago_em <= fim) || (l.competencia >= inicio && l.competencia <= fim) || (!l.pago_em && l.vencimento >= inicio && l.vencimento <= fim))
    .sort((a, b) => (a.pago_em ?? a.vencimento).localeCompare(b.pago_em ?? b.vencimento))

  const arquivos: Record<string, Uint8Array> = {}
  const r = d.resumo
  arquivos['1-resumo.csv'] = strToU8(csv(['Item', 'Valor'], [
    ['Mês', nomeDoMes(mes)], ['Entradas (caixa)', r.caixa.entradas], ['Saídas (caixa)', r.caixa.saidas], ['Resultado do mês (caixa)', r.caixa.resultado],
    ['Horas de trabalho voluntário', r.voluntariado.horas], ['Voluntários com horas no mês', r.voluntariado.pessoas],
    ['Valor da hora voluntária (referência)', r.voluntariado.valorHora], ['Trabalho voluntário a valor justo (ITG 2002)', r.voluntariado.valor],
    ...(r.patrimonio ? [
      ['Depreciação do mês (patrimônio)', r.patrimonio.depreciacaoDoMes], ['Valor contábil do patrimônio no fim do mês', r.patrimonio.contabil],
      ['Bens recebidos em doação no mês (valor de mercado)', r.patrimonio.doadosNoMes.reduce((s, b) => s + b.valor, 0)],
    ] as [string, number][] : []),
    ...(r.estoque ? [
      ['Estoque de materiais no início do mês', r.estoque.valorInicio], ['Materiais comprados', r.estoque.compras], ['Materiais recebidos em doação (valor de mercado)', r.estoque.doacoes],
      ['Outras entradas de materiais', r.estoque.outrasEntradas], ['Consumo de materiais', r.estoque.consumo], ['Perdas de materiais', r.estoque.perdas],
      ['Ajustes de contagem', r.estoque.ajustes], ['Estoque de materiais no fim do mês', r.estoque.valorFim],
    ] as [string, number][] : []),
  ]))
  arquivos['2-por-categoria.csv'] = strToU8(csv(['Código contábil', 'Grupo', 'Categoria', 'Tipo', 'Realizado no mês (caixa)', 'Competência do mês'],
    r.porCategoria.map((k) => [k.codigo, k.grupo, k.nome, k.tipo === 'receita' ? 'Receita' : 'Despesa', k.caixa, k.competencia])))
  arquivos['3-saldos-por-conta.csv'] = strToU8(csv(['Conta', 'Saldo no início', 'Entradas', 'Saídas', 'Saldo no fim', 'Saldo no banco', 'Data do saldo do banco', 'Redação na mesma data'],
    r.porConta.map((k) => [k.nome, k.inicio, k.entradas, k.saidas, k.fim, k.banco?.saldo ?? null, k.banco?.em ?? null, k.banco?.redacao ?? null])))
  arquivos['4-saldos-por-fonte.csv'] = strToU8(csv(['Fonte do recurso', 'Com destino (restrita)', 'Saldo no início', 'Entradas', 'Saídas', 'Saldo no fim'],
    r.porFonte.map((f) => [f.nome, f.restrita ? 'Sim' : 'Não', f.inicio, f.entradas, f.saidas, f.fim])))
  arquivos['5-lancamentos.csv'] = strToU8(csv(
    ['Data do pagamento', 'Vencimento', 'Competência', 'Tipo', 'Descrição', 'Favorecido', 'CPF/CNPJ', 'Código contábil', 'Categoria', 'Conta', 'Conta de destino',
      'Fonte', 'Fonte com destino', 'Projeto', 'Valor', 'Valor pago', 'Forma', 'Nº documento', 'Situação', 'Conciliado com o extrato em', 'Arquivos', 'Id'],
    doMes.map((l) => {
      const cat = l.categoria_id ? nome.categoria.get(l.categoria_id) : null
      const fav = l.favorecido_id ? nome.favorecido.get(l.favorecido_id) : null
      const fonte = nome.fonte.get(l.fonte_id)
      return [
        l.pago_em, l.vencimento, l.competencia.slice(0, 7), TIPOS[l.tipo].rotulo, l.descricao, fav?.nome ?? null,
        fav?.documento?.length === 14 ? documentoLegivel(fav.documento) : fav?.documento ?? null, cat?.codigo_contabil ?? null, cat?.nome ?? null,
        nome.conta.get(l.conta_id) ?? null, l.conta_destino_id ? nome.conta.get(l.conta_destino_id) ?? null : null, fonte?.nome ?? null, fonte?.restrita ? 'Sim' : 'Não',
        l.projeto_id ? nome.projeto.get(l.projeto_id) ?? null : null, l.valor, l.valor_pago, l.forma ? FORMAS[l.forma as keyof typeof FORMAS] : null, l.documento,
        SITUACOES[situacao(l, fim)].rotulo, conciliados.get(l.id) ?? null, anexosDe.get(l.id) ?? 0, l.id,
      ]
    })))
  arquivos['6-extrato.csv'] = strToU8(csv(['Conta', 'Data', 'Descrição no banco', 'Documento', 'Valor', 'Situação', 'Motivo (se ignorada)'],
    d.extrato.map((e) => [nome.conta.get(e.conta_id) ?? null, e.data, e.descricao, e.documento, e.valor, e.situacao === 'conciliado' ? 'Conciliada' : e.situacao === 'ignorado' ? 'Ignorada' : 'Pendente', e.motivo])))
  if (r.patrimonio) {
    arquivos['7-patrimonio.csv'] = strToU8(csv(['Plaqueta', 'Bem', 'Categoria', 'Conta contábil', 'Origem', 'Aquisição', 'Valor', 'Depreciação do mês', 'Depreciação acumulada', 'Valor contábil', 'Baixado em'],
      r.patrimonio.linhas.map((l) => [l.plaqueta, l.nome, l.categoria, l.conta, l.origem === 'doacao' ? 'Doação' : l.origem === 'compra' ? 'Compra' : l.origem, l.aquisicao, l.valor, l.noMes, l.acumulada, l.contabil, l.baixado])))
  }
  if (r.estoque) {
    // Quantidade como texto: até 3 casas (kg, litro), sem separador de milhar.
    const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false })
    arquivos['8-estoque.csv'] = strToU8(csv(['Código', 'Material', 'Categoria', 'Conta contábil', 'Unidade', 'Quantidade no início', 'Valor no início', 'Compras', 'Doações', 'Outras entradas',
      'Consumo', 'Perdas', 'Ajustes', 'Montagem de kits', 'Quantidade no fim', 'Valor no fim'],
      r.estoque.linhas.map((l) => [l.codigo, l.nome, l.categoria, l.conta_contabil, l.unidade, qtd(l.qtd_inicio), l.valor_inicio, l.compras, l.doacoes, l.outras_entradas,
        l.consumo, l.perdas, l.ajustes, l.kits, qtd(l.qtd_fim), l.valor_fim])))
  }
  // Doações em espécie do mês, recibo a recibo, com o doador (receita pelo valor de mercado — ITG 2002).
  // Doações em espécie são da filial: só no pacote da empresa principal.
  const { data: doacoes, error: semDoacoes } = d.principal ? await d.supabase.rpc('financeiro_doacoes_do_periodo', { p_workspace_id: ws, p_inicio: inicio, p_fim: fim }) : { data: null, error: null }
  if (!semDoacoes && Array.isArray(doacoes) && doacoes.length) {
    arquivos['9-doacoes-recebidas.csv'] = strToU8(csv(['Recibo', 'Data', 'Doador', 'CPF/CNPJ', 'Campanha', 'Vai para', 'Item', 'Quantidade', 'Unidade', 'Valor unitário (mercado)', 'Valor total'],
      (doacoes as Record<string, unknown>[]).map((x) => [x.codigo as string, x.data as string, x.doador as string, documentoCompleto(x.documento as string | null), x.campanha as string | null,
        x.tipo === 'bem' ? 'Patrimônio' : 'Estoque', x.descricao as string, Number(x.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false }), x.unidade as string,
        Number(x.valor_unitario), Number(x.valor_total)])))
  }
  const aviso = d.itens.filter((i) => !i.ok)
  const fechamento = d.fechamentos.find((f) => f.mes === inicio && f.situacao === 'fechado')
  arquivos['LEIAME.txt'] = strToU8([
    `Financeiro — ${nomeDoMes(mes)}`,
    d.empresa ? `Empresa: ${d.empresa.razao_social ?? d.empresa.nome}${d.empresa.cnpj ? ` — CNPJ ${d.empresa.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}` : ''}` : '',
    fechamento ? `Mês fechado em ${new Date(fechamento.fechado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` : 'Mês AINDA NÃO FECHADO: os números podem mudar.',
    fechamento?.observacao ? `Observação de quem fechou: ${fechamento.observacao}` : '',
    '',
    'Planilhas (CSV, ";" e vírgula decimal — abrem direto no Excel):',
    '  1-resumo: entradas, saídas, resultado e trabalho voluntário a valor justo (ITG 2002).',
    '  2-por-categoria: por categoria, com o código do plano de contas — regime de caixa e de competência.',
    '  3-saldos-por-conta e 4-saldos-por-fonte: início, entradas, saídas e fim do mês; fontes com destino separadas.',
    '  5-lancamentos: cada lançamento do mês, com favorecido, categoria, fonte, projeto e se foi conciliado.',
    '  6-extrato: as linhas do banco no mês e o que foi feito com cada uma.',
    '  7-patrimonio: os bens com valor, a depreciação do mês e a acumulada, e o valor contábil (se houver bens cadastrados).',
    '  8-estoque: cada material com saldo inicial, compras, doações, consumo, perdas e saldo final, pelo custo médio (se houver materiais).',
    '  9-doacoes-recebidas: cada item doado no mês (recibo DOA-…), com o doador e o valor de mercado — base da receita de doação em espécie.',
    '  comprovantes/: os arquivos anexados aos lançamentos (nome: data_descrição_tipo).',
    '',
    aviso.length ? 'Avisos na conferência:' : 'Conferência sem avisos.',
    ...aviso.map((i) => `  - ${i.rotulo}${i.detalhe ? `: ${i.detalhe}` : ''}`),
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\r\n'))

  // Comprovantes: só dos lançamentos do mês, até o limite (o resto fica listado).
  const admin = createAdminClient()
  const porLancamento = new Map(doMes.map((l) => [l.id, l]))
  let total = 0
  const deFora: string[] = []
  const usados = new Set<string>()
  for (const a of d.anexos) {
    const l = porLancamento.get(a.lancamento_id)
    if (!l) continue
    const { data: blob } = await admin.storage.from(BUCKET).download(a.caminho)
    if (!blob) { deFora.push(`${a.nome_original} (não encontrado)`); continue }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (total + bytes.length > LIMITE_DE_ANEXOS) { deFora.push(a.nome_original); continue }
    total += bytes.length
    const ext = a.caminho.split('.').pop() ?? 'pdf'
    let nomeArq = `comprovantes/${l.pago_em ?? l.vencimento}_${nomeDeArquivo(l.descricao)}_${nomeDeArquivo(TIPOS_DE_ANEXO[a.tipo_doc as keyof typeof TIPOS_DE_ANEXO] ?? a.tipo_doc, 20)}`
    let n = 1
    while (usados.has(`${nomeArq}${n > 1 ? `-${n}` : ''}.${ext}`)) n++
    nomeArq = `${nomeArq}${n > 1 ? `-${n}` : ''}.${ext}`
    usados.add(nomeArq)
    arquivos[nomeArq] = bytes
  }
  if (deFora.length) arquivos['comprovantes/FORA-DO-PACOTE.txt'] = strToU8(`Ficaram de fora (limite de tamanho do pacote); baixe pelo Redação:\r\n${deFora.join('\r\n')}`)

  const zip = zipSync(arquivos, { level: 6 })
  const caminho = `${ws}/pacotes/${mes}/${randomUUID()}.zip`
  const { error } = await admin.storage.from(BUCKET).upload(caminho, zip, { contentType: 'application/zip' })
  if (error) return new Response('Não foi possível montar o pacote.', { status: 502 })
  const { error: semPermissao } = await d.supabase.rpc('financeiro_auditar_pacote', { p_workspace_id: ws, p_mes: inicio, p_arquivos: Object.keys(arquivos).length, p_entidade_id: d.empresa?.id ?? null })
  if (semPermissao) return new Response('Só a gestão do Financeiro baixa o pacote do mês.', { status: 403 })
  const { data: assinado } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 60, { download: `financeiro-${d.empresa && !d.empresa.principal ? `${nomeDeArquivo(d.empresa.nome, 30)}-` : ''}${mes}.zip` })
  if (!assinado?.signedUrl) return new Response('Não foi possível gerar o link.', { status: 502 })
  return new Response(null, { status: 302, headers: { Location: assinado.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
