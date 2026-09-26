/**
 * Pedir propostas aos fornecedores (docs/compras-cotacao-automatica.md): quem
 * sugerir, o texto do e-mail, a situação de cada convite e a leitura da
 * proposta que o fornecedor manda pelo link. Módulo puro — conferido por
 * scripts/conferir-convites.ts.
 */

import { dataCurta, reais } from '@/lib/financeiro/regras'

/** Dias corridos do prazo sugerido (cai para a segunda se for fim de semana). */
export const PRAZO_PADRAO_DIAS = 5
export const MAXIMO_POR_VEZ = 20
export const PRAZO_MAXIMO_DIAS = 60

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const ehEmail = (s: string) => s.length <= 200 && EMAIL.test(s)

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()

/** O prazo sugerido: daqui a 5 dias; sábado e domingo passam para a segunda. */
export function prazoPadrao(hoje: string): string {
  const d = somarDias(hoje, PRAZO_PADRAO_DIAS)
  const s = diaDaSemana(d)
  return s === 6 ? somarDias(d, 2) : s === 0 ? somarDias(d, 1) : d
}

export const vespera = (prazo: string) => somarDias(prazo, -1)
export const diaSeguinte = (iso: string) => somarDias(iso, 1)

const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
/** "30/09/2026 (terça-feira)". */
export const dataComDia = (iso: string) => `${dataCurta(iso)} (${SEMANA[diaDaSemana(iso)]})`

// ---------------------------------------------------------------- quem sugerir

export type Fornecedor = { id: string; nome: string; email: string | null }
export type Sugestao = Fornecedor & {
  /** Está marcado como vendedor da categoria do pedido. */
  vende: boolean
  /** Quantas propostas já mandou em compras da mesma categoria. */
  cotou: number
  /** Já tem convite neste pedido (não entra de novo sem querer). */
  convidado: boolean
  /** Já vem marcado na lista: é habitual, tem e-mail e ainda não foi convidado. */
  marcado: boolean
}

/**
 * Os fornecedores da empresa em ordem de relevância: primeiro quem vende a
 * categoria e já cotou, depois quem vende, depois quem já cotou (mais vezes
 * primeiro), depois o resto em ordem alfabética.
 */
