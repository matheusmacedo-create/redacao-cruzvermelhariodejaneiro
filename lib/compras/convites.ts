/**
 * Pedir propostas aos fornecedores (docs/compras-cotacao-automatica.md): quem
 * sugerir, o texto do e-mail, a situação de cada convite e a leitura da
 * proposta que o fornecedor manda pelo link. Módulo puro — conferido por
 * scripts/conferir-convites.ts.
 */

import { dataCurta, reais } from '@/lib/financeiro/regras'
import { escapar } from '@/lib/correio/mensagem'

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
  /** CNPJ de quem compra (só dígitos): vai na nota fiscal. */
  cnpj?: string | null
}

const qtd = (n: number) => String(n).replace('.', ',')
export const cnpjLegivel = (c: string) => c.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
/** "Nota fiscal em nome de …": quem compra pode ser a Filial ou a Escola, cada uma com o seu CNPJ. */
const notaFiscal = (d: Pick<DadosDoConvite, 'comprador' | 'cnpj'>) => `${d.comprador}${d.cnpj ? ` — CNPJ ${cnpjLegivel(d.cnpj)}` : ''}`

// Cores e medidas do e-mail: tabelas e estilo em linha, que é o que os clientes de e-mail respeitam.
const VERMELHO = '#d71920'
const TINTA = '#1a202c'
const CINZA = '#5f6b7a'
const BORDA = '#e2e8f0'
const FUNDO = '#f7f8fa'

function botao(rotulo: string, link: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;"><tr><td style="border-radius:8px;background:${VERMELHO};">`
    + `<a href="${escapar(link)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapar(rotulo)}</a>`
    + '</td></tr></table>'
}

function linhaDeDado(rotulo: string, valor: string, destaque = false): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:${CINZA};font-size:13px;white-space:nowrap;vertical-align:top;">${escapar(rotulo)}</td>`
    + `<td style="padding:6px 0;font-size:14px;${destaque ? `font-weight:bold;color:${VERMELHO};` : ''}">${escapar(valor)}</td></tr>`
}

/**
 * O pedido de proposta. Um e-mail por fornecedor: ninguém vê quem mais foi
 * convidado. Sai em HTML (itens em tabela, prazo em destaque, botão para a
 * página da proposta) e em texto, para quem lê sem HTML.
 */