export function sugerirFornecedores(fornecedores: Fornecedor[], p: { vendem: Set<string>; cotacoes: Map<string, number>; convidados: Set<string> }): Sugestao[] {
  const peso = (s: Sugestao) => (s.vende ? 2 : 0) + (s.cotou > 0 ? 1 : 0)
  return fornecedores
    .map((f) => {
      const vende = p.vendem.has(f.id)
      const cotou = p.cotacoes.get(f.id) ?? 0
      const convidado = p.convidados.has(f.id)
      return { ...f, vende, cotou, convidado, marcado: (vende || cotou > 0) && !convidado && Boolean(f.email && ehEmail(f.email)) }
    })
    .sort((a, b) => peso(b) - peso(a) || b.cotou - a.cotou || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** "vende Material de escritório · cotou 3 vezes". */
export function motivoDaSugestao(s: Pick<Sugestao, 'vende' | 'cotou'>, categoria: string | null): string {
  return [
    s.vende ? `vende ${categoria ?? 'esta categoria'}` : '',
    s.cotou ? `cotou ${s.cotou === 1 ? '1 vez' : `${s.cotou} vezes`}` : '',
  ].filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------- situação

export type Convite = {
  enviado_em: string | null; envio_erro: string | null; visto_em: string | null; respondido_em: string | null
  recusado_em: string | null; motivo_recusa: string | null; cancelado_em: string | null; lembrete_em: string | null
}
export type Situacao = 'respondeu' | 'recusou' | 'cancelado' | 'falhou' | 'viu' | 'enviado' | 'link'

export function situacaoDoConvite(c: Convite): Situacao {
  if (c.cancelado_em) return 'cancelado'
  if (c.respondido_em) return 'respondeu'
  if (c.recusado_em) return 'recusou'
  // Abriu o link (mesmo que o e-mail tenha falhado e o link tenha ido por WhatsApp).
  if (c.visto_em) return 'viu'
  if (c.envio_erro) return 'falhou'
  return c.enviado_em ? 'enviado' : 'link'
}

export const SITUACOES: Record<Situacao, { rotulo: string; tom: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  respondeu: { rotulo: 'Mandou a proposta', tom: 'ok' },
  recusou: { rotulo: 'Não vai cotar', tom: 'neutro' },
  cancelado: { rotulo: 'Convite cancelado', tom: 'neutro' },
  falhou: { rotulo: 'E-mail não saiu', tom: 'erro' },
  viu: { rotulo: 'Abriu o link', tom: 'aviso' },
  enviado: { rotulo: 'E-mail enviado', tom: 'aviso' },
  link: { rotulo: 'Link pronto (não enviado)', tom: 'aviso' },
}

/** Quantos dos convites em vigor já tiveram resposta (proposta ou recusa). */
export function resumoDosConvites(convites: Convite[]): { total: number; responderam: number; propostas: number; pendentes: number; texto: string } {
  const vigentes = convites.filter((c) => !c.cancelado_em)
  const propostas = vigentes.filter((c) => c.respondido_em).length
  const recusas = vigentes.filter((c) => !c.respondido_em && c.recusado_em).length
  const responderam = propostas + recusas
  const total = vigentes.length
  const partes = [`${propostas} de ${total} ${total === 1 ? 'mandou' : 'mandaram'} proposta`]
  if (recusas) partes.push(`${recusas} não ${recusas === 1 ? 'vai' : 'vão'} cotar`)
  return { total, responderam, propostas, pendentes: total - responderam, texto: partes.join(' · ') }
}

// ---------------------------------------------------------------- e-mails

export type DadosDoConvite = {
  comprador: string; fornecedor: string; codigo: string; titulo: string; prazo: string; link: string
  itens: { descricao: string; especificacao: string | null; quantidade: number; unidade: string }[]
  localEntrega: string | null; necessarioAte: string | null; recado?: string | null
}

const qtd = (n: number) => String(n).replace('.', ',')

/** O pedido de proposta. Um e-mail por fornecedor: ninguém vê quem mais foi convidado. */
export function textoDoConvite(d: DadosDoConvite): { assunto: string; corpo: string } {
  const itens = d.itens.map((i, n) => `${n + 1}. ${i.descricao} — ${qtd(i.quantidade)} ${i.unidade}${i.especificacao ? `\n   ${i.especificacao.replace(/\n+/g, ' ')}` : ''}`)
  return {
    assunto: `Pedido de proposta ${d.codigo} — ${d.titulo}`.slice(0, 200),
    corpo: [
      `Olá, ${d.fornecedor}.`,
      `A ${d.comprador} pede a sua proposta para os itens abaixo.`,
      ...(d.recado?.trim() ? [d.recado.trim()] : []),
      itens.join('\n'),
      [
        d.localEntrega ? `Entrega em: ${d.localEntrega}` : '',
        d.necessarioAte ? `Precisamos até: ${dataCurta(d.necessarioAte)}` : '',
        `Prazo para a proposta: ${dataComDia(d.prazo)}`,
      ].filter(Boolean).join('\n'),
      `Para responder, abra o link abaixo, preencha o preço de cada item (e o frete, o prazo de entrega e a validade) e, se quiser, anexe a sua proposta em PDF. Não precisa de senha nem de cadastro:\n${d.link}`,
      'Se não puder cotar desta vez, o mesmo link tem o botão "Não vou cotar". Dúvidas, é só responder este e-mail.',
      'Obrigado,',
    ].join('\n\n'),
  }
}

/** O lembrete da véspera, para quem ainda não respondeu. */
export function textoDoLembrete(d: Pick<DadosDoConvite, 'comprador' | 'fornecedor' | 'codigo' | 'titulo' | 'prazo' | 'link'>): { assunto: string; corpo: string } {
  return {
    assunto: `Lembrete: proposta ${d.codigo} até ${dataCurta(d.prazo)}`.slice(0, 200),
    corpo: [
      `Olá, ${d.fornecedor}.`,
      `Lembrando que o prazo para a proposta de “${d.titulo}” (${d.codigo}) termina amanhã, ${dataComDia(d.prazo)}.`,
      `Para responder, é só abrir o link:\n${d.link}`,
      'Se não puder cotar desta vez, o mesmo link tem o botão "Não vou cotar".',
      'Obrigado,',
    ].join('\n\n'),
  }
}

// ---------------------------------------------------------------- a proposta do fornecedor

/**
 * Preço digitado por quem não é do Financeiro: aceita "1.500" (mil e
 * quinhentos, com ponto de milhar), "1.500,50", "1500.50", "R$ 12". Um único
 * ponto seguido de 3 dígitos é milhar ("1.500"); com 1 ou 2 dígitos é
 * decimal ("12.5", "12.50").
 */
export function lerPreco(bruto: unknown): number | null {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null
  const t = String(bruto ?? '').trim().replace(/\s|R\$/gi, '')
  if (!t) return null
  let normal: string
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, '')
  else normal = t
  if (!/^\d+(\.\d+)?$/.test(normal)) return null
  const n = Number(normal)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export type PropostaDoFornecedor = {
  precos: { item_id: string; valor_unitario: number | null }[]
  frete: number; validade: string | null; prazo_entrega: string; condicao_pagamento: string; observacao: string
}

/** Confere o que chegou do formulário público. Devolve a proposta pronta ou o erro para a tela. */
export function lerPropostaDoFornecedor(bruto: Record<string, unknown>, itens: string[], hoje: string): { proposta?: PropostaDoFornecedor; erro?: string } {
  const precosBrutos = Array.isArray(bruto.precos) ? bruto.precos as { item_id?: unknown; valor_unitario?: unknown }[] : []
  const precos: PropostaDoFornecedor['precos'] = []
  for (const id of itens) {
    const achado = precosBrutos.find((p) => p?.item_id === id)
    const texto = String(achado?.valor_unitario ?? '').trim()
    if (!texto) { precos.push({ item_id: id, valor_unitario: null }); continue }
    const v = lerPreco(texto)
    if (v === null || v < 0 || v > 100_000_000) return { erro: `Preço inválido: "${texto.slice(0, 20)}". Use só números, como 1.500,00.` }
    precos.push({ item_id: id, valor_unitario: v })
  }
  if (!precos.some((p) => p.valor_unitario !== null)) return { erro: 'Informe o preço de ao menos um item. Deixe em branco só o que você não fornece.' }
  const freteTexto = String(bruto.frete ?? '').trim()
  const frete = freteTexto ? lerPreco(freteTexto) : 0
  if (frete === null || frete < 0 || frete > 10_000_000) return { erro: 'Frete inválido. Deixe em branco se não houver.' }
  const validade = typeof bruto.validade === 'string' && bruto.validade.trim() ? bruto.validade.trim() : null
  if (validade && (!/^\d{4}-\d{2}-\d{2}$/.test(validade) || validade < hoje)) return { erro: 'A validade da proposta precisa ser de hoje em diante.' }
  const texto = (k: string, max: number) => (typeof bruto[k] === 'string' ? (bruto[k] as string).trim().slice(0, max) : '')
  return { proposta: { precos, frete, validade, prazo_entrega: texto('prazo_entrega', 120), condicao_pagamento: texto('condicao_pagamento', 120), observacao: texto('observacao', 1000) } }
}

/** O total que o fornecedor vê antes de enviar (itens cotados + frete). */
export function totalParaOFornecedor(itens: { id: string; quantidade: number }[], precos: Record<string, string>, frete: string): { total: number; cotados: number } {
  let centavos = 0
  let cotados = 0
  for (const i of itens) {
    const v = lerPreco(precos[i.id])
    if (v === null) continue
    cotados++
    centavos += Math.round(i.quantidade * v * 100)
  }
  centavos += Math.round((lerPreco(frete) ?? 0) * 100)
  return { total: centavos / 100, cotados }
}

export const valorLegivel = (n: number) => reais(n)