export function textoDoConvite(d: DadosDoConvite): { assunto: string; corpo: string; html: string } {
  const recado = d.recado?.trim() || ''
  const itensTexto = d.itens.map((i, n) => `${n + 1}. ${i.descricao} — ${qtd(i.quantidade)} ${i.unidade}${i.especificacao ? `\n   ${i.especificacao.replace(/\n+/g, ' ')}` : ''}`)
  const dados: [string, string, boolean?][] = [
    ['Prazo para a proposta', dataComDia(d.prazo), true],
    ...(d.necessarioAte ? [['Precisamos até', dataCurta(d.necessarioAte)] as [string, string]] : []),
    ...(d.localEntrega ? [['Entrega em', d.localEntrega] as [string, string]] : []),
    ['Nota fiscal em nome de', notaFiscal(d)],
  ]
  const corpo = [
    `Olá, ${d.fornecedor}.`,
    `Gostaríamos de receber a sua proposta para os itens abaixo (pedido ${d.codigo} — ${d.titulo}).`,
    ...(recado ? [recado] : []),
    itensTexto.join('\n'),
    dados.map(([r, v]) => `${r}: ${v}`).join('\n'),
    `Para responder, abra o link abaixo e preencha o preço de cada item, o frete, o prazo de entrega e a validade. Se quiser, anexe a sua proposta em PDF. Não precisa de senha nem de cadastro:\n${d.link}`,
    'Se não puder cotar desta vez, o mesmo link tem o botão "Não vou cotar". Dúvidas? É só responder este e-mail.',
    'Obrigado,',
  ].join('\n\n')

  const linhas = d.itens.map((i, n) => `<tr>`
    + `<td style="padding:10px 8px;border-top:1px solid ${BORDA};color:${CINZA};font-size:13px;vertical-align:top;">${n + 1}</td>`
    + `<td style="padding:10px 8px;border-top:1px solid ${BORDA};vertical-align:top;"><span style="font-weight:bold;">${escapar(i.descricao)}</span>`
    + `${i.especificacao ? `<br><span style="color:${CINZA};font-size:13px;">${escapar(i.especificacao).replace(/\n/g, '<br>')}</span>` : ''}</td>`
    + `<td style="padding:10px 8px;border-top:1px solid ${BORDA};text-align:right;white-space:nowrap;vertical-align:top;font-weight:bold;">${qtd(i.quantidade)}</td>`
    + `<td style="padding:10px 8px;border-top:1px solid ${BORDA};white-space:nowrap;vertical-align:top;color:${CINZA};">${escapar(i.unidade)}</td>`
    + '</tr>').join('')
  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border:1px solid ${BORDA};border-radius:10px;border-collapse:separate;overflow:hidden;">`,
    `<tr><td style="background:${VERMELHO};padding:16px 20px;color:#ffffff;">`
      + `<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Pedido de proposta · ${escapar(d.codigo)}</div>`
      + `<div style="font-size:20px;font-weight:bold;line-height:1.3;margin-top:2px;">${escapar(d.titulo)}</div>`
      + `<div style="font-size:13px;opacity:0.9;margin-top:4px;">${escapar(d.comprador)}</div></td></tr>`,
    `<tr><td style="padding:20px;color:${TINTA};">`,
    `<p style="margin:0 0 12px;">Olá, <strong>${escapar(d.fornecedor)}</strong>.</p>`,
    '<p style="margin:0 0 16px;">Gostaríamos de receber a sua proposta para os itens abaixo.</p>',
    recado ? `<div style="margin:0 0 16px;padding:10px 14px;border-left:3px solid ${VERMELHO};background:${FUNDO};">${escapar(recado).replace(/\n/g, '<br>')}</div>` : '',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">`
      + `<tr style="background:${FUNDO};"><th align="left" style="padding:8px;font-size:12px;color:${CINZA};font-weight:normal;">#</th>`
      + `<th align="left" style="padding:8px;font-size:12px;color:${CINZA};font-weight:normal;">Item</th>`
      + `<th align="right" style="padding:8px;font-size:12px;color:${CINZA};font-weight:normal;">Qtd.</th>`
      + `<th align="left" style="padding:8px;font-size:12px;color:${CINZA};font-weight:normal;">Unid.</th></tr>`
      + `${linhas}</table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${dados.map(([r, v, destaque]) => linhaDeDado(r, v, destaque)).join('')}</table>`,
    botao('Enviar minha proposta', d.link),
    `<p style="margin:0 0 16px;font-size:13px;color:${CINZA};">Na página, preencha o preço de cada item, o frete, o prazo de entrega e a validade. Se quiser, anexe a sua proposta em PDF. Não precisa de senha nem de cadastro.</p>`,
    `<p style="margin:0;font-size:13px;color:${CINZA};">Não vai cotar desta vez? <a href="${escapar(d.link)}" style="color:${VERMELHO};">Avise pelo mesmo link</a>. Dúvidas? É só responder este e-mail.</p>`,
    `<p style="margin:12px 0 0;font-size:12px;color:${CINZA};word-break:break-all;">Se o botão não abrir: ${escapar(d.link)}</p>`,
    '</td></tr></table>',
    '<p style="margin:16px 0 0;">Obrigado,</p>',
  ].filter(Boolean).join('\n')

  return { assunto: `Pedido de proposta ${d.codigo} — ${d.titulo}`.slice(0, 200), corpo, html }
}

/** O lembrete da véspera, para quem ainda não respondeu. */
export function textoDoLembrete(d: Pick<DadosDoConvite, 'comprador' | 'fornecedor' | 'codigo' | 'titulo' | 'prazo' | 'link'>): { assunto: string; corpo: string; html: string } {
  const html = [
    `<p style="margin:0 0 12px;">Olá, <strong>${escapar(d.fornecedor)}</strong>.</p>`,
    `<p style="margin:0 0 16px;">O prazo para a proposta de <strong>“${escapar(d.titulo)}”</strong> (${escapar(d.codigo)}) termina <strong style="color:${VERMELHO};">amanhã, ${escapar(dataComDia(d.prazo))}</strong>.</p>`,
    botao('Enviar minha proposta', d.link),
    `<p style="margin:0 0 12px;font-size:13px;color:${CINZA};">Não vai cotar desta vez? <a href="${escapar(d.link)}" style="color:${VERMELHO};">Avise pelo mesmo link</a>.</p>`,
    `<p style="margin:0 0 16px;font-size:12px;color:${CINZA};word-break:break-all;">Se o botão não abrir: ${escapar(d.link)}</p>`,
    '<p style="margin:0;">Obrigado,</p>',
  ].join('\n')
  return {
    assunto: `Lembrete: proposta ${d.codigo} até ${dataCurta(d.prazo)}`.slice(0, 200),
    corpo: [
      `Olá, ${d.fornecedor}.`,
      `Lembrando que o prazo para a proposta de “${d.titulo}” (${d.codigo}) termina amanhã, ${dataComDia(d.prazo)}.`,
      `Para responder, é só abrir o link:\n${d.link}`,
      'Se não puder cotar desta vez, o mesmo link tem o botão "Não vou cotar".',
      'Obrigado,',
    ].join('\n\n'),
    html,
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
